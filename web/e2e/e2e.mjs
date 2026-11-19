// Browser end-to-end test. Needs the full stack running (see scripts/e2e-local.sh).
// Cloudflare is FAKED by ai-service/tests/stub_cloudflare.py, so scores here are NOT real model output.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4173';
const SHOTS = process.env.SHOTS_DIR || path.resolve('../docs/screenshots');
const SAMPLE = path.resolve('../sample-data/sample_reviews.csv');
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push('console: ' + m.text()); });
const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${n}.png`), fullPage: true });
let step = 0;
const ok = (m) => console.log(`ok ${++step} - ${m}`);
const email = `e2e${Date.now()}@example.com`;

try {
// 1. auth guard + registration
await page.goto(BASE + '/');
await page.waitForURL('**/login'); await shot('01-login'); ok('unauthenticated visit redirects to /login');
await page.getByRole('tab', { name: 'Create account' }).click();
await page.getByLabel('Name').fill('E2E Moderator'); await page.getByLabel('Email').fill(email); await page.getByLabel('Password').fill('correct-horse-battery');
await page.getByRole('button', { name: 'Create account' }).click();
await page.getByText('No reviews analysed yet').waitFor(); ok('registered and landed on empty dashboard');

// 2. analyzer
await page.getByRole('link', { name: 'Review analyzer' }).click();
await page.getByRole('button', { name: 'Angry rant' }).click();
await page.getByRole('button', { name: 'Analyze review' }).click();
await page.getByText('High risk', { exact: true }).waitFor({ timeout: 30000 });
await page.getByText('Moderator review and support follow-up').first().waitFor();
await page.getByText('How the score was built').waitFor(); await page.getByText('It does not mean the review is fake').waitFor();
await page.getByText('moderation queue').first().waitFor();
await shot('02-analyzer-high-risk'); ok('angry review: high risk, explanation, recommendation, queued');
await page.getByRole('button', { name: 'Calm complaint' }).click(); await page.getByRole('button', { name: 'Analyze review' }).click();
await page.getByText('Low risk', { exact: true }).waitFor({ timeout: 30000 }); await page.getByText('No action needed').first().waitFor();
await shot('03-analyzer-calm-complaint'); ok('calm complaint stays low risk');
await page.getByRole('button', { name: 'Promotional praise' }).click(); await page.getByRole('button', { name: 'Analyze review' }).click();
await page.getByText('Check for promotional or coordinated praise').first().waitFor({ timeout: 30000 }); ok('promotional praise gets promotional-review recommendation');
await page.getByLabel('Review text').fill('quota test TRIGGER_QUOTA'); await page.getByRole('button', { name: 'Analyze review' }).click();
await page.getByRole('alert').getByText(/free AI allowance is used up/).waitFor({ timeout: 30000 }); await shot('04-analyzer-quota-error'); ok('quota exhaustion shown as a clear error');

// 3. bulk
await page.getByRole('link', { name: 'Bulk analysis' }).click();
await page.setInputFiles('#csv', SAMPLE);
await page.getByText('Each upload is limited to 30 reviews').waitFor();
assert.ok(await page.getByRole('button', { name: /^Analyze \d+ reviews$/ }).isDisabled()); ok('45-row sample blocked until trimmed');
await page.getByRole('button', { name: 'Use the first 30 rows' }).click(); await shot('05-bulk-preview');
await page.getByRole('button', { name: 'Analyze 30 reviews' }).click();
await page.getByText('30 of 30 analysed and saved').waitFor({ timeout: 90000 }); ok('30 reviews analysed in chunks and saved');
await page.getByLabel('Filter by risk level').selectOption('high');
const highRows = await page.locator('tbody tr').filter({ hasText: 'high' }).count(); assert.ok(highRows > 0, 'expected high-risk rows'); await shot('06-bulk-results');
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
const csv = fs.readFileSync(await dl.path(), 'utf8').replace(/^\uFEFF/, '').trim().split('\r\n');
assert.ok(csv[0].startsWith('review_id,') && csv.length > 1 && csv.slice(1).every((l) => l.includes(',high,')), 'filtered export');
ok(`bulk export honours filters (${csv.length - 1} high-risk rows)`);

// 4. moderation
await page.getByRole('link', { name: 'Moderation' }).click();
await page.getByRole('button', { name: /Details and note/ }).first().waitFor();
await page.getByRole('button', { name: /Details and note/ }).first().click();
await page.getByText('Why it was flagged').first().waitFor();
await page.getByLabel('Note for the record (optional)').first().fill('Looks like coordinated praise.');
await shot('07-moderation');
await page.getByRole('button', { name: 'Escalate' }).first().click();
await page.getByText('Marked as escalated.').waitFor(); ok('moderator escalated a review with a note');
await page.getByLabel('Status').selectOption('escalated');
await page.locator('span', { hasText: /^Escalated$/ }).first().waitFor(); ok('escalated filter shows the decision');

// 5. overview / insights / reports
await page.getByRole('link', { name: 'Overview' }).click();
await page.getByText('Reviews analysed').waitFor();
const total = await page.locator('p', { hasText: /^Reviews analysed$/ }).locator('xpath=following-sibling::p[1]').innerText();
assert.equal(total.trim(), '33', 'dashboard total comes from MongoDB (3 manual + 30 bulk)'); await shot('08-overview'); ok('overview totals match what was stored (33)');
await page.getByRole('link', { name: 'Insights' }).click(); await page.getByText('Emotion by product category').waitFor(); await page.getByText('Review trends').waitFor();
await page.waitForTimeout(800); await shot('09-insights'); ok('insights render');
await page.getByRole('link', { name: 'Reports' }).click(); await page.getByText('Risk distribution').first().waitFor();
const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()]);
const all = fs.readFileSync(await dl2.path(), 'utf8').trim().split('\r\n'); assert.equal(all.length - 1, 33); await shot('10-reports'); ok('full CSV export has 33 reviews');

// 6. responsive + sign out
await page.setViewportSize({ width: 390, height: 844 });
await page.getByLabel('Open menu').click(); await page.getByRole('link', { name: 'Overview' }).click();
await page.waitForSelector('text=Reviews analysed'); const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert.ok(overflow <= 1, `horizontal overflow on mobile: ${overflow}px`); await shot('11-mobile-overview'); ok('mobile layout has no horizontal overflow');
await page.getByLabel('Open menu').click(); await page.getByRole('button', { name: 'Sign out' }).click(); await page.waitForURL('**/login'); ok('sign out returns to login');

} catch (e) {
  await page.screenshot({ path: path.join(SHOTS, 'FAILURE.png'), fullPage: true }).catch(() => {});
  console.error('FAILED at URL', page.url(), '\nvisible alerts:', await page.getByRole('alert').allInnerTexts().catch(() => []));
  await browser.close(); throw e;
}
await browser.close();
assert.deepEqual(problems, [], 'browser errors: ' + problems.join(' | '));
console.log('E2E PASSED');
