/* ═══════════════════════════════════════
   dedup.js — Duplicate + Re-Post Detection (V2)
   4 Tiers: exact → URL → re-post → fuzzy
   ═══════════════════════════════════════ */

/* ─── Tracking params to strip for URL normalization ─── */
const DEDUP_TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'refId', 'trk', 'trkInfo', 'lipi', 'trackingId',
  'fbclid', 'gclid', 'msclkid', 'mc_cid', '_hsenc', '_hsmi'
];
// NOTE: we KEEP 'source' and 'ref' — they encode where the user came from

/* ─── Suffixes to strip from company names ─── */
const COMPANY_SUFFIXES = [
  'inc', 'ltd', 'llc', 'pvt', 'limited', 'technologies', 'tech',
  'software', 'solutions', 'systems', 'group', 'corp', 'co'
];

/* ─── Words to strip from role titles for fuzzy matching ─── */
const ROLE_STRIP_WORDS = [
  'senior', 'sr', 'junior', 'jr', 'lead', 'staff', 'principal',
  'associate', 'assoc', 'eng', 'engineer', 'developer', 'dev',
  'software', 'swe', 'sde'
];

/* ─── Normalization Functions ─── */

function normalizeCompany(name) {
  if (!name) return '';
  let n = name.toLowerCase();
  COMPANY_SUFFIXES.forEach(s => { n = n.replace(new RegExp(`\\b${s}\\b`, 'g'), ''); });
  return n.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeRole(title) {
  if (!title) return '';
  let n = title.toLowerCase();
  ROLE_STRIP_WORDS.forEach(w => { n = n.replace(new RegExp(`\\b${w}\\b`, 'g'), ''); });
  return n.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    DEDUP_TRACKING_PARAMS.forEach(p => u.searchParams.delete(p));
    u.hash = '';
    u.searchParams.sort();
    return u.origin + u.pathname.replace(/\/+$/, '') + (u.search || '');
  } catch {
    return url.trim().toLowerCase();
  }
}

/* ─── Main Dedup Check ─── */

/**
 * Check a new entry against all existing entries.
 * Returns: { type: "exact"|"url"|"repost"|"fuzzy"|null, match: entry|null, message: string }
 */
function checkDuplicate(newEntry, allEntries) {
  if (!allEntries || allEntries.length === 0) return { type: null, match: null, message: '' };

  // ─── TIER 1: Exact Job ID match ───
  if (newEntry.jobId) {
    const match = allEntries.find(a => a.jobId && a.jobId === newEntry.jobId);
    if (match) {
      const emailLabel = match.email === 'A' ? 'Email A' : 'Email B';
      return {
        type: 'exact',
        match,
        message: `You already applied to this exact job on ${_fmtDate(match.dateApplied)} via ${emailLabel}. Status: ${match.status}.`
      };
    }
  }

  // ─── TIER 2: Normalized URL match ───
  const normUrl = normalizeUrl(newEntry.jobUrl);
  if (normUrl) {
    const match = allEntries.find(a => normalizeUrl(a.jobUrl) === normUrl);
    if (match) {
      const emailLabel = match.email === 'A' ? 'Email A' : 'Email B';
      return {
        type: 'url',
        match,
        message: `This URL matches a job you logged on ${_fmtDate(match.dateApplied)} via ${emailLabel}. Status: ${match.status}.`
      };
    }
  }

  // ─── Fuzzy company+role matching (used by Tiers 3 & 4) ───
  const normCompany = normalizeCompany(newEntry.company) || (newEntry.company || '').toLowerCase().trim();
  const normRole = normalizeRole(newEntry.role) || (newEntry.role || '').toLowerCase().trim();

  if (!normCompany || !normRole) return { type: null, match: null, message: '' };

  const companyRoleMatches = allEntries.filter(a => {
    const ac = normalizeCompany(a.company) || (a.company || '').toLowerCase().trim();
    const ar = normalizeRole(a.role) || (a.role || '').toLowerCase().trim();
    return ac === normCompany && ar === normRole;
  });

  if (companyRoleMatches.length === 0) return { type: null, match: null, message: '' };

  // Sort by date descending (most recent first)
  companyRoleMatches.sort((a, b) => new Date(b.dateApplied) - new Date(a.dateApplied));
  const mostRecent = companyRoleMatches[0];

  // ─── TIER 3: Re-post detection ───
  // Conditions: new jobId differs, AND (old entry > 60 days OR old status is Rejected/Withdrawn)
  const daysSince = Math.floor((Date.now() - new Date(mostRecent.dateApplied).getTime()) / 86400000);
  const isOldOrClosedStatus = daysSince > 60 || mostRecent.status === 'Rejected' || mostRecent.status === 'Withdrawn';

  if (isOldOrClosedStatus) {
    const oldId = mostRecent.rawJobId || mostRecent.jobId || 'N/A';
    return {
      type: 'repost',
      match: mostRecent,
      message: `Looks like ${newEntry.company || mostRecent.company} reposted ${newEntry.role || mostRecent.role}. ` +
               `You applied ${daysSince} days ago (Job ID: ${oldId}, Status: ${mostRecent.status}). ` +
               `This appears to be a new posting with a different Job ID.`
    };
  }

  // ─── TIER 4: Fuzzy same-role warning (recent, not rejected/withdrawn) ───
  const emailLabel = mostRecent.email === 'A' ? 'Email A' : 'Email B';
  return {
    type: 'fuzzy',
    match: mostRecent,
    message: `You may have applied to a similar role at ${mostRecent.company} ${daysSince} days ago. Applied as ${emailLabel}. Continue?`
  };
}

/* ─── Helper ─── */
function _fmtDate(isoStr) {
  if (!isoStr) return 'unknown date';
  try {
    return new Date(isoStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return isoStr; }
}

/* ─── Exports for Node.js testing ─── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { checkDuplicate, normalizeCompany, normalizeRole, normalizeUrl };
}
