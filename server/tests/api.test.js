// API tests: real MongoDB, FAKE AI client (see helpers.js). These do not exercise the Python service.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const Review = require('../src/models/Review');
const AnalysisResult = require('../src/models/AnalysisResult');
const ModerationLog = require('../src/models/ModerationLog');
const User = require('../src/models/User');
const { TEST_URI, testConfig, fakeAi } = require('./helpers');

let app; let ai; let token; let cfg;
const auth = () => ({ Authorization: `Bearer ${token}` });
const counts = async () => ({ r: await Review.countDocuments(), a: await AnalysisResult.countDocuments() });
const analyze = (body, h = auth()) => request(app).post('/api/reviews/analyze').set(h).send(body);
mongoose.set('bufferTimeoutMS', 1500);
const connect = () => mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 4000 });

describe('api', () => {
before(async () => {
  await connect();
  await mongoose.connection.dropDatabase();
  await Promise.all([Review, AnalysisResult, ModerationLog, User].map((m) => m.syncIndexes()));
  cfg = testConfig({ aiBatchSize: 2, maxBulkReviews: 6, csvMaxBytes: 4096, corsOrigins: ['http://app.test'] });
  ai = fakeAi();
  app = createApp({ config: cfg, ai });
});
after(async () => { await mongoose.disconnect(); });

describe('auth & security', () => {
  it('health is public and reports mongo/ai', async () => {
    const r = await request(app).get('/api/health').expect(200);
    assert.deepEqual([r.body.mongo, r.body.ai], ['connected', 'up']);
  });
  it('rejects unauthenticated and bad-token requests', async () => {
    await request(app).get('/api/reviews').expect(401);
    await request(app).get('/api/reviews').set('Authorization', 'Bearer nope').expect(401);
  });
  it('registers, hashes the password, logs in, rejects wrong password', async () => {
    const reg = await request(app).post('/api/auth/register').send({ name: 'Mod', email: 'Mod@Example.com', password: 'correct-horse-battery' }).expect(201);
    token = reg.body.data.token;
    const u = await User.findOne({ email: 'mod@example.com' }).select('+passwordHash').lean();
    assert.ok(u.passwordHash.startsWith('$2') && !u.passwordHash.includes('correct'));
    assert.ok(!JSON.stringify(reg.body).includes('passwordHash'));
    await request(app).post('/api/auth/login').send({ email: 'mod@example.com', password: 'correct-horse-battery' }).expect(200);
    await request(app).post('/api/auth/login').send({ email: 'mod@example.com', password: 'wrong-password-1' }).expect(401);
    await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong-password-1' }).expect(401);
    await request(app).post('/api/auth/register').send({ name: 'x', email: 'mod@example.com', password: 'correct-horse-battery' }).expect(409);
    await request(app).get('/api/auth/me').set(auth()).expect(200);
  });
  it('registration can be disabled', async () => {
    const a = createApp({ config: testConfig({ allowRegistration: false }), ai });
    await request(a).post('/api/auth/register').send({ name: 'x', email: 'z@example.com', password: 'correct-horse-battery' }).expect(403);
  });
  it('rate limiting returns 429', async () => {
    const a = createApp({ config: testConfig({ rate: { global: { windowMs: 60000, max: 3 }, analyze: { windowMs: 60000, max: 100 }, auth: { windowMs: 60000, max: 100 } } }), ai });
    for (let i = 0; i < 3; i++) await request(a).get('/api/health').expect(200);
    const r = await request(a).get('/api/health').expect(429);
    assert.equal(r.body.error.code, 'rate_limited');
  });
  it('CORS allows only configured origins', async () => {
    const ok = await request(app).get('/api/health').set('Origin', 'http://app.test');
    assert.equal(ok.headers['access-control-allow-origin'], 'http://app.test');
    const bad = await request(app).get('/api/health').set('Origin', 'http://evil.test');
    assert.equal(bad.headers['access-control-allow-origin'], undefined);
  });
  it('rejects NoSQL operator injection', async () => {
    await analyze({ reviewText: { $gt: '' } }).expect(400);
    await request(app).get('/api/reviews?riskLevel[$ne]=low').set(auth()).expect(400);
    await request(app).get('/api/reviews?q[$regex]=.*').set(auth()).expect(400);
  });
});

describe('single analysis', () => {
  it('analyses, persists review + analysis, returns both', async () => {
    const r = await analyze({ reviewText: 'Great blender', productName: 'Blender X', productCategory: 'kitchen', rating: 5 }).expect(201);
    const d = r.body.data;
    assert.equal(d.productName, 'Blender X'); assert.equal(d.analysis.riskLevel, 'low'); assert.equal(d.moderationStatus, 'not_required');
    const rev = await Review.findById(d.id).lean(); const an = await AnalysisResult.findOne({ reviewId: d.id }).lean();
    assert.equal(rev.reviewText, 'Great blender'); assert.equal(an.sentiment.label, 'positive');
    assert.equal(an.modelInformation.sentimentModel, 'fake');
  });
  it('flagged review enters the moderation queue as pending', async () => {
    const r = await analyze({ reviewText: 'TERRIBLE product', productCategory: 'electronics' }).expect(201);
    assert.equal(r.body.data.moderationStatus, 'pending'); assert.equal(r.body.data.analysis.recommendation, 'human_review_support_escalation');
  });
  it('validates input', async () => {
    const before = await counts();
    await analyze({ reviewText: '   ' }).expect(400);
    await analyze({}).expect(400);
    await analyze({ reviewText: 'a'.repeat(2001) }).expect(400);
    await analyze({ reviewText: 'ok', rating: 6 }).expect(400);
    await analyze({ reviewText: 'ok', rating: 'abc' }).expect(400);
    assert.deepEqual(await counts(), before);
  });
  it('maps AI failures to safe errors and persists nothing', async () => {
    const before = await counts();
    const cases = [['FAIL_QUOTA', 429, 'quota_exhausted'], ['FAIL_DOWN', 503, 'ai_unavailable'], ['FAIL_TIMEOUT', 504, 'ai_timeout'], ['FAIL_INVALID', 502, 'invalid_ai_response']];
    for (const [t, status, code] of cases) {
      const r = await analyze({ reviewText: `x ${t}` }).expect(status);
      assert.equal(r.body.error.code, code); assert.equal(r.body.success, false);
    }
    assert.deepEqual(await counts(), before);
  });
});

describe('bulk analysis', () => {
  const csv = (rows) => 'review_id,product_name,category,rating,review_text\n' + rows.join('\n') + '\n';
  const upload = (buf, name = 'r.csv') => request(app).post('/api/reviews/bulk').set(auth()).attach('file', Buffer.from(buf), name);

  it('analyses a CSV, stores rows, reports invalid rows without failing the batch', async () => {
    const b = await upload(csv(['r1,Lamp,home,5,Nice lamp', 'r2,Phone,electronics,1,TERRIBLE phone', 'r3,Mug,home,9,bad rating row', 'r4,Pen,office,,"Quoted, comma review"'])).expect(200);
    const d = b.body.data;
    assert.deepEqual([d.total, d.analyzed, d.failed], [4, 3, 1]);
    assert.equal(d.results.find((x) => x.row === 3).error.code, 'invalid_row');
    assert.equal((await Review.find({ batchId: d.batchId })).length, 3);
    assert.ok(d.results.find((x) => x.row === 4).review.reviewText.includes('Quoted, comma'));
    assert.deepEqual(ai.calls.batches.slice(-2), [2, 1]); // chunked by aiBatchSize=2
  });
  it('accepts JSON bulk and keeps a client batchId', async () => {
    const r = await request(app).post('/api/reviews/bulk').set(auth()).send({ batchId: 'chunk-1', reviews: [{ reviewText: 'meh ok', productCategory: 'home' }] }).expect(200);
    assert.equal(r.body.data.batchId, 'chunk-1'); assert.equal(r.body.data.analyzed, 1);
  });
  it('rejects invalid CSV: missing column, binary, empty, too many rows, oversize, wrong type', async () => {
    await upload('a,b\n1,2\n').expect(400);
    await upload(Buffer.from([0x50, 0x4b, 0x03, 0x00, 0x00, 0x01])).expect(400);
    await upload('').expect(400);
    await upload(csv(Array.from({ length: 7 }, (_, i) => `r${i},P,c,3,ok ${i}`))).expect(422);
    await upload(csv(['r1,P,c,3,' + 'x'.repeat(5000)])).expect(413);
    await upload('a', 'evil.exe').expect(400);
    await request(app).post('/api/reviews/bulk').set(auth()).send({}).expect(400);
  });
  it('rejects when no row is valid', async () => {
    const r = await upload(csv(['r1,P,c,9,ok', 'r2,P,c,3,'])).expect(400);
    assert.equal(r.body.error.code, 'no_valid_rows'); assert.equal(r.body.error.details.length, 2);
  });
  it('stops sending chunks after quota exhaustion', async () => {
    const batches = ai.calls.batches.length; const before = await counts();
    const rows = Array.from({ length: 6 }, (_, i) => `q${i},P,c,3,${i < 2 ? 'FAIL_QUOTA ' : ''}text ${i}`);
    const err = await upload(csv(rows)).expect(429); // nothing analysed -> surfaced as an error
    assert.equal(err.body.error.code, 'quota_exhausted');
    assert.equal(ai.calls.batches.length - batches, 1, 'only the first chunk may reach the AI service');
    assert.deepEqual(await counts(), before);
  });
  it('partial quota: analysed rows are kept, later chunks skipped', async () => {
    const batches = ai.calls.batches.length;
    const rows = ['p0,P,c,3,fine one', 'p1,P,c,3,fine two', 'p2,P,c,3,FAIL_QUOTA three', 'p3,P,c,3,four', 'p4,P,c,3,five'];
    const r = await upload(csv(rows)).expect(200);
    assert.equal(r.body.data.quotaExhausted, true); assert.equal(r.body.data.analyzed, 3);
    assert.equal(ai.calls.batches.length - batches, 2, 'chunk 3 must be skipped');
    assert.equal(r.body.data.results.find((x) => x.row === 5).error.code, 'quota_exhausted');
  });
  it('AI outage on first chunk -> 503, nothing stored', async () => {
    const before = await counts();
    const r = await upload(csv(['o1,P,c,3,BATCH_DOWN one', 'o2,P,c,3,two'])).expect(503);
    assert.equal(r.body.error.code, 'ai_unavailable'); assert.deepEqual(await counts(), before);
  });
});

describe('history, analytics, moderation, export', () => {
  let flaggedId;
  before(async () => {
    await analyze({ reviewText: 'BUYNOW best ever', productCategory: 'kitchen' });
    await analyze({ reviewText: 'my complaint about delay', productCategory: 'electronics' });
    const q = await request(app).get('/api/moderation').set(auth()).expect(200);
    flaggedId = q.body.data.find((x) => x.reviewText.startsWith('BUYNOW')).id;
  });
  it('lists with pagination, filters and sorting', async () => {
    const all = await request(app).get('/api/reviews?limit=3&sortBy=riskScore&order=desc').set(auth()).expect(200);
    assert.equal(all.body.data.length, 3); assert.ok(all.body.pagination.total > 3);
    const s = all.body.data.map((x) => x.analysis.riskScore); assert.deepEqual(s, [...s].sort((a, b) => b - a));
    const neg = await request(app).get('/api/reviews?sentiment=negative&riskLevel=high&limit=100').set(auth()).expect(200);
    assert.ok(neg.body.data.length > 0 && neg.body.data.every((x) => x.analysis.sentiment.label === 'negative' && x.analysis.riskLevel === 'high'));
    const q = await request(app).get('/api/reviews?q=delay').set(auth()).expect(200);
    assert.equal(q.body.data.length, 1);
    await request(app).get('/api/reviews?limit=1000').set(auth()).expect(400);
  });
  it('stats are computed from MongoDB and consistent', async () => {
    const st = (await request(app).get('/api/reviews/stats').set(auth()).expect(200)).body.data;
    const total = await AnalysisResult.countDocuments();
    assert.equal(st.totals.total, total);
    assert.equal(st.totals.positive + st.totals.negative + st.totals.neutral, total);
    assert.equal(st.totals.flagged, await AnalysisResult.countDocuments({ recommendation: { $ne: 'no_action' } }));
    assert.equal(st.totals.highRisk, await AnalysisResult.countDocuments({ riskLevel: 'high' }));
    assert.equal(st.emotionDistribution.reduce((n, x) => n + x.count, 0), total);
    assert.ok(st.recentFlagged.length > 0 && st.recentFlagged.length <= 5);
  });
  it('insights return emotion-by-category, extreme language, trends', async () => {
    const d = (await request(app).get('/api/analytics/insights?days=7').set(auth()).expect(200)).body.data;
    assert.ok(d.emotionByCategory.some((c) => c.category === 'electronics'));
    assert.ok(d.extremeLanguage.extremeCount > 0 && d.extremeLanguage.topTerms.length > 0);
    assert.equal(d.trends.reduce((n, t) => n + t.count, 0), await AnalysisResult.countDocuments());
    assert.ok(d.negativePatterns.lowRiskCount >= 1);
    await request(app).get('/api/reports/summary').set(auth()).expect(200);
  });
  it('moderation action updates status and writes a log', async () => {
    const r = await request(app).patch(`/api/moderation/${flaggedId}`).set(auth()).send({ action: 'escalate', note: 'looks coordinated' }).expect(200);
    assert.equal(r.body.data.moderationStatus, 'escalated');
    await request(app).patch(`/api/moderation/${flaggedId}`).set(auth()).send({ action: 'approve' }).expect(200);
    const logs = await ModerationLog.find({ reviewId: flaggedId }).sort({ createdAt: 1 }).lean();
    assert.deepEqual(logs.map((l) => [l.previousStatus, l.newStatus]), [['pending', 'escalated'], ['escalated', 'approved']]);
    assert.equal(logs[0].moderatorNote, 'looks coordinated');
    const detail = await request(app).get(`/api/reviews/${flaggedId}`).set(auth()).expect(200);
    assert.equal(detail.body.data.moderationLogs.length, 2);
    const open = await request(app).get('/api/moderation').set(auth()).expect(200);
    assert.ok(!open.body.data.some((x) => x.id === flaggedId), 'approved review leaves the open queue');
  });
  it('moderation validates action and id; 404 for unknown', async () => {
    await request(app).patch(`/api/moderation/${flaggedId}`).set(auth()).send({ action: 'delete' }).expect(400);
    await request(app).patch('/api/moderation/not-an-id').set(auth()).send({ action: 'flag' }).expect(400);
    await request(app).patch(`/api/moderation/${new mongoose.Types.ObjectId()}`).set(auth()).send({ action: 'flag' }).expect(404);
    await request(app).get('/api/reviews/zzz').set(auth()).expect(400);
    await request(app).get(`/api/reviews/${new mongoose.Types.ObjectId()}`).set(auth()).expect(404);
  });
  it('exports CSV with formula-injection protection', async () => {
    await analyze({ reviewText: '=HYPERLINK("http://evil.test","x"), nice', productName: '@cmd' }).expect(201);
    const r = await request(app).get('/api/reports/export?limit=5').set(auth()).expect(200);
    assert.match(r.headers['content-type'], /text\/csv/); assert.match(r.headers['content-disposition'], /attachment/);
    const lines = r.text.replace(/^\uFEFF/, '').split('\r\n');
    assert.ok(lines[0].startsWith('review_id,external_id,product_name'));
    assert.ok(r.text.includes(`"'=HYPERLINK(""http://evil.test"",""x""), nice"`) && r.text.includes(",'@cmd,"));
    const f = await request(app).get('/api/reports/export?riskLevel=high').set(auth()).expect(200);
    assert.ok(f.text.split('\r\n').filter(Boolean).slice(1).every((l) => l.includes(',high,')));
  });
  it('delete removes review+analysis and keeps an audit log', async () => {
    const id = (await analyze({ reviewText: 'to delete' }).expect(201)).body.data.id;
    await request(app).delete(`/api/reviews/${id}`).set(auth()).expect(200);
    assert.equal(await Review.countDocuments({ _id: id }), 0); assert.equal(await AnalysisResult.countDocuments({ reviewId: id }), 0);
    assert.equal((await ModerationLog.findOne({ reviewId: id }).lean()).newStatus, 'deleted');
    await request(app).delete(`/api/reviews/${id}`).set(auth()).expect(404);
  });
});

describe('MongoDB persistence & failure', () => {
  it('data survives a disconnect/reconnect', async () => {
    const id = (await analyze({ reviewText: 'persist me', productCategory: 'persist' }).expect(201)).body.data.id;
    const before = await counts();
    await mongoose.disconnect(); await connect();
    assert.deepEqual(await counts(), before);
    const r = await request(app).get(`/api/reviews/${id}`).set(auth()).expect(200);
    assert.equal(r.body.data.reviewText, 'persist me'); assert.equal(r.body.data.analysis.sentiment.label, 'positive');
  });
  it('returns 503 database_unavailable and unhealthy when MongoDB is down', async () => {
    await mongoose.disconnect();
    const h = await request(app).get('/api/health').expect(503); assert.equal(h.body.mongo, 'disconnected');
    const r = await request(app).get('/api/reviews').set(auth()).expect(503);
    assert.equal(r.body.error.code, 'database_unavailable');
    const a = await analyze({ reviewText: 'while db is down' }).expect(503);
    assert.equal(a.body.error.code, 'database_unavailable'); assert.ok(!JSON.stringify(a.body).includes('mongodb'));
  });
});

});
