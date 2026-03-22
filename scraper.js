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
    'direct': 'Direct'
  };

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
      canonicalUrl, scrapeQuality: 'failed', keywords: null
    };

    try {
      // ─── Priority 1: Workday URL parsing ───
      const wd = parseWorkdayUrl(url);
      if (wd) {
        result = { ...result, ...wd, canonicalUrl, scrapeQuality: 'full' };
      } else {
        // ─── Extract Job ID from URL ───
        const idResult = extractJobId(url);
        result.jobId = idResult.jobId;
        result.rawJobId = idResult.rawJobId;
        result.platform = idResult.platform;
        result.siteType = idResult.siteType;

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

      // ─── JD Keyword extraction ───
      try {
        const jdText = getJDText();
        if (jdText.length > 100) {
          result.keywords = extractJDKeywords(jdText);
        }
      } catch { /* silently skip */ }

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
    window.__jobTrackrScraper = { scrapeAll, extractJobId, normalizeUrl, parseWorkdayUrl, extractJDKeywords, detectSource };
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
    'direct': 'Direct'
  };
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
  module.exports = { parseWorkdayUrl, extractJobId, normalizeUrl, detectSource, extractJDKeywords: function(text) {
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
  }};
}
