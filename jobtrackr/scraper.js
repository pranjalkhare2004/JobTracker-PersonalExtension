/* ═══════════════════════════════════════
   scraper.js — Per-Platform DOM Extractors
   ═══════════════════════════════════════ */

(function () {
  'use strict';

  const TRACKING_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'refId', 'trackingId', 'from', 'src', 'lipi', 'trk', 'trkInfo',
    'ref', 'referrer', 'source', 'campaign', 'medium', 'fbclid', 'gclid'
  ];

  /* ─── Platform Detection ─── */
  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('linkedin.com')) return 'LinkedIn';
    if (host.includes('wellfound.com') || host.includes('angel.co')) return 'Wellfound';
    if (host.includes('indeed.com')) return 'Indeed';
    if (host.includes('naukri.com')) return 'Naukri';
    return 'Other';
  }

  /* ─── Selector Helper ─── */
  function q(selectors) {
    if (typeof selectors === 'string') selectors = [selectors];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const text = (el.textContent || '').trim();
          if (text) return text;
        }
      } catch { /* skip invalid selector */ }
    }
    return '';
  }

  function getMeta(name) {
    const el = document.querySelector(`meta[property="${name}"]`) ||
               document.querySelector(`meta[name="${name}"]`);
    return el ? (el.getAttribute('content') || '').trim() : '';
  }

  /* ─── URL Normalization ─── */
  function normalizeUrl(url) {
    try {
      const u = new URL(url);
      TRACKING_PARAMS.forEach(p => u.searchParams.delete(p));
      u.hash = '';
      u.searchParams.sort();
      return u.origin + u.pathname.replace(/\/+$/, '') + (u.search || '');
    } catch {
      return url;
    }
  }

  /* ─── Job ID Extraction ─── */
  function extractJobId(url, platform) {
    try {
      const u = new URL(url);
      const path = u.pathname;
      switch (platform) {
        case 'LinkedIn': {
          const m = path.match(/\/jobs\/view\/(\d+)/);
          return m ? `li_${m[1]}` : null;
        }
        case 'Wellfound': {
          const m = path.match(/\/jobs\/(\d+)/) || path.match(/\/l\/(\d+)/);
          return m ? `wf_${m[1]}` : null;
        }
        case 'Indeed': {
          const jk = u.searchParams.get('jk');
          return jk ? `in_${jk}` : null;
        }
        case 'Naukri': {
          const m = path.match(/-(\d+)\.html$/);
          return m ? `nk_${m[1]}` : null;
        }
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  /* ─── LinkedIn Scraper ─── */
  function scrapeLinkedIn() {
    const role = q([
      'h1.t-24.job-details-jobs-unified-top-card__job-title',
      'h1[class*="job-title"]',
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title',
      '.topcard__title'
    ]) || (document.title || '').replace(/\s*\|?\s*LinkedIn\s*$/, '').trim();

    const company = q([
      '.job-details-jobs-unified-top-card__company-name a',
      'a[class*="company-name"]',
      '.topcard__org-name-link',
      '.jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name'
    ]);

    return { role, company };
  }

  /* ─── Wellfound / Angel.co Scraper ─── */
  function scrapeWellfound() {
    const role = q([
      'h1[class*="title"]',
      'h1',
      '.listing-title'
    ]);

    const company = q([
      'a[class*="startup-link"]',
      'h2[class*="company"]',
      '.company-name',
      'a[class*="organization"]'
    ]);

    return { role, company };
  }

  /* ─── Indeed Scraper ─── */
  function scrapeIndeed() {
    const role = q([
      'h1.jobsearch-JobInfoHeader-title',
      'h1[class*="job-title"]',
      '[data-testid="jobsearch-JobInfoHeader-title"]',
      'h1[class*="JobInfoHeader"]',
      '.jobsearch-JobInfoHeader-title-container h1'
    ]);

    const company = q([
      '[data-testid="inlineHeader-companyName"] a',
      '[data-testid="inlineHeader-companyName"]',
      '.icl-u-lg-mr--sm.icl-u-xs-mr--sm',
      '[data-company-name]',
      '.jobsearch-InlineCompanyRating a'
    ]);

    return { role, company };
  }

  /* ─── Naukri Scraper ─── */
  function scrapeNaukri() {
    const role = q([
      'h1.jd-header-title',
      'h1[class*="title"]',
      '.jd-header-title',
      'h1'
    ]);

    const company = q([
      '.jd-header-comp-name a',
      'a[class*="comp-name"]',
      '.jd-header-comp-name',
      '.comp-name'
    ]);

    return { role, company };
  }

  /* ─── Generic Fallback ─── */
  function scrapeGeneric() {
    let role = getMeta('og:title') || q(['h1']) || document.title || '';
    const company = getMeta('og:site_name') || q(['.company', '[class*="company"]']) || '';

    // Strip company suffix from title if present
    if (company && role.includes(company)) {
      role = role.replace(new RegExp(`\\s*[-–—|@]\\s*${company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '').trim();
    }

    return { role, company };
  }

  /* ─── Main Scrape Function ─── */
  function scrapeJobDetails() {
    const url = window.location.href;
    const platform = detectPlatform();
    const jobId = extractJobId(url, platform);
    const canonicalUrl = normalizeUrl(url);

    let scraped;
    let scrapeQuality = 'full'; // full | partial | failed

    try {
      switch (platform) {
        case 'LinkedIn':  scraped = scrapeLinkedIn(); break;
        case 'Wellfound': scraped = scrapeWellfound(); break;
        case 'Indeed':    scraped = scrapeIndeed(); break;
        case 'Naukri':    scraped = scrapeNaukri(); break;
        default:          scraped = scrapeGeneric(); break;
      }
    } catch (e) {
      scraped = { role: '', company: '' };
      scrapeQuality = 'failed';
    }

    if (!scraped.role && !scraped.company) {
      scrapeQuality = 'failed';
    } else if (!scraped.role || !scraped.company) {
      scrapeQuality = 'partial';
    }

    return {
      company: scraped.company || '',
      role: scraped.role || '',
      jobId,
      platform,
      canonicalUrl,
      scrapeQuality
    };
  }

  // Expose globally for content.js
  window.__jobTrackrScraper = { scrapeJobDetails, detectPlatform, extractJobId, normalizeUrl };
})();
