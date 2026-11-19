const { MulterError } = require('multer');
const ApiError = require('../utils/ApiError');

const DB_ERRORS = ['MongooseServerSelectionError', 'MongoServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoNotConnectedError'];
const notFound = (_req, _res, next) => next(new ApiError(404, 'not_found', 'Route not found'));

function errorHandler(config) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    let e = err;
    if (!(e instanceof ApiError)) {
      if (e instanceof MulterError) e = new ApiError(e.code === 'LIMIT_FILE_SIZE' ? 413 : 400, e.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'invalid_upload', e.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : 'Invalid upload');
      else if (e.type === 'entity.parse.failed') e = new ApiError(400, 'invalid_json', 'Malformed JSON body');
      else if (e.type === 'entity.too.large') e = new ApiError(413, 'payload_too_large', 'Request body too large');
      else if (e.name === 'CastError' || e.name === 'ValidationError') e = new ApiError(400, 'validation_error', 'Invalid data');
      else if (e.code === 11000) e = new ApiError(409, 'conflict', 'Resource already exists');
      else if (DB_ERRORS.includes(e.name) || /buffering timed out|not connected/i.test(e.message || '')) e = new ApiError(503, 'database_unavailable', 'Database is temporarily unavailable');
      else e = new ApiError(500, 'internal_error', 'Internal server error');
    }
    if (e.status >= 500) console.error(JSON.stringify({ level: 'error', code: e.code, path: req.path, cause: err.message, ...(config.isProd ? {} : { stack: err.stack }) }));
    const body = { success: false, error: { code: e.code, message: e.message } };
    if (e.details) body.error.details = e.details;
    res.status(e.status).json(body);
  };
}
module.exports = { notFound, errorHandler };
