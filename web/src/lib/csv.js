import Papa from 'papaparse';

export const LIMITS = { maxRows: 30, maxChars: 2000, maxBytes: 512 * 1024, chunkSize: 10 };

// Mirrors the server-side rules so users see problems before anything is sent.
export function validateCsvText(text, { maxRows = LIMITS.maxRows, maxChars = LIMITS.maxChars } = {}) {
  const parsed = Papa.parse(String(text).replace(/^\uFEFF/, ''), {
    header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase(),
  });
  const fields = parsed.meta.fields || [];
  if (!fields.length || !parsed.data.length) return { fatal: 'The file has no data rows.', rows: [], invalid: [], total: 0 };
  if (!fields.includes('review_text')) {
    return { fatal: 'The file needs a review_text column. Expected columns: review_id, product_name, category, rating, review_text.', rows: [], invalid: [], total: 0 };
  }
  const rows = []; const invalid = [];
  parsed.data.forEach((rec, i) => {
    const errors = [];
    const reviewText = (rec.review_text || '').trim();
    if (!reviewText) errors.push('review_text is empty');
    if (reviewText.length > maxChars) errors.push(`review_text is longer than ${maxChars} characters`);
    const ratingRaw = (rec.rating || '').trim();
    let rating;
    if (ratingRaw !== '') {
      rating = Number(ratingRaw);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.push('rating must be a whole number from 1 to 5');
    }
    const productName = (rec.product_name || '').trim() || 'Unspecified';
    const productCategory = (rec.category || '').trim() || 'uncategorized';
    if (productName.length > 200) errors.push('product_name is longer than 200 characters');
    if (productCategory.length > 100) errors.push('category is longer than 100 characters');
    if (errors.length) invalid.push({ row: i + 1, errors });
    else rows.push({ row: i + 1, externalId: (rec.review_id || '').trim() || undefined, productName, productCategory, rating, reviewText });
  });
  const total = parsed.data.length;
  return { rows, invalid, total, overLimit: total > maxRows, fatal: null };
}

export const toPayload = (r) => ({ externalId: r.externalId, productName: r.productName, productCategory: r.productCategory, rating: r.rating, reviewText: r.reviewText });
