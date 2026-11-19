const { parse } = require('csv-parse/sync');
const { z } = require('zod');
const ApiError = require('./ApiError');

const emptyToUndef = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

// One normalised shape for CSV rows and JSON bulk rows.
const rowSchema = (maxChars) => z.object({
  externalId: z.preprocess(emptyToUndef, z.string().trim().max(100).optional()),
  productName: z.preprocess(emptyToUndef, z.string().trim().max(200).default('Unspecified')),
  productCategory: z.preprocess(emptyToUndef, z.string().trim().max(100).default('uncategorized')),
  rating: z.preprocess(emptyToUndef, z.coerce.number().int().min(1).max(5).optional()),
  reviewText: z.string().trim().min(1, 'review_text is empty').max(maxChars, `review_text exceeds ${maxChars} characters`),
});

const CSV_KEYS = { review_id: 'externalId', product_name: 'productName', category: 'productCategory', rating: 'rating', review_text: 'reviewText' };

function validateRows(rawRows, maxChars) {
  const schema = rowSchema(maxChars);
  const rows = []; const invalid = [];
  rawRows.forEach((raw, i) => {
    const r = schema.safeParse(raw);
    if (r.success) rows.push({ row: i + 1, ...r.data });
    else invalid.push({ row: i + 1, errors: r.error.issues.map((x) => `${x.path.join('.') || 'row'}: ${x.message}`) });
  });
  return { rows, invalid };
}

function parseReviewCsv(buffer, { maxRows, maxChars }) {
  if (!buffer || !buffer.length) throw new ApiError(400, 'invalid_csv', 'CSV file is empty');
  if (buffer.includes(0)) throw new ApiError(400, 'invalid_csv', 'File is not a text CSV');
  let records;
  try {
    records = parse(buffer, { columns: (h) => h.map((x) => String(x).trim().toLowerCase()), bom: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    throw new ApiError(400, 'invalid_csv', `CSV could not be parsed${e.lines ? ` (line ${e.lines})` : ''}`);
  }
  if (!records.length) throw new ApiError(400, 'invalid_csv', 'CSV has a header but no data rows');
  if (!Object.prototype.hasOwnProperty.call(records[0], 'review_text')) {
    throw new ApiError(400, 'invalid_csv', 'CSV must contain a review_text column (expected: review_id,product_name,category,rating,review_text)');
  }
  if (records.length > maxRows) throw new ApiError(422, 'too_many_rows', `A bulk request is limited to ${maxRows} reviews (got ${records.length})`);
  const raw = records.map((rec) => Object.fromEntries(Object.entries(CSV_KEYS).map(([csvKey, k]) => [k, rec[csvKey]])));
  return validateRows(raw, maxChars);
}

// CSV export with formula-injection protection (OWASP): neutralise leading = + - @ tab CR.
function cell(v) {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join('; ') : String(v);
  if (typeof v === 'string' || Array.isArray(v)) { if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; }
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(columns, rows) {
  const lines = [columns.map((c) => c.header).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(c.value(r))).join(','));
  return lines.join('\r\n') + '\r\n';
}
module.exports = { parseReviewCsv, validateRows, toCsv, rowSchema };
