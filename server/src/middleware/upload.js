const multer = require('multer');
const ApiError = require('../utils/ApiError');

const csvUpload = (config) => {
  const m = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.csvMaxBytes, files: 1, fields: 5 },
    fileFilter: (_req, file, cb) => (/\.csv$/i.test(file.originalname || '')
      ? cb(null, true) : cb(new ApiError(400, 'invalid_csv', 'Only .csv files are accepted'))),
  }).single('file');
  // JSON bulk requests skip multer entirely.
  return (req, res, next) => (req.is('multipart/form-data') ? m(req, res, next) : next());
};
module.exports = { csvUpload };
