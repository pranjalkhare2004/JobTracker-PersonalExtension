/* ═══════════════════════════════════════
   test/scraper.test.js — Scraper Unit Tests
   Run: node test/scraper.test.js
   ═══════════════════════════════════════ */

const assert = require('assert');
const { parseWorkdayUrl, extractJobId, normalizeUrl, detectSource, extractJDKeywords } = require('../scraper.js');

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

console.log('\n═══ Scraper Tests ═══\n');

// 1. Workday URL parsing — exact URL from spec
test('Workday URL — Unisys with LinkedIn source', () => {
  const r = parseWorkdayUrl('https://unisys.wd5.myworkdayjobs.com/External/job/Bangalore-KA-India/Assoc-Eng-Software-Eng_REQ571718?source=LinkedIn');
  assert.deepStrictEqual(r.company, 'Unisys');
  assert.deepStrictEqual(r.role, 'Assoc Eng Software Eng');
  assert.deepStrictEqual(r.rawJobId, 'REQ571718');
  assert.deepStrictEqual(r.jobId, 'wd_REQ571718');
  assert.deepStrictEqual(r.location, 'Bangalore, KA, India');
  assert.deepStrictEqual(r.source, 'LinkedIn');
  assert.deepStrictEqual(r.platform, 'Workday');
  assert.deepStrictEqual(r.siteType, 'employer');
});

// 2. Workday URL — different source
test('Workday URL — different source (Naukri)', () => {
  const r = parseWorkdayUrl('https://unisys.wd5.myworkdayjobs.com/External/job/Bangalore-KA-India/Assoc-Eng-Software-Eng_REQ571718?source=Naukri');
  assert.deepStrictEqual(r.source, 'Naukri');
  assert.deepStrictEqual(r.company, 'Unisys');
  assert.deepStrictEqual(r.rawJobId, 'REQ571718');
});

// 3. Workday URL — no source param
test('Workday URL — no source param defaults to Direct', () => {
  const r = parseWorkdayUrl('https://acme.wd3.myworkdayjobs.com/Jobs/job/New-York-NY-USA/Senior-Backend-Engineer_JR-00492');
  assert.deepStrictEqual(r.company, 'Acme');
  assert.deepStrictEqual(r.role, 'Senior Backend Engineer');
  assert.deepStrictEqual(r.rawJobId, 'JR-00492');
  assert.deepStrictEqual(r.source, 'Direct');
  assert.deepStrictEqual(r.location, 'New, York, NY, USA');
});

// 4. Greenhouse URL
test('Greenhouse URL — boards.greenhouse.io', () => {
  const r = extractJobId('https://boards.greenhouse.io/stripe/jobs/4025671004');
  assert.deepStrictEqual(r.jobId, 'gh_4025671004');
  assert.deepStrictEqual(r.platform, 'Greenhouse');
  assert.deepStrictEqual(r.siteType, 'employer');
});

// 5. Lever URL
test('Lever URL — UUID extraction', () => {
  const r = extractJobId('https://jobs.lever.co/figma/a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  assert.ok(r.jobId.startsWith('lv_'));
  assert.ok(r.jobId.includes('a1b2c3d4-e5f6-7890-abcd-ef1234567890'));
  assert.deepStrictEqual(r.platform, 'Lever');
});

// 6. LinkedIn URL (aggregator)
test('LinkedIn URL — aggregator with tracking params stripped', () => {
  const r = extractJobId('https://www.linkedin.com/jobs/view/3847291048/?refId=xyz&trackingId=abc');
  assert.deepStrictEqual(r.jobId, 'li_3847291048');
  assert.deepStrictEqual(r.siteType, 'aggregator');
  assert.deepStrictEqual(r.platform, 'LinkedIn');
});

// 7a. Source detection — source param
test('Source detection — ?source=naukri', () => {
  const s = detectSource('https://example.greenhouse.io/jobs/123?source=naukri');
  assert.deepStrictEqual(s, 'Naukri');
});

// 7b. Source detection — utm_source
test('Source detection — ?utm_source=linkedin', () => {
  const s = detectSource('https://example.greenhouse.io/jobs/123?utm_source=linkedin');
  assert.deepStrictEqual(s, 'LinkedIn');
});

// 7c. Source detection — no param defaults to Direct (Node context has no document.referrer)
test('Source detection — no param → Direct', () => {
  const s = detectSource('https://example.greenhouse.io/jobs/123');
  assert.deepStrictEqual(s, 'Direct');
});

// 8. URL normalization
test('URL normalization — strips tracking params, keeps source', () => {
  const n = normalizeUrl('https://boards.greenhouse.io/acme/jobs/456?utm_campaign=test&source=linkedin');
  assert.ok(!n.includes('utm_campaign'));
  assert.ok(n.includes('source=linkedin'));
});

// 9. Indeed URL (aggregator)
test('Indeed URL — aggregator', () => {
  const r = extractJobId('https://www.indeed.com/viewjob?jk=abc123def');
  assert.deepStrictEqual(r.jobId, 'in_abc123def');
  assert.deepStrictEqual(r.siteType, 'aggregator');
  assert.deepStrictEqual(r.platform, 'Indeed');
});

// 10. Naukri URL
test('Naukri URL — numeric ID from .html', () => {
  const r = extractJobId('https://www.naukri.com/job-listings-software-engineer-123456789.html');
  assert.deepStrictEqual(r.jobId, 'nk_123456789');
  assert.deepStrictEqual(r.siteType, 'aggregator');
});

// 11. Non-job URL — no match
test('Non-job URL — returns null jobId', () => {
  const r = extractJobId('https://www.google.com/search?q=jobs');
  assert.deepStrictEqual(r.jobId, null);
});

// 12. JD Keyword Extraction
test('JD keyword extraction — finds required skills', () => {
  const jd = `
  Required Skills:
  - 3+ years of experience with Python and JavaScript
  - Experience with React and Node.js
  - Knowledge of SQL and MongoDB
  
  Nice to Have:
  - Docker experience
  - AWS or GCP cloud platform knowledge
  `;
  const result = extractJDKeywords(jd);
  assert.ok(result.mustHave.includes('python'));
  assert.ok(result.mustHave.includes('javascript'));
  assert.ok(result.mustHave.includes('react'));
  assert.ok(result.niceToHave.includes('docker') || result.mustHave.includes('docker'));
  assert.ok(result.yearsRequired.length > 0);
});

// 13. JD Keyword Extraction — experience level
test('JD keyword extraction — detects Senior level', () => {
  const jd = 'We are looking for a Senior Software Engineer with 5+ years of experience in Python, Java, and React.';
  const result = extractJDKeywords(jd);
  assert.deepStrictEqual(result.experienceLevel, 'Senior');
  assert.ok(result.mustHave.includes('python'));
});

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed > 0 ? 1 : 0);
