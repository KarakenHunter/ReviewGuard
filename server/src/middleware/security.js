const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');

function hasBadKey(v, depth = 0) {
  if (depth > 8) return true;
  if (Array.isArray(v)) return v.some((x) => hasBadKey(x, depth + 1));
  if (v && typeof v === 'object') {
    return Object.keys(v).some((k) => k.startsWith('$') || k.includes('.') || k === '__proto__' || hasBadKey(v[k], depth + 1));
  }
  return false;
}
// Defence in depth against NoSQL operator injection; zod validation is the primary control.
const noSqlGuard = (req, _res, next) => {
  if (hasBadKey(req.body) || hasBadKey(req.query) || hasBadKey(req.params)) {
    return next(new ApiError(400, 'invalid_input', 'Request contains disallowed keys'));
  }
  next();
};

const limiter = ({ windowMs, max }, extra = {}) => rateLimit({
  windowMs, max, standardHeaders: 'draft-7', legacyHeaders: false, ...extra,
  handler: (_req, _res, next) => next(new ApiError(429, 'rate_limited', 'Too many requests, please slow down')),
});

const requireAuth = (config) => (req, _res, next) => {
  const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  if (!m) return next(new ApiError(401, 'unauthorized', 'Authentication required'));
  try {
    const p = jwt.verify(m[1], config.jwtSecret, { algorithms: ['HS256'] });
    req.user = { id: p.sub, name: p.name };
    next();
  } catch { next(new ApiError(401, 'unauthorized', 'Invalid or expired token')); }
};
module.exports = { noSqlGuard, limiter, requireAuth, hasBadKey };
