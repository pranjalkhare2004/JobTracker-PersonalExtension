/* ═══════════════════════════════════════
   templates.js — Template Engine + Factory Defaults (V4)
   renderTemplate(), buildTemplateData(),
   DEFAULT_TEMPLATES, DEFAULT_SNIPPETS, DEFAULT_PLATFORMS, DEFAULT_SKILL_DICT
   ═══════════════════════════════════════ */

/* ─── Micro-Template Engine ─── */

function renderTemplate(template, data) {
  if (!template) return '';

  // 1. Replace {{#if key}}...{{/if}} conditional blocks
  let result = template.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, key, content) => {
      const val = data[key];
      if (val === undefined || val === null || val === '' ||
          (Array.isArray(val) && val.length === 0)) return '';
      return content;
    }
  );

  // 2. Replace {{placeholder}} values
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = data[key];
    if (val === undefined || val === null || val === '') return '';
    if (Array.isArray(val)) return val.join(', ');
    return String(val);
  });

  // 3. Collapse triple+ blank lines to double
  return result.replace(/\n{3,}/g, '\n\n').trim();
}

/* ─── Build template data from entry + settings ─── */

async function buildTemplateData(entry) {
  const settings  = await getSettings();
  const templates = await getTemplates();
  const p         = settings.profile  || {};
  const mySkills  = settings.mySkills || [];

  const mustHave       = entry.keywords?.mustHave   || [];
  const matchedSkills  = mustHave.filter(k =>
    mySkills.some(s => s.toLowerCase() === k.toLowerCase()));
  const missingSkills  = mustHave.filter(k =>
    !mySkills.some(s => s.toLowerCase() === k.toLowerCase()));

  return {
    name:             p.name        || '',
    college:          p.college     || '',
    degree:           p.degree      || '',
    cgpa:             p.cgpa        || '',
    resumeUrl:        p.resumeUrl   || '',
    linkedinUrl:      p.linkedinUrl || '',
    role:             entry.role         || '',
    company:          entry.company      || '',
    jobId:            entry.rawJobId || entry.jobId || '',
    location:         entry.location     || '',
    jobType:          entry.jobType      || '',
    source:           entry.source       || '',
    jobUrl:           entry.jobUrl       || '',
    dateApplied:      entry.dateApplied
                        ? new Date(entry.dateApplied)
                            .toLocaleDateString('en-IN', { day:'numeric',
                              month:'short', year:'numeric' })
                        : '',
    mustHaveSkills:   mustHave,
    niceToHaveSkills: entry.keywords?.niceToHave    || [],
    matchedSkills,
    missingSkills,
    experienceLevel:  entry.keywords?.experienceLevel || '',
    referralPerson:   entry.referralPerson || '',
    stipend:          entry.stipend        || '',
    coverLetterBase:  templates.coverLetterBase || '',
  };
}

/* ═══════════════════════════════════════
   FACTORY DEFAULTS — Used in first-run init
   and "Reset to default" buttons ONLY.
   Never read at render time.
   ═══════════════════════════════════════ */

const DEFAULT_TEMPLATES = {
  referralMessage: `Hi {{referralPerson}},

I came across the {{role}} at {{company}} and wanted to ask if you could refer me for this position. Job ID: {{jobId}}

I am a final year {{degree}} student at {{college}} with a {{cgpa}} CGPA, with a strong foundation in computer science fundamentals.
{{#if matchedSkills}}I have hands-on experience with {{matchedSkills}}, which aligns well with this role.{{/if}}

Please find my resume here: {{resumeUrl}}

Kindly let me know if you need any additional details.

Thanks & Regards,
{{name}}`,

  followUpEmail: `Subject: Follow-up: {{role}} Application — {{name}}

Hi Hiring Team,

I wanted to follow up on my application for the {{role}} position at {{company}}{{#if jobId}} (Job ID: {{jobId}}){{/if}}, submitted on {{dateApplied}}.

I remain very interested in this opportunity and would love to discuss how my background aligns with your team's needs.

Please let me know if you need any additional information.

Thanks & Regards,
{{name}}
{{college}} | {{degree}} | {{cgpa}} CGPA
Resume: {{resumeUrl}}`,

  coverLetterBase: `[Paste your own cover letter template here.
Use {{role}}, {{company}}, {{matchedSkills}} as placeholders —
they will be filled in automatically when you generate the prompt.]`,

  coverLetterPrompt: `You are helping me write a professional cover letter.

JOB DETAILS:
- Role: {{role}}
- Company: {{company}}
- Job ID: {{jobId}}
- Type: {{jobType}} | Location: {{location}}

KEY JD REQUIREMENTS:
Must-have: {{mustHaveSkills}}
Nice to have: {{niceToHaveSkills}}

MY PROFILE:
- {{degree}} student at {{college}}, {{cgpa}} CGPA
- Skills I match: {{matchedSkills}}
- Skills I may be missing: {{missingSkills}}
- Resume: {{resumeUrl}}

MY COVER LETTER TEMPLATE TO FOLLOW:
{{coverLetterBase}}

Write a tailored cover letter using my template above.
Highlight matched skills naturally. Max 250 words.
Do not invent experience I don't have.`,

  resumeTailoringPrompt: `I am applying for {{role}} at {{company}}.

JD REQUIREMENTS:
Must-have: {{mustHaveSkills}}
Preferred: {{niceToHaveSkills}}
Level: {{experienceLevel}}

MY SITUATION:
- {{degree}} at {{college}}, {{cgpa}} CGPA
- Skills I have from JD: {{matchedSkills}}
- Skills I may be missing: {{missingSkills}}
- Resume: {{resumeUrl}}

Give me:
1. Top 3 things to highlight in my resume for this role
2. Which projects or experience to lead with
3. Keywords to add to my resume summary
4. Honest fit assessment — strengths and gaps`,

  interviewPrepPrompt: `I have an interview at {{company}} for {{role}}.

JD SKILLS: {{mustHaveSkills}}
EXPERIENCE LEVEL: {{experienceLevel}}

MY BACKGROUND:
- {{degree}} at {{college}}, {{cgpa}} CGPA
- Relevant skills: {{matchedSkills}}

Generate:
1. 5 likely technical questions for this role
2. 3 HR / behavioural questions they will likely ask
3. Brief answer outline for each technical question
4. One smart question I should ask the interviewer`,

  statusNotePrompts: {
    Interviewing: 'Interview date / round?',
    Rejected:     'Reason if known?',
    Offer:        'Offer details (CTC, joining date)?',
    Withdrawn:    'Why withdrawn?',
  }
};

/* ─── Default Snippets ─── */

const DEFAULT_SNIPPETS = [
  'Applied via Easy Apply',
  'Needs cover letter',
  'Referral in progress',
  'Good culture fit',
  'Stretch role — worth trying',
  'Backup option',
  'Applied via referral email',
  'Recruiter reached out',
  'Company on watchlist',
];

/* ─── Default Platforms ─── */

const DEFAULT_PLATFORMS = [
  // Aggregators
  { id: 'p-linkedin',      name: 'LinkedIn',        matches: ['linkedin.com'],                    category: 'Aggregator', siteType: 'aggregator', enabled: true, builtIn: true },
  { id: 'p-glassdoor',     name: 'Glassdoor',       matches: ['glassdoor.co.in','glassdoor.com'], category: 'Aggregator', siteType: 'aggregator', enabled: true, builtIn: true },
  { id: 'p-indeed',        name: 'Indeed',           matches: ['indeed.com','in.indeed.com'],      category: 'Aggregator', siteType: 'aggregator', enabled: true, builtIn: true },
  { id: 'p-naukri',        name: 'Naukri',           matches: ['naukri.com'],                      category: 'Aggregator', siteType: 'aggregator', enabled: true, builtIn: true },
  { id: 'p-foundit',       name: 'Foundit',          matches: ['foundit.in'],                      category: 'Aggregator', siteType: 'aggregator', enabled: true, builtIn: true },
  { id: 'p-simplyhired',   name: 'SimplyHired',      matches: ['simplyhired.co.in'],               category: 'Aggregator', siteType: 'aggregator', enabled: true, builtIn: true },
  // Startup / curated
  { id: 'p-wellfound',     name: 'Wellfound',        matches: ['wellfound.com','angel.co'],        category: 'Startup',    siteType: 'employer',   enabled: true, builtIn: true },
  { id: 'p-cutshort',      name: 'Cutshort',         matches: ['cutshort.io'],                     category: 'Startup',    siteType: 'employer',   enabled: true, builtIn: true },
  { id: 'p-was',           name: 'WorkAtStartup',    matches: ['workatastartup.com'],              category: 'Startup',    siteType: 'aggregator', enabled: true, builtIn: true },
  { id: 'p-instahyre',     name: 'Instahyre',        matches: ['instahyre.com'],                   category: 'Startup',    siteType: 'aggregator', enabled: true, builtIn: true },
  { id: 'p-hirist',        name: 'Hirist',           matches: ['hirist.tech'],                     category: 'Startup',    siteType: 'aggregator', enabled: true, builtIn: true },
  // Fresher-focused
  { id: 'p-internshala',   name: 'Internshala',      matches: ['internshala.com'],                 category: 'Fresher',    siteType: 'aggregator', enabled: true, builtIn: true },
  { id: 'p-unstop',        name: 'Unstop',           matches: ['unstop.com'],                      category: 'Fresher',    siteType: 'aggregator', enabled: true, builtIn: true },
  // Contract/remote
  { id: 'p-uplers',        name: 'Uplers',           matches: ['uplers.com'],                      category: 'Other',      siteType: 'aggregator', enabled: true, builtIn: true },
  // ATS platforms
  { id: 'p-workday',       name: 'Workday',          matches: ['myworkdayjobs.com','myworkday.com'], category: 'Career',   siteType: 'employer',   enabled: true, builtIn: true },
  { id: 'p-greenhouse',    name: 'Greenhouse',       matches: ['greenhouse.io'],                   category: 'Career',     siteType: 'employer',   enabled: true, builtIn: true },
  { id: 'p-lever',         name: 'Lever',            matches: ['lever.co'],                        category: 'Career',     siteType: 'employer',   enabled: true, builtIn: true },
  { id: 'p-smartrecruit',  name: 'SmartRecruiters',  matches: ['smartrecruiters.com'],             category: 'Career',     siteType: 'employer',   enabled: true, builtIn: true },
  { id: 'p-ashby',         name: 'Ashby',            matches: ['ashbyhq.com'],                     category: 'Career',     siteType: 'employer',   enabled: true, builtIn: true },
  { id: 'p-rippling',      name: 'Rippling',         matches: ['rippling.com'],                    category: 'Career',     siteType: 'employer',   enabled: true, builtIn: true },
  { id: 'p-icims',         name: 'iCIMS',            matches: ['icims.com'],                       category: 'Career',     siteType: 'employer',   enabled: true, builtIn: true },
  { id: 'p-bamboohr',      name: 'BambooHR',         matches: ['bamboohr.com'],                    category: 'Career',     siteType: 'employer',   enabled: true, builtIn: true },
  { id: 'p-jobvite',       name: 'Jobvite',          matches: ['jobvite.com'],                     category: 'Career',     siteType: 'employer',   enabled: true, builtIn: true },
  { id: 'p-taleo',         name: 'Taleo',            matches: ['taleo.net'],                       category: 'Career',     siteType: 'employer',   enabled: true, builtIn: true },
  { id: 'p-breezy',        name: 'Breezy',           matches: ['breezy.hr'],                       category: 'Career',     siteType: 'employer',   enabled: true, builtIn: true },
  { id: 'p-workable',      name: 'Workable',         matches: ['workable.com'],                    category: 'Career',     siteType: 'employer',   enabled: true, builtIn: true },
];

/* ─── Default Skill Dictionary ─── */

const DEFAULT_SKILL_DICT = [
  { category: 'Languages',   skills: ['python','java','javascript','typescript','c++','c#','golang','rust','kotlin','swift','ruby','php','scala','r','bash','sql','html','css','dart','matlab'] },
  { category: 'Frameworks',  skills: ['react','angular','vue','node.js','express','django','flask','fastapi','spring boot','spring','laravel','next.js','nuxt','svelte','redux','graphql','rest','restful','tailwind'] },
  { category: 'Cloud/DevOps', skills: ['aws','azure','gcp','google cloud','docker','kubernetes','k8s','terraform','ci/cd','github actions','jenkins','ansible','linux','nginx','microservices','kafka','rabbitmq','redis','elasticsearch'] },
  { category: 'Data/ML',     skills: ['machine learning','deep learning','tensorflow','pytorch','pandas','numpy','scikit-learn','spark','hadoop','tableau','power bi','etl','nlp','computer vision','llm','langchain','hugging face','transformers'] },
  { category: 'Databases',   skills: ['mysql','postgresql','postgres','mongodb','redis','firebase','dynamodb','cassandra','oracle','sqlite','snowflake','bigquery'] },
  { category: 'Tools',       skills: ['git','github','gitlab','jira','confluence','postman','figma','vs code','agile','scrum','kanban'] },
  { category: 'Soft Skills', skills: ['communication','teamwork','problem solving','leadership','analytical thinking','time management'] },
];

/* ─── Placeholder reference table ─── */

const PLACEHOLDER_TABLE = [
  { key: 'name',             desc: 'Your name (from My Profile)' },
  { key: 'college',          desc: 'Your college' },
  { key: 'degree',           desc: 'Your degree' },
  { key: 'cgpa',             desc: 'Your CGPA' },
  { key: 'resumeUrl',        desc: 'Your resume link' },
  { key: 'linkedinUrl',      desc: 'Your LinkedIn URL' },
  { key: 'role',             desc: 'Job title (scraped)' },
  { key: 'company',          desc: 'Company name (scraped)' },
  { key: 'jobId',            desc: 'Job / requisition ID' },
  { key: 'location',         desc: 'Job location' },
  { key: 'jobType',          desc: 'Full-time / Internship / Contract' },
  { key: 'source',           desc: 'Where you found it' },
  { key: 'jobUrl',           desc: 'Direct URL to job posting' },
  { key: 'dateApplied',      desc: 'Date you logged this application' },
  { key: 'mustHaveSkills',   desc: 'Required skills from JD' },
  { key: 'niceToHaveSkills', desc: 'Preferred skills from JD' },
  { key: 'matchedSkills',    desc: 'JD skills you already have' },
  { key: 'missingSkills',    desc: 'Required skills you don\'t have' },
  { key: 'experienceLevel',  desc: 'Seniority level detected in JD' },
  { key: 'referralPerson',   desc: 'Name of person referring you' },
  { key: 'stipend',          desc: 'Stipend / salary if found' },
  { key: 'coverLetterBase',  desc: 'Your cover letter template body' },
];

/* ─── Node.js exports (for testing) ─── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderTemplate,
    buildTemplateData,
    DEFAULT_TEMPLATES,
    DEFAULT_SNIPPETS,
    DEFAULT_PLATFORMS,
    DEFAULT_SKILL_DICT,
    PLACEHOLDER_TABLE,
  };
}
