/* ═══════════════════════════════════════
   test/dedup.test.js — Dedup Logic Unit Tests
   Run: node test/dedup.test.js
   ═══════════════════════════════════════ */

const assert = require('assert');
const { checkDuplicate, normalizeCompany, normalizeRole, normalizeUrl } = require('../dedup.js');

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

console.log('\n═══ Dedup Tests ═══\n');

const baseApp = (overrides = {}) => ({
  id: 'test-id-1',
  jobId: 'wd_REQ571718',
  rawJobId: 'REQ571718',
  company: 'Unisys',
  role: 'Software Engineer',
  jobUrl: 'https://unisys.wd5.myworkdayjobs.com/External/job/Bangalore-KA-India/Software-Engineer_REQ571718',
  email: 'A',
  status: 'Applied',
  dateApplied: new Date(Date.now() - 10 * 86400000).toISOString(), // 10 days ago
  ...overrides
});

// 1. Exact job ID duplicate
test('Tier 1 — exact job ID duplicate', () => {
  const existing = [baseApp()];
  const newEntry = { jobId: 'wd_REQ571718', company: 'Unisys', role: 'Software Eng', jobUrl: 'https://other.com' };
  const result = checkDuplicate(newEntry, existing);
  assert.deepStrictEqual(result.type, 'exact');
  assert.deepStrictEqual(result.match.id, 'test-id-1');
});

// 2. Same job ID, different source — still exact
test('Tier 1 — same job ID, different source → still exact', () => {
  const existing = [baseApp({ source: 'LinkedIn' })];
  const newEntry = { jobId: 'wd_REQ571718', source: 'Naukri', company: 'Unisys', role: 'Software Eng', jobUrl: 'https://other.com' };
  const result = checkDuplicate(newEntry, existing);
  assert.deepStrictEqual(result.type, 'exact');
});

// 3. Re-post — same company+role, new jobId, old entry > 60 days
test('Tier 3 — re-post: old entry > 60 days, status Rejected', () => {
  const existing = [baseApp({
    jobId: 'wd_REQ441122', rawJobId: 'REQ441122',
    company: 'Unisys', role: 'Assoc Eng Software Eng',
    dateApplied: new Date(Date.now() - 90 * 86400000).toISOString(),
    status: 'Rejected'
  })];
  const newEntry = { jobId: 'wd_REQ571718', company: 'Unisys', role: 'Assoc Eng Software Eng', jobUrl: 'https://new.com' };
  const result = checkDuplicate(newEntry, existing);
  assert.deepStrictEqual(result.type, 'repost');
  assert.deepStrictEqual(result.match.jobId, 'wd_REQ441122');
});

// 4. Re-post — old entry < 60 days but status Rejected
test('Tier 3 — re-post: recent but Rejected status qualifies', () => {
  const existing = [baseApp({
    jobId: 'wd_REQ441122',
    company: 'Unisys', role: 'Assoc Eng Software Eng',
    dateApplied: new Date(Date.now() - 20 * 86400000).toISOString(),
    status: 'Rejected'
  })];
  const newEntry = { jobId: 'wd_REQ571718', company: 'Unisys', role: 'Assoc Eng Software Eng', jobUrl: 'https://new.com' };
  const result = checkDuplicate(newEntry, existing);
  assert.deepStrictEqual(result.type, 'repost');
});

// 5. Recent same role — NOT re-post, should be fuzzy
test('Tier 4 — fuzzy: recent entry, status Applied', () => {
  const existing = [baseApp({
    jobId: 'wd_REQ441122',
    company: 'Unisys', role: 'Assoc Eng Software Eng',
    dateApplied: new Date(Date.now() - 10 * 86400000).toISOString(),
    status: 'Applied'
  })];
  const newEntry = { jobId: 'wd_REQ571718', company: 'Unisys', role: 'Assoc Eng Software Eng', jobUrl: 'https://new.com' };
  const result = checkDuplicate(newEntry, existing);
  assert.deepStrictEqual(result.type, 'fuzzy');
});

// 6. Different company — no match
test('No match — different company', () => {
  const existing = [baseApp({ company: 'Infosys', role: 'Software Engineer' })];
  const newEntry = { company: 'Wipro', role: 'Software Engineer', jobUrl: 'https://wipro.com/job/123' };
  const result = checkDuplicate(newEntry, existing);
  assert.deepStrictEqual(result.type, null);
});

// 7. Same company, different role — no match
test('No match — same company, different role', () => {
  const existing = [baseApp({ company: 'Google', role: 'Frontend Engineer' })];
  const newEntry = { company: 'Google', role: 'Backend Engineer', jobUrl: 'https://google.com/job/456' };
  const result = checkDuplicate(newEntry, existing);
  assert.deepStrictEqual(result.type, null);
});

// 8. Company normalization
test('Company normalization — strips suffixes', () => {
  assert.deepStrictEqual(normalizeCompany('Unisys Technologies Ltd'), normalizeCompany('Unisys'));
  assert.deepStrictEqual(normalizeCompany('Google LLC'), normalizeCompany('Google'));
  assert.deepStrictEqual(normalizeCompany('Amazon Inc'), normalizeCompany('Amazon'));
});

// 9. Role normalization
test('Role normalization — strips level/role words', () => {
  // Both should normalize to something similar (both strip away "Assoc"/"Associate", "Eng"/"Engineer", "Software", etc.)
  const a = normalizeRole('Assoc Eng Software Eng');
  const b = normalizeRole('Software Engineer');
  assert.deepStrictEqual(a, b);

  const c = normalizeRole('Senior Backend Developer');
  const d = normalizeRole('Backend Developer');
  assert.deepStrictEqual(c, d);
});

// 10. URL normalization
test('URL normalization — strips tracking params', () => {
  const n = normalizeUrl('https://example.com/job?utm_source=test&utm_campaign=ad&source=linkedin');
  assert.ok(!n.includes('utm_source'));
  assert.ok(!n.includes('utm_campaign'));
  assert.ok(n.includes('source=linkedin'));
});

// 11. Tier 2 — URL match
test('Tier 2 — normalized URL match', () => {
  const existing = [baseApp({ jobUrl: 'https://example.com/jobs/123?utm_source=test' })];
  const newEntry = { jobUrl: 'https://example.com/jobs/123?utm_campaign=ad', company: 'X', role: 'Y' };
  const result = checkDuplicate(newEntry, existing);
  assert.deepStrictEqual(result.type, 'url');
});

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed > 0 ? 1 : 0);
