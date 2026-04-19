// Home Screen Confessions — type the 5 apps you open most; the panel reads
// them as a cultural-generational fingerprint and renders a brass-plate verdict.
//
// Design rules honored:
//   - Input-visibility: the five user-typed apps are RENDERED on the artifact.
//   - Deterministic core: archetype is picked by hashing the sorted+normalized
//     5-app list. LLM is used ONLY for the "why" line + 5 micro-labels (flourish).
//   - Deterministic fallback always works (static "why" + fallback micro-labels).
//   - One AI call per user journey. No retries. No loops.
//   - Results cached by hash in localStorage so refreshes skip the LLM.
//   - Full result encoded into location.hash so a shared link re-renders the
//     same verdict with no LLM call.

const AI_ENDPOINT = 'https://uy3l6suz07.execute-api.us-east-1.amazonaws.com/ai';
const SLUG = 'home-screen-confessions';
const NUM_APPS = 5;

// ---------- util ----------

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function confIdFromSeed(seed) {
  return 'CF-' + String(seed % 100000).padStart(5, '0');
}

// base64url for fragment state
function b64urlEncode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  try {
    let str = s.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const bin = atob(str);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (_) { return null; }
}

// ---------- archetype catalog (deterministic) ----------
//
// Each archetype has `tags`: keyword substrings that score matches against the
// normalized 5-app list. Highest score wins. Ties broken by a deterministic
// seed derived from the sorted app list.

const ARCHETYPES = [
  {
    name: 'The Dopamine Accountant',
    tagline: 'tracks the numbers so the numbers can track back.',
    tags: ['robinhood','coinbase','mint','ynab','wealthfront','etrade','fidelity','schwab','stocks','webull','crypto','binance','venmo','cash app','cashapp','zelle','apple wallet','chase','bank','banking','metamask','ledger'],
  },
  {
    name: 'The Unemployable Mystic',
    tagline: 'co-regulates with the cosmos; unresponsive in standups.',
    tags: ['co-star','costar','the pattern','sanctuary','headspace','calm','insight timer','moon','tarot','astro','oracle','meditation','breathe','ritual','labyrinthos','mystic','goddess','sanvello'],
  },
  {
    name: 'The Recovering Scroller',
    tagline: 'uninstalled TikTok twice this week; both times she came back.',
    tags: ['tiktok','instagram','ig','reels','facebook','fb','snapchat','snap','x','twitter','threads','bluesky','mastodon','pinterest','reddit','9gag'],
  },
  {
    name: 'The Optimization Victim',
    tagline: 'every habit is tracked; the tracking is the habit.',
    tags: ['strava','apple health','fitness','whoop','oura','garmin','peloton','nike run','nike training','fitbit','myfitnesspal','mfp','macrofactor','loseit','cronometer','habit','streaks','productive','finch','duolingo','anki'],
  },
  {
    name: 'The Low-Grade Romantic',
    tagline: 'opens it to not swipe, stays to read strangers\' bios.',
    tags: ['hinge','tinder','bumble','feeld','grindr','her','raya','match','okcupid','coffee meets bagel','cmb','happn','plenty of fish','pof','rizz'],
  },
  {
    name: 'The Audio-Only Philosopher',
    tagline: 'thinks out loud via airpods; has never finished a book.',
    tags: ['spotify','apple music','podcasts','pocket casts','overcast','audible','youtube music','soundcloud','tidal','amazon music','castbox','stitcher','huberman','joe rogan','ted','the daily'],
  },
  {
    name: 'The Gentle Landlord of a Small Pantry',
    tagline: 'manages a delicate domestic empire from the checkout screen.',
    tags: ['instacart','whole foods','trader joe','amazon','amazon fresh','target','walmart','kroger','safeway','aldi','costco','flipp','ibotta','rakuten','honey','yuka','weee','hmart','paprika','mealime','yummly','allrecipes','hellofresh','marley spoon','blue apron'],
  },
  {
    name: 'The Delivery-Pilled Urbanist',
    tagline: 'has not touched a stove this fiscal quarter.',
    tags: ['uber eats','ubereats','doordash','grubhub','seamless','postmates','caviar','chowbus','goPuff','gopuff','gojek','deliveroo','just eat','foodpanda','ritual','chowbus','chownow','toast tab','toast','beli','yelp','resy','opentable','the infatuation'],
  },
  {
    name: 'The Transit Oracle',
    tagline: 'narrates detours to no one in particular.',
    tags: ['google maps','maps','apple maps','waze','citymapper','transit','moovit','mta','bart','rome2rio','omny','clipper','uber','lyft','lime','bird','via','bolt','free now'],
  },
  {
    name: 'The Content Atelier',
    tagline: 'drafts in public; publishes in airplane mode.',
    tags: ['capcut','vsco','lightroom','afterlight','notion','figma','procreate','canva','davinci','premiere','photoshop','snapseed','halide','obscura','darkroom','moment','unfold','captions','filmic','adobe','vidda','splice','videoleap'],
  },
  {
    name: 'The Meeting Respondent',
    tagline: 'opens it to make sure she hasn\'t been fired yet.',
    tags: ['slack','microsoft teams','teams','zoom','google meet','outlook','gmail','superhuman','hey','spike','front','asana','linear','jira','trello','clickup','basecamp','monday','airtable','calendly','fantastical','calendar','google calendar','notion','confluence','salesforce'],
  },
  {
    name: 'The Library-Card Exhibitionist',
    tagline: 'holds 14 books at once; reads the first chapter of each.',
    tags: ['libby','hoopla','kindle','goodreads','storygraph','audible','scribd','google books','apple books','kobo','everand','blinkist','the new yorker','nyt','new york times','wsj','atlantic','pocket','raindrop','readwise','instapaper','matter'],
  },
  {
    name: 'The Weather-App Hypochondriac',
    tagline: 'checks the radar like it\'s a voicemail from God.',
    tags: ['weather','apple weather','weather channel','accuweather','carrot','dark sky','windy','ventusky','radarscope','mynoaa','nws','iphone weather','weatherkit','windfinder'],
  },
  {
    name: 'The Side-Project Magnate',
    tagline: 'ships imaginary products between shower and breakfast.',
    tags: ['github','gitlab','replit','cursor','vscode','xcode','android studio','termius','working copy','linear','notion','stripe','pipedream','vercel','netlify','shopify','posthog','supabase','figma','whimsical','obsidian','logseq'],
  },
  {
    name: 'The Group Chat Historian',
    tagline: 'archives friendships in read receipts and old voice memos.',
    tags: ['imessage','messages','whatsapp','signal','telegram','discord','wechat','line','viber','kakaotalk','bereal','marco polo','voxer','messenger','fb messenger','voice memos'],
  },
  {
    name: 'The Rechargeable Gambler',
    tagline: 'the phone is a small, elegant casino she owns stock in.',
    tags: ['draftkings','fanduel','prizepicks','underdog','pointsbet','bet365','caesars','betmgm','sleeper','espn fantasy','yahoo fantasy','stockx','goat','ebay','mercari','depop','vinted','poshmark'],
  },
  {
    name: 'The Surveillance Gardener',
    tagline: 'watches her own front porch more than any television show.',
    tags: ['ring','nest','arlo','blink','eufy','simplisafe','wyze','tile','find my','airtag','life360','google home','home','alexa','smartthings','roborock','philips hue','tp-link kasa'],
  },
  {
    name: 'The Language-Streak Martyr',
    tagline: 'will fight the owl before she loses the 812-day streak.',
    tags: ['duolingo','busuu','babbel','rosetta','pimsleur','memrise','hellotalk','tandem','lingodeer','drops','mango','italki','preply','lingvist'],
  },
];

// Broad fallback if no keyword hits. Deterministic index by seed.
const FALLBACK_ARCHETYPES = [
  { name: 'The Ambient Multitasker',     tagline: 'opens five apps to avoid finishing one.' },
  { name: 'The Gently Curated Stranger', tagline: 'her home screen is a polite denial of the last five years.' },
  { name: 'The Unlabeled Specialist',    tagline: 'doing something specific; unwilling to say what.' },
  { name: 'The Quietly Prolific',        tagline: 'no streaks, no notifications, lots of usage.' },
];

// ---------- parsing ----------

function parseApps(raw) {
  const lines = String(raw || '')
    .split(/\r?\n|,|;|\u2022|\u2014/)
    .map(s => s.trim())
    .filter(Boolean);

  const out = [];
  const seen = new Set();
  for (const line of lines) {
    // Strip leading bullets / numbers.
    let cleaned = line
      .replace(/^[-*\u2022\d.)]+\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
    // Ignore obviously empty tokens after cleaning.
    if (!cleaned) continue;
    // Cap individual app name length so the tile doesn't break the layout.
    if (cleaned.length > 40) cleaned = cleaned.slice(0, 40).trim();
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= NUM_APPS) break;
  }
  return out;
}

function validateApps(apps) {
  if (!apps || apps.length < NUM_APPS) {
    return `we need all ${NUM_APPS} apps — the panel is strict about that.`;
  }
  if (apps.length > NUM_APPS) {
    return `only ${NUM_APPS} apps, please. the panel's attention span is fixed.`;
  }
  for (const a of apps) {
    if (!a || a.length < 2) return 'each app needs a real name — even a short one.';
  }
  return null;
}

// ---------- deterministic archetype selection ----------

function normalizeList(apps) {
  // Lowercased + punctuation-stripped form used for tag matching.
  return apps.map(a => a.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim());
}

function pickArchetype(apps) {
  const norm = normalizeList(apps);
  const joined = ' ' + norm.join(' | ') + ' ';

  let best = null;
  let bestScore = 0;
  for (const a of ARCHETYPES) {
    let score = 0;
    for (const t of a.tags) {
      // Match as substring in the joined stream, OR as full-token equality with any app.
      if (joined.indexOf(' ' + t + ' ') !== -1) score += 2;
      else if (joined.indexOf(t) !== -1) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = a; }
  }

  const seedBase = [...apps].map(a => a.toLowerCase()).sort().join('|');
  const seed = hash(seedBase);

  if (best) return { ...best, seed, source: 'tagged' };

  const idx = seed % FALLBACK_ARCHETYPES.length;
  return { ...FALLBACK_ARCHETYPES[idx], tags: [], seed, source: 'fallback' };
}

// ---------- deterministic fallback "why" + micro-labels ----------

const MICRO_BANK = [
  'filed as evidence',
  'opened without thinking',
  'checked between meetings',
  'consulted at dawn',
  'alphabetized in the mind',
  'pinned like a charm',
  'opens first, always',
  'opens last, guilty',
  'confessed, reluctantly',
  'archived in the soul',
  'a small private ritual',
  'logged, not discussed',
  'entered without intent',
  'swiped to, not searched',
  'the 2am default',
  'the before-coffee default',
  'the post-email default',
  'the elevator default',
  'the waiting-room default',
  'opens in airplane mode',
];

function fallbackMicroLabels(apps, seed) {
  const rand = mulberry32(seed ^ 0x9e3779b1);
  const pool = MICRO_BANK.slice();
  const out = [];
  for (let i = 0; i < apps.length; i++) {
    const idx = Math.floor(rand() * pool.length);
    const [label] = pool.splice(idx, 1);
    out.push(label);
    if (pool.length === 0) pool.push(...MICRO_BANK);
  }
  return out;
}

function fallbackWhy(archetype, apps) {
  // Quote a couple of the user's apps so it still feels personal without the LLM.
  const a = apps[0] || 'your first app';
  const b = apps[apps.length - 1] || 'your last app';
  return `The ${a} / ${b} axis gives it away — ${archetype.tagline}`;
}

// ---------- LLM decoder (flourish only) ----------

function buildMessages(archetype, apps) {
  const system =
    `You are a dry, perceptive, slightly deadpan cultural reader interpreting a stranger's five most-opened phone apps as a generational fingerprint. Voice: sharp, specific, not mean, never generic. No emojis. No hashtags. No preamble.\n\n` +
    `You are given a NAMED ARCHETYPE that was already chosen deterministically by a separate system. Do NOT change, contradict, or re-name the archetype. Write for that archetype.\n\n` +
    `Return a STRICT JSON object with exactly these keys:\n` +
    `{\n` +
    `  "why":   string,          // 1-2 short sentences, total <= 35 words, that SPECIFICALLY references at least 2 of the user's 5 apps by name (quote them verbatim). Explain why this combination points to the given archetype. Do not address the reader in second person. Do not begin with "The". Do not say "this combination" or similar filler.\n` +
    `  "apps":  [ { "name": string, "label": string }, ... exactly 5 entries in input order ]\n` +
    `}\n\n` +
    `Each "label" must be:\n` +
    `- 2 to 5 words\n` +
    `- lowercase\n` +
    `- specific to the role that app plays in THIS person's home screen given the archetype\n` +
    `- not a tagline for the app itself; an accusation, a confession, or a diagnosis\n` +
    `Examples (do not copy verbatim): "the 2am default", "fake-productive self-soothe", "the ex-adjacent app", "opens before coffee", "a small private casino", "receipts, filed in public".\n\n` +
    `HARD RULES:\n` +
    `- Each "name" must EXACTLY match the provided input name for that slot.\n` +
    `- Output ONLY the JSON object. No markdown. No code fences. No commentary. No questions. Do not offer to refine.\n`;

  const user =
    `Archetype (already chosen; do not change): ${archetype.name}\n` +
    `Tagline for context: ${archetype.tagline}\n\n` +
    `The user's five most-opened apps (in order):\n` +
    apps.map((a, i) => `  ${i + 1}. ${a}`).join('\n') +
    `\n\nReturn the JSON object only.`;

  return [
    { role: 'system', content: system },
    { role: 'user',   content: user },
  ];
}

function sanitizeLLMDecoding(parsed, apps) {
  if (!parsed || typeof parsed !== 'object') return null;

  const why = typeof parsed.why === 'string' ? parsed.why.trim() : '';
  if (!why || why.length > 320) return null;

  const arr = Array.isArray(parsed.apps) ? parsed.apps : null;
  if (!arr || arr.length !== apps.length) return null;

  const labels = [];
  for (let i = 0; i < apps.length; i++) {
    const entry = arr[i];
    if (!entry || typeof entry !== 'object') return null;
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    if (!label) return null;
    if (label.length > 48) return null;
    labels.push(label);
  }
  return { why, labels };
}

async function tryLLMDecoding(archetype, apps) {
  try {
    const res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: SLUG,
        messages: buildMessages(archetype, apps),
        max_tokens: 320,
        temperature: 0.7,
        response_format: 'json_object',
      }),
    });
    if (!res.ok) throw new Error('http_' + res.status);
    const data = await res.json();
    const raw = (data && data.content) || '';
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
    return sanitizeLLMDecoding(parsed, apps);
  } catch (_) {
    return null;
  }
}

// ---------- result object & caching ----------

function cacheKeyFor(apps) {
  const k = [...apps].map(a => a.toLowerCase()).sort().join('|');
  return 'hsc_' + hash(k);
}

function readCache(apps) {
  try {
    const raw = localStorage.getItem(cacheKeyFor(apps));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.apps) || obj.apps.length !== NUM_APPS) return null;
    return obj;
  } catch (_) { return null; }
}

function writeCache(result) {
  try {
    localStorage.setItem(cacheKeyFor(result.apps), JSON.stringify(result));
  } catch (_) {}
}

// ---------- fragment state ----------
//
// Shape (#c=<base64url of {}>):
//   a: [5 app names]
//   n: archetype name
//   t: archetype tagline (short)
//   w: why line
//   l: [5 micro labels]
//   d: date
//   i: confession id

function encodeResultToFragment(result) {
  const payload = {
    a: result.apps,
    n: result.archetype.name,
    t: result.archetype.tagline,
    w: result.why,
    l: result.labels,
    d: result.date,
    i: result.confession_id,
  };
  return '#c=' + b64urlEncode(payload);
}

function decodeFragment() {
  const m = (location.hash || '').match(/^#c=([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  const obj = b64urlDecode(m[1]);
  if (!obj || typeof obj !== 'object') return null;
  if (!Array.isArray(obj.a) || obj.a.length !== NUM_APPS) return null;
  if (!Array.isArray(obj.l) || obj.l.length !== NUM_APPS) return null;
  return obj;
}

function resultFromFragment(obj) {
  return {
    apps: obj.a.map(a => String(a).slice(0, 40)),
    archetype: {
      name: String(obj.n || 'The Ambient Multitasker').slice(0, 64),
      tagline: String(obj.t || '').slice(0, 140),
      seed: 0,
      source: 'fragment',
    },
    why: String(obj.w || '').slice(0, 320),
    labels: obj.l.map(x => String(x).slice(0, 48)),
    date: String(obj.d || todayStr()).slice(0, 10),
    confession_id: String(obj.i || 'CF-00000').slice(0, 12),
    _source: 'fragment',
  };
}

// ---------- rendering ----------

const $ = (id) => document.getElementById(id);

function showScreen(name) {
  ['intake', 'loading', 'result'].forEach(n => {
    const el = $(n);
    if (!el) return;
    el.classList.toggle('hidden', n !== name);
  });
  window.scrollTo(0, 0);
}

function setLoaderCopy(text) {
  const el = $('loader-copy');
  if (el) el.textContent = text;
}

function renderResult(result) {
  $('archetype-name').textContent = result.archetype.name;
  $('archetype-why').textContent = result.why;
  $('plate-date').textContent = result.date;
  $('plate-id').textContent = result.confession_id;
  $('sb-serial').textContent = result.confession_id.replace(/^CF-/, '');
  $('sb-model').textContent = 'IV-' + String.fromCharCode(65 + (hash(result.archetype.name) % 26));

  for (let i = 0; i < NUM_APPS; i++) {
    const appEl = $('app-name-' + i);
    const microEl = $('micro-' + i);
    if (appEl) appEl.textContent = result.apps[i] || '';
    if (microEl) microEl.textContent = result.labels[i] || '';
  }

  showScreen('result');
}

function updateLineCount() {
  const el = $('apps-log');
  const countEl = $('line-count');
  if (!el || !countEl) return;
  const lines = parseApps(el.value);
  const n = Math.min(lines.length, NUM_APPS);
  const over = parseApps(el.value).length > NUM_APPS || el.value.split(/\r?\n/).filter(s => s.trim()).length > NUM_APPS;
  countEl.textContent = `${n} / ${NUM_APPS}`;
  countEl.classList.toggle('ready', n === NUM_APPS);
  countEl.classList.toggle('over',  over && n === NUM_APPS);
}

// ---------- main flow ----------

const LOADING_PHRASES = [
  'consulting the brass panel\u2026',
  'cross-referencing your thumbprint\u2026',
  'engraving the verdict\u2026',
  'filing the confession\u2026',
  'calibrating the registry\u2026',
];

async function submitConfession(apps) {
  // 0. Preconditions.
  const err = validateApps(apps);
  if (err) { showError(err); return; }

  // 1. Try cache first — same inputs, same verdict, no LLM.
  const cached = readCache(apps);
  if (cached) {
    showScreen('loading');
    setLoaderCopy('retrieving a previous confession\u2026');
    await sleep(400);
    const fragment = encodeResultToFragment(cached);
    history.replaceState(null, '', location.pathname + location.search + fragment);
    renderResult(cached);
    return;
  }

  // 2. Deterministic archetype pick.
  const archetype = pickArchetype(apps);

  // 3. Loading screen (minimum 800ms visible for drama even if fast).
  showScreen('loading');
  const rand = mulberry32(archetype.seed);
  const loaderPhrase = LOADING_PHRASES[Math.floor(rand() * LOADING_PHRASES.length)];
  setLoaderCopy(loaderPhrase);

  const tStart = Date.now();
  const decoded = await tryLLMDecoding(archetype, apps);
  const elapsed = Date.now() - tStart;
  if (elapsed < 800) await sleep(800 - elapsed);

  let why, labels;
  if (decoded) {
    why = decoded.why;
    labels = decoded.labels;
  } else {
    why = fallbackWhy(archetype, apps);
    labels = fallbackMicroLabels(apps, archetype.seed);
  }

  const result = {
    apps,
    archetype,
    why,
    labels,
    date: todayStr(),
    confession_id: confIdFromSeed(archetype.seed),
    _source: decoded ? 'ai' : 'local',
  };

  writeCache(result);
  const fragment = encodeResultToFragment(result);
  history.replaceState(null, '', location.pathname + location.search + fragment);
  renderResult(result);
}

function showError(message) {
  const el = $('intake-error');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideError() {
  const el = $('intake-error');
  if (el) el.classList.add('hidden');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------- sample ----------

const SAMPLE_SETS = [
  ['Instagram', 'Notes', 'Duolingo', 'Uber Eats', 'Robinhood'],
  ['TikTok', 'Spotify', 'Hinge', 'Google Maps', 'Notion'],
  ['Slack', 'Gmail', 'Calendar', 'Notes', 'Co-Star'],
  ['Messages', 'WhatsApp', 'Signal', 'Discord', 'Bereal'],
  ['Libby', 'Kindle', 'NYT', 'Calm', 'Weather'],
  ['Strava', 'Oura', 'Apple Health', 'MyFitnessPal', 'Spotify'],
  ['Cursor', 'GitHub', 'Figma', 'Linear', 'Slack'],
];

function pickSample() {
  const seed = (Date.now() + Math.floor(Math.random() * 9999)) | 0;
  return SAMPLE_SETS[Math.abs(seed) % SAMPLE_SETS.length];
}

// ---------- boot ----------

function boot() {
  // Fragment replay path — no LLM call, no intake.
  const fragObj = decodeFragment();
  if (fragObj) {
    const result = resultFromFragment(fragObj);
    renderResult(result);
    return;
  }

  // Wire up the intake form.
  const form = $('intake-form');
  const logEl = $('apps-log');
  const sampleBtn = $('sample-btn');
  const resetBtn = $('reset-btn');
  const ownCta = $('own-cta');

  if (logEl) {
    logEl.addEventListener('input', () => { hideError(); updateLineCount(); });
    updateLineCount();
  }

  if (form) {
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      hideError();
      const apps = parseApps(logEl.value);
      submitConfession(apps);
    });
  }

  if (sampleBtn) {
    sampleBtn.addEventListener('click', () => {
      const sample = pickSample();
      if (logEl) {
        logEl.value = sample.join('\n');
        updateLineCount();
      }
      hideError();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      history.replaceState(null, '', location.pathname + location.search);
      showScreen('intake');
    });
  }

  if (ownCta) {
    ownCta.addEventListener('click', (ev) => {
      ev.preventDefault();
      history.replaceState(null, '', location.pathname + location.search);
      showScreen('intake');
      if (logEl) { logEl.value = ''; updateLineCount(); logEl.focus(); }
    });
  }

  showScreen('intake');
}

document.addEventListener('DOMContentLoaded', boot);

// ---------- share (required factory pattern) ----------

function share() {
  if (navigator.share) {
    navigator.share({ title: document.title, url: location.href }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(location.href)
      .then(() => alert('Link copied. Paste it wherever you confess.'))
      .catch(() => alert(location.href));
  } else {
    alert(location.href);
  }
}
window.share = share;
