// INTEGRATION: real Express app + real FastAPI service (uvicorn) over HTTP + real MongoDB.
// Only Cloudflare is replaced by ai-service/tests/stub_cloudflare.py (FAKE model outputs).
// => verifies the Express<->Python contract and error propagation, NOT real model inference.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../src/app');
const { createAiClient } = require('../src/services/aiClient');
const Review = require('../src/models/Review');
const AnalysisResult = require('../src/models/AnalysisResult');
const { TEST_URI, testConfig } = require('./helpers');

const AI = path.resolve(__dirname, '../../ai-service');
const TOKEN = 'integration-token-0123456789';
const PY = 'http://127.0.0.1:8011'; const CF = 'http://127.0.0.1:8788';
const procs = []; let app; let token;
mongoose.set('bufferTimeoutMS', 1500);
const auth = () => ({ Authorization: `Bearer ${token}` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = async (url) => { for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) return; } catch { /* retry */ } await sleep(250); } throw new Error('not up: ' + url); };
const cfCount = async () => (await (await fetch(CF + '/__count')).json()).n;
const analyze = (reviewText, extra = {}) => request(app).post('/api/reviews/analyze').set(auth()).send({ reviewText, ...extra });
const counts = async () => [await Review.countDocuments(), await AnalysisResult.countDocuments()];
const mkApp = (over = {}) => { const cfg = testConfig({ aiServiceUrl: PY, internalToken: TOKEN, aiTimeoutMs: 15000, aiBatchSize: 10, ...over }); return createApp({ config: cfg, ai: createAiClient(cfg) }); };

describe('express <-> fastapi integration', () => {
  before(async () => {
    procs.push(spawn('python3', [path.join(AI, 'tests/stub_cloudflare.py'), '8788'], { stdio: 'ignore' }));
    procs.push(spawn('python3', ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8011', '--log-level', 'warning'], {
      cwd: AI, stdio: 'ignore',
      env: { ...process.env, APP_ENV: 'production', INTERNAL_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: 'acc', CLOUDFLARE_API_TOKEN: 'tok',
        CF_BASE_URL: CF + '/client/v4', MAX_CONCURRENCY: '2', CF_MAX_RETRIES: '1' },
    }));
    await up(PY + '/health');
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 4000 });
    await mongoose.connection.dropDatabase();
    await Promise.all([Review, AnalysisResult, require('../src/models/User')].map((m) => m.syncIndexes()));
    app = mkApp();
    token = (await request(app).post('/api/auth/register').send({ name: 'I', email: 'i@example.com', password: 'correct-horse-battery' })).body.data.token;
  });
  after(async () => { procs.forEach((p) => p.kill('SIGKILL')); await mongoose.disconnect(); });

  it('Express health sees FastAPI; FastAPI rejects calls without the internal token', async () => {
    const h = await request(app).get('/api/health').expect(200); assert.equal(h.body.ai, 'up');
    assert.equal((await fetch(PY + '/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"review_text":"x"}' })).status, 401);
    assert.equal((await fetch(PY + '/cache/clear', { method: 'POST' })).status, 403);
  });

  it('stored analysis equals what the Python service returns (no logic duplicated in Node)', async () => {
    const text = 'WORST PRODUCT EVER!!! TOTAL SCAM, ABSOLUTELY TERRIBLE!!!';
    const r = await analyze(text, { productName: 'Phone', productCategory: 'electronics' }).expect(201);
    const direct = await (await fetch(PY + '/analyze', { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-token': TOKEN }, body: JSON.stringify({ review_text: text }) })).json();
    const a = r.body.data.analysis; const db = await AnalysisResult.findOne({ reviewId: r.body.data.id }).lean();
    assert.equal(a.riskScore, direct.risk_score); assert.equal(db.riskScore, direct.risk_score);
    assert.equal(db.riskLevel, direct.risk_level); assert.equal(db.sentiment.label, direct.sentiment.label);
    assert.equal(db.emotion.label, direct.emotion.label); assert.equal(db.recommendation, direct.recommendation);
    assert.equal(db.exaggerationScore, direct.linguistic_analysis.exaggeration_score);
    assert.deepEqual(db.explanation, direct.explanation);
    assert.equal(a.riskLevel, 'high'); assert.equal(r.body.data.moderationStatus, 'pending');
    assert.equal(direct.cached, true, 'second identical call is served from the AI-service cache');
  });

  it('calm complaint stays low risk end to end', async () => {
    const r = await analyze('The zipper broke after two days. I am disappointed and would like a refund.').expect(201);
    assert.equal(r.body.data.analysis.sentiment.label, 'negative'); assert.equal(r.body.data.analysis.riskLevel, 'low');
  });

  it('bulk CSV goes through the real /analyze/batch endpoint', async () => {
    const csv = 'review_id,product_name,category,rating,review_text\n' + ['I love it, great blender', 'It arrived on Tuesday.', 'TERRIBLE!!! WORST SCAM EVER!!!', 'Disappointed, it broke, want a refund'].map((t, i) => `b${i},P${i},home,3,"${t}"`).join('\n') + '\n';
    const r = await request(app).post('/api/reviews/bulk').set(auth()).attach('file', Buffer.from(csv), 'x.csv').expect(200);
    const d = r.body.data; assert.deepEqual([d.analyzed, d.failed], [4, 0]);
    assert.equal(await Review.countDocuments({ batchId: d.batchId }), 4);
    const labels = d.results.map((x) => x.review.analysis.sentiment.label);
    assert.deepEqual(labels, ['positive', 'neutral', 'negative', 'negative']);
  });

  it('quota exhaustion: 429, nothing stored, queued items do not keep calling the model', async () => {
    const before = await counts();
    const r = await analyze('quota test TRIGGER_QUOTA').expect(429); assert.equal(r.body.error.code, 'quota_exhausted');
    const n0 = await cfCount();
    const rows = Array.from({ length: 10 }, (_, i) => `q${i},P,c,3,review ${i} TRIGGER_QUOTA`).join('\n');
    const b = await request(app).post('/api/reviews/bulk').set(auth()).attach('file', Buffer.from('review_id,product_name,category,rating,review_text\n' + rows + '\n'), 'q.csv').expect(429);
    assert.equal(b.body.error.code, 'quota_exhausted');
    const used = (await cfCount()) - n0;
    assert.ok(used <= 4, `expected <= 4 Cloudflare calls (2 in flight x 2 models), saw ${used}`);
    assert.deepEqual(await counts(), before);
  });

  it('Cloudflare 5xx -> 503, malformed model JSON -> 502 (propagated safely)', async () => {
    const before = await counts();
    const a = await analyze('cf broken TRIGGER_5XX').expect(503); assert.equal(a.body.error.code, 'ai_upstream_error');
    const b = await analyze('bad json TRIGGER_BADJSON').expect(502); assert.equal(b.body.error.code, 'ai_invalid_model_response');
    assert.ok(!/boom|definitely/.test(JSON.stringify([a.body, b.body])));
    assert.deepEqual(await counts(), before);
  });

  it('wrong internal token -> 502 ai_misconfigured', async () => {
    const bad = mkApp({ internalToken: 'a-different-token-0123456789' });
    const t = (await request(bad).post('/api/auth/login').send({ email: 'i@example.com', password: 'correct-horse-battery' })).body.data.token;
    const r = await request(bad).post('/api/reviews/analyze').set('Authorization', `Bearer ${t}`).send({ reviewText: 'hello' }).expect(502);
    assert.equal(r.body.error.code, 'ai_misconfigured');
  });

  it('AI service down -> 503 ai_unavailable, health degraded', async () => {
    procs[1].kill('SIGKILL'); await sleep(500);
    const before = await counts();
    const r = await analyze('nobody home').expect(503); assert.equal(r.body.error.code, 'ai_unavailable');
    assert.equal((await request(app).get('/api/health').expect(200)).body.status, 'degraded');
    assert.deepEqual(await counts(), before);
  });
});
