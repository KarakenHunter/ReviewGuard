const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { loadConfig } = require('../src/config/env');
const { parseReviewCsv, toCsv } = require('../src/utils/csv');
const { hasBadKey } = require('../src/middleware/security');
const { createAiClient, parseAnalysis } = require('../src/services/aiClient');
const { analysis } = require('./helpers');

describe('config', () => {
  const ok = { NODE_ENV: 'production', MONGODB_URI: 'mongodb://x', JWT_SECRET: 'j'.repeat(40), INTERNAL_API_TOKEN: 't'.repeat(20), AI_SERVICE_URL: 'http://127.0.0.1:8001', CORS_ORIGINS: 'https://a.pages.dev' };
  it('production requires secrets, token and explicit CORS', () => {
    assert.ok(loadConfig(ok).isProd);
    for (const k of ['MONGODB_URI', 'JWT_SECRET', 'INTERNAL_API_TOKEN', 'AI_SERVICE_URL', 'CORS_ORIGINS']) assert.throws(() => loadConfig({ ...ok, [k]: '' }), /Invalid production configuration/, k);
    assert.throws(() => loadConfig({ ...ok, INTERNAL_API_TOKEN: 'short' }));
    assert.throws(() => loadConfig({ ...ok, CORS_ORIGINS: '*' }), /"\*"/);
    assert.equal(loadConfig(ok).allowRegistration, false);
  });
});
describe('csv', () => {
  const o = { maxRows: 5, maxChars: 100 };
  it('parses BOM + quoted fields', () => {
    const r = parseReviewCsv(Buffer.from('\uFEFFreview_id,product_name,category,rating,review_text\n1,P,c,4,"a, b"\n'), o);
    assert.equal(r.rows[0].reviewText, 'a, b'); assert.equal(r.rows[0].rating, 4);
  });
  it('rejects bad files', () => {
    for (const b of ['', 'x,y\n1,2\n', 'review_text\n', 'review_text,rating\n"unterminated,3\n']) assert.throws(() => parseReviewCsv(Buffer.from(b), o));
    assert.throws(() => parseReviewCsv(Buffer.from([1, 0, 2]), o));
  });
  it('csv export neutralises formulas', () => {
    const out = toCsv([{ header: 'a', value: (r) => r }], ['=1+1', '+x', '-x', '@x', 'plain', 'a,"b"', -5]);
    assert.deepEqual(out.trim().split('\r\n').slice(1), ["'=1+1", "'+x", "'-x", "'@x", 'plain', '"a,""b"""', '-5']);
  });
});
describe('guards & schemas', () => {
  it('detects operator keys', () => { assert.ok(hasBadKey({ a: { $gt: 1 } })); assert.ok(hasBadKey([{ 'a.b': 1 }])); assert.ok(!hasBadKey({ a: [1, { b: 2 }] })); });
  it('validates AI responses', () => {
    assert.ok(parseAnalysis(analysis()));
    assert.throws(() => parseAnalysis({ ...analysis(), risk_score: 150 }), (e) => e.code === 'invalid_ai_response');
    assert.throws(() => parseAnalysis({ ...analysis(), emotion: { label: 'happy', confidence: 1 } }), (e) => e.code === 'invalid_ai_response');
    assert.throws(() => parseAnalysis({}), (e) => e.status === 502);
  });
});
describe('aiClient against a local HTTP stub (contract + error mapping)', () => {
  let srv; let url; let mode = 'ok'; let last;
  before(async () => {
    srv = http.createServer((req, res) => {
      let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
        last = { method: req.method, url: req.url, token: req.headers['x-internal-token'], body: b ? JSON.parse(b) : null };
        const send = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
        if (mode === 'hang') return;
        if (mode === 'quota') return send(429, { success: false, error: { code: 'quota_exhausted', message: 'x' } });
        if (mode === 'auth') return send(401, { detail: 'invalid internal token' });
        if (mode === '422') return send(422, { detail: [] });
        if (mode === 'upstream') return send(503, { success: false, error: { code: 'upstream_error', message: 'secret internal detail' } });
        if (mode === 'html') { res.writeHead(200); return res.end('<html>'); }
        if (req.url === '/analyze/batch') return send(200, { success: true, results: JSON.parse(b).reviews.map((r, i) => ({ index: i, id: r.id, ...analysis() })) });
        return send(200, analysis());
      });
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r)); url = `http://127.0.0.1:${srv.address().port}`;
  });
  after(() => srv.close());
  const client = (over = {}) => createAiClient({ aiServiceUrl: url, internalToken: 'tok-123', aiTimeoutMs: 300, aiMaxConcurrency: 2, ...over });
  it('uses the real FastAPI paths, body shapes and token header', async () => {
    mode = 'ok'; await client().analyze('hello');
    assert.deepEqual([last.method, last.url, last.token, last.body], ['POST', '/analyze', 'tok-123', { review_text: 'hello' }]);
    const r = await client().analyzeBatch([{ id: '1', reviewText: 'a' }, { id: '2', reviewText: 'b' }]);
    assert.equal(last.url, '/analyze/batch'); assert.deepEqual(last.body, { reviews: [{ id: '1', review_text: 'a' }, { id: '2', review_text: 'b' }] });
    assert.ok(r.every((x) => x.ok));
  });
  it('maps failures', async () => {
    const cases = [['quota', 429, 'quota_exhausted'], ['auth', 502, 'ai_misconfigured'], ['422', 502, 'ai_rejected_request'], ['upstream', 503, 'ai_upstream_error'], ['html', 502, 'ai_bad_response'], ['hang', 504, 'ai_timeout']];
    for (const [m, status, code] of cases) {
      mode = m;
      await assert.rejects(client().analyze('x'), (e) => e.status === status && e.code === code && !/secret/.test(e.message), m);
    }
    await assert.rejects(createAiClient({ aiServiceUrl: 'http://127.0.0.1:1', internalToken: 't', aiTimeoutMs: 300, aiMaxConcurrency: 1 }).analyze('x'), (e) => e.code === 'ai_unavailable');
  });
  it('health never throws', async () => { mode = 'quota'; assert.equal(await client().health(), false); mode = 'ok'; assert.equal(await client().health(), true); });
});
