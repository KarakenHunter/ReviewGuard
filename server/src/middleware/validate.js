const { z } = require('zod');
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');

const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const r = schemas[part].safeParse(req[part] ?? {});
    if (!r.success) {
      return next(new ApiError(400, 'validation_error', 'Invalid request',
        r.error.issues.map((i) => ({ field: [part, ...i.path].join('.'), message: i.message }))));
    }
    req.valid[part] = r.data;
  }
  next();
};
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'invalid id').refine((v) => mongoose.isValidObjectId(v));
module.exports = { validate, objectId };
