/* ═══════════════════════════════════════
   scraper.js — Universal Extraction + Keyword Extraction (V2)
   Signal waterfall: Workday URL → JSON-LD → Meta → DOM heuristic
   No hardcoded CSS selectors per platform.
   ═══════════════════════════════════════ */

(function () {
  'use strict';

  /* ═══════════════════════════════
     URL NORMALIZATION
     ═══════════════════════════════ */

  const STRIP_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
    'refId', 'trk', 'trkInfo', 'lipi', 'trackingId',
    'fbclid', 'gclid', 'msclkid', 'mc_cid', '_hsenc', '_hsmi'
  ];
  // KEEP: source, ref (useful data about where user came from)

  function normalizeUrl(url) {
    try {
      const u = new URL(url);
      STRIP_PARAMS.forEach(p => u.searchParams.delete(p));
      u.hash = '';
      u.searchParams.sort();
      return u.origin + u.pathname.replace(/\/+$/, '') + (u.search || '');
    } catch { return url; }
  }

  /* ═══════════════════════════════
     SOURCE DETECTION (Section 3B)
     ═══════════════════════════════ */

  const SOURCE_PARAMS = ['source', 'ref', 'utm_source', 'from', 'referer', 'referrer', 'via'];

  const SOURCE_MAP = {
    'linkedin': 'LinkedIn', 'naukri': 'Naukri', 'indeed': 'Indeed',
    'glassdoor': 'Glassdoor', 'wellfound': 'Wellfound', 'angellist': 'Wellfound',
    'direct': 'Direct', 'internshala': 'Internshala', 'unstop': 'Unstop',
    'cutshort': 'Cutshort', 'foundit': 'Foundit', 'instahyre': 'Instahyre',
    'hirist': 'Hirist', 'simplyhired': 'SimplyHired'
  };

  /* ═══════════════════════════════
     PLATFORM MAP (Section 4)
     ═══════════════════════════════ */

  const PLATFORM_MAP = [
    // Aggregators
    { match: 'linkedin.com',        name: 'LinkedIn',        category: 'Aggregator', type: 'aggregator' },
    { match: 'glassdoor.co.in',     name: 'Glassdoor',       category: 'Aggregator', type: 'aggregator' },
    { match: 'glassdoor.com',       name: 'Glassdoor',       category: 'Aggregator', type: 'aggregator' },
    { match: 'indeed.com',          name: 'Indeed',          category: 'Aggregator', type: 'aggregator' },
    { match: 'in.indeed.com',       name: 'Indeed',          category: 'Aggregator', type: 'aggregator' },
    { match: 'naukri.com',          name: 'Naukri',          category: 'Aggregator', type: 'aggregator' },
    { match: 'foundit.in',          name: 'Foundit',         category: 'Aggregator', type: 'aggregator' },
    { match: 'simplyhired.co.in',   name: 'SimplyHired',     category: 'Aggregator', type: 'aggregator' },
    // Startup / curated
    { match: 'wellfound.com',       name: 'Wellfound',       category: 'Startup',    type: 'employer' },
    { match: 'angel.co',            name: 'Wellfound',       category: 'Startup',    type: 'employer' },
    { match: 'cutshort.io',         name: 'Cutshort',        category: 'Startup',    type: 'employer' },
    { match: 'workatastartup.com',  name: 'WorkAtStartup',   category: 'Startup',    type: 'aggregator' },
    { match: 'instahyre.com',       name: 'Instahyre',       category: 'Startup',    type: 'aggregator' },
    { match: 'hirist.tech',         name: 'Hirist',          category: 'Startup',    type: 'aggregator' },
    // Fresher-focused
    { match: 'internshala.com',     name: 'Internshala',     category: 'Fresher',    type: 'aggregator' },
    { match: 'unstop.com',          name: 'Unstop',          category: 'Fresher',    type: 'aggregator' },
    // Contract/remote
    { match: 'uplers.com',          name: 'Uplers',          category: 'Other',       type: 'aggregator' },
    // ATS platforms (employer-hosted)
    { match: 'myworkdayjobs.com',   name: 'Workday',         category: 'Career',     type: 'employer' },
    { match: 'myworkday.com',       name: 'Workday',         category: 'Career',     type: 'employer' },
    { match: 'greenhouse.io',       name: 'Greenhouse',      category: 'Career',     type: 'employer' },
    { match: 'lever.co',            name: 'Lever',           category: 'Career',     type: 'employer' },
    { match: 'smartrecruiters.com', name: 'SmartRecruiters', category: 'Career',     type: 'employer' },
    { match: 'ashbyhq.com',         name: 'Ashby',           category: 'Career',     type: 'employer' },
    { match: 'rippling.com',        name: 'Rippling',        category: 'Career',     type: 'employer' },
    { match: 'icims.com',           name: 'iCIMS',           category: 'Career',     type: 'employer' },
    { match: 'bamboohr.com',        name: 'BambooHR',        category: 'Career',     type: 'employer' },
    { match: 'jobvite.com',         name: 'Jobvite',         category: 'Career',     type: 'employer' },
    { match: 'taleo.net',           name: 'Taleo',           category: 'Career',     type: 'employer' },
    { match: 'breezy.hr',           name: 'Breezy',          category: 'Career',     type: 'employer' },
    { match: 'workable.com',        name: 'Workable',        category: 'Career',     type: 'employer' },
  ];

  function getPlatformInfo(hostname, pathname) {
    pathname = pathname || '';
    for (const p of PLATFORM_MAP) {
      if (hostname.includes(p.match)) {
        return { platform: p.name, platformCategory: p.category, siteType: p.type };
      }
    }
    // Career page detection
    if (
      hostname.startsWith('careers.') ||
      hostname.includes('.careers.') ||
      pathname.includes('/careers') ||
      pathname.includes('/jobs') ||
      pathname.includes('/work-with-us') ||
      pathname.includes('/join-us') ||
      pathname.includes('/openings')
    ) {
      return { platform: 'Career Page', platformCategory: 'Career', siteType: 'employer' };
    }
    return { platform: 'Other', platformCategory: 'Other', siteType: 'employer' };
  }

  /* ═══════════════════════════════
     JOB TYPE DETECTION (Section 2A)
     ═══════════════════════════════ */

  function detectJobType(roleText, jdText) {
    const role = (roleText || '').toLowerCase();
    const jd = (jdText || '').toLowerCase();

    // Role title check (highest priority)
    if (/\bintern\b|_intern\b|-intern\b|\binternship\b|\btrainee\b|\bapprentice\b/i.test(role)) return 'Internship';
    if (/\bcontract\b|\bcontractor\b|\bconsultant\b|\bfreelance\b|\btemp\b|\btemporary\b/i.test(role)) return 'Contract';

    // JSON-LD check
    try {
      const scripts = typeof document !== 'undefined' ? document.querySelectorAll('script[type="application/ld+json"]') : [];
      for (const s of scripts) {
        try {
          let data = JSON.parse(s.textContent);
          if (Array.isArray(data)) data = data.find(d => d['@type'] === 'JobPosting') || data[0];
          if (data?.employmentType) {
            const et = String(data.employmentType).toUpperCase();
            if (et === 'INTERN') return 'Internship';
            if (et === 'CONTRACTOR' || et === 'TEMPORARY') return 'Contract';
            if (et === 'PART_TIME' || et === 'PART TIME') return 'Part-time';
            if (et === 'FULL_TIME' || et === 'FULL TIME' || et === 'PERMANENT') return 'Full-time';
          }
        } catch { /* skip */ }
      }
    } catch { /* ignore */ }

    // JD body signals
    if (/\binternship\b|\bintern position\b|\bintern role\b|\bstipend\b|\bduration:\s*\d+\s*months?\b|\bcollege students\b|\bfinal year\b|\bundergraduate\b|\bpursuing b\.?tech\b|\bpursuing degree\b/i.test(jd)) return 'Internship';
    if (/\bcontract role\b|\bcontractual\b|\bfixed term\b|\b\d+-month contract\b|\bcontract to hire\b|\bc2h\b|\bthird party payroll\b/i.test(jd)) return 'Contract';
    if (/\bpart[- ]?time\b|\b20 hours\b|\bweekends only\b/i.test(jd)) return 'Part-time';

    // Full-time signals in role title
    if (/\bsde\b|\bswe\b|\bengineer\b|\bdeveloper\b|\banalyst\b|\bassociate\b|\bmanager\b|\blead\b|\barchitect\b/i.test(role)) return 'Full-time';

    // Default
    if (jd.length > 100) return 'Full-time'; // has a JD, assume full-time
    return 'Unknown';
  }

  /* ═══════════════════════════════
     WORK MODE DETECTION (Section 2B)
     ═══════════════════════════════ */

  function detectWorkMode(jdText) {
    // JSON-LD check first
    try {
      const scripts = typeof document !== 'undefined' ? document.querySelectorAll('script[type="application/ld+json"]') : [];
      for (const s of scripts) {
        try {
          let data = JSON.parse(s.textContent);
          if (Array.isArray(data)) data = data.find(d => d['@type'] === 'JobPosting') || data[0];
          if (data?.jobLocationType === 'TELECOMMUTE') return 'Remote';
        } catch { /* skip */ }
      }
    } catch { /* ignore */ }

    const jd = (jdText || '').toLowerCase();
    if (!jd || jd.length < 30) return 'Unknown';

    // Explicit remote
    if (/\bfully remote\b|\b100% remote\b|\bremote[- ]?first\b|\bdistributed team\b|\banywhere in india\b/i.test(jd)) return 'Remote';
    if (/\bwork from home\b|\bwfh\b/i.test(jd)) return 'Remote';

    // Hybrid
    if (/\bhybrid\b|\b[23] days? office\b|\bpartial remote\b|\bflexible work\b|\bhybrid model\b|\bwork from office\s*\/\s*home\b/i.test(jd)) return 'Hybrid';

    // On-site
    if (/\bon[- ]?site\b|\bonsite\b|\bin[- ]?office\b|\boffice only\b|\bwork from office\b|\bno remote\b|\bmust relocate\b/i.test(jd)) return 'On-site';

    // Generic "remote" (lower priority since it might be in "no remote" context)
    if (/\bremote\b/i.test(jd) && !/\bno remote\b|\bnot remote\b/i.test(jd)) return 'Remote';

    return 'Unknown';
  }

  /* ═══════════════════════════════
     STIPEND & DURATION (Section 2C/2D)
     ═══════════════════════════════ */

  function extractStipend(jdText) {
    if (!jdText) return '';
    const m = jdText.match(/(?:stipend|salary|ctc|compensation)[:\s]+([₹$]?[\d,]+(?:\s*[-–]\s*[\d,]+)?(?:\s*(?:lpa|\/month|per month|k\/month|k))?)/i);
    if (m) return m[1].trim();
    const m2 = jdText.match(/(?:₹|INR|Rs\.?)\s*[\d,]+(?:\s*[-–]\s*[\d,]+)?(?:\s*(?:lpa|\/month|per month))?/i);
    if (m2) return m2[0].trim();
    return '';
  }

  function extractDuration(jdText) {
    if (!jdText) return '';
    const m = jdText.match(/duration[:\s]+(\d+\s*(?:months?|weeks?|years?))/i);
    if (m) return m[1].trim();
    const m2 = jdText.match(/(\d+)[- ](?:month|week|year)\s+(?:internship|contract|program)/i);
    if (m2) return m2[1].trim() + ' month';
    return '';
  }

  /* ═══════════════════════════════
     REQUISITION ID EXTRACTION (Section 3)
     ═══════════════════════════════ */

  const REQ_LABELS = [
    'job id', 'job_id', 'job-id', 'jobid',
    'requisition id', 'requisition_id', 'req id', 'req_id', 'req-id', 'reqid',
    'req no', 'req no.', 'req number', 'requisition no', 'requisition number',
    'reference id', 'ref id', 'ref_id', 'ref code', 'refcode', 'ref no',
    'vacancy code', 'vacancy id', 'vacancy no',
    'job number', 'job no', 'job no.',
    'position id', 'position no', 'position number',
    'opening id', 'opening no',
    'job code', 'job ref',
    'posting id', 'posting number',
    'application id',
  ];

  function extractRequisitionId(pageText) {
    if (!pageText) return null;
    for (const label of REQ_LABELS) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped + '[:\\s#\\-]+([A-Z0-9][A-Z0-9\\-_/]{2,24})', 'i');
      const m = pageText.match(re);
      if (m) return m[1].trim();
    }
    return null;
  }

  function extractReqIdFromDOM() {
    try {
      // Check meta tags first
      const metaNames = ['jobId', 'job_id', 'requisitionId', 'job-posting-id'];
      for (const n of metaNames) {
        const el = document.querySelector(`meta[name="${n}"]`) || document.querySelector(`meta[property="job:id"]`);
        if (el) { const v = el.getAttribute('content')?.trim(); if (v && v.length > 2 && v.length < 30) return v; }
      }
      // Check JSON-LD identifier
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        try {
          let data = JSON.parse(s.textContent);
          if (Array.isArray(data)) data = data.find(d => d['@type'] === 'JobPosting') || data[0];
          if (data?.identifier) {
            const val = typeof data.identifier === 'string' ? data.identifier : data.identifier?.value;
            if (val && val.length > 2 && val.length < 30) return val;
          }
        } catch { /* skip */ }
      }
      // Scan DOM elements
      const candidates = document.querySelectorAll('span, p, li, div, td, dt, dd');
      for (const el of candidates) {
        const text = el.innerText?.trim() || '';
        if (text.length > 120 || text.length < 5) continue;
        const re = /(?:job\s*id|req(?:uisition)?\s*(?:id|no|number|code)|ref\s*(?:id|code|no)|vacancy\s*(?:id|code|no)|position\s*(?:id|no)|job\s*(?:no|number|code|ref))[:\s#\-]+([A-Z0-9][A-Z0-9\-_/]{2,24})/i;
        const m = text.match(re);
        if (m) return m[1].trim();
      }
    } catch { /* ignore */ }
    return null;
  }

  function detectSource(url) {
    try {
      const u = new URL(url);
      for (const p of SOURCE_PARAMS) {
        const val = u.searchParams.get(p);
        if (val) {
          const key = val.toLowerCase().trim();
          return SOURCE_MAP[key] || capitalize(val);
        }
      }
    } catch { /* ignore */ }

    // Fallback: check document.referrer
    try {
      const ref = document.referrer || '';
      if (ref.includes('linkedin')) return 'LinkedIn';
      if (ref.includes('naukri')) return 'Naukri';
      if (ref.includes('indeed')) return 'Indeed';
      if (ref.includes('glassdoor')) return 'Glassdoor';
    } catch { /* ignore */ }

    return 'Direct';
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /* ═══════════════════════════════
     WORKDAY URL PARSING (Section 3A)
     ═══════════════════════════════ */

  function parseWorkdayUrl(url) {
    try {
      const u = new URL(url);
      if (!u.hostname.includes('myworkdayjobs') && !u.hostname.includes('myworkday')) return null;

      const company = u.hostname.split('.')[0]; // "unisys"
      const parts = u.pathname.split('/').filter(Boolean);
      // e.g. ["External", "job", "Bangalore-KA-India", "Assoc-Eng-Software-Eng_REQ571718"]

      const locationSlug = parts[2] || '';
      const roleAndId = parts[3] || '';

      // Location: slug → readable
      const locationClean = locationSlug.replace(/-/g, ', ');

      // Job ID: everything after the LAST underscore
      const lastUs = roleAndId.lastIndexOf('_');
      const rawJobId = lastUs !== -1 ? roleAndId.slice(lastUs + 1) : '';

      // Role: everything before the last underscore, hyphens → spaces
      const roleSlug = lastUs !== -1 ? roleAndId.slice(0, lastUs) : roleAndId;
      const role = roleSlug.replace(/-/g, ' ');

      // Source from query param
      const source = u.searchParams.get('source') || 'Direct';

      return {
        company: capitalize(company),
        role,
        rawJobId,
        jobId: rawJobId ? 'wd_' + rawJobId : null,
        location: locationClean,
        source: SOURCE_MAP[source.toLowerCase()] || capitalize(source),
        platform: 'Workday',
        siteType: 'employer',
      };
    } catch { return null; }
  }

  /* ═══════════════════════════════
     JOB ID EXTRACTION (Section 3C)
     ═══════════════════════════════ */

  function extractJobId(url) {
    if (!url) return { jobId: null, rawJobId: null, platform: 'Other', siteType: 'employer' };

    try {
      const u = new URL(url);
      const host = u.hostname;
      const path = u.pathname;
      const full = url;

      // Workday — handled by parseWorkdayUrl above
      if (host.includes('myworkdayjobs') || host.includes('myworkday')) {
        const wd = parseWorkdayUrl(url);
        if (wd) return { jobId: wd.jobId, rawJobId: wd.rawJobId, platform: 'Workday', siteType: 'employer' };
      }

      // Greenhouse
      if (host.includes('greenhouse.io')) {
        let m = u.searchParams.get('gh_jid');
        if (m) return { jobId: 'gh_' + m, rawJobId: m, platform: 'Greenhouse', siteType: 'employer' };
        m = path.match(/\/jobs\/(\d+)/);
        if (m) return { jobId: 'gh_' + m[1], rawJobId: m[1], platform: 'Greenhouse', siteType: 'employer' };
      }

      // Lever
      let m = full.match(/jobs\.lever\.co\/[^\/]+\/([a-f0-9\-]{36})/i);
      if (m) return { jobId: 'lv_' + m[1], rawJobId: m[1], platform: 'Lever', siteType: 'employer' };

      // SmartRecruiters
      m = full.match(/jobs\.smartrecruiters\.com\/[^\/]+\/([A-Z0-9]+)/i);
      if (m) return { jobId: 'sr_' + m[1], rawJobId: m[1], platform: 'SmartRecruiters', siteType: 'employer' };

      // Indeed (aggregator)
      if (host.includes('indeed.com')) {
        const jk = u.searchParams.get('jk');
        if (jk) return { jobId: 'in_' + jk, rawJobId: jk, platform: 'Indeed', siteType: 'aggregator' };
      }

      // LinkedIn (aggregator)
      if (host.includes('linkedin.com')) {
        m = path.match(/\/jobs\/view\/(\d{8,})/);
        if (m) return { jobId: 'li_' + m[1], rawJobId: m[1], platform: 'LinkedIn', siteType: 'aggregator' };
      }

      // Naukri (aggregator)
      if (host.includes('naukri.com')) {
        m = path.match(/-(\d{6,10})\.html$/);
        if (m) return { jobId: 'nk_' + m[1], rawJobId: m[1], platform: 'Naukri', siteType: 'aggregator' };
      }

      // Wellfound
      if (host.includes('wellfound.com') || host.includes('angel.co')) {
        m = path.match(/\/jobs\/(\d+)/);
        if (m) return { jobId: 'wf_' + m[1], rawJobId: m[1], platform: 'Wellfound', siteType: 'employer' };
      }

      // Ashby
      m = full.match(/jobs\.ashbyhq\.com\/[^\/]+\/([a-f0-9\-]{36})/i);
      if (m) return { jobId: 'ash_' + m[1], rawJobId: m[1], platform: 'Ashby', siteType: 'employer' };

      // Rippling
      if (host.includes('rippling.com')) {
        m = path.match(/\/jobs\/([A-Z0-9\-]+)$/i);
        if (m) return { jobId: 'rp_' + m[1], rawJobId: m[1], platform: 'Rippling', siteType: 'employer' };
      }

      // Taleo
      if (host.includes('taleo.net')) {
        const reqId = u.searchParams.get('requisitionId');
        if (reqId) return { jobId: 'tl_' + reqId, rawJobId: reqId, platform: 'Taleo', siteType: 'employer' };
      }

      // iCIMS
      if (host.includes('icims.com')) {
        m = path.match(/\/jobs\/(\d+)\//);
        if (m) return { jobId: 'ic_' + m[1], rawJobId: m[1], platform: 'iCIMS', siteType: 'employer' };
      }

      // BambooHR
      if (host.includes('bamboohr.com')) {
        m = path.match(/\/(\d+)\/apply/);
        if (m) return { jobId: 'bhr_' + m[1], rawJobId: m[1], platform: 'BambooHR', siteType: 'employer' };
      }

      // Jobvite
      if (host.includes('jobvite.com')) {
        const j = u.searchParams.get('j');
        if (j) return { jobId: 'jv_' + j, rawJobId: j, platform: 'Jobvite', siteType: 'employer' };
      }

      // Workable
      m = path.match(/\/j\/([A-Z0-9]+)/i);
      if (m && host.includes('workable')) return { jobId: 'wk_' + m[1], rawJobId: m[1], platform: 'Workable', siteType: 'employer' };

      // Breezy
      if (host.includes('breezy.hr')) {
        m = path.match(/\/p\/([a-z0-9]+)/i);
        if (m) return { jobId: 'bz_' + m[1], rawJobId: m[1], platform: 'Breezy', siteType: 'employer' };
      }

      // ─── NEW v3 platforms ───

      // Glassdoor
      if (host.includes('glassdoor.co') || host.includes('glassdoor.com')) {
        m = full.match(/[?&]jl=(\d+)/);
        if (m) return { jobId: 'gd_' + m[1], rawJobId: m[1], platform: 'Glassdoor', siteType: 'aggregator' };
        m = path.match(/-JV(\d+)/);
        if (m) return { jobId: 'gd_' + m[1], rawJobId: m[1], platform: 'Glassdoor', siteType: 'aggregator' };
      }

      // Naukri (additional pattern: jobId param)
      if (host.includes('naukri.com')) {
        const nkId = u.searchParams.get('jobId');
        if (nkId) return { jobId: 'nk_' + nkId, rawJobId: nkId, platform: 'Naukri', siteType: 'aggregator' };
      }

      // Internshala
      if (host.includes('internshala.com')) {
        m = path.match(/\/(?:internship|job)\/detail\/[^\/]+-(\d+)/);
        if (m) return { jobId: 'is_' + m[1], rawJobId: m[1], platform: 'Internshala', siteType: 'aggregator' };
        const isId = u.searchParams.get('internship_id');
        if (isId) return { jobId: 'is_' + isId, rawJobId: isId, platform: 'Internshala', siteType: 'aggregator' };
      }

      // Unstop
      if (host.includes('unstop.com')) {
        m = path.match(/\/opportunity\/[^\/]+-(\d+)/);
        if (m) return { jobId: 'un_' + m[1], rawJobId: m[1], platform: 'Unstop', siteType: 'aggregator' };
      }

      // Cutshort
      if (host.includes('cutshort.io')) {
        m = path.match(/\/jobs\/[^\/]+\/([a-zA-Z0-9_-]{6,})/);
        if (m) return { jobId: 'cs_' + m[1], rawJobId: m[1], platform: 'Cutshort', siteType: 'employer' };
      }

      // Hirist
      if (host.includes('hirist.tech')) {
        m = path.match(/-(\d{5,})$/);
        if (m) return { jobId: 'hi_' + m[1], rawJobId: m[1], platform: 'Hirist', siteType: 'aggregator' };
      }

      // Instahyre
      if (host.includes('instahyre.com')) {
        m = path.match(/\/job\/[^\/]+-([a-z0-9]{8,})/);
        if (m) return { jobId: 'ih_' + m[1], rawJobId: m[1], platform: 'Instahyre', siteType: 'aggregator' };
      }

      // Foundit (ex-Monster India)
      if (host.includes('foundit.in')) {
        m = path.match(/-(\d{7,})\.html/);
        if (m) return { jobId: 'fi_' + m[1], rawJobId: m[1], platform: 'Foundit', siteType: 'aggregator' };
        const fiId = u.searchParams.get('jobId');
        if (fiId) return { jobId: 'fi_' + fiId, rawJobId: fiId, platform: 'Foundit', siteType: 'aggregator' };
      }

      // SimplyHired
      if (host.includes('simplyhired.co.in')) {
        m = path.match(/\/job\/[^\/]+-([a-z0-9\-]{8,})\//i);
        if (m) return { jobId: 'sh_' + m[1], rawJobId: m[1], platform: 'SimplyHired', siteType: 'aggregator' };
      }

      // WorkAtStartup (YC)
      if (host.includes('workatastartup.com')) {
        m = path.match(/\/jobs\/(\d+)/);
        if (m) return { jobId: 'was_' + m[1], rawJobId: m[1], platform: 'WorkAtStartup', siteType: 'aggregator' };
      }

      // Uplers
      if (host.includes('uplers.com')) {
        m = path.match(/\/job\/[^\/]+-(\d+)/);
        if (m) return { jobId: 'up_' + m[1], rawJobId: m[1], platform: 'Uplers', siteType: 'aggregator' };
      }

      // Generic UUID
      m = full.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (m) return { jobId: 'xx_' + m[1], rawJobId: m[1], platform: 'Other', siteType: 'employer' };

      // Generic number (5-10 digits in path or query)
      m = path.match(/[\/\-_](\d{5,10})(?:[\/\?&]|$)/);
      if (m) return { jobId: 'xx_' + m[1], rawJobId: m[1], platform: 'Other', siteType: 'employer' };

    } catch { /* ignore */ }

    return { jobId: null, rawJobId: null, platform: 'Other', siteType: 'employer' };
  }

  /* ═══════════════════════════════
     ROLE & COMPANY (Signal Waterfall, Section 3D)
     ═══════════════════════════════ */

  function extractRoleAndCompany() {
    let role = '', company = '', location = '';

    // --- SIGNAL 1: JSON-LD ---
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        try {
          let data = JSON.parse(s.textContent);
          // Handle arrays
          if (Array.isArray(data)) data = data.find(d => d['@type'] === 'JobPosting') || data[0];
          if (data && data['@type'] === 'JobPosting') {
            role = (data.title || '').trim();
            company = (data.hiringOrganization?.name || '').trim();
            const loc = data.jobLocation;
            if (loc) {
              const addr = loc.address || loc;
              const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean);
              location = parts.join(', ');
            }
            if (role.length > 3) return { role, company, location };
          }
        } catch { /* skip malformed JSON-LD */ }
      }
    } catch { /* ignore */ }

    // --- SIGNAL 2: Meta Tags ---
    try {
      const ogTitle = getMeta('og:title');
      if (ogTitle && ogTitle.length > 3) {
        role = ogTitle
          .replace(/\s*(at\s+.+|[\|–—-]\s*.+)$/i, '')
          .replace(/^(Apply for|Job:\s*)/i, '')
          .trim();
      }
      company = company || getMeta('og:site_name') || '';
      location = location || getMeta('geo.placename') || getMeta('location') || '';
      if (role.length > 3) return { role, company, location };
    } catch { /* ignore */ }

    // --- SIGNAL 3: DOM Heuristic (scored) ---
    try {
      const candidates = document.querySelectorAll('h1, h2');
      let bestScore = -10, bestText = '';

      candidates.forEach(el => {
        const text = (el.textContent || '').trim();
        if (!text) return;
        let score = 0;

        if (el.tagName === 'H1') score += 3;
        else score += 1; // H2

        const attrs = ((el.className || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
        if (/job|title|position|role|opening|posting/.test(attrs)) score += 2;

        if (text.length >= 10 && text.length <= 80) score += 1;

        if (/apply|login|sign in|search|careers at|jobs at/i.test(text)) score -= 2;
        if (text === text.toUpperCase() || text.length < 5) score -= 3;

        if (score > bestScore) { bestScore = score; bestText = text; }
      });

      if (bestText && bestText.length > 3) role = role || bestText;
    } catch { /* ignore */ }

    // Company from DOM if not found yet
    if (!company) company = extractCompanyFromDOM();

    // Location from DOM if not found yet
    if (!location) location = extractLocationFromDOM();

    return { role: role || '', company: company || '', location: location || '' };
  }

  function extractCompanyFromDOM() {
    // (a) itemprop / aria-label
    try {
      const itemprop = document.querySelector('[itemprop="name"]');
      if (itemprop) { const t = itemprop.textContent.trim(); if (t.length > 1 && t.length < 100) return t; }
    } catch { /* ignore */ }

    // (b) First subdomain (strip common prefixes)
    try {
      const host = window.location.hostname;
      const parts = host.split('.');
      const strip = ['www', 'jobs', 'careers', 'apply', 'boards', 'hiring', 'hire'];
      const cleaned = parts.filter(p => !strip.includes(p) && p.length > 1);
      if (cleaned.length > 0 && !['com', 'org', 'net', 'io', 'co'].includes(cleaned[0])) {
        const name = cleaned[0];
        // Skip generic ATS domains
        if (!['greenhouse', 'lever', 'smartrecruiters', 'ashbyhq', 'workday',
              'myworkdayjobs', 'icims', 'taleo', 'bamboohr', 'jobvite',
              'workable', 'breezy', 'rippling'].includes(name)) {
          return capitalize(name);
        }
      }
    } catch { /* ignore */ }

    // (c) Elements with company-related class/id
    try {
      const selectors = ['[class*="company"]', '[class*="employer"]', '[class*="org"]', '[class*="brand"]',
                          '[id*="company"]', '[id*="employer"]'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) { const t = el.textContent.trim(); if (t.length > 1 && t.length < 100) return t; }
      }
    } catch { /* ignore */ }

    return '';
  }

  function extractLocationFromDOM() {
    try {
      const selectors = [
        '[class*="location"]', '[class*="city"]', '[itemprop="addressLocality"]',
        '[data-automation-id*="location"]', '.job-location', '.posting-location',
        '[class*="place"]'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) { const t = el.textContent.trim(); if (t.length > 2 && t.length < 150) return t; }
      }
    } catch { /* ignore */ }
    return '';
  }

  function getMeta(name) {
    const el = document.querySelector(`meta[property="${name}"]`) ||
               document.querySelector(`meta[name="${name}"]`);
    return el ? (el.getAttribute('content') || '').trim() : '';
  }

  /* ═══════════════════════════════
     JD TEXT EXTRACTION (Section 3F)
     ═══════════════════════════════ */

  function getJDText() {
    const selectors = [
      '[data-automation-id="jobPostingDescription"]',
      '.show-more-less-html__markup',
      '.jobs-description-content',
      '.posting-requirements',
      '[class*="description"]', '[id*="description"]',
      '[class*="job-desc"]', '[id*="job-desc"]',
      'article', 'main',
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.innerText.trim().length > 200) return el.innerText;
      } catch { /* skip */ }
    }
    // Fallback: largest text block under 15000 chars
    let best = '', bestLen = 0;
    try {
      document.querySelectorAll('div, section, article').forEach(el => {
        const t = el.innerText?.trim() || '';
        if (t.length > bestLen && t.length < 15000) { bestLen = t.length; best = t; }
      });
    } catch { /* ignore */ }
    return best;
  }

  /* ═══════════════════════════════
     KEYWORD EXTRACTION (Section 4)
     ═══════════════════════════════ */

  const SKILL_CATEGORIES = {
    languages:   ['python','java','javascript','typescript','c++','c#','golang',
                  'rust','kotlin','swift','ruby','php','scala','r','bash','sql',
                  'html','css','dart','matlab'],
    frameworks:  ['react','angular','vue','node.js','express','django','flask',
                  'fastapi','spring boot','spring','laravel','next.js','nuxt',
                  'svelte','redux','graphql','rest','restful','tailwind'],
    cloud_devops:['aws','azure','gcp','google cloud','docker','kubernetes','k8s',
                  'terraform','ci/cd','github actions','jenkins','ansible',
                  'linux','nginx','microservices','kafka','rabbitmq','redis',
                  'elasticsearch'],
    data_ml:     ['machine learning','deep learning','tensorflow','pytorch',
                  'pandas','numpy','scikit-learn','spark','hadoop','tableau',
                  'power bi','etl','nlp','computer vision','llm','langchain',
                  'hugging face','transformers'],
    databases:   ['mysql','postgresql','postgres','mongodb','redis','firebase',
                  'dynamodb','cassandra','oracle','sqlite','snowflake','bigquery'],
    tools:       ['git','github','gitlab','jira','confluence','postman','figma',
                  'vs code','agile','scrum','kanban'],
  };

  function extractJDKeywords(text) {
    if (!text || text.length < 50) return { mustHave: [], niceToHave: [], byCategory: {}, experienceLevel: '', yearsRequired: [] };

    const lower = text.toLowerCase();

    // Split into required vs preferred sections
    const reqMarkers  = ['required', 'must have', 'essential', 'mandatory', 'you will need'];
    const prefMarkers = ['preferred', 'nice to have', 'bonus', 'plus', 'good to have', 'desirable'];

    function getSection(markers) {
      for (const m of markers) {
        const i = lower.indexOf(m);
        if (i !== -1) return lower.slice(i, i + 1200);
      }
      return null;
    }

    const reqSection  = getSection(reqMarkers);
    const prefSection = getSection(prefMarkers);
    const found = {};
    const mustHave = [], niceToHave = [];

    for (const [cat, words] of Object.entries(SKILL_CATEGORIES)) {
      found[cat] = [];
      for (const w of words) {
        const re = new RegExp(`\\b${w.replace(/[.+]/g, '\\$&')}\\b`, 'i');
        if (!re.test(text)) continue;
        found[cat].push(w);
        if (reqSection && re.test(reqSection)) { mustHave.push(w); continue; }
        if (prefSection && re.test(prefSection)) { niceToHave.push(w); continue; }
        mustHave.push(w); // default to required if no section structure
      }
    }

    // Experience signals
    const yearMatches = (lower.match(/(\d+)\+?\s*years?/g) || []);
    let level = 'Mid-level';
    if (lower.includes('senior') || lower.includes('sr.')) level = 'Senior';
    else if (lower.includes('junior') || lower.includes('jr.')) level = 'Junior';
    else if (lower.includes('lead') || lower.includes('staff')) level = 'Lead/Staff';
    else if (lower.includes('intern') || lower.includes('fresher') || lower.includes('entry')) level = 'Entry/Intern';

    return {
      byCategory: found,
      mustHave: [...new Set(mustHave)],
      niceToHave: [...new Set(niceToHave)],
      experienceLevel: level,
      yearsRequired: [...new Set(yearMatches)],
    };
  }

  /* ═══════════════════════════════
     MAIN SCRAPE (combines everything)
     ═══════════════════════════════ */

  function scrapeAll() {
    const url = window.location.href;
    const canonicalUrl = normalizeUrl(url);
    let result = {
      company: '', role: '', rawJobId: null, jobId: null,
      location: '', source: 'Direct', platform: 'Other', siteType: 'employer',
      platformCategory: 'Other', jobType: 'Unknown', workMode: 'Unknown',
      stipend: '', duration: '', jobDescription: '',
      canonicalUrl, scrapeQuality: 'failed', keywords: null
    };

    try {
      // ─── Platform info from hostname ───
      const platInfo = getPlatformInfo(window.location.hostname, window.location.pathname);

      // ─── Priority 1: Workday URL parsing ───
      const wd = parseWorkdayUrl(url);
      if (wd) {
        result = { ...result, ...wd, ...platInfo, canonicalUrl, scrapeQuality: 'full' };
      } else {
        // ─── Extract Job ID from URL ───
        const idResult = extractJobId(url);
        result.jobId = idResult.jobId;
        result.rawJobId = idResult.rawJobId;
        result.platform = platInfo.platform !== 'Other' ? platInfo.platform : idResult.platform;
        result.siteType = platInfo.siteType;
        result.platformCategory = platInfo.platformCategory;

        // ─── Source detection ───
        result.source = detectSource(url);

        // ─── Role, Company, Location from page ───
        const pageData = extractRoleAndCompany();
        result.role = pageData.role;
        result.company = pageData.company;
        result.location = pageData.location;

        // Set scrape quality
        if (result.role && result.company) result.scrapeQuality = 'full';
        else if (result.role || result.company) result.scrapeQuality = 'partial';
        else result.scrapeQuality = 'failed';
      }

      // ─── JD Text extraction (used for keywords, job type, work mode) ───
      let jdText = '';
      try {
        jdText = getJDText();
        if (jdText.length > 100) {
          result.keywords = extractJDKeywords(jdText);
          result.jobDescription = jdText.substring(0, 8000); // Cap at 8KB
        }
      } catch { /* silently skip */ }

      // ─── Job type & work mode detection ───
      result.jobType = detectJobType(result.role, jdText);
      result.workMode = detectWorkMode(jdText);

      // ─── Stipend & duration (for internships/contracts) ───
      if (result.jobType === 'Internship' || result.jobType === 'Contract') {
        result.stipend = extractStipend(jdText);
        result.duration = extractDuration(jdText);
      }

      // ─── Fallback requisition ID from DOM/page text ───
      if (!result.rawJobId) {
        try {
          const domReqId = extractReqIdFromDOM();
          if (domReqId) {
            result.rawJobId = domReqId;
            result.jobId = result.jobId || ('dom_' + domReqId);
          }
        } catch { /* ignore */ }
      }

    } catch (e) {
      result.scrapeQuality = 'failed';
    }

    return result;
  }

  /* ═══════════════════════════════
     TIMING: SPA + JS-Rendered Pages (Section 3G)
     ═══════════════════════════════ */

  function tryExtract(attemptsLeft) {
    const result = scrapeAll();
    if ((result.role && result.role.length > 3) || attemptsLeft <= 0) {
      // Store for content.js to retrieve
      window.__jobTrackrData = result;
      try {
        chrome.runtime.sendMessage({ type: 'SCRAPED_DATA', data: result });
      } catch { /* popup not open yet, that's expected */ }
      return;
    }
    setTimeout(() => tryExtract(attemptsLeft - 1), 600);
  }

  // Only run in browser context
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => tryExtract(8));
    } else {
      tryExtract(8);
    }

    // SPA navigation detection (Workday, Lever use pushState)
    let lastUrl = location.href;
    try {
      new MutationObserver(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          setTimeout(() => tryExtract(8), 800);
        }
      }).observe(document.body, { childList: true, subtree: true });
    } catch { /* body not available yet, safe to ignore */ }

    // Expose for content.js message handler
    window.__jobTrackrScraper = { scrapeAll, extractJobId, normalizeUrl, parseWorkdayUrl, extractJDKeywords, detectSource, detectJobType, detectWorkMode, extractStipend, extractDuration, extractRequisitionId, getPlatformInfo };
  }

})();

/* ─── Exports for Node.js testing ─── */
if (typeof module !== 'undefined' && module.exports) {
  // Re-define functions for Node context (no DOM, no window)
  const STRIP_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
    'refId', 'trk', 'trkInfo', 'lipi', 'trackingId',
    'fbclid', 'gclid', 'msclkid', 'mc_cid', '_hsenc', '_hsmi'
  ];
  const SOURCE_MAP = {
    'linkedin': 'LinkedIn', 'naukri': 'Naukri', 'indeed': 'Indeed',
    'glassdoor': 'Glassdoor', 'wellfound': 'Wellfound', 'angellist': 'Wellfound',
    'direct': 'Direct', 'internshala': 'Internshala', 'unstop': 'Unstop',
    'cutshort': 'Cutshort', 'foundit': 'Foundit', 'instahyre': 'Instahyre',
    'hirist': 'Hirist', 'simplyhired': 'SimplyHired'
  };
  const PLATFORM_MAP = [
    { match: 'linkedin.com', name: 'LinkedIn', category: 'Aggregator', type: 'aggregator' },
    { match: 'glassdoor.co.in', name: 'Glassdoor', category: 'Aggregator', type: 'aggregator' },
    { match: 'glassdoor.com', name: 'Glassdoor', category: 'Aggregator', type: 'aggregator' },
    { match: 'indeed.com', name: 'Indeed', category: 'Aggregator', type: 'aggregator' },
    { match: 'naukri.com', name: 'Naukri', category: 'Aggregator', type: 'aggregator' },
    { match: 'foundit.in', name: 'Foundit', category: 'Aggregator', type: 'aggregator' },
    { match: 'simplyhired.co.in', name: 'SimplyHired', category: 'Aggregator', type: 'aggregator' },
    { match: 'wellfound.com', name: 'Wellfound', category: 'Startup', type: 'employer' },
    { match: 'angel.co', name: 'Wellfound', category: 'Startup', type: 'employer' },
    { match: 'cutshort.io', name: 'Cutshort', category: 'Startup', type: 'employer' },
    { match: 'workatastartup.com', name: 'WorkAtStartup', category: 'Startup', type: 'aggregator' },
    { match: 'instahyre.com', name: 'Instahyre', category: 'Startup', type: 'aggregator' },
    { match: 'hirist.tech', name: 'Hirist', category: 'Startup', type: 'aggregator' },
    { match: 'internshala.com', name: 'Internshala', category: 'Fresher', type: 'aggregator' },
    { match: 'unstop.com', name: 'Unstop', category: 'Fresher', type: 'aggregator' },
    { match: 'uplers.com', name: 'Uplers', category: 'Other', type: 'aggregator' },
    { match: 'myworkdayjobs.com', name: 'Workday', category: 'Career', type: 'employer' },
    { match: 'myworkday.com', name: 'Workday', category: 'Career', type: 'employer' },
    { match: 'greenhouse.io', name: 'Greenhouse', category: 'Career', type: 'employer' },
    { match: 'lever.co', name: 'Lever', category: 'Career', type: 'employer' },
    { match: 'smartrecruiters.com', name: 'SmartRecruiters', category: 'Career', type: 'employer' },
    { match: 'ashbyhq.com', name: 'Ashby', category: 'Career', type: 'employer' },
    { match: 'rippling.com', name: 'Rippling', category: 'Career', type: 'employer' },
    { match: 'icims.com', name: 'iCIMS', category: 'Career', type: 'employer' },
    { match: 'bamboohr.com', name: 'BambooHR', category: 'Career', type: 'employer' },
    { match: 'jobvite.com', name: 'Jobvite', category: 'Career', type: 'employer' },
    { match: 'taleo.net', name: 'Taleo', category: 'Career', type: 'employer' },
    { match: 'breezy.hr', name: 'Breezy', category: 'Career', type: 'employer' },
    { match: 'workable.com', name: 'Workable', category: 'Career', type: 'employer' },
  ];
  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
  function normalizeUrl(url) {
    try {
      const u = new URL(url);
      STRIP_PARAMS.forEach(p => u.searchParams.delete(p));
      u.hash = '';
      u.searchParams.sort();
      return u.origin + u.pathname.replace(/\/+$/, '') + (u.search || '');
    } catch { return url; }
  }
  function parseWorkdayUrl(url) {
    try {
      const u = new URL(url);
      if (!u.hostname.includes('myworkdayjobs') && !u.hostname.includes('myworkday')) return null;
      const company = u.hostname.split('.')[0];
      const parts = u.pathname.split('/').filter(Boolean);
      const locationSlug = parts[2] || '';
      const roleAndId = parts[3] || '';
      const locationClean = locationSlug.replace(/-/g, ', ');
      const lastUs = roleAndId.lastIndexOf('_');
      const rawJobId = lastUs !== -1 ? roleAndId.slice(lastUs + 1) : '';
      const roleSlug = lastUs !== -1 ? roleAndId.slice(0, lastUs) : roleAndId;
      const role = roleSlug.replace(/-/g, ' ');
      const source = u.searchParams.get('source') || 'Direct';
      return {
        company: capitalize(company), role, rawJobId,
        jobId: rawJobId ? 'wd_' + rawJobId : null,
        location: locationClean,
        source: SOURCE_MAP[source.toLowerCase()] || capitalize(source),
        platform: 'Workday', siteType: 'employer',
      };
    } catch { return null; }
  }
  function extractJobId(url) {
    if (!url) return { jobId: null, rawJobId: null, platform: 'Other', siteType: 'employer' };
    try {
      const u = new URL(url);
      const host = u.hostname;
      const path = u.pathname;
      const full = url;

      if (host.includes('myworkdayjobs') || host.includes('myworkday')) {
        const wd = parseWorkdayUrl(url);
        if (wd) return { jobId: wd.jobId, rawJobId: wd.rawJobId, platform: 'Workday', siteType: 'employer' };
      }
      if (host.includes('greenhouse.io')) {
        let m = u.searchParams.get('gh_jid');
        if (m) return { jobId: 'gh_' + m, rawJobId: m, platform: 'Greenhouse', siteType: 'employer' };
        m = path.match(/\/jobs\/(\d+)/);
        if (m) return { jobId: 'gh_' + m[1], rawJobId: m[1], platform: 'Greenhouse', siteType: 'employer' };
      }
      let m = full.match(/jobs\.lever\.co\/[^\/]+\/([a-f0-9\-]{36})/i);
      if (m) return { jobId: 'lv_' + m[1], rawJobId: m[1], platform: 'Lever', siteType: 'employer' };
      m = full.match(/jobs\.smartrecruiters\.com\/[^\/]+\/([A-Z0-9]+)/i);
      if (m) return { jobId: 'sr_' + m[1], rawJobId: m[1], platform: 'SmartRecruiters', siteType: 'employer' };
      if (host.includes('indeed.com')) {
        const jk = u.searchParams.get('jk');
        if (jk) return { jobId: 'in_' + jk, rawJobId: jk, platform: 'Indeed', siteType: 'aggregator' };
      }
      if (host.includes('linkedin.com')) {
        m = path.match(/\/jobs\/view\/(\d{8,})/);
        if (m) return { jobId: 'li_' + m[1], rawJobId: m[1], platform: 'LinkedIn', siteType: 'aggregator' };
      }
      if (host.includes('naukri.com')) {
        m = path.match(/-(\d{6,10})\.html$/);
        if (m) return { jobId: 'nk_' + m[1], rawJobId: m[1], platform: 'Naukri', siteType: 'aggregator' };
      }
      if (host.includes('wellfound.com') || host.includes('angel.co')) {
        m = path.match(/\/jobs\/(\d+)/);
        if (m) return { jobId: 'wf_' + m[1], rawJobId: m[1], platform: 'Wellfound', siteType: 'employer' };
      }
      m = full.match(/jobs\.ashbyhq\.com\/[^\/]+\/([a-f0-9\-]{36})/i);
      if (m) return { jobId: 'ash_' + m[1], rawJobId: m[1], platform: 'Ashby', siteType: 'employer' };
      if (host.includes('rippling.com')) {
        m = path.match(/\/jobs\/([A-Z0-9\-]+)$/i);
        if (m) return { jobId: 'rp_' + m[1], rawJobId: m[1], platform: 'Rippling', siteType: 'employer' };
      }
      if (host.includes('taleo.net')) {
        const reqId = u.searchParams.get('requisitionId');
        if (reqId) return { jobId: 'tl_' + reqId, rawJobId: reqId, platform: 'Taleo', siteType: 'employer' };
      }
      if (host.includes('icims.com')) {
        m = path.match(/\/jobs\/(\d+)\//);
        if (m) return { jobId: 'ic_' + m[1], rawJobId: m[1], platform: 'iCIMS', siteType: 'employer' };
      }
      if (host.includes('bamboohr.com')) {
        m = path.match(/\/(\d+)\/apply/);
        if (m) return { jobId: 'bhr_' + m[1], rawJobId: m[1], platform: 'BambooHR', siteType: 'employer' };
      }
      if (host.includes('jobvite.com')) {
        const j = u.searchParams.get('j');
        if (j) return { jobId: 'jv_' + j, rawJobId: j, platform: 'Jobvite', siteType: 'employer' };
      }
      m = path.match(/\/j\/([A-Z0-9]+)/i);
      if (m && host.includes('workable')) return { jobId: 'wk_' + m[1], rawJobId: m[1], platform: 'Workable', siteType: 'employer' };
      if (host.includes('breezy.hr')) {
        m = path.match(/\/p\/([a-z0-9]+)/i);
        if (m) return { jobId: 'bz_' + m[1], rawJobId: m[1], platform: 'Breezy', siteType: 'employer' };
      }
      // ─── v3 new platforms ───
      if (host.includes('glassdoor.co') || host.includes('glassdoor.com')) {
        m = full.match(/[?&]jl=(\d+)/);
        if (m) return { jobId: 'gd_' + m[1], rawJobId: m[1], platform: 'Glassdoor', siteType: 'aggregator' };
        m = path.match(/-JV(\d+)/);
        if (m) return { jobId: 'gd_' + m[1], rawJobId: m[1], platform: 'Glassdoor', siteType: 'aggregator' };
      }
      if (host.includes('naukri.com')) {
        const nkId = u.searchParams.get('jobId');
        if (nkId) return { jobId: 'nk_' + nkId, rawJobId: nkId, platform: 'Naukri', siteType: 'aggregator' };
      }
      if (host.includes('internshala.com')) {
        m = path.match(/\/(?:internship|job)\/detail\/[^\/]+-(\d+)/);
        if (m) return { jobId: 'is_' + m[1], rawJobId: m[1], platform: 'Internshala', siteType: 'aggregator' };
      }
      if (host.includes('unstop.com')) {
        m = path.match(/\/opportunity\/[^\/]+-(\d+)/);
        if (m) return { jobId: 'un_' + m[1], rawJobId: m[1], platform: 'Unstop', siteType: 'aggregator' };
      }
      if (host.includes('cutshort.io')) {
        m = path.match(/\/jobs\/[^\/]+\/([a-zA-Z0-9_-]{6,})/);
        if (m) return { jobId: 'cs_' + m[1], rawJobId: m[1], platform: 'Cutshort', siteType: 'employer' };
      }
      if (host.includes('hirist.tech')) {
        m = path.match(/-(\d{5,})$/);
        if (m) return { jobId: 'hi_' + m[1], rawJobId: m[1], platform: 'Hirist', siteType: 'aggregator' };
      }
      if (host.includes('instahyre.com')) {
        m = path.match(/\/job\/[^\/]+-([a-z0-9]{8,})/);
        if (m) return { jobId: 'ih_' + m[1], rawJobId: m[1], platform: 'Instahyre', siteType: 'aggregator' };
      }
      if (host.includes('foundit.in')) {
        m = path.match(/-(\d{7,})\.html/);
        if (m) return { jobId: 'fi_' + m[1], rawJobId: m[1], platform: 'Foundit', siteType: 'aggregator' };
      }
      if (host.includes('simplyhired.co.in')) {
        m = path.match(/\/job\/[^\/]+-([a-z0-9\-]{8,})\//i);
        if (m) return { jobId: 'sh_' + m[1], rawJobId: m[1], platform: 'SimplyHired', siteType: 'aggregator' };
      }
      if (host.includes('workatastartup.com')) {
        m = path.match(/\/jobs\/(\d+)/);
        if (m) return { jobId: 'was_' + m[1], rawJobId: m[1], platform: 'WorkAtStartup', siteType: 'aggregator' };
      }
      if (host.includes('uplers.com')) {
        m = path.match(/\/job\/[^\/]+-(\d+)/);
        if (m) return { jobId: 'up_' + m[1], rawJobId: m[1], platform: 'Uplers', siteType: 'aggregator' };
      }
      m = full.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (m) return { jobId: 'xx_' + m[1], rawJobId: m[1], platform: 'Other', siteType: 'employer' };
      m = path.match(/[\/\-_](\d{5,10})(?:[\/\?&]|$)/);
      if (m) return { jobId: 'xx_' + m[1], rawJobId: m[1], platform: 'Other', siteType: 'employer' };
    } catch { /* ignore */ }
    return { jobId: null, rawJobId: null, platform: 'Other', siteType: 'employer' };
  }
  function detectSource(url) {
    try {
      const u = new URL(url);
      const params = ['source', 'ref', 'utm_source', 'from', 'referer', 'referrer', 'via'];
      for (const p of params) {
        const val = u.searchParams.get(p);
        if (val) return SOURCE_MAP[val.toLowerCase().trim()] || capitalize(val);
      }
    } catch { /* ignore */ }
    return 'Direct';
  }
  function getPlatformInfo(hostname, pathname) {
    pathname = pathname || '';
    for (const p of PLATFORM_MAP) {
      if (hostname.includes(p.match)) {
        return { platform: p.name, platformCategory: p.category, siteType: p.type };
      }
    }
    if (hostname.startsWith('careers.') || hostname.includes('.careers.') || pathname.includes('/careers') || pathname.includes('/jobs') || pathname.includes('/work-with-us') || pathname.includes('/join-us') || pathname.includes('/openings')) {
      return { platform: 'Career Page', platformCategory: 'Career', siteType: 'employer' };
    }
    return { platform: 'Other', platformCategory: 'Other', siteType: 'employer' };
  }
  function detectJobType(roleText, jdText) {
    const role = (roleText || '').toLowerCase();
    const jd = (jdText || '').toLowerCase();
    if (/\bintern\b|_intern\b|-intern\b|\binternship\b|\btrainee\b|\bapprentice\b/i.test(role)) return 'Internship';
    if (/\bcontract\b|\bcontractor\b|\bconsultant\b|\bfreelance\b|\btemp\b|\btemporary\b/i.test(role)) return 'Contract';
    if (/\binternship\b|\bintern position\b|\bintern role\b|\bstipend\b|\bduration:\s*\d+\s*months?\b|\bcollege students\b|\bfinal year\b|\bundergraduate\b|\bpursuing b\.?tech\b|\bpursuing degree\b/i.test(jd)) return 'Internship';
    if (/\bcontract role\b|\bcontractual\b|\bfixed term\b|\b\d+-month contract\b|\bcontract to hire\b|\bc2h\b|\bthird party payroll\b/i.test(jd)) return 'Contract';
    if (/\bpart[- ]?time\b|\b20 hours\b|\bweekends only\b/i.test(jd)) return 'Part-time';
    if (/\bsde\b|\bswe\b|\bengineer\b|\bdeveloper\b|\banalyst\b|\bassociate\b|\bmanager\b|\blead\b|\barchitect\b/i.test(role)) return 'Full-time';
    if (jd.length > 100) return 'Full-time';
    return 'Unknown';
  }
  function detectWorkMode(jdText) {
    const jd = (jdText || '').toLowerCase();
    if (!jd || jd.length < 30) return 'Unknown';
    if (/\bfully remote\b|\b100% remote\b|\bremote[- ]?first\b|\bdistributed team\b|\banywhere in india\b/i.test(jd)) return 'Remote';
    if (/\bwork from home\b|\bwfh\b/i.test(jd)) return 'Remote';
    if (/\bhybrid\b|\b[23] days? office\b|\bpartial remote\b|\bflexible work\b|\bhybrid model\b|\bwork from office\s*\/\s*home\b/i.test(jd)) return 'Hybrid';
    if (/\bon[- ]?site\b|\bonsite\b|\bin[- ]?office\b|\boffice only\b|\bwork from office\b|\bno remote\b|\bmust relocate\b/i.test(jd)) return 'On-site';
    if (/\bremote\b/i.test(jd) && !/\bno remote\b|\bnot remote\b/i.test(jd)) return 'Remote';
    return 'Unknown';
  }
  function extractStipend(jdText) {
    if (!jdText) return '';
    const m = jdText.match(/(?:stipend|salary|ctc|compensation)[:\s]+([₹$]?[\d,]+(?:\s*[-–]\s*[\d,]+)?(?:\s*(?:lpa|\/month|per month|k\/month|k))?)/i);
    if (m) return m[1].trim();
    const m2 = jdText.match(/(?:₹|INR|Rs\.?)\s*[\d,]+(?:\s*[-–]\s*[\d,]+)?(?:\s*(?:lpa|\/month|per month))?/i);
    if (m2) return m2[0].trim();
    return '';
  }
  function extractDuration(jdText) {
    if (!jdText) return '';
    const m = jdText.match(/duration[:\s]+(\d+\s*(?:months?|weeks?|years?))/i);
    if (m) return m[1].trim();
    const m2 = jdText.match(/(\d+)[- ](?:month|week|year)\s+(?:internship|contract|program)/i);
    if (m2) return m2[1].trim() + ' month';
    return '';
  }
  const REQ_LABELS = [
    'job id', 'job_id', 'job-id', 'jobid',
    'requisition id', 'requisition_id', 'req id', 'req_id', 'req-id', 'reqid',
    'req no', 'req no.', 'req number', 'requisition no', 'requisition number',
    'reference id', 'ref id', 'ref_id', 'ref code', 'refcode', 'ref no',
    'vacancy code', 'vacancy id', 'vacancy no',
    'job number', 'job no', 'job no.',
    'position id', 'position no', 'position number',
    'opening id', 'opening no',
    'job code', 'job ref',
    'posting id', 'posting number',
    'application id',
  ];
  function extractRequisitionId(pageText) {
    if (!pageText) return null;
    for (const label of REQ_LABELS) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped + '[:\\s#\\-]+([A-Z0-9][A-Z0-9\\-_/]{2,24})', 'i');
      const m = pageText.match(re);
      if (m) return m[1].trim();
    }
    return null;
  }
  function extractJDKeywords(text) {
    const SKILL_CATEGORIES = {
      languages:['python','java','javascript','typescript','c++','c#','golang','rust','kotlin','swift','ruby','php','scala','r','bash','sql','html','css','dart','matlab'],
      frameworks:['react','angular','vue','node.js','express','django','flask','fastapi','spring boot','spring','laravel','next.js','nuxt','svelte','redux','graphql','rest','restful','tailwind'],
      cloud_devops:['aws','azure','gcp','google cloud','docker','kubernetes','k8s','terraform','ci/cd','github actions','jenkins','ansible','linux','nginx','microservices','kafka','rabbitmq','redis','elasticsearch'],
      data_ml:['machine learning','deep learning','tensorflow','pytorch','pandas','numpy','scikit-learn','spark','hadoop','tableau','power bi','etl','nlp','computer vision','llm','langchain','hugging face','transformers'],
      databases:['mysql','postgresql','postgres','mongodb','redis','firebase','dynamodb','cassandra','oracle','sqlite','snowflake','bigquery'],
      tools:['git','github','gitlab','jira','confluence','postman','figma','vs code','agile','scrum','kanban'],
    };
    if (!text || text.length < 50) return { mustHave: [], niceToHave: [], byCategory: {}, experienceLevel: '', yearsRequired: [] };
    const lower = text.toLowerCase();
    const reqMarkers = ['required','must have','essential','mandatory','you will need'];
    const prefMarkers = ['preferred','nice to have','bonus','plus','good to have','desirable'];
    function getSection(markers) { for (const m of markers) { const i = lower.indexOf(m); if (i !== -1) return lower.slice(i, i + 1200); } return null; }
    const reqSection = getSection(reqMarkers), prefSection = getSection(prefMarkers);
    const found = {}, mustHave = [], niceToHave = [];
    for (const [cat, words] of Object.entries(SKILL_CATEGORIES)) {
      found[cat] = [];
      for (const w of words) {
        const re = new RegExp(`\\b${w.replace(/[.+]/g, '\\$&')}\\b`, 'i');
        if (!re.test(text)) continue;
        found[cat].push(w);
        if (reqSection && re.test(reqSection)) { mustHave.push(w); continue; }
        if (prefSection && re.test(prefSection)) { niceToHave.push(w); continue; }
        mustHave.push(w);
      }
    }
    const yearMatches = (lower.match(/(\d+)\+?\s*years?/g) || []);
    let level = 'Mid-level';
    if (lower.includes('senior') || lower.includes('sr.')) level = 'Senior';
    else if (lower.includes('junior') || lower.includes('jr.')) level = 'Junior';
    else if (lower.includes('lead') || lower.includes('staff')) level = 'Lead/Staff';
    else if (lower.includes('intern') || lower.includes('fresher') || lower.includes('entry')) level = 'Entry/Intern';
    return { byCategory: found, mustHave: [...new Set(mustHave)], niceToHave: [...new Set(niceToHave)], experienceLevel: level, yearsRequired: [...new Set(yearMatches)] };
  }
  module.exports = { parseWorkdayUrl, extractJobId, normalizeUrl, detectSource, extractJDKeywords, detectJobType, detectWorkMode, extractStipend, extractDuration, extractRequisitionId, getPlatformInfo };
}
