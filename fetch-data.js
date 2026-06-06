#!/usr/bin/env node
/**
 * Pulls the "Unfold Beta — User Survey" responses from Notion, ANONYMIZES them
 * (names → "Tester N", emails removed), and writes data.json for the public site.
 * Zero dependencies — uses Node's built-in https module (Node 18+).
 *
 * Env:
 *   NOTION_TOKEN        (required)  Internal integration secret (ntn_… / secret_…)
 *   NOTION_DATABASE_ID  (optional)  Defaults to the Unfold Beta survey database.
 *
 * Usage:  NOTION_TOKEN=ntn_xxx node fetch-data.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID || '62f33e28-0036-474f-af66-4cc290bbe79b';
const OUT = path.join(__dirname, 'data.json');
const NOTION_VERSION = '2022-06-28';

if (!TOKEN) {
  console.error('ERROR: NOTION_TOKEN env var is required.');
  process.exit(1);
}

/* ---- property name → output key mapping (matched by normalized substring) ---- */
const RATINGS = {
  lookFeel: 'look and feel of the app is calm',
  flow: 'flow between sections',
  tapping: 'tapping the verses',
  noteIcon: 'note icon beside verses',
  onboarding: 'onboarding for unfold was smooth',
  controls: 'font size, light/dark mode',
  scribeVoice: 'scribe sounded like',
  journalEase: 'creating, searching, and revisiting journal',
};
const FEATURES = {
  audio: 'audio bible option',
  twoModes: 'two modes: reading plan mode',
  planCustom: 'reading-plan customization',
  reminders: 'daily reminders / streak',
  printExport: 'print / export journal',
  offline: 'offline reading',
  group: 'group / community reading',
  moreMusic: 'more background music tracks',
  shareImage: 'share a verse as an image',
  watch: 'apple watch companion',
};
const SELECTS = {
  freq: 'bible reading frequency before',
  days: 'days spent actively',
  musicUse: 'background music usage',
  musicPlayer: 'background music player should be',
  scribe: 'how often did you use the scribe',
  journal: 'how often did you use the journal',
};
const MULTI = {
  device: 'devices used during beta',
  exploreLiked: 'ability to read anywhere in scripture',
};
const TEXTS = {
  best: 'single best thing about unfold',
  most: 'feature you used most',
  rarely: 'rarely or never used',
  one: 'one new thing into the app',
  clunky: 'clunky or slow',
  confusing: 'felt confusing',
  stuck: 'got stuck, confused, or frustrated',
  couldnt: 'figure out how to do',
  journalMore: 'make the journal more useful',
  rightMoment: 'felt especially',
  ordering: 'order or grouping of the books',
  translation: 'translation you wish',
  anythingElse: 'want neil and the team to know',
  scribeMiss: 'scribe question you wish',
};

const norm = s => String(s).toLowerCase()
  .replace(/[‘’]/g, "'")
  .replace(/[–—]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

function findProp(props, needle) {
  const n = norm(needle);
  for (const key of Object.keys(props)) {
    if (norm(key).includes(n)) return props[key];
  }
  return null;
}

/* ---- Notion value extractors ---- */
const richText = p => (p && p.rich_text ? p.rich_text.map(t => t.plain_text).join('').trim() : '');
const titleText = p => (p && p.title ? p.title.map(t => t.plain_text).join('').trim() : '');
const numberVal = p => (p && typeof p.number === 'number' ? p.number : null);
const selectVal = p => (p && p.select ? p.select.name : '');
const multiVal = p => (p && p.multi_select ? p.multi_select.map(o => o.name) : []);

function findByType(props, type) {
  for (const key of Object.keys(props)) if (props[key] && props[key].type === type) return props[key];
  return null;
}

function mapPage(page) {
  const p = page.properties || {};
  const out = {
    _submitted: (findByType(p, 'created_time') || {}).created_time || page.created_time,
    r: {}, f: {}, text: {},
  };
  for (const [k, needle] of Object.entries(RATINGS)) out.r[k] = numberVal(findProp(p, needle));
  for (const [k, needle] of Object.entries(FEATURES)) out.f[k] = numberVal(findProp(p, needle));
  for (const [k, needle] of Object.entries(SELECTS)) out[k] = selectVal(findProp(p, needle));
  for (const [k, needle] of Object.entries(MULTI)) out[k] = multiVal(findProp(p, needle));
  for (const [k, needle] of Object.entries(TEXTS)) out.text[k] = richText(findProp(p, needle));
  return out;
}

/* ---- anonymization: never emit names or emails ---- */
const scrubEmail = s => (typeof s === 'string'
  ? s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email removed]')
  : s);

function anonymize(mapped) {
  // Stable "Tester N" numbering by submission time (earliest = Tester 1).
  const order = [...mapped].sort((a, b) => new Date(a._submitted) - new Date(b._submitted));
  const num = new Map(order.map((r, i) => [r, i + 1]));
  return mapped.map(r => {
    const text = {};
    for (const k of Object.keys(r.text)) text[k] = scrubEmail(r.text[k]);
    const { _submitted, ...rest } = r;
    return { name: `Tester ${num.get(r)}`, submitted: _submitted, ...rest, text };
  });
}

function queryNotion(cursor) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    });
    const req = https.request({
      hostname: 'api.notion.com',
      path: `/v1/databases/${DATABASE_ID}/query`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Notion API ${res.statusCode}: ${data}`));
        resolve(JSON.parse(data));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const pages = [];
  let cursor = null;
  do {
    const res = await queryNotion(cursor);
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);

  const responses = anonymize(pages.map(mapPage));

  // Safety net: refuse to write if any email slipped through.
  const blob = JSON.stringify(responses);
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(blob)) {
    console.error('ABORT: an email address survived anonymization. Not writing data.json.');
    process.exit(1);
  }

  // Preserve previous generatedAt when responses are unchanged → no no-op commits.
  let generatedAt = new Date().toISOString();
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    if (JSON.stringify(prev.responses) === JSON.stringify(responses) && prev.generatedAt) {
      generatedAt = prev.generatedAt;
    }
  } catch (_) { /* first run */ }

  const payload = {
    generatedAt,
    source: 'Notion · Unfold Beta — User Survey',
    anonymized: true,
    responses,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${responses.length} anonymized responses to ${OUT}`);
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
