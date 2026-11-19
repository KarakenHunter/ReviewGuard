const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const DEV_SECRET = 'dev-only-insecure-secret-change-me-0123456789';

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';
  const cfg = {
    nodeEnv, isProd,
    port: int(env.PORT, 8000),
    mongoUri: env.MONGODB_URI || (isProd ? '' : 'mongodb://127.0.0.1:27017/reviewguard'),
    jwtSecret: env.JWT_SECRET || (isProd ? '' : DEV_SECRET),
    jwtExpiresIn: env.JWT_EXPIRES_IN || '8h',
    allowRegistration: bool(env.ALLOW_REGISTRATION, !isProd),
    aiServiceUrl: (env.AI_SERVICE_URL || (isProd ? '' : 'http://127.0.0.1:8001')).replace(/\/+$/, ''),
    internalToken: env.INTERNAL_API_TOKEN || '',
    aiTimeoutMs: int(env.AI_TIMEOUT_MS, 60000),
    aiMaxConcurrency: int(env.AI_MAX_CONCURRENCY, 4),
    aiBatchSize: Math.min(Math.max(int(env.AI_BATCH_SIZE, 10), 1), 30),
    maxBulkReviews: int(env.MAX_BULK_REVIEWS, 30),
    maxReviewChars: int(env.MAX_REVIEW_CHARS, 2000), // keep <= ai-service MAX_REVIEW_CHARS
    csvMaxBytes: int(env.CSV_MAX_BYTES, 512 * 1024),
    exportMaxRows: int(env.EXPORT_MAX_ROWS, 5000),
    corsOrigins: (env.CORS_ORIGINS || (isProd ? '' : 'http://localhost:5173')).split(',').map((s) => s.trim()).filter(Boolean),
    trustProxy: int(env.TRUST_PROXY, isProd ? 1 : 0),
    rate: {
      global: { windowMs: 15 * 60 * 1000, max: int(env.RATE_LIMIT_MAX, 300) },
      analyze: { windowMs: 60 * 1000, max: int(env.RATE_LIMIT_ANALYZE_MAX, 20) },
      auth: { windowMs: 15 * 60 * 1000, max: int(env.RATE_LIMIT_AUTH_MAX, 10) },
    },
  };
  if (isProd) {
    const problems = [];
    if (!cfg.mongoUri) problems.push('MONGODB_URI is required');
    if (cfg.jwtSecret.length < 32 || cfg.jwtSecret === DEV_SECRET) problems.push('JWT_SECRET must be set (>=32 chars)');
    if (cfg.internalToken.length < 16) problems.push('INTERNAL_API_TOKEN must be set (>=16 chars) and match the AI service');
    if (!cfg.aiServiceUrl) problems.push('AI_SERVICE_URL is required');
    if (!cfg.corsOrigins.length) problems.push('CORS_ORIGINS is required');
    if (cfg.corsOrigins.includes('*')) problems.push('CORS_ORIGINS must not contain "*"');
    if (problems.length) throw new Error('Invalid production configuration: ' + problems.join('; '));
  }
  return Object.freeze(cfg);
}
module.exports = { loadConfig };
