# ReviewGuard backend (Express + MongoDB) — API reference

Base URL: `/api`. All responses are JSON `{ success, data | error }` except the CSV export.
Errors: `{ "success": false, "error": { "code", "message", "details?" } }`.
Everything except `/health` and `/auth/register|login` needs `Authorization: Bearer <JWT>`.

## Flow
React → Express (this service) → Python FastAPI (`POST /analyze`, `POST /analyze/batch`, header `X-Internal-Token`) → Cloudflare Workers AI.
Express never computes scores: it validates, calls Python, validates the reply (zod), stores it in MongoDB. Mongo is touched only here.

## Endpoints
| Method & path | Purpose | Notes |
|---|---|---|
| GET `/health` | liveness | `{status: ok|degraded, mongo, ai}`; 503 if MongoDB is down |
| POST `/auth/register` | create user | `{name,email,password(10-72)}`; 403 when `ALLOW_REGISTRATION=false` (default in production) |
| POST `/auth/login` | JWT (HS256, 8h) | `{email,password}` |
| GET `/auth/me` | current user | |
| POST `/reviews/analyze` | analyse + store one review | body `{reviewText(≤2000), productName?, productCategory?, rating? 1-5}` → 201 `{...review, analysis}` |
| POST `/reviews/bulk` | analyse many | multipart `file` (.csv, ≤512 KB) **or** JSON `{batchId?, reviews:[{reviewText, productName?, productCategory?, rating?, externalId?}]}`; max 30 rows (`MAX_BULK_REVIEWS`) |
| GET `/reviews` | history | filters `sentiment, riskLevel, emotion, recommendation, category, status, q, batchId, minRisk, maxRisk, flagged`; `page, limit(≤100), sortBy(analyzedAt|riskScore|emotionalIntensity|createdAt), order` |
| GET `/reviews/stats` | dashboard numbers | totals, sentiment/emotion/risk distributions, moderation status counts, 5 recent flagged |
| GET `/reviews/:id` | detail | review + analysis + `moderationLogs` |
| DELETE `/reviews/:id` | manual delete | removes review+analysis; an audit log (`newStatus: deleted`) is kept |
| GET `/moderation` | queue | default `status=open` (pending+flagged+escalated), sorted by risk desc; same filters/paging as `/reviews` |
| PATCH `/moderation/:id` | decide | `{action: approve|flag|escalate|dismiss, note?}`; writes a ModerationLog |
| GET `/analytics/insights?days=30` | insights | emotion by category, extreme-language frequency + top terms, negative-review patterns, daily trend |
| GET `/reports/summary` | report data | stats + `generatedAt` |
| GET `/reports/export` | CSV | same filters; max 5000 rows (`X-Export-Truncated` header); formula-injection-safe |

### Bulk behaviour
* CSV columns: `review_id,product_name,category,rating,review_text` (only `review_text` required).
* Invalid rows are reported per row (`error.code = invalid_row`) and do not fail the batch; if no row is valid → 400 `no_valid_rows`.
* Rows are sent to Python in chunks of `AI_BATCH_SIZE` (10). After a quota error or AI outage **no further chunks are sent**; skipped rows come back with that error code.
* If nothing could be analysed because the AI failed, the AI error itself is returned (429/503/…); otherwise 200 with `{batchId,total,analyzed,failed,quotaExhausted,results[]}`.
* The request is synchronous. For a progress bar, the frontend should send ≤10-row JSON chunks with the same `batchId`.

### Definitions
* **flagged** = Python recommended something other than `no_action`. It is a request for human review, not a fraud verdict.
* New reviews start as `pending` when flagged, otherwise `not_required`. Nothing is ever auto-deleted.

## Error codes
`validation_error`/`invalid_input` 400 · `invalid_csv` 400 · `no_valid_rows` 400 · `unauthorized` 401 · `invalid_credentials` 401 · `registration_disabled` 403 · `not_found` 404 · `conflict` 409 · `file_too_large`/`payload_too_large` 413 · `too_many_rows` 422 · `rate_limited` 429 · `quota_exhausted` 429 · `ai_invalid_model_response`/`invalid_ai_response`/`ai_misconfigured`/`ai_rejected_request`/`ai_bad_response` 502 · `ai_unavailable`/`ai_upstream_error`/`ai_model_unavailable`/`ai_not_configured`/`database_unavailable` 503 · `ai_timeout` 504 · `internal_error` 500.
Upstream detail is never forwarded to clients; it is logged server-side.

## Collections
* **users**: name, email (unique), passwordHash (bcrypt, `select:false`), createdAt
* **reviews**: reviewText, productName, productCategory, rating, source, externalId, batchId, moderationStatus, timestamps
* **analysisresults**: reviewId (unique ref), sentiment, emotion (+scores), emotionalIntensity, exaggerationScore, riskScore, riskLevel, recommendation(+rationale), explanation[], linguistic{}, scoring{}, modelInformation{}, cached, analyzedAt
* **moderationlogs**: reviewId, previousStatus, newStatus, moderatorNote, moderator, createdAt (kept after review deletion)

## Security controls
helmet; CORS allow-list (production refuses `*`/empty); rate limits (global 300/15 min, analyze 20/min, auth 10/15 min); zod validation on every input; `$`/dotted-key rejection (NoSQL operator injection); JWT with pinned algorithm; bcrypt cost 12; upload type/size limits; CSV formula-injection neutralisation on export; production start-up refuses to boot without MONGODB_URI, JWT_SECRET (≥32), INTERNAL_API_TOKEN (≥16), AI_SERVICE_URL, CORS_ORIGINS.

## Known limitations
* Not verified against **MongoDB Atlas** or **Cloudflare Workers AI** (no network access to them from the build sandbox). Local MongoDB 8.3.7 was used.
* Moderation status change + log write are two operations, not a transaction.
* Bulk is synchronous; very slow AI responses are bounded by `AI_TIMEOUT_MS` per Python call.
* Emotion-model live compatibility is unverified (see ai-service).
* Prompt-injection defence for the emotion LLM is partial (delimiting, tag stripping, schema-validated output).

## Running tests
```
# AI service (mocked + one skipped live test)
cd ai-service && python -m pytest -q
# Express (needs MongoDB at TEST_MONGODB_URI, default mongodb://127.0.0.1:27018/reviewguard_test)
cd server && npm test
# Express <-> real FastAPI (spawns the Python service + a FAKE Cloudflare stub)
cd server && npm run test:integration
```
