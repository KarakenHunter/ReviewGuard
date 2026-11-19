const { z } = require('zod');
const { SENTIMENTS, EMOTIONS, RISK_LEVELS, MODERATION_STATUSES } = require('./config/constants');
const { objectId } = require('./middleware/validate');

const blank = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
function createValidators(config) {
  const analyzeBody = z.object({
    reviewText: z.string().trim().min(1, 'reviewText is required').max(config.maxReviewChars, `reviewText must be at most ${config.maxReviewChars} characters`),
    productName: z.preprocess(blank, z.string().trim().max(200).default('Unspecified')),
    productCategory: z.preprocess(blank, z.string().trim().max(100).default('uncategorized')),
    rating: z.preprocess(blank, z.coerce.number().int().min(1).max(5).optional()),
  });
  const bulkBody = z.object({
    batchId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
    reviews: z.array(z.unknown()).min(1, 'reviews must not be empty'),
  });
  const bulkFields = z.object({ batchId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional() }).passthrough();
  const filters = {
    sentiment: z.enum(SENTIMENTS).optional(), riskLevel: z.enum(RISK_LEVELS).optional(), emotion: z.enum(EMOTIONS).optional(),
    recommendation: z.string().regex(/^[a-z_]{1,60}$/).optional(), category: z.string().trim().max(100).optional(),
    status: z.enum([...MODERATION_STATUSES, 'open', 'all']).optional(), q: z.string().trim().min(1).max(100).optional(),
    batchId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
    minRisk: z.coerce.number().min(0).max(100).optional(), maxRisk: z.coerce.number().min(0).max(100).optional(),
    flagged: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  };
  const paging = { page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.enum(['analyzedAt', 'riskScore', 'emotionalIntensity', 'createdAt']).default('analyzedAt'), order: z.enum(['asc', 'desc']).default('desc') };
  return {
    analyzeBody, bulkBody, bulkFields,
    idParams: z.object({ id: objectId }),
    listQuery: z.object({ ...filters, ...paging }),
    exportQuery: z.object({ ...filters, sortBy: paging.sortBy, order: paging.order }),
    moderationQuery: z.object({ ...filters, ...paging, status: filters.status.default('open'), sortBy: paging.sortBy.default('riskScore') }),
    moderationBody: z.object({ action: z.enum(['approve', 'flag', 'escalate', 'dismiss']), note: z.string().trim().max(1000).optional() }),
    insightsQuery: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }),
    register: z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(10).max(72) }),
    login: z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(72) }),
  };
}
module.exports = { createValidators };
