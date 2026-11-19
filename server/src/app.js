const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoose = require('mongoose');
const { validate } = require('./middleware/validate');
const { csvUpload } = require('./middleware/upload');
const { noSqlGuard, limiter, requireAuth } = require('./middleware/security');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { createValidators } = require('./validators');
const { createControllers } = require('./controllers');
const { createAuthService } = require('./services/authService');
const { createReviewService } = require('./services/reviewService');

function createApp({ config, ai, isDbConnected = () => mongoose.connection.readyState === 1 }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition', 'X-Total-Count', 'X-Export-Truncated'], maxAge: 600,
  }));
  app.use(express.json({ limit: '200kb' }));
  app.use(noSqlGuard);
  app.use('/api', limiter(config.rate.global));

  const v = createValidators(config);
  const c = createControllers({ config, ai, isDbConnected, reviewService: createReviewService({ ai, config }), authService: createAuthService(config) });
  const analyzeLimit = limiter(config.rate.analyze);
  const auth = requireAuth(config);

  app.get('/api/health', c.health);
  const authR = express.Router();
  authR.post('/register', limiter(config.rate.auth), validate({ body: v.register }), c.register);
  authR.post('/login', limiter(config.rate.auth, { skipSuccessfulRequests: true }), validate({ body: v.login }), c.login);
  authR.get('/me', auth, c.me);
  app.use('/api/auth', authR);

  const reviews = express.Router();
  reviews.post('/analyze', analyzeLimit, validate({ body: v.analyzeBody }), c.analyze);
  // multipart (CSV) is validated inside the controller; JSON bodies are validated here
  reviews.post('/bulk', analyzeLimit, csvUpload(config), (req, res, next) => (req.file ? next() : validate({ body: v.bulkBody })(req, res, next)), c.bulk);
  reviews.get('/', validate({ query: v.listQuery }), c.list);
  reviews.get('/stats', c.stats); // must precede /:id
  reviews.get('/:id', validate({ params: v.idParams }), c.getOne);
  reviews.delete('/:id', validate({ params: v.idParams }), c.remove);
  app.use('/api/reviews', auth, reviews);

  const mod = express.Router();
  mod.get('/', validate({ query: v.moderationQuery }), c.moderationList);
  mod.patch('/:id', validate({ params: v.idParams, body: v.moderationBody }), c.moderationAction);
  app.use('/api/moderation', auth, mod);

  app.get('/api/analytics/insights', auth, validate({ query: v.insightsQuery }), c.insights);
  app.get('/api/reports/summary', auth, c.reportSummary);
  app.get('/api/reports/export', auth, validate({ query: v.exportQuery }), c.export);

  app.use(notFound);
  app.use(errorHandler(config));
  return app;
}
module.exports = { createApp };
