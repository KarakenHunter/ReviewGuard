#!/bin/bash
# Full-stack browser test: real MongoDB + real FastAPI + real Express + built frontend.
# Cloudflare is replaced by a FAKE stub, so this verifies wiring and UI, not model quality.
# Requires: python deps (ai-service/requirements.txt), `npm i` in server/ and web/, a running mongod
# (MONGODB_URI, default mongodb://127.0.0.1:27017/reviewguard_e2e) and Playwright
# (`npm i -D playwright && npx playwright install chromium`, or set PLAYWRIGHT_MODULE).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017/reviewguard_e2e}"
TOKEN="e2e-internal-token-0123456789"
PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT
wait_for() { for _ in $(seq 1 80); do curl -fs "$1" >/dev/null 2>&1 && return 0; sleep 0.25; done; echo "timeout waiting for $1"; return 1; }

# start from an empty database so counts are deterministic
(cd "$ROOT/server" && node -e "const m=require('mongoose');m.connect(process.env.MONGODB_URI).then(async()=>{await m.connection.dropDatabase();await m.disconnect()}).catch(e=>{console.error(e.message);process.exit(1)})") || exit 1
python3 "$ROOT/ai-service/tests/stub_cloudflare.py" 8788 & PIDS+=($!)
(cd "$ROOT/ai-service" && CLOUDFLARE_ACCOUNT_ID=acc CLOUDFLARE_API_TOKEN=tok CF_BASE_URL=http://127.0.0.1:8788/client/v4 \
  INTERNAL_API_TOKEN="$TOKEN" CF_MAX_RETRIES=0 python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --log-level warning) & PIDS+=($!)
(cd "$ROOT/server" && NODE_ENV=development PORT=8000 JWT_SECRET=e2e-secret-e2e-secret-e2e-secret-123456 INTERNAL_API_TOKEN="$TOKEN" \
  AI_SERVICE_URL=http://127.0.0.1:8001 ALLOW_REGISTRATION=true RATE_LIMIT_ANALYZE_MAX=500 node src/server.js) & PIDS+=($!)
[ -d "$ROOT/web/dist" ] || (cd "$ROOT/web" && npx vite build)
(cd "$ROOT/web" && npx vite preview --host 127.0.0.1 --port 4173) & PIDS+=($!)
wait_for http://127.0.0.1:8001/health && wait_for http://127.0.0.1:8000/api/health && wait_for http://127.0.0.1:4173/ || exit 1
(cd "$ROOT/web" && node e2e/e2e.mjs)
