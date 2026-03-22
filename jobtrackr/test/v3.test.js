/* ═══════════════════════════════════════
   test/v3.test.js — V3 Enhancement Tests
   Run: node test/v3.test.js
   Tests: new platforms extractJobId, detectJobType, detectWorkMode,
          extractStipend, extractDuration, extractRequisitionId, getPlatformInfo
   ═══════════════════════════════════════ */

const assert = require('assert');
const {
  extractJobId, detectJobType, detectWorkMode, extractStipend,
  extractDuration, extractRequisitionId, getPlatformInfo
} = require('../scraper.js');

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

console.log('\n═══ V3 Enhancement Tests ═══\n');

// ──── New Platform URL Extraction ────

test('Glassdoor URL — ?jl= param', () => {
  const r = extractJobId('https://www.glassdoor.co.in/job-listing?jl=123456');
  assert.deepStrictEqual(r.jobId, 'gd_123456');
  assert.deepStrictEqual(r.platform, 'Glassdoor');
  assert.deepStrictEqual(r.siteType, 'aggregator');
});

test('Internshala URL — internship detail', () => {
  const r = extractJobId('https://internshala.com/internship/detail/web-development-at-startup-99887');
  assert.deepStrictEqual(r.jobId, 'is_99887');
  assert.deepStrictEqual(r.platform, 'Internshala');
});

test('Unstop URL — opportunity', () => {
  const r = extractJobId('https://unstop.com/opportunity/software-dev-challenge-12345');
  assert.deepStrictEqual(r.jobId, 'un_12345');
  assert.deepStrictEqual(r.platform, 'Unstop');
});

test('Foundit URL — numeric .html', () => {
  const r = extractJobId('https://www.foundit.in/job-listings-senior-dev-1234567.html');
  assert.deepStrictEqual(r.jobId, 'fi_1234567');
  assert.deepStrictEqual(r.platform, 'Foundit');
});

test('WorkAtStartup URL — /jobs/id', () => {
  const r = extractJobId('https://www.workatastartup.com/jobs/55123');
  assert.deepStrictEqual(r.jobId, 'was_55123');
  assert.deepStrictEqual(r.platform, 'WorkAtStartup');
});

// ──── detectJobType ────

test('detectJobType — intern in role title', () => {
  assert.deepStrictEqual(detectJobType('Software Engineering Intern', ''), 'Internship');
});

test('detectJobType — contract in role title', () => {
  assert.deepStrictEqual(detectJobType('Contract Java Developer', ''), 'Contract');
});

test('detectJobType — internship in JD body', () => {
  assert.deepStrictEqual(detectJobType('Java Developer', 'This is an internship position for college students.'), 'Internship');
});

test('detectJobType — standard SDE defaults to Full-time', () => {
  assert.deepStrictEqual(detectJobType('Senior Software Engineer', 'We need a strong developer for our team'), 'Full-time');
});

test('detectJobType — part-time detection', () => {
  assert.deepStrictEqual(detectJobType('Data Entry', 'This is a part-time role at 20 hours per week'), 'Part-time');
});

// ──── detectWorkMode ────

test('detectWorkMode — fully remote', () => {
  assert.deepStrictEqual(detectWorkMode('This is a fully remote position, distributed team.'), 'Remote');
});

test('detectWorkMode — hybrid', () => {
  assert.deepStrictEqual(detectWorkMode('We follow a hybrid model with 2 days office.'), 'Hybrid');
});

test('detectWorkMode — on-site', () => {
  assert.deepStrictEqual(detectWorkMode('This is an onsite role in our Bangalore office. Must relocate.'), 'On-site');
});

test('detectWorkMode — WFH = Remote', () => {
  assert.deepStrictEqual(detectWorkMode('We offer work from home culture and modern tooling.'), 'Remote');
});

test('detectWorkMode — empty/short → Unknown', () => {
  assert.deepStrictEqual(detectWorkMode(''), 'Unknown');
});

// ──── extractStipend ────

test('extractStipend — stipend with INR', () => {
  const s = extractStipend('This internship offers a stipend: ₹25,000/month');
  assert.ok(s.includes('25,000'));
});

test('extractStipend — empty when absent', () => {
  assert.deepStrictEqual(extractStipend('Great opportunity to learn'), '');
});

// ──── extractDuration ────

test('extractDuration — duration: 6 months', () => {
  const d = extractDuration('Duration: 6 months, starting immediately');
  assert.ok(d.includes('6'));
  assert.ok(d.includes('month'));
});

test('extractDuration — empty when absent', () => {
  assert.deepStrictEqual(extractDuration('Apply now for this role'), '');
});

// ──── extractRequisitionId ────

test('extractRequisitionId — Job ID label', () => {
  assert.deepStrictEqual(extractRequisitionId('Apply now! Job ID: REQ-48291'), 'REQ-48291');
});

test('extractRequisitionId — Requisition Number', () => {
  assert.deepStrictEqual(extractRequisitionId('Requisition Number: R2024-0511'), 'R2024-0511');
});

test('extractRequisitionId — no match → null', () => {
  assert.deepStrictEqual(extractRequisitionId('This is a generic JD with no IDs'), null);
});

// ──── getPlatformInfo ────

test('getPlatformInfo — linkedin.com', () => {
  const r = getPlatformInfo('www.linkedin.com', '/jobs/view/123');
  assert.deepStrictEqual(r.platform, 'LinkedIn');
  assert.deepStrictEqual(r.platformCategory, 'Aggregator');
  assert.deepStrictEqual(r.siteType, 'aggregator');
});

test('getPlatformInfo — greenhouse.io', () => {
  const r = getPlatformInfo('boards.greenhouse.io', '/stripe/jobs/123');
  assert.deepStrictEqual(r.platform, 'Greenhouse');
  assert.deepStrictEqual(r.platformCategory, 'Career');
  assert.deepStrictEqual(r.siteType, 'employer');
});

test('getPlatformInfo — careers subdomain → Career Page', () => {
  const r = getPlatformInfo('careers.google.com', '/jobs/123');
  assert.deepStrictEqual(r.platform, 'Career Page');
  assert.deepStrictEqual(r.platformCategory, 'Career');
});

test('getPlatformInfo — internshala.com', () => {
  const r = getPlatformInfo('internshala.com', '/internship/detail/xyz');
  assert.deepStrictEqual(r.platform, 'Internshala');
  assert.deepStrictEqual(r.platformCategory, 'Fresher');
});

test('getPlatformInfo — unknown → Other', () => {
  const r = getPlatformInfo('example.com', '/about');
  assert.deepStrictEqual(r.platform, 'Other');
  assert.deepStrictEqual(r.platformCategory, 'Other');
});

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed > 0 ? 1 : 0);
