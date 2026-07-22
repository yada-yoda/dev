// Refreshes clover/fomc.json from the Fed's official FOMC calendar page.
//
// Runs on a schedule from GitHub Actions — no Claude, no server of our own. The
// Fed publishes no machine feed, only this HTML page, so we parse it, but with
// hard guards: a broken parse (e.g. the Fed redesigns the page) can only ABORT,
// never write garbage. The app keeps the last good fomc.json and its built-in
// seed as fallbacks, so data can go stale but never wrong.
//
// Usage:
//   node clover/scripts/refresh-fomc.mjs           # fetch live + write if changed
//   FOMC_HTML_FILE=path node ... --dry              # parse a local file, print only
import { readFileSync, writeFileSync } from 'node:fs';

const FOMC_URL = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
const OUT = new URL('../fomc.json', import.meta.url);
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const iso = (y, mo, d) => y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');

// Parse one meeting row into { start, end, sep } or null (skip notation votes,
// single-day items, anything that isn't a clean DD-DD range).
export function parseMeeting(year, monthRaw, dateRaw) {
  const sep = dateRaw.includes('*');
  const range = dateRaw.replace(/\*/g, '').trim().match(/^(\d{1,2})-(\d{1,2})$/);
  if (!range) return null;
  const d1 = +range[1], d2 = +range[2];
  const parts = monthRaw.split('/').map(s => s.trim().toLowerCase().slice(0, 3));
  const m1 = MONTHS[parts[0]];
  const m2 = parts.length > 1 ? MONTHS[parts[1]] : m1;
  if (m1 == null || m2 == null) return null;
  // A single-month range whose 2nd day is smaller crosses into the next month
  // even when the page didn't spell it "Apr/May" — and a Dec crossing rolls the year.
  const crosses = parts.length > 1 || d2 < d1;
  const endMonth = crosses ? (parts.length > 1 ? m2 : (m1 + 1) % 12) : m1;
  const endYear = year + (crosses && endMonth < m1 ? 1 : 0);
  return { start: iso(year, m1, d1), end: iso(endYear, endMonth, d2), sep };
}

export function parseFomc(html) {
  // Walk year headings and meeting rows in document order; each row belongs to
  // the most recent "20XX FOMC Meetings" heading above it (rows are NOT ordered
  // by year on the page, so position-tracking is required).
  const markers = [];
  for (const m of html.matchAll(/(\d{4}) FOMC Meetings/g)) markers.push({ pos: m.index, year: +m[1] });
  const rowRe = /fomc-meeting__month[^>]*>\s*(?:<strong>)?\s*([A-Za-z/]+)\s*(?:<\/strong>)?\s*<\/div>\s*<div class="fomc-meeting__date[^>]*>\s*([^<]*?)\s*<\/div>/g;
  for (const m of html.matchAll(rowRe)) markers.push({ pos: m.index, month: m[1], date: m[2] });
  markers.sort((a, b) => a.pos - b.pos);

  let curYear = null;
  const out = [];
  const seen = new Set();
  for (const mk of markers) {
    if (mk.year != null) { curYear = mk.year; continue; }
    if (curYear == null) continue;
    const mtg = parseMeeting(curYear, mk.month, mk.date);
    if (!mtg) continue;
    if (seen.has(mtg.start)) continue;
    seen.add(mtg.start);
    out.push(mtg);
  }
  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}

// Reject anything that doesn't look like a real schedule, so a broken parse
// can't overwrite good data. `nowYear` is passed in for testability.
export function validate(meetings, nowYear) {
  const isIso = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
  if (!Array.isArray(meetings) || meetings.length < 8) return 'too few meetings (' + (meetings || []).length + ')';
  for (const m of meetings) {
    if (!isIso(m.start) || !isIso(m.end)) return 'bad date: ' + JSON.stringify(m);
    const gap = (Date.parse(m.end) - Date.parse(m.start)) / 86400000;
    if (gap < 0 || gap > 1) return 'implausible span: ' + JSON.stringify(m);
  }
  const curCount = meetings.filter(m => m.start.startsWith(String(nowYear))).length;
  if (curCount < 7) return 'current year (' + nowYear + ') has only ' + curCount + ' meetings — parse likely broke';
  return null;   // ok
}

async function main() {
  const dry = process.argv.includes('--dry');
  const nowYear = new Date().getUTCFullYear();
  let html;
  if (process.env.FOMC_HTML_FILE) html = readFileSync(process.env.FOMC_HTML_FILE, 'utf8');
  else {
    const r = await fetch(FOMC_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (clover-fomc-refresh; +https://dev.rizzo.cc/clover)' } });
    if (!r.ok) { console.error('fetch failed: ' + r.status); process.exit(1); }
    html = await r.text();
  }
  const all = parseFomc(html);
  // Keep last year onward — enough for calendar back-navigation, without bloat.
  const meetings = all.filter(m => +m.start.slice(0, 4) >= nowYear - 1);
  const err = validate(meetings, nowYear);
  if (err) { console.error('VALIDATION FAILED (not writing): ' + err); process.exit(1); }

  const payload = { updated: new Date().toISOString().slice(0, 10), source: FOMC_URL, meetings };
  const json = JSON.stringify(payload, null, 2) + '\n';
  console.log('Parsed ' + meetings.length + ' meetings, ' + (new Set(meetings.map(m => m.start.slice(0, 4))).size) + ' years, through ' + meetings[meetings.length - 1].start.slice(0, 4) + '.');
  if (dry) { console.log(json); return; }

  let prev = '';
  try { prev = readFileSync(OUT, 'utf8'); } catch (e) {}
  // Compare on meetings only, so the daily `updated` stamp alone never churns a commit.
  const prevMeetings = prev ? JSON.stringify(JSON.parse(prev).meetings) : '';
  if (prevMeetings === JSON.stringify(meetings)) { console.log('No change.'); return; }
  writeFileSync(OUT, json);
  console.log('Wrote ' + OUT.pathname);
}

if (!process.argv.includes('--no-main')) main().catch(e => { console.error(e); process.exit(1); });
