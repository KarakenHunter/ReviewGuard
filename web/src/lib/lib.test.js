import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateCsvText, LIMITS } from './csv';
import { describeError } from './api';
import { recLabel, truncate, pct, statusLabel } from './format';

const H = 'review_id,product_name,category,rating,review_text\n';
describe('csv validation (mirrors server rules)', () => {
  it('parses quoted commas and defaults', () => {
    const r = validateCsvText(`${H}1,Lamp,home,5,"Nice, bright"\n2,,,,plain text\n`);
    expect(r.rows).toHaveLength(2); expect(r.rows[0].reviewText).toBe('Nice, bright');
    expect(r.rows[1]).toMatchObject({ productName: 'Unspecified', productCategory: 'uncategorized', rating: undefined });
  });
  it('handles BOM and header case', () => { expect(validateCsvText('\uFEFFReview_Text\nhello\n').rows).toHaveLength(1); });
  it('rejects files without review_text or without rows', () => {
    expect(validateCsvText('a,b\n1,2\n').fatal).toMatch(/review_text/);
    expect(validateCsvText('review_text\n').fatal).toMatch(/no data rows/);
    expect(validateCsvText('').fatal).toBeTruthy();
  });
  it('flags bad rows without dropping good ones', () => {
    const r = validateCsvText(`${H}1,P,c,9,ok\n2,P,c,3,\n3,P,c,2.5,ok\n4,P,c,4,fine\n5,P,c,3,${'x'.repeat(2001)}\n`);
    expect(r.rows.map((x) => x.row)).toEqual([4]); expect(r.invalid.map((x) => x.row)).toEqual([1, 2, 3, 5]);
  });
  it('detects more than the per-upload limit', () => {
    const rows = Array.from({ length: LIMITS.maxRows + 1 }, (_, i) => `${i},P,c,3,text ${i}`).join('\n');
    expect(validateCsvText(H + rows).overLimit).toBe(true);
    expect(validateCsvText(H + rows.split('\n').slice(0, 30).join('\n')).overLimit).toBe(false);
  });
  it('the shipped sample file is valid, realistic in size and needs trimming to 30', () => {
    const r = validateCsvText(readFileSync(new URL('../../../sample-data/sample_reviews.csv', import.meta.url), 'utf8'));
    expect(r.total).toBe(45); expect(r.invalid).toEqual([]); expect(r.overLimit).toBe(true);
    expect(new Set(r.rows.map((x) => x.productCategory)).size).toBeGreaterThanOrEqual(5);
  });
});
describe('error mapping', () => {
  const e = (status, code, message) => ({ response: { status, data: { error: { code, message } } } });
  it('gives actionable messages for AI failures', () => {
    expect(describeError(e(429, 'quota_exhausted')).message).toMatch(/allowance/);
    expect(describeError(e(503, 'ai_unavailable')).message).toMatch(/Nothing was saved/);
    expect(describeError(e(502, 'invalid_ai_response')).message).toMatch(/Nothing was saved/);
  });
  it('handles network failures and unknown codes', () => {
    expect(describeError({}).code).toBe('network');
    expect(describeError(e(400, 'weird', 'Server said no')).message).toBe('Server said no');
  });
});
describe('format helpers', () => {
  it('labels', () => { expect(recLabel('no_action')).toBe('No action needed'); expect(recLabel('some_new_code')).toBe('some new code'); expect(statusLabel('pending')).toBe('Waiting for review'); });
  it('numbers and text', () => { expect(pct(0.256)).toBe('26%'); expect(truncate('abcdef', 4)).toBe('abc…'); });
});
