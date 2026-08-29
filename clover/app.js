// ============================================================
// Clover — app shell & routing
// Auth gate, sidebar nav, hash routing, period selectors, and
// (Phase 1) the Settings + Accounts feature views. Remaining
// sections render navigable placeholders until their phase.
// ============================================================

const VERSION = '1.0.152';

// Owner allowlist (client-side convenience gate). The REAL security
// boundary is firestore.rules — this only improves UX by showing a
// friendly "not authorized" screen instead of silent permission errors.
// Leave empty during first-run setup; the app shows your account ID so
// you can lock both this and firestore.rules to it.
const OWNER_UIDS = ['I8IKdH8q6XW34vIc4ZkwNj2roVu1'];

// Grouped by what you're actually doing: log money in, log money out, then look
// at it, then set it up. Pages you visit daily sit above pages you visit
// occasionally — Raises and Credit & Rates are read-only analysis, and Accounts
// is something you configure once, so none of them belong in the daily-log flow.
const ROUTES = [
  { id: 'dashboard',     label: 'Dashboard',      ico: '◆', phase: 6 },
  { group: 'Money in' },
  { id: 'income',        label: 'Income',         ico: '▲', phase: 2 },
  { id: 'paychecks',     label: 'Paychecks',      ico: '▤', phase: 4 },
  { id: 'selling',       label: 'Selling',        ico: '▧', phase: 9 },
  { id: 'settlements',   label: 'Class Actions',  ico: '⚖', phase: 10 },
  { group: 'Money out' },
  { id: 'expenses',      label: 'Expenses',       ico: '▼', phase: 3 },
  { id: 'subscriptions', label: 'Bills & Subscriptions', ico: '↻', phase: 3 },
  { id: 'budget',        label: 'Budget',         ico: '◐', phase: 10 },
  { group: 'Insights' },
  { id: 'reports',       label: 'Reports',        ico: '▥', phase: 7 },
  { id: 'calendar',      label: 'Calendar',       ico: '▣', phase: 7 },
  { id: 'raises',        label: 'Raises',         ico: '↗', phase: 9 },
  { id: 'credit',        label: 'Credit & Rates', ico: '％', phase: 5 },
  { id: 'taxes',         label: 'Taxes',          ico: '§', phase: 9 },
  { group: 'Setup' },
  { id: 'accounts',      label: 'Accounts',       ico: '▦', phase: 1 },
  { id: 'import',        label: 'Import / Export', ico: '⇅', phase: 8 },
  { id: 'settings',      label: 'Settings',       ico: '⚙', phase: 1 },
  { id: 'help',          label: 'Help / Guide',   ico: '?', phase: 1 }
];
const DEFAULT_ROUTE = 'dashboard';

let currentUser = null;
let currentRoute = null;
let storeReady = false;
let activeYear = new Date().getFullYear();
let activeMonth = 0;                 // 0 = All months
let incomeTab = 'grid';             // 'grid' | 'list'
let incomeAmountMode = 'gross';     // annual grid shows 'gross' | 'net' amounts
let incomeCatFilter = 'all';
let accountsSort = { key: 'name', dir: 'asc' };
let accountsFilter = null;   // { key, value } from clicking a value badge
let accountsCdTimeline = false;   // CD maturity timeline shown (separate from the value filter)
let accountsTab = 'open';    // Accounts page: 'open' | 'closed'
let subsSort = { key: 'monthly', dir: 'desc' };
let subsCatFilter = 'all';
let subsStatusFilter = 'active';   // 'active' | 'all'
let subPriceSel = null;            // which bill's price history the chart shows
let subsSearch = '';               // live search over the bills table
let subsBadgeFilter = null;        // { key, value } from clicking a subs value badge
let budgetReconMonth = null;       // Budget check-in target month (0-based, within activeYear); null = auto (prev month)
let settleSort = { key: 'dateFiled', dir: 'desc' };
let settleSearch = '';             // live search over the settlements table
let settleStatusFilter = 'all';    // 'all' | a specific status
let settleBadgeFilter = null;      // { key, value } from clicking a settlement value bubble
let taxesSort = { key: 'taxYear', dir: 'desc' };
let salesSort = { key: 'orderDate', dir: 'desc' };
let salesImportState = null;   // parsed Poshmark sales awaiting review
let expenseTab = 'grid';           // 'grid' | 'list'
let expenseCatFilter = 'all';
let expenseListSort = { key: 'date', dir: 'desc' };
let expenseBadgeFilter = null;     // { key, value } from clicking an expense value bubble
let expenseSearch = '';            // live search over the expense list (vendor, description, notes…)
let expenseIncludeRecurring = true;  // roll active bills into the expense grid
let paycheckSort = { key: 'payDate', dir: 'desc' };
let paycheckStatusFilter = 'all';
let paycheckSel = new Set();       // selected paycheck ids for bulk edit
let paycheckSelYear = null;
let paycheckAllYears = false;      // paychecks "All" tab: show every year at once
let paycheckView = 'current';      // paychecks table: 'current' (+missing) | 'upcoming'
let creditTab = 'credit';   // 'credit' | 'rates'
const expandedIncomeGroups = new Set();
const expandedPcEmployers = new Set();   // income grid: category ids whose Paychecks row shows per-employer detail
const expandedInterestBuckets = new Set();   // income grid: '<catId>|<bucket>' whose Interest bucket shows per-account detail
const expandedExpenseGroups = new Set();

// ---------- boot ----------
document.getElementById('ver').textContent = VERSION;
document.title = 'Clover v' + VERSION + ' — Personal Finance';
buildNav();
buildPeriodSelectors();
wireChrome();
wireModal();

// Re-render the active view whenever store data changes.
if (window.cloverStore) {
  window.cloverStore.subscribe(() => { storeReady = window.cloverStore.isLoaded(); refreshYearOptions(); if (currentRoute) renderView(currentRoute); });
}

window.addEventListener('cloverAuthChanged', (e) => {
  currentUser = e.detail;
  renderAuthState();
});

// Safety net: if the auth bridge already resolved before this listener
// attached, pull the current state directly.
if (window.cloverAuth && window.cloverAuth.currentUser()) {
  currentUser = window.cloverAuth.currentUser();
  renderAuthState();
}

// Public reference data (FOMC dates) — fetched independently of sign-in.
loadFomc();

function renderAuthState() {
  const gate = document.getElementById('signin-gate');
  const app  = document.getElementById('app');
  if (currentUser) {
    gate.classList.add('hidden');
    app.classList.remove('hidden');
    const av = document.getElementById('user-avatar');
    av.src = currentUser.photoURL || '';
    document.getElementById('user-name').textContent = currentUser.displayName || currentUser.email || '';
    // Load the owner's data once (store notifies -> re-render on completion).
    if (window.cloverStore && ownerState() === 'owner' && !window.cloverStore.isLoaded()) {
      window.cloverStore.load(currentUser.uid).then(() =>
        window.cloverStore.setSelfNameFromDisplay(currentUser.displayName || currentUser.email || ''));
    }
    routeTo(location.hash.slice(1) || DEFAULT_ROUTE);
  } else {
    app.classList.add('hidden');
    gate.classList.remove('hidden');
  }
}

// ---------- nav ----------
function buildNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  for (const r of ROUTES) {
    if (r.group) { const g = document.createElement('div'); g.className = 'nav-group'; g.textContent = r.group; nav.appendChild(g); continue; }
    if (r.sep) { const d = document.createElement('div'); d.className = 'nav-sep'; nav.appendChild(d); continue; }
    const a = document.createElement('a');
    a.href = '#' + r.id;
    a.dataset.route = r.id;
    a.innerHTML = `<span class="ico">${r.ico}</span> ${r.label}`;
    nav.appendChild(a);
  }
}

window.addEventListener('hashchange', () => {
  if (currentUser) routeTo(location.hash.slice(1) || DEFAULT_ROUTE);
});

function routeTo(id) {
  const route = ROUTES.find(r => r.id === id) || ROUTES.find(r => r.id === DEFAULT_ROUTE);
  currentRoute = route;
  document.querySelectorAll('.nav a').forEach(a =>
    a.classList.toggle('active', a.dataset.route === route.id));
  document.getElementById('view-title').textContent = route.label;
  closeDrawer();
  renderView(route);
}

// Feature views (P1-7 + P8 import/export).
const LIVE_VIEWS = { dashboard: renderDashboard, settings: renderSettings, accounts: renderAccounts, income: renderIncome, subscriptions: renderSubscriptions, budget: renderBudget, expenses: renderExpenses, paychecks: renderPaychecks, raises: renderRaises, selling: renderSelling, settlements: renderSettlements, credit: renderCredit, taxes: renderTaxes, reports: renderReports, calendar: renderCalendar, import: renderImport, help: renderHelp };
let calCursor = null;   // { year, month } for the calendar view

// 'setup'  = not yet locked to an owner UID (show account ID to finish setup)
// 'owner'  = signed-in user is an allowlisted owner (normal use)
// 'denied' = signed in, but not the owner (private account)
function ownerState() {
  if (!window.cloverConfigured) return 'setup';
  if (OWNER_UIDS.length === 0) return 'setup';
  if (currentUser && OWNER_UIDS.includes(currentUser.uid)) return 'owner';
  return 'denied';
}

// CDs sitting past their maturity date, still open (not closed/consolidated).
// Clover NEVER auto-closes these — they wait here until you renew or update them.
function maturedCds(store) {
  return store.state.accounts
    .filter(a => a.type === 'CD' && !a.closed && !a.consolidatedIntoId && a.cdMaturity && daysUntil(a.cdMaturity) < 0)
    .sort((x, y) => (x.cdMaturity || '').localeCompare(y.cdMaturity || ''));
}
// Top-right bell: count + dropdown of CDs needing attention. Recomputed on every
// render (renderView runs on data change + navigation).
function renderNotifications() {
  const bell = document.getElementById('notif-bell');
  const countEl = document.getElementById('notif-count');
  const panel = document.getElementById('notif-panel');
  const wrapEl = document.getElementById('notif-wrap');
  if (!bell || !panel) return;
  const store = window.cloverStore;
  // Bell can be turned off entirely under Settings → Notifications (default on).
  const settings = (store && store.state && store.state.settings) || {};
  const bellOn = settings.showNotifBell !== false;
  if (wrapEl) wrapEl.classList.toggle('hidden', !bellOn);
  if (!bellOn) { panel.classList.add('hidden'); return; }
  const loaded = store && store.isLoaded && store.isLoaded() && ownerState() === 'owner';
  const matured = loaded ? maturedCds(store) : [];
  const n = matured.length;
  countEl.textContent = n > 9 ? '9+' : String(n);
  countEl.classList.toggle('hidden', n === 0);
  bell.classList.toggle('has-notif', n > 0);
  panel.innerHTML = '';
  panel.appendChild(el('div', 'notif-head', 'Notifications'));
  if (!n) { panel.appendChild(el('div', 'notif-empty muted', loaded ? 'All caught up \u2014 nothing needs attention.' : 'Nothing yet.')); return; }
  panel.appendChild(el('div', 'notif-sub muted', 'A matured CD stays open until you act \u2014 Clover never closes it or assumes it\u2019s closed.'));
  matured.forEach(a => {
    const row = el('div', 'notif-item');
    row.appendChild(el('div', 'notif-item-t', a.name + (a.last4 ? ' \u2022\u2022' + a.last4 : '')));
    const d = -daysUntil(a.cdMaturity);
    row.appendChild(el('div', 'muted', 'Matured ' + fmtDate(a.cdMaturity) + ' \u00b7 ' + d + ' day' + (d === 1 ? '' : 's') + ' ago'));
    const btn = el('button', 'btn-ghost', '\u21bb Renew / update');
    btn.addEventListener('click', () => { panel.classList.add('hidden'); accountModal(a); });
    row.appendChild(btn);
    panel.appendChild(row);
  });
}
// clover-worker: emails a reminder about CDs that have already matured and are
// waiting on you (complements the Google-Calendar 7-days-ahead reminder). The
// browser is the only reader of Firestore; it pushes just this minimal payload,
// keyed by uid and Firebase-ID-token authenticated. Opt-in via Settings →
// Calendar. Guarded by a signature so a POST only fires when the matured set or
// the toggle actually changes; silently no-ops if the Worker isn't reachable.
const CLOVER_WORKER = 'https://clover-worker.sevendwarfs.workers.dev';
let _cdSyncSig = null;
async function syncCdReminders(force) {
  const store = window.cloverStore;
  if (!store || !store.isLoaded || !store.isLoaded() || ownerState() !== 'owner') return;
  const user = window.cloverAuth && window.cloverAuth.currentUser();
  if (!user || typeof user.getIdToken !== 'function') return;
  const g = store.state.settings.gcal || {};
  const enabled = g.cdMaturedEmail !== false;   // default on; needs clover-worker deployed
  const email = user.email || '';
  const items = (enabled ? maturedCds(store) : []).map(a => ({
    key: a.id + '|' + (a.cdMaturity || ''),
    name: a.name + (a.last4 ? ' ••' + a.last4 : ''),
    maturity: a.cdMaturity ? fmtDate(a.cdMaturity) : '',
    principal: (a.cdPrincipal != null && a.cdPrincipal !== '') ? money(Number(a.cdPrincipal)) : ''
  }));
  const sig = (enabled ? '1' : '0') + '|' + email + '|' + items.map(i => i.key).join(',');
  if (!force && sig === _cdSyncSig) return;
  _cdSyncSig = sig;
  try {
    const token = await user.getIdToken();
    await fetch(CLOVER_WORKER + '/cd/sync', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, email, items })
    });
  } catch (e) { _cdSyncSig = null; /* network error — let the next render retry */ }
}

function renderView(route) {
  const view = document.getElementById('view');
  view.innerHTML = '';
  renderNotifications();
  syncCdReminders();
  syncTopSearch(route);
  const state = ownerState();
  if (state === 'denied') { view.appendChild(deniedPanel()); return; }
  if (state === 'setup') view.appendChild(setupBanner());

  const feature = LIVE_VIEWS[route.id];
  if (feature && state === 'owner') {
    if (!window.cloverStore.isLoaded()) { view.appendChild(loadingPanel()); return; }
    feature(view);
    return;
  }

  const p = document.createElement('div');
  p.className = 'placeholder';
  p.innerHTML =
    `<div class="ph-ico">${route.ico}</div>
     <h3>${route.label}</h3>
     <p>This section is part of the phased build. The app shell, navigation,
        and Google sign-in are live now.</p>
     <span class="phase-tag">Arrives in Phase ${route.phase}</span>`;
  view.appendChild(p);
}

function loadingPanel() {
  const d = document.createElement('div');
  d.className = 'placeholder';
  d.innerHTML = `<div class="ph-ico">◔</div><h3>Loading…</h3><p>Fetching your data.</p>`;
  return d;
}

// Shown until the app is locked to an owner UID. Surfaces the signed-in
// user's account ID so it can be copied into the allowlist.
function setupBanner() {
  const d = document.createElement('div');
  d.className = 'setup-note';
  const uid = currentUser ? currentUser.uid : '(signing in…)';
  d.innerHTML =
    `<strong>Almost set up.</strong> Saving is disabled until Clover is locked to your
     account. Send this account ID to finish setup:
     <div class="uid-row"><code id="owner-uid">${uid}</code>
       <button class="btn-ghost" id="copy-uid" type="button">Copy</button></div>`;
  const btn = d.querySelector('#copy-uid');
  if (btn) btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(uid);
      btn.textContent = 'Copied ✓';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    } catch (e) {
      const r = document.createRange();
      r.selectNode(d.querySelector('#owner-uid'));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
  });
  return d;
}

// Shown when a non-owner signs into a locked, private instance.
function deniedPanel() {
  const d = document.createElement('div');
  d.className = 'placeholder';
  d.innerHTML =
    `<div class="ph-ico">🔒</div>
     <h3>Not authorized</h3>
     <p>This is a private account. You're signed in as
        <strong>${(currentUser && currentUser.email) || ''}</strong>, which isn't the
        owner of this data.</p>`;
  return d;
}

// ---------- period selectors ----------
// Every year selector in the app draws from this one list: 2020 through next
// year automatically (rolls forward each January), plus any years added
// manually in Settings -> Years (for back-filling older history).
function yearsAvailable() {
  const thisYear = new Date().getFullYear();
  const ys = new Set();
  for (let y = thisYear + 1; y >= 2020; y--) ys.add(y);
  const st = window.cloverStore && window.cloverStore.state;
  (((st && st.settings) || {}).extraYears || []).forEach(y => { if (+y) ys.add(+y); });
  return [...ys].sort((a, b) => b - a);
}
function refreshYearOptions() {
  const ySel = document.getElementById('sel-year');
  if (!ySel || !ySel.options.length) return;
  const want = yearsAvailable();
  const have = [...ySel.options].map(o => +o.value);
  if (want.length === have.length && want.every((y, i) => y === have[i])) return;
  const cur = +ySel.value;
  ySel.innerHTML = '';
  want.forEach(y => { const o = document.createElement('option'); o.value = y; o.textContent = y; ySel.appendChild(o); });
  ySel.value = String(want.includes(cur) ? cur : new Date().getFullYear());
}
function buildPeriodSelectors() {
  const ySel = document.getElementById('sel-year');
  const mSel = document.getElementById('sel-month');
  const now = new Date();
  const thisYear = now.getFullYear();
  yearsAvailable().forEach(y => {
    const o = document.createElement('option'); o.value = y; o.textContent = y;
    if (y === thisYear) o.selected = true; ySel.appendChild(o);
  });
  const months = ['All','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  months.forEach((m, i) => {
    const o = document.createElement('option'); o.value = i; o.textContent = m;
    if (i === 0) o.selected = true; mSel.appendChild(o);   // default to All
  });
  activeYear = +ySel.value; activeMonth = +mSel.value;
}

function onPeriodChange() {
  activeYear = +document.getElementById('sel-year').value;
  activeMonth = +document.getElementById('sel-month').value;
  paycheckAllYears = false;   // picking a specific year exits the paychecks "All" view
  if (currentRoute) renderView(currentRoute);
}
function setActiveYear(y) {
  activeYear = y;
  const sel = document.getElementById('sel-year'); if (sel) sel.value = String(y);
  renderView(currentRoute);
}
// Point the app at a specific month (0-indexed) and re-render, keeping the
// top-bar Year/Month selectors in step. Used by the dashboard month navigator.
function goDashMonth(year, monthIdx0) {
  activeYear = year;
  activeMonth = monthIdx0 + 1;   // selectors + focusMonth are 1-indexed (0 = All)
  const yS = document.getElementById('sel-year'); if (yS) yS.value = String(year);
  const mS = document.getElementById('sel-month'); if (mS) mS.value = String(activeMonth);
  paycheckAllYears = false;
  renderView(currentRoute);
}
// Step the dashboard's focus month by ±1, rolling over year boundaries. Clamped
// forward at the current month (the dashboard is an actuals snapshot) and back
// at 2020 (the earliest year the selectors offer).
function stepDashMonth(delta) {
  const now = new Date(), cy = now.getFullYear();
  let m = activeMonth > 0 ? activeMonth - 1 : (activeYear === cy ? now.getMonth() : 11);
  let y = activeYear;
  m += delta;
  if (m < 0) { m = 11; y -= 1; }
  else if (m > 11) { m = 0; y += 1; }
  if (y > cy || (y === cy && m > now.getMonth())) { y = cy; m = now.getMonth(); }
  if (y < 2020) { y = 2020; m = 0; }
  goDashMonth(y, m);
}
// Loads the year range once so we know which years have data (for year tabs).
let _yearsScanned = false;
function ensureYearsScanned(store) {
  if (_yearsScanned) return;
  const cur = new Date().getFullYear();
  let allLoaded = true;
  for (const y of yearsAvailable()) { if (!store.isYearLoaded(y)) { allLoaded = false; store.loadYear(y); } }
  if (allLoaded) _yearsScanned = true;
}
// A row of year tabs for a per-year section, shown only when >1 year has data.
function yearTabs(store, section) {
  ensureYearsScanned(store);
  const years = [];
  for (const y of yearsAvailable()) {
    if (!store.isYearLoaded(y)) continue;
    const d = store.yearData(y);
    const has = section === 'income' ? (d.income.length || d.paychecks.length)
      : section === 'expenses' ? d.expensePayments.length
      : section === 'selling' ? ((d.sales || []).length)
      : section === 'reports' ? (d.income.length || d.paychecks.length || d.expensePayments.length || (d.sales || []).length)
      : d.paychecks.length;
    if (has) years.push(y);
  }
  if (!years.includes(activeYear)) years.push(activeYear);
  years.sort((a, b) => b - a);
  if (years.length < 2) return null;
  const strip = el('div', 'year-tabs');
  if (section === 'paychecks') {
    const allBtn = el('button', 'ytab' + (paycheckAllYears ? ' active' : ''), 'All');
    allBtn.addEventListener('click', () => { paycheckAllYears = true; renderView(currentRoute); });
    strip.appendChild(allBtn);
  }
  years.forEach(y => {
    const b = el('button', 'ytab' + (!paycheckAllYears && y === activeYear ? ' active' : ''), String(y));
    b.addEventListener('click', () => { paycheckAllYears = false; setActiveYear(y); });
    strip.appendChild(b);
  });
  return strip;
}

// ---------- chrome wiring ----------
function wireChrome() {
  const errEl = document.getElementById('gate-error');
  document.getElementById('btn-signin').addEventListener('click', async () => {
    errEl.classList.add('hidden');
    try {
      await window.cloverAuth.signIn();
    } catch (e) {
      errEl.textContent = friendlyAuthError(e);
      errEl.classList.remove('hidden');
    }
  });
  document.getElementById('btn-signout').addEventListener('click', () => window.cloverAuth.signOut());
  document.getElementById('menu-btn').addEventListener('click', toggleDrawer);
  document.getElementById('sidebar-backdrop').addEventListener('click', closeDrawer);
  document.getElementById('sel-year').addEventListener('change', onPeriodChange);
  document.getElementById('sel-month').addEventListener('change', onPeriodChange);
  const bell = document.getElementById('notif-bell');
  if (bell) {
    bell.addEventListener('click', ev => { ev.stopPropagation(); document.getElementById('notif-panel').classList.toggle('hidden'); });
    document.addEventListener('click', ev => { const w = document.getElementById('notif-wrap'); if (w && !w.contains(ev.target)) document.getElementById('notif-panel').classList.add('hidden'); });
  }
  // Top-right search drives whichever list page you're on that supports search
  // (Expenses, Bills, Class Actions). syncTopSearch() keeps its text + placeholder
  // in step as you navigate; on other pages it's a no-op with a generic hint.
  const gsearch = document.getElementById('search');
  if (gsearch) {
    gsearch.addEventListener('input', () => {
      const q = gsearch.value, id = currentRoute && currentRoute.id;
      if (id === 'expenses') expenseSearch = q;
      else if (id === 'subscriptions') subsSearch = q;
      else if (id === 'settlements') settleSearch = q;
      else return;
      renderView(currentRoute);
      const n = document.getElementById('search'); if (n) { n.focus(); const L = n.value.length; try { n.setSelectionRange(L, L); } catch (e) {} }
    });
  }
}
// Reflect the current page's search term + a page-specific placeholder in the
// top-right box, so navigating between pages doesn't leave stale text there.
function syncTopSearch(route) {
  const box = document.getElementById('search'); if (!box) return;
  const id = route && route.id;
  if (id === 'expenses') { box.value = expenseSearch; box.placeholder = 'Search expenses…'; }
  else if (id === 'subscriptions') { box.value = subsSearch; box.placeholder = 'Search bills…'; }
  else if (id === 'settlements') { box.value = settleSearch; box.placeholder = 'Search Class Actions…'; }
  else { box.value = ''; box.placeholder = 'Search…'; }
}

function toggleDrawer() {
  const open = document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('show', open);
}
function closeDrawer() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('show');
}

function friendlyAuthError(e) {
  switch (e && e.code) {
    case 'auth/unauthorized-domain':
      return "This domain isn't authorized yet. In Firebase → Authentication → Settings → Authorized domains, add this site's domain.";
    case 'auth/operation-not-allowed':
      return 'Google sign-in isn’t enabled yet. Turn it on in Firebase → Authentication → Sign-in method → Google.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Allow popups for this site and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    default:
      return 'Sign-in failed: ' + ((e && e.message) || 'unknown error');
  }
}

// ============================================================
// Small DOM helpers
// ============================================================
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
// Hints should say WHY the field exists and give a concrete example — see
// [[feedback_field_tooltips]]. Use setFieldHint when a field's meaning changes
// with context (e.g. an expense that's really a transfer).
function field(label, node, hint) {
  const w = el('label', 'field');
  const lab = el('span', null, label);
  if (hint) { const i = el('span', 'info', 'ⓘ'); i.title = hint; lab.appendChild(document.createTextNode(' ')); lab.appendChild(i); }
  w.appendChild(lab); w.appendChild(node.__wrap || node); return w;
}
function setFieldHint(fieldEl, hint) { const i = fieldEl && fieldEl.querySelector('.info'); if (i) i.title = hint; }

// ---- per-record edit history (the "History" tab on edit modals) ----
// The store logs raw field keys/ids; these turn that into something readable.
const HIST_LABELS = {
  date: 'Date', payDate: 'Pay date', receivedDate: 'Received date', forDate: 'Applies to', dateFiled: 'Filed',
  amount: 'Amount', gross: 'Gross', net: 'Net', title: 'Description', vendor: 'Vendor', name: 'Name',
  categoryId: 'Category', incomeCategoryId: 'Income category', subId: 'Subcategory',
  accountId: 'Account', toAccountId: 'Moved to', fromAccountId: 'From account', backupAccountId: 'Backup account',
  personId: 'Person', recurringId: 'Linked bill', notes: 'Notes', status: 'Status', checkNo: 'Check #',
  apy: 'APY', apyAsOf: 'APY as of', cdApy: 'CD APY', closed: 'Closed', closedDate: 'Date closed', active: 'Active',
  budgetEst: 'Budget placeholder', autoPay: 'Auto-pay', frequency: 'Frequency', renewalDate: 'Renewal date',
  priority: 'Priority', taxable: 'Taxable', method: 'Method', employer: 'Employer', claimNumber: 'Claim #',
  gallons: 'Gallons', pricePerGallon: 'Price / gallon',
  cdTerm: 'CD term', cdMaturity: 'CD maturity', last4: 'Last 4',
  cdStart: 'CD start', cdStartEst: 'Start estimated', cdPrincipal: 'CD principal', consolidatedIntoId: 'Consolidated into',
  balance: 'Balance', consolidatedIn: 'Consolidated in'
};
function prettyKey(k) { return k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).replace(/\s*Id\b/, '').trim(); }
function histFieldLabel(f) { return HIST_LABELS[f] || prettyKey(f); }
// Dollar-valued fields, so history reads "$42.80 → $51.25" and not "42.8".
const HIST_MONEY = new Set(['amount', 'gross', 'net', 'prevAmount', 'yearGross', 'yearNet', 'fedAmount', 'stateAmount', 'prepCost', 'orderPrice', 'earnings', 'costPrice', 'expectedAmount', 'fedWithheld', 'stateWithheld', 'price', 'cdPrincipal', 'balance']);
// Stored history holds raw values (ids, booleans) — resolve them to names.
function histValueText(store, field, v) {
  if (v === '' || v == null) return '—';
  if (HIST_MONEY.has(field) && v !== '' && !isNaN(parseFloat(v))) return '$' + Number(v).toFixed(2);
  if (/^(accountId|toAccountId|fromAccountId|backupAccountId|consolidatedIntoId)$/.test(field)) return store.accountName(v) || String(v);
  if (field === 'personId') return store.personName(v) || String(v);
  if (field === 'recurringId') { const r = (store.state.recurring || []).find(x => x.id === v); return r ? r.name : String(v); }
  if (field === 'categoryId' || field === 'incomeCategoryId') {
    const a = store.expenseGroupName(v), b = store.incomeGroupName(v);
    return (a && a !== '—') ? a : ((b && b !== '—') ? b : String(v));
  }
  if (field === 'subId') {
    for (const cats of [store.state.expenseCategories || [], store.state.incomeCategories || []]) {
      for (const c of cats) { const s = (c.subs || []).find(x => x.id === v); if (s) return s.name; }
    }
    return String(v);
  }
  if (v === true || v === 'true') return 'Yes';
  if (v === false || v === 'false') return 'No';
  return String(v);
}
function historyPanel(store, item) {
  const p = el('div', 'hist-panel');
  if (item.createdAt) p.appendChild(el('div', 'muted', 'Added ' + fmtDateTimeLocal(item.createdAt)));
  const hist = (item.history || []).slice().reverse();   // newest first
  if (!hist.length) {
    p.appendChild(el('p', 'muted', 'No edits yet — this is exactly as it was first saved.'));
    return p;
  }
  const list = el('div', 'hist-list');
  hist.forEach(h => {
    const card = el('div', 'hist-entry');
    card.appendChild(el('div', 'hist-when', fmtDateTimeLocal(h.at) + (h.l4 ? ' · ••' + h.l4 : '')));
    (h.changes || []).forEach(c => {
      const row = el('div', 'hist-change');
      row.appendChild(el('span', 'hist-field', histFieldLabel(c.f)));
      row.appendChild(el('span', 'hist-from', histValueText(store, c.f, c.from)));
      row.appendChild(el('span', 'hist-arrow', '→'));
      row.appendChild(el('span', 'hist-to', histValueText(store, c.f, c.to)));
      card.appendChild(row);
    });
    list.appendChild(card);
  });
  p.appendChild(list);
  return p;
}
// Wraps a modal body with Details | History tabs. Only for saved records —
// a brand-new one has nothing to show yet.
function withHistoryTab(bodyEl, existing, extra) {
  const store = window.cloverStore;
  if (!existing || !existing.id) return bodyEl;
  const wrap = el('div');
  const tabs = el('div', 'tabs');
  const n = (existing.history || []).length;
  const dBtn = el('button', 'tab active', 'Details');
  const hBtn = el('button', 'tab', 'History' + (n ? ' (' + n + ')' : ''));
  const panel = historyPanel(store, existing);
  panel.style.display = 'none';
  // Optional record-specific tab (e.g. a CD's Renewals) slots between Details
  // and the generic edit History: extra = { label, panel }.
  const xBtn = extra ? el('button', 'tab', extra.label) : null;
  const xPanel = extra ? extra.panel : null;
  if (xPanel) xPanel.style.display = 'none';
  const show = which => {
    // Switching to a short tab would otherwise collapse the modal — jarring
    // when you're just peeking. Measure the form WHILE it's still on screen and
    // floor the wrapper there (min-height, so Details can still grow when
    // fields reveal themselves).
    if (which !== 'details') { const h = wrap.offsetHeight; if (h > 0) wrap.style.minHeight = h + 'px'; }
    dBtn.classList.toggle('active', which === 'details');
    hBtn.classList.toggle('active', which === 'hist');
    if (xBtn) xBtn.classList.toggle('active', which === 'extra');
    bodyEl.style.display = which === 'details' ? '' : 'none';
    panel.style.display = which === 'hist' ? '' : 'none';
    if (xPanel) xPanel.style.display = which === 'extra' ? '' : 'none';
  };
  dBtn.addEventListener('click', ev => { ev.preventDefault(); show('details'); });
  hBtn.addEventListener('click', ev => { ev.preventDefault(); show('hist'); });
  if (xBtn) xBtn.addEventListener('click', ev => { ev.preventDefault(); show('extra'); });
  tabs.appendChild(dBtn); if (xBtn) tabs.appendChild(xBtn); tabs.appendChild(hBtn);
  wrap.appendChild(tabs); wrap.appendChild(bodyEl); if (xPanel) wrap.appendChild(xPanel); wrap.appendChild(panel);
  return wrap;
}
// Dollar amounts always show 2 decimals (21.20, not 21.2; 21 becomes 21.00) —
// a raw number input drops the trailing zero, which reads wrong for money.
function attachMoneyDp(i, value, dp) {
  if (value != null && value !== '' && !isNaN(Number(value))) i.value = Number(value).toFixed(dp);
  i.step = (1 / Math.pow(10, dp)).toFixed(dp); i.inputMode = 'decimal';
  i.addEventListener('blur', () => { const n = parseFloat(i.value); if (i.value !== '' && !isNaN(n)) i.value = n.toFixed(dp); });
  return i;
}
function attachMoney2dp(i, value) { return attachMoneyDp(i, value, 2); }
// A currency field: $ sits inside the box so it's obvious the value is USD.
// Callers keep using .value; field() renders the wrapper via __wrap.
// dp defaults to the 2-decimal money standard. Pump prices are the one real
// exception — they're quoted to a tenth of a cent ($3.499), and rounding that to
// $3.50 would stop price x gallons from ever tying out to the receipt total.
function moneyInput(value, attrs = {}, dp = 2) {
  const i = attachMoneyDp(input('', Object.assign({ type: 'number', placeholder: (0).toFixed(dp) }, attrs)), value, dp);
  const wrap = el('div', 'money-input');
  wrap.appendChild(el('span', 'money-pre', '$'));
  wrap.appendChild(i);
  i.__wrap = wrap;
  return i;
}
function input(value = '', attrs = {}) {
  const i = document.createElement('input');
  i.type = attrs.type || 'text'; i.value = value;
  if (attrs.placeholder) i.placeholder = attrs.placeholder;
  if (attrs.list) i.setAttribute('list', attrs.list);
  return i;
}
function select(options, value) {
  const s = document.createElement('select');
  options.forEach(o => { const opt = el('option'); opt.value = typeof o === 'object' ? o.value : o; opt.textContent = typeof o === 'object' ? o.label : o; if (opt.value === value) opt.selected = true; s.appendChild(opt); });
  return s;
}
function checkbox(label, checked, hint) {
  const w = el('label', 'check'); const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!checked;
  w.appendChild(c); w.appendChild(document.createTextNode(' ' + label));
  if (hint) { const i = el('span', 'info', 'ⓘ'); i.title = hint; w.appendChild(document.createTextNode(' ')); w.appendChild(i); w.title = hint; }
  w.__input = c; return w;
}
function badge(text, tone) { return el('span', 'badge ' + (tone || ''), text); }

// A day-of-month field (1–31) with a "Last day" checkbox. Value is a number,
// the string 'last', or null. Read via the returned element's __value().
function dayField(label, hint, value) {
  const num = input(value === 'last' ? '' : (value || ''), { type: 'number', placeholder: '1–31' });
  num.min = 1; num.max = 31;
  const wrap = field(label, num, hint);
  const last = checkbox('Last day', value === 'last');
  const sync = () => { num.disabled = last.__input.checked; if (last.__input.checked) num.value = ''; };
  last.__input.addEventListener('change', sync); sync();
  wrap.appendChild(last);
  wrap.__value = () => last.__input.checked ? 'last'
    : (num.value === '' ? null : (Math.min(31, Math.max(1, parseInt(num.value, 10) || 0)) || null));
  return wrap;
}

// ---- Reusable sortable table ----
// cols: [{ label, key?, num?, sortable?, cell(row)->td, value?(row)->sortkey }]
// sort: { key, dir:'asc'|'desc' }; onSort(newSort) re-renders. rowClass optional.
function sortRows(rows, cols, sort) {
  if (!sort || !sort.key) return rows.slice();
  const col = cols.find(c => c.key === sort.key); if (!col || !col.value) return rows.slice();
  const dir = sort.dir === 'desc' ? -1 : 1;
  return rows.slice().sort((a, b) => {
    let va = col.value(a), vb = col.value(b);
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    va = (va == null ? '' : String(va)).toLowerCase(); vb = (vb == null ? '' : String(vb)).toLowerCase();
    return va < vb ? -dir : va > vb ? dir : 0;
  });
}
function sortableTable(cols, rows, sort, onSort, rowClass) {
  const table = el('table', 'data-table');
  const thead = el('thead'), htr = el('tr');
  cols.forEach(c => {
    const th = el('th', c.num ? 'num' : null);
    const canSort = c.sortable !== false && c.key && c.value;
    if (c.headCell) {
      th.appendChild(c.headCell());
      htr.appendChild(th);
      return;
    }
    if (canSort) {
      th.classList.add('sortable');
      const active = sort && sort.key === c.key;
      th.textContent = c.label + ' ';
      const caret = el('span', 'sort-caret', active ? (sort.dir === 'desc' ? '▼' : '▲') : '⇅');
      if (!active) caret.classList.add('idle');
      th.appendChild(caret);
      th.title = 'Click to sort · again to flip · a third time to reset';
      th.addEventListener('click', () => {
        if (active && sort.dir === 'desc') { onSort(null); return; }   // third click = back to default
        onSort({ key: c.key, dir: (active && sort.dir === 'asc') ? 'desc' : 'asc' });
      });
    } else { th.textContent = c.label || ''; }
    htr.appendChild(th);
  });
  thead.appendChild(htr); table.appendChild(thead);
  const tb = el('tbody');
  sortRows(rows, cols, sort).forEach(r => {
    const tr = el('tr'); const cl = rowClass && rowClass(r); if (cl) tr.className = cl;
    cols.forEach(c => tr.appendChild(c.cell(r)));
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  return table;
}

// ============================================================
// Modal + toast (house rules: no backdrop close; toasts top-center)
// ============================================================
let modalConfirmHandler = null;
function wireModal() {
  document.getElementById('modal-x').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-confirm').addEventListener('click', async () => {
    if (modalConfirmHandler) { const ok = await modalConfirmHandler(); if (ok === false) return; }
    closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('modal-host').classList.contains('hidden')) closeModal();
  });
  // Intentionally NO backdrop-click close for data-entry modals.
}
function openModal({ title, body, confirmLabel = 'Save', onConfirm = null, hideConfirm = false }) {
  document.getElementById('modal-title').textContent = title;
  const b = document.getElementById('modal-body'); b.innerHTML = ''; if (body) b.appendChild(body);
  const confirmBtn = document.getElementById('modal-confirm');
  confirmBtn.textContent = confirmLabel;
  confirmBtn.style.display = hideConfirm ? 'none' : '';
  document.getElementById('modal-cancel').textContent = hideConfirm ? 'Close' : 'Cancel';
  modalConfirmHandler = onConfirm;
  document.getElementById('modal-host').classList.remove('hidden');
  const f = b.querySelector('input,select,textarea'); if (f) setTimeout(() => f.focus(), 30);
}
function closeModal() { document.getElementById('modal-host').classList.add('hidden'); modalConfirmHandler = null; }

function toast(msg, kind = 'ok') {
  const host = document.getElementById('toast-host');
  const t = el('div', 'toast ' + kind, msg);
  host.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2600);
}
window.cloverToast = toast;

function promptText(title, initial, onSave) {
  const inp = input(initial, { placeholder: 'Name' });
  const body = el('div', 'form-grid'); body.appendChild(field('Name', inp));
  openModal({ title, body, onConfirm: () => { const v = inp.value.trim(); if (!v) { inp.focus(); return false; } onSave(v); toast('Saved'); } });
}
function confirmRemove(name, onYes) {
  const body = el('div'); body.appendChild(el('p', null, `Remove “${name}”? This can’t be undone.`));
  openModal({ title: 'Remove', body, confirmLabel: 'Remove', onConfirm: () => { onYes(); toast('Removed'); } });
}

// ---- Type conversion between Expense / Bill / Budget placeholder ----
// Budget placeholders and bills are the SAME thing (a recurring item with the
// budgetEst flag), so toggling between them is just the flag. Expenses live in
// a different collection, so converting to/from one moves the record and carries
// every shared field over.
function expenseToRecurring(exp, asPlaceholder) {
  const store = window.cloverStore;
  const rec = {
    name: (exp.title || exp.vendor || 'Untitled').trim(), vendor: exp.vendor || '',
    categoryId: exp.categoryId || '', subId: exp.subId || '',
    amount: Number(exp.amount) || 0, frequency: 'monthly', renewalDate: exp.date || todayISO(),
    accountId: exp.accountId || '', personId: exp.personId, priority: 'Medium', status: 'Active',
    budgetEst: !!asPlaceholder, notes: exp.notes || '', checkNo: exp.checkNo || ''
  };
  store.saveRecurring(rec);
  store.removeExpense(activeYear, exp.id);
  toast(asPlaceholder ? 'Converted to a budget placeholder' : 'Converted to a recurring bill');
}
function recurringToExpense(rec) {
  const store = window.cloverStore;
  const exp = {
    date: todayISO(), title: rec.name || '', vendor: rec.vendor || '',
    categoryId: rec.categoryId || '', subId: rec.subId || '', amount: Number(rec.amount) || 0,
    accountId: rec.accountId || '', personId: rec.personId, notes: rec.notes || '', checkNo: rec.checkNo || ''
  };
  store.saveExpense(activeYear, exp);
  store.removeRecurring(rec.id);
  toast('Converted to a one-off expense');
}
// kind: 'expense' (an expensePayment) or 'recurring' (a bill or placeholder).
function convertModal(kind, item) {
  const store = window.cloverStore;
  const body = el('div');
  const name = kind === 'expense' ? (item.title || item.vendor || 'this expense') : item.name;
  body.appendChild(el('p', 'muted', 'Change what “' + name + '” is — its amount, category, account, person and notes carry over, and the original entry is replaced.'));
  const list = el('div', 'convert-list');
  const opt = (label, hint, run) => {
    const b = el('button', 'convert-opt');
    b.appendChild(el('span', 'convert-opt-label', label));
    b.appendChild(el('span', 'convert-opt-hint', hint));
    b.addEventListener('click', () => { run(); closeModal(); renderView(currentRoute); });
    list.appendChild(b);
  };
  if (kind === 'expense') {
    opt('→ Budget placeholder', 'A recurring, estimated cost counted in your budget (monthly to start). Moves it off the Expenses page onto Budget & Bills.', () => expenseToRecurring(item, true));
    opt('→ Recurring bill', 'A real repeating bill on the Bills & Subscriptions page (monthly to start).', () => expenseToRecurring(item, false));
  } else {
    if (item.budgetEst) opt('→ Regular bill', 'Drop the budget-estimate flag — treat it as an actual recurring bill.', () => { store.saveRecurring(Object.assign({}, item, { budgetEst: false })); toast('Now a regular bill'); });
    else opt('→ Budget placeholder', 'Flag it as an expected/estimated cost. It still counts toward totals and appears on the Budget page.', () => { store.saveRecurring(Object.assign({}, item, { budgetEst: true })); toast('Now a budget placeholder'); });
    opt('→ One-off expense', 'Log it once on the Expenses page (dated today) and remove the recurring entry.', () => recurringToExpense(item));
  }
  body.appendChild(list);
  openModal({ title: 'Convert', body, hideConfirm: true });
}

// ============================================================
// Settings view
// ============================================================
function helpCard() {
  const card = el('div', 'card help-card');
  card.appendChild(el('h3', 'strip-title', 'How Clover works'));
  const ul = el('ul', 'help-list');
  [
    'Add your <strong>paychecks</strong> — their gross rolls into the Wages income category automatically, so you never enter wages twice.',
    'Put recurring bills (electric, streaming, mortgage) in <strong>Bills &amp; Subscriptions</strong>. They show up in <strong>Expenses</strong> automatically at their monthly cost.',
    'For a bill whose amount changes (like electric), add an <strong>Expense</strong> and pick it under “For which bill?” — the real amount replaces that month’s estimate.',
    'Log one-off spending and other income as it happens under <strong>Expenses</strong> and <strong>Income</strong>.',
    'The <strong>Dashboard</strong> and <strong>Reports</strong> summarize everything; the <strong>Calendar</strong> shows upcoming paychecks, renewals, and CD maturities.',
    'Back up anytime under <strong>Import / Export → Download backup</strong>. You can restore or import spreadsheets there too.',
    'Your data is private to your Google account — nothing here is public.',
    'Read the <a href="privacy.html" target="_blank" rel="noopener">privacy policy, terms &amp; disclaimer</a>.'
  ].forEach(t => { const li = el('li'); li.innerHTML = t; ul.appendChild(li); });
  card.appendChild(ul);
  card.appendChild(el('div', 'muted', 'Clover v' + VERSION));
  return card;
}

// Click a card's header to collapse it — remembered per card (localStorage;
// pure UI preference, so it doesn't need to live in Firestore).
let _setCollapse = null;
function setCollapseState() {
  if (!_setCollapse) { try { _setCollapse = JSON.parse(localStorage.getItem('cloverSetCollapse') || '{}'); } catch (e) { _setCollapse = {}; } }
  return _setCollapse;
}
function collapsibleCard(card, key) {
  const st = setCollapseState();
  const head = card.querySelector(':scope > .section-head');
  if (!head) return card;
  const h3 = head.querySelector('h3');
  const caret = el('span', 'caret', st[key] ? '▸ ' : '▾ ');
  if (h3) h3.insertBefore(caret, h3.firstChild);
  if (st[key]) card.classList.add('set-collapsed');
  head.classList.add('collapsible');
  head.addEventListener('click', ev => {
    if (ev.target.closest('button')) return;   // the + Add button still adds
    st[key] = !st[key];
    try { localStorage.setItem('cloverSetCollapse', JSON.stringify(st)); } catch (e) {}
    card.classList.toggle('set-collapsed', !!st[key]);
    caret.textContent = st[key] ? '▸ ' : '▾ ';
  });
  return card;
}
function renderSettings(view) {
  const store = window.cloverStore, s = store.state;
  view.appendChild(helpCard());

  // Every customizable list lives in one collapsible section, and each card
  // inside collapses too — Settings got long enough to need navigation.
  const listCards = [
    ['people', simpleListCard('People', 'Who money belongs to — you, joint, or others. Click a name to rename.', s.persons,
      { addLabel: 'Add person', onAdd: v => store.addPerson(v), onRemove: id => store.removePerson(id), onRename: (id, v) => store.renamePerson(id, v) })],
    ['beneficiaries', simpleListCard('Beneficiaries', 'People you name as account beneficiaries (POD/TOD, retirement, life insurance). Manage the list here; on each account, pick from it and set that person’s %.', s.catalog.beneficiaries || [],
      { addLabel: 'Add beneficiary', onAdd: v => store.addCatalog('beneficiaries', v), onRemove: id => store.removeCatalog('beneficiaries', id), onRename: (id, v) => store.renameCatalog('beneficiaries', id, v) })],
    ['incomeCats', categoryCard('income', s.incomeCategories)],
    ['expenseCats', categoryCard('expense', s.expenseCategories)],
    ['institutions', simpleListCard('Institutions', 'Banks, brokers & card issuers used by accounts', s.catalog.institutions,
      { addLabel: 'Add institution', onAdd: v => store.addCatalog('institutions', v), onRemove: id => store.removeCatalog('institutions', id), onRename: (id, v) => store.renameCatalog('institutions', id, v) })],
    ['rewardPrograms', simpleListCard('Reward programs', 'Cashback & rewards sources', s.catalog.rewardPrograms,
      { addLabel: 'Add reward program', onAdd: v => store.addCatalog('rewardPrograms', v), onRemove: id => store.removeCatalog('rewardPrograms', id), onRename: (id, v) => store.renameCatalog('rewardPrograms', id, v) })],
    ['giftCardTypes', simpleListCard('Gift card types', 'Redemption types for rewards', s.catalog.giftCardTypes,
      { addLabel: 'Add gift card type', onAdd: v => store.addCatalog('giftCardTypes', v), onRemove: id => store.removeCatalog('giftCardTypes', id), onRename: (id, v) => store.renameCatalog('giftCardTypes', id, v) })],
    ['taxForms', simpleListCard('Tax forms', 'Form names offered in the tax-history pickers — update here if the IRS changes things (see irs.gov/forms-instructions-and-publications)', s.catalog.taxForms || [],
      { addLabel: 'Add tax form', onAdd: v => store.addCatalog('taxForms', v), onRemove: id => store.removeCatalog('taxForms', id), onRename: (id, v) => store.renameCatalog('taxForms', id, v) })],
    ['payMethods', simpleListCard('Paycheck methods', 'How paychecks arrive — the Method dropdown on paychecks', s.catalog.payMethods || [],
      { addLabel: 'Add method', onAdd: v => store.addCatalog('payMethods', v), onRemove: id => store.removeCatalog('payMethods', id), onRename: (id, v) => store.renameCatalog('payMethods', id, v) })],
    ['checkTypes', simpleListCard('Paycheck check types', 'The Check type dropdown — keep “Regular”: anything else is treated as a one-time check and left out of salary math and raise detection', s.catalog.checkTypes || [],
      { addLabel: 'Add check type', onAdd: v => store.addCatalog('checkTypes', v), onRemove: id => store.removeCatalog('checkTypes', id), onRename: (id, v) => store.renameCatalog('checkTypes', id, v) })]
  ];
  const section = el('div', 'card lists-section');
  section.appendChild(sectionHead('Lists & categories', 'Every customizable dropdown in one place — click any header (including this one) to collapse it'));
  const inner = el('div', 'settings-grid');
  listCards.forEach(pair => inner.appendChild(collapsibleCard(pair[1], 'set-' + pair[0])));
  section.appendChild(inner);
  view.appendChild(collapsibleCard(section, 'set-listsSection'));

  const grid = el('div', 'settings-grid');
  grid.appendChild(collapsibleCard(paySchedulesCard(), 'set-schedules'));
  grid.appendChild(collapsibleCard(accountDefaultsCard(), 'set-acctDefaults'));
  grid.appendChild(collapsibleCard(yearsCard(), 'set-years'));
  grid.appendChild(collapsibleCard(timeZoneCard(), 'set-timezone'));
  grid.appendChild(collapsibleCard(notificationsCard(), 'set-notifications'));
  grid.appendChild(collapsibleCard(calendarRemindersCard(), 'set-calReminders'));
  view.appendChild(grid);
}

// Every way Clover can nudge you, in one place: the in-app bell (top-right) plus
// the two CD-maturity emails. The matured-CD email is sent by Clover's own mail
// worker (notify.rizzo.cc — the sender PawPrints and Usage share), so it works
// with or without Google. The 7-days-AHEAD email rides the Google Calendar you
// connect on the Calendar page, so that one only bites once you've connected and
// applies on the next sync.
function notificationsCard() {
  const store = window.cloverStore;
  const g = store.state.settings.gcal || {};
  const card = el('div', 'card');
  card.appendChild(sectionHead('Notifications', 'The in-app bell and the CD-maturity email reminders'));
  const wrap = el('div', 'check-col');

  // In-app bell (top-right). Governs whether #notif-wrap renders at all.
  const bellOn = store.state.settings.showNotifBell !== false;   // default on
  const cb = checkbox('Show the notification bell', bellOn, 'The 🔔 at the top right — it lists CDs that have matured and are still waiting on you. Untick to hide it entirely; the Dashboard still flags matured CDs.');
  cb.__input.addEventListener('change', () => {
    store.setSetting('showNotifBell', cb.__input.checked);
    toast(cb.__input.checked ? 'Notification bell shown' : 'Notification bell hidden');
    renderView(currentRoute);
  });
  wrap.appendChild(cb);

  // Matured-CD email — Clover's own mail worker, independent of Google.
  const em = g.cdMaturedEmail !== false;   // default on
  const ce = checkbox('Email me when a CD has matured', em, 'A once-per-CD email when a CD passes its maturity date and is still open — because Clover never closes or renews a CD for you. Sent from notify.rizzo.cc (Clover’s own mail, not Google), so it works even without Google Calendar connected. One reminder per matured CD; renewing it re-arms the next maturity.');
  ce.__input.addEventListener('change', () => {
    store.setGcal({ cdMaturedEmail: ce.__input.checked });
    toast(ce.__input.checked ? 'Matured-CD emails on' : 'Matured-CD emails off');
    syncCdReminders(true);   // push the new preference immediately
    renderView(currentRoute);
  });
  wrap.appendChild(ce);

  // 7-days-ahead email — rides the connected Google Calendar.
  const on = g.cdEmailReminder !== false;   // default on
  const c = checkbox('Email me 7 days before a CD matures', on, 'When Google Calendar is connected, each CD maturity carries an email reminder 7 days ahead — time to decide on rollover or call for new rates. Untick to stop them; the reminders come off your calendar on the next sync.');
  c.__input.addEventListener('change', () => {
    store.setGcal({ cdEmailReminder: c.__input.checked });
    toast(c.__input.checked ? 'CD email reminders on — sync to apply' : 'CD email reminders off — sync to remove');
    renderView(currentRoute);
  });
  wrap.appendChild(c);

  card.appendChild(wrap);
  const note = el('p', 'muted'); note.style.marginTop = '10px';
  note.textContent = g.calendarId
    ? 'The matured-CD email and the bell work on their own — no Google needed. The 7-days-ahead email rides Google Calendar and applies on your next “↻ Sync to Google” (Calendar page).'
    : 'The matured-CD email and the bell work on their own — nothing to set up. The 7-days-ahead email needs Google Calendar connected first (Calendar page); until then it stays inactive.';
  card.appendChild(note);
  return card;
}

// Calendar card now covers only what shows ON the calendar; the reminder toggles
// moved to Notifications above.
function calendarRemindersCard() {
  const store = window.cloverStore;
  const card = el('div', 'card');
  card.appendChild(sectionHead('Calendar', 'What Clover shows on the Calendar and pushes to Google'));
  const wrap = el('div', 'check-col');
  // FOMC dates — governs both the in-app calendar and the Google push.
  const fomcOn = store.state.settings.showFomc !== false;   // default on
  const cf = checkbox('Show FOMC meeting dates', fomcOn, 'Marks the Fed’s rate-decision days on the Calendar (and pushes them to Google if connected) — the backdrop for your savings APYs, CDs, and loan rates. Dates only, no meeting minutes. Untick to hide them; they come off Google on the next sync.');
  cf.__input.addEventListener('change', () => {
    store.setSetting('showFomc', cf.__input.checked);
    toast(cf.__input.checked ? 'FOMC dates shown — sync to push to Google' : 'FOMC dates hidden — sync to remove from Google');
    renderView(currentRoute);
  });
  wrap.appendChild(cf);
  card.appendChild(wrap);
  const note = el('p', 'muted'); note.style.marginTop = '10px';
  note.textContent = 'CD maturity reminders (bell + emails) live under Notifications.';
  card.appendChild(note);
  return card;
}

// Read-only on purpose: the browser already knows the zone, and timestamps are
// stored as UTC — so they render correctly on any device. A manual override
// could only ever make times wrong. This just lets you confirm what's detected.
function timeZoneCard() {
  const card = el('div', 'card');
  card.appendChild(sectionHead('Times & time zone', 'Clover uses your device’s time zone — nothing to set here, but you can check it’s right'));
  let zone = '';
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  const now = new Date();
  let abbr = '';
  try { const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(now); const p = parts.find(x => x.type === 'timeZoneName'); abbr = p ? p.value : ''; } catch (e) {}
  const list = el('div', 'mini-list');
  const row = (label, value) => { const r = el('div', 'mini-row'); r.appendChild(el('span', 'muted', label)); r.appendChild(el('span', null, value)); list.appendChild(r); };
  row('Detected time zone', (zone || 'unknown') + (abbr ? ' (' + abbr + ')' : ''));
  row('Your local time now', now.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }));
  card.appendChild(list);
  const note = el('p', 'muted');
  note.style.marginTop = '10px';
  note.textContent = 'Times like “added / last edited” are stored in universal time and shown in the zone above, so they stay correct on any device you sign in from. Dates you type (an expense date, a pay date) are plain calendar dates with no time zone. If the zone above looks wrong, change it in your computer or phone’s date & time settings — Clover follows it automatically.';
  card.appendChild(note);
  return card;
}

function yearsCard() {
  const store = window.cloverStore;
  const card = el('div', 'card');
  card.appendChild(sectionHead('Years', 'Which years appear in year dropdowns and tabs'));
  card.appendChild(el('p', 'muted', '2020 through next year are always available and roll forward automatically every January — nothing to maintain. Add older years here only if you want to back-fill history from before 2020 (e.g. importing old spreadsheets).'));
  const list = el('div', 'chip-list');
  const extra = (store.state.settings.extraYears || []).slice().sort((a, b) => b - a);
  if (!extra.length) list.appendChild(el('div', 'muted', 'No extra years added.'));
  extra.forEach(y => {
    const chip = el('div', 'chip');
    chip.appendChild(el('span', 'chip-name', String(y)));
    const x = el('button', 'chip-x', '✕'); x.title = 'Remove this year from the dropdowns (its data is kept)';
    x.addEventListener('click', () => store.removeExtraYear(y));
    chip.appendChild(x); list.appendChild(chip);
  });
  card.appendChild(list);
  const row = el('div', 'io-actions');
  const yIn = input('', { type: 'number', placeholder: 'e.g. 2018' }); yIn.min = 1980; yIn.max = 2100; yIn.style.maxWidth = '10em';
  const add = el('button', 'btn-ghost', '＋ Add year');
  add.addEventListener('click', () => {
    const v = Math.floor(+yIn.value);
    if (!v || v < 1980 || v > 2100) { toast('Enter a year between 1980 and 2100', 'warn'); return; }
    if (yearsAvailable().includes(v)) { toast(v + ' is already available', 'warn'); yIn.value = ''; return; }
    store.addExtraYear(v); yIn.value = '';
    toast(v + ' added to the year dropdowns');
  });
  row.appendChild(yIn); row.appendChild(add);
  card.appendChild(row);
  return card;
}

function accountDefaultsCard() {
  const store = window.cloverStore, d = store.accountDefaults();
  const card = el('div', 'card');
  card.appendChild(sectionHead('New account defaults', 'Which flags start checked when you add an account'));
  const rows = [
    ['active', 'Active', 'New accounts start marked as open/in use.'],
    ['usedForIncome', 'Used for income', 'New accounts default to being income sources.'],
    ['usedForExpenses', 'Used for expenses', 'New accounts default to being a payment method.'],
    ['usedForAutopay', 'Used for auto-pay', 'New accounts default to having auto-pay on.'],
    ['rewardsCard', 'Rewards card', 'New accounts default to being a rewards card.']
  ];
  const wrap = el('div', 'check-col');
  rows.forEach(([key, label, hint]) => {
    const c = checkbox(label, d[key], hint);
    c.__input.addEventListener('change', () => store.setAccountDefault(key, c.__input.checked));
    wrap.appendChild(c);
  });
  card.appendChild(wrap);
  return card;
}

function sectionHead(title, subtitle, onAdd) {
  const h = el('div', 'section-head');
  const left = el('div'); left.appendChild(el('h3', null, title)); if (subtitle) left.appendChild(el('p', 'muted', subtitle));
  h.appendChild(left);
  if (onAdd) { const b = el('button', 'btn-primary', '+ Add'); b.addEventListener('click', onAdd); h.appendChild(b); }
  return h;
}

function simpleListCard(title, subtitle, items, { addLabel, onAdd, onRemove, onRename }) {
  const card = el('div', 'card');
  card.appendChild(sectionHead(title, subtitle, () => promptText(addLabel || 'Add', '', onAdd)));
  const list = el('div', 'chip-list');
  if (!items.length) list.appendChild(el('div', 'muted', 'Nothing yet.'));
  items.forEach(it => {
    const chip = el('div', 'chip');
    const name = el('span', 'chip-name', it.name);
    if (onRename) { name.classList.add('editable'); name.title = 'Click to rename'; name.addEventListener('click', () => promptText('Rename', it.name, v => onRename(it.id, v))); }
    chip.appendChild(name);
    const x = el('button', 'chip-x', '✕'); x.title = 'Remove';
    x.addEventListener('click', () => confirmRemove(it.name, () => onRemove(it.id)));
    chip.appendChild(x); list.appendChild(chip);
  });
  card.appendChild(list);
  return card;
}

function categoryCard(kind, groups) {
  const store = window.cloverStore;
  const label = kind === 'income' ? 'Income categories' : 'Expense categories';
  const card = el('div', 'card');
  card.appendChild(sectionHead(label, 'Groups and their subcategories',
    () => promptText('Add ' + (kind === 'income' ? 'income' : 'expense') + ' group', '', v => store.addGroup(kind, v))));
  if (!groups.length) card.appendChild(el('div', 'muted', 'No groups yet.'));
  groups.forEach(g => {
    const row = el('div', 'group-row');
    const gh = el('div', 'group-head');
    gh.appendChild(el('span', 'group-name', g.name));
    const act = el('div', 'group-actions');
    const addSub = el('button', 'mini', '+ subcategory'); addSub.addEventListener('click', () => promptText('Add subcategory to ' + g.name, '', v => store.addSub(kind, g.id, v)));
    const del = el('button', 'mini danger', 'Remove'); del.addEventListener('click', () => confirmRemove(g.name + ' (and its subcategories)', () => store.removeGroup(kind, g.id)));
    act.appendChild(addSub); act.appendChild(del); gh.appendChild(act);
    row.appendChild(gh);
    const subs = el('div', 'chip-list');
    if (!g.subs.length) subs.appendChild(el('div', 'muted', 'No subcategories'));
    g.subs.forEach(sub => {
      const chip = el('div', 'chip', sub.name);
      const x = el('button', 'chip-x', '✕'); x.addEventListener('click', () => store.removeSub(kind, g.id, sub.id));
      chip.appendChild(x); subs.appendChild(chip);
    });
    row.appendChild(subs);
    card.appendChild(row);
  });
  return card;
}

// ============================================================
// Accounts view
// ============================================================
const ACCT_COL_LABELS = { name: 'Name', institution: 'Institution', type: 'Type', last4: 'Last 4', owner: 'Owner', flags: 'Flags', apy: 'APY', balance: 'Balance', cdTerm: 'CD term', cdMaturity: 'CD maturity', beneficiaries: 'Beneficiaries', closedDate: 'Closed on', notes: 'Notes' };
const ACCT_ALL_COLS = ['name', 'institution', 'type', 'last4', 'owner', 'flags', 'apy', 'balance', 'cdTerm', 'cdMaturity', 'beneficiaries', 'closedDate', 'notes'];
const ACCT_DEFAULT_COLS = ['name', 'institution', 'type', 'last4', 'owner', 'apy', 'flags'];
// Beneficiaries: an array of {name, pct}. Legacy free-text strings still read
// (as one entry) so nothing is lost before an account is next edited.
function beneficiaryList(a) {
  const b = a && a.beneficiaries;
  if (Array.isArray(b)) return b.filter(x => x && ((x.name || '').trim() || (x.pct !== '' && x.pct != null)));
  if (typeof b === 'string' && b.trim()) return [{ name: b.trim(), pct: '' }];
  return [];
}
function beneficiaryText(a) {
  return beneficiaryList(a).map(b => (b.name || '').trim() + (b.pct !== '' && b.pct != null ? ' (' + b.pct + '%)' : '')).filter(s => s).join(', ');
}
// Unified APY for the single "APY" account column. Uses the account's own rate
// (a CD's cdApy, or a.apy for everything else) with its "as of" date; falls back
// to the latest recorded rate from Credit & Rates when no rate is set on the
// account. Returns { pct, date, as } or null.
function accountApy(store, a) {
  if (a.type === 'CD') { if (a.cdApy != null && a.cdApy !== '') return { pct: Number(a.cdApy), date: a.apyAsOf || '', as: 'as of' }; }
  else if (a.type !== 'Credit Card' && a.apy != null && a.apy !== '') return { pct: Number(a.apy), date: a.apyAsOf || '', as: 'as of' };
  const r = /savings|cd|money market/i.test(a.type || '') ? latestRateFor(store, a.institution) : null;
  if (r && r.apy != null && r.apy !== '') return { pct: Number(r.apy), date: r.date || '', as: 'recorded' };
  return null;
}

// Colored value badge: each column gets a base hue, each distinct value a shade —
// so CD vs Checking (or Ally vs Chase) is recognizable at a glance. Clicking one
// filters the table to that value.
// Colored, clickable value badges — per-column base hue, per-value shade
// (first-seen order, wraps after 6), click filters the table to that value.
// Scoped per table: 'accounts' uses accountsFilter, 'subs' uses subsBadgeFilter.
const BADGE_HUES = {
  'accounts.type': 145, 'accounts.institution': 215, 'accounts.owner': 275, 'accounts.beneficiaries': 25,
  'subs.category': 275, 'subs.subcategory': 25, 'subs.frequency': 215, 'subs.account': 145
};
const _badgeShadeIdx = {};
function tableFilterGet(scope) { return scope === 'subs' ? subsBadgeFilter : accountsFilter; }
function tableFilterSet(scope, f) { if (scope === 'subs') subsBadgeFilter = f; else accountsFilter = f; }
function valueBadge(scope, colKey, text) {
  if (!text) return el('span', 'muted', '—');
  const full = scope + '.' + colKey;
  const m = _badgeShadeIdx[full] = _badgeShadeIdx[full] || new Map();
  if (!m.has(text)) m.set(text, m.size);
  const hue = BADGE_HUES[full] || 200;
  const light = 90 - (m.get(text) % 6) * 6;   // 90 -> 60 in 6 steps
  const b = el('span', 'badge val-badge', text);
  b.style.background = 'hsl(' + hue + ', 45%, ' + light + '%)';
  b.style.color = 'hsl(' + hue + ', 55%, 24%)';
  b.title = 'Click to show only “' + text + '”';
  b.addEventListener('click', ev => {
    ev.stopPropagation();
    if (scope === 'accounts' && colKey === 'type' && text === 'CD') {
      accountsCdTimeline = !accountsCdTimeline;
      if (accountsCdTimeline && accountsFilter && accountsFilter.key === 'type') accountsFilter = null;
      accountsTab = 'open';
      renderView(currentRoute); return;
    }
    if (scope === 'accounts' && colKey === 'type') accountsCdTimeline = false;
    const cur = tableFilterGet(scope);
    tableFilterSet(scope, (cur && cur.key === colKey && cur.value === text) ? null : { key: colKey, value: text });
    renderView(currentRoute);
  });
  return b;
}
// Latest recorded savings APY for an account's institution (from Credit & Rates).
function latestRateFor(store, institution) {
  if (!institution) return null;
  const rows = store.state.rateHistory.filter(r => (rateInstitution(store, r) || '').toLowerCase() === institution.toLowerCase());
  if (!rows.length) return null;
  return rows.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
}
// A month count spelled in years + months for the grey sub-line: 13 -> "1 year
// 1 month", 60 -> "5 years", 18 -> "1 year 6 months".
function cdTermYears(mo) {
  const y = Math.floor(mo / 12), m = mo % 12, parts = [];
  if (y) parts.push(y + ' year' + (y === 1 ? '' : 's'));
  if (m) parts.push(m + ' month' + (m === 1 ? '' : 's'));
  return parts.join(' ');
}
function buildAcctCol(store, key) {
  switch (key) {
    case 'name': return { label: 'Name', key: 'name', value: a => a.name, cell: a => {
        const td = el('td'); td.appendChild(el('div', 'acct-name', a.name));
        if (a.previousAccountId) {
          const prev = store.account(a.previousAccountId);
          const lbl = prev ? (prev.name + (prev.last4 ? ' ••' + prev.last4 : '')) : 'a previous account';
          td.appendChild(el('div', 'acct-sub', '↳ rollover of ' + lbl));
        }
        return td; } };
    case 'institution': return { label: 'Institution', key: 'institution', value: a => a.institution || '', cell: a => { const td = el('td'); td.appendChild(valueBadge('accounts', 'institution', a.institution)); return td; } };
    case 'type': return { label: 'Type', key: 'type', value: a => a.type || '', cell: a => { const td = el('td'); td.appendChild(valueBadge('accounts', 'type', a.type)); return td; } };
    case 'last4': return { label: 'Last 4', key: 'last4', value: a => a.last4 || '', cell: a => el('td', null, a.last4 ? ('••' + a.last4) : '—') };
    case 'owner': return { label: 'Owner', key: 'owner', value: a => store.personName(a.personId), cell: a => { const td = el('td'); const n = store.personName(a.personId); td.appendChild(valueBadge('accounts', 'owner', n === '—' ? '' : n)); return td; } };
    case 'flags': return { label: 'Flags', sortable: false, cell: a => {
        const td = el('td'); const flags = el('div', 'flags');
        flags.appendChild(a.active === false ? badge('Inactive', 'red') : badge('Active', 'green'));
        if (store.successorOf(a.id)) flags.appendChild(badge('Rolled over'));
        if (a.usedForAutopay) flags.appendChild(badge('Auto-pay', 'amber'));
        if (a.rewardsCard) flags.appendChild(badge('Rewards', 'green'));
        const fl = ccFloatToday(a);
        if (fl != null) { const b = badge('~' + fl + 'd float'); b.title = 'Days until a purchase made today would be due'; flags.appendChild(b); }
        if (BENEFICIARY_TYPES.includes(a.type) && !beneficiaryList(a).length) flags.appendChild(badge('No beneficiary', 'amber'));
        td.appendChild(flags); return td; } };
    case 'beneficiaries': return { label: 'Beneficiaries', key: 'beneficiaries', value: a => beneficiaryText(a), cell: a => { const td = el('td'); const t = beneficiaryText(a); if (t) td.appendChild(valueBadge('accounts', 'beneficiaries', t)); else td.textContent = '—'; return td; } };
    case 'apy': return { label: 'APY', key: 'apy', num: true,
        value: a => { const x = accountApy(store, a); return x ? x.pct : -1; },
        cell: a => {
          const td = el('td', 'num');
          const x = accountApy(store, a);
          if (!x) { td.textContent = '—'; return td; }
          td.textContent = x.pct.toFixed(2) + '%';
          // Just the date (keeps the column narrow); the full phrasing is in the tooltip.
          if (x.date) { const sub = el('div', 'acct-sub', fmtDate(x.date)); sub.title = x.as + ' ' + fmtDate(x.date); td.appendChild(sub); }
          return td; } };
    case 'balance': return { label: 'Balance', key: 'balance', num: true, value: a => Number(a.type === 'CD' ? a.cdPrincipal : a.balance) || 0, cell: a => {
        const v = a.type === 'CD' ? a.cdPrincipal : a.balance;
        const td = el('td', 'num');
        if (v === '' || v == null) { td.textContent = '—'; return td; }
        td.textContent = money(Number(v));
        const asOf = a.type === 'CD' ? a.cdPrincipalAsOf : a.balanceAsOf;
        if (asOf) { const s2 = el('div', 'acct-sub', 'as of ' + fmtDate(asOf)); s2.title = 'When this balance was last entered or updated'; td.appendChild(s2); }
        return td; } };
    case 'cdTerm': return { label: 'CD term', key: 'cdTerm', value: a => (a.type === 'CD' ? store.parseTermMonths(a.cdTerm) : 0) || 0, cell: a => {
        const td = el('td');
        const mo = a.type === 'CD' && a.cdTerm ? store.parseTermMonths(a.cdTerm) : null;
        if (a.type === 'CD' && a.cdTerm) {
          // Always show the unit so "7" and "6 months" read the same; fall back
          // to the raw text only if it can't be parsed to a month count.
          td.appendChild(document.createTextNode(mo ? mo + ' month' + (mo === 1 ? '' : 's') : a.cdTerm));
          if (a.cdTermEst) { const m = el('span', 'est-mark', '≈'); m.title = 'Calculated from the start and maturity dates, not entered by hand.'; td.appendChild(m); }
          if (mo && mo >= 12) { const sub = el('div', 'acct-sub', cdTermYears(mo)); sub.title = mo + ' months'; td.appendChild(sub); }
        } else td.textContent = '—';
        return td; } };
    case 'cdMaturity': return { label: 'CD maturity', key: 'cdMaturity', value: a => a.cdMaturity || '', cell: a => el('td', null, a.cdMaturity ? fmtDate(a.cdMaturity) : '—') };
    case 'closedDate': return { label: 'Closed on', key: 'closedDate', value: a => a.closedDate || '', cell: a => el('td', null, a.closedDate ? fmtDate(a.closedDate) : '—') };
    case 'notes': return { label: 'Notes', key: 'notes', value: a => a.notes || '', cell: a => { const td = el('td', 'muted'); td.textContent = a.notes || '—'; return td; } };
  }
  return null;
}

// Bills/subscriptions tied to an account — used by the close-account warning.
function accountTiedItems(store, accId) {
  const recs = store.state.recurring || [];
  return { paidFrom: recs.filter(r => r.accountId === accId), backup: recs.filter(r => r.backupAccountId === accId) };
}
function closeAccountModal(acc) {
  const store = window.cloverStore;
  const tied = accountTiedItems(store, acc.id);
  const names = list => list.map(r => r.name).slice(0, 8).join(', ') + (list.length > 8 ? '…' : '');
  const body = el('div');
  body.appendChild(el('p', null, 'Close “' + acc.name + '”' + (acc.last4 ? ' ••' + acc.last4 : '') + '? It stays in your history and on the Closed tab, but is marked inactive and hidden from pickers.'));
  const autopay = tied.paidFrom.filter(r => r.autoPay);
  const nonAuto = tied.paidFrom.filter(r => !r.autoPay);
  if (tied.paidFrom.length || tied.backup.length) {
    const warn = el('div', 'card warn-strip'); warn.style.margin = '12px 0';
    const wl = el('div', 'warn-list');
    if (autopay.length) { const w = el('div', 'warn-item'); w.appendChild(badge('Auto-pay', 'red')); w.appendChild(el('span', null, autopay.length + ' auto-pay bill' + (autopay.length === 1 ? '' : 's') + ' pay FROM here — move these first: ' + names(autopay))); wl.appendChild(w); }
    if (nonAuto.length) { const w = el('div', 'warn-item'); w.appendChild(badge('Paid from', 'amber')); w.appendChild(el('span', null, nonAuto.length + ' bill' + (nonAuto.length === 1 ? '' : 's') + ' paid from here: ' + names(nonAuto))); wl.appendChild(w); }
    if (tied.backup.length) { const w = el('div', 'warn-item'); w.appendChild(badge('Backup', '')); w.appendChild(el('span', null, tied.backup.length + ' bill' + (tied.backup.length === 1 ? '' : 's') + ' list it as a backup account: ' + names(tied.backup))); wl.appendChild(w); }
    warn.appendChild(wl); body.appendChild(warn);
  } else {
    body.appendChild(el('p', 'muted', 'No bills or subscriptions are tied to this account.'));
  }
  const uses = [];
  if (acc.usedForIncome) uses.push('receives income');
  if (acc.usedForExpenses) uses.push('pays expenses');
  if (acc.usedForAutopay) uses.push('has auto-pay set up');
  if (uses.length) body.appendChild(el('p', 'muted', 'Also flagged as: ' + uses.join(', ') + '. Past income/expense entries stay linked to it for history.'));
  const fDate = input(acc.closedDate || todayISO(), { type: 'date' });
  body.appendChild(field('Date closed', fDate, 'When the account was closed — tracked on the account and shown on the Closed tab.'));
  openModal({
    title: 'Close account', body, confirmLabel: 'Close account',
    onConfirm: () => {
      // Save a copy, not the stored object — the store diffs old vs new to build
      // the edit history, and mutating in place would leave nothing to compare.
      store.saveAccount(Object.assign({}, acc, { closed: true, active: false, closedDate: fDate.value || todayISO() }));
      accountsTab = 'closed';
      toast('Account closed');
    }
  });
}


// ============================================================
// CD maturity timeline -- a multi-row duration chart of every CD: each term
// and renewal is its own segment positioned by REAL dates, consolidations are
// drawn as connectors, and the viewport pans/zooms like a trading chart.
//
// How positioning works: the viewport is a pair of timestamps (view.s, view.e).
// A date's x-pixel is (t - view.s) / (view.e - view.s) * plotWidth -- so bar
// widths fall out of actual date spans, never a hardcoded month width. Panning
// shifts both timestamps by the dragged pixel span converted back to ms;
// wheel-zoom scales the span around the timestamp under the cursor (so the
// date you point at stays put); clipping just clamps x to the plot box while
// the stored dates stay untouched. Redraws ride requestAnimationFrame.
// Shown when the Accounts table is filtered to type = CD (click the CD badge).
// ============================================================
let cdTLView = null;   // { s, e } in ms -- survives re-renders within a session
let cdTLopts = { rel: true, matured: true, sort: 'maturity', hlQ: null };
const CDTL_DAY = 86400000;
function cdTms(iso) { const t = Date.parse(String(iso || '').slice(0, 10)); return isNaN(t) ? null : t; }
function cdTiso(t) { return new Date(t).toISOString().slice(0, 10); }

// One row per CD account (a lineage); cycles = archived terms + the current
// one, chained so each renewal starts the day the previous term matured.
function cdTimelineData(store, accts) {
  const rows = [];
  const links = [];
  const est = (mat, term) => {
    const mo = store.parseTermMonths(term);
    return mo ? store.subMonthsClamped(mat, mo) : '';
  };
  (accts || store.state.accounts).filter(a => a.type === 'CD' && (a.cdMaturity || (a.cdRenewals || []).length)).forEach(a => {
    const cycles = [];
    const arch = a.cdRenewals || [];
    arch.forEach((t, i) => {
      const start = t.start || (i > 0 ? arch[i - 1].maturity : est(t.maturity, t.term));
      if (!start || !t.maturity) return;
      cycles.push({ s: cdTms(start), e: cdTms(t.maturity), apy: t.apy, term: t.term, last4: t.last4, principal: t.principal, estStart: !t.start && i === 0, idx: i, current: false });
    });
    if (a.cdMaturity) {
      const start = a.cdStart || (arch.length ? arch[arch.length - 1].maturity : est(a.cdMaturity, a.cdTerm));
      if (start) cycles.push({ s: cdTms(start), e: cdTms(a.cdMaturity), apy: a.cdApy, term: a.cdTerm, last4: a.last4, principal: a.cdPrincipal, estStart: !!a.cdStartEst || !a.cdStart, termEst: !!a.cdTermEst, idx: arch.length, current: true });
    }
    const dated = cycles.filter(c => c.s != null && c.e != null && c.e > c.s);
    if (!dated.length) return;
    const du = daysUntil(a.cdMaturity);
    const status = a.consolidatedIntoId ? 'consolidated' : a.closed ? 'closed'
      : du == null ? 'active' : du < 0 ? 'matured' : du <= 30 ? 'soon30' : du <= 90 ? 'soon90' : 'active';
    rows.push({ a, cycles: dated, status, du });
    (a.cdFundedBy || []).forEach(fb => (fb.sources || []).forEach(sc => links.push({ fromId: sc.id, toId: a.id, at: fb.at })));
  });
  return { rows, links };
}

const CDTL_STATUS = {
  active:       { fill: '#dcefe2', stroke: '#16a34a', text: '#166534', label: 'Active' },
  soon90:       { fill: '#fdf0d9', stroke: '#d97706', text: '#92400e', label: '≤ 90 days' },
  soon30:       { fill: '#fbe3e3', stroke: '#dc2626', text: '#991b1b', label: '≤ 30 days' },
  matured:      { fill: '#ececef', stroke: '#9ca3af', text: '#4b5563', label: 'Matured' },
  closed:       { fill: '#ececef', stroke: '#9ca3af', text: '#4b5563', label: 'Closed' },
  consolidated: { fill: '#ececef', stroke: '#9ca3af', text: '#4b5563', label: 'Consolidated' }
};

// Everything about the CDs maturing in one quarter of the ladder.
function cdQuarterModal(qk, rows) {
  const store = window.cloverStore;
  const label = qk.replace('-', ' ');
  const body = el('div');
  const known = rows.filter(r => r.a.cdPrincipal != null && r.a.cdPrincipal !== '');
  const total = known.reduce((s2, r) => s2 + Number(r.a.cdPrincipal), 0);
  body.appendChild(el('p', 'muted', rows.length + ' CD' + (rows.length === 1 ? '' : 's') + ' maturing in ' + label +
    (known.length ? ' · ' + money(total) + ' becoming available' + (known.length < rows.length ? ' (from the ' + known.length + ' with a principal entered)' : '') : ' · no principals entered yet')));
  const list = el('div', 'hist-list');
  rows.slice().sort((x, y) => (x.a.cdMaturity || '').localeCompare(y.a.cdMaturity || '')).forEach(r => {
    const a = r.a;
    const e = el('div', 'hist-entry');
    e.appendChild(el('div', 'hist-when', a.name + (a.last4 ? ' ••' + a.last4 : '')));
    const line = (lbl, val) => { if (val === '' || val == null) return; const d = el('div', 'mini-row'); d.appendChild(el('span', 'muted', lbl)); d.appendChild(el('span', null, val)); e.appendChild(d); };
    line('Institution', a.institution || '');
    const owner = store.personName(a.personId); line('Owner', owner && owner !== '—' ? owner : '');
    const mo = store.parseTermMonths(a.cdTerm);
    line('Term', a.cdTerm ? (mo ? mo + ' month' + (mo === 1 ? '' : 's') + (mo >= 12 ? ' (' + cdTermYears(mo) + ')' : '') : a.cdTerm) + (a.cdTermEst ? ' ≈' : '') : '');
    line('Start', a.cdStart ? fmtDate(a.cdStart) + (a.cdStartEst ? ' (est.)' : '') : '');
    const du = daysUntil(a.cdMaturity);
    line('Matures', fmtDate(a.cdMaturity) + (du == null ? '' : du < 0 ? ' · ' + (-du) + ' days ago' : du === 0 ? ' · today' : ' · in ' + du + ' days'));
    line('APY', (a.cdApy !== '' && a.cdApy != null) ? Number(a.cdApy).toFixed(2) + '%' + (a.apyAsOf ? ' (as of ' + fmtDate(a.apyAsOf) + ')' : '') : '');
    line('Principal', (a.cdPrincipal !== '' && a.cdPrincipal != null) ? money(Number(a.cdPrincipal)) + (a.cdPrincipalAsOf ? ' (as of ' + fmtDate(a.cdPrincipalAsOf) + ')' : '') : '');
    // Interest this term would earn at the stated rate — an estimate, never income.
    if (mo && a.cdApy !== '' && a.cdApy != null && a.cdPrincipal !== '' && a.cdPrincipal != null)
      line('Est. interest this term', money(Number(a.cdPrincipal) * (Number(a.cdApy) / 100) * (mo / 12)) + ' (estimate)');
    line('Beneficiaries', beneficiaryText(a));
    if ((a.cdRenewals || []).length) line('Past terms', a.cdRenewals.length + ' renewal' + (a.cdRenewals.length === 1 ? '' : 's'));
    if ((a.cdFundedBy || []).length) line('Consolidated in', a.cdFundedBy.reduce((n2, f) => n2 + (f.sources || []).length, 0) + ' source CD(s)');
    line('Notes', firstLine(a.notes || ''));
    const btn = el('button', 'btn-ghost', '↻ Open / renew');
    btn.addEventListener('click', () => { closeModal(); accountModal(a); });
    e.appendChild(btn);
    list.appendChild(e);
  });
  body.appendChild(list);
  body.appendChild(el('div', 'sum-hint', 'Current terms only — a CD already renewed into a new term is counted under that new term, not here.'));
  openModal({ title: 'Maturing in ' + label, body, hideConfirm: true, onConfirm: () => {} });
}
function cdTimelinePanel(store, accts) {
  const card = el('div', 'card cdtl-card');
  const data = cdTimelineData(store, accts);
  const head = el('div', 'view-head');
  const hl = el('div');
  hl.appendChild(el('h3', 'strip-title', 'CD maturity timeline'));
  hl.appendChild(el('p', 'muted', 'Each bar is one CD term, placed by its real dates · renewals sit side-by-side on the same row · drag to pan, scroll to zoom, double-click to reset'));
  head.appendChild(hl);
  card.appendChild(head);
  if (!data.rows.length) {
    card.appendChild(el('div', 'muted', 'No CD has enough dates to draw yet — give a CD a maturity date (and ideally a term or start date) in its Edit form.'));
    return card;
  }

  // ---- summary cards (open CDs only; principal where entered) ----
  const open = data.rows.filter(r => !r.a.closed && !r.a.consolidatedIntoId);
  const withP = open.filter(r => r.a.cdPrincipal != null && r.a.cdPrincipal !== '');
  const totalP = withP.reduce((s2, r) => s2 + Number(r.a.cdPrincipal), 0);
  const apyRows = open.filter(r => r.a.cdApy !== '' && r.a.cdApy != null);
  const wRows = apyRows.filter(r => r.a.cdPrincipal != null && r.a.cdPrincipal !== '');
  const wapy = wRows.length ? wRows.reduce((s2, r) => s2 + Number(r.a.cdPrincipal) * Number(r.a.cdApy), 0) / wRows.reduce((s2, r) => s2 + Number(r.a.cdPrincipal), 0)
    : apyRows.length ? apyRows.reduce((s2, r) => s2 + Number(r.a.cdApy), 0) / apyRows.length : null;
  const nowT = Date.now();
  const future = open.filter(r => cdTms(r.a.cdMaturity) != null && cdTms(r.a.cdMaturity) >= nowT - CDTL_DAY)
    .sort((x, y) => cdTms(x.a.cdMaturity) - cdTms(y.a.cdMaturity));
  const next = future[0];
  const in12 = future.filter(r => cdTms(r.a.cdMaturity) <= nowT + 365 * CDTL_DAY);
  const in12P = in12.filter(r => r.a.cdPrincipal != null && r.a.cdPrincipal !== '').reduce((s2, r) => s2 + Number(r.a.cdPrincipal), 0);
  // Estimated interest — CDs only, shown on this timeline and NEVER written to
  // the Income page. Simple interest off APY (which already reflects a year's
  // compounding): annual = principal x APY; YTD accrues each term's principal x
  // APY across the days of THIS calendar year it was open. Per cycle, so a CD
  // renewed mid-year counts both terms. Estimates, always labeled as such.
  const yStart = new Date(new Date(nowT).getFullYear(), 0, 1).getTime();
  const estRows = open.filter(r => r.a.cdPrincipal !== '' && r.a.cdPrincipal != null && r.a.cdApy !== '' && r.a.cdApy != null);
  const estAnnual = estRows.reduce((s2, r) => s2 + Number(r.a.cdPrincipal) * Number(r.a.cdApy) / 100, 0);
  const estYtd = open.reduce((s2, r) => s2 + r.cycles.reduce((cs, c) => {
    const p = Number(c.principal), apy = Number(c.apy);
    if (c.principal === '' || c.principal == null || c.apy === '' || c.apy == null || isNaN(p) || isNaN(apy)) return cs;
    const s = Math.max(c.s, yStart), e = Math.min(c.e, nowT);
    return cs + (e > s ? p * apy / 100 * ((e - s) / CDTL_DAY) / 365 : 0);
  }, 0), 0);
  const sum = el('div', 'sub-summary');
  sum.appendChild(sumCard('CD principal', withP.length ? money(totalP) : '—', 'income', withP.length < open.length ? withP.length + ' of ' + open.length + ' CDs have a principal entered' : open.length + ' open CD' + (open.length === 1 ? '' : 's')));
  sum.appendChild(sumCard('Weighted avg APY', wapy != null ? wapy.toFixed(2) + '%' : '—', '', wRows.length ? 'weighted by principal' : apyRows.length ? 'simple average — add principals to weight it' : ''));
  sum.appendChild(sumCard('Next maturity', next ? fmtDate(next.a.cdMaturity) : '—', next && next.du != null && next.du <= 30 ? 'expense' : '', next ? next.a.name + (next.a.last4 ? ' ••' + next.a.last4 : '') : 'no upcoming maturities'));
  sum.appendChild(sumCard('Maturing ≤ 12 mo', in12.length ? (in12P ? money(in12P) : in12.length + ' CD' + (in12.length === 1 ? '' : 's')) : '—', '', in12.length && in12P ? in12.length + ' CD' + (in12.length === 1 ? '' : 's') : 'principal totals need Principal $ entered'));
  sum.appendChild(sumCard('Est. interest / yr', estRows.length ? money(estAnnual) : '—', 'income', estRows.length ? (estRows.length < open.length ? estRows.length + ' of ' + open.length + ' CDs · principal × APY' : 'principal × APY, simple') : 'needs Principal $ + APY'));
  sum.appendChild(sumCard('Est. interest YTD', estRows.length ? money(estYtd) : '—', 'income', estRows.length ? 'accrued this year · estimate only, not on the Income page' : 'needs Principal $ + APY'));
  card.appendChild(sum);

  // ---- data range + default viewport (5% pad back, 10% forward) ----
  const allT = [];
  data.rows.forEach(r => r.cycles.forEach(c => { allT.push(c.s); allT.push(c.e); }));
  const dMin = Math.min.apply(null, allT), dMax = Math.max.apply(null, allT);
  const span0 = Math.max(dMax - dMin, 180 * CDTL_DAY);
  const defView = () => ({ s: dMin - span0 * 0.05, e: dMax + span0 * 0.10 });
  if (!cdTLView) cdTLView = defView();
  const view = cdTLView;

  // ---- controls ----
  const bar = el('div', 'cdtl-controls');
  const preset = (label, fn, title) => { const b = el('button', 'btn-ghost', label); if (title) b.title = title; b.addEventListener('click', () => { fn(); redraw(); }); bar.appendChild(b); };
  preset('View all', () => { Object.assign(view, defView()); }, 'Earliest opening through latest maturity, with padding');
  preset('1y', () => { const c = nowT; view.s = c - 90 * CDTL_DAY; view.e = c + 275 * CDTL_DAY; });
  preset('3y', () => { const c = nowT; view.s = c - 270 * CDTL_DAY; view.e = c + 825 * CDTL_DAY; });
  preset('5y', () => { const c = nowT; view.s = c - 450 * CDTL_DAY; view.e = c + 1375 * CDTL_DAY; });
  preset('Today → last', () => { view.s = nowT - 30 * CDTL_DAY; view.e = dMax + (dMax - nowT) * 0.1 + 60 * CDTL_DAY; });
  preset('⦿ Today', () => { const half = (view.e - view.s) / 2; view.s = nowT - half; view.e = nowT + half; }, 'Center on today, keeping the current zoom');
  const sortSel = select([
    { value: 'maturity', label: 'Sort: maturity' }, { value: 'start', label: 'Sort: opening' },
    { value: 'principal', label: 'Sort: principal' }, { value: 'apy', label: 'Sort: APY' },
    { value: 'bank', label: 'Sort: bank' }
  ], cdTLopts.sort);
  sortSel.addEventListener('change', () => { cdTLopts.sort = sortSel.value; renderView(currentRoute); });
  bar.appendChild(sortSel);
  const cRel = checkbox('Relationships', cdTLopts.rel, 'Draw the merge arrows for consolidated CDs.');
  cRel.__input.addEventListener('change', () => { cdTLopts.rel = cRel.__input.checked; redraw(); });
  bar.appendChild(cRel);
  const cMat = checkbox('Show matured', cdTLopts.matured, 'Include matured, closed, and consolidated CDs.');
  cMat.__input.addEventListener('change', () => { cdTLopts.matured = cMat.__input.checked; renderView(currentRoute); });
  bar.appendChild(cMat);
  card.appendChild(bar);

  // ---- rows (sorted; sorting changes vertical order only) ----
  let rows = data.rows.slice();
  if (!cdTLopts.matured) rows = rows.filter(r => r.status === 'active' || r.status === 'soon30' || r.status === 'soon90');
  const keyOf = r => cdTLopts.sort === 'start' ? (r.cycles[0] ? r.cycles[0].s : 0)
    : cdTLopts.sort === 'principal' ? -(Number(r.a.cdPrincipal) || 0)
    : cdTLopts.sort === 'apy' ? -(Number(r.a.cdApy) || 0)
    : cdTLopts.sort === 'bank' ? (r.a.institution || '￿')
    : (cdTms(r.a.cdMaturity) || 8e15);
  rows.sort((x, y) => { const kx = keyOf(x), ky = keyOf(y); return kx < ky ? -1 : kx > ky ? 1 : 0; });
  const rowIdx = {}; rows.forEach((r, i) => { rowIdx[r.a.id] = i; });

  const ROWH = 40, AXISH = 26;
  const body = el('div', 'cdtl-body');
  const names = el('div', 'cdtl-names');
  const axPad = el('div', 'cdtl-axis-pad'); axPad.style.height = AXISH + 'px'; names.appendChild(axPad);
  rows.forEach(r => {
    const n = el('div', 'cdtl-name'); n.style.height = ROWH + 'px';
    const badge2 = CDTL_STATUS[r.status];
    const l1 = el('div', 'cdtl-name-1', r.a.name + (r.a.last4 ? ' ••' + r.a.last4 : ''));
    const l2 = el('div', 'cdtl-name-2');
    const stat = el('span', 'cdtl-status s-' + r.status, badge2.label + (r.du != null && r.du >= 0 && r.du <= 90 ? ' · ' + r.du + 'd' : ''));
    l2.appendChild(document.createTextNode(r.a.institution ? r.a.institution + ' · ' : ''));
    l2.appendChild(stat);
    n.appendChild(l1); n.appendChild(l2);
    n.__acctId = r.a.id;
    names.appendChild(n);
  });
  const plot = el('div', 'cdtl-plot');
  plot.style.height = (rows.length * ROWH + AXISH) + 'px';
  plot.tabIndex = 0;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'cdtl-svg');
  plot.appendChild(svg);
  const tip = el('div', 'cdtl-tip'); tip.style.display = 'none'; plot.appendChild(tip);
  body.appendChild(names); body.appendChild(plot);
  card.appendChild(body);

  const hint = el('div', 'sum-hint', 'Bar thickness = principal (where entered) · Drag ↔ to pan · scroll to zoom at the cursor · double-click resets · arrow keys pan, + / − zoom · dashed edge = estimated start · faded bar = a past renewed term');
  card.appendChild(hint);

  // ---- maturing ladder (current terms only; money that becomes available) ----
  const ladder = el('div', 'cdtl-ladder');
  const lTitle = el('div', 'cdtl-ladder-title', 'Maturing principal by quarter');
  ladder.appendChild(lTitle);
  const qKey = t => { const d = new Date(t); return d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1); };
  const qMap = {};
  open.forEach(r => { const t = cdTms(r.a.cdMaturity); if (t == null) return; const k = qKey(t);
    (qMap[k] = qMap[k] || { total: 0, n: 0, known: 0, rows: [] }).n++;
    qMap[k].rows.push(r);
    if (r.a.cdPrincipal != null && r.a.cdPrincipal !== '') { qMap[k].total += Number(r.a.cdPrincipal); qMap[k].known++; } });
  const qKeys = Object.keys(qMap).sort();
  if (qKeys.length) {
    const maxQ = Math.max.apply(null, qKeys.map(k => qMap[k].total || 0)) || 1;
    const lrow = el('div', 'cdtl-ladder-row');
    qKeys.forEach(k => {
      const q = qMap[k];
      const cell = el('button', 'cdtl-q' + (cdTLopts.hlQ === k ? ' hl' : ''));
      cell.title = q.n + ' CD' + (q.n === 1 ? '' : 's') + ' maturing · ' + (q.known ? money(q.total) + (q.known < q.n ? ' (from ' + q.known + ' with principal entered)' : '') : 'no principals entered') + ' — click to see which accounts';
      // Bars live in a fixed-height well so every tile is the same size and the
      // heights stay comparable.
      const well = el('div', 'cdtl-q-well');
      const barEl = el('div', 'cdtl-q-bar'); barEl.style.height = Math.max(4, Math.round((q.total / maxQ) * 40)) + 'px';
      well.appendChild(barEl); cell.appendChild(well);
      cell.appendChild(el('div', 'cdtl-q-amt', q.known ? money(q.total) : q.n + '×'));
      cell.appendChild(el('div', 'cdtl-q-lbl', k.replace('-', ' ')));
      cell.appendChild(el('div', 'cdtl-q-n', q.n + ' CD' + (q.n === 1 ? '' : 's')));
      cell.addEventListener('click', () => {
        const on = cdTLopts.hlQ !== k;
        cdTLopts.hlQ = on ? k : null;   // highlight the matching timeline rows
        renderView(currentRoute);
        if (on) cdQuarterModal(k, q.rows);
      });
      lrow.appendChild(cell);
    });
    ladder.appendChild(lrow);
    ladder.appendChild(el('div', 'sum-hint', 'Current terms only — a term already renewed into a new one isn’t counted twice, and consolidated CDs count once under the combined CD.'));
    card.appendChild(ladder);
  }
  if (cdTLopts.hlQ) rows.forEach(r => { const t = cdTms(r.a.cdMaturity); if (t != null && qKey(t) === cdTLopts.hlQ) { const n = [...names.children].find(x => x.__acctId === r.a.id); if (n) n.classList.add('hl'); } });

  // ---- drawing ----
  let hits = [];
  const fmtShort = t => { const d = new Date(t); return MONTHS[d.getMonth()] + ' ' + d.getDate(); };
  function gridUnit(pxPerDay) { return pxPerDay > 16 ? 'day' : pxPerDay > 2.0 ? 'month' : pxPerDay > 0.55 ? 'quarter' : 'year'; }
  function redraw() {
    const W = plot.clientWidth || 600;
    const H = rows.length * ROWH + AXISH;
    const x = t => (t - view.s) / (view.e - view.s) * W;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    hits = [];
    let out = '';
    // gridlines + axis labels
    const pxPerDay = W / ((view.e - view.s) / CDTL_DAY);
    const unit = gridUnit(pxPerDay);
    const d0 = new Date(view.s);
    let cur = unit === 'day' ? new Date(d0.getFullYear(), d0.getMonth(), d0.getDate())
      : unit === 'month' ? new Date(d0.getFullYear(), d0.getMonth(), 1)
      : unit === 'quarter' ? new Date(d0.getFullYear(), Math.floor(d0.getMonth() / 3) * 3, 1)
      : new Date(d0.getFullYear(), 0, 1);
    let guard = 0;
    while (cur.getTime() < view.e && guard++ < 400) {
      const t = cur.getTime();
      if (t >= view.s) {
        const gx = x(t);
        const isYear = cur.getMonth() === 0 && cur.getDate() === 1;
        out += '<line x1="' + gx + '" y1="' + AXISH + '" x2="' + gx + '" y2="' + H + '" class="cdtl-grid' + (isYear ? ' major' : '') + '"/>';
        const lbl = unit === 'day' ? fmtShort(t)
          : unit === 'month' ? MONTHS[cur.getMonth()] + ' ' + String(cur.getFullYear()).slice(2)
          : unit === 'quarter' ? 'Q' + (Math.floor(cur.getMonth() / 3) + 1) + ' ' + String(cur.getFullYear()).slice(2)
          : String(cur.getFullYear());
        out += '<text x="' + (gx + 3) + '" y="16" class="cdtl-axis">' + lbl + '</text>';
      }
      if (unit === 'day') cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
      else if (unit === 'month') cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      else if (unit === 'quarter') cur = new Date(cur.getFullYear(), cur.getMonth() + 3, 1);
      else cur = new Date(cur.getFullYear() + 1, 0, 1);
    }
    // future space gets a whisper of shading so past vs future reads at a glance
    if (nowT > view.s && nowT < view.e) out += '<rect x="' + x(nowT) + '" y="' + AXISH + '" width="' + (W - x(nowT)) + '" height="' + (H - AXISH) + '" class="cdtl-future"/>';
    // segments -- bar THICKNESS scales with principal (sqrt, so one big CD
    // doesn't flatten the rest); no principal entered = default thickness,
    // implying nothing. The $ amount also prints in the bar when it fits.
    const maxP = Math.max.apply(null, [0].concat(rows.flatMap(r => r.cycles.map(c => Number(c.principal) || 0))));
    const kFmt = p => '$' + (p >= 1000 ? (p / 1000).toFixed(p >= 10000 ? 0 : 1) + 'k' : Math.round(p));
    rows.forEach((r, ri) => {
      r.cycles.forEach(c => {
        if (c.e < view.s || c.s > view.e) return;
        const p = Number(c.principal) || 0;
        const h = (p > 0 && maxP > 0) ? Math.round(12 + (ROWH - 14 - 12) * Math.sqrt(p / maxP)) : ROWH - 14;
        const y = AXISH + ri * ROWH + Math.round((ROWH - h) / 2);
        const cls = CDTL_STATUS[c.current ? r.status : 'matured'];
        const x1 = Math.max(x(c.s), 0), x2 = Math.min(x(c.e), W);
        const wpx = Math.max(x2 - x1, 2);
        // A past renewed term is drawn faded so the current term reads as the
        // live one at a glance (they sit adjacent on the same row).
        out += '<rect x="' + x1 + '" y="' + y + '" width="' + wpx + '" height="' + h + '" rx="4" fill="' + cls.fill + '" stroke="' + cls.stroke + '"' + (c.current ? '' : ' fill-opacity="0.42"') + (c.estStart ? ' stroke-dasharray="4 3"' : '') + ' class="cdtl-seg"/>';
        // Principal first (it's what "how heavy is this CD" asks) and from a
        // narrow width; APY and term fill in only when there's real room.
        let lbl = '';
        if (p > 0 && wpx > 40) lbl = kFmt(p);
        if (c.apy !== '' && c.apy != null && wpx > (lbl ? 96 : 46)) lbl += (lbl ? ' · ' : '') + Number(c.apy).toFixed(2) + '%';
        if (c.term && wpx > (lbl ? 150 : 62)) lbl += (lbl ? ' · ' : '') + c.term;
        if (lbl) out += '<text x="' + (x1 + 5) + '" y="' + (y + h / 2 + 4) + '" class="cdtl-seg-lbl" fill="' + cls.text + '">' + lbl + '</text>';
        if (!c.current) out += '<text x="' + (x2 - 4) + '" y="' + (y + h / 2 + 4) + '" text-anchor="end" class="cdtl-seg-lbl" fill="' + cls.text + '">↻</text>';
        if (x(c.s) < 0) out += '<text x="2" y="' + (y + h / 2 + 4) + '" class="cdtl-cont">‹</text>';
        if (x(c.e) > W) out += '<text x="' + (W - 8) + '" y="' + (y + h / 2 + 4) + '" class="cdtl-cont">›</text>';
        hits.push({ x1, x2, y1: y, y2: y + h, c, r });
      });
    });
    // consolidation connectors
    if (cdTLopts.rel) data.links.forEach(lk => {
      const fi = rowIdx[lk.fromId], ti = rowIdx[lk.toId];
      if (fi == null || ti == null) return;
      const fr = rows[fi], tr = rows[ti];
      const fc = fr.cycles[fr.cycles.length - 1], tc = tr.cycles[0];
      if (!fc || !tc) return;
      const xa = x(fc.e), ya = AXISH + fi * ROWH + ROWH / 2;
      const xb = x(tc.s), yb = AXISH + ti * ROWH + ROWH / 2;
      if ((xa < 0 && xb < 0) || (xa > W && xb > W)) return;
      const mid = xa + Math.max(12, (xb - xa) / 2);
      out += '<path d="M' + xa + ',' + ya + ' C' + mid + ',' + ya + ' ' + (xb - 14) + ',' + yb + ' ' + (xb - 3) + ',' + yb + '" class="cdtl-link"/>';
      out += '<path d="M' + (xb - 3) + ',' + yb + ' l-6,-4 l0,8 z" class="cdtl-link-arrow"/>';
    });
    // today marker on top
    if (nowT > view.s && nowT < view.e) {
      out += '<line x1="' + x(nowT) + '" y1="' + AXISH + '" x2="' + x(nowT) + '" y2="' + H + '" class="cdtl-today"/>';
      out += '<text x="' + (x(nowT) + 4) + '" y="' + (AXISH - 3) + '" class="cdtl-today-lbl">Today</text>';
    }
    svg.innerHTML = out;
  }

  // ---- interactions ----
  let raf = 0;
  const queue = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; redraw(); }); };
  let drag = null;
  plot.addEventListener('pointerdown', ev => { drag = { x0: ev.clientX, s0: view.s, e0: view.e }; plot.setPointerCapture(ev.pointerId); plot.classList.add('dragging'); });
  plot.addEventListener('pointerup', ev => { drag = null; plot.classList.remove('dragging'); });
  plot.addEventListener('pointercancel', () => { drag = null; plot.classList.remove('dragging'); });
  plot.addEventListener('pointermove', ev => {
    const rect = plot.getBoundingClientRect();
    if (drag) {
      const dx = ev.clientX - drag.x0;
      const span = drag.e0 - drag.s0;
      const dt = dx / rect.width * span;
      view.s = drag.s0 - dt; view.e = drag.e0 - dt;
      tip.style.display = 'none';
      queue();
      return;
    }
    // crosshair + tooltip
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    const t = view.s + mx / rect.width * (view.e - view.s);
    const hit = hits.find(hh => mx >= hh.x1 && mx <= hh.x2 && my >= hh.y1 && my <= hh.y2);
    let html = '<div class="cdtl-tip-date">' + fmtDate(cdTiso(t)) + '</div>';
    if (hit) {
      const c = hit.c, r = hit.r;
      const days = Math.round((c.e - c.s) / CDTL_DAY);
      const elapsed = Math.max(0, Math.min(days, Math.round((t - c.s) / CDTL_DAY)));
      html += '<div class="cdtl-tip-name">' + (r.a.institution ? r.a.institution + ' · ' : '') + r.a.name + (c.last4 ? ' ••' + c.last4 : '') + '</div>' +
        '<div>' + (c.current ? (c.idx > 0 ? 'Renewal ' + c.idx : 'Current term') : c.idx === 0 ? 'Original term' : 'Renewal ' + c.idx) + (r.a.consolidatedIntoId ? ' · consolidated into ' + (store.accountName(r.a.consolidatedIntoId) || 'another CD') : '') + '</div>' +
        '<div>' + fmtDate(cdTiso(c.s)) + (c.estStart ? ' (est.)' : '') + ' → ' + fmtDate(cdTiso(c.e)) + (c.term ? ' · ' + c.term + (c.termEst ? ' ≈' : '') : '') + '</div>' +
        '<div>' + (c.apy !== '' && c.apy != null ? Number(c.apy).toFixed(2) + '% APY' : 'APY —') + (c.principal !== '' && c.principal != null ? ' · ' + money(Number(c.principal)) : '') + '</div>' +
        '<div class="muted">' + elapsed + 'd elapsed · ' + Math.max(0, days - elapsed) + 'd remaining at this point</div>';
      if (c.apy !== '' && c.apy != null && c.principal !== '' && c.principal != null) {
        const pr = Number(c.principal), ap = Number(c.apy);
        html += '<div class="muted">Est. interest: ' + money(pr * ap / 100 * (elapsed / 365)) + ' to here · ' + money(pr * ap / 100 * (days / 365)) + ' full term</div>';
      }
    }
    tip.innerHTML = html;
    tip.style.display = '';
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(4, mx + 14), rect.width - tw - 4) + 'px';
    tip.style.top = Math.min(my + 12, rect.height - tip.offsetHeight - 4) + 'px';
  });
  plot.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
  plot.addEventListener('wheel', ev => {
    ev.preventDefault();
    const rect = plot.getBoundingClientRect();
    const t0 = view.s + (ev.clientX - rect.left) / rect.width * (view.e - view.s);
    const f = ev.deltaY < 0 ? 0.85 : 1.18;
    let ns = t0 - (t0 - view.s) * f, ne = t0 + (view.e - t0) * f;
    const span = ne - ns;
    if (span < 21 * CDTL_DAY || span > 22000 * CDTL_DAY) return;
    view.s = ns; view.e = ne;
    queue();
  }, { passive: false });
  plot.addEventListener('dblclick', () => { Object.assign(view, defView()); queue(); });
  plot.addEventListener('keydown', ev => {
    const span = view.e - view.s;
    if (ev.key === 'ArrowLeft') { view.s -= span * 0.1; view.e -= span * 0.1; }
    else if (ev.key === 'ArrowRight') { view.s += span * 0.1; view.e += span * 0.1; }
    else if (ev.key === '+' || ev.key === '=') { view.s += span * 0.1; view.e -= span * 0.1; }
    else if (ev.key === '-') { view.s -= span * 0.125; view.e += span * 0.125; }
    else if (ev.key === 'Home') { view.s = dMin - span * 0.05; view.e = dMin + span * 0.95; }
    else if (ev.key === 'End') { view.s = dMax - span * 0.95; view.e = dMax + span * 0.05; }
    else return;
    ev.preventDefault(); queue();
  });
  requestAnimationFrame(redraw);
  return card;
}

function renderAccounts(view) {
  const store = window.cloverStore, s = store.state;
  const head = el('div', 'view-head');
  const left = el('div'); left.appendChild(el('h3', null, 'Accounts'));
  left.appendChild(el('p', 'muted', s.accounts.length + ' account' + (s.accounts.length === 1 ? '' : 's')));
  head.appendChild(left);
  const acctActions = el('div', 'head-actions');
  const add = el('button', 'btn-primary', '+ Add account'); add.addEventListener('click', () => accountModal(null));
  acctActions.appendChild(add);
  head.appendChild(acctActions);
  view.appendChild(head);

  if (!s.accounts.length) {
    view.appendChild(emptyState('No accounts yet',
      'Add your banks, cards, and brokerages so they can be linked to income and expenses.',
      '+ Add account', () => accountModal(null)));
    return;
  }

  const openAccts = s.accounts.filter(a => !a.closed);
  const closedAccts = s.accounts.filter(a => a.closed);
  if (accountsTab === 'closed' && !closedAccts.length) accountsTab = 'open';
  const onClosed = accountsTab === 'closed';
  const tabs = el('div', 'tabs');
  [['open', 'Open (' + openAccts.length + ')'], ['closed', 'Closed (' + closedAccts.length + ')']].forEach(([t, label]) => {
    const b = el('button', 'tab' + (accountsTab === t ? ' active' : ''), label);
    b.addEventListener('click', () => { accountsTab = t; renderView(currentRoute); });
    tabs.appendChild(b);
  });
  // The timeline rides the tab row — next to Open/Closed, where views get
  // switched, so it can't be missed. Toggle semantics: sets/clears the same
  // type=CD filter that clicking a CD badge does.
  if (s.accounts.some(a => a.type === 'CD' && !a.closed)) {
    const cdOn = accountsCdTimeline;
    const cdTab = el('button', 'tab' + (cdOn ? ' active' : ''), '⧗ CD timeline');
    cdTab.title = cdOn ? 'Hide the CD maturity timeline and clear the CD filter'
      : 'Show the CD maturity timeline — every term, renewal, and consolidation drawn to its real dates; the table also gains a Principal column with each amount\u2019s as-of date';
    cdTab.addEventListener('click', () => {
      accountsCdTimeline = !cdOn;
      if (accountsCdTimeline && accountsFilter && accountsFilter.key === 'type') accountsFilter = null;
      accountsTab = 'open';   // the timeline lives on the Open tab
      renderView(currentRoute);
    });
    tabs.appendChild(cdTab);
  }
  view.appendChild(tabs);

  // CD-timeline mode: base set is your open CDs; a value badge (institution,
  // owner, beneficiary) narrows within them - a type filter is meaningless here.
  const cdMode = accountsCdTimeline && !onClosed && openAccts.some(a => a.type === 'CD');
  const secFilter = accountsFilter && accountsFilter.key !== 'type' ? accountsFilter : null;
  const effFilter = cdMode ? secFilter : accountsFilter;
  const valOfKey = (a, key) => key === 'owner' ? store.personName(a.personId) : key === 'beneficiaries' ? beneficiaryText(a) : (a[key] || '');
  let baseAccts = onClosed ? closedAccts : openAccts;
  if (cdMode) baseAccts = baseAccts.filter(a => a.type === 'CD');
  const dataCols = onClosed
    ? ['name', 'type', 'institution', 'last4', 'owner', 'closedDate'].map(k => buildAcctCol(store, k)).filter(Boolean)
    : tableColKeys(store, 'accounts', ACCT_COL_LABELS, ACCT_DEFAULT_COLS).map(k => buildAcctCol(store, k)).filter(Boolean);
  // With the CD timeline open, principal is the number that matters — surface
  // it as its own column (with the as-of date under each amount) even when the
  // user hasn't added the Balance column to their saved layout.
  const cdFilterOn = cdMode;
  if (cdFilterOn && !dataCols.some(c => c && c.key === 'balance')) {
    const pc = buildAcctCol(store, 'balance');
    if (pc) { pc.label = 'Principal'; dataCols.push(pc); }
  }
  if (cdFilterOn && !dataCols.some(c => c && c.key === 'cdTerm')) {
    const tc = buildAcctCol(store, 'cdTerm');
    if (tc) dataCols.push(tc);
  }
  const cols = [
    ...dataCols,
    { label: '', sortable: false, cell: a => {
        const td = el('td', 'row-actions');
        const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => accountModal(a));
        td.appendChild(edit);
        if (a.closed) { const re = el('button', 'icon-btn', 'Reopen'); re.title = 'Mark this account open and active again'; re.addEventListener('click', () => { store.saveAccount(Object.assign({}, a, { closed: false, active: true, closedDate: '' })); toast('Account reopened'); accountsTab = 'open'; }); td.appendChild(re); }
        else { const cl = el('button', 'icon-btn', 'Close'); cl.title = 'Close this account (shows what’s tied to it first)'; cl.addEventListener('click', () => closeAccountModal(a)); td.appendChild(cl); }
        const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove(a.name, () => store.removeAccount(a.id)));
        td.appendChild(del); return td; } }
  ];
  if (!onClosed) { const bestCal = bestCardCallout(store); if (bestCal) view.appendChild(bestCal); }

  let acctRows = baseAccts;
  if (effFilter) acctRows = baseAccts.filter(a => valOfKey(a, effFilter.key) === effFilter.value);
  // The timeline visualizes ALL matching CDs (open + closed/consolidated, so its
  // own "show matured" toggle still works), narrowed by any active value badge.
  if (cdMode) {
    let cdSet = s.accounts.filter(a => a.type === 'CD');
    if (secFilter) cdSet = cdSet.filter(a => valOfKey(a, secFilter.key) === secFilter.value);
    view.appendChild(cdTimelinePanel(store, cdSet));
    const g = cdPrincipalGrowthCard(store, cdSet); if (g) view.appendChild(g);
  }
  // The active-filter chip shares the ⚙ Columns row — a filter shouldn't cost
  // a whole row of empty space. Same pattern as the other filtered tables.
  const acctTools = el('div', 'table-tools');
  if (effFilter) {
    const f = effFilter;
    const info = el('span', 'muted', 'Showing ' + acctRows.length + ' account' + (acctRows.length === 1 ? '' : 's') + ' where ' + (ACCT_COL_LABELS[f.key] || f.key) + ' = “' + f.value + '”');
    info.style.marginRight = 'auto';
    const clear = el('button', 'btn-ghost', '✕ Clear filter');
    clear.addEventListener('click', () => { accountsFilter = null; renderView(currentRoute); });
    acctTools.appendChild(info); acctTools.appendChild(clear);
  }
  if (!onClosed) acctTools.appendChild(columnsButton('accounts', ACCT_ALL_COLS, ACCT_DEFAULT_COLS, ACCT_COL_LABELS, 'Account columns'));
  if (acctTools.childNodes.length) view.appendChild(acctTools);
  const card = el('div', 'card table-card');
  card.appendChild(sortableTable(cols, acctRows, accountsSort, ns => { accountsSort = ns || { key: 'name', dir: 'asc' }; renderView(currentRoute); }, a => a.active === false ? 'inactive-row' : ''));
  view.appendChild(card);
}

// "Best card to use today" — the active credit card whose purchase-today has the
// most float. Shared by the Accounts page and the dashboard panel.
function bestCardCallout(store) {
  const cardsWithFloat = store.state.accounts
    .filter(a => a.type === 'Credit Card' && a.active !== false && ccFloatToday(a) != null)
    .map(a => ({ a, float: ccFloatToday(a) }))
    .sort((x, y) => y.float - x.float);
  if (!cardsWithFloat.length) return null;
  const best = cardsWithFloat[0];
  const cal = el('div', 'callout');
  cal.innerHTML = '💳 <strong>Best card to use today:</strong> ' + best.a.name +
    (best.a.last4 ? ' ••' + best.a.last4 : '') + ' — <strong>' + best.float + ' days</strong> until a purchase made today is due.';
  if (cardsWithFloat.length > 1) {
    const rest = cardsWithFloat.slice(1).map(c => c.a.name + ' (' + c.float + 'd)').join(', ');
    cal.appendChild(el('div', 'callout-sub', 'Others: ' + rest));
  }
  return cal;
}

// Credit-card float: days until a purchase made TODAY would be due.
// A purchase posts to the currently-open statement, which closes on the next
// close day; payment is due on the next due day after that close.
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function clampDay(day, y, m) { return Math.min(day, daysInMonth(y, m)); }
// A day can be a number (1–31) or the string 'last' (last day of that month).
function resolveDay(day, y, m) { return day === 'last' ? daysInMonth(y, m) : clampDay(Number(day), y, m); }
function nextDom(day, from) {
  const y = from.getFullYear(), m = from.getMonth();
  let d = new Date(y, m, resolveDay(day, y, m));
  if (d < from) d = new Date(y, m + 1, resolveDay(day, y, m + 1));
  return d;
}
function ccFloatToday(acc) {
  const close = acc.statementCloseDay, due = acc.dueDay;
  if (!close || !due) return null;   // 'last' and 1–31 are truthy; null/0 are not
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const closeDate = nextDom(close, today);
  const dueDate = nextDom(due, closeDate);
  return Math.round((dueDate - today) / 86400000);
}
const BENEFICIARY_TYPES = ['Savings', 'CD', 'Brokerage', 'Retirement'];

function emptyState(title, msg, btnLabel, onClick) {
  const d = el('div', 'empty');
  d.appendChild(el('div', 'empty-ico', '▦'));
  d.appendChild(el('h3', null, title));
  d.appendChild(el('p', 'muted', msg));
  if (btnLabel) { const b = el('button', 'btn-primary', btnLabel); b.addEventListener('click', onClick); d.appendChild(b); }
  return d;
}

// Past CD terms, newest first — what the CD was before each renewal: length,
// APY, the maturity that ended the term, and the account number it lived under.
function cdRenewalsPanel(a) {
  const p = el('div', 'hist-panel');
  const list = el('div', 'hist-list');
  const rowFor = (title, term, apy, maturity, last4, sub, start, principal, startEst) => {
    const e = el('div', 'hist-entry');
    e.appendChild(el('div', 'hist-when', title));
    const bits = [];
    if (start) bits.push('opened ' + fmtDate(start) + (startEst ? ' (est.)' : ''));
    if (term) bits.push(term);
    bits.push(apy !== '' && apy != null ? Number(apy).toFixed(2) + '% APY' : 'APY —');
    bits.push(maturity ? 'matures ' + fmtDate(maturity) : 'maturity —');
    if (principal !== '' && principal != null) bits.push(money(Number(principal)));
    if (last4) bits.push('••' + last4);
    const line = el('div', null, bits.join(' · '));
    e.appendChild(line);
    if (sub) e.appendChild(el('div', 'muted', sub));
    return e;
  };
  list.appendChild(rowFor('Current term', a.cdTerm ? a.cdTerm + (a.cdTermEst ? ' ≈' : '') : a.cdTerm, a.cdApy, a.cdMaturity, a.last4, '', a.cdStart, a.cdPrincipal, a.cdStartEst));
  (a.cdRenewals || []).slice().reverse().forEach((t, i, arr) => {
    const label = 'Previous term' + (arr.length > 1 ? ' · ' + (arr.length - i) : '');
    const e = rowFor(label, t.term, t.apy, t.maturity, t.last4, t.at ? 'renewed ' + fmtDate(t.at) : '', t.start || '', t.principal != null ? t.principal : '', false);
    // past terms: "matures" reads wrong once it's over
    e.childNodes[1].textContent = e.childNodes[1].textContent.replace('matures ', 'matured ');
    list.appendChild(e);
  });
  (a.cdFundedBy || []).slice().reverse().forEach(fb => {
    const e = el('div', 'hist-entry');
    e.appendChild(el('div', 'hist-when', 'Consolidated in' + (fb.at ? ' · ' + fmtDate(fb.at) : '')));
    (fb.sources || []).forEach(sc => e.appendChild(el('div', null, sc.name + (sc.last4 ? ' ••' + sc.last4 : '') + (sc.principal !== '' && sc.principal != null ? ' · ' + money(Number(sc.principal)) : ''))));
    e.appendChild(el('div', 'muted', 'Each source CD keeps its own full history — find it under Accounts → Closed.'));
    list.appendChild(e);
  });
  p.appendChild(list);
  return p;
}
// Repeatable name + % rows (each beneficiary on one line), value() -> array.
// Every principal figure we know for the CDs, with the date it applied, drawn
// from three sources: the account History (each cdPrincipal change carries the
// day it was made), the renewal archive (each ended term's principal), and the
// current value with its as-of date. Deduped per CD by date. Returns the
// distinct dates and, at each, the TOTAL across CDs = sum of each CD's latest
// known principal at-or-before that date (a step function — growth as money is
// added or balances are updated). Pure — no DOM.
function cdPrincipalSnapshots(store, accts) {
  const series = [];
  (accts || store.state.accounts).filter(a => a.type === 'CD').forEach(a => {
    const byDate = {};
    const add = (iso, val) => {
      const d = String(iso || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      if (val === '' || val == null || isNaN(Number(val))) return;
      byDate[d] = Number(val);   // last write for a given day wins
    };
    (a.cdRenewals || []).forEach(t => add(t.at || t.start, t.principal));
    (a.history || []).forEach(h => (h.changes || []).forEach(c => { if (c.f === 'cdPrincipal') add(h.at, c.to); }));
    add(a.cdPrincipalAsOf || a.updatedAt || a.createdAt, a.cdPrincipal);
    const dates = Object.keys(byDate).sort();
    if (dates.length) series.push({ a, pts: dates.map(d => ({ d, v: byDate[d] })) });
  });
  const allDates = [...new Set(series.flatMap(s => s.pts.map(p => p.d)))].sort();
  const totalAt = d => series.reduce((sum, s) => {
    let v = 0; for (const p of s.pts) { if (p.d <= d) v = p.v; else break; } return sum + v;
  }, 0);
  return { series, allDates, totals: allDates.map(totalAt) };
}
function cdPrincipalGrowthCard(store, accts) {
  const snap = cdPrincipalSnapshots(store, accts);
  if (!snap.series.length) return null;   // no principals entered anywhere
  const card = el('div', 'card');
  card.appendChild(el('h3', 'strip-title', 'CD principal over time'));
  card.appendChild(el('p', 'muted', 'Total across all CDs — it steps up each time you enter or update a principal, so you can watch the pile grow.'));
  if (snap.allDates.length < 2) {
    card.appendChild(el('div', 'muted', 'Not enough dated principal entries yet to chart growth — this fills in as you enter or update CD principals on different days.'));
    return card;
  }
  const wrap = el('div', 'card chart-wrap'); const cv = document.createElement('canvas'); wrap.appendChild(cv); card.appendChild(wrap);
  buildLineChart(cv, { labels: snap.allDates.map(fmtDateShort), yTitle: '$ total', datasets: [{
    label: 'Total CD principal', data: snap.totals,
    borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.12)', fill: true, stepped: true, pointRadius: 3, tension: 0
  }] });
  return card;
}
function beneficiaryEditor(existing) {
  const store = window.cloverStore;
  const wrap = el('div', 'benef-editor');
  // Names come from the Settings-managed list (a dropdown), but you can still
  // type a one-off — the datalist suggests without restricting.
  const dl = el('datalist'); dl.id = 'benef-name-list';
  (store.state.catalog.beneficiaries || []).slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(x => { const o = el('option'); o.value = x.name; dl.appendChild(o); });
  wrap.appendChild(dl);
  const head = el('div', 'benef-row benef-head');
  head.appendChild(el('span', 'muted', 'Name')); head.appendChild(el('span', 'muted', '%')); head.appendChild(el('span'));
  const rowsBox = el('div');
  const total = el('div', 'muted benef-total');
  const recalc = () => {
    let sum = 0, any = false;
    rowsBox.querySelectorAll('.benef-pct').forEach(p => { const v = parseFloat(p.value); if (!isNaN(v)) { sum += v; any = true; } });
    total.textContent = any ? 'Total: ' + (Number.isInteger(sum) ? sum : sum.toFixed(2)) + '%' + (sum > 100.0001 ? ' — over 100%' : sum < 99.9999 ? ' — under 100%' : '') : '';
    total.classList.toggle('off100', any && Math.abs(sum - 100) > 0.001);
  };
  const addRow = (name, pct) => {
    const row = el('div', 'benef-row');
    const nm = input(name || '', { placeholder: 'pick or type a name', list: 'benef-name-list' });
    const pc = input(pct != null && pct !== '' ? pct : '', { type: 'number', placeholder: '%' }); pc.min = 0; pc.max = 100; pc.step = '0.01'; pc.className = 'benef-pct';
    pc.addEventListener('input', recalc);
    const rm = el('button', 'icon-btn danger', '✕'); rm.title = 'Remove this beneficiary'; rm.addEventListener('click', ev => { ev.preventDefault(); row.remove(); recalc(); });
    row.appendChild(nm); row.appendChild(pc); row.appendChild(rm);
    row.__get = () => ({ name: nm.value.trim(), pct: pc.value === '' ? '' : (parseFloat(pc.value) || 0) });
    rowsBox.appendChild(row);
  };
  (existing && existing.length ? existing : [{ name: '', pct: '' }]).forEach(b => addRow(b.name, b.pct));
  const add = el('button', 'btn-ghost', '＋ Add beneficiary'); add.addEventListener('click', ev => { ev.preventDefault(); addRow('', ''); recalc(); });
  wrap.appendChild(head); wrap.appendChild(rowsBox); wrap.appendChild(total); wrap.appendChild(add);
  wrap.__value = () => [...rowsBox.querySelectorAll('.benef-row')].map(r => r.__get()).filter(b => b.name || (b.pct !== '' && b.pct != null));
  recalc();
  return wrap;
}
function accountModal(existing) {
  const store = window.cloverStore, s = store.state;
  const dflt = store.accountDefaults();
  const a = existing ? Object.assign({}, existing) : {
    active: dflt.active !== false, usedForIncome: !!dflt.usedForIncome,
    usedForExpenses: !!dflt.usedForExpenses, usedForAutopay: !!dflt.usedForAutopay, rewardsCard: !!dflt.rewardsCard
  };
  const body = el('div', 'form-grid');

  const dl = el('datalist'); dl.id = 'inst-list';
  s.catalog.institutions.slice().sort((a, b) => a.name.localeCompare(b.name))
    .forEach(i => { const o = el('option'); o.value = i.name; dl.appendChild(o); });
  body.appendChild(dl);

  const fName = input(a.name || '', { placeholder: 'e.g. Everyday Checking' });
  const fInst = input(a.institution || '', { placeholder: 'Bank / broker', list: 'inst-list' });
  const fType = select(store.ACCOUNT_TYPES, a.type || 'Checking');
  const fLast4 = input(a.last4 || '', { placeholder: '1234' }); fLast4.maxLength = 4; fLast4.inputMode = 'numeric';
  const fOwner = select(s.persons.map(p => ({ value: p.id, label: p.name })), a.personId || (s.persons[0] && s.persons[0].id));
  const rolloverOpts = [{ value: '', label: '— None —' }].concat(
    s.accounts.filter(x => x.id !== a.id).sort((x, y) => x.name.localeCompare(y.name))
      .map(x => ({ value: x.id, label: x.name + (x.last4 ? ' ••' + x.last4 : '') + (x.institution ? ' (' + x.institution + ')' : '') })));
  const fPrev = select(rolloverOpts, a.previousAccountId || '');
  const cActive = checkbox('Active', a.active !== false, 'This account is currently open and in use. Inactive accounts are kept for history but hidden from most pickers.');
  const cIncome = checkbox('Used for income', a.usedForIncome, 'Money comes IN here — e.g. a bank or broker that receives paychecks, dividends, or interest. Makes it selectable as a source when logging income.');
  const cExpense = checkbox('Used for expenses', a.usedForExpenses, 'Money goes OUT here — e.g. a card or checking account you pay bills with. Makes it selectable as a payment method for expenses and subscriptions.');
  const cAuto = checkbox('Used for auto-pay', a.usedForAutopay, 'This account has automatic payments set up on it.');
  const cRewards = checkbox('Rewards card', a.rewardsCard, 'This card earns cash back, points, or rewards.');
  const fNotes = document.createElement('textarea'); fNotes.value = a.notes || ''; fNotes.rows = 2; fNotes.placeholder = 'Optional';
  const fBenef = beneficiaryEditor(beneficiaryList(a));

  const termMo0 = store.parseTermMonths(a.cdTerm);
  const fTerm = input(termMo0 != null ? String(termMo0) : (a.cdTerm || ''), { placeholder: 'e.g. 12' });
  fTerm.__wrap = el('div', 'unit-input'); fTerm.__wrap.appendChild(fTerm); fTerm.__wrap.appendChild(el('span', 'unit-suffix', 'months'));
  const fStart = input(a.cdStart || '', { type: 'date' });
  const fPrincipal = moneyInput(a.cdPrincipal != null && a.cdPrincipal !== '' ? a.cdPrincipal : '', { placeholder: 'optional' });
  const fApy = input(a.cdApy || '', { placeholder: 'e.g. 4.00' });
  const fMat = input(a.cdMaturity || '', { type: 'date' });
  const fCdApyDate = input(a.apyAsOf || '', { type: 'date' });
  const cdWrap = el('div', 'cd-fields');
  const termField = field('CD term', fTerm, 'The length of the CD. A number alone means months — 13 is 13 months — or write it out ("18 months", "1 year"). Left blank with both dates known, it’s calculated from start → maturity.');
  if (a.cdTermEst && a.cdTerm) {
    const m = el('span', 'est-mark', '≈');
    m.title = 'Calculated, not entered by hand: whole months from the start date to the maturity date. If it looks wrong, one of those dates is — edit this field to type the real term and the marker goes away.';
    termField.querySelector('span').appendChild(m);
  }
  const startField = field('Start date', fStart, 'When this CD term began (the day it was opened). If left blank, Clover estimates it as maturity minus the term (real calendar months) and marks it estimated — enter the real date any time to make it exact.');
  if (a.cdStartEst && a.cdStart) {
    const m = el('span', 'est-mark', '≈');
    m.title = 'Estimated, not entered by hand: maturity date minus the CD term (' + (a.cdTerm || 'term') + '), real calendar months. If it looks wrong, the term or maturity is — edit this date to the real one and the marker goes away.';
    startField.querySelector('span').appendChild(m);
  }
  // Order so related fields pair up on the same row in the 2-col grid:
  // term | principal, then start | maturity (the span), then APY | APY-as-of.
  cdWrap.appendChild(termField);
  cdWrap.appendChild(field('Principal $', fPrincipal, 'How much is in this CD — e.g. 10000.00. Optional, but it powers the timeline’s principal totals and the maturing-money ladder.'));
  cdWrap.appendChild(startField);
  cdWrap.appendChild(field('Maturity date', fMat, 'When the CD matures. Will show on the calendar and in renewal warnings.'));
  cdWrap.appendChild(field('APY %', fApy, 'The annual percentage yield this CD earns.'));
  cdWrap.appendChild(field('APY as of', fCdApyDate, 'The date this APY was accurate — shown under the rate in the APY column. Defaults to today when you set a rate.'));

  // Renew flow — rolling a CD into its next term keeps the SAME account record
  // (so everything linked to it stays linked) while the ending term's numbers
  // are archived to the Renewals tab. Banks sometimes issue a new account
  // number on renewal; entering one swaps it in, blank keeps the old.
  let renewOpen = false;
  const rApy = input('', { type: 'number', placeholder: 'e.g. 4.25' }); rApy.step = '0.01'; rApy.min = 0;
  const rStart = input(a.cdMaturity || '', { type: 'date' });
  const rMat = input('', { type: 'date' });
  const rTerm = input('', { placeholder: 'e.g. 12 (blank keeps current)' });
  rTerm.__wrap = el('div', 'unit-input'); rTerm.__wrap.appendChild(rTerm); rTerm.__wrap.appendChild(el('span', 'unit-suffix', 'months'));
  const rLast4 = input('', { placeholder: a.last4 ? 'blank = keep ••' + a.last4 : 'optional' }); rLast4.maxLength = 4; rLast4.inputMode = 'numeric';
  const rPrincipal = moneyInput('', { placeholder: a.cdPrincipal ? 'blank = keep ' + money(Number(a.cdPrincipal)) : 'optional' });
  const consolChecks = [];
  if (existing && existing.id) {
    const renewWrap = el('div', 'cd-fields renew-fields');
    renewWrap.style.display = 'none';
    renewWrap.appendChild(field('New start date', rStart, 'When the renewed term actually begins. Defaults to the old maturity date, but change it if this renewed early or the new term doesn’t start until days after maturity — it drives where the new bar sits on the timeline.'));
    renewWrap.appendChild(field('New APY %', rApy, 'The rate the renewed CD earns — e.g. 4.25. Worth a call to the bank about current rates before the auto-renew window closes.'));
    renewWrap.appendChild(field('New maturity date', rMat, 'When the renewed CD matures — e.g. a 12-month, Aug 1 2026 start runs to Aug 1, 2027.'));
    renewWrap.appendChild(field('New CD length', rTerm, 'The renewed term — e.g. 12 months, 9 months. Blank keeps the current length.'));
    renewWrap.appendChild(field('New account # (last 4)', rLast4, 'Only if the bank issued a NEW account number for the renewal — blank keeps the current one.'));
    renewWrap.appendChild(field('New principal $', rPrincipal, 'The renewed balance — usually old principal plus the interest it earned, plus anything you added. Blank keeps the current figure.'));
    // Consolidation: other CDs whose money rolled INTO this renewal. Sources get
    // closed (and point here), so nothing is double-counted going forward.
    const consolCandidates = s.accounts.filter(x => x.type === 'CD' && x.id !== a.id && !x.closed);
    if (consolCandidates.length) {
      const cwrap = el('div', 'check-col');
      consolCandidates.forEach(o => {
        const cb = checkbox(o.name + (o.last4 ? ' ••' + o.last4 : '') + (o.cdPrincipal ? ' · ' + money(Number(o.cdPrincipal)) : ''), false);
        consolChecks.push({ cb, o }); cwrap.appendChild(cb);
      });
      const consolField = field('Also consolidate these CDs into this one', cwrap, 'Tick any CD whose money was combined into this renewal. Each one is marked closed (dated today) and linked here, and the timeline draws the merge — so the money is never counted twice.');
      consolField.style.gridColumn = '1 / -1';
      renewWrap.appendChild(consolField);
    }
    const du = daysUntil(a.cdMaturity);
    const soon = du != null && du <= 14;
    const renewLabel = '↻ Renew CD…' + (soon ? (du < 0 ? ' (matured ' + fmtDate(a.cdMaturity) + ')' : du === 0 ? ' (matures today)' : ' (matures in ' + du + 'd)') : '');
    const renewBtn = el('button', 'btn-ghost' + (soon ? ' renew-soon' : ''), renewLabel);
    renewBtn.title = 'Roll this CD into its next term: the current APY, maturity date, length, and account number move to the Renewals tab, and the new term takes their place.';
    renewBtn.addEventListener('click', ev => {
      ev.preventDefault();
      renewOpen = !renewOpen;
      renewWrap.style.display = renewOpen ? '' : 'none';
      renewBtn.textContent = renewOpen ? '✕ Cancel renewal' : renewLabel;
      if (renewOpen) rApy.focus();
    });
    const rbRow = el('div'); rbRow.appendChild(renewBtn);
    cdWrap.appendChild(rbRow);
    cdWrap.appendChild(renewWrap);
  }

  const fCcOpen = dayField('Statement opens (day)', 'Day of month the statement period begins (optional; static cycle only).', a.statementStartDay);
  const fCcClose = dayField('Statement closes (day)', 'Day of month the statement closes/cuts. Used with the due day to estimate float.', a.statementCloseDay);
  const fCcDue = dayField('Payment due (day)', 'Day of month the payment is due. Use “Last day” for cards that cut on the last day, since not every month has 31 days. Clover uses this to estimate the float — days until a purchase made today would be due.', a.dueDay);
  const ccWrap = el('div', 'cd-fields');
  ccWrap.appendChild(fCcOpen); ccWrap.appendChild(fCcClose); ccWrap.appendChild(fCcDue);

  // Current APY for interest-bearing accounts — shown for every type except a
  // CD (which has its own APY field above) and a Credit Card (no yield).
  const fAcctApy = input(a.apy != null ? a.apy : '', { type: 'number', placeholder: 'e.g. 3.75' }); fAcctApy.step = '0.01'; fAcctApy.min = 0;
  const fApyDate = input(a.apyAsOf || '', { type: 'date' });
  const apyWrap = el('div', 'cd-fields');
  apyWrap.appendChild(field('Current APY %', fAcctApy, 'The annual percentage yield this account currently earns — for savings, checking, money-market, sweep, brokerage cash, and similar accounts.'));
  apyWrap.appendChild(field('APY as of', fApyDate, 'The date this APY was accurate — shown under the rate in the APY column. Defaults to today when you set a rate.'));
  // Balance snapshot for any non-CD account (a CD's balance is its Principal $).
  // Stamped with an as-of date so a stale number can't masquerade as current.
  const fBal = moneyInput(a.balance != null && a.balance !== '' ? a.balance : '', { placeholder: 'optional' });
  const fBalDate = input(a.balanceAsOf || '', { type: 'date' });
  const balWrap = el('div', 'cd-fields');
  balWrap.appendChild(field('Balance $', fBal, 'What’s in (or owed on) this account — e.g. 5200.00. Optional. Changing it stamps the as-of date, and each change lands in the History tab.'));
  balWrap.appendChild(field('Balance as of', fBalDate, 'The date this balance was accurate. Defaults to today whenever you change the balance.'));
  // Typing a rate or balance stamps its "as of" date to today right away (only
  // when the date is still blank) so the freshness is visible before you save.
  const autoAsOf = (v, d) => v.addEventListener('input', () => { if (v.value.trim() !== '' && !d.value) d.value = todayISO(); });
  autoAsOf(fApy, fCdApyDate); autoAsOf(fAcctApy, fApyDate); autoAsOf(fBal, fBalDate);

  const syncTypeFields = () => {
    cdWrap.style.display = fType.value === 'CD' ? '' : 'none';
    ccWrap.style.display = fType.value === 'Credit Card' ? '' : 'none';
    apyWrap.style.display = (fType.value === 'CD' || fType.value === 'Credit Card') ? 'none' : '';
    balWrap.style.display = fType.value === 'CD' ? 'none' : '';
  };
  fType.addEventListener('change', syncTypeFields);

  body.appendChild(field('Name', fName, 'A label for this account that makes sense to you — e.g. "Everyday Checking" or "Roth IRA".'));
  body.appendChild(field('Institution', fInst, 'The bank, broker, or card issuer. Pick from the list or type your own; manage the list in Settings.'));
  body.appendChild(field('Type', fType, 'What kind of account this is. Choosing CD or Credit Card reveals extra fields.'));
  body.appendChild(field('Last 4', fLast4, 'The last four digits of the account or card number, to tell similar accounts apart.'));
  body.appendChild(field('Owner', fOwner, 'Who this account belongs to — you, joint, or another person you track.'));
  body.appendChild(field('Beneficiaries', fBenef, 'Who inherits this account (POD/TOD, retirement, life insurance, etc.). Listing them helps you spot accounts where beneficiaries aren’t set up. Private to you.'));
  const prevField = field('Continues account (rollover)', fPrev);
  prevField.appendChild(el('span', 'field-hint', 'If this replaced an older account — e.g. a CD that matured and got a new number — link it here to keep the history together.'));
  body.appendChild(prevField);
  body.appendChild(cdWrap);
  body.appendChild(ccWrap);
  body.appendChild(apyWrap);
  body.appendChild(balWrap);
  const flags = el('div', 'check-row'); [cActive, cIncome, cExpense, cAuto, cRewards].forEach(c => flags.appendChild(c));
  body.appendChild(field('Flags', flags));
  body.appendChild(field('Notes', fNotes));
  syncTypeFields();

  // Close / reopen an existing account, right from its Edit form.
  if (existing && existing.id) {
    const adminNode = el('div', 'acct-admin');
    if (a.closed) {
      adminNode.appendChild(el('span', 'muted', 'Closed ' + (a.closedDate ? fmtDate(a.closedDate) : '') + '. '));
      const reopen = el('button', 'btn-ghost', '↻ Reopen account');
      reopen.addEventListener('click', () => { store.saveAccount(Object.assign({}, existing, { closed: false, active: true, closedDate: '' })); closeModal(); toast('Account reopened'); renderView(currentRoute); });
      adminNode.appendChild(reopen);
    } else {
      const closeBtn = el('button', 'btn-ghost danger', '⊘ Close account…');
      closeBtn.title = 'Mark this account closed and see what’s tied to it';
      closeBtn.addEventListener('click', () => { closeModal(); closeAccountModal(existing); });
      adminNode.appendChild(closeBtn);
    }
    body.appendChild(field('Account status', adminNode, 'Closing keeps the account in your history and on the Closed tab, but hides it from pickers.'));
  }

  openModal({
    title: existing ? 'Edit account' : 'Add account',
    body: withHistoryTab(body, existing, (existing && existing.id && existing.type === 'CD' && ((existing.cdRenewals || []).length || (existing.cdFundedBy || []).length))
      ? { label: 'Renewals (' + (existing.cdRenewals || []).length + ')', panel: cdRenewalsPanel(existing) } : null),
    confirmLabel: 'Save',
    onConfirm: () => {
      const name = fName.value.trim();
      if (!name) { fName.focus(); toast('Name is required', 'warn'); return false; }
      const prevId = fPrev.value || '';
      if (prevId) {
        const prev = store.account(prevId);
        if (prev && a.id && prev.previousAccountId === a.id) { toast('That would link the two accounts in a loop', 'warn'); return false; }
      }
      // A single "as of" date backs whichever APY field applies to this type;
      // default it to today when a rate is set but no date was given.
      const t = fType.value;
      const apyValSet = t === 'CD' ? fApy.value.trim() !== '' : (t !== 'Credit Card' && fAcctApy.value !== '');
      const apyDateRaw = t === 'CD' ? fCdApyDate.value : (t === 'Credit Card' ? (a.apyAsOf || '') : fApyDate.value);
      const apyAsOf = apyValSet ? (apyDateRaw || todayISO()) : (apyDateRaw || '');
      const acc = Object.assign(a, {
        name, institution: fInst.value.trim(), type: fType.value,
        last4: fLast4.value.replace(/\D/g, '').slice(0, 4), personId: fOwner.value,
        beneficiaries: fBenef.__value(),
        active: cActive.__input.checked, usedForIncome: cIncome.__input.checked,
        usedForExpenses: cExpense.__input.checked, usedForAutopay: cAuto.__input.checked,
        rewardsCard: cRewards.__input.checked, notes: fNotes.value.trim(),
        cdTerm: fTerm.value.trim(),
        cdTermEst: fTerm.value.trim() ? (store.parseTermMonths(fTerm.value) === store.parseTermMonths(a.cdTerm) ? !!a.cdTermEst : false) : false,
        cdApy: fApy.value.trim(), cdMaturity: fMat.value,
        cdStart: fStart.value || '', cdStartEst: fStart.value ? (fStart.value === (a.cdStart || '') ? !!a.cdStartEst : false) : false,
        cdPrincipal: fPrincipal.value === '' ? '' : parseFloat(fPrincipal.value),
        cdPrincipalAsOf: fPrincipal.value === '' ? ''
          : (String(parseFloat(fPrincipal.value)) !== String(a.cdPrincipal != null ? a.cdPrincipal : '') || !a.cdPrincipalAsOf) ? todayISO() : a.cdPrincipalAsOf,
        balance: fBal.value === '' ? '' : parseFloat(fBal.value),
        balanceAsOf: fBal.value === '' ? ''
          : (fBalDate.value && fBalDate.value !== (a.balanceAsOf || '')) ? fBalDate.value
          : (String(parseFloat(fBal.value)) !== String(a.balance != null ? a.balance : '') || !a.balanceAsOf) ? todayISO() : a.balanceAsOf,
        apy: fAcctApy.value === '' ? null : parseFloat(fAcctApy.value), apyAsOf,
        statementStartDay: fCcOpen.__value(), statementCloseDay: fCcClose.__value(), dueDay: fCcDue.__value(),
        previousAccountId: prevId
      });
      // Fill whichever CD blank the other two values determine, right at save
      // (the load-time migration would catch it next session anyway) — flagged
      // as calculated so the ≈ marker shows.
      if (fType.value === 'CD') {
        if (!acc.cdStart && acc.cdMaturity) {
          const mo = store.parseTermMonths(acc.cdTerm);
          if (mo) { acc.cdStart = store.subMonthsClamped(acc.cdMaturity, mo); acc.cdStartEst = true; }
        }
        if (!acc.cdTerm && acc.cdStart && acc.cdMaturity) {
          const mo = store.monthsBetween(acc.cdStart, acc.cdMaturity);
          if (mo) { acc.cdTerm = mo + ' months'; acc.cdTermEst = true; }
        }
      }
      // Renewal: archive the term that just ended — the STORED values, not the
      // form's (the form may hold unsaved edits) — then swap in the new term.
      const didRenew = renewOpen && fType.value === 'CD';
      if (didRenew) {
        if (!rMat.value) { rMat.focus(); toast('Enter the new maturity date', 'warn'); return false; }
        if (rApy.value.trim() === '') { rApy.focus(); toast('Enter the new APY', 'warn'); return false; }
        acc.cdRenewals = (existing.cdRenewals || []).concat([{
          at: todayISO(), apy: existing.cdApy || '', maturity: existing.cdMaturity || '',
          term: existing.cdTerm || '', last4: existing.last4 || '',
          start: existing.cdStart || '', principal: existing.cdPrincipal != null ? existing.cdPrincipal : ''
        }]);
        // Start comes from the field (pre-filled with the old maturity but the
        // user can change it — early renewal, or a term that starts days later).
        acc.cdStart = rStart.value || existing.cdMaturity || '';
        acc.cdStartEst = false;
        if (rPrincipal.value !== '') { acc.cdPrincipal = parseFloat(rPrincipal.value); acc.cdPrincipalAsOf = todayISO(); }
        const consolPicked = consolChecks.filter(x => x.cb.__input.checked);
        if (consolPicked.length) acc.cdFundedBy = (existing.cdFundedBy || []).concat([{
          at: todayISO(), sources: consolPicked.map(x => ({ id: x.o.id, name: x.o.name, last4: x.o.last4 || '', principal: x.o.cdPrincipal != null ? x.o.cdPrincipal : '' }))
        }]);
        acc.cdApy = rApy.value.trim();
        acc.cdMaturity = rMat.value;
        if (rTerm.value.trim()) acc.cdTerm = rTerm.value.trim();
        const nl4 = rLast4.value.replace(/\D/g, '').slice(0, 4);
        if (nl4) acc.last4 = nl4;
        acc.apyAsOf = todayISO();
      }
      store.saveAccount(acc);
      // Consolidated sources close today and point at the CD they merged into;
      // the target's History logs the merge with each source's name and number.
      if (didRenew) {
        const picked = consolChecks.filter(x => x.cb.__input.checked);
        picked.forEach(x => {
          store.saveAccount(Object.assign({}, store.account(x.o.id) || x.o, { closed: true, closedDate: todayISO(), active: false, consolidatedIntoId: acc.id }));
        });
        if (picked.length) store.logAccountEvent(acc.id, 'consolidatedIn', picked.map(x => x.o.name + (x.o.last4 ? ' ••' + x.o.last4 : '') + (x.o.cdPrincipal != null && x.o.cdPrincipal !== '' ? ' (' + money(Number(x.o.cdPrincipal)) + ')' : '')).join(', '));
      }
      // A rolled-over account's old number is closed — mark the predecessor inactive.
      if (prevId) {
        const prev = store.account(prevId);
        if (prev && prev.active !== false) { prev.active = false; store.saveAccount(prev); toast('Marked “' + prev.name + '” as rolled over'); }
        else toast(existing ? 'Account updated' : 'Account added');
      } else {
        toast(didRenew ? 'CD renewed — previous term saved to Renewals' : existing ? 'Account updated' : 'Account added');
      }
    }
  });
}

// ============================================================
// Income view (Annual Grid + List) — Phase 2
// ============================================================
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function money(n) { n = Number(n) || 0; if (!n) return '–'; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function monthIdx(iso) { if (!iso) return -1; const m = /^(\d{4})-(\d{2})/.exec(iso); return m ? (+m[2] - 1) : -1; }
function amountOf(e) { return Number(e.gross) || 0; }
function countable(e) { return e.status !== 'pending'; }   // pending income excluded from totals
function avgOf(monthly) { const nz = monthly.filter(v => v > 0).length; const sum = monthly.reduce((a, b) => a + b, 0); return nz ? sum / nz : 0; }
function numCell(v, strong) { const td = el('td', 'num' + (v ? '' : ' zero') + (strong ? ' strong' : '')); td.textContent = money(v); return td; }
function todayISO() { const d = new Date(); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function fmtDate(iso) { if (!iso) return '—'; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); if (!m) return iso; return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function labelWrap(label, node) { const w = el('label', 'inline-field'); w.appendChild(el('span', null, label)); w.appendChild(node); return w; }
// Draw the eye to a decision dropdown that still sits on its empty default —
// amber glow until a real choice is made (used on import-flow selects that are
// easy to scroll past but change where data lands).
function attnWhenEmpty(sel) {
  const sync = () => sel.classList.toggle('attn-empty', !sel.value);
  sel.addEventListener('change', sync);
  sync();
  return sel;
}
// Account <option>s for modals — always alphabetical, however accounts were added.
// Account dropdown grouped by type: an <optgroup> per account type (in the
// ACCOUNT_TYPES order), alphabetical within each group.
function accountSelect(s, value, noneLabel) {
  const sel = document.createElement('select');
  const o0 = el('option'); o0.value = ''; o0.textContent = noneLabel || '—'; sel.appendChild(o0);
  const groups = new Map();
  s.accounts.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .forEach(a => { const t = a.type || 'Other'; if (!groups.has(t)) groups.set(t, []); groups.get(t).push(a); });
  const typeOrder = (window.cloverStore.ACCOUNT_TYPES || []).filter(t => groups.has(t))
    .concat([...groups.keys()].filter(t => !(window.cloverStore.ACCOUNT_TYPES || []).includes(t)));
  typeOrder.forEach(t => {
    const og = document.createElement('optgroup'); og.label = t;
    groups.get(t).forEach(a => {
      const op = el('option'); op.value = a.id; op.textContent = a.name + (a.last4 ? ' ••' + a.last4 : '');
      if (a.id === value) op.selected = true;
      og.appendChild(op);
    });
    sel.appendChild(og);
  });
  return sel;
}

function renderIncome(view) {
  const store = window.cloverStore;
  if (!store.isYearLoaded(activeYear)) { view.appendChild(loadingPanel()); store.loadYear(activeYear); return; }
  const data = store.yearData(activeYear);

  const head = el('div', 'view-head');
  const left = el('div');
  left.appendChild(el('h3', null, 'Income · ' + activeYear));
  const pcGross = data.paychecks.filter(isPaycheckPaid).reduce((s, p) => s + (Number(p.gross) || 0), 0);
  const useNet = incomeTab === 'grid' && incomeAmountMode === 'net';
  const received = useNet
    ? data.income.filter(countable).reduce((s, e) => s + netAmountOf(e), 0) + data.paychecks.filter(isPaycheckPaid).reduce((s, p) => s + paycheckNet(p), 0) + salesTotal(data)
    : data.income.filter(countable).reduce((s, e) => s + amountOf(e), 0) + pcGross + salesTotal(data);
  const n = data.income.length;
  left.appendChild(el('p', 'muted', money(received) + (useNet ? ' net' : '') + ' received · ' + n + ' entr' + (n === 1 ? 'y' : 'ies') + (pcGross ? ' + paychecks' : '')));
  head.appendChild(left);

  const right = el('div', 'head-actions');
  const tabs = el('div', 'tabs');
  [['grid', 'Annual grid'], ['list', 'List']].forEach(([t, label]) => {
    const b = el('button', 'tab' + (incomeTab === t ? ' active' : ''), label);
    b.addEventListener('click', () => { incomeTab = t; renderView(currentRoute); });
    tabs.appendChild(b);
  });
  right.appendChild(tabs);
  if (incomeTab === 'grid') {
    // Gross vs take-home view of the grid. Only paycheck-backed categories (Wages,
    // Acting) actually change — dividends/interest/rewards/sales are already net.
    const modeTabs = el('div', 'tabs');
    [['gross', 'Gross'], ['net', 'Net']].forEach(([m0, label]) => {
      const b = el('button', 'tab' + (incomeAmountMode === m0 ? ' active' : ''), label);
      b.title = m0 === 'net' ? 'Show take-home amounts — paychecks use their recorded net (falling back to gross when net wasn’t recorded)' : 'Show gross amounts (before taxes/withholding)';
      b.addEventListener('click', () => { incomeAmountMode = m0; renderView(currentRoute); });
      modeTabs.appendChild(b);
    });
    right.appendChild(modeTabs);
  }
  right.appendChild(importButton('income'));
  const divBtn = el('button', 'btn-ghost', '⬆ Import dividends');
  divBtn.title = 'Import dividends from a broker activity export (M1 Finance, Schwab)';
  divBtn.addEventListener('click', () => startImport('dividends'));
  right.appendChild(divBtn);
  const add = el('button', 'btn-primary', '+ Add income'); add.addEventListener('click', () => incomeModal(null));
  right.appendChild(add);
  head.appendChild(right);
  view.appendChild(head);

  const yt = yearTabs(store, 'income'); if (yt) view.appendChild(yt);
  view.appendChild(incomeTab === 'grid' ? incomeGrid(data) : incomeList(data));
}

// Small ×N bubble showing how many paychecks landed in a month (amber at 3+,
// so extra-paycheck months jump out).
function pcCountBubble(n, hot) {
  const b = el('span', 'pc-count' + (hot ? ' hot' : ''), '×' + n);
  b.title = n + ' paycheck' + (n === 1 ? '' : 's') + (hot ? ' — an extra-paycheck month' : '');
  return b;
}
function incomeGrid(data) {
  const store = window.cloverStore, groups = store.state.incomeCategories;
  const useNet = incomeAmountMode === 'net';
  const gAmt = e => useNet ? netAmountOf(e) : amountOf(e);
  const entries = data.income.filter(countable);
  const card = el('div', 'card table-card');
  const table = el('table', 'data-table grid-table');
  table.innerHTML = '<thead><tr><th>Category</th>' + MONTHS.map(m => '<th class="num">' + m + '</th>').join('') + '<th class="num">YTD</th><th class="num" title="Average per month, across the months that have amounts">Avg / mo</th></tr></thead>';
  const tb = el('tbody');
  const grand = new Array(12).fill(0);

  const monthsFor = list => { const m = new Array(12).fill(0); list.forEach(e => { const mi = monthIdx(e.date); if (mi >= 0) m[mi] += gAmt(e); }); return m; };
  const addRow = (cls, label, monthly, onClick, caret, counts) => {
    const tr = el('tr', cls);
    const c0 = el('td', cls.includes('sub-row') ? 'sub-name' : 'grp-name');
    if (caret != null) { c0.appendChild(el('span', 'caret', caret)); c0.appendChild(document.createTextNode(' ' + label)); }
    else c0.textContent = label;
    if (onClick) { c0.style.cursor = 'pointer'; c0.addEventListener('click', onClick); }
    tr.appendChild(c0);
    monthly.forEach((v, i) => { const td = numCell(v); if (counts && counts[i] > 0) td.appendChild(pcCountBubble(counts[i], counts[i] >= 3)); tr.appendChild(td); });
    const ytdTd = numCell(monthly.reduce((a, b) => a + b, 0), true);
    if (counts) { const tot = counts.reduce((a, b) => a + b, 0); if (tot > 0) ytdTd.appendChild(pcCountBubble(tot, false)); }
    tr.appendChild(ytdTd);
    tr.appendChild(numCell(avgOf(monthly), true));
    return tr;
  };

  groups.forEach(g => {
    const gEntries = entries.filter(e => e.categoryId === g.id);
    const monthly = monthsFor(gEntries);
    // Paychecks are the source of truth for wages — roll their gross into the
    // mapped income category (so wages aren't entered twice).
    const pcMonthly = paycheckMonthsFor(data.paychecks, g.id, useNet);
    const hasPc = pcMonthly.some(v => v > 0);
    for (let i = 0; i < 12; i++) monthly[i] += pcMonthly[i];
    // Sales are the source of truth for the Selling category (like paychecks->Wages).
    const slMonthly = /selling/i.test(g.name) ? salesMonthsArr(data) : null;
    const hasSl = !!(slMonthly && slMonthly.some(v => v > 0));
    if (slMonthly) for (let i = 0; i < 12; i++) monthly[i] += slMonthly[i];
    monthly.forEach((v, i) => grand[i] += v);
    const open = expandedIncomeGroups.has(g.id);
    tb.appendChild(addRow('grp-row', g.name, monthly,
      () => { open ? expandedIncomeGroups.delete(g.id) : expandedIncomeGroups.add(g.id); renderView(currentRoute); },
      open ? '▾' : '▸'));
    if (open) {
      const rewardCat = /reward/i.test(g.name), interestCat = /interest/i.test(g.name), dividendCat = /dividend/i.test(g.name), otherCat = /other/i.test(g.name);
      if (interestCat) {
        // Interest split by the linked account's TYPE: CDs, then Checking &
        // Savings (deposit accounts), then anything else. Each entry's accountId
        // decides its row, so existing entries land in the right place; interest
        // with no linked account falls under "Other".
        const CS = new Set(['Checking', 'Savings', 'Money Market', 'Cash / Sweep']);
        const bucketOf = e => { const a = store.account(e.accountId); return a && a.type === 'CD' ? 'CDs' : a && CS.has(a.type) ? 'Checking & Savings' : 'Other'; };
        const byB = new Map();
        gEntries.forEach(e => { const b = bucketOf(e); if (!byB.has(b)) byB.set(b, []); byB.get(b).push(e); });
        ['CDs', 'Checking & Savings', 'Other'].filter(b => byB.has(b)).forEach(b => {
          const bKey = g.id + '|' + b, bOpen = expandedInterestBuckets.has(bKey), bEntries = byB.get(b);
          tb.appendChild(addRow('sub-row', b, monthsFor(bEntries),
            () => { bOpen ? expandedInterestBuckets.delete(bKey) : expandedInterestBuckets.add(bKey); renderView(currentRoute); },
            bOpen ? '▾' : '▸'));
          if (bOpen) {
            // one row per account within the bucket (Ally CD ••1234, etc.); an
            // entry with no linked account groups by its note, else "(no account)".
            const byAcct = new Map();
            bEntries.forEach(e => { const a = store.account(e.accountId); const k = a ? (a.name + (a.last4 ? ' ••' + a.last4 : '')) : ((e.notes || '').trim() || '(no account)'); if (!byAcct.has(k)) byAcct.set(k, []); byAcct.get(k).push(e); });
            [...byAcct.keys()].sort((x, y) => x.localeCompare(y)).forEach(k => tb.appendChild(addRow('sub-row drill-row acct2-row', '↳ ' + k, monthsFor(byAcct.get(k)))));
          }
        });
      } else if (rewardCat || dividendCat || otherCat) {
        // Break the group down by reward source (Rewards), bank (Interest),
        // account→broker (Dividends: each M1 account and Schwab on its own
        // row), or what it was (Other: lawsuit/gift/rebate + description).
        const keyOf = rewardCat
          ? (e => (e.rewardSource || '').trim() || '(unspecified)')
          : dividendCat
          ? (e => store.accountName(e.accountId) || (e.receivedVia || '').trim() || '(no account)')
          : otherCat
          ? (e => (e.otherType || '').trim() || (e.description || '').trim() || '(unspecified)')
          : (e => store.accountName(e.accountId) || (e.notes || '').trim() || '(unspecified)');
        const byKey = new Map();
        gEntries.forEach(e => { const k = keyOf(e); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(e); });
        [...byKey.keys()].sort((a, b) => a.localeCompare(b)).forEach(k => tb.appendChild(addRow('sub-row drill-row', k, monthsFor(byKey.get(k)))));
      } else {
        g.subs.forEach(sub => tb.appendChild(addRow('sub-row', sub.name, monthsFor(gEntries.filter(e => e.subId === sub.id)))));
        const noSub = gEntries.filter(e => !e.subId || !g.subs.some(s => s.id === e.subId));
        if (noSub.length) tb.appendChild(addRow('sub-row', '(no subcategory)', monthsFor(noSub)));
      }
      if (hasSl) tb.appendChild(addRow('sub-row', '↳ Sales', slMonthly));
      if (hasPc) {
        // "Paychecks" itself expands into one row per employer, with each
        // employer's monthly gross — e.g. Wages → Paychecks → Main Job / gigs.
        const pcOpen = expandedPcEmployers.has(g.id);
        const catChecksAll = data.paychecks.filter(isPaycheckPaid).filter(p => (p.incomeCategoryId || '') === g.id);
        const pcCounts = new Array(12).fill(0);
        catChecksAll.forEach(p => { const mi = monthIdx(p.payDate); if (mi >= 0) pcCounts[mi]++; });
        tb.appendChild(addRow('sub-row', '↳ Paychecks', pcMonthly,
          () => { pcOpen ? expandedPcEmployers.delete(g.id) : expandedPcEmployers.add(g.id); renderView(currentRoute); },
          pcOpen ? '▾' : '▸', pcCounts));
        if (pcOpen) {
          const emps = [...new Set(catChecksAll.map(p => (p.employer || '').trim() || '(no employer)'))].sort((a, b) => a.localeCompare(b));
          emps.forEach(emp => {
            const m = new Array(12).fill(0), cnt = new Array(12).fill(0);
            catChecksAll.filter(p => ((p.employer || '').trim() || '(no employer)') === emp)
              .forEach(p => { const mi = monthIdx(p.payDate); if (mi >= 0) { m[mi] += useNet ? paycheckNet(p) : (Number(p.gross) || 0); cnt[mi]++; } });
            tb.appendChild(addRow('sub-row emp-row', emp, m, null, null, cnt));
          });
        }
      }
    }
  });

  const gtr = el('tr', 'total-row');
  gtr.appendChild(el('td', 'grp-name', 'Total income'));
  grand.forEach(v => gtr.appendChild(numCell(v)));
  gtr.appendChild(numCell(grand.reduce((a, b) => a + b, 0), true));
  gtr.appendChild(numCell(avgOf(grand), true));
  tb.appendChild(gtr);

  table.appendChild(tb); card.appendChild(table);
  return card;
}

// Income List: one unified table of income ENTRIES + PAYCHECKS (wages were
// invisible here before — they only rolled into the grid), with the standard
// column registry, 3-click sorting, and a per-user ⚙ Columns layout.
const INCOME_LIST_COL_LABELS = { date: 'Date', kind: 'Kind', category: 'Category', source: 'Source', account: 'Account', via: 'Received via', gross: 'Gross', net: 'Net', person: 'Person', status: 'Status', notes: 'Notes' };
const INCOME_LIST_ALL_COLS = ['date', 'kind', 'category', 'source', 'account', 'via', 'gross', 'net', 'person', 'status', 'notes'];
const INCOME_LIST_DEFAULT_COLS = ['date', 'kind', 'category', 'source', 'account', 'via', 'gross', 'net', 'person', 'status'];
let incomeListSort = { key: 'date', dir: 'desc' };
function buildIncomeListCol(store, key) {
  switch (key) {
    case 'date': return { label: 'Date', key: 'date', value: r => r.date || '', cell: r => el('td', null, fmtDate(r.date)) };
    case 'kind': return { label: 'Kind', key: 'kind', value: r => r.kind, cell: r => { const td = el('td'); td.appendChild(badge(r.kind === 'paycheck' ? 'Paycheck' : 'Income', r.kind === 'paycheck' ? 'green' : '')); return td; } };
    case 'category': return { label: 'Category', key: 'category', value: r => r.catName, cell: r => el('td', null, r.catName) };
    case 'source': return { label: 'Source', key: 'source', value: r => r.source || '', cell: r => {
        const td = el('td');
        td.appendChild(document.createTextNode(r.source || '—'));
        if (r.reinvested) { td.appendChild(document.createTextNode(' ')); td.appendChild(badge('↻ Reinvested', 'type')); }
        if (r.srcSub) td.appendChild(el('div', 'acct-sub', r.srcSub));
        return td; } };
    case 'account': return { label: 'Account', key: 'account', value: r => r.account || '', cell: r => el('td', null, r.account || '—') };
    case 'via': return { label: 'Received via', key: 'via', value: r => r.via || '', cell: r => el('td', 'muted', r.via || '—') };
    case 'gross': return { label: 'Gross', key: 'gross', num: true, value: r => r.gross, cell: r => numCell(r.gross, true) };
    case 'net': return { label: 'Net', key: 'net', num: true, value: r => r.net, cell: r => numCell(r.net) };
    case 'person': return { label: 'Person', key: 'person', value: r => r.person, cell: r => el('td', null, r.person) };
    case 'status': return { label: 'Status', key: 'status', value: r => r.status, cell: r => { const td = el('td'); const st = r.status || 'Received'; td.appendChild(badge(st, /pend|expect|late|missing/i.test(st) ? 'amber' : /bounce/i.test(st) ? 'red' : 'green')); return td; } };
    case 'notes': return { label: 'Notes', key: 'notes', value: r => r.notes || '', cell: r => { const td = el('td', 'muted'); td.textContent = r.notes || '—'; return td; } };
  }
  return null;
}
function incomeList(data) {
  const store = window.cloverStore;
  const rows = [];
  data.income.forEach(e => {
    const wh = [];
    if (e.fedWithheld) wh.push('Fed ' + money(e.fedWithheld));
    if (e.stateWithheld) wh.push('State ' + money(e.stateWithheld));
    const source = e.rewardSource || e.otherType || e.payer || e.symbol || store.subName('income', e.categoryId, e.subId) || e.distType || '';
    const srcSub = e.rewardType || e.description || (e.symbol && e.action ? e.action : '')
      || (e.payer && e.distType ? e.distType : '') || (wh.length ? wh.join(' · ') + ' withheld' : '');
    rows.push({
      kind: 'income', raw: e, date: e.date, catName: store.incomeGroupName(e.categoryId),
      source, srcSub, reinvested: !!e.reinvested,
      account: store.accountName(e.accountId) || '', via: e.receivedVia || '', gross: amountOf(e), net: Number(e.net) || 0,
      person: store.personName(e.personId), status: e.status === 'pending' ? 'Pending' : 'Received', notes: e.notes || '',
      categoryId: e.categoryId
    });
  });
  data.paychecks.forEach(pc => rows.push({
    kind: 'paycheck', raw: pc, date: pc.payDate, catName: store.incomeGroupName(pc.incomeCategoryId) || 'Wages',
    source: pc.employer || '', srcSub: (n => n ? 'Period #' + n : '')(paycheckPeriodNum(store, pc)), reinvested: false,
    account: '', via: pc.method || '', gross: Number(pc.gross) || 0, net: paycheckNet(pc),
    person: store.personName(pc.personId), status: pc.status || 'Received', notes: pc.notes || '',
    categoryId: pc.incomeCategoryId
  }));
  let shown = rows;
  if (activeMonth > 0) shown = shown.filter(r => monthIdx(r.date) === activeMonth - 1);
  if (incomeCatFilter !== 'all') shown = shown.filter(r => r.categoryId === incomeCatFilter);

  const wrap = el('div');
  const bar = el('div', 'filter-bar');
  const catSel = select([{ value: 'all', label: 'All categories' }].concat(store.state.incomeCategories.map(c => ({ value: c.id, label: c.name }))), incomeCatFilter);
  catSel.addEventListener('change', () => { incomeCatFilter = catSel.value; renderView(currentRoute); });
  bar.appendChild(labelWrap('Category', catSel));
  bar.appendChild(el('div', 'muted', shown.length + ' shown (incl. paychecks)' + (activeMonth > 0 ? ' · ' + MONTHS[activeMonth - 1] : '')));
  const colsBtn = columnsButton('incomeList', INCOME_LIST_ALL_COLS, INCOME_LIST_DEFAULT_COLS, INCOME_LIST_COL_LABELS, 'Income list columns');
  colsBtn.style.marginLeft = 'auto';
  bar.appendChild(colsBtn);
  wrap.appendChild(bar);

  if (!shown.length) {
    wrap.appendChild(emptyState('No income entries', 'Add income for ' + activeYear + (activeMonth > 0 ? ' / ' + MONTHS[activeMonth - 1] : '') + '.', '+ Add income', () => incomeModal(null)));
    return wrap;
  }

  const cols = [
    ...tableColKeys(store, 'incomeList', INCOME_LIST_COL_LABELS, INCOME_LIST_DEFAULT_COLS).map(k => buildIncomeListCol(store, k)).filter(Boolean),
    { label: '', sortable: false, cell: r => {
        const act = el('td', 'row-actions');
        const edit = el('button', 'icon-btn', 'Edit');
        edit.addEventListener('click', () => r.kind === 'paycheck' ? paycheckModal(r.raw) : incomeModal(r.raw));
        act.appendChild(edit);
        const del = el('button', 'icon-btn danger', 'Remove');
        del.addEventListener('click', () => confirmRemove(fmtDate(r.date) + ' · ' + r.catName, () => r.kind === 'paycheck' ? store.removePaycheck(yearOfPaycheck(r.raw), r.raw.id) : store.removeIncome(activeYear, r.raw.id)));
        act.appendChild(del);
        return act; } }
  ];
  const card = el('div', 'card table-card');
  card.appendChild(sortableTable(cols, shown, incomeListSort, ns => { incomeListSort = ns || { key: 'date', dir: 'desc' }; renderView(currentRoute); }, null));
  wrap.appendChild(card);
  return wrap;
}

function incomeModal(existing) {
  const store = window.cloverStore, s = store.state;
  const e = existing ? Object.assign({}, existing) : { status: 'received', taxable: 'unknown', date: todayISO() };
  const body = el('div', 'form-grid');

  // Entries auto-posted from a Class Action payout are kept in sync with that
  // payout — editing the amount/date here would be overwritten on the next sync.
  if (e.srcSettlement) {
    const note = el('div', 'form-hint-banner', '⚖ Linked to a Class Action payout. To change the amount or date, edit the payout on the Class Actions page — those fields re-sync from there. Other fields (taxable, notes) are safe to edit here.');
    note.style.gridColumn = '1 / -1';
    body.appendChild(note);
  }

  const via = el('datalist'); via.id = 'via-list';
  ['Direct Deposit', 'PayPal', 'Venmo', 'Check', 'Bank transfer', 'Cash', 'Statement credit', 'Reinvested'].forEach(v => { const o = el('option'); o.value = v; via.appendChild(o); });
  body.appendChild(via);

  const fDate = input(e.date || todayISO(), { type: 'date' });
  const fCat = select([{ value: '', label: '— Select —' }].concat(s.incomeCategories.map(c => ({ value: c.id, label: c.name }))), e.categoryId || '');
  const fSub = select([{ value: '', label: '—' }], e.subId || '');
  const rebuildSubs = () => {
    const g = s.incomeCategories.find(c => c.id === fCat.value);
    const opts = [{ value: '', label: '—' }].concat((g ? g.subs : []).map(x => ({ value: x.id, label: x.name })));
    fSub.innerHTML = ''; opts.forEach(o => { const op = el('option'); op.value = o.value; op.textContent = o.label; fSub.appendChild(op); });
    if (e.subId) fSub.value = e.subId;
  };
  const fAcct = accountSelect(s, e.accountId || '');
  const fPerson = select(s.persons.map(p => ({ value: p.id, label: p.name })), e.personId || (s.persons[0] && s.persons[0].id));
  const fGross = moneyInput(e.gross);
  const fNet = moneyInput(e.net, { placeholder: 'optional' });
  const fStatus = select([{ value: 'received', label: 'Received' }, { value: 'pending', label: 'Pending / expected' }], e.status || 'received');
  const fExpected = input(e.expectedDate || '', { type: 'date' });
  const fVia = input(e.receivedVia || '', { placeholder: 'e.g. Direct Deposit, PayPal', list: 'via-list' });
  const fTax = select([{ value: 'unknown', label: 'Unknown' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], e.taxable || 'unknown');
  const cReinv = checkbox('Reinvested', e.reinvested, 'Dividends/interest automatically reinvested rather than paid out as cash.');
  const cPaid = checkbox('Paid out', e.paidOut, 'You received this as cash, rather than reinvested or still accruing.');
  const fNotes = document.createElement('textarea'); fNotes.value = e.notes || ''; fNotes.rows = 2; fNotes.placeholder = 'Optional';

  const fSym = input(e.symbol || '', { placeholder: 'e.g. AAPL' });
  const fAction = input(e.action || '', { placeholder: 'e.g. Qualified Dividend' });
  const fQty = input(e.qty != null ? e.qty : '', { type: 'number', placeholder: 'shares' }); fQty.step = 'any';
  const fPrice = moneyInput(e.price, { placeholder: 'price' });
  const divWrap = el('div', 'div-fields');
  divWrap.appendChild(field('Symbol', fSym, 'The stock/fund ticker this dividend came from.'));
  divWrap.appendChild(field('Action', fAction, 'The dividend type as your broker labels it — e.g. Qualified Dividend, Cash Dividend, Reinvest.'));
  divWrap.appendChild(field('Qty', fQty, 'Shares involved, if reinvested.'));
  divWrap.appendChild(field('Price', fPrice, 'Share price at reinvestment, if applicable.'));

  // Reward-specific fields (shown when the category looks like Rewards).
  // Program is a real dropdown so your Settings → Reward programs list is
  // visible up front (a type-ahead suggestion box hid it too well).
  const rwPrograms = [...new Set(((s.catalog && s.catalog.rewardPrograms) || []).map(pr => pr.name).filter(Boolean))];
  const curRwSrc = e.rewardSource || '';
  const rwKnownSrc = !curRwSrc || rwPrograms.includes(curRwSrc);
  const fRwSel = select([{ value: '', label: '— Select program —' }]
    .concat(rwPrograms.map(n => ({ value: n, label: n })))
    .concat([{ value: '__other', label: 'Other / type manually…' }]), rwKnownSrc ? curRwSrc : '__other');
  const fRwOther = input(rwKnownSrc ? '' : curRwSrc, { placeholder: 'Program name' });
  const rwOtherWrap = el('div'); rwOtherWrap.style.marginTop = '6px';
  rwOtherWrap.appendChild(fRwOther);
  rwOtherWrap.style.display = rwKnownSrc ? 'none' : '';
  fRwSel.addEventListener('change', () => { rwOtherWrap.style.display = fRwSel.value === '__other' ? '' : 'none'; if (fRwSel.value === '__other') fRwOther.focus(); });
  const rwSrcNode = el('div'); rwSrcNode.appendChild(fRwSel); rwSrcNode.appendChild(rwOtherWrap);
  const REWARD_TYPES = ['Cash back', 'Statement credit', 'Deposit', 'Gift card', 'Points', 'Miles', 'Crypto', 'Referral bonus'];
  const curRwType = e.rewardType || '';
  const rwTypeKnown = !curRwType || REWARD_TYPES.includes(curRwType);
  const fRwTypeSel = select([{ value: '', label: '— Select type —' }]
    .concat(REWARD_TYPES.map(n => ({ value: n, label: n })))
    .concat([{ value: '__other', label: 'Other / type manually…' }]), rwTypeKnown ? curRwType : '__other');
  const fRwTypeOther = input(rwTypeKnown ? '' : curRwType, { placeholder: 'Type' });
  const rwTypeOtherWrap = el('div'); rwTypeOtherWrap.style.marginTop = '6px';
  rwTypeOtherWrap.appendChild(fRwTypeOther);
  rwTypeOtherWrap.style.display = rwTypeKnown ? 'none' : '';
  const rwTypeNode = el('div'); rwTypeNode.appendChild(fRwTypeSel); rwTypeNode.appendChild(rwTypeOtherWrap);
  const rwTypeVal = () => (fRwTypeSel.value === '__other' ? fRwTypeOther.value : fRwTypeSel.value).trim();
  const fOrderConf = input(e.orderConf || '', { placeholder: 'optional' });
  const rwWrap = el('div', 'div-fields');
  rwWrap.appendChild(field('Reward program', rwSrcNode, 'Which program or card the reward came from — the list is your Reward programs from Settings. Pick Other to type a one-off.'));
  rwWrap.appendChild(field('Reward type', rwTypeNode, 'What kind of reward it is. Pick Deposit for money paid into one of your accounts — a field appears to say which account it landed in.'));
  rwWrap.appendChild(field('Order confirmation #', fOrderConf, 'If the reward came with an order or confirmation number (gift-card redemptions often do), keep it here for reference.'));

  // Other-income fields (shown when the category looks like Other) — e.g. lawsuit
  // settlements, gifts, stimulus, rebates, winnings.
  const otTypeList = el('datalist'); otTypeList.id = 'ot-type-list';
  ['Class Action Settlement', 'Lawsuit', 'Settlement', 'Gift', 'Stimulus', 'Rebate', 'Winnings', 'Survey reward', 'Refund', 'Inheritance'].forEach(v => { const o = el('option'); o.value = v; otTypeList.appendChild(o); });
  body.appendChild(otTypeList);
  const fOtType = input(e.otherType || '', { placeholder: 'e.g. Lawsuit, Gift, Rebate', list: 'ot-type-list' });
  const fDesc = input(e.description || '', { placeholder: 'e.g. case name or what it was' });
  const otWrap = el('div', 'div-fields');
  otWrap.appendChild(field('Type', fOtType, 'What kind of “other” income this is — e.g. Lawsuit settlement, Gift, Stimulus, Rebate, Winnings.'));
  otWrap.appendChild(field('Description', fDesc, 'A short label or name — e.g. the class-action case name, or what the gift/rebate was for.'));

  // Retirement / IRA distribution fields (shown when the category looks like a
  // retirement or IRA/pension distribution) — e.g. an inherited IRA from an
  // estate, often with federal/state tax withheld at the source.
  const isRetMode = () => { const g = s.incomeCategories.find(c => c.id === fCat.value); return !!(g && /\bira\b|retire|pension|401\(?k\)?|403\(?b\)?|annuity|distribution/i.test(g.name)); };
  const retTypeList = el('datalist'); retTypeList.id = 'ret-type-list';
  ['Inherited IRA (Estate)', 'Traditional IRA', 'Roth IRA', 'SEP IRA', 'SIMPLE IRA', 'Rollover IRA', '401(k)', '403(b)', 'Pension', 'Annuity', 'Required Minimum Distribution (RMD)', 'Lump-sum distribution'].forEach(v => { const o = el('option'); o.value = v; retTypeList.appendChild(o); });
  body.appendChild(retTypeList);
  const fRetType = input(e.distType || '', { placeholder: 'e.g. Inherited IRA (Estate)', list: 'ret-type-list' });
  const fPayer = input(e.payer || '', { placeholder: 'e.g. estate or plan custodian' });
  const fFromAcct = accountSelect(s, e.fromAccountId || '', '— Select account —');
  const fFedWh = moneyInput(e.fedWithheld); fFedWh.min = 0;
  const fStateWh = moneyInput(e.stateWithheld); fStateWh.min = 0;
  const retWrap = el('div', 'div-fields');
  retWrap.appendChild(field('Distribution type', fRetType, 'What kind of retirement distribution this is — e.g. an inherited IRA from an estate, a Traditional/Roth IRA, a 401(k), pension, or a required minimum distribution.'));
  retWrap.appendChild(field('Payer / plan', fPayer, 'Who paid the distribution — the estate, or the IRA/plan custodian (e.g. the brokerage). Free text.'));
  retWrap.appendChild(field('Distributed from', fFromAcct, 'Which account the distribution came OUT of — e.g. the estate’s inherited IRA. Pair it with the Account field above (where the money landed).'));
  const whRow = el('div', 'two-col');
  whRow.appendChild(field('Federal tax withheld', fFedWh, 'Amount withheld for FEDERAL income tax at the source. Subtracted from the gross to give your net.'));
  whRow.appendChild(field('State tax withheld', fStateWh, 'Amount withheld for STATE income tax at the source, if any. Also subtracted from the gross.'));
  retWrap.appendChild(whRow);
  const retNum = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const computeRetNet = () => { const g = parseFloat(fGross.value); if (isNaN(g)) { fNet.value = ''; return; } fNet.value = Math.round((g - retNum(fFedWh.value) - retNum(fStateWh.value)) * 100) / 100; };

  const syncCat = () => {
    const g = s.incomeCategories.find(c => c.id === fCat.value);
    const isRw = !!(g && /reward/i.test(g.name));
    const isRet = isRetMode();
    divWrap.style.display = (g && /dividend/i.test(g.name)) ? '' : 'none';
    rwWrap.style.display = isRw ? '' : 'none';
    otWrap.style.display = (g && /other/i.test(g.name)) ? '' : 'none';
    retWrap.style.display = isRet ? '' : 'none';
    // Rewards don't need the generic plumbing: Received via is replaced by the
    // reward type, and the reinvested/paid-out flags don't apply.
    viaField.style.display = isRw ? 'none' : '';
    flagsField.style.display = isRw ? 'none' : '';
    syncAcctLabel();
    // Rewards are take-home by definition: you enter the NET, and Gross is greyed
    // out and mirrors it (they're always equal for rewards).
    fGross.readOnly = isRw;
    fGross.classList.toggle('mirrored', isRw);
    if (isRw) { if (!fNet.value && fGross.value) fNet.value = fGross.value; fGross.value = fNet.value; }
    // IRA/retirement: Net is gross minus withholdings and is computed, not typed.
    fNet.readOnly = isRet;
    fNet.classList.toggle('mirrored', isRet);
    if (isRet) { computeRetNet(); if (fTax.value === 'unknown') fTax.value = 'yes'; }
  };
  fNet.addEventListener('input', () => { if (fGross.readOnly) fGross.value = fNet.value; });
  fGross.addEventListener('input', () => { if (isRetMode()) computeRetNet(); });
  [fFedWh, fStateWh].forEach(f => f.addEventListener('input', () => { if (isRetMode()) computeRetNet(); }));
  fCat.addEventListener('change', () => { rebuildSubs(); syncCat(); });

  body.appendChild(field('Date', fDate, 'When you received this money. For pending items, the date you expect it.'));
  body.appendChild(field('Category', fCat, 'The type of income — e.g. Wages, Dividends, Interest, Rewards. Manage the list in Settings.'));
  body.appendChild(field('Source (subcategory)', fSub, 'A more specific source within the category — e.g. a particular broker or bank. Add these under the category in Settings.'));
  const acctField = field('Account', fAcct, 'Which of your accounts the money went INTO — e.g. the bank or broker that received it. Optional, but lets you see income by account (like dividends per broker, or interest per bank).');
  body.appendChild(acctField);
  body.appendChild(field('Person', fPerson, 'Who this income belongs to — you, joint, or another person you track.'));
  const amtRow = el('div', 'two-col');
  amtRow.appendChild(field('Gross amount', fGross, 'The full amount before any taxes or withholding.'));
  amtRow.appendChild(field('Net (optional)', fNet, 'The amount actually received after taxes/withholding, if it differs from gross.'));
  body.appendChild(amtRow);
  const stRow = el('div', 'two-col');
  stRow.appendChild(field('Status', fStatus, 'Received = money is in hand and counts toward totals. Pending = expected but not yet received (tracked, but left out of grid totals).'));
  stRow.appendChild(field('Expected date', fExpected, 'For pending income, when you expect it to arrive.'));
  body.appendChild(stRow);
  const viaField = field('Received via', fVia, 'How the money arrived — e.g. Direct Deposit, PayPal, Venmo, check.');
  body.appendChild(viaField);
  const tRow = el('div', 'two-col');
  tRow.appendChild(field('Taxable', fTax, 'Whether this income is taxable, if you know. Use Unknown if unsure.'));
  const flagsWrap = el('div', 'check-row'); flagsWrap.appendChild(cReinv); flagsWrap.appendChild(cPaid);
  const flagsField = field('Flags', flagsWrap);
  tRow.appendChild(flagsField);
  body.appendChild(tRow);
  body.appendChild(divWrap);
  body.appendChild(rwWrap);
  body.appendChild(otWrap);
  body.appendChild(retWrap);
  body.appendChild(field('Notes', fNotes, 'Anything else worth remembering about this entry.'));
  // The Account field means "where the money landed". For rewards it only
  // matters when the reward was DEPOSITED (label → "Deposited to", hidden
  // otherwise); for an IRA/retirement distribution it's the deposit account,
  // paired with "Distributed from" above (label → "Deposited to").
  const acctLbl = acctField.querySelector('span').childNodes[0];
  const syncAcctLabel = () => {
    const g = s.incomeCategories.find(c => c.id === fCat.value);
    const isRw = !!(g && /reward/i.test(g.name));
    const isRet = isRetMode();
    const dep = /deposit/i.test(rwTypeVal());
    acctField.style.display = (isRw && !dep) ? 'none' : '';
    acctLbl.nodeValue = (isRet || (isRw && dep)) ? 'Deposited to' : 'Account';
  };
  fRwTypeSel.addEventListener('change', () => { rwTypeOtherWrap.style.display = fRwTypeSel.value === '__other' ? '' : 'none'; if (fRwTypeSel.value === '__other') fRwTypeOther.focus(); syncAcctLabel(); });
  fRwTypeOther.addEventListener('input', syncAcctLabel);
  rebuildSubs(); syncCat();

  // A prefill without an id (e.g. "+ Income" from a settlement) is still a NEW
  // entry — title/toast key off a real id, not merely a truthy arg.
  const incIsEdit = !!(existing && existing.id);
  openModal({
    title: incIsEdit ? 'Edit income' : 'Add income', body: withHistoryTab(body, existing), confirmLabel: 'Save',
    onConfirm: () => {
      if (!fCat.value) { toast('Pick a category', 'warn'); fCat.focus(); return false; }
      const gross = parseFloat(fGross.value);
      if (isNaN(gross)) { toast('Gross amount is required', 'warn'); fGross.focus(); return false; }
      // Rewards have no withholding — if net is left blank, it equals gross.
      const catName = (s.incomeCategories.find(c => c.id === fCat.value) || {}).name || '';
      const net = fNet.value !== '' ? parseFloat(fNet.value) : (/reward/i.test(catName) ? gross : null);
      const entry = Object.assign(e, {
        date: fDate.value || todayISO(), categoryId: fCat.value, subId: fSub.value || '',
        accountId: fAcct.value || '', personId: fPerson.value, gross,
        net, status: fStatus.value,
        expectedDate: fExpected.value || '', receivedVia: fVia.value.trim(), taxable: fTax.value,
        reinvested: cReinv.__input.checked, paidOut: cPaid.__input.checked, notes: fNotes.value.trim(),
        symbol: fSym.value.trim(), action: fAction.value.trim(),
        qty: fQty.value === '' ? null : parseFloat(fQty.value), price: fPrice.value === '' ? null : parseFloat(fPrice.value),
        rewardSource: (fRwSel.value === '__other' ? fRwOther.value : fRwSel.value).trim(), rewardType: rwTypeVal(), orderConf: fOrderConf.value.trim(),
        otherType: fOtType.value.trim(), description: fDesc.value.trim(),
        distType: fRetType.value.trim(), payer: fPayer.value.trim(), fromAccountId: fFromAcct.value || '',
        fedWithheld: fFedWh.value === '' ? null : parseFloat(fFedWh.value), stateWithheld: fStateWh.value === '' ? null : parseFloat(fStateWh.value)
      });
      store.saveIncome(activeYear, entry);
      toast(incIsEdit ? 'Income updated' : 'Income added');
    }
  });
}

// ============================================================
// Subscriptions & recurring bills — Phase 3
// ============================================================
const FREQUENCIES = [
  { key: 'weekly', label: 'Weekly', occ: 52 },
  { key: 'biweekly', label: 'Biweekly', occ: 26 },
  { key: 'monthly', label: 'Monthly', occ: 12 },
  { key: 'quarterly', label: 'Quarterly', occ: 4 },
  { key: 'semiannual', label: 'Semiannual', occ: 2 },
  { key: 'annual', label: 'Annual', occ: 1 },
  { key: 'everyNMonths', label: 'Every N months', occ: null },
  { key: 'everyNYears', label: 'Every N years', occ: null },
  // One-time bills: occ 0 keeps them out of monthly/annual recurring totals;
  // they hit the expense grid + calendar only on their due date.
  { key: 'once', label: 'One-time (not recurring)', occ: 0 }
];
const PRIORITIES = ['Essential', 'High', 'Medium', 'Low', 'Optional'];
const SUB_STATUSES = ['Active', 'Trial', 'Paused', 'Canceled', 'Inactive', 'Needs review'];

function occPerYear(item) {
  const f = FREQUENCIES.find(x => x.key === item.frequency);
  if (!f) return 12;
  if (f.occ != null) return f.occ;
  const n = Math.max(1, Number(item.interval) || 1);
  return item.frequency === 'everyNMonths' ? 12 / n : 1 / n;
}
function monthlyEquiv(item) { return (Number(item.amount) || 0) * occPerYear(item) / 12; }
function annualCost(item) { return (Number(item.amount) || 0) * occPerYear(item); }
function freqLabel(item) {
  if (item.frequency === 'once') return 'One-time';
  const f = FREQUENCIES.find(x => x.key === item.frequency);
  if (!f) return item.frequency || '—';
  if (f.occ != null) return f.label;
  const n = Number(item.interval) || 1;
  return item.frequency === 'everyNMonths' ? ('Every ' + n + ' mo') : ('Every ' + n + ' yr');
}
function isSubActive(item) { return item.status === 'Active' || item.status === 'Trial' || !item.status; }
function daysUntil(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]); const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}
// Months between renewals for month-based frequencies; 0 for day-based (weekly/biweekly).
function subStepMonths(sub) {
  const n = Math.max(1, Number(sub.interval) || 1);
  switch (sub.frequency) {
    case 'monthly': return 1;
    case 'quarterly': return 3;
    case 'semiannual': return 6;
    case 'annual': return 12;
    case 'everyNMonths': return n;
    case 'everyNYears': return 12 * n;
    default: return 0;
  }
}
// The stored renewalDate is an anchor (the day it recurs — e.g. the 8th). For an
// active recurring bill this rolls it forward by its frequency to the next date
// that's today or later, so it never sits blank/overdue or needs a manual reset.
// Inactive subs keep their stored date; the day-of-month is preserved (clamped).
function nextRenewalDate(sub) {
  const iso = sub && sub.renewalDate;
  if (!iso) return '';
  if (sub.frequency === 'once') return iso;   // a one-time bill's date never rolls
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); if (!m) return iso;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (d >= today || !isSubActive(sub)) return iso;
  const stepMonths = subStepMonths(sub);
  let guard = 0;
  if (!stepMonths) {
    const step = sub.frequency === 'biweekly' ? 14 : 7;
    while (d < today && guard++ < 800) d = addDays(d, step);
  } else {
    const day = +m[3]; let ty = +m[1], tm = +m[2] - 1;
    while (d < today && guard++ < 1200) {
      tm += stepMonths; ty += Math.floor(tm / 12); tm = ((tm % 12) + 12) % 12;
      d = new Date(ty, tm, Math.min(day, new Date(ty, tm + 1, 0).getDate()));
    }
  }
  const p = k => String(k).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
// Every day-of-month an active bill renews within the given month (for the calendar).
function renewalDaysInMonth(sub, year, month) {
  if (!isSubActive(sub) || !sub.renewalDate) return [];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(sub.renewalDate); if (!m) return [];
  if (sub.frequency === 'once') return (+m[1] === year && (+m[2] - 1) === month) ? [+m[3]] : [];
  const anchor = new Date(+m[1], +m[2] - 1, +m[3]);
  const monthEnd = new Date(year, month + 1, 0);
  if (monthEnd < anchor) return [];
  const stepMonths = subStepMonths(sub);
  if (!stepMonths) {
    const step = sub.frequency === 'biweekly' ? 14 : 7;
    const monthStart = new Date(year, month, 1);
    const days = []; let d = anchor, guard = 0;
    while (d < monthStart && guard++ < 4000) d = addDays(d, step);
    guard = 0;
    while (d <= monthEnd && guard++ < 10) { if (d >= anchor) days.push(d.getDate()); d = addDays(d, step); }
    return days;
  }
  const anchorIdx = anchor.getFullYear() * 12 + anchor.getMonth(), targetIdx = year * 12 + month;
  if (targetIdx < anchorIdx || (targetIdx - anchorIdx) % stepMonths !== 0) return [];
  return [Math.min(+m[3], monthEnd.getDate())];
}

// Amount-change trend from a bill's priceHistory: direction of the last change,
// how many increases, and when it last rose. Flat if fewer than 2 recorded amounts.
function priceTrend(sub) {
  const h = (Array.isArray(sub.priceHistory) ? sub.priceHistory : []).filter(x => x && x.amount != null).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (h.length < 2) return { dir: 'none', points: h.length, rises: 0, lastRise: null, from: null, to: h.length ? Number(h[0].amount) : null, first: h.length ? Number(h[0].amount) : null };
  const to = Number(h[h.length - 1].amount), from = Number(h[h.length - 2].amount);
  let rises = 0, lastRise = null;
  for (let i = 1; i < h.length; i++) if (Number(h[i].amount) > Number(h[i - 1].amount)) { rises++; lastRise = h[i].date; }
  return { dir: to > from ? 'up' : to < from ? 'down' : 'flat', from, to, rises, lastRise, points: h.length, first: Number(h[0].amount) };
}
function trendIcon(sub) {
  const t = priceTrend(sub);
  if (t.dir === 'none') return null;
  if (t.dir === 'up') { const s = el('span', 'trend up', '▲'); s.title = 'Went up ' + money(t.from) + ' → ' + money(t.to) + (t.lastRise ? ' on ' + fmtDate(t.lastRise) : ''); return s; }
  if (t.dir === 'down') { const s = el('span', 'trend down', '▼'); s.title = 'Went down ' + money(t.from) + ' → ' + money(t.to); return s; }
  const s = el('span', 'trend flat', '–'); s.title = 'No change at the last update'; return s;
}

// Budget placeholders show ~ before their amounts — estimated, not actual.
function estCell(td, r) {
  if (r.budgetEst && td.firstChild) { td.insertBefore(document.createTextNode('~'), td.firstChild); td.title = 'Budget estimate — a placeholder for an expected future cost'; }
  return td;
}
// The flag labels a bill carries (must mirror the Flags column cell).
function subFlags(r) {
  const out = [];
  if (!isSubActive(r)) out.push(r.status || 'Inactive');
  else if (r.status === 'Trial') out.push('Trial');
  if (r.autoPay) out.push('Auto-pay');
  if (r.priority && r.priority !== 'Medium') out.push(r.priority);
  if (r.budgetEst) out.push('Budget est.');
  if (r.notPaidYear === new Date().getFullYear()) out.push('Not due this year');
  return out;
}
// A tone badge (Essential red, Trial amber, …) that filters the subs table
// to its value on click — same toggle/chip behavior as the colored value tags.
function subsFilterBadge(colKey, text, tone) {
  const b = badge(text, tone);
  b.style.cursor = 'pointer';
  b.title = 'Click to show only “' + text + '”';
  b.addEventListener('click', ev => {
    ev.stopPropagation();
    const cur = subsBadgeFilter;
    subsBadgeFilter = (cur && cur.key === colKey && cur.value === text) ? null : { key: colKey, value: text };
    renderView(currentRoute);
  });
  return b;
}
const SUBS_COL_LABELS = { name: 'Name', category: 'Category', subcategory: 'Subcategory', vendor: 'Vendor', amount: 'Amount', frequency: 'Frequency', monthly: 'Monthly', annual: 'Annual', pct: '% net', renews: 'Renews', account: 'Account', backupAccount: 'Backup account', person: 'Person', priority: 'Priority', status: 'Status', links: 'Links', customerNo: 'Customer #', checkNo: 'Check #', apr: 'APR %', flags: 'Flags', notes: 'Notes' };
const SUBS_ALL_COLS = ['name', 'category', 'subcategory', 'vendor', 'amount', 'frequency', 'monthly', 'annual', 'pct', 'renews', 'account', 'backupAccount', 'person', 'priority', 'status', 'links', 'customerNo', 'checkNo', 'apr', 'flags', 'notes'];
const SUBS_DEFAULT_COLS = ['name', 'category', 'amount', 'frequency', 'monthly', 'annual', 'pct', 'renews', 'account', 'flags'];
function buildSubsCol(store, key, net) {
  switch (key) {
    case 'name': return { label: 'Name', key: 'name', value: r => r.name, cell: r => {
        const td = el('td'); const nm = el('div', 'acct-name'); nm.appendChild(document.createTextNode(r.name));
        const ti = trendIcon(r); if (ti) { nm.appendChild(document.createTextNode(' ')); nm.appendChild(ti); }
        td.appendChild(nm);
        if (r.vendor) {
          if (r.url) { const a = el('a', 'acct-sub', r.vendor); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; a.style.display = 'block'; td.appendChild(a); }
          else td.appendChild(el('div', 'acct-sub', r.vendor));
        }
        return td; } };
    case 'category': return { label: 'Category', key: 'category', value: r => store.expenseGroupName(r.categoryId), cell: r => { const td = el('td'); const n = store.expenseGroupName(r.categoryId); td.appendChild(valueBadge('subs', 'category', n === '—' ? '' : n)); return td; } };
    case 'amount': return { label: 'Amount', key: 'amount', num: true, value: r => Number(r.amount) || 0, cell: r => estCell(numCell(Number(r.amount) || 0), r) };
    case 'frequency': return { label: 'Frequency', key: 'freq', value: r => freqLabel(r), cell: r => { const td = el('td'); td.appendChild(valueBadge('subs', 'frequency', freqLabel(r))); return td; } };
    case 'monthly': return { label: 'Monthly', key: 'monthly', num: true, value: r => monthlyEquiv(r), cell: r => estCell(numCell(monthlyEquiv(r), true), r) };
    case 'annual': return { label: 'Annual', key: 'annual', num: true, value: r => annualCost(r), cell: r => estCell(numCell(annualCost(r)), r) };
    case 'pct': return { label: '% net', key: 'pct', num: true, value: r => net > 0 ? monthlyEquiv(r) / net * 100 : 0, cell: r => { const td = el('td', 'num'); td.textContent = net > 0 ? (monthlyEquiv(r) / net * 100).toFixed(2) + '%' : '—'; return td; } };
    case 'renews': return { label: 'Renews', key: 'renews', value: r => { const d = daysUntil(isSubActive(r) ? nextRenewalDate(r) : r.renewalDate); return d == null ? 999999 : d; }, cell: r => renewCell(r) };
    case 'account': return { label: 'Account', key: 'account', value: r => store.accountName(r.accountId), cell: r => { const td = el('td'); td.appendChild(valueBadge('subs', 'account', store.accountName(r.accountId) || '')); return td; } };
    case 'subcategory': return { label: 'Subcategory', key: 'subcategory', value: r => store.subName('expense', r.categoryId, r.subId) || '', cell: r => { const td = el('td'); const n = store.subName('expense', r.categoryId, r.subId); td.appendChild(valueBadge('subs', 'subcategory', n && n !== '—' ? n : '')); return td; } };
    case 'vendor': return { label: 'Vendor', key: 'vendor', value: r => r.vendor || '', cell: r => el('td', 'muted', r.vendor || '—') };
    case 'backupAccount': return { label: 'Backup account', key: 'backupAccount', value: r => store.accountName(r.backupAccountId) || '', cell: r => el('td', 'muted', store.accountName(r.backupAccountId) || '—') };
    case 'priority': return { label: 'Priority', key: 'priority', value: r => r.priority || '', cell: r => { const td = el('td'); if (!r.priority) { td.textContent = '—'; return td; } td.appendChild(subsFilterBadge('priority', r.priority, r.priority === 'Essential' ? 'red' : r.priority === 'High' ? 'amber' : r.priority === 'Low' ? 'green' : '')); return td; } };
    case 'status': return { label: 'Status', key: 'status', value: r => r.status || 'Active', cell: r => { const td = el('td'); const st = r.status || 'Active'; td.appendChild(subsFilterBadge('status', st, isSubActive(r) ? (st === 'Trial' ? 'amber' : 'green') : 'red')); return td; } };
    case 'links': return { label: 'Links', key: 'links', sortable: false, value: () => '', cell: r => { const td = el('td'); const mk = (url, txt) => { const a = el('a', null, txt); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.style.marginRight = '8px'; td.appendChild(a); }; if (r.url) mk(r.url, 'Site ↗'); if (r.payUrl) mk(r.payUrl, 'Pay ↗'); if (!r.url && !r.payUrl) td.textContent = '—'; return td; } };
    case 'customerNo': return { label: 'Customer #', key: 'customerNo', value: r => r.customerNo || '', cell: r => { const td = el('td'); if (!r.customerNo) { td.textContent = '—'; return td; } const full = String(r.customerNo); const masked = '•••• ' + full.slice(-4); const span = el('span', null, masked); span.title = 'Click to reveal'; span.style.cursor = 'pointer'; let shown = false; span.addEventListener('click', ev => { ev.stopPropagation(); shown = !shown; span.textContent = shown ? full : masked; span.title = shown ? 'Click to hide' : 'Click to reveal'; }); td.appendChild(span); return td; } };
    case 'checkNo': return { label: 'Check #', key: 'checkNo', value: r => r.checkNo || '', cell: r => el('td', 'muted', r.checkNo || '—') };
    case 'apr': return { label: 'APR %', key: 'apr', num: true, value: r => r.apr != null ? Number(r.apr) : -1, cell: r => el('td', 'num', (r.apr != null && r.apr !== '') ? (Number(r.apr).toFixed(2) + '%') : '—') };
    case 'person': return { label: 'Person', key: 'person', value: r => store.personName(r.personId), cell: r => el('td', null, store.personName(r.personId)) };
    case 'flags': return { label: 'Flags', sortable: false, cell: r => {
        const td = el('td'); const flags = el('div', 'flags');
        if (!isSubActive(r)) flags.appendChild(subsFilterBadge('flags', r.status || 'Inactive', 'red'));
        else if (r.status === 'Trial') flags.appendChild(subsFilterBadge('flags', 'Trial', 'amber'));
        if (r.autoPay) flags.appendChild(subsFilterBadge('flags', 'Auto-pay', 'amber'));
        if (r.priority && r.priority !== 'Medium') flags.appendChild(subsFilterBadge('flags', r.priority, r.priority === 'Essential' ? 'red' : r.priority === 'High' ? 'amber' : r.priority === 'Low' ? 'green' : ''));
        if (r.budgetEst) { const b = subsFilterBadge('flags', 'Budget est.', 'type'); b.title = 'A budget placeholder — an expected future cost counted in the totals, not an actual bill. ' + b.title; flags.appendChild(b); }
        if (r.notPaidYear === new Date().getFullYear()) { const b = subsFilterBadge('flags', 'Not due this year', 'amber'); b.title = 'Excluded from the totals until January — nothing is due this calendar year. ' + b.title; flags.appendChild(b); }
        td.appendChild(flags); return td; } };
    case 'notes': return { label: 'Notes', key: 'notes', value: r => r.notes || '', cell: r => { const td = el('td', 'muted'); td.textContent = r.notes || '—'; return td; } };
  }
  return null;
}

function renderSubscriptions(view) {
  destroyCharts();
  const store = window.cloverStore, s = store.state;
  const all = s.recurring;
  const active = all.filter(isSubActive);
  // Filters run FIRST so the stat cards reflect what's actually displayed.
  let rows = all.slice();
  if (subsStatusFilter === 'active') rows = rows.filter(isSubActive);
  if (subsCatFilter !== 'all') rows = rows.filter(r => r.categoryId === subsCatFilter);
  if (subsSearch.trim()) {
    const q = subsSearch.trim().toLowerCase();
    rows = rows.filter(r => [r.name, r.vendor, store.expenseGroupName(r.categoryId), store.subName('expense', r.categoryId, r.subId), store.accountName(r.accountId), r.notes, freqLabel(r), r.priority, r.status]
      .some(v => (v || '').toLowerCase().includes(q)));
  }
  let chipBar = null;
  if (subsBadgeFilter) {
    const f = subsBadgeFilter;
    const valOf = r => f.key === 'category' ? store.expenseGroupName(r.categoryId)
      : f.key === 'subcategory' ? (store.subName('expense', r.categoryId, r.subId) || '')
      : f.key === 'frequency' ? freqLabel(r)
      : f.key === 'account' ? (store.accountName(r.accountId) || '')
      : f.key === 'priority' ? (r.priority || '')
      : f.key === 'status' ? (r.status || 'Active') : '';
    rows = rows.filter(r => f.key === 'flags' ? subFlags(r).includes(f.value) : valOf(r) === f.value);
    chipBar = el('div', 'filter-bar');
    chipBar.appendChild(el('span', 'muted', 'Showing ' + rows.length + ' where ' + (f.key === 'flags' ? 'flagged' : f.key) + ' = “' + f.value + '”'));
    const clear = el('button', 'btn-ghost', '✕ Clear filter');
    clear.addEventListener('click', () => { subsBadgeFilter = null; renderView(currentRoute); });
    chipBar.appendChild(clear);
  }
  const narrowed = !!(subsBadgeFilter || subsCatFilter !== 'all' || subsSearch.trim());
  // Bills marked "not paid for this year" cost nothing THIS year — they stay
  // in the table but drop out of the normalized totals until next January.
  const curYearNow = new Date().getFullYear();
  const shownActive = rows.filter(isSubActive).filter(r => r.notPaidYear !== curYearNow);
  const totalMonthly = shownActive.reduce((sum, r) => sum + monthlyEquiv(r), 0);
  const totalAnnual = shownActive.reduce((sum, r) => sum + annualCost(r), 0);
  const autoNet = avgNetMonthlyIncome(store);   // null while a year doc loads
  const net = autoNet || 0;

  const head = el('div', 'view-head');
  const left = el('div');
  left.appendChild(el('h3', null, 'Bills & Subscriptions'));
  left.appendChild(el('p', 'muted', active.length + ' active · ' + all.length + ' total'));
  head.appendChild(left);
  const subActions = el('div', 'head-actions');
  subActions.appendChild(importButton('subscriptions'));
  const add = el('button', 'btn-primary', '+ Add subscription'); add.addEventListener('click', () => subscriptionModal(null));
  subActions.appendChild(add);
  head.appendChild(subActions);
  view.appendChild(head);

  const sum = el('div', 'sub-summary');
  const netCard = el('div', 'sum-card');
  netCard.appendChild(el('div', 'sum-label', 'Net monthly income'));
  netCard.appendChild(el('div', 'sum-value income', autoNet == null ? '…' : (net > 0 ? money(net) : '–')));
  netCard.appendChild(el('div', 'sum-hint', 'net pay ÷ 12 (annualized)'));
  sum.appendChild(netCard);
  const fHint = narrowed ? 'filtered view — active rows shown below' : undefined;
  const barOf = (pct, tone, title) => net > 0 ? { pct, tone, title } : null;
  sum.appendChild(sumCard('Total monthly', money(totalMonthly), 'expense', fHint,
    barOf(totalMonthly / net * 100, 'expense', net > 0 ? (totalMonthly / net * 100).toFixed(1) + '% of net monthly income' : '')));
  sum.appendChild(sumCard('Total annual', money(totalAnnual), 'expense', fHint,
    barOf(totalAnnual / (net * 12) * 100, 'expense', net > 0 ? (totalAnnual / (net * 12) * 100).toFixed(1) + '% of annual net income' : '')));
  if (net > 0) {
    const unalloc = net - totalMonthly;
    sum.appendChild(sumCard('Left after subs', money(unalloc), unalloc < 0 ? 'expense' : 'income', fHint,
      barOf(unalloc / net * 100, unalloc < 0 ? 'expense' : 'income', (unalloc / net * 100).toFixed(1) + '% of net income left over')));
    sum.appendChild(sumCard('% of net income', (totalMonthly / net * 100).toFixed(1) + '%', 'neutral', fHint,
      barOf(totalMonthly / net * 100, 'neutral', (totalMonthly / net * 100).toFixed(1) + '% of net income goes to bills')));
  }
  view.appendChild(sum);

  const bar = el('div', 'filter-bar');
  const statusSel = select([{ value: 'active', label: 'Active only' }, { value: 'all', label: 'All' }], subsStatusFilter);
  statusSel.addEventListener('change', () => { subsStatusFilter = statusSel.value; renderView(currentRoute); });
  bar.appendChild(labelWrap('Show', statusSel));
  const catSel = select([{ value: 'all', label: 'All categories' }].concat(s.expenseCategories.map(c => ({ value: c.id, label: c.name }))), subsCatFilter);
  catSel.addEventListener('change', () => { subsCatFilter = catSel.value; renderView(currentRoute); });
  bar.appendChild(labelWrap('Category', catSel));
  const searchIn = input(subsSearch, { placeholder: 'Search bills…' });
  searchIn.id = 'subs-search'; searchIn.type = 'search';
  searchIn.addEventListener('input', () => {
    subsSearch = searchIn.value;
    renderView(currentRoute);
    // renderView rebuilt the DOM — put the cursor back where the user was typing
    const n2 = document.getElementById('subs-search');
    if (n2) { n2.focus(); const L = n2.value.length; try { n2.setSelectionRange(L, L); } catch (e) {} }
  });
  bar.appendChild(labelWrap('Search', searchIn));
  // Active-filter chip rides the same row as the controls + ⚙ Columns.
  if (chipBar) { [...chipBar.childNodes].forEach(n => bar.appendChild(n)); }
  view.appendChild(bar);

  if (!rows.length) {
    view.appendChild(emptyState('No subscriptions yet',
      'Add your recurring bills and subscriptions to see monthly-equivalent cost, renewals, and what share of your income they take.',
      '+ Add subscription', () => subscriptionModal(null)));
    return;
  }

  const cols = [
    ...tableColKeys(store, 'subs', SUBS_COL_LABELS, SUBS_DEFAULT_COLS).map(k => buildSubsCol(store, k, net)).filter(Boolean),
    { label: '', sortable: false, cell: r => {
        const td = el('td', 'row-actions');
        const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => subscriptionModal(r));
        const conv = el('button', 'icon-btn', 'Convert'); conv.title = 'Make this a budget placeholder, or turn it into a one-off expense'; conv.addEventListener('click', () => convertModal('recurring', r));
        const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove(r.name, () => store.removeRecurring(r.id)));
        td.appendChild(edit); td.appendChild(conv); td.appendChild(del); return td; } }
  ];
  const subsColsBtn = columnsButton('subs', SUBS_ALL_COLS, SUBS_DEFAULT_COLS, SUBS_COL_LABELS, 'Bills & Subscriptions columns');
  subsColsBtn.style.marginLeft = 'auto';   // share the filter row instead of its own row
  bar.appendChild(subsColsBtn);
  const card = el('div', 'card table-card');
  card.appendChild(sortableTable(cols, rows, subsSort, ns => { subsSort = ns || { key: 'monthly', dir: 'desc' }; renderView(currentRoute); }, r => isSubActive(r) ? '' : 'inactive-row'));
  view.appendChild(card);

  // Price-history chart: pick a bill and see how its amount has changed over time.
  const withHist = all.filter(r => Array.isArray(r.priceHistory) && r.priceHistory.length >= 2);
  if (withHist.length) {
    const pcard = el('div', 'card');
    const phead = el('div', 'view-head');
    phead.appendChild(el('h3', 'strip-title', 'Price history'));
    if (!withHist.some(r => r.id === subPriceSel)) subPriceSel = withHist[0].id;
    const psel = select(withHist.map(r => ({ value: r.id, label: r.name })), subPriceSel);
    psel.addEventListener('change', () => { subPriceSel = psel.value; renderView(currentRoute); });
    phead.appendChild(psel);
    pcard.appendChild(phead);
    const sub = withHist.find(r => r.id === subPriceSel) || withHist[0];
    const h = sub.priceHistory.slice().filter(x => x && x.amount != null).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const t = priceTrend(sub);
    const summ = el('p', 'muted');
    summ.textContent = t.rises + ' increase' + (t.rises === 1 ? '' : 's') + (t.lastRise ? ' · last rose ' + fmtDate(t.lastRise) : '')
      + ' · now ' + money(t.to) + (t.first != null && t.first !== t.to ? ' (' + (t.to > t.first ? '+' : '') + money(t.to - t.first) + ' since ' + fmtDate(h[0].date) + ')' : '');
    pcard.appendChild(summ);
    const wrap = el('div', 'chart-wrap'); const cv = document.createElement('canvas'); wrap.appendChild(cv); pcard.appendChild(wrap);
    buildLineChart(cv, { labels: h.map(x => fmtDateShort(x.date)), datasets: [{ label: sub.name, data: h.map(x => Number(x.amount)), borderColor: CHART_PALETTE[0], backgroundColor: CHART_PALETTE[0], stepped: true, pointRadius: 4, tension: 0 }], yTitle: 'Amount ($)' });
    view.appendChild(pcard);
  }
}

// ============================================================
// Budget — the home for "budget placeholder" bills (expected/future costs).
// Lists every placeholder, rolls their estimated cost into stat cards, and
// each month asks you to confirm whether the estimate actually happened.
// ============================================================
function ymOf(year, mIdx) { return year + '-' + String(mIdx + 1).padStart(2, '0'); }
function budgetMonthSkipped(bill, ym) { return Array.isArray(bill.budgetSkips) && bill.budgetSkips.includes(ym); }

function renderBudget(view) {
  destroyCharts();
  const store = window.cloverStore, s = store.state;
  const year = activeYear;
  const data = store.yearData(year);
  const placeholders = s.recurring.filter(r => r.budgetEst);
  const active = placeholders.filter(isSubActive);
  const net = avgNetMonthlyIncome(store) || 0;

  const head = el('div', 'view-head');
  const left = el('div');
  left.appendChild(el('h3', null, 'Budget'));
  left.appendChild(el('p', 'muted', 'Expected & placeholder costs you’re budgeting for — ' + placeholders.length + ' placeholder' + (placeholders.length === 1 ? '' : 's') + (active.length !== placeholders.length ? ' · ' + active.length + ' active' : '')));
  head.appendChild(left);
  const acts = el('div', 'head-actions');
  const add = el('button', 'btn-primary', '+ Add budget placeholder');
  add.addEventListener('click', () => subscriptionModal({ budgetEst: true, frequency: 'monthly', status: 'Active', priority: 'Medium', personId: s.persons[0] && s.persons[0].id }));
  acts.appendChild(add);
  head.appendChild(acts);
  view.appendChild(head);

  if (!placeholders.length) {
    view.appendChild(emptyState('No budget placeholders yet',
      'A budget placeholder is an expected or future cost you want reflected in your budget before it’s a real bill — e.g. a utility you know will jump once you move in, or a subscription you’re about to start. It counts toward your monthly/annual totals and is tagged “Budget est.” everywhere. Mark any bill as a placeholder from its Edit form, or add one here.',
      '+ Add budget placeholder', () => subscriptionModal({ budgetEst: true, frequency: 'monthly', status: 'Active', priority: 'Medium', personId: s.persons[0] && s.persons[0].id })));
    return;
  }

  // --- reconciliation target month (within the active year) ---
  const now = new Date();
  const thisY = now.getFullYear(), thisM = now.getMonth();   // 0-based
  const maxM = year === thisY ? thisM : (year < thisY ? 11 : 0);
  let targetM = budgetReconMonth;
  if (targetM == null) targetM = year === thisY ? Math.max(0, thisM - 1) : (year < thisY ? 11 : 0);
  targetM = Math.min(Math.max(0, targetM), maxM);
  const targetYM = ymOf(year, targetM);
  const checkins = active.filter(b => b.notPaidYear !== year);   // placeholders expected this year
  const reconOf = (bill) => {
    const used = data.expensePayments.filter(p => p.recurringId === bill.id && monthIdx(p.date) === targetM);
    if (used.length) return { state: 'used', amount: used.reduce((a, p) => a + expenseAmount(p), 0), payments: used };
    if (budgetMonthSkipped(bill, targetYM)) return { state: 'skipped' };
    return { state: 'pending' };
  };
  const recons = checkins.map(b => ({ b, r: reconOf(b) }));
  const doneCount = recons.filter(x => x.r.state !== 'pending').length;

  // --- new-month reminder banner (a few days into a new month) ---
  if (year === thisY && thisM >= 1 && now.getDate() >= 3) {
    const pm = thisM - 1, pym = ymOf(thisY, pm);
    const pend = active.filter(b => b.notPaidYear !== thisY).filter(b => {
      const used = data.expensePayments.some(p => p.recurringId === b.id && monthIdx(p.date) === pm);
      return !used && !budgetMonthSkipped(b, pym);
    });
    if (pend.length) {
      const banner = el('div', 'card warn-strip budget-reminder');
      const row = el('div', 'warn-item');
      row.appendChild(badge('New month', 'amber'));
      row.appendChild(el('span', null, 'It’s ' + MONTHS[thisM] + ' — ' + pend.length + ' budget placeholder' + (pend.length === 1 ? ' still needs ' : 's still need ') + MONTHS[pm] + '’s actuals. Mark each as used (log the real amount) or not used below.'));
      if (targetM !== pm) {
        const go = el('button', 'btn-ghost', 'Review ' + MONTHS[pm]);
        go.addEventListener('click', () => { budgetReconMonth = pm; renderView(currentRoute); });
        row.appendChild(go);
      }
      banner.appendChild(row);
      view.appendChild(banner);
    }
  }

  // --- stat cards (bills-style, scoped to placeholders, + counts) ---
  const expected = checkins;   // active & expected this year
  const totalMonthly = expected.reduce((a, b) => a + monthlyEquiv(b), 0);
  const totalAnnual = expected.reduce((a, b) => a + annualCost(b), 0);
  const barOf = (pct, tone, title) => net > 0 ? { pct, tone, title } : null;
  const sum = el('div', 'sub-summary');
  const pcCard = el('div', 'sum-card');
  pcCard.appendChild(el('div', 'sum-label', 'Budget placeholders'));
  pcCard.appendChild(el('div', 'sum-value', String(placeholders.length)));
  pcCard.appendChild(el('div', 'sum-hint', active.length + ' active' + (expected.length !== active.length ? ' · ' + expected.length + ' expected this year' : '')));
  sum.appendChild(pcCard);
  const netCard = el('div', 'sum-card');
  netCard.appendChild(el('div', 'sum-label', 'Net monthly income'));
  netCard.appendChild(el('div', 'sum-value income', net > 0 ? money(net) : '–'));
  netCard.appendChild(el('div', 'sum-hint', 'net pay ÷ 12 (annualized)'));
  sum.appendChild(netCard);
  sum.appendChild(sumCard('Est. monthly', money(totalMonthly), 'expense', 'placeholders, monthly-equivalent',
    barOf(totalMonthly / net * 100, 'expense', net > 0 ? (totalMonthly / net * 100).toFixed(1) + '% of net monthly income' : '')));
  sum.appendChild(sumCard('Est. annual', money(totalAnnual), 'expense', 'placeholders × 12',
    barOf(totalAnnual / (net * 12) * 100, 'expense', net > 0 ? (totalAnnual / (net * 12) * 100).toFixed(1) + '% of annual net income' : '')));
  if (net > 0) sum.appendChild(sumCard('% of net income', (totalMonthly / net * 100).toFixed(1) + '%', 'neutral', 'share of income budgeted to placeholders',
    barOf(totalMonthly / net * 100, 'neutral', (totalMonthly / net * 100).toFixed(1) + '% of net income')));
  const rcCard = el('div', 'sum-card');
  rcCard.appendChild(el('div', 'sum-label', 'Reconciled · ' + MONTHS[targetM]));
  const allDone = checkins.length && doneCount === checkins.length;
  rcCard.appendChild(el('div', 'sum-value ' + (allDone ? 'income' : doneCount ? '' : 'expense'), doneCount + ' / ' + checkins.length));
  rcCard.appendChild(el('div', 'sum-hint', 'confirmed for ' + MONTHS[targetM] + ' ' + year));
  sum.appendChild(rcCard);
  view.appendChild(sum);

  // --- monthly check-in ---
  const chk = el('div', 'card');
  const chkHead = el('div', 'view-head');
  const chkLeft = el('div');
  chkLeft.appendChild(el('h3', 'strip-title', 'Monthly check-in'));
  chkLeft.appendChild(el('p', 'muted', 'Confirm whether each placeholder actually happened — log the real amount, or mark it not used.'));
  chkHead.appendChild(chkLeft);
  const monSel = select(MONTHS.slice(0, maxM + 1).map((m, i) => ({ value: String(i), label: m + ' ' + year })), String(targetM));
  monSel.addEventListener('change', () => { budgetReconMonth = parseInt(monSel.value, 10); renderView(currentRoute); });
  chkHead.appendChild(labelWrap('Month', monSel));
  chk.appendChild(chkHead);
  if (!checkins.length) {
    chk.appendChild(el('div', 'muted', 'No active placeholders expected this year to reconcile.'));
  } else {
    const list = el('div', 'mini-list');
    recons.forEach(({ b, r }) => {
      const row = el('div', 'mini-row');
      const lft = el('div');
      lft.appendChild(el('span', null, b.name));
      lft.appendChild(el('div', 'acct-sub', '~' + money(monthlyEquiv(b)) + ' est. · ' + store.expenseGroupName(b.categoryId)));
      row.appendChild(lft);
      const right = el('div', 'brow-actions');
      if (r.state === 'used') {
        right.appendChild(badge('Used ' + money(r.amount), 'green'));
        const viewBtn = el('button', 'icon-btn', 'View');
        viewBtn.addEventListener('click', () => expenseModal(r.payments[0]));
        right.appendChild(viewBtn);
      } else if (r.state === 'skipped') {
        right.appendChild(badge('Not used', ''));
        const undo = el('button', 'icon-btn', 'Undo');
        undo.addEventListener('click', () => { store.setBudgetSkip(b.id, targetYM, false); });
        right.appendChild(undo);
      } else {
        right.appendChild(badge('Pending', 'amber'));
        const logBtn = el('button', 'icon-btn', 'Log actual');
        logBtn.addEventListener('click', () => expenseModal({
          recurringId: b.id, categoryId: b.categoryId, subId: b.subId || '', personId: b.personId,
          amount: (b.amount != null && b.amount !== '') ? Number(b.amount) : '', title: b.name, vendor: b.vendor || '',
          date: (year === thisY && targetM === thisM) ? todayISO() : (targetYM + '-01')
        }));
        const skip = el('button', 'icon-btn', 'Not used');
        skip.title = 'This placeholder didn’t cost anything in ' + MONTHS[targetM] + ' — mark it reconciled without logging an expense.';
        skip.addEventListener('click', () => { store.setBudgetSkip(b.id, targetYM, true); });
        right.appendChild(logBtn); right.appendChild(skip);
      }
      row.appendChild(right);
      list.appendChild(row);
    });
    chk.appendChild(list);
  }
  view.appendChild(chk);

  // --- all placeholders (editable) ---
  const rows = placeholders.slice().sort((a, b) => monthlyEquiv(b) - monthlyEquiv(a));
  const card = el('div', 'card table-card');
  const table = el('table', 'data-table');
  table.innerHTML = '<thead><tr><th>Name</th><th>Category</th><th class="num">Amount</th><th class="num">Monthly</th><th class="num">Annual</th><th>Renewal / due</th><th>Status</th><th></th></tr></thead>';
  const tb = el('tbody');
  rows.forEach(b => {
    const tr = el('tr'); if (!isSubActive(b)) tr.className = 'inactive-row';
    const nameTd = el('td', null, b.name);
    if (b.vendor) nameTd.appendChild(el('div', 'acct-sub', b.vendor));
    tr.appendChild(nameTd);
    tr.appendChild(el('td', null, store.expenseGroupName(b.categoryId)));
    const amtTd = numCell(Number(b.amount) || 0); amtTd.appendChild(el('div', 'acct-sub', freqLabel(b))); tr.appendChild(amtTd);
    tr.appendChild(numCell(monthlyEquiv(b), true));
    tr.appendChild(numCell(annualCost(b)));
    tr.appendChild(el('td', 'muted', isSubActive(b) ? fmtDate(nextRenewalDate(b)) : (b.renewalDate ? fmtDate(b.renewalDate) : '—')));
    const stTd = el('td'); stTd.appendChild(badge(b.status || 'Active', isSubActive(b) ? 'green' : '')); tr.appendChild(stTd);
    const actTd = el('td', 'row-actions');
    const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => subscriptionModal(b));
    const conv = el('button', 'icon-btn', 'Convert'); conv.title = 'Turn this back into a regular bill or a one-off expense'; conv.addEventListener('click', () => convertModal('recurring', b));
    const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove(b.name, () => store.removeRecurring(b.id)));
    actTd.appendChild(edit); actTd.appendChild(conv); actTd.appendChild(del); tr.appendChild(actTd);
    tb.appendChild(tr);
  });
  table.appendChild(tb); card.appendChild(table); view.appendChild(card);
}

// ============================================================
// Class Action Settlements — a tracker for the claims you've submitted to,
// their status/progress, and payouts. Its top purpose: search to see whether
// you've already submitted to a given settlement. Nothing here touches Income
// unless you explicitly use the "+ Income" button.
// ============================================================
const SETTLE_STATUSES = ['Not submitted', 'Submitted', 'Approved', 'Paid', 'Denied', 'Excluded'];
const SETTLE_METHODS = ['PayPal', 'Venmo', 'Check', 'ACH / Direct Deposit', 'Zelle', 'Virtual Debit Card', 'Prepaid Card', 'Digital Mastercard', 'Gift Card'];
function firstLine(s) { s = (s || '').trim(); const i = s.indexOf('\n'); return i >= 0 ? s.slice(0, i) : s; }
function settleReceived(s) { return (s.payments || []).reduce((a, p) => a + (Number(p.amount) || 0), 0); }
function settleLastPayout(s) { const ds = (s.payments || []).map(p => p.date).filter(Boolean).sort(); return ds.length ? ds[ds.length - 1] : ''; }
function settleFirstPayout(s) { const ds = (s.payments || []).map(p => p.date).filter(Boolean).sort(); return ds.length ? ds[0] : ''; }
function settleIsSubmitted(s) { const st = s.status || 'Not submitted'; return st !== 'Not submitted'; }
function settleIsPaid(s) { return s.status === 'Paid' || settleReceived(s) > 0; }
function settleIsOpen(s) { return settleIsSubmitted(s) && !settleIsPaid(s) && s.status !== 'Denied' && s.status !== 'Excluded'; }
// Completed duration: days from filed to the FIRST payout (when it first paid out).
function settleTimeToPay(s) { const fp = settleFirstPayout(s); if (!s.dateFiled || !fp) return null; const d = daysBetweenISO(fp, s.dateFiled); return (d >= 0 && d < 1e9) ? d : null; }
// Ongoing duration: days since filed for a still-unpaid (but submitted) claim.
function settleCurrentDuration(s) { if (!s.dateFiled || settleIsPaid(s) || !settleIsSubmitted(s)) return null; const d = daysBetweenISO(todayISO(), s.dateFiled); return (d >= 0 && d < 1e9) ? d : null; }
function durDays(n) { return n == null ? '–' : (n + (n === 1 ? ' day' : ' days')); }
function settleStatusTone(st) {
  return st === 'Paid' ? 'green' : (st === 'Submitted' || st === 'Approved') ? 'amber' : (st === 'Denied' || st === 'Excluded') ? 'red' : '';
}
// Clickable value bubble that narrows the settlements table to that value
// (click again to clear) — mirrors the Bills & Subscriptions filter badges.
function settleFilterBadge(key, text, tone) {
  const b = badge(text, tone);
  b.style.cursor = 'pointer';
  b.title = 'Click to show only “' + text + '”';
  b.addEventListener('click', ev => {
    ev.stopPropagation();
    const cur = settleBadgeFilter;
    settleBadgeFilter = (cur && cur.key === key && cur.value === text) ? null : { key, value: text };
    renderView(currentRoute);
  });
  return b;
}
const SETTLE_COL_LABELS = { name: 'Settlement', status: 'Status', dateFiled: 'Filed', deadline: 'Deadline', claimNumber: 'Claim / confirmation #', claimId: 'Claim ID', method: 'Method', received: 'Received', payouts: 'Payouts', lastPayout: 'Last payout', duration: 'Duration', person: 'Person', notes: 'Notes' };
const SETTLE_ALL_COLS = ['name', 'status', 'dateFiled', 'deadline', 'claimNumber', 'claimId', 'method', 'received', 'payouts', 'lastPayout', 'duration', 'person', 'notes'];
const SETTLE_DEFAULT_COLS = ['name', 'status', 'dateFiled', 'claimNumber', 'method', 'received', 'lastPayout', 'duration'];
function buildSettleCol(store, key) {
  switch (key) {
    case 'name': return { label: 'Settlement', key: 'name', value: r => r.name || '', cell: r => { const td = el('td'); td.appendChild(el('span', null, r.name || '—')); if (r.caseName) td.appendChild(el('div', 'acct-sub', firstLine(r.caseName))); return td; } };
    case 'status': return { label: 'Status', key: 'status', value: r => r.status || '', cell: r => { const td = el('td'); const st = r.status || 'Not submitted'; td.appendChild(settleFilterBadge('status', st, settleStatusTone(st))); return td; } };
    case 'dateFiled': return { label: 'Filed', key: 'dateFiled', value: r => r.dateFiled || '', cell: r => el('td', null, r.dateFiled ? fmtDate(r.dateFiled) : '—') };
    case 'deadline': return { label: 'Deadline', key: 'deadline', value: r => r.deadline || '', cell: r => el('td', 'muted', r.deadline ? fmtDate(r.deadline) : '—') };
    case 'claimNumber': return { label: 'Claim / confirmation #', key: 'claimNumber', value: r => r.claimNumber || '', cell: r => { const td = el('td', 'mono-sm'); td.textContent = firstLine(r.claimNumber) || '—'; if (r.claimNumber) td.title = r.claimNumber; return td; } };
    case 'claimId': return { label: 'Claim ID', key: 'claimId', value: r => r.claimId || '', cell: r => el('td', 'mono-sm', r.claimId || '—') };
    case 'method': return { label: 'Method', key: 'method', value: r => r.method || '', cell: r => { const td = el('td'); if (r.method) td.appendChild(settleFilterBadge('method', r.method, 'type')); else td.textContent = '—'; return td; } };
    case 'received': return { label: 'Received', key: 'received', num: true, value: r => settleReceived(r), cell: r => numCell(settleReceived(r), true) };
    case 'payouts': return { label: 'Payouts', key: 'payouts', num: true, value: r => (r.payments || []).length, cell: r => el('td', 'num', String((r.payments || []).length || '—')) };
    case 'lastPayout': return { label: 'Last payout', key: 'lastPayout', value: r => settleLastPayout(r), cell: r => el('td', 'muted', settleLastPayout(r) ? fmtDate(settleLastPayout(r)) : '—') };
    case 'duration': return { label: 'Duration', key: 'duration', num: true,
        value: r => { const c = settleTimeToPay(r); if (c != null) return c; const cur = settleCurrentDuration(r); return cur != null ? cur : -1; },
        cell: r => {
          const td = el('td');
          const done = settleTimeToPay(r);
          if (done != null) { td.textContent = done + 'd'; td.title = 'Filed → first payout (completed): ' + durDays(done); }
          else { const cur = settleCurrentDuration(r); if (cur != null) { td.appendChild(document.createTextNode(cur + 'd ')); td.appendChild(badge('ongoing', 'amber')); td.title = 'Days since filed — still awaiting payout: ' + durDays(cur); } else td.textContent = '—'; }
          return td; } };
    case 'person': return { label: 'Person', key: 'person', value: r => store.personName(r.personId), cell: r => { const td = el('td'); const n = store.personName(r.personId); if (n && n !== '—') td.appendChild(settleFilterBadge('person', n, '')); else td.textContent = '—'; return td; } };
    case 'notes': return { label: 'Notes', key: 'notes', value: r => r.notes || '', cell: r => { const td = el('td', 'muted'); td.textContent = firstLine(r.notes) || '—'; if (r.notes) td.title = r.notes; return td; } };
  }
  return null;
}
let _settleIncomeSynced = false;   // one-time-per-session reconcile of existing payouts → income
function renderSettlements(view) {
  destroyCharts();
  const store = window.cloverStore, s = store.state;
  const all = s.settlements || [];
  // First visit this session: back-fill Income for payouts logged before auto-post
  // existed (idempotent + adopts prior manual entries, so it never double-counts).
  if (!_settleIncomeSynced && ownerState() === 'owner') {
    _settleIncomeSynced = true;
    all.forEach(st => store.reconcileSettlementIncome(st).catch(() => {}));
  }
  let rows = all.slice();
  if (settleStatusFilter !== 'all') rows = rows.filter(r => (r.status || 'Not submitted') === settleStatusFilter);
  if (settleBadgeFilter) {
    const f = settleBadgeFilter;
    const valOf = r => f.key === 'status' ? (r.status || 'Not submitted') : f.key === 'method' ? (r.method || '') : f.key === 'person' ? store.personName(r.personId) : '';
    rows = rows.filter(r => valOf(r) === f.value);
  }
  if (settleSearch.trim()) {
    const q = settleSearch.trim().toLowerCase();
    rows = rows.filter(r => [r.name, r.caseName, r.claimNumber, r.claimId, r.method, r.notes, r.status, r.url].some(v => (v || '').toLowerCase().includes(q)));
  }
  const narrowed = !!(settleBadgeFilter || settleStatusFilter !== 'all' || settleSearch.trim());

  const head = el('div', 'view-head');
  const left = el('div');
  left.appendChild(el('h3', null, 'Class Action Settlements'));
  left.appendChild(el('p', 'muted', all.length + ' tracked · search to check whether you’ve already submitted to one'));
  head.appendChild(left);
  const acts = el('div', 'head-actions');
  acts.appendChild(importButton('settlements'));
  const add = el('button', 'btn-primary', '+ Add settlement'); add.addEventListener('click', () => settlementModal(null));
  acts.appendChild(add);
  head.appendChild(acts);
  view.appendChild(head);

  // Stat cards reflect what's displayed (narrow via the bubbles/search to see
  // subtotals), matching the Bills & Subscriptions behavior.
  const submitted = rows.filter(settleIsSubmitted).length;
  const paid = rows.filter(settleIsPaid).length;
  const open = rows.filter(settleIsOpen).length;
  const received = rows.reduce((a, r) => a + settleReceived(r), 0);
  const fHint = narrowed ? 'filtered view' : undefined;
  const sum = el('div', 'sub-summary');
  const scard = (label, val, tone, hint) => { const c = el('div', 'sum-card'); c.appendChild(el('div', 'sum-label', label)); c.appendChild(el('div', 'sum-value ' + (tone || ''), val)); if (hint) c.appendChild(el('div', 'sum-hint', hint)); return c; };
  sum.appendChild(scard('Tracked', String(rows.length), '', narrowed ? 'of ' + all.length + ' total' : 'total claims'));
  sum.appendChild(scard('Submitted', String(submitted), 'neutral', fHint || 'claims filed'));
  sum.appendChild(scard('Awaiting payout', String(open), open ? 'amber' : '', fHint || 'submitted, not yet paid'));
  sum.appendChild(scard('Paid', String(paid), 'income', fHint || 'received a payout'));
  sum.appendChild(scard('Total received', received > 0 ? money(received) : '–', 'income', fHint || 'across all payouts'));
  // Extended insight cards — only once there's paid data to summarize.
  const paidRows = rows.filter(settleIsPaid);
  const amtEntries = paidRows.map(r => ({ r, amt: settleReceived(r) })).filter(x => x.amt > 0);
  const durEntries = paidRows.map(r => ({ r, d: settleTimeToPay(r) })).filter(x => x.d != null);
  if (amtEntries.length) {
    const minAmt = amtEntries.reduce((m, x) => x.amt < m.amt ? x : m);
    const maxAmt = amtEntries.reduce((m, x) => x.amt > m.amt ? x : m);
    sum.appendChild(scard('Lowest paid', money(minAmt.amt), 'income', minAmt.r.name));
    sum.appendChild(scard('Highest paid', money(maxAmt.amt), 'income', maxAmt.r.name));
  }
  if (durEntries.length) {
    const avgDur = Math.round(durEntries.reduce((a, x) => a + x.d, 0) / durEntries.length);
    const minDur = durEntries.reduce((m, x) => x.d < m.d ? x : m);
    const maxDur = durEntries.reduce((m, x) => x.d > m.d ? x : m);
    sum.appendChild(scard('Avg time to pay', durDays(avgDur), 'neutral', 'filed → first payout' + (narrowed ? ' · filtered' : '')));
    sum.appendChild(scard('Fastest payout', durDays(minDur.d), 'income', minDur.r.name));
    sum.appendChild(scard('Slowest payout', durDays(maxDur.d), 'amber', maxDur.r.name));
  }
  view.appendChild(sum);

  // Paid by year — how much landed each calendar year (by payout date).
  const byYear = {};
  rows.forEach(r => (r.payments || []).forEach(p => { const m = /^(\d{4})/.exec(p.date || ''); if (m && Number(p.amount)) byYear[m[1]] = (byYear[m[1]] || 0) + Number(p.amount); }));
  const yrs = Object.keys(byYear).sort((a, b) => b - a);
  if (yrs.length) {
    const pyCard = el('div', 'card');
    pyCard.appendChild(el('h3', 'strip-title', 'Paid by year' + (narrowed ? ' · filtered view' : '')));
    const maxY = Math.max.apply(null, yrs.map(y => byYear[y]));
    const list = el('div', 'mini-list');
    yrs.forEach(y => {
      const wrap = el('div');
      const rowl = el('div', 'mini-row'); rowl.appendChild(el('span', null, y)); const rt = el('span', 'mini-right'); rt.appendChild(el('span', null, money(byYear[y]))); rowl.appendChild(rt); wrap.appendChild(rowl);
      const track = el('div', 'sum-bar'); const fill = el('div', 'sum-bar-fill income'); fill.style.width = (byYear[y] / maxY * 100) + '%'; track.appendChild(fill); wrap.appendChild(track);
      list.appendChild(wrap);
    });
    pyCard.appendChild(list);
    view.appendChild(pyCard);
  }

  const bar = el('div', 'filter-bar');
  const statusSel = select([{ value: 'all', label: 'All statuses' }].concat(SETTLE_STATUSES.map(v => ({ value: v, label: v }))), settleStatusFilter);
  statusSel.addEventListener('change', () => { settleStatusFilter = statusSel.value; renderView(currentRoute); });
  bar.appendChild(labelWrap('Status', statusSel));
  const searchIn = input(settleSearch, { placeholder: 'Search name, case, claim #…' }); searchIn.id = 'settle-search'; searchIn.type = 'search';
  searchIn.addEventListener('input', () => {
    settleSearch = searchIn.value; renderView(currentRoute);
    const n = document.getElementById('settle-search'); if (n) { n.focus(); const L = n.value.length; try { n.setSelectionRange(L, L); } catch (e) {} }
  });
  bar.appendChild(labelWrap('Search', searchIn));
  // Active-filter chip shares this row, before the right-aligned ⚙ Columns.
  if (settleBadgeFilter) {
    const f = settleBadgeFilter;
    bar.appendChild(el('span', 'muted', 'Showing ' + rows.length + ' where ' + (SETTLE_COL_LABELS[f.key] || f.key) + ' = “' + f.value + '”'));
    const clear = el('button', 'btn-ghost', '✕ Clear filter');
    clear.addEventListener('click', () => { settleBadgeFilter = null; renderView(currentRoute); });
    bar.appendChild(clear);
  }
  const colsBtn = columnsButton('settlements', SETTLE_ALL_COLS, SETTLE_DEFAULT_COLS, SETTLE_COL_LABELS, 'Class Action columns'); colsBtn.style.marginLeft = 'auto';
  bar.appendChild(colsBtn);
  view.appendChild(bar);

  if (!all.length) { view.appendChild(emptyState('No settlements tracked yet', 'Track the class-action claims you’ve submitted to — so you can see their status and never submit to the same one twice. Add one, or import your existing list.', '+ Add settlement', () => settlementModal(null))); return; }
  if (!rows.length) { view.appendChild(el('div', 'card muted', 'No settlements match your search.')); return; }

  const cols = [
    ...tableColKeys(store, 'settlements', SETTLE_COL_LABELS, SETTLE_DEFAULT_COLS).map(k => buildSettleCol(store, k)).filter(Boolean),
    { label: '', sortable: false, cell: r => {
        const td = el('td', 'row-actions');
        const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => settlementModal(r));
        const notesBtn = el('button', 'icon-btn' + (r.notes ? ' has-note' : ''), (r.notes ? '📝 ' : '') + 'Notes');
        notesBtn.title = r.notes ? ('Note: ' + firstLine(r.notes)) : 'Add a note to this class action';
        notesBtn.addEventListener('click', () => settlementNotesModal(r));
        const dup = el('button', 'icon-btn', 'Duplicate');
        dup.title = 'Start a new claim prefilled from this one (filed date set to today; status, payouts, and history reset)';
        dup.addEventListener('click', () => {
          const pre = JSON.parse(JSON.stringify(r));
          delete pre.id; delete pre.history; delete pre.createdAt; delete pre.updatedAt; delete pre.incomeYears;
          pre.dateFiled = todayISO();
          pre.status = 'Submitted';
          pre.payments = [];
          settlementModal(pre);
        });
        const del = el('button', 'icon-btn danger', 'Remove');
        // Remove the settlement's auto-posted income first, then the settlement.
        del.addEventListener('click', () => confirmRemove(r.name, async () => { await store.reconcileSettlementIncome(r, { remove: true }); store.removeSettlement(r.id); }));
        td.appendChild(edit); td.appendChild(notesBtn); td.appendChild(dup); td.appendChild(del); return td; } }
  ];
  const tcard = el('div', 'card table-card');
  tcard.appendChild(sortableTable(cols, rows, settleSort, ns => { settleSort = ns || { key: 'dateFiled', dir: 'desc' }; renderView(currentRoute); }, null));
  view.appendChild(tcard);
}
// Quick per-row note editor — a focused way to jot/read notes without opening the
// full Edit form. Writes the same `notes` field (also editable under Edit and
// showable as the optional Notes column).
function settlementNotesModal(existing) {
  const store = window.cloverStore;
  if (!existing || !existing.id) return settlementModal(existing);
  const ta = document.createElement('textarea');
  ta.value = existing.notes || ''; ta.rows = 7;
  ta.placeholder = 'Deadlines, correlation IDs, follow-ups, what you claimed — anything worth keeping.';
  const body = el('div', 'form-grid');
  body.appendChild(field('Notes for “' + (existing.name || 'this class action') + '”', ta, 'Freeform notes kept on this class action. Also editable from Edit, and available as a “Notes” column via the ⚙ Columns button.'));
  setTimeout(() => { try { ta.focus(); const L = ta.value.length; ta.setSelectionRange(L, L); } catch (e) {} }, 0);
  openModal({
    title: 'Notes', body, confirmLabel: 'Save',
    onConfirm: () => {
      const item = Object.assign({}, existing, { notes: ta.value.trim() });
      store.saveSettlement(item);
      toast('Notes saved');
    }
  });
}
function settlementModal(existing) {
  const store = window.cloverStore, s = store.state;
  const r = existing ? JSON.parse(JSON.stringify(existing)) : { status: 'Submitted', dateFiled: todayISO(), payments: [], personId: s.persons[0] && s.persons[0].id };
  if (!Array.isArray(r.payments)) r.payments = [];
  const body = el('div', 'form-grid');
  const methList = el('datalist'); methList.id = 'settle-method-list'; SETTLE_METHODS.forEach(v => { const o = el('option'); o.value = v; methList.appendChild(o); }); body.appendChild(methList);

  const fName = input(r.name || '', { placeholder: 'e.g. Facebook Biometric Privacy' });
  const fCase = document.createElement('textarea'); fCase.value = r.caseName || ''; fCase.rows = 2; fCase.placeholder = 'Full case name / number (optional)';
  const fStatus = select(SETTLE_STATUSES.map(v => ({ value: v, label: v })), r.status || 'Submitted');
  const fFiled = input(r.dateFiled || '', { type: 'date' });
  const fDeadline = input(r.deadline || '', { type: 'date' });
  const fClaimNo = document.createElement('textarea'); fClaimNo.value = r.claimNumber || ''; fClaimNo.rows = 2; fClaimNo.placeholder = 'Claim ID / confirmation code(s)';
  const fClaimId = input(r.claimId || '', { placeholder: 'Settlement claim ID (optional)' });
  const fMethod = input(r.method || '', { placeholder: 'e.g. PayPal, Venmo, Check', list: 'settle-method-list' });
  const fExpected = moneyInput(r.expectedAmount, { placeholder: 'estimate (optional)' });
  const cProof = checkbox('Proof required', r.proofRequired, 'Tick if this claim required proof of purchase / documentation (vs. a “no proof” claim).');
  const fUrl = input(r.url || '', { placeholder: 'https:// settlement site (optional)' });
  const fPerson = select(s.persons.map(p => ({ value: p.id, label: p.name })), r.personId || (s.persons[0] && s.persons[0].id));
  const fNotes = document.createElement('textarea'); fNotes.value = r.notes || ''; fNotes.rows = 2; fNotes.placeholder = 'Deadlines, correlation IDs, anything else';

  body.appendChild(field('Settlement name', fName, 'A short name you’ll recognize — this is what you search to check whether you already submitted.'));
  body.appendChild(field('Case name / number', fCase, 'The full legal case caption and number, if you have it.'));
  const row1 = el('div', 'two-col'); row1.appendChild(field('Status', fStatus, 'Where the claim stands. Paid = you received a payout.')); row1.appendChild(field('Filed', fFiled, 'The date you submitted the claim.')); body.appendChild(row1);
  const row2 = el('div', 'two-col'); row2.appendChild(field('Claim deadline', fDeadline, 'The claim-submission deadline, if known.')); row2.appendChild(field('Default method', fMethod, 'How payouts are/were paid — used to prefill new payout rows below.')); body.appendChild(row2);
  body.appendChild(field('Claim / confirmation #', fClaimNo, 'The claim ID and/or confirmation code(s) the settlement gave you.'));
  const row3 = el('div', 'two-col'); row3.appendChild(field('Settlement claim ID', fClaimId, 'A separate settlement-assigned ID, if any.')); row3.appendChild(field('Estimated payout', fExpected, 'A rough expected amount, if published (optional).')); body.appendChild(row3);
  const row4 = el('div', 'two-col'); row4.appendChild(field('Person', fPerson, 'Who the claim belongs to.')); const proofWrap = el('div', 'check-row'); proofWrap.appendChild(cProof); row4.appendChild(field('Flags', proofWrap)); body.appendChild(row4);
  body.appendChild(field('Settlement URL', fUrl, 'Link to the settlement site (optional).'));

  const payWrap = el('div');
  const payList = el('div', 'pay-list');
  const totalLine = el('div', 'muted');
  const updateTotal = () => { const t = r.payments.reduce((x, p) => x + (Number(p.amount) || 0), 0); totalLine.textContent = 'Total received: ' + (t > 0 ? money(t) : '$0.00'); };
  const renderPays = () => {
    payList.innerHTML = '';
    if (!r.payments.length) payList.appendChild(el('div', 'muted', 'No payouts recorded yet.'));
    r.payments.forEach((p, i) => {
      const row = el('div', 'pay-row');
      const d = input(p.date || '', { type: 'date' }); d.addEventListener('input', () => { p.date = d.value; });
      const a = moneyInput(p.amount, { placeholder: 'amount' }); a.addEventListener('input', () => { p.amount = a.value === '' ? null : parseFloat(a.value); updateTotal(); });
      const m = input(p.method || '', { placeholder: 'method', list: 'settle-method-list' }); m.addEventListener('input', () => { p.method = m.value; });
      const rm = el('button', 'icon-btn danger', '✕'); rm.title = 'Remove payout'; rm.addEventListener('click', () => { r.payments.splice(i, 1); renderPays(); updateTotal(); });
      row.appendChild(d); row.appendChild(a.__wrap); row.appendChild(m); row.appendChild(rm);
      payList.appendChild(row);
    });
  };
  const addPay = el('button', 'btn-ghost', '+ Add payout'); addPay.addEventListener('click', () => { r.payments.push({ id: 'pay' + Date.now() + Math.floor(Math.random() * 1000), date: todayISO(), amount: null, method: fMethod.value.trim() }); renderPays(); updateTotal(); });
  const payFoot = el('div', 'pay-foot'); payFoot.appendChild(addPay); payFoot.appendChild(totalLine);
  payWrap.appendChild(payList); payWrap.appendChild(payFoot);
  body.appendChild(field('Payouts', payWrap, 'Each payout you received from this settlement. The total flows into “Received”, and “+ Income” records the latest one as income.'));
  renderPays(); updateTotal();
  body.appendChild(field('Notes', fNotes, 'Deadlines, correlation IDs, or anything else worth keeping.'));

  const isEdit = !!(existing && existing.id);
  openModal({
    title: isEdit ? 'Edit settlement' : 'Add settlement', body: withHistoryTab(body, existing), confirmLabel: 'Save',
    onConfirm: () => {
      const name = fName.value.trim();
      if (!name) { fName.focus(); toast('Settlement name is required', 'warn'); return false; }
      const item = Object.assign(r, {
        name, caseName: fCase.value.trim(), status: fStatus.value, dateFiled: fFiled.value || '',
        deadline: fDeadline.value || '', claimNumber: fClaimNo.value.trim(), claimId: fClaimId.value.trim(),
        method: fMethod.value.trim(), expectedAmount: fExpected.value === '' ? null : parseFloat(fExpected.value),
        proofRequired: cProof.__input.checked, url: fUrl.value.trim(), personId: fPerson.value, notes: fNotes.value.trim(),
        payments: r.payments.filter(p => (p.amount != null && p.amount !== '') || p.date).map(p => ({ id: p.id || ('pay' + Math.random().toString(36).slice(2)), date: p.date || '', amount: Number(p.amount) || 0, method: p.method || '' }))
      });
      store.saveSettlement(item);
      // Auto-post its payouts into the Income grid (Other → Lawsuit), linked so
      // edits/removals stay in sync. Fire-and-forget; it re-renders on completion.
      const hadPay = (item.payments || []).some(p => Number(p.amount) > 0 && /^\d{4}/.test(p.date || ''));
      store.reconcileSettlementIncome(item).then(() => { if (hadPay) toast('Payouts synced to Income'); }).catch(() => {});
      toast(isEdit ? 'Settlement updated' : 'Settlement added');
    }
  });
}
// Prefill the income modal from a settlement — records the latest payout (or the
// estimate) under Other → Class Action Settlement. Never auto-saves.
// ============================================================
// Help / Guide — a plain-language wiki explaining what every page is for.
// KEEP THIS UPDATED when pages/features are added, changed, or removed.
// ============================================================
const HELP_SECTIONS = [
  { id: 'dashboard', ico: '◆', title: 'Dashboard', what: 'Your at-a-glance home screen.',
    points: [
      'Key numbers for the selected month: income in, money spent, and what’s left (net).',
      'Use the ‹ month › navigator in the header to step back through previous months (or “This month” to jump to today) — it moves with the top-bar Year/Month selectors and stops at the current month.',
      'Projected annual income and expenses based on your trend so far.',
      '“⚠ Attention” collects things that need you — bills renewing soon, late or missing paychecks, and budget placeholders waiting on last month’s actuals, and any CD that has passed its maturity date. A bell in the top-right also counts matured CDs — Clover never closes a CD on its own; it waits for you to renew or update it.',
      'Donut charts break down income and spending by category. “Expenses by category (YTD)” counts only the months that have already happened, so a yearly premium isn’t weighed against a few months of groceries.',
      '“Where your take-home goes (YTD)” asks a different question: what share of the money you actually brought home does each category use? The unspent remainder is a slice of its own, so the shares add up to 100% of take-home. If you’ve spent more than you’ve earned so far there’s no remainder to chart, so it lists the shares instead.',
      'Every panel can be moved, resized, hidden, or restored in edit mode.'
    ] },
  { id: 'income', ico: '▲', title: 'Income', what: 'Money coming in that isn’t a regular paycheck.',
    points: [
      'Covers dividends, interest, rewards/cash-back, IRA & estate distributions, class-action payouts, selling, and anything under “Other.”',
      'Annual grid view totals income by category across the months; List view shows every entry — and now includes your paychecks.',
      'Picking certain categories reveals tailored fields (e.g. a dividend’s ticker, a reward’s program/type, an IRA distribution’s withholdings).'
    ] },
  { id: 'paychecks', ico: '▤', title: 'Paychecks', what: 'Your wages — the source of truth for employment income.',
    points: [
      'Log each paycheck with gross, net, deductions, method, and pay period.',
      'The “Missing” tab flags paychecks that should have arrived (based on your pay schedule) but aren’t entered yet.',
      'Paychecks roll up automatically into the Income grid under Wages, so you never enter wages twice.'
    ] },
  { id: 'raises', ico: '↗', title: 'Raises', what: 'A history of your pay changes per employer.',
    points: [
      'Track hourly vs. salary, part-/full-time/seasonal, and each raise’s new amount vs. the previous one.',
      'See how each raise compared to inflation (real raise), how long you’ve been at each pay, and a year-over-year table.'
    ] },
  { id: 'selling', ico: '▧', title: 'Selling', what: 'Track marketplace sales (e.g. Poshmark) as income.',
    points: ['Log or import sales; they feed your income picture without cluttering the main Income list.'] },
  { id: 'settlements', ico: '⚖', title: 'Class Actions', what: 'A tracker for the class-action settlement claims you’ve submitted to.',
    points: [
      'Its first job: search to check whether you already submitted to a settlement before filing again.',
      'Track status (Submitted → Approved → Paid, plus Denied/Excluded), claim/confirmation numbers, deadlines, and each payout.',
      'Each row has a Notes button (📝 when a note exists) for quick freeform notes on that class action — the same notes are on the Edit form and can be shown as a “Notes” column via ⚙ Columns.',
      'Each row has a Duplicate button — handy when a new settlement shares most of the same details. It prefills a fresh claim from that row with the filed date set to today and the status, payouts, and history reset, so you just adjust what’s different and save.',
      'Each payout you log on a settlement is posted to the Income grid automatically, under Other → Lawsuit, dated to the payout. It stays linked: edit or remove the payout and its income entry follows. (Opening that income entry shows a note pointing you back here to change the amount or date.)',
      'Import your existing list from a CSV on the Import / Export page (a template is provided), or with the ⬆ Import button here.'
    ] },
  { id: 'expenses', ico: '▼', title: 'Expenses', what: 'Your actual, one-off spending (cash-basis).',
    points: [
      'Annual grid totals spending by category — with your recurring bills rolled in — and List shows each logged expense.',
      'The grid’s “Year total” column adds up every month in the row, and with bills rolled in the months that haven’t happened yet are estimates — so it’s a full-year forecast, not a year-to-date figure. The dashboard’s “Expenses by category (YTD)” donut is the year-to-date view, which is why the two differ.',
      'Stat cards show income, what you’ve spent, your monthly bills, and what’s left after everything.',
      'Each expense can carry a description, vendor, and (for parking/tolls) the day it applied to. Convert an expense into a recurring bill or budget placeholder from its row.',
      'In List view, search by vendor, description, notes, category, account, person, or amount — e.g. type “Supercuts” to see every visit and when the last one was. Searching spans the whole selected year (the month selector is ignored while a search is active), and the top-right search box does the same thing. Look in another year up top if the purchase was earlier.',
      'Picking Auto → Fuel adds Gallons and Price / gallon fields. Fill both and the Amount works itself out; the pump price keeps its third decimal (3.499, not 3.50) so it ties out to the receipt. Both are available as optional columns in List view.',
      'Money you move into savings or investments goes under the “Savings & Investments” category — pick it and a “Moved to” field appears for the destination account. It’s a transfer (the money is still yours), but it counts for the month so your leftover reflects it.'
    ] },
  { id: 'subscriptions', ico: '↻', title: 'Bills & Subscriptions', what: 'Everything that recurs — bills, subscriptions, memberships, loans.',
    points: [
      'Enter the charge and how often it bills; Clover computes the monthly-equivalent and annual cost, and warns before renewals.',
      'Track priority, status, auto-pay, account/customer numbers (masked), price history, and a one-time vs. recurring frequency.',
      'Convert any bill to/from a budget placeholder, or into a one-off expense, from its row.'
    ] },
  { id: 'budget', ico: '◐', title: 'Budget', what: 'Your “budget placeholders” — expected or future costs you want reflected before they’re real bills.',
    points: [
      'Stat cards summarize how many placeholders you have and their estimated monthly/annual cost.',
      'Each month, the check-in asks you to confirm whether each placeholder actually happened — log the real amount, or mark it not used.',
      'A few days into a new month, a reminder (here and on the Dashboard) nudges you to enter last month’s actuals.'
    ] },
  { id: 'accounts', ico: '▦', title: 'Accounts', what: 'Your banks, cards, brokerages, and other financial accounts.',
    points: [
      'Type-specific fields appear as needed: CD term/APY/maturity, credit-card statement & due days (with a “best card to use today” float), and a current APY for checking/savings/money-market.',
      'When a CD matures, Edit → “Renew CD…” rolls it into its next term — new APY, maturity, length, and (if the bank issued one) a new account number. The ending term is archived to a Renewals tab on that account, so past rates, dates, and numbers stay lookupable. The button turns amber when maturity is within 14 days.',
      'Once a CD passes its maturity date Clover never closes or renews it for you — it waits. A 🔔 bell (top right) and a Dashboard flag list any matured CDs, and an email (from notify.rizzo.cc, no Google needed) reminds you once per matured CD. Manage all of this under Settings → Notifications — the bell, the matured-CD email, and the 7-days-ahead calendar email.',
      'Renewing can also consolidate: tick other CDs whose money rolled into the renewal and they\u2019re closed and linked, so nothing is counted twice. CDs also carry an optional Principal $ and a Start / opened date \u2014 if the start is blank, Clover estimates it (maturity \u2212 term); if the term is blank but both dates are known, it\u2019s calculated from them. Anything calculated rather than typed carries an \u2248 marker whose tooltip explains exactly how it was derived \u2014 so an automatic assumption can never pass as something you entered. Editing the value by hand clears the marker.',
      'Accounts can carry a Balance $ stamped with an as-of date (a CD’s Principal $ is its balance) — every change lands in the History tab, and each history entry shows the account number that was in effect when the edit was made. History always stays with the account through renewals; a consolidation logs a “Consolidated in” entry on the combined CD while each source keeps its own history under Closed.',
      'Use the \u29d7 CD timeline tab (next to Open/Closed — or click the CD type badge in the table) to open the CD maturity timeline: every term and renewal drawn to its real dates, consolidation arrows, a Today line, a maturing-by-quarter ladder, estimated interest (per year and year-to-date) in the summary cards — estimates only, never added to the Income page — and a “CD principal over time” chart that steps up whenever you enter or update a principal. With it open, click an institution, owner, or beneficiary label in the table to narrow the timeline and its charts to just that group. Drag to pan, scroll to zoom at the cursor, double-click to reset.',
      'List beneficiaries so you can spot accounts that don’t have them set.',
      'Editing an account lets you Close it — with a warning of what’s tied to it (auto-pay and other bills) — and the date is tracked. Closed accounts move to the Closed tab and can be reopened.'
    ] },
  { id: 'credit', ico: '％', title: 'Credit & Rates', what: 'Credit-score history and savings-rate history.',
    points: [
      'Chart your credit scores over time by provider. Adding a score, the provider is a dropdown of the ones you’ve used before (plus common ones); pick “Add new provider…” to enter a different one.',
      'All-time and current-year high/low cards sit above the chart — like a stock’s range — each naming the provider that reported it (credit models differ between providers, so the source matters).',
      'Log savings APYs per bank — the bank is a dropdown of ones you’ve logged (plus your Settings list), with “Add new institution…” to enter another. All-time and current-year high/low cards sit above the chart, each naming the bank. Some banks (e.g. Synchrony) can auto-sync from a public rate feed.'
    ] },
  { id: 'taxes', ico: '§', title: 'Taxes', what: 'Your tax-filing history.',
    points: ['Record each year’s forms, whether you got a refund or owed, prep cost, and preparer — original filings and amendments.'] },
  { id: 'reports', ico: '▥', title: 'Reports', what: 'Charts and summaries that pull your year together.',
    points: ['Visual breakdowns across income, expenses, and trends. Panels can be customized like the Dashboard.'] },
  { id: 'calendar', ico: '▣', title: 'Calendar', what: 'A month view of money events.',
    points: [
      'Shows expected pay dates, bill renewals, CD maturities (with a 7-day heads-up), and FOMC rate-decision dates. Click any day for the full detail.',
      'Optionally push these events one-way into a dedicated Google Calendar. Once connected, each CD maturity carries an email reminder 7 days ahead — Google emails you in time to decide on rollover or call for new rates. Turn this off under Settings → Notifications. Sync while the maturity is within about three months (the push window) so the reminder is set; a CD already inside 7 days won’t email, but still shows on the calendar.',
      'FOMC meeting dates (when the Fed sets interest rates) are built in and shown on the Calendar and the Credit & Rates page — dates only, no minutes. They push to Google too. Hide them under Settings → Calendar. The dates keep themselves current — a scheduled job re-reads the Fed’s official calendar every month, so nothing manual is needed.'
    ] },
  { id: 'import', ico: '⇅', title: 'Import / Export', what: 'Get data in and out.',
    points: [
      'Import CSVs and broker files (dividends, interest, fees, expenses, paychecks, bills). Templates are provided for each.',
      'Back up all your data to a file, or restore from one.'
    ] },
  { id: 'settings', ico: '⚙', title: 'Settings', what: 'Everything you can customize.',
    points: [
      'Manage people, income/expense categories and their subcategories, and catalog lists (institutions, reward programs, gift-card types, tax forms, pay methods, check types).',
      'Set new-account defaults. Table columns and dashboard/report panel layouts are saved per person.',
      '“Times & time zone” confirms which zone your times are shown in — Clover follows your device automatically, so there’s nothing to configure.'
    ] }
];
function renderHelp(view) {
  const head = el('div', 'view-head');
  const left = el('div');
  left.appendChild(el('h3', null, 'Help / Guide'));
  left.appendChild(el('p', 'muted', 'What each page is for, in plain language. New here? Start with Accounts and Paychecks, then Bills & Subscriptions.'));
  head.appendChild(left);
  view.appendChild(head);

  const intro = el('div', 'card');
  intro.appendChild(el('p', null, 'Clover is your private, single-user finance hub — it replaces a stack of spreadsheets. Your data is stored under your own account and is visible only to you.'));
  const tips = el('ul', 'help-tips');
  [
    'Tables can be sorted (click a header) and their columns customized (the ⚙ Columns button).',
    'Many list pages have a live search box (Expenses, Bills, Class Actions); the top-right search drives whichever of those you’re on. Forms explain each field with an ⓘ tooltip.',
    'The year and month selectors at the top control what most pages show.',
    'Editing an expense, income entry, paycheck, bill, account, or settlement? Its form has a “History” tab showing exactly what changed and when — e.g. “Amount $42.80 → $51.25”.'
  ].forEach(t => tips.appendChild(el('li', null, t)));
  intro.appendChild(tips);
  view.appendChild(intro);

  // Follow the nav's order rather than keeping a second list in sync by hand.
  const navOrder = ROUTES.filter(r => r.id).map(r => r.id);
  HELP_SECTIONS.slice().sort((a, b) => navOrder.indexOf(a.id) - navOrder.indexOf(b.id)).forEach(sec => {
    const card = el('div', 'card help-card');
    const h = el('div', 'help-head');
    h.appendChild(el('span', 'help-ico', sec.ico));
    const ht = el('div');
    ht.appendChild(el('h3', 'help-title', sec.title));
    ht.appendChild(el('p', 'muted', sec.what));
    h.appendChild(ht);
    const go = el('button', 'btn-ghost', 'Open →'); go.addEventListener('click', () => { location.hash = sec.id; });
    h.appendChild(go);
    card.appendChild(h);
    const ul = el('ul', 'help-points');
    sec.points.forEach(p => ul.appendChild(el('li', null, p)));
    card.appendChild(ul);
    view.appendChild(card);
  });

  const foot = el('div', 'card muted');
  foot.textContent = 'Clover v' + VERSION + '. This guide is kept in step with the app as features change.';
  view.appendChild(foot);
}

function sumCard(label, value, tone, hint, bar) {
  const c = el('div', 'sum-card');
  c.appendChild(el('div', 'sum-label', label));
  c.appendChild(el('div', 'sum-value ' + (tone || ''), value));
  if (hint) c.appendChild(el('div', 'sum-hint', hint));
  // Optional progress bar: bar = { pct (0..100+, clamped for width), tone }.
  if (bar && bar.pct != null && isFinite(bar.pct)) {
    const track = el('div', 'sum-bar');
    const fill = el('div', 'sum-bar-fill ' + (bar.pct > 100 ? 'expense' : (bar.tone || 'neutral')));
    fill.style.width = Math.max(0, Math.min(100, bar.pct)) + '%';
    track.title = bar.title || (bar.pct.toFixed(1) + '% of net monthly income');
    track.appendChild(fill);
    c.appendChild(track);
  }
  return c;
}
function renewCell(r) {
  const td = el('td');
  const active = isSubActive(r);
  const next = active ? nextRenewalDate(r) : r.renewalDate;
  const d = daysUntil(next);
  if (d == null) { td.textContent = '—'; return td; }
  const warn = window.cloverStore.state.settings.warnWindows || [7, 14, 30, 60];
  const maxW = Math.max.apply(null, warn);
  td.appendChild(el('span', null, fmtDate(next) + ' '));
  // Active bills always roll forward, so they're never overdue; only an inactive
  // sub can show a past date.
  if (active && d >= 0 && d <= maxW) td.appendChild(badge('in ' + d + 'd', d <= 7 ? 'red' : 'amber'));
  else if (d >= 0) td.appendChild(el('span', 'muted', 'in ' + d + 'd'));
  else td.appendChild(el('span', 'muted', -d + 'd ago'));
  return td;
}

function subscriptionModal(existing) {
  const store = window.cloverStore, s = store.state;
  const r = existing ? Object.assign({}, existing) : { frequency: 'monthly', status: 'Active', priority: 'Medium', autoPay: false, personId: s.persons[0] && s.persons[0].id };
  const body = el('div', 'form-grid');

  const fName = input(r.name || '', { placeholder: 'e.g. Netflix' });
  const fVendor = input(r.vendor || '', { placeholder: 'Vendor (optional)' });
  const fCat = select([{ value: '', label: '— Select —' }].concat(s.expenseCategories.map(c => ({ value: c.id, label: c.name }))), r.categoryId || '');
  const fSub = select([{ value: '', label: '—' }], r.subId || '');
  const rebuildSubs = () => { const g = s.expenseCategories.find(c => c.id === fCat.value); const opts = [{ value: '', label: '—' }].concat((g ? g.subs : []).map(x => ({ value: x.id, label: x.name }))); fSub.innerHTML = ''; opts.forEach(o => { const op = el('option'); op.value = o.value; op.textContent = o.label; fSub.appendChild(op); }); if (r.subId) fSub.value = r.subId; };
  const fAmount = moneyInput(r.amount);
  const fFreq = select(FREQUENCIES.map(f => ({ value: f.key, label: f.label })), r.frequency || 'monthly');
  const fInterval = input(r.interval || '', { type: 'number', placeholder: 'N' }); fInterval.min = 1;
  const intervalWrap = field('Interval (N)', fInterval, 'How many months or years between charges.');
  const syncInterval = () => { intervalWrap.style.display = (fFreq.value === 'everyNMonths' || fFreq.value === 'everyNYears') ? '' : 'none'; };
  fFreq.addEventListener('change', syncInterval);
  const fRenew = input(r.renewalDate || '', { type: 'date' });
  const fAcct = accountSelect(s, r.accountId || '');
  const fBackup = accountSelect(s, r.backupAccountId || '', '— None —');
  const fPerson = select(s.persons.map(p => ({ value: p.id, label: p.name })), r.personId || (s.persons[0] && s.persons[0].id));
  const fPriority = select(PRIORITIES, r.priority || 'Medium');
  const fStatus = select(SUB_STATUSES, r.status || 'Active');
  const cAuto = checkbox('Auto-pay', r.autoPay, 'Charged automatically — no manual action needed.');
  const cBudget = checkbox('Budget placeholder', r.budgetEst, 'A future or expected cost, not a real bill yet — e.g. you know a utility will jump from $27 to $180 once you move in. It counts toward Total monthly/annual so your budgeting and income planning reflect it, and it’s tagged “Budget est.” everywhere so it can’t be mistaken for an actual bill.');
  const fUrl = input(r.url || '', { placeholder: 'https:// (optional)' });
  const fPayUrl = input(r.payUrl || '', { placeholder: 'https:// (optional)' });
  // Customer/account number stays masked unless the field is focused.
  const fCust = input(r.customerNo || '', { placeholder: 'optional' });
  fCust.type = 'password'; fCust.autocomplete = 'off';
  fCust.addEventListener('focus', () => { fCust.type = 'text'; });
  fCust.addEventListener('blur', () => { fCust.type = 'password'; });
  const fApr = input(r.apr != null ? r.apr : '', { type: 'number', placeholder: 'e.g. 24.99' }); fApr.step = '0.01'; fApr.min = 0;
  const fSubCheckNo = input(r.checkNo || '', { placeholder: 'optional' });
  const fNotes = document.createElement('textarea'); fNotes.value = r.notes || ''; fNotes.rows = 2; fNotes.placeholder = 'Optional';

  body.appendChild(field('Name', fName, 'What the subscription or bill is called.'));
  body.appendChild(field('Vendor', fVendor, 'The company that bills you, if different from the name.'));
  body.appendChild(field('Category', fCat, 'The expense category. Manage the list in Settings.'));
  body.appendChild(field('Subcategory', fSub, 'A more specific grouping within the category (optional).'));
  const amtRow = el('div', 'two-col');
  amtRow.appendChild(field('Amount', fAmount, 'The amount of each charge — not the monthly equivalent. Clover computes monthly/annual from the frequency.'));
  amtRow.appendChild(field('Frequency', fFreq, 'How often you are charged. Converted to a monthly-equivalent and annual cost.'));
  body.appendChild(amtRow);
  body.appendChild(intervalWrap);
  const renewField = field('Renewal / due date', fRenew, 'The day it recurs — e.g. the 8th. For an active bill this auto-advances each period (monthly → next month’s same day, annual → next year), so you set it once and it never goes overdue or blank. Drives the renewal warnings (7/14/30/60 days). For a one-time bill this is simply the date it’s due — it never rolls forward.');
  // NOT a "have I paid it yet" flag — it's "is there a charge for this bill in
  // <year>", which is what makes it count toward the totals. Ticked is the
  // normal case; unticking drops the bill out of Total monthly / annual and the
  // expense grid until January. The old "Paid for this year" wording made the
  // ticked default read like a claim you'd already paid it.
  const curYr = new Date().getFullYear();
  const cPaidYr = checkbox('Applies to ' + curYr, r.notPaidYear !== curYr,
    'Is there a charge for this bill in ' + curYr + '? Leave it ON for a normal bill — that’s what makes it count toward your Total monthly / annual cards and the expense grid. Untick ONLY when nothing at all is due this calendar year — e.g. an annual bill whose next renewal is in ' + (curYr + 1) + ' that you never paid in ' + curYr + ' — and it drops out of the totals until January, when it resets automatically. This is not a “have I paid it yet” flag: a bill you’ll pay later this year should stay ticked.');
  const renewRow = el('div', 'two-col');
  renewRow.appendChild(renewField);
  const pyWrap = el('div', 'check-row'); pyWrap.appendChild(cPaidYr);
  renewRow.appendChild(field('This calendar year', pyWrap));
  body.appendChild(renewRow);
  const subCheckNoField = field('Check # (optional)', fSubCheckNo, 'If this one-time bill is paid by paper check, the check number — for tracing it later.');
  body.appendChild(subCheckNoField);
  const acctRow = el('div', 'two-col');
  acctRow.appendChild(field('Payment account', fAcct, 'Which account or card pays for this.'));
  acctRow.appendChild(field('Backup account', fBackup, 'A fallback payment method on file, if any.'));
  body.appendChild(acctRow);
  const metaRow = el('div', 'two-col');
  metaRow.appendChild(field('Priority', fPriority, 'How essential this is — helps decide what to cut.'));
  metaRow.appendChild(field('Status', fStatus, 'Active and Trial count toward totals; Paused/Canceled/Inactive do not.'));
  body.appendChild(metaRow);
  const pRow = el('div', 'two-col');
  pRow.appendChild(field('Person', fPerson, 'Who this belongs to.'));
  const flagsWrap = el('div', 'check-row'); flagsWrap.appendChild(cAuto); flagsWrap.appendChild(cBudget);
  pRow.appendChild(field('Flags', flagsWrap));
  body.appendChild(pRow);
  const custField = field('Account / customer #', fCust, 'Your customer, account, policy, or member number with this vendor. Kept masked except the last 4 digits until you click into the field (or click it in the table).');
  const aprField = field('Interest rate (APR %)', fApr, 'The interest rate this loan or card charges, for reference.');
  const custRow = el('div', 'two-col');
  custRow.appendChild(custField); custRow.appendChild(aprField);
  body.appendChild(custRow);
  const urlRow = el('div', 'two-col');
  urlRow.appendChild(field('Vendor URL', fUrl, 'The vendor’s site — where you manage or cancel this (optional).'));
  urlRow.appendChild(field('Payment URL', fPayUrl, 'Where you go to actually pay this bill, if different from the vendor site (optional).'));
  body.appendChild(urlRow);
  body.appendChild(field('Notes', fNotes, 'Anything else — promo pricing, renewal quirks, etc.'));
  // Category-aware labels/fields: the number field renames itself to match the
  // category, and APR only shows where an interest rate makes sense.
  const custLblNode = custField.querySelector('span').childNodes[0];
  const renewLblNode = renewField.querySelector('span').childNodes[0];
  const syncCatFields = () => {
    const n = ((s.expenseCategories.find(c => c.id === fCat.value) || {}).name || '');
    custLblNode.nodeValue = /insurance/i.test(n) ? 'Policy #' : /membership|gym/i.test(n) ? 'Member #' : /loan|credit/i.test(n) ? 'Loan / account #' : 'Account / customer #';
    aprField.style.display = /loan|credit/i.test(n) ? '' : 'none';
  };
  const syncOnce = () => {
    renewLblNode.nodeValue = fFreq.value === 'once' ? 'Due date' : 'Renewal / due date';
    // A recurring bill has a different check every cycle — the single check
    // number only makes sense for one-time bills.
    subCheckNoField.style.display = fFreq.value === 'once' ? '' : 'none';
  };
  fFreq.addEventListener('change', syncOnce);
  rebuildSubs(); syncInterval(); syncCatFields(); syncOnce();
  fCat.addEventListener('change', () => { rebuildSubs(); syncCatFields(); });

  // A prefill without an id (e.g. "+ Add budget placeholder" passing {budgetEst:true})
  // is still a NEW bill — key the wording off a real id, not merely a truthy arg.
  const isEdit = !!(existing && existing.id);
  openModal({
    title: isEdit ? 'Edit subscription' : 'Add subscription', body: withHistoryTab(body, existing), confirmLabel: 'Save',
    onConfirm: () => {
      const name = fName.value.trim();
      if (!name) { fName.focus(); toast('Name is required', 'warn'); return false; }
      const amount = parseFloat(fAmount.value);
      if (isNaN(amount)) { fAmount.focus(); toast('Amount is required', 'warn'); return false; }
      const isN = fFreq.value === 'everyNMonths' || fFreq.value === 'everyNYears';
      // Track amount changes over time (powers the trend arrow + price-history chart).
      // Append a point only when the amount actually changes; collapse same-day edits.
      let hist = Array.isArray(r.priceHistory) ? r.priceHistory.slice() : [];
      // Seed a baseline for a pre-existing bill (no history yet) so its first change
      // shows as a trend — dated to its renewal anchor when that's in the past.
      if (!hist.length && r.amount != null && r.amount !== '' && !isNaN(Number(r.amount))) {
        const anch = parseISODate(r.renewalDate);
        if (anch && anch < new Date() && Number(r.amount) !== amount) hist.push({ date: r.renewalDate, amount: Number(r.amount) });
      }
      const lastH = hist[hist.length - 1];
      if (!lastH || Number(lastH.amount) !== amount) {
        if (lastH && lastH.date === todayISO()) hist[hist.length - 1] = { date: todayISO(), amount };
        else hist.push({ date: todayISO(), amount });
      }
      const item = Object.assign(r, {
        name, vendor: fVendor.value.trim(), categoryId: fCat.value, subId: fSub.value || '',
        amount, frequency: fFreq.value, interval: isN ? (parseInt(fInterval.value, 10) || 1) : null,
        renewalDate: fRenew.value || '', notPaidYear: cPaidYr.__input.checked ? null : new Date().getFullYear(), accountId: fAcct.value || '', backupAccountId: fBackup.value || '',
        personId: fPerson.value, priority: fPriority.value, status: fStatus.value, autoPay: cAuto.__input.checked, budgetEst: cBudget.__input.checked,
        url: fUrl.value.trim(), payUrl: fPayUrl.value.trim(), customerNo: fCust.value.trim(), checkNo: fSubCheckNo.value.trim(),
        apr: fApr.value === '' ? null : parseFloat(fApr.value), notes: fNotes.value.trim(), priceHistory: hist
      });
      store.saveRecurring(item);
      toast(isEdit ? 'Subscription updated' : 'Subscription added');
    }
  });
}

// ============================================================
// Expenses (annual grid + one-off payments) — Phase 3 part 2
// ============================================================
function expenseAmount(e) { return Number(e.amount) || 0; }

// Normalized monthly cost of active recurring bills in a category, spread across
// all 12 months — EXCEPT months where a logged payment is linked to that bill
// (the actual overrides the estimate, so it isn't double-counted).
// Recurring-bill estimates only make sense from the current year forward —
// bills have no start/end history, so projecting them into past years would
// overwrite what those years actually looked like.
function recurringAppliesTo(year) { return year >= new Date().getFullYear(); }
// Per-category recurring estimates, split by the bill's assigned subcategory:
// { total, subs: {subId: months[]}, none: months[] }. validSubIds keeps bills
// pointing at a deleted subcategory in the "no subcategory" bucket.
function recurringMonthsBy(store, catId, payments, validSubIds) {
  const bills = store.state.recurring.filter(isSubActive).filter(r => r.categoryId === catId);
  const out = { total: new Array(12).fill(0), subs: {}, none: new Array(12).fill(0) };
  bills.forEach(bill => {
    if (bill.notPaidYear === activeYear) return;   // nothing due this calendar year
    const once = bill.frequency === 'once';
    const onceMonth = once ? (String(bill.renewalDate || '').slice(0, 4) === String(activeYear) ? monthIdx(bill.renewalDate) : -1) : -1;
    const me = once ? (Number(bill.amount) || 0) : monthlyEquiv(bill);
    const subOk = bill.subId && (!validSubIds || validSubIds.has(bill.subId));
    for (let mi = 0; mi < 12; mi++) {
      if (once && mi !== onceMonth) continue;
      const overridden = payments.some(p => p.recurringId === bill.id && monthIdx(p.date) === mi);
      if (overridden) continue;
      out.total[mi] += me;
      if (subOk) (out.subs[bill.subId] = out.subs[bill.subId] || new Array(12).fill(0))[mi] += me;
      else out.none[mi] += me;
    }
  });
  return out;
}
function recurringMonthsForCategory(store, catId, payments) {
  return recurringMonthsBy(store, catId, payments).total;
}

function renderExpenses(view) {
  const store = window.cloverStore;
  if (!store.isYearLoaded(activeYear)) { view.appendChild(loadingPanel()); store.loadYear(activeYear); return; }
  const data = store.yearData(activeYear);

  const store2 = window.cloverStore;
  const hasBills = store2.state.recurring.some(isSubActive);
  const head = el('div', 'view-head');
  const left = el('div');
  left.appendChild(el('h3', null, 'Expenses · ' + activeYear));
  const total = data.expensePayments.reduce((s, e) => s + expenseAmount(e), 0);
  const n = data.expensePayments.length;
  const recApplies = recurringAppliesTo(activeYear);
  left.appendChild(el('p', 'muted', money(total) + ' logged · ' + n + ' entr' + (n === 1 ? 'y' : 'ies') +
    (expenseIncludeRecurring && hasBills && recApplies ? ' + recurring bills' : '')));
  head.appendChild(left);

  const right = el('div', 'head-actions');
  const tabs = el('div', 'tabs');
  [['grid', 'Annual grid'], ['list', 'List']].forEach(([t, label]) => {
    const b = el('button', 'tab' + (expenseTab === t ? ' active' : ''), label);
    b.addEventListener('click', () => { expenseTab = t; renderView(currentRoute); });
    tabs.appendChild(b);
  });
  right.appendChild(tabs);
  if (expenseTab === 'grid' && hasBills && recApplies) {
    const toggle = checkbox('Include bills', expenseIncludeRecurring, 'Roll active recurring bills (from Bills & Subscriptions) into the grid at their normalized monthly cost. A logged expense linked to a bill overrides its estimate for that month.');
    toggle.__input.addEventListener('change', () => { expenseIncludeRecurring = toggle.__input.checked; renderView(currentRoute); });
    right.appendChild(toggle);
  }
  right.appendChild(importButton('expenses'));
  const add = el('button', 'btn-primary', '+ Add expense'); add.addEventListener('click', () => expenseModal(null));
  right.appendChild(add);
  head.appendChild(right);
  view.appendChild(head);

  // What the month really costs — logged expenses AND bills — against
  // take-home income, with what's left after everything.
  const nowE = new Date();
  const focusM = activeMonth > 0 ? activeMonth - 1 : (activeYear === nowE.getFullYear() ? nowE.getMonth() : 11);
  const spendMonth = data.expensePayments.filter(e2 => monthIdx(e2.date) === focusM).reduce((a2, e2) => a2 + expenseAmount(e2), 0);
  let recMonth = 0;
  if (recApplies) store2.state.expenseCategories.forEach(cat => { recMonth += recurringMonthsForCategory(store2, cat.id, data.expensePayments)[focusM]; });
  const autoNetE = avgNetMonthlyIncome(store2);
  const netE = autoNetE || 0;
  const leftE = netE - spendMonth - recMonth;
  const sumE = el('div', 'sub-summary');
  const barE = (pct, tone, title) => netE > 0 ? { pct, tone, title } : null;
  sumE.appendChild(sumCard('Net monthly income', autoNetE == null ? '…' : (netE > 0 ? money(netE) : '–'), 'income', 'net pay ÷ 12 (annualized)'));
  sumE.appendChild(sumCard('Logged · ' + MONTHS[focusM], money(spendMonth), 'expense', 'one-off expenses this month', barE(netE ? spendMonth / netE * 100 : 0, 'expense', netE ? (spendMonth / netE * 100).toFixed(1) + '% of net income' : '')));
  sumE.appendChild(sumCard('Bills / mo', money(recMonth), 'expense', 'recurring estimates for ' + MONTHS[focusM] + ' (logged payments replace their estimates)', barE(netE ? recMonth / netE * 100 : 0, 'expense', netE ? (recMonth / netE * 100).toFixed(1) + '% of net income' : '')));
  if (netE > 0) sumE.appendChild(sumCard('Left after everything', money(leftE), leftE < 0 ? 'expense' : 'income', 'net income − logged − bills', barE(leftE / netE * 100, leftE < 0 ? 'expense' : 'income', (leftE / netE * 100).toFixed(1) + '% of net income left')));
  view.appendChild(sumE);

  const yt = yearTabs(store2, 'expenses'); if (yt) view.appendChild(yt);
  if (expenseTab === 'grid' && hasBills && !recApplies)
    view.appendChild(el('p', 'muted', 'Past year — showing logged expenses only. Recurring-bill estimates apply from the current year forward, so switching years changes the numbers.'));
  view.appendChild(expenseTab === 'grid' ? expenseGrid(data) : expenseList(data));
}

function expenseGrid(data) {
  const store = window.cloverStore, groups = store.state.expenseCategories;
  const entries = data.expensePayments;
  const card = el('div', 'card table-card');
  const table = el('table', 'data-table grid-table');
  // Not "YTD": this row sums every visible month, and with recurring bills switched
  // on the future months hold projected amounts. The dashboard donut is the
  // year-to-date view; this column is the full-year outlook.
  table.innerHTML = '<thead><tr><th>Category</th>' + MONTHS.map(m => '<th class="num">' + m + '</th>').join('') + '<th class="num" title="Every month in the row added up. With recurring bills shown, months that have not happened yet are estimates — so this is the full-year outlook, not the year-to-date total.">Year total</th><th class="num" title="Average per month, across the months that have amounts">Avg / mo</th></tr></thead>';
  const tb = el('tbody');
  const grand = new Array(12).fill(0);

  const monthsFor = list => { const m = new Array(12).fill(0); list.forEach(e => { const mi = monthIdx(e.date); if (mi >= 0) m[mi] += expenseAmount(e); }); return m; };
  // recMask marks the months whose amount includes a recurring-bill estimate —
  // those cells get a small ↻ next to the amount.
  const addRow = (cls, label, monthly, onClick, caret, recMask) => {
    const tr = el('tr', cls);
    const c0 = el('td', cls.includes('sub-row') ? 'sub-name' : 'grp-name');
    if (caret != null) { c0.appendChild(el('span', 'caret', caret)); c0.appendChild(document.createTextNode(' ' + label)); }
    else c0.textContent = label;
    if (onClick) { c0.style.cursor = 'pointer'; c0.addEventListener('click', onClick); }
    tr.appendChild(c0);
    const mark = td => { td.appendChild(el('span', 'rec-mark', '↻')); td.title = 'Includes recurring-bill estimate'; return td; };
    monthly.forEach((v, i) => { const td = numCell(v); if (recMask && recMask[i] && v) mark(td); tr.appendChild(td); });
    const ytdTd = numCell(monthly.reduce((a, b) => a + b, 0), true);
    if (recMask && recMask.some(Boolean)) mark(ytdTd);
    tr.appendChild(ytdTd);
    tr.appendChild(numCell(avgOf(monthly), true));
    return tr;
  };

  const recOn = expenseIncludeRecurring && recurringAppliesTo(activeYear);
  groups.forEach(g => {
    const gEntries = entries.filter(e => e.categoryId === g.id);
    const monthly = monthsFor(gEntries);
    const validSubs = new Set(g.subs.map(s => s.id));
    const recBy = recOn ? recurringMonthsBy(store, g.id, entries, validSubs) : null;
    const rec = recBy ? recBy.total : new Array(12).fill(0);
    const hasRec = rec.some(v => v > 0);
    for (let i = 0; i < 12; i++) monthly[i] += rec[i];
    monthly.forEach((v, i) => grand[i] += v);
    const open = expandedExpenseGroups.has(g.id);
    tb.appendChild(addRow('grp-row', g.name, monthly,
      () => { open ? expandedExpenseGroups.delete(g.id) : expandedExpenseGroups.add(g.id); renderView(currentRoute); },
      open ? '▾' : '▸', hasRec ? rec.map(v => v > 0) : null));
    if (open) {
      g.subs.forEach(sub => {
        const subMonths = monthsFor(gEntries.filter(e => e.subId === sub.id));
        const subRec = recBy && recBy.subs[sub.id];
        if (subRec) for (let i = 0; i < 12; i++) subMonths[i] += subRec[i];
        tb.appendChild(addRow('sub-row', sub.name, subMonths, null, null, subRec ? subRec.map(v => v > 0) : null));
      });
      const noSub = gEntries.filter(e => !e.subId || !g.subs.some(s => s.id === e.subId));
      if (noSub.length) tb.appendChild(addRow('sub-row', '(no subcategory)', monthsFor(noSub)));
      const recNone = recBy ? recBy.none : new Array(12).fill(0);
      if (recNone.some(v => v > 0)) tb.appendChild(addRow('sub-row', '↻ Recurring bills (no subcategory)', recNone, null, null, recNone.map(v => v > 0)));
      // Where the logged money actually came from — one row per source account
      // (lighter shade: these amounts are already counted in the rows above).
      if (gEntries.length) {
        const srcKey = e => store.accountName(e.accountId) || '(no account)';
        const bySrc = new Map();
        gEntries.forEach(e => { const k = srcKey(e); if (!bySrc.has(k)) bySrc.set(k, []); bySrc.get(k).push(e); });
        const keys = [...bySrc.keys()].sort((a, b) => a.localeCompare(b));
        if (keys.length > 1 || keys[0] !== '(no account)')
          keys.forEach(k => tb.appendChild(addRow('sub-row drill-row', '↳ ' + k, monthsFor(bySrc.get(k)))));
      }
    }
  });

  // Bills/expenses pointing at a category that no longer exists used to
  // vanish from this grid silently — surface them so they can be re-filed.
  const knownCats = new Set(groups.map(g => g.id));
  const orphEntries = entries.filter(e => !knownCats.has(e.categoryId));
  const orphMonths = monthsFor(orphEntries);
  const orphMask = new Array(12).fill(false);
  if (recOn) store.state.recurring.filter(isSubActive).filter(b => !knownCats.has(b.categoryId) && b.notPaidYear !== activeYear).forEach(bill => {
    const once = bill.frequency === 'once';
    const om = once ? (String(bill.renewalDate || '').slice(0, 4) === String(activeYear) ? monthIdx(bill.renewalDate) : -1) : -1;
    const me = once ? (Number(bill.amount) || 0) : monthlyEquiv(bill);
    for (let mi = 0; mi < 12; mi++) {
      if (once && mi !== om) continue;
      if (entries.some(pp => pp.recurringId === bill.id && monthIdx(pp.date) === mi)) continue;
      orphMonths[mi] += me; orphMask[mi] = true;
    }
  });
  if (orphMonths.some(v => v > 0)) {
    orphMonths.forEach((v, i) => grand[i] += v);
    const otr = addRow('grp-row', '⚠ No matching category', orphMonths, null, null, orphMask.some(Boolean) ? orphMask : null);
    otr.title = 'These bills or logged expenses point at a category that no longer exists (deleted or merged). Edit each one and re-pick its category to file it correctly.';
    tb.appendChild(otr);
  }

  const gtr = el('tr', 'total-row');
  gtr.appendChild(el('td', 'grp-name', 'Total expenses'));
  grand.forEach(v => gtr.appendChild(numCell(v)));
  gtr.appendChild(numCell(grand.reduce((a, b) => a + b, 0), true));
  gtr.appendChild(numCell(avgOf(grand), true));
  tb.appendChild(gtr);

  table.appendChild(tb); card.appendChild(table);
  return card;
}

// Clickable value bubble that narrows the expense list to that value
// (click again to clear) — same behavior as Bills and Class Actions.
function expenseFilterBadge(key, text, tone) {
  const b = badge(text, tone);
  b.style.cursor = 'pointer';
  b.title = 'Click to show only “' + text + '”';
  b.addEventListener('click', ev => {
    ev.stopPropagation();
    const cur = expenseBadgeFilter;
    expenseBadgeFilter = (cur && cur.key === key && cur.value === text) ? null : { key, value: text };
    renderView(currentRoute);
  });
  return b;
}
const EXPLIST_COL_LABELS = { date: 'Date', description: 'Description', category: 'Category', source: 'Source', account: 'Paid from', amount: 'Amount', person: 'Person', forDate: 'Applies to', checkNo: 'Check #', gallons: 'Gallons', pricePerGallon: 'Price / gallon', notes: 'Notes' };
const EXPLIST_ALL_COLS = ['date', 'description', 'category', 'source', 'account', 'amount', 'person', 'forDate', 'checkNo', 'gallons', 'pricePerGallon', 'notes'];
const EXPLIST_DEFAULT_COLS = ['date', 'description', 'category', 'source', 'account', 'amount', 'person'];
function buildExpenseListCol(store, key) {
  switch (key) {
    case 'date': return { label: 'Date', key: 'date', value: r => r.date || '', cell: r => {
        const td = el('td', null, fmtDate(r.date));
        // When the row was logged (or last edited) — the date above is the day
        // the money moved, which is often not the day you typed it in.
        const stamp = r.updatedAt || r.createdAt;
        if (stamp) {
          const edited = !!(r.updatedAt && r.createdAt && r.updatedAt !== r.createdAt);
          const t = el('div', 'acct-sub', stampText(stamp, r.date));
          t.title = (edited ? 'Last edited ' : 'Added ') + fmtDateTimeLocal(stamp);
          td.appendChild(t);
        }
        return td; } };
    case 'description': return { label: 'Description', key: 'description', value: r => r.title || '', cell: r => {
        const td = el('td', null, r.title || '—');
        if (r.vendor) td.appendChild(el('div', 'acct-sub', r.vendor));
        // The "applies to" day belongs with what it describes, not the pay date.
        if (r.forDate) { const f = el('div', 'acct-sub', 'for ' + fmtDate(r.forDate)); f.title = 'The day this charge was for'; td.appendChild(f); }
        return td; } };
    case 'category': return { label: 'Category', key: 'category', value: r => store.expenseGroupName(r.categoryId), cell: r => {
        const td = el('td'); const n = store.expenseGroupName(r.categoryId);
        if (n && n !== '—') td.appendChild(expenseFilterBadge('category', n, 'type')); else td.textContent = '—';
        return td; } };
    case 'source': return { label: 'Source', key: 'source', value: r => store.subName('expense', r.categoryId, r.subId) || '', cell: r => {
        const td = el('td'); const n = store.subName('expense', r.categoryId, r.subId);
        if (n) td.appendChild(expenseFilterBadge('source', n, '')); else td.textContent = '—';
        return td; } };
    case 'account': return { label: 'Paid from', key: 'account', value: r => store.accountName(r.accountId) || '', cell: r => {
        const td = el('td'); const n = store.accountName(r.accountId);
        if (n && n !== '—') td.appendChild(expenseFilterBadge('account', n, '')); else td.textContent = '—';
        if (r.checkNo) td.appendChild(el('div', 'acct-sub', 'Check #' + r.checkNo));
        // Transfers (savings/investment) show where the money landed.
        if (r.toAccountId) { const t = el('div', 'acct-sub', '→ ' + (store.accountName(r.toAccountId) || 'account')); t.title = 'Transferred into this account — moved, not spent'; td.appendChild(t); }
        return td; } };
    case 'amount': return { label: 'Amount', key: 'amount', num: true, value: r => expenseAmount(r), cell: r => {
        const td = numCell(expenseAmount(r), true);
        // A fill-up's total means more with the pump figures under it.
        if (r.gallons && r.pricePerGallon) {
          const g = el('div', 'acct-sub', r.gallons + ' gal @ $' + Number(r.pricePerGallon).toFixed(3));
          g.title = 'Gallons × price per gallon';
          td.appendChild(g);
        }
        return td; } };
    case 'gallons': return { label: 'Gallons', key: 'gallons', num: true, value: r => Number(r.gallons) || 0, cell: r => { const td = el('td', 'num'); td.textContent = r.gallons ? String(r.gallons) : '—'; return td; } };
    case 'pricePerGallon': return { label: 'Price / gallon', key: 'pricePerGallon', num: true, value: r => Number(r.pricePerGallon) || 0, cell: r => { const td = el('td', 'num'); td.textContent = r.pricePerGallon ? '$' + Number(r.pricePerGallon).toFixed(3) : '—'; return td; } };
    case 'person': return { label: 'Person', key: 'person', value: r => store.personName(r.personId), cell: r => {
        const td = el('td'); const n = store.personName(r.personId);
        if (n && n !== '—') td.appendChild(expenseFilterBadge('person', n, '')); else td.textContent = '—';
        return td; } };
    case 'forDate': return { label: 'Applies to', key: 'forDate', value: r => r.forDate || '', cell: r => el('td', 'muted', r.forDate ? fmtDate(r.forDate) : '—') };
    case 'checkNo': return { label: 'Check #', key: 'checkNo', value: r => r.checkNo || '', cell: r => el('td', 'mono-sm', r.checkNo || '—') };
    case 'notes': return { label: 'Notes', key: 'notes', value: r => r.notes || '', cell: r => { const td = el('td', 'muted'); td.textContent = firstLine(r.notes) || '—'; if (r.notes) td.title = r.notes; return td; } };
  }
  return null;
}
// Everything about a payment that a text search should match — description,
// vendor (e.g. "Supercuts"), notes, category/source, account, person, check #,
// and the amount both formatted and raw.
function expenseSearchHay(store, r) {
  return [
    r.title, r.vendor, r.notes,
    store.expenseGroupName(r.categoryId), store.subName('expense', r.categoryId, r.subId),
    store.accountName(r.accountId), store.accountName(r.toAccountId), store.personName(r.personId),
    r.checkNo, money(expenseAmount(r)), String(expenseAmount(r))
  ].filter(v => v && v !== '—').join('  ').toLowerCase();
}
function expenseList(data) {
  const store = window.cloverStore;
  const q = expenseSearch.trim().toLowerCase();
  let rows = data.expensePayments.slice();
  // While searching, span the whole year (ignore the month filter) so "when did I
  // last spend at X" isn't hidden by the current month selection.
  if (!q && activeMonth > 0) rows = rows.filter(e => monthIdx(e.date) === activeMonth - 1);
  if (expenseCatFilter !== 'all') rows = rows.filter(e => e.categoryId === expenseCatFilter);
  if (expenseBadgeFilter) {
    const f = expenseBadgeFilter;
    const valOf = r => f.key === 'category' ? store.expenseGroupName(r.categoryId)
      : f.key === 'source' ? (store.subName('expense', r.categoryId, r.subId) || '')
      : f.key === 'account' ? (store.accountName(r.accountId) || '')
      : f.key === 'person' ? store.personName(r.personId) : '';
    rows = rows.filter(r => valOf(r) === f.value);
  }
  if (q) rows = rows.filter(r => expenseSearchHay(store, r).includes(q));

  const wrap = el('div');
  const bar = el('div', 'filter-bar');
  const catSel = select([{ value: 'all', label: 'All categories' }].concat(store.state.expenseCategories.map(c => ({ value: c.id, label: c.name }))), expenseCatFilter);
  catSel.addEventListener('change', () => { expenseCatFilter = catSel.value; renderView(currentRoute); });
  bar.appendChild(labelWrap('Category', catSel));
  const searchIn = input(expenseSearch, { placeholder: 'Search vendor, description, notes…' });
  searchIn.id = 'expense-search'; searchIn.type = 'search';
  searchIn.addEventListener('input', () => {
    expenseSearch = searchIn.value; renderView(currentRoute);
    const n = document.getElementById('expense-search'); if (n) { n.focus(); const L = n.value.length; try { n.setSelectionRange(L, L); } catch (e) {} }
  });
  bar.appendChild(labelWrap('Search', searchIn));
  bar.appendChild(el('div', 'muted', rows.length + ' shown' + (q ? ' · matching “' + expenseSearch.trim() + '” in ' + activeYear + (activeMonth > 0 ? ' (all months)' : '') : (activeMonth > 0 ? ' · ' + MONTHS[activeMonth - 1] : ''))));
  const colsBtn = columnsButton('expenseList', EXPLIST_ALL_COLS, EXPLIST_DEFAULT_COLS, EXPLIST_COL_LABELS, 'Expense list columns');
  colsBtn.style.marginLeft = 'auto';
  bar.appendChild(colsBtn);
  wrap.appendChild(bar);

  if (expenseBadgeFilter) {
    // Chip joins the filter row, before the right-aligned ⚙ Columns.
    const f = expenseBadgeFilter;
    const info = el('span', 'muted', 'Showing ' + rows.length + ' where ' + (EXPLIST_COL_LABELS[f.key] || f.key) + ' = “' + f.value + '”');
    const clear = el('button', 'btn-ghost', '✕ Clear filter');
    clear.addEventListener('click', () => { expenseBadgeFilter = null; renderView(currentRoute); });
    bar.insertBefore(info, colsBtn); bar.insertBefore(clear, colsBtn);
  }

  if (!rows.length) {
    if (q) {
      const es = emptyState('No matches', 'Nothing in ' + activeYear + ' matches “' + expenseSearch.trim() + '”. Searches the selected year — check a different year up top if it was earlier.', '✕ Clear search', () => { expenseSearch = ''; renderView(currentRoute); });
      wrap.appendChild(es);
    } else {
      wrap.appendChild(emptyState('No expenses logged', 'Add one-off or actual expenses for ' + activeYear + (activeMonth > 0 ? ' / ' + MONTHS[activeMonth - 1] : '') + '. (Recurring bills live on the Bills & Subscriptions page.)', '+ Add expense', () => expenseModal(null)));
    }
    return wrap;
  }

  const cols = [
    ...tableColKeys(store, 'expenseList', EXPLIST_COL_LABELS, EXPLIST_DEFAULT_COLS).map(k => buildExpenseListCol(store, k)).filter(Boolean),
    { label: '', sortable: false, cell: e => {
        const act = el('td', 'row-actions');
        const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => expenseModal(e));
        const dup = el('button', 'icon-btn', 'Duplicate');
        dup.title = 'Start a new expense prefilled from this one (date set to today)';
        dup.addEventListener('click', () => { const pre = Object.assign({}, e); delete pre.id; pre.date = todayISO(); expenseModal(pre); });
        const conv = el('button', 'icon-btn', 'Convert'); conv.title = 'Turn this into a recurring bill or a budget placeholder'; conv.addEventListener('click', () => convertModal('expense', e));
        const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove(fmtDate(e.date) + ' · ' + store.expenseGroupName(e.categoryId), () => store.removeExpense(activeYear, e.id)));
        act.appendChild(edit); act.appendChild(dup); act.appendChild(conv); act.appendChild(del); return act; } }
  ];
  const card = el('div', 'card table-card');
  card.appendChild(sortableTable(cols, rows, expenseListSort, ns => { expenseListSort = ns || { key: 'date', dir: 'desc' }; renderView(currentRoute); }, null));
  wrap.appendChild(card);
  return wrap;
}

function expenseModal(existing) {
  const store = window.cloverStore, s = store.state;
  const e = existing ? Object.assign({}, existing) : { date: todayISO(), personId: s.persons[0] && s.persons[0].id };
  const body = el('div', 'form-grid');

  const fDate = input(e.date || todayISO(), { type: 'date' });
  const recActive = s.recurring.filter(isSubActive).slice().sort((a, b) => a.name.localeCompare(b.name));
  const fBill = select([{ value: '', label: '— None (one-off expense) —' }].concat(recActive.map(r => ({ value: r.id, label: r.name }))), e.recurringId || '');
  const fCat = select([{ value: '', label: '— Select —' }].concat(s.expenseCategories.map(c => ({ value: c.id, label: c.name }))), e.categoryId || '');
  const fSub = select([{ value: '', label: '—' }], e.subId || '');
  const rebuildSubs = () => { const g = s.expenseCategories.find(c => c.id === fCat.value); const opts = [{ value: '', label: '—' }].concat((g ? g.subs : []).map(x => ({ value: x.id, label: x.name }))); fSub.innerHTML = ''; opts.forEach(o => { const op = el('option'); op.value = o.value; op.textContent = o.label; fSub.appendChild(op); }); if (e.subId) fSub.value = e.subId; };
  fBill.addEventListener('change', () => {
    const bill = s.recurring.find(r => r.id === fBill.value);
    if (bill) { fCat.value = bill.categoryId || ''; rebuildSubs(); if (bill.subId) fSub.value = bill.subId; }
  });
  const fAcct = accountSelect(s, e.accountId || '');
  const fToAcct = accountSelect(s, e.toAccountId || '', '— Select account —');
  const fPerson = select(s.persons.map(p => ({ value: p.id, label: p.name })), e.personId || (s.persons[0] && s.persons[0].id));
  const fAmount = moneyInput(e.amount);
  const fTitle = input(e.title || '', { placeholder: 'e.g. Parking — Main St Garage' });
  const fVendor = input(e.vendor || '', { placeholder: 'e.g. SpotHero' });
  const fForDate = input(e.forDate || '', { type: 'date' });
  // input() only forwards type/placeholder/list, so step + inputMode go on directly.
  const fGallons = input(e.gallons != null && e.gallons !== '' ? e.gallons : '', { type: 'number', placeholder: 'e.g. 12.4' });
  fGallons.step = '0.001'; fGallons.inputMode = 'decimal';
  const fPpg = moneyInput(e.pricePerGallon, { placeholder: 'e.g. 3.499' }, 3);
  const fNotes = document.createElement('textarea'); fNotes.value = e.notes || ''; fNotes.rows = 2; fNotes.placeholder = 'Optional';

  body.appendChild(field('Date paid', fDate, 'The day the money actually left your account — e.g. Jul 15. The expense counts toward that month.'));
  const billField = recActive.length ? field('Linked bill (optional)', fBill, 'Only if this expense IS the payment for one of your recurring bills — e.g. your ComEd bill estimates $120/mo and the real July bill was $138.42, so you log $138.42 and link it to ComEd. That replaces the estimate for July so it isn’t counted twice. Leave as “None” for a normal expense.') : null;
  if (billField) body.appendChild(billField);
  const dvRow = el('div', 'two-col');
  const descField = field('Description', fTitle, 'A short label so you recognize it later — e.g. “Parking — Main St Garage”, “Weekly groceries”, “New running shoes”.');
  const vendorField = field('Vendor', fVendor, 'Who you paid — e.g. SpotHero, Jewel-Osco, ComEd, Amazon.');
  dvRow.appendChild(descField); dvRow.appendChild(vendorField);
  body.appendChild(dvRow);
  body.appendChild(field('Category', fCat, 'The broad type of expense — e.g. Food, Auto, Housing, Savings & Investments. Manage the list in Settings.'));
  const SUB_HINT = 'A more specific grouping inside the category, so your annual grid breaks the category into rows — e.g. Food → Groceries vs Dining Out; Auto → Fuel vs Parking & Tolls. Optional.';
  const SUB_HINT_TRANSFER = 'What the money is FOR, so your grid shows retirement vs taxable investing vs cash savings as separate rows — e.g. $300 into a brokerage → Brokerage; $500 into a Roth → Retirement / IRA; $200 into a rainy-day account → Emergency Fund. It follows the “Moved to” account automatically — change it when the purpose differs, e.g. a plain savings account you actually use as your Emergency Fund.';
  const subField = field('Subcategory', fSub, SUB_HINT);
  body.appendChild(subField);
  const subLbl = subField.querySelector('span').childNodes[0];
  // Parking/toll expenses are often paid on a different day than they apply
  // to — the field label follows the picked category/subcategory.
  const forField = field('Applies to (day)', fForDate, 'The day this charge was actually FOR — e.g. paid today for next week’s parking, or a toll issued last month. Date paid stays the day the money left.');
  body.appendChild(forField);
  const forLbl = forField.querySelector('span').childNodes[0];
  const syncForDate = () => {
    const names = ((s.expenseCategories.find(c => c.id === fCat.value) || {}).name || '') + ' ' + (store.subName('expense', fCat.value, fSub.value) || '');
    const park = /park/i.test(names), toll = /toll/i.test(names);
    forField.style.display = (park || toll || e.forDate) ? '' : 'none';
    forLbl.nodeValue = toll && !park ? 'Toll issued day' : park ? 'Parking day' : 'Applies to (day)';
  };
  const ACCT_HINT = 'The account or card the money came OUT of — e.g. Chase Checking, or Amex ••1234 if you put it on a card.';
  const ACCT_HINT_TRANSFER = 'The account the money came OUT of — e.g. the checking account your paycheck was deposited into.';
  const acctField = field('Paid from', fAcct, ACCT_HINT);
  body.appendChild(acctField);
  // Savings/investment contributions are TRANSFERS: the money isn't spent, it
  // moved to another of your accounts. Capture where it went so it's traceable.
  const toField = field('Moved to', fToAcct, 'Which of your accounts the money went INTO — e.g. Fidelity Brokerage, Vanguard Roth IRA, Ally Savings. This is a transfer: it leaves your spendable pool (so it counts toward the month), but the money is still yours. Picking it also fills in the type and description below.');
  body.appendChild(toField);
  const acctLbl = acctField.querySelector('span').childNodes[0];
  // Fuel fill-ups: gallons x price is worth keeping so you can see what you
  // actually paid per gallon over time, not just the total.
  //
  // The category and subcategory are tested SEPARATELY on purpose. Concatenating
  // their names (the way syncForDate does) would misfire twice over: "Utility ->
  // Gas" is natural gas billed in therms, and "Insurance -> Auto" / "Loan -> Auto"
  // are cars but not fuel. Requiring an auto-ish category AND a fuel-ish
  // subcategory is what keeps both out.
  const isFuelCat = () => {
    const cat = (s.expenseCategories.find(c => c.id === fCat.value) || {}).name || '';
    const sub = store.subName('expense', fCat.value, fSub.value) || '';
    return /auto|vehicle|\bcar\b|truck|motor/i.test(cat) && /fuel|gas|diesel|petrol|charg/i.test(sub);
  };
  const fuelRow = el('div', 'two-col');
  const galField = field('Gallons', fGallons, 'How much fuel went in — e.g. 12.4. Use the pump’s figure; it’s usually to three decimals.');
  const ppgField = field('Price / gallon', fPpg, 'The pump price — e.g. 3.499. Tenths of a cent are kept, so this ties out to your receipt instead of rounding to $3.50.');
  fuelRow.appendChild(galField); fuelRow.appendChild(ppgField);
  const fuelNote = el('div', 'sum-hint');
  // Filling both answers the Amount for you — but only when Amount is still
  // blank. Silently rewriting a total you typed would be wrong: the receipt is
  // the authority, and a fill-up often has a car wash or a discount on it.
  const syncFuel = () => {
    const on = isFuelCat() || e.gallons || e.pricePerGallon;
    fuelRow.style.display = on ? '' : 'none';
    fuelNote.style.display = on ? '' : 'none';
    if (!on) return;
    const g = parseFloat(fGallons.value), p = parseFloat(fPpg.value);
    if (isNaN(g) || isNaN(p) || g <= 0 || p <= 0) { fuelNote.textContent = 'Enter both and the Amount fills itself in.'; return; }
    const calc = g * p;
    if (!fAmount.value.trim()) { fAmount.value = calc.toFixed(2); fuelNote.textContent = 'Amount set to ' + money(calc) + ' (' + g + ' gal × $' + p.toFixed(3) + ').'; return; }
    const amt = parseFloat(fAmount.value);
    // Pump math rounds to the cent, so allow a couple of cents before saying anything.
    if (!isNaN(amt) && Math.abs(amt - calc) > 0.02) {
      fuelNote.textContent = g + ' gal × $' + p.toFixed(3) + ' is ' + money(calc) + ', but the Amount says ' + money(amt) + '. That’s fine if the receipt included something else (a car wash, a discount) — otherwise check the figures.';
    } else {
      fuelNote.textContent = g + ' gal × $' + p.toFixed(3) + ' = ' + money(calc) + ', which matches the Amount.';
    }
  };
  fGallons.addEventListener('input', syncFuel);
  fPpg.addEventListener('input', syncFuel);
  const isTransferCat = () => {
    const names = ((s.expenseCategories.find(c => c.id === fCat.value) || {}).name || '') + ' ' + (store.subName('expense', fCat.value, fSub.value) || '');
    return /saving|invest/i.test(names) && !/fee/i.test(names);
  };
  // A transfer has no merchant and isn't a bill payment — hide the fields that
  // don't apply, and word the rest for moving money instead of spending it.
  const syncTransfer = () => {
    const t = isTransferCat();
    toField.style.display = (t || e.toAccountId) ? '' : 'none';
    acctLbl.nodeValue = t ? 'Moved from' : 'Paid from';
    vendorField.style.display = t ? 'none' : '';
    if (billField) billField.style.display = (t && !fBill.value) ? 'none' : '';
    subLbl.nodeValue = t ? 'What it’s for' : 'Subcategory';
    fTitle.placeholder = t ? 'auto-filled from “Moved to”' : 'e.g. Parking — Main St Garage';
    // The same fields mean different things for a transfer — so do their hints.
    setFieldHint(subField, t ? SUB_HINT_TRANSFER : SUB_HINT);
    setFieldHint(acctField, t ? ACCT_HINT_TRANSFER : ACCT_HINT);
    setFieldHint(amountField, t ? AMT_HINT_TRANSFER : AMT_HINT);
  };
  // Picking the destination answers the fiddly questions: the subcategory follows
  // the account's type, and the description writes itself.
  const SUB_BY_ACCT_TYPE = { 'Brokerage': 'Brokerage', 'Retirement': 'Retirement / IRA', 'Savings': 'Other savings', 'Money Market': 'Other savings', 'CD': 'Other savings', 'Cash / Sweep': 'Other savings' };
  fToAcct.addEventListener('change', () => {
    const acct = store.account(fToAcct.value);
    if (!acct || !isTransferCat()) return;
    if (!fSub.value) {
      const want = SUB_BY_ACCT_TYPE[acct.type];
      const g = s.expenseCategories.find(c => c.id === fCat.value);
      const sub = want && g && (g.subs || []).find(x => (x.name || '').toLowerCase() === want.toLowerCase());
      if (sub) fSub.value = sub.id;
    }
    if (!fTitle.value.trim()) fTitle.value = 'Transfer to ' + acct.name;
    syncForDate(); syncTransfer();
  });
  fSub.addEventListener('change', () => { syncForDate(); syncTransfer(); syncFuel(); });
  body.appendChild(field('Person', fPerson, 'Who this expense belongs to — you, joint, or another person you track.'));
  const AMT_HINT = 'How much you paid — e.g. 42.80 for a $42.80 grocery run.';
  const AMT_HINT_TRANSFER = 'How much you moved — e.g. 300 for a $300 transfer into investments.';
  const amountField = field('Amount', fAmount, AMT_HINT);
  body.appendChild(amountField);
  body.appendChild(fuelRow);
  body.appendChild(fuelNote);
  fAmount.addEventListener('input', syncFuel);
  const fExpCheckNo = input(e.checkNo || '', { placeholder: 'optional' });
  body.appendChild(field('Check # (optional)', fExpCheckNo, 'If you paid by paper check, the check number — e.g. 1042. Handy for tracing it later.'));
  body.appendChild(field('Notes', fNotes, 'Anything else worth remembering — e.g. “split with a friend”, “reimbursable”, “promo price ends in March”.'));
  rebuildSubs(); syncForDate(); syncTransfer(); syncFuel();
  fCat.addEventListener('change', () => { rebuildSubs(); syncForDate(); syncTransfer(); syncFuel(); });

  const isEdit = !!(existing && existing.id);
  openModal({
    title: isEdit ? 'Edit expense' : 'Add expense', body: withHistoryTab(body, existing), confirmLabel: 'Save',
    onConfirm: () => {
      if (!fCat.value) { toast('Pick a category', 'warn'); fCat.focus(); return false; }
      const amount = parseFloat(fAmount.value);
      if (isNaN(amount)) { toast('Amount is required', 'warn'); fAmount.focus(); return false; }
      // Recategorizing away from fuel drops the pump figures rather than leaving
      // gallons hanging on, say, a grocery run.
      const fuelOn = isFuelCat();
      const entry = Object.assign(e, {
        date: fDate.value || todayISO(), title: fTitle.value.trim(), vendor: fVendor.value.trim(),
        forDate: fForDate.value || '', categoryId: fCat.value, subId: fSub.value || '',
        accountId: fAcct.value || '', toAccountId: isTransferCat() ? (fToAcct.value || '') : '',
        personId: fPerson.value, amount, checkNo: fExpCheckNo.value.trim(), notes: fNotes.value.trim(),
        recurringId: fBill.value || '',
        gallons: fuelOn ? (parseFloat(fGallons.value) || '') : '',
        pricePerGallon: fuelOn ? (parseFloat(fPpg.value) || '') : ''
      });
      store.saveExpense(activeYear, entry);
      toast(isEdit ? 'Expense updated' : 'Expense added');
    }
  });
}

// ============================================================
// Paychecks — Phase 4 (source of truth for wages)
// ============================================================
const PAYCHECK_STATUSES = ['Received', 'Expected', 'Late', 'Missing', 'Bounced/Returned', 'Manual deposit'];
const PAYCHECK_METHODS = ['Direct deposit', 'Check', 'Office pickup', 'Other'];
const PAYCHECK_KINDS = ['Regular', 'Bonus', 'Reimbursement', 'Adjustment', 'Other one-time'];
// Dropdown options from a Settings-managed catalog list (falls back to the
// built-ins for pre-migration data); `current` is kept selectable even if it
// was removed from the list.
function catalogOptions(s, kind, fallback, current) {
  let names = ((s.catalog && s.catalog[kind]) || []).map(x => x.name).filter(Boolean);
  if (!names.length) names = fallback.slice();
  if (current && !names.includes(current)) names.push(current);
  return names;
}
// Common gross-to-net line items for the pay-stub sample (generic names — state
// withholding varies by state, so it's just "State Withholding").
const DEDUCTION_SUGGESTIONS = ['Federal Withholding', 'Social Security Employee', 'Medicare Employee', 'Medicare Employee Addl Tax', 'State Withholding', '401(k)', 'Roth 401(k)', 'Health Insurance', 'Dental Insurance', 'Vision Insurance', 'HSA', 'FSA', 'Life Insurance', 'Garnishment'];
const PAY_FREQUENCIES = [
  { key: 'weekly', label: 'Weekly (52 / yr)' },
  { key: 'biweekly', label: 'Biweekly (26 / yr)' },
  { key: 'semimonthly', label: 'Semimonthly (24 / yr)' },
  { key: 'monthly', label: 'Monthly (12 / yr)' }
];
function payFreqLabel(key) { const f = PAY_FREQUENCIES.find(x => x.key === key); return f ? f.label : (key || '—'); }

// ---- Pay-schedule engine: expected pay dates, missing detection, period #s ----
function parseISODate(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function isoOfDate(d) { const p = k => String(k).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function daysBetweenISO(a, b) { const da = parseISODate(a), db = parseISODate(b); if (!da || !db) return 1e9; return Math.round((da - db) / 86400000); }
// Calendar-day math (DST-safe — stays at local midnight, unlike adding raw ms which
// drifts a Friday to Thursday 11pm across a spring-forward boundary).
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

// All expected pay dates for a schedule within a calendar year, ordered, with a
// period number (ordinal within the year) and the pay-period start/end.
function expectedPayPeriods(sch, year) {
  const anchor = parseISODate(sch.anchorDate); if (!anchor) return [];
  const jan1 = new Date(year, 0, 1), dec31 = new Date(year, 11, 31);
  const out = [];
  if (sch.frequency === 'weekly' || sch.frequency === 'biweekly') {
    const step = sch.frequency === 'weekly' ? 7 : 14;
    // If the year's actual first pay date is known, anchor THIS year's schedule
    // exactly there — period #1 = that check, and the whole year stays aligned
    // even if the rhythm shifted from a prior year's anchor.
    const yfp = parseISODate(sch.yearFirstPay);
    let d;
    if (yfp && yfp.getFullYear() === year) d = yfp;
    else {
      d = anchor;                                     // keep the anchor's weekday
      while (d > jan1) d = addDays(d, -step);
      while (d < jan1) d = addDays(d, step);
    }
    for (; d <= dec31; d = addDays(d, step)) {
      out.push({ payDate: isoOfDate(d), periodStart: isoOfDate(addDays(d, -step)), periodEnd: isoOfDate(addDays(d, -1)) });
    }
  } else if (sch.frequency === 'monthly') {
    const day = anchor.getDate();
    for (let mo = 0; mo < 12; mo++) {
      const dim = new Date(year, mo + 1, 0).getDate();
      out.push({ payDate: isoOfDate(new Date(year, mo, Math.min(day, dim))), periodStart: isoOfDate(new Date(year, mo, 1)), periodEnd: isoOfDate(new Date(year, mo + 1, 0)) });
    }
  } else if (sch.frequency === 'semimonthly') {
    const d1 = anchor.getDate(), d2 = Number(sch.day2) || 0;   // day2 = 0 -> last day
    for (let mo = 0; mo < 12; mo++) {
      const dim = new Date(year, mo + 1, 0).getDate();
      [...new Set([Math.min(d1, dim), d2 ? Math.min(d2, dim) : dim].sort((a, b) => a - b))].forEach(dd => {
        out.push({ payDate: isoOfDate(new Date(year, mo, dd)), periodStart: isoOfDate(new Date(year, mo, 1)), periodEnd: isoOfDate(new Date(year, mo + 1, 0)) });
      });
    }
  }
  out.sort((a, b) => a.payDate.localeCompare(b.payDate));
  out.forEach((o, i) => o.periodNum = i + 1);
  return out;
}
function activeSchedules(store) { return (store.state.paySchedules || []).filter(sch => sch.active !== false && sch.anchorDate && sch.frequency); }
function scheduleForPaycheck(store, p) {
  if (!p.employer) return null;
  return activeSchedules(store).find(sch => sch.employer && sch.employer.toLowerCase() === p.employer.toLowerCase()) || null;
}
// The pay-period info a schedule implies for a recorded paycheck's date (so the
// period # is never blank even if it wasn't entered). Null if no match within 4d.
function derivedPeriod(store, p) {
  const sch = scheduleForPaycheck(store, p); if (!sch || !p.payDate) return null;
  const periods = expectedPayPeriods(sch, yearOfPaycheck(p));
  let best = null, bestDiff = 1e9;
  periods.forEach(per => { const diff = Math.abs(daysBetweenISO(per.payDate, p.payDate)); if (diff < bestDiff) { bestDiff = diff; best = per; } });
  return best && bestDiff <= 4 ? best : null;
}
function paycheckPeriodNum(store, p) { return p.periodNum || (derivedPeriod(store, p) || {}).periodNum || null; }
// Expected pay dates (past/today) for the year that have no recorded paycheck.
function missingExpectedPaychecks(store, year, recorded) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out = [];
  activeSchedules(store).forEach(sch => {
    expectedPayPeriods(sch, year).forEach(per => {
      const pd = parseISODate(per.payDate); if (!pd || pd > today) return;
      const has = recorded.some(p => p.employer && p.employer.toLowerCase() === sch.employer.toLowerCase() && Math.abs(daysBetweenISO(p.payDate, per.payDate)) <= 4);
      if (!has) out.push({ sch, per });
    });
  });
  return out.sort((a, b) => b.per.payDate.localeCompare(a.per.payDate));
}
// A display-only "expected" paycheck row synthesised from a schedule + period.
function syntheticPaycheck(sch, per, status) {
  return {
    id: '__exp_' + sch.id + '_' + per.payDate, __expected: true,
    payDate: per.payDate, receivedDate: '', gross: sch.gross, net: sch.net,
    employer: sch.employer, incomeCategoryId: sch.incomeCategoryId, personId: sch.personId,
    periodNum: per.periodNum, periodStart: per.periodStart, periodEnd: per.periodEnd,
    method: '', status: status
  };
}
// Synthetic rows for the table: kind 'missing' (past, unrecorded) or 'upcoming' (future).
function expectedRows(store, year, recorded, kind) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out = [];
  activeSchedules(store).forEach(sch => {
    expectedPayPeriods(sch, year).forEach(per => {
      const pd = parseISODate(per.payDate); if (!pd) return;
      const past = pd <= today;
      if (kind === 'missing' && !past) return;
      if (kind === 'upcoming' && past) return;
      if (kind === 'missing' && recorded.some(p => p.employer && sch.employer && p.employer.toLowerCase() === sch.employer.toLowerCase() && Math.abs(daysBetweenISO(p.payDate, per.payDate)) <= 4)) return;
      out.push(syntheticPaycheck(sch, per, kind === 'missing' ? 'Missing' : 'Expected'));
    });
  });
  return out;
}

// ---- Customizable paycheck-table columns (show/hide/reorder) ----
const PAYCHECK_COL_LABELS = {
  payDate: 'Pay date', received: 'Received', timing: 'Timing', period: 'Period #',
  periodStart: 'Period start', periodEnd: 'Period end', gross: 'Gross', net: 'Net',
  employer: 'Employer', person: 'Person', status: 'Status', method: 'Method', checkNo: 'Check #', notes: 'Notes'
};
const PAYCHECK_ALL_COLS = ['payDate', 'received', 'timing', 'period', 'periodStart', 'periodEnd', 'gross', 'net', 'employer', 'person', 'status', 'method', 'checkNo', 'notes'];
const PAYCHECK_DEFAULT_COLS = ['payDate', 'received', 'timing', 'gross', 'net', 'employer', 'person', 'period', 'status', 'method'];
// ---- Generic table-column customization (show/hide/reorder), saved per table ----
function tableColKeys(store, tableKey, labels, defaults) {
  let saved = (store.state.settings.tableCols || {})[tableKey];
  if (tableKey === 'paychecks' && !(Array.isArray(saved) && saved.length)) saved = store.state.settings.paycheckCols;   // legacy home
  const keys = (Array.isArray(saved) && saved.length) ? saved.filter(k => labels[k]) : defaults.slice();
  return keys.length ? keys : defaults.slice();
}
function tableColumnsModal(tableKey, allCols, defaults, labels, title) {
  const store = window.cloverStore;
  const body = el('div');
  body.appendChild(el('p', 'muted', 'Check the columns to show, and use ↑ / ↓ to reorder them.'));
  const listWrap = el('div', 'col-config');
  const cur = () => tableColKeys(store, tableKey, labels, defaults);
  const setCols = arr => store.setTableCols(tableKey, arr);
  const move = (k, dir) => { const v = cur().slice(); const j = v.indexOf(k); const t = j + dir; if (t < 0 || t >= v.length) return; const tmp = v[t]; v[t] = v[j]; v[j] = tmp; setCols(v); render(); };
  const colRow = (k, isVisible, idx, total) => {
    const row = el('div', 'col-row');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = isVisible;
    cb.addEventListener('change', () => {
      let v = cur().slice();
      if (cb.checked) { if (!v.includes(k)) v.push(k); } else { v = v.filter(x => x !== k); if (!v.length) v = [allCols[0]]; }
      setCols(v); render();
    });
    row.appendChild(cb);
    row.appendChild(el('span', 'col-label', labels[k]));
    if (isVisible) {
      const acts = el('div', 'col-acts');
      const up = el('button', 'icon-btn', '↑'); up.disabled = idx === 0; up.addEventListener('click', () => move(k, -1));
      const down = el('button', 'icon-btn', '↓'); down.disabled = idx === total - 1; down.addEventListener('click', () => move(k, 1));
      acts.appendChild(up); acts.appendChild(down); row.appendChild(acts);
    }
    return row;
  };
  const render = () => {
    listWrap.innerHTML = '';
    const visible = cur();
    const hidden = allCols.filter(k => !visible.includes(k));
    visible.forEach((k, i) => listWrap.appendChild(colRow(k, true, i, visible.length)));
    if (hidden.length) {
      listWrap.appendChild(el('div', 'col-sep', 'Hidden'));
      hidden.forEach(k => listWrap.appendChild(colRow(k, false)));
    }
  };
  render();
  body.appendChild(listWrap);
  const reset = el('button', 'btn-ghost', 'Reset to default');
  reset.addEventListener('click', () => { setCols(null); if (tableKey === 'paychecks') store.setPaycheckCols(null); render(); });
  body.appendChild(reset);
  openModal({ title: title || 'Columns', body, confirmLabel: 'Done', onConfirm: () => {} });
}
function columnsButton(tableKey, allCols, defaults, labels, title) {
  const b = el('button', 'btn-ghost', '⚙ Columns');
  b.addEventListener('click', () => tableColumnsModal(tableKey, allCols, defaults, labels, title));
  return b;
}
function paycheckColKeys(store) { return tableColKeys(store, 'paychecks', PAYCHECK_COL_LABELS, PAYCHECK_DEFAULT_COLS); }
// Right-aligned toolbar rendered directly above a table (columns manager, etc.).
function tableTools() { const bar = el('div', 'table-tools'); [...arguments].forEach(b => bar.appendChild(b)); return bar; }
// Build a sortableTable column def for a given paycheck column key.
function buildPaycheckCol(store, key) {
  switch (key) {
    case 'payDate': return { label: 'Pay date', key: 'payDate', value: p => p.payDate || '', cell: p => el('td', null, fmtDate(p.payDate)) };
    case 'received': return { label: 'Received', key: 'received', value: p => p.receivedDate || '', cell: p => el('td', null, p.receivedDate ? fmtDate(p.receivedDate) : '—') };
    case 'timing': return { label: 'Timing', key: 'timing', value: p => { if (p.__expected) { const du = daysUntil(p.payDate); return du == null ? 100000 : 100000 - du; } const d = paycheckDaysLate(p); return d == null ? 100000 : d; }, cell: p => {
        const td = el('td');
        if (p.__expected) { const du = daysUntil(p.payDate); if (du != null && du >= 0) td.appendChild(badge('in ' + du + 'd', du <= 7 ? 'amber' : '')); else td.textContent = '—'; return td; }
        const b = daysLateBadge(p); if (b) td.appendChild(b); else td.textContent = '—'; return td; } };
    case 'period': return { label: 'Period #', key: 'period', num: true, value: p => paycheckPeriodNum(store, p) || 0, cell: p => {
        const td = el('td', 'num');
        if (p.periodNum) { td.textContent = '#' + p.periodNum; }
        else { const dp = derivedPeriod(store, p); if (dp) { td.textContent = '#' + dp.periodNum; td.classList.add('muted'); td.title = 'From your pay schedule'; } else td.textContent = '—'; }
        if (p.periodStart || p.periodEnd) td.title = fmtDate(p.periodStart) + ' – ' + fmtDate(p.periodEnd); return td; } };
    case 'periodStart': return { label: 'Period start', key: 'periodStart', value: p => p.periodStart || '', cell: p => el('td', null, p.periodStart ? fmtDate(p.periodStart) : '—') };
    case 'periodEnd': return { label: 'Period end', key: 'periodEnd', value: p => p.periodEnd || '', cell: p => el('td', null, p.periodEnd ? fmtDate(p.periodEnd) : '—') };
    case 'gross': return { label: 'Gross', key: 'gross', num: true, value: p => Number(p.gross) || 0, cell: p => numCell(Number(p.gross) || 0, true) };
    case 'net': return { label: 'Net', key: 'net', num: true, value: p => Number(p.net) || 0, cell: p => numCell(Number(p.net) || 0) };
    case 'employer': return { label: 'Employer', key: 'employer', value: p => p.employer || '', cell: p => {
        const td = el('td'); td.appendChild(el('div', 'acct-name', p.employer || '—'));
        const cat = store.incomeGroupName(p.incomeCategoryId); if (cat && cat !== '—') td.appendChild(el('div', 'acct-sub', cat));
        return td; } };
    case 'person': return { label: 'Person', key: 'person', value: p => store.personName(p.personId), cell: p => el('td', null, store.personName(p.personId)) };
    case 'status': return { label: 'Status', key: 'status', value: p => p.status || 'Received', cell: p => {
        const td = el('td'); const st = p.status || 'Received';
        const tone = st === 'Received' || st === 'Manual deposit' ? 'green' : (st === 'Late' || st === 'Missing' || st === 'Bounced/Returned') ? 'red' : 'amber';
        td.appendChild(badge(st, tone));
        if (p.checkType && p.checkType !== 'Regular') { td.appendChild(document.createTextNode(' ')); td.appendChild(badge(p.checkType, 'type')); }
        return td; } };
    case 'method': return { label: 'Method', key: 'method', value: p => p.method || '', cell: p => el('td', 'muted', p.method || '—') };
    case 'checkNo': return { label: 'Check #', key: 'checkNo', value: p => p.checkNo || '', cell: p => el('td', 'muted', p.checkNo || '—') };
    case 'notes': return { label: 'Notes', key: 'notes', value: p => p.notes || '', cell: p => { const td = el('td', 'muted'); td.textContent = p.notes || '—'; return td; } };
  }
  return null;
}
function paycheckColumnsModal() { tableColumnsModal('paychecks', PAYCHECK_ALL_COLS, PAYCHECK_DEFAULT_COLS, PAYCHECK_COL_LABELS, 'Paycheck columns'); }

function isPaycheckPaid(p) { return !!p.receivedDate && p.status !== 'Bounced/Returned' && p.status !== 'Missing'; }
function yearOfPaycheck(p) { const m = /^(\d{4})/.exec((p && p.payDate) || ''); return m ? +m[1] : activeYear; }
function paycheckDaysLate(p) {
  if (!p.payDate || !p.receivedDate) return null;
  const pm = /^(\d{4})-(\d{2})-(\d{2})/.exec(p.payDate), rm = /^(\d{4})-(\d{2})-(\d{2})/.exec(p.receivedDate);
  if (!pm || !rm) return null;
  const pd = new Date(+pm[1], +pm[2] - 1, +pm[3]), rd = new Date(+rm[1], +rm[2] - 1, +rm[3]);
  return Math.round((rd - pd) / 86400000);
}
// Monthly gross for PAID paychecks mapped to a given income category (by pay-date month).
function paycheckMonthsFor(paychecks, incomeCatId, useNet) {
  const m = new Array(12).fill(0);
  (paychecks || []).forEach(p => {
    if (!isPaycheckPaid(p)) return;
    if ((p.incomeCategoryId || '') !== incomeCatId) return;
    const mi = monthIdx(p.payDate); if (mi >= 0) m[mi] += useNet ? paycheckNet(p) : (Number(p.gross) || 0);
  });
  return m;
}
function daysLateBadge(p) {
  const d = paycheckDaysLate(p);
  if (d == null) return null;
  if (d > 0) return badge(d + 'd late', d > 5 ? 'red' : 'amber');
  if (d < 0) return badge(Math.abs(d) + 'd early', 'green');
  return badge('on time', 'green');
}

function renderPaychecks(view) {
  const store = window.cloverStore;
  const allMode = paycheckAllYears;
  let pays;
  if (allMode) {
    ensureYearsScanned(store);
    const cur = new Date().getFullYear();
    pays = [];
    for (const y of yearsAvailable()) if (store.isYearLoaded(y)) pays = pays.concat(store.yearData(y).paychecks);
  } else {
    if (!store.isYearLoaded(activeYear)) { view.appendChild(loadingPanel()); store.loadYear(activeYear); return; }
    pays = store.yearData(activeYear).paychecks;
  }
  const paid = pays.filter(isPaycheckPaid);
  const grossYTD = paid.reduce((s, p) => s + (Number(p.gross) || 0), 0);
  const netYTD = paid.reduce((s, p) => s + (Number(p.net) || 0), 0);
  const outstanding = pays.filter(p => !isPaycheckPaid(p) && p.status !== 'Bounced/Returned');

  const head = el('div', 'view-head');
  const left = el('div');
  left.appendChild(el('h3', null, 'Paychecks · ' + (allMode ? 'All years' : activeYear)));
  left.appendChild(el('p', 'muted', paid.length + ' received · ' + pays.length + ' total'));
  head.appendChild(left);
  const pcActions = el('div', 'head-actions');
  const schedBtn = el('button', 'btn-ghost', activeSchedules(store).length ? '📅 Pay schedule' : '📅 Set up pay schedule');
  schedBtn.addEventListener('click', () => { const first = activeSchedules(store)[0]; payScheduleModal(first || null); });
  pcActions.appendChild(schedBtn);
  if (pays.some(p => p.employer)) {
    const mergeBtn = el('button', 'btn-ghost', '⇄ Merge employers');
    mergeBtn.addEventListener('click', () => employerMergeModal());
    pcActions.appendChild(mergeBtn);
  }
  pcActions.appendChild(importButton('paychecks'));
  const add = el('button', 'btn-primary', '+ Add paycheck'); add.addEventListener('click', () => paycheckModal(null));
  pcActions.appendChild(add);
  head.appendChild(pcActions);
  view.appendChild(head);
  const yt = yearTabs(store, 'paychecks'); if (yt) view.appendChild(yt);

  const sum = el('div', 'sub-summary');
  sum.appendChild(sumCard(allMode ? 'Gross (all yrs)' : 'Gross YTD', money(grossYTD), 'income'));
  sum.appendChild(sumCard(allMode ? 'Net (all yrs)' : 'Net YTD', money(netYTD), 'income'));
  // Who paid during this year (or across all years in the All view).
  const paidEmployers = [...new Set(paid.map(p => (p.employer || '').trim()).filter(Boolean))];
  const empHint = paidEmployers.length ? (paidEmployers.slice(0, 3).join(' · ') + (paidEmployers.length > 3 ? ' +' + (paidEmployers.length - 3) + ' more' : '')) : '';
  sum.appendChild(sumCard('Received', String(paid.length), 'neutral', empHint));
  sum.appendChild(sumCard('Outstanding', String(outstanding.length), outstanding.length ? 'expense' : 'neutral'));
  view.appendChild(sum);

  if (outstanding.length) {
    const strip = el('div', 'card');
    strip.appendChild(el('h3', 'strip-title', 'Upcoming / outstanding'));
    const list = el('div', 'chip-list');
    outstanding.slice().sort((a, b) => (a.payDate || '').localeCompare(b.payDate || '')).slice(0, 8).forEach(p => {
      const chip = el('div', 'chip pay-chip');
      chip.appendChild(el('span', null, fmtDate(p.payDate) + ' · ' + money(Number(p.gross) || 0)));
      const st = p.status || 'Expected';
      chip.appendChild(badge(st, st === 'Late' || st === 'Missing' ? 'red' : 'amber'));
      chip.addEventListener('click', () => paycheckModal(p));
      list.appendChild(chip);
    });
    strip.appendChild(list);
    view.appendChild(strip);
  }

  // Recorded vs Upcoming tabs (only meaningful once a pay schedule exists).
  const schedActive = activeSchedules(store).length > 0;
  if (!allMode && schedActive) {
    const pvTabs = el('div', 'tabs pv-tabs');
    [['current', 'Paychecks'], ['upcoming', 'Upcoming'], ['missing', 'Missing']].forEach(([v, label]) => {
      const b = el('button', 'tab' + (paycheckView === v ? ' active' : ''), label);
      if (v === 'missing') b.title = 'Expected paychecks never entered, plus recorded ones still unreceived 3+ days past their pay date';
      b.addEventListener('click', () => { paycheckView = v; renderView(currentRoute); });
      pvTabs.appendChild(b);
    });
    const refresh = el('button', 'btn-ghost pv-refresh', '↻ Refresh');
    refresh.title = 'Re-pull this year and recompute against your pay schedule';
    refresh.addEventListener('click', () => { store.reloadYear(activeYear); toast('Refreshed'); });
    pvTabs.appendChild(refresh);
    view.appendChild(pvTabs);
  }
  const upcomingView = !allMode && schedActive && paycheckView === 'upcoming';
  const missingView = !allMode && schedActive && paycheckView === 'missing';

  const bar = el('div', 'filter-bar');
  const statusSel = select([{ value: 'all', label: 'All statuses' }].concat(PAYCHECK_STATUSES.map(s => ({ value: s, label: s }))), paycheckStatusFilter);
  statusSel.addEventListener('change', () => { paycheckStatusFilter = statusSel.value; renderView(currentRoute); });
  bar.appendChild(labelWrap('Status', statusSel));
  if (missingView) bar.appendChild(el('div', 'muted', 'Expected paychecks never entered, plus recorded ones still unreceived 3+ days past their pay date. None of these count toward totals.'));
  else if (!upcomingView && !allMode && schedActive) bar.appendChild(el('div', 'muted', 'Greyed rows are expected paychecks not recorded yet — they don’t count toward totals.'));
  view.appendChild(bar);

  // Bulk selection applies only to real recorded paychecks in the single-year current view.
  const showSel = !allMode && paycheckView === 'current';   // no bulk-select on Upcoming/Missing (mixed synthetic rows)
  if (!showSel) { paycheckSel = new Set(); paycheckSelYear = null; }
  else {
    if (paycheckSelYear !== activeYear) { paycheckSel = new Set(); paycheckSelYear = activeYear; }
    const validIds = new Set(pays.map(p => p.id));
    [...paycheckSel].forEach(id => { if (!validIds.has(id)) paycheckSel.delete(id); });
  }

  // Rows: recorded (+ past-missing) for the current view; future expected for
  // upcoming; the Missing tab collects never-entered expected checks plus
  // recorded-but-unreceived ones 3+ days past their pay date.
  let rows;
  if (upcomingView) rows = expectedRows(store, activeYear, pays, 'upcoming');
  else if (missingView) {
    const synth = expectedRows(store, activeYear, pays, 'missing').filter(p => daysUntil(p.payDate) <= -3);
    const overdue = pays.filter(p => !isPaycheckPaid(p) && p.status !== 'Bounced/Returned' && p.payDate && daysUntil(p.payDate) <= -3);
    rows = overdue.concat(synth).sort((a, b) => (b.payDate || '').localeCompare(a.payDate || ''));
  }
  else if (!allMode && schedActive) rows = pays.concat(expectedRows(store, activeYear, pays, 'missing'));
  else rows = pays.slice();
  if (!missingView && paycheckStatusFilter !== 'all') rows = rows.filter(p => (p.status || 'Received') === paycheckStatusFilter);

  if (!rows.length) {
    if (upcomingView) view.appendChild(el('div', 'card muted pad', 'No upcoming paychecks scheduled.'));
    else if (missingView) view.appendChild(el('div', 'card muted pad', 'Nothing missing — every expected paycheck is recorded and received (3-day grace).'));
    else view.appendChild(emptyState('No paychecks yet', 'Add your paychecks — main job and any acting/side gigs — to track expected vs. received, days early/late, and wage totals. Wages roll into the Income view automatically.', '+ Add paycheck', () => paycheckModal(null)));
    return;
  }

  if (showSel) {
    const bulkContainer = el('div'); bulkContainer.id = 'pc-bulk-bar';
    if (paycheckSel.size) bulkContainer.appendChild(paycheckBulkBar(store));
    view.appendChild(bulkContainer);
  }

  const realRows = rows.filter(r => !r.__expected);
  const cols = [
    { sortable: false, headCell: () => {
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.title = 'Select all';
        cb.checked = realRows.length > 0 && realRows.every(r => paycheckSel.has(r.id));
        cb.addEventListener('change', () => {
          realRows.forEach(r => cb.checked ? paycheckSel.add(r.id) : paycheckSel.delete(r.id));
          document.querySelectorAll('#view .data-table tbody .sel-cell input').forEach(box => { box.checked = cb.checked; });
          updatePaycheckSelectionUI();
        });
        return cb; },
      cell: p => {
        const td = el('td', 'sel-cell'); if (p.__expected) return td;
        const cb = document.createElement('input'); cb.type = 'checkbox';
        cb.checked = paycheckSel.has(p.id);
        cb.addEventListener('change', () => { cb.checked ? paycheckSel.add(p.id) : paycheckSel.delete(p.id); updatePaycheckSelectionUI(); });
        td.appendChild(cb); return td; } },
    ...paycheckColKeys(store).map(k => buildPaycheckCol(store, k)).filter(Boolean),
    { label: '', sortable: false, cell: p => {
        const td = el('td', 'row-actions');
        if (p.__expected) {
          const rec = el('button', 'icon-btn', 'Record');
          rec.addEventListener('click', () => paycheckModal({ payDate: p.payDate, periodNum: p.periodNum, periodStart: p.periodStart, periodEnd: p.periodEnd, employer: p.employer, incomeCategoryId: p.incomeCategoryId, personId: p.personId, gross: p.gross, net: p.net, status: 'Received', method: 'Direct deposit' }));
          td.appendChild(rec); return td;
        }
        const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => paycheckModal(p));
        const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove(fmtDate(p.payDate) + ' · ' + (p.employer || 'paycheck'), () => store.removePaycheck(yearOfPaycheck(p), p.id)));
        td.appendChild(edit); td.appendChild(del); return td; } }
  ];
  const pcColsBtn = el('button', 'btn-ghost', '⚙ Columns');
  pcColsBtn.addEventListener('click', () => paycheckColumnsModal());
  pcColsBtn.style.marginLeft = 'auto';   // share the filter row instead of its own row
  bar.appendChild(pcColsBtn);
  const card = el('div', 'card table-card');
  card.appendChild(sortableTable(showSel ? cols : cols.slice(1), rows, paycheckSort, ns => { paycheckSort = ns || { key: 'payDate', dir: 'desc' }; renderView(currentRoute); }, p => p.__expected ? 'inactive-row expected-row' : (isPaycheckPaid(p) ? '' : 'inactive-row')));
  view.appendChild(card);

  // Where the gross goes: the schedule's pay-stub sample × regular checks received
  // this year, per line item (salary assumption — one-time checks excluded).
  if (!allMode && paycheckView === 'current') {
    activeSchedules(store).filter(sch => Array.isArray(sch.deductions) && sch.deductions.length).forEach(sch => {
      const checks = pays.filter(p => isPaycheckPaid(p) && (p.employer || '').toLowerCase() === (sch.employer || '').toLowerCase() && (!p.checkType || p.checkType === 'Regular'));
      if (!checks.length) return;
      const n = checks.length;
      const dcard = el('div', 'card');
      dcard.appendChild(el('h3', 'strip-title', 'Where the gross goes · ' + (sch.name || sch.employer) + ' · ' + activeYear));
      dcard.appendChild(el('p', 'muted', 'Your pay-stub sample × ' + n + ' regular paycheck' + (n === 1 ? '' : 's') + ' received this year. Assumes a salary (every regular check about the same); bonus and other one-time checks are excluded.'));
      const wrap = el('div', 'table-scroll'); const t = el('table', 'data-table');
      t.innerHTML = '<thead><tr><th>Line item</th><th class="num">Per check</th><th class="num">' + activeYear + ' so far</th></tr></thead>';
      const tb = el('tbody');
      let per = 0;
      sch.deductions.forEach(d0 => {
        const amt = Number(d0.amount) || 0; per += amt;
        const tr = el('tr'); tr.appendChild(el('td', null, d0.name || '—')); tr.appendChild(numCell(amt)); tr.appendChild(numCell(amt * n, true)); tb.appendChild(tr);
      });
      const totalTr = el('tr', 'total-row');
      totalTr.appendChild(el('td', 'grp-name', 'Total deductions'));
      totalTr.appendChild(numCell(per, true)); totalTr.appendChild(numCell(per * n, true));
      tb.appendChild(totalTr);
      t.appendChild(tb); wrap.appendChild(t); dcard.appendChild(wrap);
      if (sch.gross) {
        const calcNet = Number(sch.gross) - per;
        const diff = (sch.net != null && sch.net !== '') ? calcNet - Number(sch.net) : null;
        dcard.appendChild(el('div', 'sum-hint', 'Gross ' + money(sch.gross) + ' − deductions ' + money(per) + ' = ' + money(calcNet) + ' net per check' +
          (diff != null ? (Math.abs(diff) > 1 ? ' — differs from the schedule’s expected net (' + money(sch.net) + ') by ' + money(Math.abs(diff)) + '; update the stub sample or the expected net.' : ' — matches the schedule’s expected net.') : '')));
      }
      view.appendChild(dcard);
    });
  }
}

// In-place refresh of the bulk bar + select-all state (no full table re-render,
// so scroll position and other checkboxes are preserved while selecting).
function updatePaycheckSelectionUI() {
  const container = document.getElementById('pc-bulk-bar');
  if (container) { container.innerHTML = ''; if (paycheckSel.size) container.appendChild(paycheckBulkBar(window.cloverStore)); }
  const head = document.querySelector('#view .data-table thead th:first-child input[type=checkbox]');
  const rowBoxes = [...document.querySelectorAll('#view .data-table tbody .sel-cell input')];
  if (head) head.checked = rowBoxes.length > 0 && rowBoxes.every(cb => cb.checked);
}

function paycheckBulkBar(store) {
  const bar = el('div', 'bulk-bar');
  bar.appendChild(el('span', 'bulk-count', paycheckSel.size + ' selected'));
  const mSel = select([{ value: '', label: 'Method: no change' }].concat(catalogOptions(s, 'payMethods', PAYCHECK_METHODS).map(m => ({ value: m, label: m }))), '');
  const sSel = select([{ value: '', label: 'Status: no change' }].concat(PAYCHECK_STATUSES.map(s => ({ value: s, label: s }))), '');
  bar.appendChild(mSel); bar.appendChild(sSel);
  const apply = el('button', 'btn-primary', 'Apply');
  apply.addEventListener('click', () => {
    const changes = {};
    if (mSel.value) changes.method = mSel.value;
    if (sSel.value) changes.status = sSel.value;
    if (!Object.keys(changes).length) { toast('Pick a method or status to set', 'warn'); return; }
    const n = store.bulkUpdatePaychecks(activeYear, [...paycheckSel], changes);
    paycheckSel = new Set();
    toast('Updated ' + n + ' paycheck' + (n === 1 ? '' : 's'));
    renderView(currentRoute);
  });
  bar.appendChild(apply);
  const clear = el('button', 'btn-ghost', 'Clear');
  clear.addEventListener('click', () => { paycheckSel = new Set(); renderView(currentRoute); });
  bar.appendChild(clear);
  return bar;
}

function paycheckModal(existing) {
  const store = window.cloverStore, s = store.state;
  const wages = s.incomeCategories.find(c => /wage/i.test(c.name));
  const p = existing ? Object.assign({}, existing) : { payDate: todayISO(), status: 'Received', method: 'Direct deposit', personId: s.persons[0] && s.persons[0].id, incomeCategoryId: wages ? wages.id : (s.incomeCategories[0] && s.incomeCategories[0].id) };
  const body = el('div', 'form-grid');

  const empList = el('datalist'); empList.id = 'emp-list';
  [...new Set(store.yearData(activeYear).paychecks.map(x => x.employer).filter(Boolean))].forEach(e => { const o = el('option'); o.value = e; empList.appendChild(o); });
  body.appendChild(empList);

  const fPay = input(p.payDate || todayISO(), { type: 'date' });
  const fRecv = input(p.receivedDate || '', { type: 'date' });
  const fGross = moneyInput(p.gross);
  const fNet = moneyInput(p.net);
  const fEmp = input(p.employer || '', { placeholder: 'Employer / source', list: 'emp-list' });
  const fCat = select(s.incomeCategories.map(c => ({ value: c.id, label: c.name })), p.incomeCategoryId || (wages && wages.id));
  const fPerson = select(s.persons.map(x => ({ value: x.id, label: x.name })), p.personId || (s.persons[0] && s.persons[0].id));
  const fPeriodNum = input(p.periodNum || '', { type: 'number', placeholder: '#' }); fPeriodNum.min = 1;
  const fPeriodStart = input(p.periodStart || '', { type: 'date' });
  const fPeriodEnd = input(p.periodEnd || '', { type: 'date' });
  const fStatus = select(PAYCHECK_STATUSES, p.status || 'Received');
  const fMethod = select(catalogOptions(s, 'payMethods', PAYCHECK_METHODS, p.method), p.method || 'Direct deposit');
  const fCheckNo = input(p.checkNo || '', { placeholder: 'optional' });
  const fKind = select(catalogOptions(s, 'checkTypes', PAYCHECK_KINDS, p.checkType), p.checkType || 'Regular');
  const fNotes = document.createElement('textarea'); fNotes.value = p.notes || ''; fNotes.rows = 2; fNotes.placeholder = 'Optional';

  const dateRow = el('div', 'two-col');
  dateRow.appendChild(field('Expected pay date', fPay, 'The date you were supposed to be paid.'));
  dateRow.appendChild(field('Received date', fRecv, 'When the money actually arrived. Leave blank if not received yet — days early/late is computed from these two.'));
  body.appendChild(dateRow);
  const amtRow = el('div', 'two-col');
  amtRow.appendChild(field('Gross', fGross, 'Pay before taxes and deductions. This is what rolls into the income category.'));
  amtRow.appendChild(field('Net', fNet, 'Take-home pay after taxes and deductions.'));
  body.appendChild(amtRow);
  body.appendChild(field('Employer / source', fEmp, 'Who paid you — your main job, or an acting/side gig.'));
  body.appendChild(field('Income category', fCat, 'Which income category this paycheck counts toward — Wages for your job, Acting for acting gigs. It rolls into that category on the Income view automatically (so don’t also add it as income).'));
  body.appendChild(field('Person', fPerson, 'Who this paycheck belongs to.'));
  const perRow = el('div', 'cd-fields');
  perRow.appendChild(field('Period #', fPeriodNum, 'The pay-period number, if your employer uses one.'));
  perRow.appendChild(field('Period start', fPeriodStart, 'First day of the pay period.'));
  perRow.appendChild(field('Period end', fPeriodEnd, 'Last day of the pay period.'));
  body.appendChild(perRow);
  const stRow = el('div', 'two-col');
  stRow.appendChild(field('Status', fStatus, 'Received/Manual deposit count toward wage totals; Expected/Late/Missing/Bounced do not.'));
  stRow.appendChild(field('Method', fMethod, 'How you got paid — direct deposit, check, office pickup, etc.'));
  body.appendChild(stRow);
  const ktRow = el('div', 'two-col');
  ktRow.appendChild(field('Check type', fKind, 'Most checks are Regular — on a salary, every regular check is about the same. Mark bonuses, reimbursements, or other one-time checks so they don’t skew the deductions breakdown or raise detection.'));
  const checkNoField = field('Check # (optional)', fCheckNo, 'The number printed on the paper check — for tracing a bounced or lost check later.');
  ktRow.appendChild(checkNoField);
  body.appendChild(ktRow);
  // The check-number field only applies to paper checks — hide it for
  // direct deposit.
  const syncCheckNo = () => { checkNoField.style.display = /check|office|other/i.test(fMethod.value) ? '' : 'none'; };
  fMethod.addEventListener('change', syncCheckNo); syncCheckNo();
  body.appendChild(field('Notes', fNotes, 'Anything unusual — bounced check, wrong amount, deposit delay, etc.'));

  const isEdit = !!(existing && existing.id);
  openModal({
    title: isEdit ? 'Edit paycheck' : 'Add paycheck', body: withHistoryTab(body, existing), confirmLabel: 'Save',
    onConfirm: () => {
      const gross = parseFloat(fGross.value);
      if (isNaN(gross)) { fGross.focus(); toast('Gross is required', 'warn'); return false; }
      const entry = Object.assign(p, {
        payDate: fPay.value || todayISO(), receivedDate: fRecv.value || '',
        gross, net: fNet.value === '' ? null : parseFloat(fNet.value),
        employer: fEmp.value.trim(), incomeCategoryId: fCat.value, personId: fPerson.value,
        periodNum: fPeriodNum.value === '' ? null : parseInt(fPeriodNum.value, 10),
        periodStart: fPeriodStart.value || '', periodEnd: fPeriodEnd.value || '',
        status: fStatus.value, method: fMethod.value, checkNo: fCheckNo.value.trim(), checkType: fKind.value, notes: fNotes.value.trim()
      });
      // A paycheck belongs to the year of its pay date, not whatever year is
      // being viewed — this keeps All-view edits and cross-year adds correct.
      const y = yearOfPaycheck(entry);
      const doSave = () => store.savePaycheck(y, entry);
      if (store.isYearLoaded(y)) doSave(); else store.loadYear(y).then(doSave);
      toast(isEdit ? 'Paycheck updated' : 'Paycheck added');
    }
  });
}

// Settings card: manage pay schedules inline (add/edit/remove open the form modal).
function paySchedulesCard() {
  const store = window.cloverStore, s = store.state;
  const card = el('div', 'card');
  card.appendChild(sectionHead('Pay schedules', 'How often each job pays — powers missing-paycheck alerts + period numbers', () => payScheduleModal(null)));
  const scheds = s.paySchedules || [];
  if (!scheds.length) card.appendChild(el('div', 'muted', 'No pay schedules yet. Add one to track expected paychecks.'));
  scheds.forEach(sch => {
    const row = el('div', 'mini-row');
    const left = el('div');
    left.appendChild(el('div', null, (sch.name || sch.employer || 'Schedule') + (sch.active === false ? ' (inactive)' : '')));
    left.appendChild(el('div', 'muted', payFreqLabel(sch.frequency) + (sch.anchorDate ? ' · from ' + fmtDate(sch.anchorDate) : '') + (sch.taxForm && sch.taxForm !== 'none' ? ' · ' + sch.taxForm : '')));
    row.appendChild(left);
    const right = el('span', 'mini-right');
    const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => payScheduleModal(sch));
    const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove(sch.name || sch.employer || 'schedule', () => store.removePaySchedule(sch.id)));
    right.appendChild(edit); right.appendChild(del); row.appendChild(right);
    card.appendChild(row);
  });
  return card;
}

// Add/edit a single pay schedule.
function payScheduleModal(existing) {
  const store = window.cloverStore, s = store.state;
  const wages = s.incomeCategories.find(c => /wage/i.test(c.name));
  const c = existing ? Object.assign({}, existing) : { frequency: 'biweekly', active: true, incomeCategoryId: wages ? wages.id : (s.incomeCategories[0] && s.incomeCategories[0].id), personId: s.persons[0] && s.persons[0].id };
  const body = el('div', 'form-grid');

  // Employer: choose an EXISTING employer (from recorded paychecks) so the schedule
  // pairs up; only add a new one for a job with no paychecks yet.
  const EMP_NEW = '__new_emp__';
  const empCounts = {};
  Object.keys(store.state.years).forEach(yk => (store.state.years[yk].paychecks || []).forEach(x => { if (x.employer) empCounts[x.employer] = (empCounts[x.employer] || 0) + 1; }));
  const employers = Object.keys(empCounts).sort((a, b) => empCounts[b] - empCounts[a]);
  ensureYearsScanned(store);

  const fName = input(c.name || '', { placeholder: 'e.g. Main Job' });
  const empOpts = employers.map(e => ({ value: e, label: e + ' · ' + empCounts[e] + ' paycheck' + (empCounts[e] === 1 ? '' : 's') }));
  if (c.employer && !employers.includes(c.employer)) empOpts.unshift({ value: c.employer, label: c.employer + ' · no matching paychecks' });
  empOpts.push({ value: EMP_NEW, label: employers.length ? '＋ New employer…' : '＋ Add employer…' });
  const fEmpSel = select(empOpts, c.employer || employers[0] || EMP_NEW);
  const fEmpNew = input('', { placeholder: 'Employer name exactly as on paychecks' });
  const empNewField = field('New employer name', fEmpNew, 'Type it exactly as it appears on your recorded paychecks so they pair up.');
  const empVal = () => (fEmpSel.value === EMP_NEW ? fEmpNew.value.trim() : fEmpSel.value);

  const fCat = select(s.incomeCategories.map(x => ({ value: x.id, label: x.name })), c.incomeCategoryId || (wages && wages.id));
  const fPerson = select(s.persons.map(x => ({ value: x.id, label: x.name })), c.personId || (s.persons[0] && s.persons[0].id));
  const fFreq = select(PAY_FREQUENCIES.map(f => ({ value: f.key, label: f.label })), c.frequency || 'biweekly');
  const fAnchor = input(c.anchorDate || '', { type: 'date' });
  const fYearFirst = input(c.yearFirstPay || '', { type: 'date' });
  const fHire = input(c.hireDate || '', { type: 'date' });
  const fHours = input(c.hoursPerCheck != null ? c.hoursPerCheck : '', { type: 'number', placeholder: 'e.g. 80' }); fHours.step = '0.25';
  const fDay2 = input(c.day2 != null ? c.day2 : '', { type: 'number', placeholder: 'e.g. 30 (blank = last day)' }); fDay2.min = 1; fDay2.max = 31;
  const fGross = moneyInput(c.gross);
  const fNet = moneyInput(c.net);
  const fTaxForm = select([{ value: 'W-2', label: 'W-2 (employee)' }, { value: '1099-NEC', label: '1099-NEC (contractor / gig)' }, { value: '1099-MISC', label: '1099-MISC' }, { value: 'none', label: 'None / cash' }], c.taxForm || 'W-2');
  const cActive = checkbox('Active', c.active !== false, 'Only active schedules flag missing paychecks and fill period numbers.');

  const day2Field = field('Second pay day of month', fDay2, 'For semimonthly pay, the second day each month (the first comes from the anchor date). Blank = last day of the month.');
  const syncFreq = () => { day2Field.style.display = fFreq.value === 'semimonthly' ? '' : 'none'; };
  fFreq.addEventListener('change', syncFreq);
  const syncEmp = () => { empNewField.style.display = fEmpSel.value === EMP_NEW ? '' : 'none'; };
  fEmpSel.addEventListener('change', syncEmp);

  body.appendChild(field('Name', fName, 'A label for this schedule — e.g. Main Job.'));
  body.appendChild(field('Employer (matches paychecks)', fEmpSel, 'Pick the job whose paychecks this tracks. Choosing an EXISTING employer is what pairs the schedule to your recorded paychecks — otherwise every period shows as “missing.”'));
  body.appendChild(empNewField);
  const catRow = el('div', 'two-col');
  catRow.appendChild(field('Income category', fCat, 'Which category these paychecks count toward (usually Wages).'));
  catRow.appendChild(field('Person', fPerson, 'Whose paychecks these are.'));
  body.appendChild(catRow);
  body.appendChild(field('Pay frequency', fFreq, 'How often you’re paid. Biweekly = every 2 weeks (26/yr); Semimonthly = twice a month (24/yr).'));
  body.appendChild(field('A recent / first pay date', fAnchor, 'Any known real pay date. Clover steps forward and back from this to build the whole schedule (e.g. every other Friday).'));
  const hireRow = el('div', 'two-col');
  hireRow.appendChild(field('Hire date (optional)', fHire, 'When you started at this employer — powers the employed-duration stats on the employer profile (Raises page).'));
  hireRow.appendChild(field('Hours per check (optional)', fHours, 'Typical hours worked per paycheck, if you track them (e.g. 80 for biweekly full-time). Enables total-hours and gross/net hourly breakdowns.'));
  body.appendChild(hireRow);
  body.appendChild(field('First pay date of this year (optional)', fYearFirst, 'The first paycheck date of the current calendar year, if you know it. Period #1 anchors exactly there and the whole year lines up with your actual pay year — useful when the rhythm shifted from last year, so this year’s gross/net track your real checks rather than a projected calendar.'));
  body.appendChild(day2Field);
  const amtRow = el('div', 'two-col');
  amtRow.appendChild(field('Expected gross', fGross, 'Typical gross per paycheck — prefilled when you record a missing one.'));
  amtRow.appendChild(field('Expected net', fNet, 'Typical take-home per paycheck.'));
  body.appendChild(amtRow);

  // Pay-stub sample: where each check's gross goes before net. One sample covers
  // the year because this assumes a SALARY — every regular check about the same.
  const dedList = el('datalist'); dedList.id = 'deduct-list';
  DEDUCTION_SUGGESTIONS.forEach(n => { const o = el('option'); o.value = n; dedList.appendChild(o); });
  body.appendChild(dedList);
  let deductions = Array.isArray(c.deductions) ? c.deductions.map(x => ({ name: x.name || '', amount: x.amount })) : [];
  const dedWrap = el('div');
  const renderDed = () => {
    dedWrap.innerHTML = '';
    deductions.forEach((d0, i) => {
      const row = el('div', 'io-actions');
      const fName2 = input(d0.name, { placeholder: 'e.g. Federal Withholding', list: 'deduct-list' });
      fName2.addEventListener('input', () => { d0.name = fName2.value; });
      const fAmt2 = attachMoney2dp(input('', { type: 'number', placeholder: 'e.g. 150.00' }), d0.amount != null ? Math.abs(d0.amount) : ''); fAmt2.min = 0;
      fAmt2.title = 'Enter as a positive amount — it\u2019s subtracted from gross automatically (that\u2019s what the \u2212 means).';
      fAmt2.addEventListener('input', () => { d0.amount = fAmt2.value === '' ? null : Math.abs(parseFloat(fAmt2.value)); });
      const x = el('button', 'icon-btn danger', '✕'); x.title = 'Remove this line item';
      x.addEventListener('click', () => { deductions.splice(i, 1); renderDed(); });
      const amtWrap = el('span', 'ded-amt');
      const minus = el('span', 'ded-minus', '−$'); minus.title = fAmt2.title;
      amtWrap.appendChild(minus); amtWrap.appendChild(fAmt2);
      row.appendChild(fName2); row.appendChild(amtWrap); row.appendChild(x);
      dedWrap.appendChild(row);
    });
    const addDed = el('button', 'btn-ghost', '＋ Add line item');
    addDed.addEventListener('click', () => { deductions.push({ name: '', amount: null }); renderDed(); });
    dedWrap.appendChild(addDed);
  };
  renderDed();
  body.appendChild(field('Paycheck deductions (per check, optional)', dedWrap, 'From a recent pay stub: where each check’s gross goes before net — federal withholding, Social Security, Medicare (plus the additional Medicare tax if it applies), state withholding, 401(k), insurance… Add your own line items for anything employer-specific. This assumes a salary, where every regular check is about the same; mark one-time checks (bonus, reimbursement) with a Check type on the paycheck so they’re excluded.'));

  body.appendChild(field('Pay reported on', fTaxForm, 'How this employer reports your pay for taxes — W-2 for employees, 1099-NEC for contract or gig work. Drives the “Expected tax forms” checklist on the Taxes page.'));
  body.appendChild(field('Status', cActive));
  syncFreq(); syncEmp();

  openModal({
    title: existing ? 'Edit pay schedule' : 'Add pay schedule', body: withHistoryTab(body, existing), confirmLabel: 'Save',
    onConfirm: () => {
      const employer = empVal();
      if (!employer) { toast('Pick or enter the employer', 'warn'); return false; }
      if (!fAnchor.value) { fAnchor.focus(); toast('Pick a known pay date to anchor the schedule', 'warn'); return false; }
      const entry = Object.assign(c, {
        name: fName.value.trim() || employer, employer,
        incomeCategoryId: fCat.value, personId: fPerson.value, frequency: fFreq.value,
        anchorDate: fAnchor.value, yearFirstPay: fYearFirst.value || '', hireDate: fHire.value || '', hoursPerCheck: fHours.value === '' ? null : parseFloat(fHours.value), day2: fDay2.value === '' ? null : parseInt(fDay2.value, 10),
        gross: fGross.value === '' ? null : parseFloat(fGross.value),
        net: fNet.value === '' ? null : parseFloat(fNet.value), active: cActive.__input.checked, taxForm: fTaxForm.value,
        deductions: deductions.filter(x => (x.name || '').trim()).map(x => ({ name: x.name.trim(), amount: x.amount != null && !isNaN(x.amount) ? Math.abs(x.amount) : null }))
      });
      store.savePaySchedule(entry);
      toast(existing ? 'Schedule updated' : 'Schedule added');
    }
  });
}

// Relabel/merge an employer across all paychecks (+ matching pay schedules).
function employerMergeModal() {
  const store = window.cloverStore;
  ensureYearsScanned(store);
  const empCounts = {};
  Object.keys(store.state.years).forEach(yk => (store.state.years[yk].paychecks || []).forEach(p => { if (p.employer) empCounts[p.employer] = (empCounts[p.employer] || 0) + 1; }));
  const employers = Object.keys(empCounts).sort((a, b) => empCounts[b] - empCounts[a]);
  if (!employers.length) { toast('No paychecks with an employer yet', 'warn'); return; }
  const body = el('div', 'form-grid');
  body.appendChild(el('p', 'muted', 'Relabel every paycheck (and any matching pay schedule) from one employer name to another — e.g. rename “Main Job” to “Director of Support”, or merge two names into one.'));
  const fFrom = select(employers.map(e => ({ value: e, label: e + ' · ' + empCounts[e] + ' paycheck' + (empCounts[e] === 1 ? '' : 's') })), employers[0]);
  const toList = el('datalist'); toList.id = 'emp-to-list';
  employers.forEach(e => { const o = el('option'); o.value = e; toList.appendChild(o); });
  body.appendChild(toList);
  const fTo = input('', { placeholder: 'New name (or pick an existing to merge)', list: 'emp-to-list' });
  body.appendChild(field('Rename from', fFrom, 'The employer name currently on your paychecks.'));
  body.appendChild(field('Rename to', fTo, 'Type a new name, or choose another existing employer to merge the two together.'));
  openModal({
    title: 'Merge / rename employer', body, confirmLabel: 'Rename',
    onConfirm: () => {
      const to = fTo.value.trim();
      if (!to) { fTo.focus(); toast('Enter the new employer name', 'warn'); return false; }
      if (to.toLowerCase() === fFrom.value.toLowerCase()) { toast('Pick a different name', 'warn'); return false; }
      const n = store.renameEmployer(fFrom.value, to);
      toast('Renamed ' + n + ' paycheck' + (n === 1 ? '' : 's') + ' to “' + to + '”');
    }
  });
}

// ============================================================
// Raises — per-employer raise history + time between raises
// ============================================================
let raisesSort = { key: 'date', dir: 'desc' };
let raiseYoYSort = { key: 'date', dir: 'desc' };
let raiseYoYFilter = null;   // {key:'basis'|'empType', value} from clicking a YoY tag
// Effective previous amount for a raise: the entered one, else inferred from
// the prior same-employer raise on the same basis — unless the raise is
// marked standalone (noPrev, e.g. a job/role change makes them incomparable).
function raiseAnnualOf(x) { return x.basis === 'annual' ? Number(x.amount) : (x.basis === 'hourly' && x.yearGross != null && x.yearGross !== '') ? Number(x.yearGross) : null; }
// The year's annual figure, gross or net: an annual salary's own amount/net,
// otherwise the explicitly recorded Year gross / Year net.
function raiseYearFig(r, kind) {
  if (kind === 'gross') return r.basis === 'annual' ? (r.amount != null && r.amount !== '' ? Number(r.amount) : null) : (r.yearGross != null && r.yearGross !== '' ? Number(r.yearGross) : null);
  return r.basis === 'annual' ? (r.net != null && r.net !== '' ? Number(r.net) : null) : (r.yearNet != null && r.yearNet !== '' ? Number(r.yearNet) : null);
}
function raisePrev(store, r) {
  if (r.prevAmount != null && r.prevAmount !== '') return { v: Number(r.prevAmount), derived: false };
  if (r.noPrev) return null;
  const priors = store.state.raises
    .filter(x => x.id !== r.id && (x.employer || '').toLowerCase() === (r.employer || '').toLowerCase() && (x.date || '') < (r.date || '') && x.amount != null)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!priors.length) return null;
  // Immediately prior record: same basis compares directly; a different basis
  // can still compare when BOTH sides have an annual figure (a salary's
  // amount, or an hourly year's recorded Year gross) — e.g. a salary raise
  // following an hourly year uses that year's gross annual earned.
  const im = priors[0];
  if ((im.basis || 'check') === (r.basis || 'check')) return { v: Number(im.amount), derived: true };
  const a = raiseAnnualOf(r), pa = raiseAnnualOf(im);
  if (a != null && pa != null) return { v: pa, derived: true, annualized: true };
  // Otherwise fall back to the latest prior raise on the same basis.
  const same = priors.find(x => (x.basis || 'check') === (r.basis || 'check'));
  return same ? { v: Number(same.amount), derived: true } : null;
}
// How long this pay level lasted: until the employer's NEXT raise, or counting
// up to today for the latest one.
function raiseDurationDays(store, r) {
  // "No new raise" year records don't end a pay level — skip them.
  const next = store.state.raises
    .filter(x => x.id !== r.id && !x.noRaise && (x.employer || '').toLowerCase() === (r.employer || '').toLowerCase() && (x.date || '') > (r.date || ''))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
  const end = next ? next.date : todayISO();
  return { days: daysBetweenISO(end, r.date), ongoing: !next, end };
}
// Calendar breakdown from one ISO date to a later one: whole years, months, days.
function ymdBetween(fromIso, toIso) {
  const a = parseISODate(fromIso), b = parseISODate(toIso);
  if (!a || !b || b < a) return null;
  let y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), d = b.getDate() - a.getDate();
  if (d < 0) { m--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  const parts = [];
  if (y) parts.push(y + ' yr' + (y === 1 ? '' : 's'));
  if (m) parts.push(m + ' mo');
  if (d) parts.push(d + ' day' + (d === 1 ? '' : 's'));
  return parts.length ? parts.join(', ') : 'same day';
}
const RAISE_COL_LABELS = { employer: 'Employer', title: 'Position', empType: 'Employment', date: 'Date', amount: 'New gross', net: 'New net', prevAmount: 'Previous', change: 'Change', gap: 'At this pay', hoursYear: 'Hours (yr)', yearGross: 'Year gross', yearNet: 'Year net', actGross: 'Actual $/hr (gross)', actNet: 'Actual $/hr (net)', notes: 'Notes' };
const RAISE_ALL_COLS = ['employer', 'title', 'empType', 'date', 'amount', 'net', 'prevAmount', 'change', 'gap', 'hoursYear', 'yearGross', 'yearNet', 'actGross', 'actNet', 'notes'];
const RAISE_DEFAULT_COLS = ['employer', 'title', 'empType', 'date', 'amount', 'prevAmount', 'change', 'gap', 'actGross', 'actNet'];
function raiseGapDays(store, r) {
  const prior = store.state.raises
    .filter(x => x.id !== r.id && (x.employer || '').toLowerCase() === (r.employer || '').toLowerCase() && (x.date || '') < (r.date || ''))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  return prior ? daysBetweenISO(r.date, prior.date) : null;
}
function lastPaycheckDateFor(store, employer) {
  let last = '';
  Object.keys(store.state.years).forEach(yk => (store.state.years[yk].paychecks || []).forEach(p => {
    if ((p.employer || '').toLowerCase() === (employer || '').toLowerCase() && (p.payDate || '') > last) last = p.payDate;
  }));
  return last;
}
function raiseSuf(r) { return r.basis === 'annual' ? ' /yr' : r.basis === 'hourly' ? ' /hr' : ' /check'; }
function buildRaiseCol(store, key) {
  switch (key) {
    case 'employer': return { label: 'Employer', key: 'employer', value: r => r.employer || '', cell: r => el('td', 'strong', r.employer || '—') };
    case 'title': return { label: 'Position', key: 'title', value: r => r.title || '', cell: r => el('td', 'muted', r.title || '—') };
    case 'empType': return { label: 'Employment', key: 'empType', value: r => r.empType || '', cell: r => { const td = el('td'); if (!r.empType) { td.textContent = '—'; return td; } td.appendChild(badge(r.empType, r.empType === 'Full-time' ? 'green' : r.empType === 'Part-time' ? 'amber' : '')); return td; } };
    case 'date': return { label: 'Date', key: 'date', value: r => r.date || '', cell: r => el('td', null, fmtDate(r.date)) };
    case 'amount': return { label: 'New gross', key: 'amount', num: true, value: r => Number(r.amount) || 0, cell: r => { const td = numCell(Number(r.amount) || 0, true); td.appendChild(el('span', 'muted', raiseSuf(r))); return td; } };
    case 'net': return { label: 'New net', key: 'net', num: true, value: r => r.net != null ? Number(r.net) : 0, cell: r => { if (r.net == null || r.net === '') return el('td', 'num', '—'); const td = numCell(Number(r.net)); td.appendChild(el('span', 'muted', raiseSuf(r))); return td; } };
    case 'prevAmount': return { label: 'Previous', key: 'prevAmount', num: true, value: r => { const pv = raisePrev(store, r); return pv ? pv.v : 0; }, cell: r => { const pv = raisePrev(store, r); if (!pv) return el('td', 'num', '—'); const td = numCell(pv.v); td.appendChild(el('span', 'muted', pv.annualized ? ' /yr' : raiseSuf(r))); if (pv.derived) { td.classList.add('muted'); td.title = pv.annualized ? 'The prior record’s annual figure (its gross annual earned) — bases differ, so the comparison runs on annual totals' : 'Inferred from this employer’s prior raise (tick “doesn’t follow the prior raise” on the raise to stop this)'; } return td; } };
    case 'change': return { label: 'Change', key: 'change', num: true, value: r => { const pv = raisePrev(store, r); if (!pv || r.amount == null) return 0; const cur = pv.annualized ? raiseAnnualOf(r) : Number(r.amount); return cur != null ? cur - pv.v : 0; }, cell: r => {
        const td = el('td', 'num');
        const pv = raisePrev(store, r);
        if (!pv || r.amount == null) { td.textContent = '—'; return td; }
        const cur = pv.annualized ? raiseAnnualOf(r) : Number(r.amount);
        if (cur == null) { td.textContent = '—'; return td; }
        const diff = cur - pv.v;
        const pct = pv.v > 0 ? (diff / pv.v * 100) : null;
        const span = el('span', diff >= 0 ? 'pos' : 'neg', (diff >= 0 ? '+' : '−') + money(Math.abs(diff)) + (pct != null ? ' (' + (diff >= 0 ? '+' : '−') + Math.abs(pct).toFixed(1) + '%)' : ''));
        span.title = pv.annualized ? 'Compared on annual totals — the bases differ' : (pv.derived ? 'Previous inferred from this employer’s prior raise' : '');
        td.appendChild(span); return td; } };
    case 'gap': return { label: 'At this pay', key: 'gap', num: true, value: r => r.noRaise ? -1 : raiseDurationDays(store, r).days, cell: r => {
        const td = el('td', 'num');
        if (r.noRaise) { td.textContent = '—'; td.title = 'Year record, not a raise — the running pay level owns the duration'; return td; }
        const d = raiseDurationDays(store, r);
        td.textContent = d.days + ' days' + (d.ongoing ? ' · counting' : '');
        const ymd = ymdBetween(r.date, d.end);
        if (ymd) td.appendChild(el('div', 'acct-sub', '(' + ymd + ')'));
        td.title = d.ongoing ? 'Still at this pay — counting up until the next raise' : 'How long this pay level lasted before the next raise';
        return td; } };
    case 'hoursYear': return { label: 'Hours (yr)', key: 'hoursYear', num: true, value: r => r.hoursYear != null ? Number(r.hoursYear) : -1, cell: r => el('td', 'num', r.hoursYear != null && r.hoursYear !== '' ? Number(r.hoursYear).toLocaleString('en-US') : '—') };
    case 'yearGross': return { label: 'Year gross', key: 'yearGross', num: true, value: r => { const f = raiseYearFig(r, 'gross'); return f != null ? f : -1; }, cell: r => { const f = raiseYearFig(r, 'gross'); if (f == null) return el('td', 'num', '—'); const td = numCell(f); if (r.basis === 'annual') { td.classList.add('muted'); td.title = 'The annual salary itself — for salary years the year figure is the salary'; } return td; } };
    case 'yearNet': return { label: 'Year net', key: 'yearNet', num: true, value: r => { const f = raiseYearFig(r, 'net'); return f != null ? f : -1; }, cell: r => { const f = raiseYearFig(r, 'net'); if (f == null) return el('td', 'num', '—'); const td = numCell(f); if (r.basis === 'annual') { td.classList.add('muted'); td.title = 'Mirrored from the annual net — for salary years the year figure is the salary’s net'; } return td; } };
    case 'actGross': return { label: 'Actual $/hr (gross)', key: 'actGross', num: true, value: r => { const f = raiseYearFig(r, 'gross'), hh = Number(r.hoursYear); return (f != null && hh > 0) ? f / hh : -1; }, cell: r => { const f = raiseYearFig(r, 'gross'), hh = Number(r.hoursYear); if (f == null || !(hh > 0)) return el('td', 'num', '—'); const td = el('td', 'num', '$' + (f / hh).toFixed(2)); td.title = money(f) + ' year gross ÷ ' + hh.toLocaleString('en-US') + ' hours worked'; return td; } };
    case 'actNet': return { label: 'Actual $/hr (net)', key: 'actNet', num: true, value: r => { const f = raiseYearFig(r, 'net'), hh = Number(r.hoursYear); return (f != null && hh > 0) ? f / hh : -1; }, cell: r => { const f = raiseYearFig(r, 'net'), hh = Number(r.hoursYear); if (f == null || !(hh > 0)) return el('td', 'num', '—'); const td = el('td', 'num', '$' + (f / hh).toFixed(2)); td.title = money(f) + ' year net ÷ ' + hh.toLocaleString('en-US') + ' hours worked'; return td; } };
    case 'notes': return { label: 'Notes', key: 'notes', value: r => r.notes || '', cell: r => { const td = el('td', 'muted'); td.textContent = r.notes || '—'; return td; } };
  }
  return null;
}
// US CPI-U annual average inflation, % (2025 preliminary) — for comparing raises.
const INFLATION_CPI = { 2010: 1.6, 2011: 3.2, 2012: 2.1, 2013: 1.5, 2014: 1.6, 2015: 0.1, 2016: 1.3, 2017: 2.1, 2018: 2.4, 2019: 1.8, 2020: 1.2, 2021: 4.7, 2022: 8.0, 2023: 4.1, 2024: 2.9, 2025: 2.7 };
const RAISES_CSV_HEADERS = ['Employer', 'Position title', 'Employment type', 'Date', 'Amounts are', 'New gross', 'New net', 'Previous gross', 'Standalone', 'No new raise', 'Hours worked (year)', 'Year gross', 'Year net', 'Notes'];
const RAISES_TEMPLATE_CSV = RAISES_CSV_HEADERS.join(',') + '\n'
  + 'Main Job,Support Tech,Full-time,2025-04-04,Per paycheck,2100.00,1650.00,2000.00,,,,,Annual review\n'
  + 'Main Job,Senior Support Tech,Full-time,2026-04-03,Annual salary,62000.00,47000.00,56000.00,,,,,Promotion with title change\n'
  + 'Weekend Gig,Crew Lead,Part-time,2026-05-10,Hourly rate,19.50,16.25,17.00,,850,16575.00,13800.00,Hourly bump\n';
function exportRaisesCSV(store) {
  const rows = [RAISES_CSV_HEADERS.join(',')];
  store.state.raises.forEach(r => rows.push([r.employer, r.title, r.empType, r.date, r.basis === 'annual' ? 'Annual salary' : r.basis === 'hourly' ? 'Hourly rate' : 'Per paycheck', r.amount, r.net, r.prevAmount, r.noPrev ? 'Yes' : '', r.noRaise ? 'Yes' : '', r.hoursYear, r.yearGross, r.yearNet, r.notes].map(csvEsc).join(',')));
  downloadFile('clover-raises.csv', rows.join('\n'), 'text/csv');
}
function importRaisesCSV(store, rows) {
  const g = (r, name) => { const k = Object.keys(r).find(x => x.trim().toLowerCase() === name.toLowerCase()); return k ? String(r[k]).trim() : ''; };
  const existing = new Set(store.state.raises.map(r => (r.employer || '').toLowerCase() + '|' + (r.date || '')));
  let added = 0, skipped = 0;
  rows.forEach(r => {
    const employer = g(r, 'Employer'), date = parseImportDate(g(r, 'Date'));
    // Header-tolerant: current "New gross" or the pre-1.0.63 "New gross per check".
    const amount = parseImportAmount(g(r, 'New gross') || g(r, 'New gross per check'));
    if (!employer || !date || isNaN(amount)) { skipped++; return; }
    const key = employer.toLowerCase() + '|' + date;
    if (existing.has(key)) { skipped++; return; }
    existing.add(key);
    const prev = parseImportAmount(g(r, 'Previous gross'));
    const net = parseImportAmount(g(r, 'New net'));
    const basisRaw = g(r, 'Amounts are');
    const basis = /hour|\bhr\b/i.test(basisRaw) ? 'hourly' : /annual|salary|year/i.test(basisRaw) ? 'annual' : 'check';
    const hoursYear = parseImportAmount(g(r, 'Hours worked (year)'));
    const yearGross = parseImportAmount(g(r, 'Year gross'));
    const yearNet = parseImportAmount(g(r, 'Year net'));
    store.saveRaise({ employer, title: g(r, 'Position title') || g(r, 'Position') || g(r, 'Title'), empType: g(r, 'Employment type') || g(r, 'Employment'), date, basis, amount, net: isNaN(net) ? null : net, prevAmount: isNaN(prev) ? null : prev, noPrev: /^y|^true/i.test(g(r, 'Standalone')), noRaise: /^y|^true/i.test(g(r, 'No new raise')), hoursYear: isNaN(hoursYear) ? null : hoursYear, yearGross: isNaN(yearGross) ? null : yearGross, yearNet: isNaN(yearNet) ? null : yearNet, notes: g(r, 'Notes') });
    added++;
  });
  toast('Imported ' + added + ' raise' + (added === 1 ? '' : 's') + (skipped ? ' · ' + skipped + ' skipped' : ''));
}
// Employer profile: tenure, totals paid, hours, hourly, raise history summary.
function employerProfileCard(store, emp) {
  const sch = store.state.paySchedules.find(x => (x.employer || '').toLowerCase() === emp.toLowerCase());
  let gross = 0, net = 0, regChecks = 0, allChecks = 0, firstPay = '', lastPay = '';
  Object.keys(store.state.years).forEach(yk => (store.state.years[yk].paychecks || []).forEach(pc => {
    if ((pc.employer || '').toLowerCase() !== emp.toLowerCase() || !isPaycheckPaid(pc)) return;
    gross += Number(pc.gross) || 0; net += paycheckNet(pc); allChecks++;
    if (!pc.checkType || pc.checkType === 'Regular') regChecks++;
    if (!firstPay || pc.payDate < firstPay) firstPay = pc.payDate;
    if (pc.payDate > lastPay) lastPay = pc.payDate;
  }));
  const raises = store.state.raises.filter(r => (r.employer || '').toLowerCase() === emp.toLowerCase()).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const hire = (sch && sch.hireDate) || firstPay;
  const employed = sch ? sch.active !== false : (lastPay && daysBetweenISO(todayISO(), lastPay) <= 45);
  const endD = employed ? todayISO() : lastPay;
  const days = (hire && endD) ? Math.max(0, daysBetweenISO(endD, hire)) : null;
  const card = el('div', 'card');
  card.appendChild(el('h3', 'strip-title', emp + (employed ? '' : ' · former')));
  const list = el('div', 'mini-list');
  const row = (l, v, sub) => { const rw = el('div', 'mini-row'); rw.appendChild(el('span', null, l)); const right = el('span'); right.appendChild(el('span', 'strong', v)); if (sub) right.appendChild(el('span', 'muted', ' ' + sub)); rw.appendChild(right); list.appendChild(rw); };
  if (sch && sch.taxForm && sch.taxForm !== 'none') row('Pay reported on', sch.taxForm, '');
  if (days != null) row('Employed', days + ' days', '(' + (days / 365.25).toFixed(1) + ' yrs' + (hire === (sch && sch.hireDate) ? ', since ' + fmtDate(hire) : ', from first paycheck') + (employed ? ')' : ', through last paycheck)'));
  row('Total paid (gross)', money(gross), 'net ' + money(net) + ' · from ' + allChecks + ' recorded paycheck' + (allChecks === 1 ? '' : 's') + ', all titles — years not entered in Clover aren’t counted');
  const yrEntries = raises.filter(x => (x.yearGross != null && x.yearGross !== '') || (x.yearNet != null && x.yearNet !== ''));
  if (yrEntries.length) {
    const yg = yrEntries.reduce((a, x) => a + (Number(x.yearGross) || 0), 0);
    const yn = yrEntries.reduce((a, x) => a + (Number(x.yearNet) || 0), 0);
    row('Reported year totals', money(yg) + ' gross', 'net ' + money(yn) + ' · summed from the Year gross/net figures on ' + yrEntries.length + ' raise/year record' + (yrEntries.length === 1 ? '' : 's'));
  }
  row('Regular checks', String(regChecks), '');
  if (sch && sch.hoursPerCheck) {
    row('Total hours (est.)', (regChecks * Number(sch.hoursPerCheck)).toLocaleString('en-US'), '@ ' + sch.hoursPerCheck + ' hrs/check');
    if (sch.gross) row('Hourly now', money(Number(sch.gross) / Number(sch.hoursPerCheck)) + '/hr gross', sch.net ? money(Number(sch.net) / Number(sch.hoursPerCheck)) + '/hr net' : '');
  }
  if (raises.length) {
    const realRaises = raises.filter(x => !x.noRaise);
    const last = (realRaises.length ? realRaises : raises)[Math.max(0, (realRaises.length ? realRaises : raises).length - 1)];
    const titled = raises.filter(x => (x.title || '').trim());
    if (titled.length) row('Position', titled[titled.length - 1].title, 'as of ' + fmtDate(titled[titled.length - 1].date));
    const typed = raises.filter(x => (x.empType || '').trim());
    if (typed.length) row('Employment type', typed[typed.length - 1].empType, 'as of ' + fmtDate(typed[typed.length - 1].date));
    row('Raises recorded', String(realRaises.length), (raises.length > realRaises.length ? '+ ' + (raises.length - realRaises.length) + ' year records · ' : '') + (realRaises.length ? 'last ' + fmtDate(realRaises[realRaises.length - 1].date) : ''));
    // Salary difference between years (first vs latest recorded amount) —
    // only comparable when both raises use the same per-check/annual basis.
    if (raises.length >= 2 && raises[0].amount != null && last.amount != null && (raises[0].basis || 'check') === (last.basis || 'check')) {
      const suf = last.basis === 'annual' ? '/yr' : last.basis === 'hourly' ? '/hr' : '/check';
      const diff = Number(last.amount) - Number(raises[0].amount);
      row('Since first recorded raise', (diff >= 0 ? '+' : '−') + money(Math.abs(diff)) + suf, money(raises[0].amount) + ' → ' + money(last.amount));
    }
  }
  card.appendChild(list);
  return card;
}
// YoY raise analysis vs inflation (shown once an employer has 3+ raises).
const RYOY_COL_LABELS = { date: 'Date', basis: 'Amounts are', empType: 'Employment', amount: 'New gross', yearGross: 'Year gross', yearNet: 'Year net', hours: 'Hours (yr)', hoursDelta: 'Hours vs prior yr', pct: 'Raise %', inflation: 'Inflation since prior raise', real: 'Real (vs inflation)', verdict: 'Verdict' };
const RYOY_ALL_COLS = ['date', 'basis', 'empType', 'amount', 'yearGross', 'yearNet', 'hours', 'hoursDelta', 'pct', 'inflation', 'real', 'verdict'];
const RYOY_DEFAULT_COLS = ['date', 'basis', 'empType', 'amount', 'yearGross', 'hours', 'hoursDelta', 'pct', 'inflation', 'real', 'verdict'];
function basisLabel(b) { return b === 'annual' ? 'Annual salary' : b === 'hourly' ? 'Hourly rate' : 'Per paycheck'; }
// A clickable tag in the YoY table — filters all YoY cards to that basis or
// employment type, and the raise-% chain recomputes over the displayed rows.
function yoyFilterBadge(key, value, label, tone) {
  const b = badge(label, tone || '');
  b.style.cursor = 'pointer';
  b.title = 'Click to show only “' + label + '” — the raise % chain recomputes over what’s shown';
  b.addEventListener('click', ev => {
    ev.stopPropagation();
    const cur = raiseYoYFilter;
    raiseYoYFilter = (cur && cur.key === key && cur.value === value) ? null : { key, value };
    renderView(currentRoute);
  });
  return b;
}
function buildRaiseYoYCol(key) {
  const pctCell = (v, titles) => { const td = el('td', 'num'); if (v == null) { td.textContent = '—'; return td; } const sp = el('span', v >= 0 ? 'pos' : 'neg', (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '%'); if (titles) td.title = v >= 0 ? titles[0] : titles[1]; td.appendChild(sp); return td; };
  switch (key) {
    case 'date': return { label: 'Date', key: 'date', value: x => x.date || '', cell: x => el('td', null, fmtDate(x.date)) };
    case 'basis': return { label: 'Amounts are', key: 'basis', value: x => basisLabel(x.basis), cell: x => { const td = el('td'); td.appendChild(yoyFilterBadge('basis', x.basis || 'check', basisLabel(x.basis), x.basis === 'hourly' ? 'amber' : x.basis === 'annual' ? 'green' : '')); return td; } };
    case 'empType': return { label: 'Employment', key: 'empType', value: x => x.empType || '', cell: x => { const td = el('td'); if (!x.empType) { td.textContent = '—'; return td; } td.appendChild(yoyFilterBadge('empType', x.empType, x.empType, x.empType === 'Full-time' ? 'green' : x.empType === 'Part-time' ? 'amber' : '')); return td; } };
    case 'amount': return { label: 'New gross', key: 'amount', num: true, value: x => Number(x.amount) || 0, cell: x => { const td = numCell(Number(x.amount) || 0, true); td.appendChild(el('span', 'muted', raiseSuf(x))); return td; } };
    case 'yearGross': return { label: 'Year gross', key: 'yearGross', num: true, value: x => x.annualG != null ? x.annualG : -1, cell: x => { if (x.annualG == null) return el('td', 'num', '—'); const td = numCell(x.annualG); if (x.annualDerived) { td.classList.add('muted'); td.title = 'The annual salary itself'; } return td; } };
    case 'yearNet': return { label: 'Year net', key: 'yearNet', num: true, value: x => x.yearNet != null ? Number(x.yearNet) : -1, cell: x => x.yearNet != null && x.yearNet !== '' ? numCell(Number(x.yearNet)) : el('td', 'num', '—') };
    case 'hours': return { label: 'Hours (yr)', key: 'hours', num: true, value: x => x.hours != null ? Number(x.hours) : -1, cell: x => el('td', 'num', x.hours != null && x.hours !== '' ? Number(x.hours).toLocaleString('en-US') : '—') };
    case 'hoursDelta': return { label: 'Hours vs prior yr', key: 'hoursDelta', num: true, value: x => x.hoursDelta == null ? -1e9 : x.hoursDelta, cell: x => { const td = pctCell(x.hoursDelta, ['Worked more hours than the prior recorded year', 'Worked fewer hours than the prior recorded year']); return td; } };
    case 'pct': return { label: 'Raise %', key: 'pct', num: true, value: x => x.pct == null ? -1e9 : x.pct, cell: x => { const td = pctCell(x.pct); if (x.pct != null && x.pctAnnualized) td.title = 'Compared on annual totals (hourly year vs salary)'; return td; } };
    case 'inflation': return { label: 'Inflation since prior raise', key: 'inflation', num: true, value: x => x.infl == null ? -1e9 : x.infl, cell: x => { const td = el('td', 'num'); if (x.infl == null) { td.textContent = '—'; return td; } td.textContent = x.infl.toFixed(1) + '%'; if (x.inflFrom !== x.inflTo) { td.appendChild(el('span', 'muted', ' over ' + (x.inflTo - x.inflFrom + 1) + ' yrs')); td.title = 'CPI-U compounded across ' + x.inflFrom + '–' + x.inflTo + ' — the whole stretch at the old pay'; } else td.title = 'CPI-U annual average for ' + x.inflTo; return td; } };
    case 'real': return { label: 'Real (vs inflation)', key: 'real', num: true, value: x => x.real == null ? -1e9 : x.real, cell: x => pctCell(x.real, ['Beat the cumulative inflation since the prior raise', 'Behind the cumulative inflation since the prior raise']) };
    case 'verdict': return { label: 'Verdict', key: 'verdict', value: x => x.real == null ? '' : (x.real >= 0 ? 'Beat inflation' : 'Didn’t beat'), cell: x => { const td = el('td'); if (x.real == null) { td.textContent = '—'; return td; } td.appendChild(badge(x.real >= 0 ? 'Beat inflation' : 'Didn’t beat inflation', x.real >= 0 ? 'green' : 'red')); return td; } };
  }
  return null;
}
function raiseYoYCard(store, emp) {
  const all = store.state.raises.filter(r => (r.employer || '').toLowerCase() === emp.toLowerCase() && r.amount != null).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (all.length < 3) return null;
  const card = el('div', 'card');
  const yh = el('div', 'view-head');
  yh.appendChild(el('h3', 'strip-title', 'YoY raises vs inflation · ' + emp));
  yh.appendChild(columnsButton('raiseYoY', RYOY_ALL_COLS, RYOY_DEFAULT_COLS, RYOY_COL_LABELS, 'YoY raise columns'));
  card.appendChild(yh);
  // Tag filter: the chain below recomputes over the DISPLAYED rows only.
  let raises = all;
  if (raiseYoYFilter) {
    const f = raiseYoYFilter;
    raises = all.filter(r => f.key === 'basis' ? (r.basis || 'check') === f.value : (r.empType || '') === f.value);
    const fb = el('div', 'filter-bar');
    fb.appendChild(el('span', 'muted', 'Showing ' + raises.length + ' of ' + all.length + ' where ' + (f.key === 'basis' ? 'amounts are' : 'employment') + ' = “' + (f.key === 'basis' ? basisLabel(f.value) : f.value) + '” — raise % recomputed over what’s shown'));
    const clear = el('button', 'btn-ghost', '✕ Clear filter');
    clear.addEventListener('click', () => { raiseYoYFilter = null; renderView(currentRoute); });
    fb.appendChild(clear);
    card.appendChild(fb);
  }
  // Chain: each raise's % over the prior DISPLAYED one. Same basis compares
  // directly; an hourly year with a recorded Year gross compares against an
  // annual salary on annual totals — that's what makes hourly-vs-salary math
  // possible. An explicit Previous always wins; noPrev breaks the chain.
  const annualOf = x => (x.basis === 'annual') ? Number(x.amount) : (x.basis === 'hourly' && x.yearGross != null && x.yearGross !== '') ? Number(x.yearGross) : null;
  const rows = raises.map((r, i) => {
    const prevR = i > 0 ? raises[i - 1] : null;
    let prev = (r.prevAmount != null && r.prevAmount !== '') ? Number(r.prevAmount) : null;
    let cur = Number(r.amount), pctAnnualized = false;
    if (prev == null && prevR && !r.noPrev) {
      if ((prevR.basis || 'check') === (r.basis || 'check')) prev = Number(prevR.amount);
      else if (annualOf(r) != null && annualOf(prevR) != null) { prev = annualOf(prevR); cur = annualOf(r); pctAnnualized = true; }
    }
    const pct = (prev && prev > 0) ? (cur - prev) / prev * 100 : null;
    let hoursDelta = null;
    if (r.hoursYear != null && r.hoursYear !== '' && prevR && prevR.hoursYear != null && prevR.hoursYear !== '' && Number(prevR.hoursYear) > 0)
      hoursDelta = (Number(r.hoursYear) - Number(prevR.hoursYear)) / Number(prevR.hoursYear) * 100;
    // Inflation ACCUMULATES across the whole span at the old pay: a raise in
    // 2022 after flat pay since 2018 is measured against 2019–2022 price
    // growth compounded, not just 2022's. Real % uses the proper ratio,
    // (1 + raise) / (1 + inflation) − 1.
    const yr = +String(r.date || '').slice(0, 4);
    const prevYr = prevR ? +String(prevR.date || '').slice(0, 4) : null;
    const spanYears = [];
    if (prevYr != null && yr > prevYr) { for (let y = prevYr + 1; y <= yr; y++) spanYears.push(y); }
    else spanYears.push(yr);
    let cum = 1, inflOk = true;
    spanYears.forEach(y => { const v = INFLATION_CPI[y]; if (v == null) inflOk = false; else cum *= (1 + v / 100); });
    const infl = inflOk ? (cum - 1) * 100 : null;
    const real = (pct != null && infl != null) ? ((1 + pct / 100) / (1 + infl / 100) - 1) * 100 : null;
    return { date: r.date, amount: r.amount, basis: r.basis, empType: r.empType, noRaise: !!r.noRaise,
      annualG: annualOf(r), annualDerived: r.basis === 'annual', yearNet: r.basis === 'annual' ? r.net : r.yearNet, hours: r.hoursYear, hoursDelta,
      pct, pctAnnualized, infl, inflFrom: spanYears[0], inflTo: spanYears[spanYears.length - 1], real };
  });
  const cols = tableColKeys(store, 'raiseYoY', RYOY_COL_LABELS, RYOY_DEFAULT_COLS).map(k => buildRaiseYoYCol(k)).filter(Boolean);
  const wrap = el('div', 'table-scroll');
  wrap.appendChild(sortableTable(cols, rows, raiseYoYSort, ns => { raiseYoYSort = ns || { key: 'date', dir: 'desc' }; renderView(currentRoute); }, x => x.noRaise ? 'no-raise-row' : ''));
  card.appendChild(wrap);
  card.appendChild(el('div', 'sum-hint', 'Inflation compounds the US CPI-U annual averages (2025 preliminary) across every year since the prior raise — pay that stayed flat 2018→2022 is measured against 2019–2022 price growth, not just 2022’s. “Real” adjusts the raise for that cumulative inflation: (1 + raise) ÷ (1 + inflation) − 1. Year gross for an hourly year is the recorded total paid; for a salary year it’s the salary itself — those annual figures are what let an hourly year compare against a salary.'));
  return card;
}

// The two top raises sections as movable/resizable panels (same engine as
// the dashboard: drag, snap widths, half height, remove/re-add, packing).
let raisesUnlocked = false;
const RAISES_PANEL_DEFS = [
  { key: 'sinceCards', title: 'Since last raise', span2: true, build: ctx => raisesSinceCards(ctx.store) },
  { key: 'profiles', title: 'Employer profiles', span2: true, build: ctx => raisesProfilesGrid(ctx.store) }
];
function raisesSinceCards(store) {
  const s = store.state;
  // Per-employer "days since last raise" — ongoing while still employed (active
  // schedule or a paycheck in the last 45 days), else counted to the last check.
  const byEmp = {};
  s.raises.forEach(r => { if (r.noRaise) return; const k = (r.employer || '').toLowerCase(); if (!byEmp[k] || (r.date || '') > (byEmp[k].date || '')) byEmp[k] = r; });
  const sum = el('div', 'sub-summary');
  if (!Object.keys(byEmp).length) { sum.appendChild(el('div', 'muted', 'No raises recorded yet.')); return sum; }
  Object.values(byEmp).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 4).forEach(r => {
    const emp = r.employer || '—';
    const lastPay = lastPaycheckDateFor(store, emp);
    const employed = activeSchedules(store).some(sch => (sch.employer || '').toLowerCase() === emp.toLowerCase())
      || (lastPay && daysBetweenISO(todayISO(), lastPay) <= 45);
    const days = employed ? daysBetweenISO(todayISO(), r.date) : (lastPay ? Math.max(0, daysBetweenISO(lastPay, r.date)) : null);
    sum.appendChild(sumCard(emp, days == null ? '—' : (days + 'd'), 'neutral',
      'since last raise (' + fmtDate(r.date) + ')' + (employed ? ' · counting' : ' · through last paycheck')));
  });
  return sum;
}
function raisesProfilesGrid(store) {
  const s = store.state;
  const profEmps = [...new Set(s.raises.map(r => (r.employer || '').trim()).filter(Boolean))];
  const profGrid = el('div', 'dash-cols');
  if (!profEmps.length) { profGrid.appendChild(el('div', 'muted', 'No employers yet.')); return profGrid; }
  profEmps.slice(0, 4).forEach(emp => profGrid.appendChild(employerProfileCard(store, emp)));
  return profGrid;
}
function renderRaises(view) {
  const store = window.cloverStore, s = store.state;
  ensureYearsScanned(store);
  const head = el('div', 'view-head');
  const left = el('div'); left.appendChild(el('h3', null, 'Raises'));
  left.appendChild(el('p', 'muted', 'When each job last raised your pay, and how long between raises.'));
  head.appendChild(left);
  const actions = el('div', 'head-actions');
  const rTmpl = el('button', 'btn-ghost', '⬇ Template');
  rTmpl.addEventListener('click', () => downloadFile('clover-raises-template.csv', RAISES_TEMPLATE_CSV, 'text/csv'));
  actions.appendChild(rTmpl);
  const rImpLabel = el('label', 'btn-ghost file-btn'); rImpLabel.textContent = '⬆ Import CSV';
  const rImpIn = document.createElement('input'); rImpIn.type = 'file'; rImpIn.accept = '.csv,text/csv'; rImpIn.style.display = 'none';
  rImpIn.addEventListener('change', async () => {
    const file = rImpIn.files && rImpIn.files[0]; if (!file) return;
    let Papa; try { Papa = await ensurePapa(); } catch (e) { toast('CSV parser couldn’t load', 'warn'); return; }
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: res => { if (!res.data.length) { toast('No rows found', 'warn'); return; } importRaisesCSV(store, res.data); }, error: () => toast('Couldn’t read that CSV', 'warn') });
  });
  rImpLabel.appendChild(rImpIn); actions.appendChild(rImpLabel);
  if (s.raises.length) { const rExp = el('button', 'btn-ghost', '⬇ Export CSV'); rExp.addEventListener('click', () => exportRaisesCSV(store)); actions.appendChild(rExp); }
  const detect = el('button', 'btn-ghost', '⛏ Detect from paychecks');
  detect.title = 'Scan your recorded paychecks for gross-amount changes and propose them as raises';
  detect.addEventListener('click', () => detectRaisesModal());
  actions.appendChild(detect);
  const lockBtn = el('button', 'btn-ghost', raisesUnlocked ? '✓ Done editing' : '✎ Edit layout');
  lockBtn.title = raisesUnlocked ? 'Keep these changes and lock the layout' : 'Unlock to reorder, resize, remove, or add the top panels';
  lockBtn.addEventListener('click', () => {
    if (!raisesUnlocked) panelSnapshots.raises = JSON.parse(JSON.stringify((store.state.settings.pagePanels || {}).raises || null));
    raisesUnlocked = !raisesUnlocked; renderView(currentRoute);
  });
  actions.appendChild(lockBtn);
  if (raisesUnlocked) {
    const cancelBtn = el('button', 'btn-ghost', '✕ Cancel changes');
    cancelBtn.title = 'Put the layout back the way it was when you started editing';
    cancelBtn.addEventListener('click', () => { raisesUnlocked = false; store.setPagePanels('raises', panelSnapshots.raises); });
    actions.appendChild(cancelBtn);
  }
  const add = el('button', 'btn-primary', '+ Add raise'); add.addEventListener('click', () => raiseModal(null));
  actions.appendChild(add);
  head.appendChild(actions);
  view.appendChild(head);

  if (!s.raises.length) {
    view.appendChild(emptyState('No raises recorded yet', 'Add raises by hand, or use “Detect from paychecks” to find where your gross per check changed.', '+ Add raise', () => raiseModal(null)));
    return;
  }

  // Top sections as panels: drag / resize / remove like the dashboard.
  const pState = pagePanelState(store, 'raises', RAISES_PANEL_DEFS);
  const pOpts = { unlocked: raisesUnlocked, save: arr => store.setPagePanels('raises', arr) };
  if (raisesUnlocked) {
    const addRow = el('div', 'dash-add-row');
    addRow.appendChild(el('span', 'muted', 'Drag panels to reorder · ✕ removes · click a header to collapse.'));
    RAISES_PANEL_DEFS.filter(d => pState.some(px => px.k === d.key && px.off)).forEach(d => {
      const b = el('button', 'btn-ghost', '＋ ' + d.title);
      b.addEventListener('click', () => { const en = pState.find(px => px.k === d.key); en.off = 0; store.setPagePanels('raises', pState); });
      addRow.appendChild(b);
    });
    view.appendChild(addRow);
  }
  const pGrid = el('div', 'dash-panels');
  const pCtx = { store };
  pState.forEach(entry => {
    if (entry.off) return;
    const def = RAISES_PANEL_DEFS.find(d => d.key === entry.k); if (!def) return;
    pGrid.appendChild(dashPanel(store, def, entry, pState, pCtx, pOpts));
  });
  view.appendChild(pGrid);
  attachPanelPacking(pGrid);

  // Employer profiles' YoY-vs-inflation analysis stays below the panels.
  const profEmps = [...new Set(s.raises.map(r => (r.employer || '').trim()).filter(Boolean))];
  profEmps.forEach(emp => { const yoy = raiseYoYCard(store, emp); if (yoy) view.appendChild(yoy); });

  const cols = [
    ...tableColKeys(store, 'raises', RAISE_COL_LABELS, RAISE_DEFAULT_COLS).map(k => buildRaiseCol(store, k)).filter(Boolean),
    { label: '', sortable: false, cell: r => {
        const td = el('td', 'row-actions');
        const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => raiseModal(r));
        const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove((r.employer || 'raise') + ' · ' + fmtDate(r.date), () => store.removeRaise(r.id)));
        td.appendChild(edit); td.appendChild(del); return td; } }
  ];
  view.appendChild(el('h3', 'strip-title', 'All raises'));
  view.appendChild(tableTools(columnsButton('raises', RAISE_ALL_COLS, RAISE_DEFAULT_COLS, RAISE_COL_LABELS, 'Raise columns')));
  const card = el('div', 'card table-card');
  card.appendChild(sortableTable(cols, s.raises, raisesSort, ns => { raisesSort = ns || { key: 'date', dir: 'desc' }; renderView(currentRoute); }, r => r.noRaise ? 'no-raise-row' : ''));
  view.appendChild(card);
}
function raiseModal(existing) {
  const store = window.cloverStore, s = store.state;
  const r = existing ? Object.assign({}, existing) : { date: todayISO() };
  const body = el('div', 'form-grid');
  const empList = el('datalist'); empList.id = 'raise-emp-list';
  const emps = new Set(s.raises.map(x => x.employer).filter(Boolean));
  Object.keys(store.state.years).forEach(yk => (store.state.years[yk].paychecks || []).forEach(p => { if (p.employer) emps.add(p.employer); }));
  [...emps].forEach(e => { const o = el('option'); o.value = e; empList.appendChild(o); });
  body.appendChild(empList);
  const fEmp = input(r.employer || '', { placeholder: 'Employer', list: 'raise-emp-list' });
  const fTitle = input(r.title || '', { placeholder: 'e.g. Senior Tech II (optional)' });
  const fEmpType = select([{ value: '', label: '—' }, 'Full-time', 'Part-time', 'Seasonal', 'Contract', 'Temporary', 'Per diem'], r.empType || '');
  const fDate = input(r.date || todayISO(), { type: 'date' });
  const fBasis = select([{ value: 'check', label: 'Per paycheck' }, { value: 'annual', label: 'Annual salary' }, { value: 'hourly', label: 'Hourly rate' }], r.basis || 'check');
  const fAmt = moneyInput(r.amount);
  const fNet = moneyInput(r.net);
  const fPrev = moneyInput(r.prevAmount);
  const cNoPrev = checkbox('Doesn’t follow the prior raise', r.noPrev, 'Normally, when Previous is left blank, Clover infers it from this employer’s prior recorded raise. Tick this when that comparison doesn’t apply — e.g. a different role or pay structure.');
  const fNotes = document.createElement('textarea'); fNotes.value = r.notes || ''; fNotes.rows = 2; fNotes.placeholder = 'Optional — promotion, annual review, etc.';
  const fHoursYr = input(r.hoursYear != null ? r.hoursYear : '', { type: 'number', placeholder: 'e.g. 1200' }); fHoursYr.step = 'any'; fHoursYr.min = 0;
  const fYearGross = moneyInput(r.yearGross);
  const fYearNet = moneyInput(r.yearNet);
  body.appendChild(field('Employer', fEmp, 'Which job the raise is from — matches your paycheck employer names.'));
  const cNoRaise = checkbox('No new raise — year record only', r.noRaise, 'Tick to log a year where pay stayed the same: same gross/net as before, plus that year’s hours and totals. It shows greyed in the tables and counts as +0% against that year’s inflation — which is the honest picture of a flat year.');
  const nrWrap = el('div', 'check-row'); nrWrap.appendChild(cNoRaise);
  body.appendChild(field('Record type', nrWrap));
  const tRow = el('div', 'two-col');
  tRow.appendChild(field('Position title', fTitle, 'Your title as of this pay change — record it here when a raise came with a promotion or title change.'));
  tRow.appendChild(field('Employment type', fEmpType, 'Full-time, part-time, seasonal, contract… as of this pay change.'));
  body.appendChild(tRow);
  const dRow = el('div', 'two-col');
  dRow.appendChild(field('Effective date', fDate, 'The first pay date at the new amount (or the date the raise took effect).'));
  dRow.appendChild(field('Amounts are', fBasis, 'Whether the amounts below are per paycheck, annual salary figures, or an hourly rate. Change $ and % work on any basis — just use the same one for new and previous.'));
  body.appendChild(dRow);
  const amtRow = el('div', 'two-col');
  const amtField = field('New gross per check', fAmt, 'Your gross after the raise, on the basis picked above.');
  const netField = field('New net per check (optional)', fNet, 'Your take-home after the raise, if you want to track it too.');
  amtRow.appendChild(amtField);
  amtRow.appendChild(netField);
  body.appendChild(amtRow);
  const prevRow = el('div', 'two-col');
  prevRow.appendChild(field('Previous gross (optional)', fPrev, 'Gross before the raise, same basis — enables the change $ and %. Left blank, it\u2019s inferred from this employer\u2019s prior recorded raise.'));
  const npWrap = el('div', 'check-row'); npWrap.appendChild(cNoPrev);
  prevRow.appendChild(field('If blank', npWrap));
  body.appendChild(prevRow);
  const amtLbl = amtField.querySelector('span').childNodes[0];
  const netLbl = netField.querySelector('span').childNodes[0];
  // Hours worked applies to any basis — salaried people can track hours too
  // (it shows the true hourly picture). The year's paid totals stay
  // hourly-only, since a salary already implies them.
  body.appendChild(field('Hours worked that year (optional)', fHoursYr, 'Actual hours worked during this raise’s year. For hourly pay it drives the year totals (pay varies with hours); on a salary it shows what your time really earned per hour.'));
  const hourlyWrap = el('div');
  const hyRow = el('div', 'two-col');
  hyRow.appendChild(field('Total paid that year — gross (optional)', fYearGross, 'What this job actually paid you that year before taxes.'));
  hyRow.appendChild(field('Total paid that year — net (optional)', fYearNet, 'What actually hit your account that year.'));
  hourlyWrap.appendChild(hyRow);
  body.appendChild(hourlyWrap);
  const syncBasis = () => {
    const b = fBasis.value;
    amtLbl.nodeValue = b === 'annual' ? 'New annual gross salary' : b === 'hourly' ? 'New hourly rate (gross)' : 'New gross per check';
    netLbl.nodeValue = b === 'annual' ? 'New annual net (optional)' : b === 'hourly' ? 'New hourly net (optional)' : 'New net per check (optional)';
    hourlyWrap.style.display = b === 'hourly' ? '' : 'none';
  };
  fBasis.addEventListener('change', syncBasis); syncBasis();
  body.appendChild(field('Notes', fNotes, 'Anything worth remembering — promotion, title change, merit increase.'));
  openModal({
    title: existing ? 'Edit raise' : 'Add raise', body: withHistoryTab(body, existing), confirmLabel: 'Save',
    onConfirm: () => {
      if (!fEmp.value.trim()) { fEmp.focus(); toast('Employer is required', 'warn'); return false; }
      const amount = parseFloat(fAmt.value);
      if (isNaN(amount)) { fAmt.focus(); toast('New gross amount is required', 'warn'); return false; }
      store.saveRaise(Object.assign(r, {
        employer: fEmp.value.trim(), title: fTitle.value.trim(), empType: fEmpType.value, noRaise: cNoRaise.__input.checked, date: fDate.value || todayISO(),
        basis: fBasis.value, amount, net: fNet.value === '' ? null : parseFloat(fNet.value),
        prevAmount: fPrev.value === '' ? null : parseFloat(fPrev.value), noPrev: cNoPrev.__input.checked,
        hoursYear: fHoursYr.value === '' ? null : parseFloat(fHoursYr.value),
        yearGross: fYearGross.value === '' ? null : parseFloat(fYearGross.value),
        yearNet: fYearNet.value === '' ? null : parseFloat(fYearNet.value), notes: fNotes.value.trim()
      }));
      toast(existing ? 'Raise updated' : 'Raise added');
    }
  });
}
// Scan recorded paychecks for gross changes and propose them as raises.
function detectRaisesModal() {
  const store = window.cloverStore, s = store.state;
  ensureYearsScanned(store);
  const byEmp = {};
  Object.keys(store.state.years).forEach(yk => (store.state.years[yk].paychecks || []).forEach(p => {
    if (!p.employer || !p.payDate || !(Number(p.gross) > 0) || !isPaycheckPaid(p)) return;
    if (p.checkType && p.checkType !== 'Regular') return;   // bonuses etc. aren't raises
    (byEmp[p.employer] = byEmp[p.employer] || []).push(p);
  }));
  const existing = new Set(s.raises.map(r => (r.employer || '').toLowerCase() + '|' + (r.date || '')));
  const candidates = [];
  Object.keys(byEmp).forEach(emp => {
    const list = byEmp[emp].sort((a, b) => (a.payDate || '').localeCompare(b.payDate || ''));
    for (let i = 1; i < list.length; i++) {
      const prev = Number(list[i - 1].gross), cur = Number(list[i].gross);
      if (Math.abs(cur - prev) < 0.01) continue;
      if (existing.has(emp.toLowerCase() + '|' + list[i].payDate)) continue;
      candidates.push({ employer: emp, date: list[i].payDate, amount: cur, prevAmount: prev, up: cur > prev });
    }
  });
  if (!candidates.length) { toast('No unrecorded pay changes found in your paychecks'); return; }
  const body = el('div');
  body.appendChild(el('p', 'muted', 'Gross-per-check changes found in your paychecks. Increases are checked by default; decreases usually mean a one-off (bonus reverting, missed hours) — check them only if the pay cut was real.'));
  const boxes = [];
  const list = el('div', 'mini-list');
  candidates.forEach(c => {
    const row = el('div', 'mini-row');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = c.up; boxes.push({ cb, c });
    const left = el('span'); left.appendChild(cb);
    left.appendChild(document.createTextNode(' ' + c.employer + ' · ' + fmtDate(c.date) + ' · ' + money(c.prevAmount) + ' → ' + money(c.amount) + ' '));
    left.appendChild(el('span', c.up ? 'pos' : 'neg', (c.up ? '+' : '−') + money(Math.abs(c.amount - c.prevAmount))));
    row.appendChild(left); list.appendChild(row);
  });
  body.appendChild(list);
  openModal({
    title: 'Detected pay changes (' + candidates.length + ')', body, confirmLabel: 'Add selected',
    onConfirm: () => {
      let n = 0;
      boxes.forEach(({ cb, c }) => { if (cb.checked) { store.saveRaise({ employer: c.employer, date: c.date, basis: 'check', amount: c.amount, prevAmount: c.prevAmount, notes: '' }); n++; } });
      toast(n ? ('Added ' + n + ' raise' + (n === 1 ? '' : 's')) : 'Nothing selected');
    }
  });
}

// ============================================================
// Credit scores + savings-rate history (Phase 5) — first charts
// ============================================================
let _chartLoading = null;
function ensureChart() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (_chartLoading) return _chartLoading;
  _chartLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
    s.onload = () => resolve(window.Chart);
    s.onerror = () => { _chartLoading = null; reject(new Error('Chart.js failed to load')); };
    document.head.appendChild(s);
  });
  return _chartLoading;
}
const CHART_PALETTE = ['#16a34a', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ca8a04', '#475569'];
let _charts = [];
function destroyCharts() { _charts.forEach(c => { try { c.destroy(); } catch (e) {} }); _charts = []; }
function fmtDateShort(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); if (!m) return iso; return (+m[2]) + '/' + (+m[3]) + '/' + m[1].slice(2); }
// Local wall-clock of a stored timestamp (createdAt/updatedAt are ISO/UTC).
function fmtDateTimeLocal(iso) { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
// Compact "when it was logged" stamp. Shows just the time when it happened on
// the same day as the row's own date; otherwise it leads with the day, so a
// bare time never sits misleadingly under a different date.
function stampText(iso, refDateIso) {
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  const dayOf = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return (refDateIso && dayOf === String(refDateIso).slice(0, 10)) ? time : (d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + time);
}

async function buildLineChart(canvas, cfg) {
  let Chart;
  try { Chart = await ensureChart(); } catch (e) { canvas.parentElement && canvas.parentElement.appendChild(el('div', 'muted', 'Chart could not load (offline?).')); return; }
  if (!canvas.isConnected) return;
  _charts.push(new Chart(canvas, {
    type: 'line',
    data: { labels: cfg.labels, datasets: cfg.datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: { legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true, font: { size: 12 } } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#5f6f66', maxRotation: 0, autoSkip: true } },
        y: { title: { display: !!cfg.yTitle, text: cfg.yTitle || '' }, ticks: { font: { size: 11 }, color: '#5f6f66' }, grid: { color: '#eef1ef' } }
      }
    }
  }));
}

// Doughnut chart for category breakdowns.
async function buildDoughnut(canvas, cfg) {
  let Chart;
  try { Chart = await ensureChart(); } catch (e) { canvas.parentElement && canvas.parentElement.appendChild(el('div', 'muted', 'Chart could not load (offline?).')); return; }
  if (!canvas.isConnected) return;
  // The right-hand legend needs a row per slice. If the box is too short,
  // Chart.js silently wraps it into a second column that runs off the canvas
  // and gets clipped — grow the container to fit rather than lose a category
  // off the edge.
  const host = canvas.parentElement;
  if (host) {
    const need = cfg.labels.length * 26 + 24;
    if (need > host.clientHeight) host.style.height = need + 'px';
  }
  _charts.push(new Chart(canvas, {
    type: 'doughnut',
    data: { labels: cfg.labels, datasets: [{ data: cfg.data, backgroundColor: cfg.labels.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]), borderWidth: 2, borderColor: '#fff' }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 12, usePointStyle: true, font: { size: 12 } } },
        tooltip: { callbacks: { label: (ctx) => ctx.label + ': ' + money(ctx.parsed) } }
      }
    }
  }));
}

let creditSort = { key: 'date', dir: 'desc' };
let rateSort = { key: 'date', dir: 'desc' };
const COMMON_PROVIDERS = ['Credit Karma', 'Chase', 'Amex', 'Discover', 'Experian', 'Equifax', 'TransUnion', 'FICO', 'VantageScore'];

// Shared date-range filter for the Credit & Rates charts.
// mode: 'all' | a 4-digit year string | 'custom' (uses from/to ISO dates).
let chartRange = { mode: 'all', from: '', to: '' };

function chartRangeInRange(dateStr) {
  if (!dateStr) return false;
  if (chartRange.mode === 'all') return true;
  if (chartRange.mode === 'custom') {
    if (chartRange.from && dateStr < chartRange.from) return false;
    if (chartRange.to && dateStr > chartRange.to) return false;
    return true;
  }
  return dateStr.slice(0, 4) === chartRange.mode; // specific year
}

// Reset a stale year selection when switching to a tab that lacks that year.
function normalizeChartRange(rows) {
  if (chartRange.mode === 'all' || chartRange.mode === 'custom') return;
  const years = new Set(rows.map(r => (r.date || '').slice(0, 4)));
  if (!years.has(chartRange.mode)) chartRange.mode = 'all';
}

function chartRangeControls(rows, onChange) {
  const bar = el('div', 'chart-range');
  const years = [...new Set(rows.map(r => (r.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const sel = el('select');
  const opt = (v, l) => { const o = el('option', null, l); o.value = v; if (chartRange.mode === v) o.selected = true; sel.appendChild(o); };
  opt('all', 'All time');
  years.forEach(y => opt(y, y));
  opt('custom', 'Custom range…');
  sel.addEventListener('change', () => { chartRange.mode = sel.value; onChange(); });
  const lbl = el('label', 'range-label'); lbl.appendChild(el('span', null, 'Chart range')); lbl.appendChild(sel);
  bar.appendChild(lbl);
  if (chartRange.mode === 'custom') {
    const mk = (label, val, set) => {
      const inp = el('input'); inp.type = 'date'; if (val) inp.value = val;
      inp.addEventListener('change', () => { set(inp.value); onChange(); });
      const l = el('label', 'range-label'); l.appendChild(el('span', null, label)); l.appendChild(inp); return l;
    };
    bar.appendChild(mk('From', chartRange.from, v => chartRange.from = v));
    bar.appendChild(mk('To', chartRange.to, v => chartRange.to = v));
  }
  return bar;
}

function renderCredit(view) {
  destroyCharts();
  const store = window.cloverStore, s = store.state;
  const head = el('div', 'view-head');
  const left = el('div');
  left.appendChild(el('h3', null, 'Credit & Rates'));
  const cnt = creditTab === 'credit' ? (s.creditScores.length + ' score' + (s.creditScores.length === 1 ? '' : 's'))
                                     : (s.rateHistory.length + ' rate entr' + (s.rateHistory.length === 1 ? 'y' : 'ies'));
  left.appendChild(el('p', 'muted', cnt));
  head.appendChild(left);
  const right = el('div', 'head-actions');
  const tabs = el('div', 'tabs');
  [['credit', 'Credit scores'], ['rates', 'Savings rates']].forEach(([t, label]) => {
    const b = el('button', 'tab' + (creditTab === t ? ' active' : ''), label);
    b.addEventListener('click', () => { creditTab = t; renderView(currentRoute); });
    tabs.appendChild(b);
  });
  right.appendChild(tabs);
  const add = el('button', 'btn-primary', creditTab === 'credit' ? '+ Add score' : '+ Add rate');
  add.addEventListener('click', () => creditTab === 'credit' ? creditScoreModal(null) : rateModal(null));
  right.appendChild(add);
  head.appendChild(right);
  view.appendChild(head);

  if (creditTab === 'credit') renderCreditTab(view); else renderRatesTab(view);
  view.appendChild(fomcCard());
}

// FOMC rate-decision dates live on the Credit & Rates page because they're the
// backdrop for everything here — savings APYs, CD rollovers, loan rates all move
// with them. Shows the next few meetings, flags the projection ("dot plot")
// meetings, and nags when the built-in schedule is close to running out.
function fomcCard() {
  const card = el('div', 'card');
  card.appendChild(sectionHead('FOMC meetings', 'When the Fed sets interest rates — the backdrop for your APYs, CDs, and loan rates'));
  if (!fomcShown()) card.appendChild(el('div', 'budget-reminder', 'Hidden from the Calendar right now — turn “Show FOMC meeting dates” back on under Settings → Calendar.'));
  const today = todayISO();
  const upcoming = fomcMeetings().filter(m => m.end >= today).slice(0, 5);
  if (!upcoming.length) {
    card.appendChild(el('div', 'muted', 'The built-in schedule has run out — time to add the next year’s dates.'));
  } else {
    const list = el('div', 'mini-list');
    upcoming.forEach(m => {
      const row = el('div', 'mini-row');
      const l = el('span'); l.appendChild(el('span', null, fomcRangeText(m)));
      if (m.sep) { l.appendChild(document.createTextNode(' ')); const b = badge('projections', 'purple'); b.title = 'Meeting with a Summary of Economic Projections — the “dot plot” of rate expectations'; l.appendChild(b); }
      row.appendChild(l);
      const days = daysUntil(m.end);
      row.appendChild(el('span', 'muted', days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days'));
      list.appendChild(row);
    });
    card.appendChild(list);
  }
  if (fomcNeedsRefresh()) {
    const warn = el('div', 'budget-reminder');
    warn.style.marginTop = '10px';
    warn.textContent = 'Heads-up: the FOMC schedule only runs through ' + fomcLoadedThroughYear() + '. The monthly auto-update extends it once the Fed posts the next year; if this lingers past then, check the refresh job (or add the dates from the calendar below).';
    card.appendChild(warn);
  }
  const note = el('p', 'muted'); note.style.marginTop = '10px';
  const srcNote = _fomcLive ? ('Auto-updated ' + (_fomcUpdated ? fmtDate(_fomcUpdated) : 'recently') + ' from the Fed’s calendar by a scheduled job — no manual step. ') : 'Using the built-in schedule (live update not loaded yet). ';
  note.appendChild(document.createTextNode(srcNote + 'The decision lands on the second day of each meeting (~2:00 PM ET). Dates only, no minutes. Loaded through ' + fomcLoadedThroughYear() + ': '));
  const a = el('a', null, 'federalreserve.gov/monetarypolicy/fomccalendars.htm');
  a.href = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'; a.target = '_blank'; a.rel = 'noopener noreferrer';
  note.appendChild(a);
  note.appendChild(document.createTextNode('.'));
  card.appendChild(note);
  return card;
}

const CREDIT_COL_LABELS = { date: 'Date', score: 'Score', provider: 'Provider' };
const CREDIT_ALL_COLS = ['date', 'score', 'provider'];
function buildCreditCol(store, key) {
  switch (key) {
    case 'date': return { label: 'Date', key: 'date', value: r => r.date || '', cell: r => el('td', null, fmtDate(r.date)) };
    case 'score': return { label: 'Score', key: 'score', num: true, value: r => Number(r.score) || 0, cell: r => { const td = el('td', 'num strong'); td.textContent = r.score || '—'; return td; } };
    case 'provider': return { label: 'Provider', key: 'provider', value: r => r.provider || '', cell: r => el('td', null, r.provider || '—') };
  }
  return null;
}
const RATES_COL_LABELS = { date: 'Date', institution: 'Bank / institution', apy: 'APY' };
const RATES_ALL_COLS = ['date', 'institution', 'apy'];
function buildRatesCol(store, key) {
  switch (key) {
    case 'date': return { label: 'Date', key: 'date', value: r => r.date || '', cell: r => el('td', null, fmtDate(r.date)) };
    case 'institution': return { label: 'Bank / institution', key: 'institution', value: r => rateInstitution(store, r), cell: r => el('td', null, rateInstitution(store, r) || '—') };
    case 'apy': return { label: 'APY', key: 'apy', num: true, value: r => Number(r.apy) || 0, cell: r => { const td = el('td', 'num strong'); td.textContent = (r.apy != null && r.apy !== '') ? (Number(r.apy).toFixed(2) + '%') : '—'; return td; } };
  }
  return null;
}

// High/low summary, like a stock's all-time and 52-week range. Credit models
// differ between providers (a Credit Karma VantageScore isn't a FICO 8), so each
// high/low names the provider that reported it — the record is across everything
// you've logged, and the provider tells you which model that number came from.
function creditHiLoCards(all) {
  const scored = all.filter(r => r.score != null && r.score !== '' && !isNaN(Number(r.score)))
    .slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const wrap = el('div', 'sub-summary');
  if (!scored.length) return wrap;
  // Ties keep the earliest date — the day the record was first set.
  const hiOf = arr => arr.reduce((best, r) => Number(r.score) > Number(best.score) ? r : best, arr[0]);
  const loOf = arr => arr.reduce((best, r) => Number(r.score) < Number(best.score) ? r : best, arr[0]);
  const sub = r => (r.provider || 'Unknown') + ' · ' + fmtDate(r.date);
  const hi = hiOf(scored), lo = loOf(scored);
  wrap.appendChild(sumCard('All-time high', String(hi.score), 'income', sub(hi)));
  wrap.appendChild(sumCard('All-time low', String(lo.score), '', sub(lo)));
  const yr = new Date().getFullYear();
  const yrScores = scored.filter(r => (r.date || '').slice(0, 4) === String(yr));
  if (yrScores.length) {
    const yhi = hiOf(yrScores), ylo = loOf(yrScores);
    wrap.appendChild(sumCard(yr + ' high', String(yhi.score), 'income', sub(yhi)));
    wrap.appendChild(sumCard(yr + ' low', String(ylo.score), '', sub(ylo)));
  }
  return wrap;
}
function renderCreditTab(view) {
  const store = window.cloverStore, s = store.state;
  const allRows = s.creditScores.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!allRows.length) { view.appendChild(emptyState('No credit scores yet', 'Log your scores over time to chart them by provider (Credit Karma, Chase, Amex, etc.).', '+ Add score', () => creditScoreModal(null))); return; }

  view.appendChild(creditHiLoCards(s.creditScores));

  normalizeChartRange(allRows);
  view.appendChild(chartRangeControls(allRows, () => renderView(currentRoute)));
  const rows = allRows.filter(r => chartRangeInRange(r.date));

  if (!rows.length) {
    view.appendChild(el('div', 'card muted pad', 'No scores in this range.'));
  } else {
    const dates = [...new Set(rows.map(r => r.date))].sort();
    const providers = [...new Set(rows.map(r => r.provider || 'Unknown'))];
    const datasets = providers.map((prov, i) => ({
      label: prov,
      data: dates.map(d => { const rec = rows.find(x => x.date === d && (x.provider || 'Unknown') === prov); return rec ? Number(rec.score) : null; }),
      borderColor: CHART_PALETTE[i % CHART_PALETTE.length], backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length],
      spanGaps: true, tension: 0.25, pointRadius: 3
    }));
    const wrap = el('div', 'card chart-wrap'); const cv = document.createElement('canvas'); wrap.appendChild(cv); view.appendChild(wrap);
    buildLineChart(cv, { labels: dates.map(fmtDateShort), datasets, yTitle: 'Score' });
  }

  const cols = [
    ...tableColKeys(store, 'credit', CREDIT_COL_LABELS, CREDIT_ALL_COLS).map(k => buildCreditCol(store, k)).filter(Boolean),
    { label: '', sortable: false, cell: r => { const td = el('td', 'row-actions'); const e = el('button', 'icon-btn', 'Edit'); e.addEventListener('click', () => creditScoreModal(r)); const d = el('button', 'icon-btn danger', 'Remove'); d.addEventListener('click', () => confirmRemove(fmtDate(r.date) + ' · ' + (r.provider || 'score'), () => store.removeCreditScore(r.id))); td.appendChild(e); td.appendChild(d); return td; } }
  ];
  view.appendChild(tableTools(columnsButton('credit', CREDIT_ALL_COLS, CREDIT_ALL_COLS, CREDIT_COL_LABELS, 'Credit score columns')));
  const card = el('div', 'card table-card'); card.appendChild(sortableTable(cols, s.creditScores, creditSort, ns => { creditSort = ns || { key: 'date', dir: 'desc' }; renderView(currentRoute); }, null)); view.appendChild(card);
}

// An entry's institution, with a fallback for any legacy accountId-based rows.
function rateInstitution(store, r) {
  if (r.institution) return r.institution;
  if (r.accountId) { const a = store.account(r.accountId); return (a && a.institution) || store.accountName(r.accountId) || ''; }
  return '';
}

// ---- Live APY sources ----
// Banks whose public sites expose an open-CORS rates JSON — fetched straight
// from the browser, no server needed. Add banks here as feeds are found.
const RATE_SOURCES = [
  {
    key: 'syf', name: 'Synchrony Bank', match: /synchrony/i, product: 'High Yield Savings',
    url: 'https://api.syf.com/v1/retailBank/products',
    // Synchrony's retail-bank products feed; HYS = High Yield Savings.
    parse: j => { const pr = (((j || {}).productTypes || {}).products || []).find(x => x.displayCode === 'HYS'); const v = pr && parseFloat(String(pr.maxAPY || '').replace('%', '')); return isFinite(v) ? v : null; }
  }
];
// The institution name the user actually uses for this bank (from past rate
// entries or accounts), else the source's default name.
function rateSourceInstName(store, src) {
  const s = store.state;
  const fromRates = s.rateHistory.map(r => rateInstitution(store, r)).find(n => src.match.test(n || ''));
  if (fromRates) return fromRates;
  const fromAcct = (s.accounts.find(a => src.match.test(a.institution || '')) || {}).institution;
  return fromAcct || src.name;
}
function userHasRateSource(store, src) {
  const s = store.state;
  return s.rateHistory.some(r => src.match.test(rateInstitution(store, r) || '')) || s.accounts.some(a => src.match.test(a.institution || ''));
}
async function syncRateSource(store, src, opts) {
  const quiet = opts && opts.quiet;
  try {
    const res = await fetch(src.url, { headers: { Accept: 'application/json' } });
    const apy = src.parse(await res.json());
    if (apy == null) { if (!quiet) toast('Couldn’t read the APY from ' + src.name + '’s feed', 'warn'); return; }
    const inst = rateSourceInstName(store, src);
    const latest = store.state.rateHistory
      .filter(r => (rateInstitution(store, r) || '').toLowerCase() === inst.toLowerCase())
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    if (latest && Number(latest.apy) === apy) { if (!quiet) toast(inst + ' ' + src.product + ' APY is already current at ' + apy.toFixed(2) + '%'); return; }
    store.saveRate({ date: todayISO(), institution: inst, apy });
    toast(inst + ' savings APY ' + (latest ? 'changed ' + Number(latest.apy).toFixed(2) + '% → ' : 'recorded: ') + apy.toFixed(2) + '% (auto)');
  } catch (e) { if (!quiet) toast('Couldn’t reach ' + src.name + '’s rates feed', 'warn'); }
}
// Once-a-day auto check when the Rates tab opens — only for banks the user
// actually has, so nobody gets rates logged for banks they don't use.
function autoSyncRates(store) {
  let last = 0; try { last = +localStorage.getItem('cloverRateSyncAt') || 0; } catch (e) {}
  if (Date.now() - last < 20 * 3600 * 1000) return;
  try { localStorage.setItem('cloverRateSyncAt', String(Date.now())); } catch (e) {}
  RATE_SOURCES.filter(srx => userHasRateSource(store, srx)).forEach(srx => syncRateSource(store, srx, { quiet: true }));
}
function rateSyncButtons(store) {
  return RATE_SOURCES.map(srx => {
    const b = el('button', 'btn-ghost', '↻ Sync ' + srx.name.replace(/ Bank$/, '') + ' APY');
    b.title = 'Fetch ' + srx.name + '’s current ' + srx.product + ' APY from its public rates feed and log it here if it changed. Also checked automatically once a day.';
    b.addEventListener('click', () => syncRateSource(store, srx));
    return b;
  });
}
// High/low APY range, like a stock's all-time and 52-week band — the best and
// worst rate you've recorded, each naming the bank that had it (rates are tracked
// per institution, so which bank is the point).
function ratesHiLoCards(store, all) {
  const scored = all.filter(r => r.apy != null && r.apy !== '' && !isNaN(Number(r.apy)))
    .slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const wrap = el('div', 'sub-summary');
  if (!scored.length) return wrap;
  const hiOf = arr => arr.reduce((best, r) => Number(r.apy) > Number(best.apy) ? r : best, arr[0]);
  const loOf = arr => arr.reduce((best, r) => Number(r.apy) < Number(best.apy) ? r : best, arr[0]);
  const apyText = r => Number(r.apy).toFixed(2) + '%';
  const sub = r => (rateInstitution(store, r) || 'Unknown') + ' · ' + fmtDate(r.date);
  const hi = hiOf(scored), lo = loOf(scored);
  wrap.appendChild(sumCard('All-time high', apyText(hi), 'income', sub(hi)));
  wrap.appendChild(sumCard('All-time low', apyText(lo), '', sub(lo)));
  const yr = new Date().getFullYear();
  const yrRows = scored.filter(r => (r.date || '').slice(0, 4) === String(yr));
  if (yrRows.length) {
    const yhi = hiOf(yrRows), ylo = loOf(yrRows);
    wrap.appendChild(sumCard(yr + ' high', apyText(yhi), 'income', sub(yhi)));
    wrap.appendChild(sumCard(yr + ' low', apyText(ylo), '', sub(ylo)));
  }
  return wrap;
}
function renderRatesTab(view) {
  const store = window.cloverStore, s = store.state;
  autoSyncRates(store);
  const allRows = s.rateHistory.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!allRows.length) {
    view.appendChild(tableTools.apply(null, rateSyncButtons(store)));
    view.appendChild(emptyState('No savings rates yet', 'Log a bank’s APY over time to compare how each institution’s rate moves.', '+ Add rate', () => rateModal(null)));
    return;
  }

  view.appendChild(ratesHiLoCards(store, s.rateHistory));

  normalizeChartRange(allRows);
  view.appendChild(chartRangeControls(allRows, () => renderView(currentRoute)));
  const rows = allRows.filter(r => chartRangeInRange(r.date));

  if (!rows.length) {
    view.appendChild(el('div', 'card muted pad', 'No rate entries in this range.'));
  } else {
    const dates = [...new Set(rows.map(r => r.date))].sort();
    const insts = [...new Set(rows.map(r => rateInstitution(store, r) || 'Unknown'))];
    const datasets = insts.map((inst, i) => ({
      label: inst,
      data: dates.map(d => { const rec = rows.find(x => x.date === d && (rateInstitution(store, x) || 'Unknown') === inst); return rec ? Number(rec.apy) : null; }),
      borderColor: CHART_PALETTE[i % CHART_PALETTE.length], backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length],
      spanGaps: true, tension: 0.25, pointRadius: 3
    }));
    const wrap = el('div', 'card chart-wrap'); const cv = document.createElement('canvas'); wrap.appendChild(cv); view.appendChild(wrap);
    buildLineChart(cv, { labels: dates.map(fmtDateShort), datasets, yTitle: '% APY' });
  }

  const cols = [
    ...tableColKeys(store, 'rates', RATES_COL_LABELS, RATES_ALL_COLS).map(k => buildRatesCol(store, k)).filter(Boolean),
    { label: '', sortable: false, cell: r => { const td = el('td', 'row-actions'); const e = el('button', 'icon-btn', 'Edit'); e.addEventListener('click', () => rateModal(r)); const d = el('button', 'icon-btn danger', 'Remove'); d.addEventListener('click', () => confirmRemove(fmtDate(r.date) + ' · ' + rateInstitution(store, r), () => store.removeRate(r.id))); td.appendChild(e); td.appendChild(d); return td; } }
  ];
  view.appendChild(tableTools.apply(null, rateSyncButtons(store).concat([columnsButton('rates', RATES_ALL_COLS, RATES_ALL_COLS, RATES_COL_LABELS, 'Savings rate columns')])));
  const card = el('div', 'card table-card'); card.appendChild(sortableTable(cols, s.rateHistory, rateSort, ns => { rateSort = ns || { key: 'date', dir: 'desc' }; renderView(currentRoute); }, null)); view.appendChild(card);
}

function creditScoreModal(existing) {
  const store = window.cloverStore, s = store.state;
  const r = existing ? Object.assign({}, existing) : { date: todayISO() };
  const body = el('div', 'form-grid');
  const fDate = input(r.date || todayISO(), { type: 'date' });
  const fScore = input(r.score != null ? r.score : '', { type: 'number', placeholder: '300–850' }); fScore.min = 300; fScore.max = 900;
  // Provider dropdown: the ones you've already logged first, then common
  // suggestions, then "Add new" which reveals a text field for a fresh name.
  const used = [...new Set(s.creditScores.map(x => x.provider).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const opts = used.concat(COMMON_PROVIDERS.filter(p => !used.includes(p)));
  const cur = r.provider || '';
  const known = !!cur && opts.includes(cur);
  const recent = s.creditScores.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(x => x.provider).find(Boolean);
  const provDflt = existing ? (known ? cur : '__other') : (recent || opts[0] || '__other');
  const fProvSel = select(opts.map(p => ({ value: p, label: p })).concat([{ value: '__other', label: '＋ Add new provider…' }]), provDflt);
  const fProvNew = input(known ? '' : cur, { placeholder: 'e.g. myFICO, Rocket Money' });
  const provNewWrap = el('div'); provNewWrap.style.marginTop = '6px'; provNewWrap.appendChild(fProvNew);
  provNewWrap.style.display = fProvSel.value === '__other' ? '' : 'none';
  fProvSel.addEventListener('change', () => { provNewWrap.style.display = fProvSel.value === '__other' ? '' : 'none'; if (fProvSel.value === '__other') fProvNew.focus(); });
  const provNode = el('div'); provNode.appendChild(fProvSel); provNode.appendChild(provNewWrap);
  const provVal = () => (fProvSel.value === '__other' ? fProvNew.value : fProvSel.value).trim();
  body.appendChild(field('Date', fDate, 'When this score was reported.'));
  body.appendChild(field('Score', fScore, 'The credit score number (usually 300–850).'));
  body.appendChild(field('Provider', provNode, 'Who reported it — pick one you’ve logged before, or “Add new provider…” to enter another (Credit Karma, a bureau, myFICO, etc.). Each provider is charted as its own line.'));

  openModal({
    title: existing ? 'Edit score' : 'Add score', body: withHistoryTab(body, existing), confirmLabel: 'Save',
    onConfirm: () => {
      const score = parseInt(fScore.value, 10);
      if (isNaN(score)) { fScore.focus(); toast('Score is required', 'warn'); return false; }
      store.saveCreditScore(Object.assign(r, { date: fDate.value || todayISO(), score, provider: provVal() }));
      toast(existing ? 'Score updated' : 'Score added');
    }
  });
}

function rateModal(existing) {
  const store = window.cloverStore, s = store.state;
  const r = existing ? Object.assign({}, existing) : { date: todayISO() };
  const body = el('div', 'form-grid');
  const fDate = input(r.date || todayISO(), { type: 'date' });
  const fApy = input(r.apy != null ? r.apy : '', { type: 'number', placeholder: 'e.g. 3.75' }); fApy.step = '0.01';
  // Institution dropdown: the ones you've already logged first, then the Settings
  // catalog, then "Add new" which reveals a text field for a fresh bank.
  const used = [...new Set(s.rateHistory.map(x => rateInstitution(store, x)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const opts = used.concat(s.catalog.institutions.map(i => i.name).filter(n => n && !used.includes(n)).sort((a, b) => a.localeCompare(b)));
  const cur = rateInstitution(store, r) || '';
  const known = !!cur && opts.includes(cur);
  const recent = s.rateHistory.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(x => rateInstitution(store, x)).find(Boolean);
  const instDflt = existing ? (known ? cur : '__other') : (recent || opts[0] || '__other');
  const fInstSel = select(opts.map(n => ({ value: n, label: n })).concat([{ value: '__other', label: '＋ Add new institution…' }]), instDflt);
  const fInstNew = input(known ? '' : cur, { placeholder: 'e.g. Ally, Marcus' });
  const instNewWrap = el('div'); instNewWrap.style.marginTop = '6px'; instNewWrap.appendChild(fInstNew);
  instNewWrap.style.display = fInstSel.value === '__other' ? '' : 'none';
  fInstSel.addEventListener('change', () => { instNewWrap.style.display = fInstSel.value === '__other' ? '' : 'none'; if (fInstSel.value === '__other') fInstNew.focus(); });
  const instNode = el('div'); instNode.appendChild(fInstSel); instNode.appendChild(instNewWrap);
  const instVal = () => (fInstSel.value === '__other' ? fInstNew.value : fInstSel.value).trim();
  body.appendChild(field('Date', fDate, 'When this rate was in effect.'));
  body.appendChild(field('Bank / institution', instNode, 'Which bank the APY is for (e.g. Ally, Synchrony). Rates are tracked per institution and each is charted as its own line. Pick one you’ve logged before, or “Add new institution…” to enter another; manage the full list in Settings.'));
  body.appendChild(field('APY %', fApy, 'The annual percentage yield at that date.'));

  openModal({
    title: existing ? 'Edit rate' : 'Add rate', body: withHistoryTab(body, existing), confirmLabel: 'Save',
    onConfirm: () => {
      const inst = instVal();
      if (!inst) { fInstSel.focus(); toast('Enter a bank / institution', 'warn'); return false; }
      const apy = parseFloat(fApy.value);
      if (isNaN(apy)) { fApy.focus(); toast('APY is required', 'warn'); return false; }
      const entry = Object.assign(r, { date: fDate.value || todayISO(), institution: inst, apy });
      delete entry.accountId;   // migrate any legacy account-based entry
      store.saveRate(entry);
      toast(existing ? 'Rate updated' : 'Rate added');
    }
  });
}

// ============================================================
// Dashboard — Phase 6
// ============================================================
function kpiCard(label, value, tone, hint) {
  const c = el('div', 'sum-card');
  c.appendChild(el('div', 'sum-label', label));
  c.appendChild(el('div', 'sum-value ' + (tone || ''), value));
  if (hint) c.appendChild(el('div', 'sum-hint', hint));
  return c;
}
function incomeForMonth(data, mi) {
  let sum = data.income.filter(countable).filter(e => monthIdx(e.date) === mi).reduce((a, e) => a + amountOf(e), 0);
  sum += data.paychecks.filter(isPaycheckPaid).filter(p => monthIdx(p.payDate) === mi).reduce((a, p) => a + (Number(p.gross) || 0), 0);
  sum += salesMonthsArr(data)[mi] || 0;
  return sum;
}
function salesEarn(x) { return Number(x.earnings) || 0; }
function salesMonthsArr(data) { const m = new Array(12).fill(0); (data.sales || []).forEach(x => { const mi = monthIdx(x.orderDate); if (mi >= 0) m[mi] += salesEarn(x); }); return m; }
function salesTotal(data) { return (data.sales || []).reduce((a, x) => a + salesEarn(x), 0); }
function incomeYTDall(data) {
  let sum = data.income.filter(countable).reduce((a, e) => a + amountOf(e), 0);
  sum += data.paychecks.filter(isPaycheckPaid).reduce((a, p) => a + (Number(p.gross) || 0), 0);
  sum += salesTotal(data);
  return sum;
}
// Take-home (after-tax) versions: use the net figure where recorded, else fall
// back to gross (e.g. interest/rewards have no withholding). Used for
// "what's actually left to spend" calcs, which must start from net, not gross.
function netAmountOf(e) { return (e.net != null && e.net !== '') ? (Number(e.net) || 0) : amountOf(e); }
function paycheckNet(p) { return (p.net != null && p.net !== '') ? (Number(p.net) || 0) : (Number(p.gross) || 0); }
function incomeNetForMonth(data, mi) {
  let sum = data.income.filter(countable).filter(e => monthIdx(e.date) === mi).reduce((a, e) => a + netAmountOf(e), 0);
  sum += data.paychecks.filter(isPaycheckPaid).filter(p => monthIdx(p.payDate) === mi).reduce((a, p) => a + paycheckNet(p), 0);
  sum += salesMonthsArr(data)[mi] || 0;   // sale earnings are already net of fees
  return sum;
}
function incomeNetYTDall(data) {
  let sum = data.income.filter(countable).reduce((a, e) => a + netAmountOf(e), 0);
  sum += data.paychecks.filter(isPaycheckPaid).reduce((a, p) => a + paycheckNet(p), 0);
  sum += salesTotal(data);   // sale earnings are already net of fees
  return sum;
}
// Auto basis for "% of income" / "should be left" so the user never types it in.
// Uses PAYCHECK take-home only (no interest/rewards), annualized: it sums net pay
// over the trailing 12 months ending at your most recent paycheck and divides by
// 12 — so the "extra" biweekly check some months get is spread evenly and the
// figure doesn't spike. Months are keyed as (year*12 + month) so the window spans
// year boundaries. If you have under a year of pay history, it divides by the
// number of months you do have. Returns null while a needed year doc loads; 0 if
// no paychecks exist in the active year or the two before it.
function avgNetMonthlyIncome(store) {
  const cur = activeYear;
  let loading = false;
  for (let y = cur; y >= cur - 2; y--) if (!store.isYearLoaded(y)) { store.loadYear(y); loading = true; }
  if (loading) return null;
  const byMonth = {};   // (year*12 + month-1) -> net paycheck total
  for (let y = cur; y >= cur - 2; y--) {
    store.yearData(y).paychecks.filter(isPaycheckPaid).forEach(p => {
      const m = /^(\d{4})-(\d{2})/.exec(p.payDate); if (!m) return;
      const idx = (+m[1]) * 12 + (+m[2]) - 1;
      byMonth[idx] = (byMonth[idx] || 0) + paycheckNet(p);
    });
  }
  const idxs = Object.keys(byMonth).map(Number);
  if (!idxs.length) return 0;
  const latest = Math.max(...idxs), earliest = Math.min(...idxs);
  const denom = Math.min(12, latest - earliest + 1);   // full year -> 12; less -> actual span
  let sum = 0;
  for (let k = 0; k < 12; k++) sum += byMonth[latest - k] || 0;   // trailing 12 months
  return sum / denom;
}
function incomeByCategory(store, data) {
  const m = {};
  data.income.filter(countable).forEach(e => { const g = store.incomeGroupName(e.categoryId); m[g] = (m[g] || 0) + amountOf(e); });
  data.paychecks.filter(isPaycheckPaid).forEach(p => { const g = store.incomeGroupName(p.incomeCategoryId); m[g] = (m[g] || 0) + (Number(p.gross) || 0); });
  const sellName = (store.state.incomeCategories.find(c => /selling/i.test(c.name)) || {}).name || 'Selling';
  (data.sales || []).forEach(x => { m[sellName] = (m[sellName] || 0) + salesEarn(x); });
  return m;
}
function donutCard(map, opts) {
  opts = opts || {};
  const card = el('div', 'card');
  const entries = Object.entries(map).filter(([k, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) { card.appendChild(el('div', 'muted', opts.empty || 'No data yet.')); return card; }
  const total = entries.reduce((a, e) => a + e[1], 0);
  // Percentages normally read as a share of the slices themselves. opts.denom lets
  // a caller measure them against an outside basis instead (take-home income), so
  // a label means "share of what I earned", not "share of what I spent".
  const denom = opts.denom > 0 ? opts.denom : total;
  const wrap = el('div', 'donut-wrap'); const cv = document.createElement('canvas'); wrap.appendChild(cv); card.appendChild(wrap);
  buildDoughnut(cv, { labels: entries.map(e => e[0] + ' · ' + (denom > 0 ? (e[1] / denom * 100).toFixed(1) : '0.0') + '%'), data: entries.map(e => e[1]) });
  if (opts.hint) card.appendChild(el('div', 'sum-hint', opts.hint));
  return card;
}
function buildWarnings(store, data, s) {
  const warn = s.settings.warnWindows || [7, 14, 30, 60];
  const maxW = Math.max.apply(null, warn);
  const renewSoon = s.recurring.filter(isSubActive).map(r => ({ r, d: daysUntil(nextRenewalDate(r)) })).filter(x => x.d != null && x.d >= 0 && x.d <= maxW).sort((a, b) => a.d - b.d);
  const overdue = data.paychecks.filter(p => !isPaycheckPaid(p) && p.status !== 'Bounced/Returned' && (p.status === 'Late' || p.status === 'Missing' || (p.payDate && daysUntil(p.payDate) < 0)));
  // Budget placeholders awaiting last month's actuals (a few days into a new month).
  let budgetDue = [];
  const bNow = new Date();
  if (bNow.getDate() >= 3 && bNow.getMonth() >= 1) {
    const by = bNow.getFullYear(), pm = bNow.getMonth() - 1, pym = ymOf(by, pm);
    const yd = store.isYearLoaded(by) ? store.yearData(by) : null;
    budgetDue = s.recurring.filter(r => r.budgetEst).filter(isSubActive).filter(r => r.notPaidYear !== by).filter(b => {
      const used = yd && yd.expensePayments.some(p => p.recurringId === b.id && monthIdx(p.date) === pm);
      return !used && !budgetMonthSkipped(b, pym);
    });
  }
  const maturedCd = maturedCds(store);
  if (!renewSoon.length && !overdue.length && !budgetDue.length && !maturedCd.length) return null;
  const strip = el('div', 'card warn-strip');
  const list = el('div', 'warn-list');
  if (maturedCd.length) {
    const w = el('div', 'warn-item');
    w.appendChild(badge('Matured', 'red'));
    w.appendChild(el('span', null, maturedCd.length + ' CD' + (maturedCd.length === 1 ? ' has' : 's have') + ' passed maturity \u2014 renew or update ' + (maturedCd.length === 1 ? 'it' : 'them') + ' (Clover won\u2019t close ' + (maturedCd.length === 1 ? 'it' : 'them') + ' for you)'));
    const go = el('button', 'btn-ghost', 'Review \u2192');
    go.addEventListener('click', () => { accountsCdTimeline = true; accountsTab = 'open'; location.hash = 'accounts'; });
    w.appendChild(go);
    list.appendChild(w);
  }
  if (budgetDue.length) {
    const w = el('div', 'warn-item');
    w.appendChild(badge('Budget', 'amber'));
    w.appendChild(el('span', null, budgetDue.length + ' placeholder' + (budgetDue.length === 1 ? ' needs' : 's need') + ' last month’s actuals'));
    const go = el('button', 'btn-ghost', 'Review →');
    go.addEventListener('click', () => { location.hash = 'budget'; });
    w.appendChild(go);
    list.appendChild(w);
  }
  renewSoon.slice(0, 6).forEach(x => {
    const w = el('div', 'warn-item');
    w.appendChild(badge('in ' + x.d + 'd', x.d <= 7 ? 'red' : 'amber'));
    w.appendChild(el('span', null, x.r.name + ' renews — ' + money(Number(x.r.amount) || 0)));
    list.appendChild(w);
  });
  overdue.forEach(p => {
    const w = el('div', 'warn-item');
    w.appendChild(badge(p.status === 'Missing' ? 'Missing' : 'Late', 'red'));
    w.appendChild(el('span', null, (p.employer || 'Paycheck') + ' · ' + fmtDate(p.payDate) + ' · ' + money(Number(p.gross) || 0)));
    list.appendChild(w);
  });
  strip.appendChild(list);
  return strip;
}
function upcomingRenewalsCard(store, s) {
  const card = el('div', 'card');
  const items = s.recurring.filter(isSubActive).map(r => ({ r, d: daysUntil(nextRenewalDate(r)) })).filter(x => x.d != null && x.d >= 0).sort((a, b) => a.d - b.d).slice(0, 8);
  if (!items.length) { card.appendChild(el('div', 'muted', 'No upcoming renewals.')); return card; }
  const list = el('div', 'mini-list');
  items.forEach(x => {
    const row = el('div', 'mini-row');
    row.appendChild(el('span', null, x.r.name));
    const right = el('span', 'mini-right');
    right.appendChild(el('span', 'muted', money(Number(x.r.amount) || 0)));
    right.appendChild(badge('in ' + x.d + 'd', x.d <= 7 ? 'red' : x.d <= 30 ? 'amber' : ''));
    row.appendChild(right); list.appendChild(row);
  });
  card.appendChild(list); return card;
}
function recentActivityCard(store, data) {
  const card = el('div', 'card');
  const items = [];
  data.income.forEach(e => items.push({ date: e.date, label: store.incomeGroupName(e.categoryId), amt: amountOf(e), kind: 'in' }));
  data.paychecks.filter(isPaycheckPaid).forEach(p => items.push({ date: p.payDate, label: p.employer || 'Paycheck', amt: Number(p.gross) || 0, kind: 'in' }));
  data.expensePayments.forEach(e => items.push({ date: e.date, label: store.expenseGroupName(e.categoryId), amt: expenseAmount(e), kind: 'out' }));
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const recent = items.slice(0, 10);
  if (!recent.length) { card.appendChild(el('div', 'muted', 'Nothing logged yet.')); return card; }
  const list = el('div', 'mini-list');
  recent.forEach(it => {
    const row = el('div', 'mini-row');
    row.appendChild(el('span', null, fmtDate(it.date) + ' · ' + it.label));
    row.appendChild(el('span', it.kind === 'in' ? 'pos' : 'neg', (it.kind === 'in' ? '+' : '−') + money(it.amt)));
    list.appendChild(row);
  });
  card.appendChild(list); return card;
}

// ---- Dashboard panels: add/remove, drag-reorder (when unlocked), collapse ----
let dashUnlocked = false;
let dashDragKey = null;
// Layout snapshots taken when entering edit mode, restored by "Cancel".
let panelSnapshots = {};
const DASH_PANEL_DEFS = [
  { key: 'kpis', title: 'Key numbers', span2: true, build: ctx => dashKpisBody(ctx) },
  { key: 'warnings', title: '⚠ Attention', span2: true, build: ctx => buildWarnings(ctx.store, ctx.data, ctx.s) || el('div', 'card muted', 'Nothing needs attention right now.') },
  { key: 'incomeMix', title: 'Income mix (YTD)', span2: true, build: ctx => dashIncomeMixBody(ctx) },
  { key: 'incomeDonut', title: 'Income by category (YTD)', build: ctx => donutCard(incomeByCategory(ctx.store, ctx.data)) },
  // Logged payments plus recurring-bill estimates (overrides, one-time, and
  // not-paid-this-year rules all honored), capped at the elapsed months so this is
  // a true year-to-date mix. It deliberately does NOT match the expense grid's
  // "Year total" column, which projects the bills out to a full 12 months.
  { key: 'expenseDonut', title: 'Expenses by category (YTD)', build: ctx => donutCard(expenseByCategoryFull(ctx.store, ctx.data)) },
  { key: 'spendVsNet', title: 'Where your take-home goes (YTD)', build: ctx => dashSpendVsNetBody(ctx) },
  { key: 'renewals', title: 'Upcoming renewals', build: ctx => upcomingRenewalsCard(ctx.store, ctx.s) },
  { key: 'activity', title: 'Recent activity', build: ctx => recentActivityCard(ctx.store, ctx.data) },
  { key: 'taxes', title: 'Taxes', build: ctx => dashTaxesBody(ctx) },
  { key: 'bestCard', title: '💳 Best card to use today', build: ctx => bestCardCallout(ctx.store) || el('div', 'card muted', 'Add credit cards with statement close + due days (on the Accounts page) to see which card gives a purchase the longest float.') },
  { key: 'projIncome', title: '📈 Projected annual income', build: ctx => {
      const box = el('div');
      const wrap = el('div', 'sub-summary');
      const me = ctx.monthsElapsed > 0 ? ctx.monthsElapsed : 1;
      const avgG = ctx.incYTD / me, avgN = ctx.netYTD / me;
      wrap.appendChild(kpiCard('Projected gross / yr', money(avgG * 12), 'income', 'avg ' + money(avgG) + ' / mo so far × 12'));
      wrap.appendChild(kpiCard('Projected net / yr', money(avgN * 12), 'income', 'avg ' + money(avgN) + ' / mo take-home × 12'));
      box.appendChild(wrap);
      // Say exactly which income streams feed the projection.
      const srcs = Object.entries(incomeByCategory(ctx.store, ctx.data)).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).map(x => x[0]);
      box.appendChild(el('div', 'sum-hint', srcs.length
        ? 'Both projections count all recorded income this year: ' + srcs.join(', ') + '. Net uses each entry’s recorded net (take-home for paychecks); entries without a net use their gross.'
        : 'No income recorded yet this year.'));
      return box;
    } }
];
// Last filed year's net outcome + lifetime refund/paid totals from Tax history.
function dashTaxesBody(ctx) {
  const card = el('div', 'card');
  const recs = ctx.s.taxRecords || [];
  if (!recs.length) { card.appendChild(el('div', 'muted', 'No tax history yet — log your filings under Taxes.')); return card; }
  const latestYear = Math.max.apply(null, recs.map(r => Number(r.taxYear) || 0));
  const yearRecs = recs.filter(r => +r.taxYear === latestYear);
  const outcomeNet = list => list.reduce((a, r) => a
    + (r.fedOutcome === 'refund' ? Number(r.fedAmount) || 0 : r.fedOutcome === 'owed' ? -(Number(r.fedAmount) || 0) : 0)
    + (r.stateOutcome === 'refund' ? Number(r.stateAmount) || 0 : r.stateOutcome === 'owed' ? -(Number(r.stateAmount) || 0) : 0), 0);
  const lastNet = outcomeNet(yearRecs);
  const refunded = recs.reduce((a, r) => a + (r.fedOutcome === 'refund' ? Number(r.fedAmount) || 0 : 0) + (r.stateOutcome === 'refund' ? Number(r.stateAmount) || 0 : 0), 0);
  const paid = recs.reduce((a, r) => a + (r.fedOutcome === 'owed' ? Number(r.fedAmount) || 0 : 0) + (r.stateOutcome === 'owed' ? Number(r.stateAmount) || 0 : 0), 0);
  const list = el('div', 'mini-list');
  const row = (label, value, cls, badges) => {
    const rw = el('div', 'mini-row');
    const left = el('span'); left.appendChild(document.createTextNode(label + ' '));
    (badges || []).forEach(b => left.appendChild(b));
    rw.appendChild(left);
    rw.appendChild(el('span', cls, value));
    list.appendChild(rw);
  };
  const yearBadges = [];
  if (yearRecs.some(r => r.extended)) yearBadges.push(badge('Extended', 'amber'));
  if (yearRecs.some(r => r.kind === 'amendment')) yearBadges.push(badge('Amended', 'type'));
  row('Tax year ' + latestYear + ' net', (lastNet >= 0 ? '+' : '−') + money(Math.abs(lastNet)), lastNet >= 0 ? 'pos' : 'neg', yearBadges);
  row('Lifetime refunded', '+' + money(refunded), 'pos');
  row('Lifetime paid', '−' + money(paid), 'neg');
  card.appendChild(list);
  return card;
}
function pagePanelState(store, pageKey, defs) {
  const pp = store.state.settings.pagePanels || {};
  const saved = pageKey === 'dashboard' ? (pp.dashboard || store.state.settings.dashPanels) : pp[pageKey];
  if (Array.isArray(saved) && saved.length) {
    const entries = saved.filter(p => defs.some(d => d.key === p.k))
      .map(p => ({ k: p.k, c: !!p.c, w: (p.w === 1 || p.w === 2 || p.w === 3) ? p.w : 0, h: p.h ? 1 : 0, off: p.off ? 1 : 0 }));
    // Panels shipped after this layout was saved won't be in it — surface
    // them at the end instead of hiding them forever. Removing a panel keeps
    // an off-flagged entry, so deliberate removals stay removed.
    defs.forEach(d => { if (!entries.some(p => p.k === d.key)) entries.push({ k: d.key, c: false, w: 0, off: 0 }); });
    return entries;
  }
  return defs.map(d => ({ k: d.key, c: false, w: 0, off: 0 }));
}
function dashPanelState(store) { return pagePanelState(store, 'dashboard', DASH_PANEL_DEFS); }
// Wording chosen so it cannot collide with a real expense category and silently
// overwrite that category's slice.
const LEFTOVER_SLICE = 'Left over (not spent)';
// Same category mix as the expense donut, but measured against take-home pay
// instead of against total spending — "insurance is 30% of what I earn" is a very
// different (and more actionable) statement than "insurance is 52% of what I
// spend". Adding the unspent remainder as its own slice is what makes the
// percentages honest: they sum to 100% of net income rather than to 100% of spend.
function dashSpendVsNetBody(ctx) {
  const net = ctx.netYTD;
  if (!(net > 0)) return el('div', 'card muted', 'Record take-home (net) income this year to see what share of it each category uses.');
  const map = expenseByCategoryFull(ctx.store, ctx.data);
  const spend = Object.values(map).reduce((a, b) => a + b, 0);
  if (!(spend > 0)) return el('div', 'card muted', 'No spending recorded yet this year.');
  const left = net - spend;
  const pct = spend / net * 100;
  // A ring can only ever draw parts of a whole. While there IS something left over,
  // the categories plus that remainder are exactly take-home, so every wedge's size
  // matches its printed share and the chart reads true. Once spending passes income
  // the parts exceed the whole: the wedges would still be drawn as shares of
  // spending while the labels claimed shares of income, so a category could be
  // marked "140%" on a wedge covering half the ring. Drop to a table in that case —
  // the numbers stay honest and nothing is implied by an area that can't be drawn.
  if (left > 0) {
    const slices = Object.assign({}, map);
    slices[LEFTOVER_SLICE] = left;
    return donutCard(slices, { denom: net, hint: 'Of ' + money(net) + ' take-home so far this year, ' + money(spend) + ' (' + pct.toFixed(1) + '%) is spoken for and ' + money(left) + ' is left over. Each slice is that category’s share of take-home.' });
  }
  const card = el('div', 'card table-card');
  const table = el('table', 'data-table');
  table.innerHTML = '<thead><tr><th>Category</th><th class="num">YTD</th><th class="num">% of take-home</th></tr></thead>';
  const tb = el('tbody');
  Object.entries(map).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]).forEach(e => {
    const tr = el('tr');
    tr.appendChild(el('td', null, e[0]));
    const amt = el('td', 'num'); amt.textContent = money(e[1]); tr.appendChild(amt);
    const p = el('td', 'num'); p.textContent = (e[1] / net * 100).toFixed(1) + '%'; tr.appendChild(p);
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  card.appendChild(table);
  card.appendChild(el('div', 'sum-hint', 'Spending so far is ' + money(spend) + ' — ' + pct.toFixed(1) + '% of your ' + money(net) + ' take-home, or ' + money(-left) + ' more than you have brought home this year. There is nothing left over to chart, so the shares are listed instead.'));
  return card;
}
function dashKpisBody(ctx) {
  const kpis = el('div', 'sub-summary');
  // On big stat cards a zero shows as $0.00 — the grid's "–" convention reads
  // like a broken card here.
  const m0 = v => (Number(v) || 0) === 0 ? '$0.00' : money(v);
  kpis.appendChild(kpiCard('Income · ' + ctx.monthName, m0(ctx.incThisMonth), 'income'));
  kpis.appendChild(kpiCard('Spending · ' + ctx.monthName, m0(ctx.spendThisMonth), 'expense', 'logged expenses only — bills are in Recurring / mo'));
  kpis.appendChild(kpiCard('Recurring / mo', m0(ctx.recurringMonthly), 'expense', money(ctx.recurringAnnual) + ' / yr'));
  kpis.appendChild(kpiCard('Net · ' + ctx.monthName, m0(ctx.netThisMonth), ctx.netThisMonth < 0 ? 'expense' : 'income', 'take-home − spend − bills'));
  kpis.appendChild(kpiCard('Should be left / mo', m0(ctx.shouldLeft), ctx.shouldLeft < 0 ? 'expense' : 'income', 'avg take-home − bills − avg spend'));
  kpis.appendChild(kpiCard('Projected income', m0(ctx.projAnnualIncome), 'income', 'annualized from YTD'));
  kpis.appendChild(kpiCard('Projected expenses', m0(ctx.projAnnualExpense), 'expense', 'subs + annualized spend'));
  return kpis;
}
// Share of the year's income that interest / dividends / investments make up,
// against both gross and take-home (net) income.
function dashIncomeMixBody(ctx) {
  const card = el('div', 'card');
  if (!ctx.incYTD) { card.appendChild(el('div', 'muted', 'No income yet this year.')); return card; }
  const rows = [['Interest', /interest/i], ['Dividends', /dividend/i], ['Investments', /invest/i]]
    .map(([label, re]) => ({ label, amt: incomeByNamedCategory(ctx.store, ctx.data, re) }));
  const wrap = el('div', 'table-scroll');
  const table = el('table', 'data-table');
  table.innerHTML = '<thead><tr><th>Source</th><th class="num">YTD</th><th class="num">% of gross income</th><th class="num">% of net income</th></tr></thead>';
  const tb = el('tbody');
  rows.forEach(r => {
    const tr = el('tr');
    tr.appendChild(el('td', 'strong', r.label));
    tr.appendChild(numCell(r.amt, true));
    const pg = el('td', 'num'); pg.textContent = ctx.incYTD > 0 && r.amt ? (r.amt / ctx.incYTD * 100).toFixed(2) + '%' : '—'; tr.appendChild(pg);
    const pn = el('td', 'num'); pn.textContent = ctx.netYTD > 0 && r.amt ? (r.amt / ctx.netYTD * 100).toFixed(2) + '%' : '—'; tr.appendChild(pn);
    tb.appendChild(tr);
  });
  table.appendChild(tb); wrap.appendChild(table); card.appendChild(wrap);
  card.appendChild(el('div', 'sum-hint', 'How much of this year’s income comes from interest, dividends, and investments — as a share of gross and of take-home (net) income.'));
  return card;
}
function dashPanel(store, def, entry, state, ctx, opts) {
  const unlocked = opts ? opts.unlocked : dashUnlocked;
  const save = opts ? opts.save : (arr => store.setDashPanels(arr));
  const width = entry.w || (def.span2 ? 2 : 1);   // snap widths: 1 = half, 2 = full, 3 = quarter
  const panel = el('div', 'dash-panel' + (width === 2 ? ' span2' : width === 3 ? ' span1q' : '') + (entry.h ? ' hhalf' : ''));
  const head = el('div', 'dash-panel-head');
  if (unlocked) {
    panel.draggable = true;
    head.appendChild(el('span', 'dph-drag', '⠿'));
    panel.addEventListener('dragstart', () => { dashDragKey = def.key; panel.classList.add('dragging'); });
    panel.addEventListener('dragend', () => { dashDragKey = null; panel.classList.remove('dragging'); });
    panel.addEventListener('dragover', e => e.preventDefault());
    panel.addEventListener('drop', e => {
      e.preventDefault();
      if (!dashDragKey || dashDragKey === def.key) return;
      const v = state.slice();
      const from = v.findIndex(p => p.k === dashDragKey), to = v.findIndex(p => p.k === def.key);
      const moved = v.splice(from, 1)[0]; v.splice(to, 0, moved);
      save(v);
    });
  }
  head.appendChild(el('h3', 'dph-title', def.title));
  head.appendChild(el('span', 'dph-caret', entry.c ? '▸' : '▾'));
  if (unlocked) {
    const wBtn = el('button', 'dph-x dph-w', width === 2 ? '⇥ Half' : width === 1 ? '◫ Quarter' : '⇤ Full');
    wBtn.title = 'Cycle the snap width: full → half → quarter → full';
    wBtn.addEventListener('click', ev => { ev.stopPropagation(); entry.w = width === 2 ? 1 : width === 1 ? 3 : 2; save(state); });
    head.appendChild(wBtn);
    const hBtn = el('button', 'dph-x dph-w', entry.h ? '⇕ Auto height' : '⇕ Half height');
    hBtn.title = entry.h ? 'Let the panel grow to fit its content' : 'Cap the panel at half height — its content scrolls inside';
    hBtn.addEventListener('click', ev => { ev.stopPropagation(); entry.h = entry.h ? 0 : 1; save(state); });
    head.appendChild(hBtn);
    const x = el('button', 'dph-x', '✕'); x.title = 'Remove this panel';
    x.addEventListener('click', ev => { ev.stopPropagation(); entry.off = 1; save(state); });
    head.appendChild(x);
  }
  head.addEventListener('click', () => { entry.c = !entry.c; save(state); });
  panel.appendChild(head);
  if (!entry.c) { const body = el('div', 'dash-panel-body'); body.appendChild(def.build(ctx)); panel.appendChild(body); }
  return panel;
}

// Masonry-style vertical packing: the panel grid uses small fixed rows and
// each panel spans only as many as its content needs, so a short panel snaps
// up under the one above it instead of stretching to its tallest row-mate.
const DASH_ROW_PX = 8;
function packPanels(grid) {
  const gap = parseFloat(getComputedStyle(grid).rowGap) || 18;
  if (window.innerWidth <= 900) return;   // single column — no packing needed
  [...grid.children].forEach(pn => {
    if (!pn.classList.contains('dash-panel')) return;
    let h = 0;
    // Fractional heights (offsetHeight rounds down and under-spans, making
    // neighbors overlap the shortfall) plus a little slack for borders.
    [...pn.children].forEach(c => { const cs = getComputedStyle(c); h += c.getBoundingClientRect().height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0); });
    h += 4;
    const want = 'span ' + Math.max(1, Math.ceil((h + gap) / (DASH_ROW_PX + gap)));
    if (pn.style.gridRowEnd !== want) pn.style.gridRowEnd = want;
  });
}
function attachPanelPacking(grid) {
  const ro = new ResizeObserver(() => packPanels(grid));
  [...grid.children].forEach(pn => { if (pn.classList.contains('dash-panel')) [...pn.children].forEach(c => ro.observe(c)); });
  packPanels(grid);
}
function renderDashboard(view) {
  destroyCharts();
  const store = window.cloverStore, s = store.state;
  if (!store.isYearLoaded(activeYear)) { view.appendChild(loadingPanel()); store.loadYear(activeYear); return; }
  const data = store.yearData(activeYear);
  const now = new Date();
  const curYear = now.getFullYear();
  const focusMonth = activeMonth > 0 ? activeMonth - 1 : (activeYear === curYear ? now.getMonth() : 11);
  const monthsElapsed = activeYear < curYear ? 12 : (activeYear > curYear ? 1 : (now.getMonth() + 1));
  const monthName = MONTHS[focusMonth];

  const incThisMonth = incomeForMonth(data, focusMonth);
  const incNetThisMonth = incomeNetForMonth(data, focusMonth);
  const spendThisMonth = data.expensePayments.filter(e => monthIdx(e.date) === focusMonth).reduce((a, e) => a + expenseAmount(e), 0);
  const activeSubs = s.recurring.filter(isSubActive);
  const recurringMonthly = activeSubs.reduce((a, r) => a + monthlyEquiv(r), 0);
  const recurringAnnual = activeSubs.reduce((a, r) => a + annualCost(r), 0);
  // Cashflow left = take-home (net) income − spending − bills.
  const netThisMonth = incNetThisMonth - spendThisMonth - recurringMonthly;
  const incYTD = incomeYTDall(data);
  const netYTD = incomeNetYTDall(data);
  const spendYTD = data.expensePayments.reduce((a, e) => a + expenseAmount(e), 0);
  const projAnnualIncome = monthsElapsed > 0 ? incYTD / monthsElapsed * 12 : incYTD;
  const projAnnualExpense = recurringAnnual + (monthsElapsed > 0 ? spendYTD / monthsElapsed * 12 : spendYTD);

  // "Should be left over" for a typical month: take-home income − recurring bills −
  // typical (average) non-recurring spending. Starts from NET, not gross.
  const autoNet = avgNetMonthlyIncome(store);
  const avgSpend = monthsElapsed > 0 ? spendYTD / monthsElapsed : spendThisMonth;
  const incomeBasis = (autoNet && autoNet > 0) ? autoNet : (monthsElapsed > 0 ? netYTD / monthsElapsed : incNetThisMonth);
  const shouldLeft = incomeBasis - recurringMonthly - avgSpend;

  const ctx = { store, s, data, monthName, incThisMonth, spendThisMonth, recurringMonthly, recurringAnnual, netThisMonth, shouldLeft, projAnnualIncome, projAnnualExpense, incYTD, netYTD, monthsElapsed };

  const head = el('div', 'view-head');
  const left = el('div'); left.appendChild(el('h3', null, 'Dashboard'));
  // Month navigator — step back through previous months right here (kept in sync
  // with the top-bar Year/Month selectors). Forward stops at the current month.
  const nav = el('div', 'dash-month-nav');
  const prevB = el('button', 'dash-nav-btn', '‹'); prevB.title = 'Previous month';
  prevB.addEventListener('click', () => stepDashMonth(-1));
  const navLabel = el('span', 'dash-nav-label', monthName + ' ' + activeYear);
  navLabel.title = 'Snapshot month — use ‹ › to change';
  const nextB = el('button', 'dash-nav-btn', '›'); nextB.title = 'Next month';
  const atPresent = activeYear > curYear || (activeYear === curYear && focusMonth >= now.getMonth());
  nextB.disabled = atPresent;
  nextB.addEventListener('click', () => stepDashMonth(1));
  nav.appendChild(prevB); nav.appendChild(navLabel); nav.appendChild(nextB);
  if (!(activeYear === curYear && focusMonth === now.getMonth())) {
    const todayB = el('button', 'dash-nav-today', 'This month');
    todayB.title = 'Jump back to the current month';
    todayB.addEventListener('click', () => goDashMonth(curYear, now.getMonth()));
    nav.appendChild(todayB);
  }
  left.appendChild(nav);
  head.appendChild(left);
  const lockBtn = el('button', 'btn-ghost', dashUnlocked ? '✓ Done editing' : '✎ Edit layout');
  lockBtn.title = dashUnlocked ? 'Keep these changes and lock the layout' : 'Unlock to reorder, resize, remove, or add panels';
  lockBtn.addEventListener('click', () => {
    if (!dashUnlocked) panelSnapshots.dashboard = JSON.parse(JSON.stringify(store.state.settings.dashPanels || null));
    dashUnlocked = !dashUnlocked; renderView(currentRoute);
  });
  head.appendChild(lockBtn);
  if (dashUnlocked) {
    const cancelBtn = el('button', 'btn-ghost', '✕ Cancel changes');
    cancelBtn.title = 'Put the layout back the way it was when you started editing';
    cancelBtn.addEventListener('click', () => { dashUnlocked = false; store.setDashPanels(panelSnapshots.dashboard); });
    head.appendChild(cancelBtn);
  }
  view.appendChild(head);

  const state = dashPanelState(store);
  if (dashUnlocked) {
    const addRow = el('div', 'dash-add-row');
    addRow.appendChild(el('span', 'muted', 'Drag panels to reorder · ✕ removes · click a header to collapse.'));
    DASH_PANEL_DEFS.filter(d => state.some(p => p.k === d.key && p.off)).forEach(d => {
      const b = el('button', 'btn-ghost', '＋ ' + d.title);
      b.addEventListener('click', () => { const en = state.find(p => p.k === d.key); en.off = 0; store.setDashPanels(state); });
      addRow.appendChild(b);
    });
    view.appendChild(addRow);
  }
  const grid = el('div', 'dash-panels');
  state.forEach(entry => {
    if (entry.off) return;
    const def = DASH_PANEL_DEFS.find(d => d.key === entry.k); if (!def) return;
    grid.appendChild(dashPanel(store, def, entry, state, ctx));
  });
  view.appendChild(grid);
  attachPanelPacking(grid);
}

// ============================================================
// Reports — Phase 7 (part 1)
// ============================================================
async function buildBarChart(canvas, cfg) {
  let Chart;
  try { Chart = await ensureChart(); } catch (e) { canvas.parentElement && canvas.parentElement.appendChild(el('div', 'muted', 'Chart could not load (offline?).')); return; }
  if (!canvas.isConnected) return;
  _charts.push(new Chart(canvas, {
    type: 'bar',
    data: { labels: cfg.labels, datasets: cfg.datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: cfg.datasets.length > 1, position: 'top', labels: { boxWidth: 12, usePointStyle: true, font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => (ctx.dataset.label ? ctx.dataset.label + ': ' : '') + money(ctx.parsed.y) } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#5f6f66' } },
        y: { ticks: { font: { size: 11 }, color: '#5f6f66', callback: v => '$' + v }, grid: { color: '#eef1ef' } }
      }
    }
  }));
}

function reportCard(title, builder) {
  const card = el('div', 'card');
  card.appendChild(el('h3', 'strip-title', title));
  const wrap = el('div', 'report-chart'); const cv = document.createElement('canvas'); wrap.appendChild(cv); card.appendChild(wrap);
  builder(cv);
  return card;
}
function doughnutInto(cv, map) {
  const entries = Object.entries(map).filter(([k, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) { cv.parentElement.appendChild(el('div', 'muted', 'No data yet.')); return; }
  // Every slice states its share of the whole, like the dashboard donuts.
  const total = entries.reduce((a, e) => a + e[1], 0);
  buildDoughnut(cv, { labels: entries.map(e => e[0] + ' · ' + (total > 0 ? (e[1] / total * 100).toFixed(1) : '0.0') + '%'), data: entries.map(e => e[1]) });
}

function monthlyIncomeTotals(store, data) {
  const m = new Array(12).fill(0);
  data.income.filter(countable).forEach(e => { const mi = monthIdx(e.date); if (mi >= 0) m[mi] += amountOf(e); });
  data.paychecks.filter(isPaycheckPaid).forEach(p => { const mi = monthIdx(p.payDate); if (mi >= 0) m[mi] += Number(p.gross) || 0; });
  return m;
}
function monthlyRecurringTotals(store, payments) {
  const m = new Array(12).fill(0);
  store.state.recurring.filter(isSubActive).forEach(bill => {
    const me = monthlyEquiv(bill);
    for (let mi = 0; mi < 12; mi++) { const ov = payments.some(p => p.recurringId === bill.id && monthIdx(p.date) === mi); if (!ov) m[mi] += me; }
  });
  return m;
}
function monthlyExpenseTotals(store, data, includeRecurring) {
  const m = new Array(12).fill(0);
  data.expensePayments.forEach(e => { const mi = monthIdx(e.date); if (mi >= 0) m[mi] += expenseAmount(e); });
  if (includeRecurring && recurringAppliesTo(activeYear)) { const rec = monthlyRecurringTotals(store, data.expensePayments); for (let i = 0; i < 12; i++) m[i] += rec[i]; }
  return m;
}
function wageMonthly(data, field) {
  const m = new Array(12).fill(0);
  data.paychecks.filter(isPaycheckPaid).forEach(p => { const mi = monthIdx(p.payDate); if (mi >= 0) m[mi] += Number(p[field]) || 0; });
  return m;
}
// Months that have actually happened. Past years are complete; a future year has
// no elapsed months at all, so the only meaningful view there is the full-year
// projection — the current year is the one that needs capping.
function ytdMonthCap() {
  const now = new Date();
  return activeYear === now.getFullYear() ? now.getMonth() + 1 : 12;
}
// "Year to date" has to mean the same window for every slice. Logged payments are
// facts and only exist for months that happened, but recurringMonthsForCategory
// projects a bill across all 12 — so an unbounded sum weighed 12 months of
// estimated premiums against 7 months of real groceries and made bill-heavy
// categories (insurance, housing) look far larger than they are. Cap the estimate
// at the elapsed months; leave logged payments alone, since a future-dated payment
// is still something the user really recorded (and Spend YTD counts it too).
function expenseByCategoryFull(store, data) {
  const m = {};
  const cap = ytdMonthCap();
  data.expensePayments.forEach(e => { const g = store.expenseGroupName(e.categoryId); m[g] = (m[g] || 0) + expenseAmount(e); });
  if (recurringAppliesTo(activeYear)) store.state.expenseCategories.forEach(cat => { const rec = recurringMonthsForCategory(store, cat.id, data.expensePayments).slice(0, cap).reduce((a, b) => a + b, 0); if (rec > 0) m[cat.name] = (m[cat.name] || 0) + rec; });
  return m;
}
function expenseByAccount(store, data) {
  const m = {};
  data.expensePayments.forEach(e => { const name = store.accountName(e.accountId) || 'Unassigned'; m[name] = (m[name] || 0) + expenseAmount(e); });
  return m;
}
function incomeByNamedCategory(store, data, re) {
  const cat = store.state.incomeCategories.find(c => re.test(c.name));
  if (!cat) return 0;
  let s = data.income.filter(countable).filter(e => e.categoryId === cat.id).reduce((a, e) => a + amountOf(e), 0);
  s += data.paychecks.filter(isPaycheckPaid).filter(p => p.incomeCategoryId === cat.id).reduce((a, p) => a + (Number(p.gross) || 0), 0);
  return s;
}

// ============================================================
// Tax history — per-year filings, amendments, extensions
// ============================================================
const FED_FORMS = ['1040', '1040-SR', '1040-NR', '1040-X'];
// User-editable form list from Settings → Tax forms (catalog.taxForms).
const catalogTaxForms = s => ((s.catalog && s.catalog.taxForms) || []).map(f => f.name).filter(Boolean);
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
const NO_INCOME_TAX_STATES = ['AK','FL','NV','SD','TN','TX','WA','WY'];
// Primary state return forms (best-known); anything not listed falls back to
// "<ST>-1040"-style guesses. Purely suggestions — free-typing always works.
const STATE_FORMS = {
  IL: ['IL-1040', 'IL-1040-X', 'Sch IL-WIT', 'Sch M', 'Sch ICR', 'Sch NR'],
  CA: ['540', '540 2EZ', 'Sch CA (540)'],
  NY: ['IT-201', 'IT-203', 'IT-201-X'],
  WI: ['Form 1', 'Form 1NPR'],
  MI: ['MI-1040', 'MI-1040X'],
  OH: ['IT 1040', 'SD 100'],
  PA: ['PA-40'],
  GA: ['Form 500', 'Form 500X'],
  IN: ['IT-40'],
  MN: ['M1', 'M1X'],
  NJ: ['NJ-1040', 'NJ-1040X'],
  MA: ['Form 1'],
  AZ: ['Form 140', 'Form 140X'],
  CO: ['DR 0104'],
  MO: ['MO-1040'],
  VA: ['Form 760'],
  NC: ['D-400']
};
function stateFormSuggestions(st) {
  const S = String(st || '').trim().toUpperCase();
  if (!S) return [];
  if (NO_INCOME_TAX_STATES.includes(S)) return [];
  return STATE_FORMS[S] || [S + '-1040', S + '-1040-X'];
}
// Plain-English meaning of common tax forms — shown as tooltips wherever a form
// name appears, so it's clear why a form was used that year.
const TAX_FORM_INFO = {
  '1040': 'The standard U.S. individual income tax return.',
  '1040-SR': 'The 1040 variant for taxpayers 65 and older — larger print, standard-deduction chart.',
  '1040-NR': 'U.S. income tax return for nonresident aliens.',
  '1040-X': 'Amended return — corrects a previously filed 1040.',
  '4868': 'Application for an automatic 6-month filing extension.',
  'SCHEDULE A': 'Itemized deductions — mortgage interest, state/local taxes, charity, medical.',
  'SCHEDULE B': 'Interest and ordinary dividends (required when they top $1,500).',
  'SCHEDULE C': 'Profit or loss from a sole-proprietor business or side gig.',
  'SCHEDULE D': 'Capital gains and losses from selling investments.',
  'SCHEDULE E': 'Rental income, royalties, and income from partnerships, S-corps, and trusts.',
  'SCHEDULE SE': 'Self-employment tax — Social Security/Medicare on self-employment income.',
  'SCHEDULE 1': 'Additional income and adjustments — unemployment, student-loan interest, etc.',
  'SCHEDULE 2': 'Additional taxes — alternative minimum tax, premium-credit repayment, etc.',
  'SCHEDULE 3': 'Additional credits and payments.',
  '8949': 'Detailed list of capital-asset sales that feeds Schedule D.',
  '8889': 'Health Savings Account (HSA) contributions and distributions.',
  '2441': 'Child and dependent care expenses credit.',
  '8863': 'Education credits — American Opportunity / Lifetime Learning.',
  '8606': 'Nondeductible IRA contributions (tracks your basis).',
  'K-1': 'Your share of income from a partnership, S-corp, or trust.',
  'W-2': 'Wage statement from an employer — wages paid and taxes withheld for the year.',
  '1099-NEC': 'Nonemployee compensation — contract/gig pay of $600+ from one payer.',
  '1099-MISC': 'Miscellaneous income — settlements, prizes, and other $600+ payments.',
  '1099-INT': 'Interest income — banks send one when they paid you $10+ in interest.',
  '1099-DIV': 'Dividends and distributions — brokers send one at $10+ in dividends.',
  '1099-B': 'Broker proceeds — sales of stocks/funds during the year.',
  '1099-K': 'Payment-card / marketplace payouts (e.g. Poshmark) — thresholds vary by year and state.'
};
function taxFormInfo(form) {
  if (!form) return '';
  const f = String(form).trim().toUpperCase().replace(/^FORM\s+/, '');
  if (TAX_FORM_INFO[f]) return TAX_FORM_INFO[f];
  const sched = /^SCH(?:EDULE)?\.?\s*([A-Z0-9]+)$/.exec(f);
  if (sched && TAX_FORM_INFO['SCHEDULE ' + sched[1]]) return TAX_FORM_INFO['SCHEDULE ' + sched[1]];
  if (/-X$/.test(f)) return 'An amended return — corrects a previously filed version of this form.';
  if (/^[A-Z]{2}[- ]/.test(f) || /STATE/.test(f)) return 'A state income tax return form.';
  return '';
}
function formCell(formName) {
  const td = el('td');
  if (!formName) { td.textContent = '—'; return td; }
  const info = taxFormInfo(formName);
  const span = el('span', info ? 'hint-underline' : null, formName);
  if (info) span.title = info;
  td.appendChild(span); return td;
}
const TAX_COL_LABELS = { taxYear: 'Tax year', type: 'Type', fedForm: 'Federal form', fedResult: 'Federal', stateFiled: 'State filed in', stateForm: 'State form', stateResult: 'State', preparer: 'Prepared by', prepCost: 'Prep cost', formCosts: 'Form costs', flags: 'Flags', filed: 'Filed', notes: 'Notes' };
const TAX_ALL_COLS = ['taxYear', 'type', 'fedForm', 'fedResult', 'stateFiled', 'stateForm', 'stateResult', 'preparer', 'prepCost', 'formCosts', 'flags', 'filed', 'notes'];
const TAX_DEFAULT_COLS = ['taxYear', 'type', 'fedForm', 'fedResult', 'stateForm', 'stateResult', 'preparer', 'prepCost', 'flags'];
function taxOutcomeCell(outcome, amount) {
  const td = el('td', 'num');
  if (!outcome || outcome === 'none' || amount == null || amount === '') { td.textContent = '—'; return td; }
  const span = el('span', outcome === 'refund' ? 'pos' : 'neg', (outcome === 'refund' ? '+' : '−') + money(Number(amount) || 0));
  span.title = outcome === 'refund' ? 'Refunded to you' : 'You paid / owed';
  td.appendChild(span); return td;
}
function taxOutcomeSortVal(outcome, amount) { const a = Number(amount) || 0; return outcome === 'refund' ? a : outcome === 'owed' ? -a : 0; }
function yearHasAmendment(store, taxYear) { return store.state.taxRecords.some(x => x.kind === 'amendment' && +x.taxYear === +taxYear); }
function buildTaxCol(store, key) {
  switch (key) {
    case 'taxYear': return { label: 'Tax year', key: 'taxYear', num: true, value: r => Number(r.taxYear) || 0, cell: r => { const td = el('td', 'strong'); td.textContent = r.taxYear || '—'; return td; } };
    case 'type': return { label: 'Type', key: 'type', value: r => r.kind === 'amendment' ? 1 : 0, cell: r => { const td = el('td'); td.appendChild(r.kind === 'amendment' ? badge('Amendment', 'amber') : el('span', 'muted', 'Original')); return td; } };
    case 'fedForm': return { label: 'Federal form', key: 'fedForm', value: r => r.fedForm || '', cell: r => formCell(r.fedForm) };
    case 'fedResult': return { label: 'Federal', key: 'fedResult', num: true, value: r => taxOutcomeSortVal(r.fedOutcome, r.fedAmount), cell: r => taxOutcomeCell(r.fedOutcome, r.fedAmount) };
    case 'stateFiled': return { label: 'State filed in', key: 'stateFiled', value: r => r.state || '', cell: r => el('td', 'muted', r.state || '—') };
    case 'stateForm': return { label: 'State form', key: 'stateForm', value: r => r.stateForm || '', cell: r => formCell(r.stateForm) };
    case 'stateResult': return { label: 'State', key: 'stateResult', num: true, value: r => taxOutcomeSortVal(r.stateOutcome, r.stateAmount), cell: r => taxOutcomeCell(r.stateOutcome, r.stateAmount) };
    case 'preparer': return { label: 'Prepared by', key: 'preparer', value: r => r.preparer || '', cell: r => el('td', null, r.preparer || '—') };
    case 'prepCost': return { label: 'Prep cost', key: 'prepCost', num: true, value: r => Number(r.prepCost) || 0, cell: r => {
        const td = numCell(Number(r.prepCost) || 0);
        const fc = Array.isArray(r.formCosts) ? r.formCosts.filter(x => x.form) : [];
        if (fc.length) { td.title = 'Itemized: ' + fc.map(x => x.form + ' ' + money(Number(x.cost) || 0)).join(' · '); td.appendChild(el('div', 'acct-sub', fc.length + ' form' + (fc.length === 1 ? '' : 's') + ' itemized')); }
        return td; } };
    case 'formCosts': return { label: 'Form costs', sortable: false, cell: r => {
        const td = el('td', 'muted');
        const fc = Array.isArray(r.formCosts) ? r.formCosts.filter(x => x.form) : [];
        if (!fc.length) { td.textContent = '—'; return td; }
        fc.forEach((x, i) => {
          if (i) td.appendChild(document.createTextNode(' · '));
          const span = el('span', taxFormInfo(x.form) ? 'hint-underline' : null, x.form + ' ' + money(Number(x.cost) || 0));
          const info = taxFormInfo(x.form); if (info) span.title = info;
          td.appendChild(span);
        });
        return td; } };
    case 'flags': return { label: 'Flags', sortable: false, cell: r => {
        const td = el('td'); const flags = el('div', 'flags');
        if (r.extended) flags.appendChild(badge('Extended', 'amber'));
        if (r.kind !== 'amendment' && yearHasAmendment(window.cloverStore, r.taxYear)) flags.appendChild(badge('Amended', 'type'));
        td.appendChild(flags); return td; } };
    case 'filed': return { label: 'Filed', key: 'filed', value: r => r.filedDate || '', cell: r => el('td', null, r.filedDate ? fmtDate(r.filedDate) : '—') };
    case 'notes': return { label: 'Notes', key: 'notes', value: r => r.notes || '', cell: r => { const td = el('td', 'muted'); td.textContent = r.notes || '—'; return td; } };
  }
  return null;
}

// ---- Tax history CSV: export, import (with template) ----
const TAX_CSV_HEADERS = ['Tax year', 'Filing type', 'Federal form', 'Federal outcome', 'Federal amount', 'State filed in', 'State form', 'State outcome', 'State amount', 'Prepared by', 'Prep cost', 'Extended', 'Filed date', 'Form costs', 'Notes'];
function csvEsc(v) { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function exportTaxesCSV(store) {
  const rows = [TAX_CSV_HEADERS.join(',')];
  store.state.taxRecords.forEach(r => rows.push([
    r.taxYear, r.kind || 'original', r.fedForm, r.fedOutcome, r.fedAmount, r.state, r.stateForm, r.stateOutcome, r.stateAmount,
    r.preparer, r.prepCost, r.extended ? 'yes' : 'no', r.filedDate,
    (r.formCosts || []).map(f => f.form + ': ' + (f.cost != null ? f.cost : '')).join('; '), r.notes
  ].map(csvEsc).join(',')));
  downloadFile('clover-tax-history.csv', rows.join('\n'), 'text/csv');
}
const TAX_TEMPLATE_CSV = TAX_CSV_HEADERS.join(',') + '\n'
  + '2025,original,1040,refund,1250,IL,IL-1040,owed,300,Smith CPA,225,no,2026-03-15,"1040: 150; Schedule B: 75",\n'
  + '2025,amendment,1040-X,refund,120,IL,IL-1040-X,none,,Smith CPA,75,no,2026-06-01,,Corrected a missed 1099\n';
function importTaxesCSV(store, rows) {
  const g = (r, name) => { const k = Object.keys(r).find(x => x.trim().toLowerCase() === name.toLowerCase()); return k ? String(r[k]).trim() : ''; };
  const outcome = v => /refund/i.test(v) ? 'refund' : /owed|paid/i.test(v) ? 'owed' : 'none';
  const num = v => { const n = parseImportAmount(v); return isNaN(n) ? null : n; };
  const existing = new Set(store.state.taxRecords.map(r => [r.taxYear, r.kind, r.fedAmount, r.stateAmount, r.filedDate].join('|')));
  let added = 0, skipped = 0;
  rows.forEach(r => {
    const taxYear = parseInt(g(r, 'Tax year'), 10);
    if (!taxYear || taxYear < 1990) { skipped++; return; }
    const entry = {
      taxYear, kind: /amend/i.test(g(r, 'Filing type')) ? 'amendment' : 'original',
      fedForm: g(r, 'Federal form'), fedOutcome: outcome(g(r, 'Federal outcome')), fedAmount: num(g(r, 'Federal amount')),
      state: g(r, 'State filed in').toUpperCase(), stateForm: g(r, 'State form'), stateOutcome: outcome(g(r, 'State outcome')), stateAmount: num(g(r, 'State amount')),
      preparer: g(r, 'Prepared by'), prepCost: num(g(r, 'Prep cost')),
      extended: /^(y|yes|true|1|x)$/i.test(g(r, 'Extended')), filedDate: parseImportDate(g(r, 'Filed date')),
      formCosts: g(r, 'Form costs').split(';').map(x => { const m = /^(.+?):\s*([\d.]*)$/.exec(x.trim()); return m ? { form: m[1].trim(), cost: m[2] ? parseFloat(m[2]) : null } : null; }).filter(Boolean),
      notes: g(r, 'Notes')
    };
    const key = [entry.taxYear, entry.kind, entry.fedAmount, entry.stateAmount, entry.filedDate].join('|');
    if (existing.has(key)) { skipped++; return; }
    existing.add(key);
    store.saveTaxRecord(entry); added++;
  });
  toast('Imported ' + added + ' tax record' + (added === 1 ? '' : 's') + (skipped ? ' · ' + skipped + ' skipped (duplicate or no year)' : ''));
}

// Expected tax forms for a year, derived from what's tracked: employers (W-2/1099
// from their pay schedule), interest (1099-INT), dividends (1099-DIV), investment
// sales (1099-B), marketplace sales (1099-K), settlements (1099-MISC).
let taxFormsYear = null;
function expectedFormBadge(form) {
  const b = el('span', 'badge type hint-underline', form);
  const info = taxFormInfo(form); if (info) b.title = info;
  return b;
}
function expectedTaxFormsCard(store) {
  const s = store.state;
  const cur = new Date().getFullYear();
  const yr = taxFormsYear || cur;
  const card = el('div', 'card');
  const headRow = el('div', 'view-head');
  headRow.appendChild(el('h3', 'strip-title', 'Expected tax forms · ' + yr));
  const ySel = select([cur, cur - 1, cur - 2, cur - 3].map(y => ({ value: String(y), label: String(y) })), String(yr));
  ySel.addEventListener('change', () => { taxFormsYear = +ySel.value; renderView(currentRoute); });
  headRow.appendChild(ySel);
  card.appendChild(headRow);
  if (!store.isYearLoaded(yr)) { store.loadYear(yr); card.appendChild(el('div', 'muted', 'Loading year data…')); return card; }
  const d = store.yearData(yr);
  const list = el('div', 'mini-list');
  const item = (form, text, sub) => {
    const rw = el('div', 'mini-row');
    const left = el('div');
    const top = el('span'); top.appendChild(expectedFormBadge(form)); top.appendChild(document.createTextNode(' ' + text));
    left.appendChild(top);
    if (sub) left.appendChild(el('div', 'acct-sub', sub));
    rw.appendChild(left); list.appendChild(rw);
  };
  // Employers — from that year's paid checks + each employer's schedule.
  const empGross = {};
  d.paychecks.filter(isPaycheckPaid).forEach(pc => { const e = (pc.employer || '').trim(); if (e) empGross[e] = (empGross[e] || 0) + (Number(pc.gross) || 0); });
  Object.keys(empGross).sort().forEach(emp => {
    const sch = s.paySchedules.find(x => (x.employer || '').toLowerCase() === emp.toLowerCase());
    const form = sch && sch.taxForm;
    if (form === 'none') { item('W-2', emp + ' — ' + money(empGross[emp]) + ' gross', 'Marked “None / cash” on the pay schedule — no form expected.'); return; }
    if (form) item(form, 'from ' + emp + ' — ' + money(empGross[emp]) + ' gross');
    else item('W-2', 'or 1099-NEC from ' + emp + ' — ' + money(empGross[emp]) + ' gross', 'Set “Pay reported on” in this employer’s pay schedule to pin this down.');
  });
  // Interest → 1099-INT
  const intCat = s.incomeCategories.find(c => /interest/i.test(c.name));
  if (intCat) {
    const ints = d.income.filter(countable).filter(e => e.categoryId === intCat.id);
    const total = ints.reduce((a, e) => a + amountOf(e), 0);
    if (total >= 10) {
      const banks = [...new Set(ints.map(e => store.accountName(e.accountId)).filter(x => x && x !== '—'))];
      item('1099-INT', 'interest totaled ' + money(total), 'Each bank that paid you $10+ sends one' + (banks.length ? ' — ' + banks.slice(0, 3).join(', ') + (banks.length > 3 ? ' +' + (banks.length - 3) + ' more' : '') : '') + '.');
    }
  }
  // Dividends → 1099-DIV
  const divCat = s.incomeCategories.find(c => /dividend/i.test(c.name));
  if (divCat) {
    const divs = d.income.filter(countable).filter(e => e.categoryId === divCat.id);
    const total = divs.reduce((a, e) => a + amountOf(e), 0);
    if (total >= 10) {
      const brokers = [...new Set(divs.map(e => e.receivedVia).filter(Boolean))];
      item('1099-DIV', 'dividends totaled ' + money(total), 'Each broker that paid $10+ sends one' + (brokers.length ? ' — ' + brokers.slice(0, 3).join(', ') : '') + '. A 1099-B comes along if you also sold shares there.');
    }
  }
  // Investments (sales of securities) → possible 1099-B
  const invCat = s.incomeCategories.find(c => /invest/i.test(c.name));
  if (invCat && d.income.filter(countable).some(e => e.categoryId === invCat.id)) {
    item('1099-B', 'investment income was logged', 'Brokers report sale proceeds on a 1099-B (often combined with the 1099-DIV).');
  }
  // Marketplace sales → possible 1099-K
  if ((d.sales || []).length) {
    const earn = (d.sales || []).reduce((a, x) => a + (Number(x.earnings) || 0), 0);
    item('1099-K', (d.sales || []).length + ' marketplace sales — ' + money(earn) + ' earnings', 'Poshmark and payment platforms issue a 1099-K above the year’s reporting threshold (varies by year and state).');
  }
  // Settlements → possible 1099-MISC
  const otherCat = s.incomeCategories.find(c => /other/i.test(c.name));
  if (otherCat) {
    const suits = d.income.filter(countable).filter(e => e.categoryId === otherCat.id && /lawsuit|settle/i.test(e.otherType || ''));
    const total = suits.reduce((a, e) => a + amountOf(e), 0);
    if (total >= 600) item('1099-MISC', 'settlements totaled ' + money(total), 'Settlements of $600+ often come with a 1099-MISC from the payer.');
  }
  if (!list.children.length) card.appendChild(el('div', 'muted', 'Nothing tracked for ' + yr + ' yet — forms will appear here as income does.'));
  else card.appendChild(list);
  card.appendChild(el('div', 'sum-hint', 'A filing-season checklist based on what you’ve tracked in Clover — hover a form for what it means. Not tax advice.'));
  return card;
}

function renderTaxes(view) {
  const store = window.cloverStore, s = store.state;
  const recs = s.taxRecords;

  const head = el('div', 'view-head');
  const left = el('div'); left.appendChild(el('h3', null, 'Tax history'));
  const years = [...new Set(recs.map(r => +r.taxYear).filter(Boolean))];
  left.appendChild(el('p', 'muted', years.length + ' tax year' + (years.length === 1 ? '' : 's') + ' · ' + recs.length + ' filing' + (recs.length === 1 ? '' : 's')));
  head.appendChild(left);
  const actions = el('div', 'head-actions');
  const tmplBtn = el('button', 'btn-ghost', '⬇ Template');
  tmplBtn.title = 'Download a sample CSV showing the import format';
  tmplBtn.addEventListener('click', () => downloadFile('clover-tax-history-template.csv', TAX_TEMPLATE_CSV, 'text/csv'));
  actions.appendChild(tmplBtn);
  const impLabel = el('label', 'btn-ghost file-btn'); impLabel.textContent = '⬆ Import CSV';
  const impIn = document.createElement('input'); impIn.type = 'file'; impIn.accept = '.csv,text/csv'; impIn.style.display = 'none';
  impIn.addEventListener('change', async () => {
    const file = impIn.files && impIn.files[0]; if (!file) return;
    let Papa; try { Papa = await ensurePapa(); } catch (e) { toast('CSV parser couldn’t load', 'warn'); return; }
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: res => { if (!res.data.length) { toast('No rows found in that CSV', 'warn'); return; } importTaxesCSV(store, res.data); },
      error: () => toast('Couldn’t read that CSV', 'warn')
    });
  });
  impLabel.appendChild(impIn); actions.appendChild(impLabel);
  if (recs.length) {
    const expBtn = el('button', 'btn-ghost', '⬇ Export CSV');
    expBtn.addEventListener('click', () => exportTaxesCSV(store));
    actions.appendChild(expBtn);
  }
  const add = el('button', 'btn-primary', '+ Add tax return');
  add.addEventListener('click', () => taxModal(null));
  actions.appendChild(add);
  head.appendChild(actions);
  view.appendChild(head);
  view.appendChild(expectedTaxFormsCard(store));

  if (!recs.length) {
    view.appendChild(emptyState('No tax history yet', 'Log each year’s federal and state filing — the forms used, what was refunded or owed, what the CPA charged, plus extensions and amendments.', '+ Add tax return', () => taxModal(null)));
    return;
  }

  const refunded = recs.reduce((a, r) => a + (r.fedOutcome === 'refund' ? Number(r.fedAmount) || 0 : 0) + (r.stateOutcome === 'refund' ? Number(r.stateAmount) || 0 : 0), 0);
  const paid = recs.reduce((a, r) => a + (r.fedOutcome === 'owed' ? Number(r.fedAmount) || 0 : 0) + (r.stateOutcome === 'owed' ? Number(r.stateAmount) || 0 : 0), 0);
  const prep = recs.reduce((a, r) => a + (Number(r.prepCost) || 0), 0);
  const sum = el('div', 'sub-summary');
  sum.appendChild(sumCard('Refunded (all yrs)', money(refunded), 'income'));
  sum.appendChild(sumCard('Paid / owed (all yrs)', money(paid), 'expense'));
  sum.appendChild(sumCard('Prep costs (all yrs)', money(prep), 'expense'));
  sum.appendChild(sumCard('Years filed', String(years.length), 'neutral'));
  view.appendChild(sum);

  const cols = [
    ...tableColKeys(store, 'taxes', TAX_COL_LABELS, TAX_DEFAULT_COLS).map(k => buildTaxCol(store, k)).filter(Boolean),
    { label: '', sortable: false, cell: r => {
        const td = el('td', 'row-actions');
        if (r.kind !== 'amendment') {
          const amend = el('button', 'icon-btn', 'Amend');
          amend.title = 'Add an amendment for tax year ' + r.taxYear;
          amend.addEventListener('click', () => taxModal(null, {
            taxYear: r.taxYear, kind: 'amendment', fedForm: '1040-X',
            stateForm: r.stateForm ? (r.stateForm.replace(/-X$/i, '') + '-X') : '', preparer: r.preparer
          }));
          td.appendChild(amend);
        }
        const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => taxModal(r));
        const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove('Tax year ' + r.taxYear + (r.kind === 'amendment' ? ' amendment' : ''), () => store.removeTaxRecord(r.id)));
        td.appendChild(edit); td.appendChild(del); return td; } }
  ];
  view.appendChild(tableTools(columnsButton('taxes', TAX_ALL_COLS, TAX_DEFAULT_COLS, TAX_COL_LABELS, 'Tax history columns')));
  const card = el('div', 'card table-card');
  card.appendChild(sortableTable(cols, recs, taxesSort, ns => { taxesSort = ns || { key: 'taxYear', dir: 'desc' }; renderView(currentRoute); }, r => r.kind === 'amendment' ? 'inactive-row' : ''));
  view.appendChild(card);
}

function taxModal(existing, preset) {
  const store = window.cloverStore, s = store.state;
  const r = existing ? Object.assign({}, existing)
    : Object.assign({ taxYear: new Date().getFullYear() - 1, kind: 'original', fedForm: '1040', fedOutcome: 'refund', stateOutcome: 'refund', extended: false }, preset || {});
  const body = el('div', 'form-grid');

  const fedList = el('datalist'); fedList.id = 'fed-form-list';
  [...new Set(catalogTaxForms(s).concat(FED_FORMS).concat(s.taxRecords.map(x => x.fedForm).filter(Boolean)))].forEach(f => { const o = el('option'); o.value = f; fedList.appendChild(o); });
  body.appendChild(fedList);
  const usList = el('datalist'); usList.id = 'us-states-list';
  US_STATES.forEach(x => { const o = el('option'); o.value = x; usList.appendChild(o); });
  body.appendChild(usList);
  const stList = el('datalist'); stList.id = 'state-form-list';
  const rebuildStateForms = st => {
    stList.innerHTML = '';
    [...new Set(stateFormSuggestions(st).concat(catalogTaxForms(s)).concat(s.taxRecords.map(x => x.stateForm).filter(Boolean)))].forEach(f => { const o = el('option'); o.value = f; stList.appendChild(o); });
  };
  body.appendChild(stList);
  const cpaList = el('datalist'); cpaList.id = 'cpa-list';
  [...new Set(s.taxRecords.map(x => x.preparer).filter(Boolean))].forEach(p => { const o = el('option'); o.value = p; cpaList.appendChild(o); });
  body.appendChild(cpaList);

  const fYear = input(r.taxYear || '', { type: 'number', placeholder: 'e.g. ' + (new Date().getFullYear() - 1) }); fYear.min = 1990; fYear.max = 2100;
  const fKind = select([{ value: 'original', label: 'Original return' }, { value: 'amendment', label: 'Amendment' }], r.kind || 'original');
  const fFedForm = input(r.fedForm || '', { placeholder: 'e.g. 1040', list: 'fed-form-list' });
  const fFedOut = select([{ value: 'refund', label: 'Refund' }, { value: 'owed', label: 'Owed / paid' }, { value: 'none', label: 'Neither / zero' }], r.fedOutcome || 'refund');
  const fFedAmt = moneyInput(r.fedAmount);
  const fStateFiled = input(r.state || '', { placeholder: 'e.g. two-letter code', list: 'us-states-list' });
  const stateHint = el('div', 'sum-hint');
  const syncStateFiled = () => {
    rebuildStateForms(fStateFiled.value);
    const S = fStateFiled.value.trim().toUpperCase();
    stateHint.textContent = NO_INCOME_TAX_STATES.includes(S) ? 'This state has no income tax — a state return usually isn’t filed.' : '';
  };
  fStateFiled.addEventListener('input', syncStateFiled);
  const fStForm = input(r.stateForm || '', { placeholder: 'your state’s return form', list: 'state-form-list' });
  const fStOut = select([{ value: 'refund', label: 'Refund' }, { value: 'owed', label: 'Owed / paid' }, { value: 'none', label: 'Neither / zero' }], r.stateOutcome || 'refund');
  const fStAmt = moneyInput(r.stateAmount);
  const fFiled = input(r.filedDate || '', { type: 'date' });
  const cExt = checkbox('Filed an extension', !!r.extended, 'You filed for an extension this year (e.g. Form 4868), moving the filing deadline out.');
  const fCpa = input(r.preparer || '', { placeholder: 'CPA / preparer, or “Self”', list: 'cpa-list' });
  const fCost = moneyInput(r.prepCost);
  const fNotes = document.createElement('textarea'); fNotes.value = r.notes || ''; fNotes.rows = 2; fNotes.placeholder = 'Optional';

  // Live plain-English hint under the form inputs (what the typed form means).
  const fedHint = el('div', 'sum-hint'), stHint = el('div', 'sum-hint');
  const syncHints = () => { fedHint.textContent = taxFormInfo(fFedForm.value) || ''; stHint.textContent = taxFormInfo(fStForm.value) || ''; };
  fFedForm.addEventListener('input', syncHints); fStForm.addEventListener('input', syncHints);

  // Itemized per-form costs (optional) — what the CPA charged for each form, when
  // they break it out. Kept separate from the total prep cost (which may already
  // include these).
  const allFormsList = el('datalist'); allFormsList.id = 'tax-form-all-list';
  [...new Set(catalogTaxForms(s).concat(FED_FORMS).concat(Object.keys(TAX_FORM_INFO)).concat(s.taxRecords.flatMap(x => (x.formCosts || []).map(f => f.form))).filter(Boolean))].forEach(f => { const o = el('option'); o.value = f; allFormsList.appendChild(o); });
  body.appendChild(allFormsList);
  let formCosts = Array.isArray(r.formCosts) ? r.formCosts.map(x => ({ form: x.form || '', cost: x.cost })) : [];
  const fcWrap = el('div');
  const renderFC = () => {
    fcWrap.innerHTML = '';
    formCosts.forEach((fc, i) => {
      const row = el('div', 'io-actions');
      const fForm = input(fc.form, { placeholder: 'e.g. Schedule C', list: 'tax-form-all-list' });
      fForm.addEventListener('input', () => { fc.form = fForm.value; const info = taxFormInfo(fForm.value); fForm.title = info || ''; });
      const fAmt = moneyInput(fc.cost);
      fAmt.addEventListener('input', () => { fc.cost = fAmt.value === '' ? null : parseFloat(fAmt.value); });
      const x = el('button', 'icon-btn danger', '✕'); x.title = 'Remove this form cost';
      x.addEventListener('click', () => { formCosts.splice(i, 1); renderFC(); });
      row.appendChild(fForm); row.appendChild(fAmt.__wrap); row.appendChild(x);
      fcWrap.appendChild(row);
    });
    const addFc = el('button', 'btn-ghost', '＋ Add form cost');
    addFc.addEventListener('click', () => { formCosts.push({ form: '', cost: null }); renderFC(); });
    fcWrap.appendChild(addFc);
  };
  renderFC();

  const yRow = el('div', 'two-col');
  yRow.appendChild(field('Tax year', fYear, 'The year the return covers (not the year you filed it).'));
  yRow.appendChild(field('Filing type', fKind, 'Original return, or an amendment to a year you already filed (e.g. 1040-X).'));
  body.appendChild(yRow);
  const fedRow = el('div', 'cd-fields');
  const fedField = field('Federal form', fFedForm, 'The federal form filed — 1040, 1040-SR, or 1040-X for an amendment. A plain-English description appears below as you type.');
  fedField.appendChild(fedHint);
  fedRow.appendChild(fedField);
  fedRow.appendChild(field('Federal outcome', fFedOut, 'Whether the federal return came back as a refund or you owed.'));
  fedRow.appendChild(field('Federal amount', fFedAmt, 'The refund received or the amount paid, for the federal return.'));
  body.appendChild(fedRow);
  const stateFiledField = field('State filed in', fStateFiled, 'Which state this return was filed in. Picking one fills the State-form suggestions with that state’s forms (e.g. IL → IL-1040, Sch IL-WIT).');
  stateFiledField.appendChild(stateHint);
  body.appendChild(stateFiledField);
  const stRow = el('div', 'cd-fields');
  const stField = field('State form', fStForm, 'The state return form filed, if any. Suggestions come from the “State filed in” above.');
  stField.appendChild(stHint);
  stRow.appendChild(stField);
  stRow.appendChild(field('State outcome', fStOut, 'Whether the state return came back as a refund or you owed.'));
  stRow.appendChild(field('State amount', fStAmt, 'The refund received or the amount paid, for the state return.'));
  body.appendChild(stRow);
  syncHints(); syncStateFiled();
  const meta = el('div', 'two-col');
  meta.appendChild(field('Filed date', fFiled, 'When this return (or amendment) was actually filed.'));
  meta.appendChild(field('Extension', cExt));
  body.appendChild(meta);
  const prepRow = el('div', 'two-col');
  prepRow.appendChild(field('Prepared by', fCpa, 'Who did the taxes — your CPA’s name, a service, or “Self”.'));
  prepRow.appendChild(field('Prep cost (total)', fCost, 'What the CPA or service charged in total for this filing. The itemized form costs below are informational — they may already be included in this total, so they aren’t added to it.'));
  body.appendChild(prepRow);
  body.appendChild(field('Itemized form costs (optional)', fcWrap, 'If the CPA broke out what each form cost (e.g. 1040 $150, Schedule C $75), record it here to understand the bill. Not added to totals — the total prep cost above is what counts.'));
  body.appendChild(field('Notes', fNotes, 'Anything worth remembering — why it was amended, what changed, etc.'));

  openModal({
    title: existing ? 'Edit tax return' : (r.kind === 'amendment' ? 'Add amendment · tax year ' + r.taxYear : 'Add tax return'),
    body: withHistoryTab(body, existing), confirmLabel: 'Save',
    onConfirm: () => {
      const taxYear = parseInt(fYear.value, 10);
      if (!taxYear || taxYear < 1990) { fYear.focus(); toast('Enter the tax year', 'warn'); return false; }
      const entry = Object.assign(r, {
        taxYear, kind: fKind.value, state: fStateFiled.value.trim().toUpperCase(),
        fedForm: fFedForm.value.trim(), fedOutcome: fFedOut.value,
        fedAmount: fFedAmt.value === '' ? null : parseFloat(fFedAmt.value),
        stateForm: fStForm.value.trim(), stateOutcome: fStOut.value,
        stateAmount: fStAmt.value === '' ? null : parseFloat(fStAmt.value),
        filedDate: fFiled.value || '', extended: cExt.__input.checked,
        preparer: fCpa.value.trim(), prepCost: fCost.value === '' ? null : parseFloat(fCost.value),
        formCosts: formCosts.filter(x => (x.form || '').trim()).map(x => ({ form: x.form.trim(), cost: x.cost != null && !isNaN(x.cost) ? x.cost : null })),
        notes: fNotes.value.trim()
      });
      store.saveTaxRecord(entry);
      toast(existing ? 'Tax return updated' : (entry.kind === 'amendment' ? 'Amendment added' : 'Tax return added'));
    }
  });
}

let reportsUnlocked = false;
function reportBody(builder) {
  const card = el('div', 'card');
  const wrap = el('div', 'report-chart'); const cv = document.createElement('canvas'); wrap.appendChild(cv); card.appendChild(wrap);
  builder(cv);
  return card;
}
const REPORT_PANEL_DEFS = [
  { key: 'incExp', title: 'Income vs Expenses', build: ctx => reportBody(cv => buildBarChart(cv, { labels: MONTHS, datasets: [ { label: 'Income', data: ctx.inc, backgroundColor: '#16a34a' }, { label: 'Expenses', data: ctx.exp, backgroundColor: '#dc2626' } ] })) },
  { key: 'cashflow', title: 'Net cashflow by month', build: ctx => reportBody(cv => buildBarChart(cv, { labels: MONTHS, datasets: [{ label: 'Net', data: ctx.net, backgroundColor: ctx.net.map(v => v >= 0 ? '#16a34a' : '#dc2626') }] })) },
  { key: 'wages', title: 'Wages: gross vs net', build: ctx => reportBody(cv => buildBarChart(cv, { labels: MONTHS, datasets: [ { label: 'Gross', data: ctx.wGross, backgroundColor: '#2563eb' }, { label: 'Net', data: ctx.wNet, backgroundColor: '#16a34a' } ] })) },
  { key: 'incCat', title: 'Income by category', build: ctx => reportBody(cv => doughnutInto(cv, incomeByCategory(ctx.store, ctx.data))) },
  { key: 'expCat', title: 'Expenses by category', build: ctx => reportBody(cv => doughnutInto(cv, expenseByCategoryFull(ctx.store, ctx.data))) },
  { key: 'expMethod', title: 'Expenses by payment method', build: ctx => reportBody(cv => doughnutInto(cv, expenseByAccount(ctx.store, ctx.data))) },
  { key: 'yoy', title: 'Year overview', span2: true, build: ctx => { const c = yoyOverview(ctx.store); const t = c.querySelector('.strip-title'); if (t) t.remove(); return c; } }
];
function renderReports(view) {
  destroyCharts();
  const store = window.cloverStore;
  if (!store.isYearLoaded(activeYear)) { view.appendChild(loadingPanel()); store.loadYear(activeYear); return; }
  const data = store.yearData(activeYear);

  const head = el('div', 'view-head');
  const left = el('div');
  left.appendChild(el('h3', null, 'Reports · ' + activeYear));
  left.appendChild(el('p', 'muted', 'Charts follow the selected year'));
  head.appendChild(left);
  const lockBtn = el('button', 'btn-ghost', reportsUnlocked ? '✓ Done editing' : '✎ Edit layout');
  lockBtn.title = reportsUnlocked ? 'Keep these changes and lock the layout' : 'Unlock to reorder, resize, remove, or add report panels';
  lockBtn.addEventListener('click', () => {
    if (!reportsUnlocked) panelSnapshots.reports = JSON.parse(JSON.stringify((store.state.settings.pagePanels || {}).reports || null));
    reportsUnlocked = !reportsUnlocked; renderView(currentRoute);
  });
  head.appendChild(lockBtn);
  if (reportsUnlocked) {
    const cancelBtn = el('button', 'btn-ghost', '✕ Cancel changes');
    cancelBtn.title = 'Put the layout back the way it was when you started editing';
    cancelBtn.addEventListener('click', () => { reportsUnlocked = false; store.setPagePanels('reports', panelSnapshots.reports); });
    head.appendChild(cancelBtn);
  }
  view.appendChild(head);
  const yt = yearTabs(store, 'reports'); if (yt) view.appendChild(yt);

  const inc = monthlyIncomeTotals(store, data);
  const exp = monthlyExpenseTotals(store, data, true);
  const ctx = { store, data, inc, exp, net: inc.map((v, i) => v - exp[i]), wGross: wageMonthly(data, 'gross'), wNet: wageMonthly(data, 'net') };

  const state = pagePanelState(store, 'reports', REPORT_PANEL_DEFS);
  const opts = { unlocked: reportsUnlocked, save: arr => store.setPagePanels('reports', arr) };
  if (reportsUnlocked) {
    const addRow = el('div', 'dash-add-row');
    addRow.appendChild(el('span', 'muted', 'Drag panels to reorder · ✕ removes · click a header to collapse.'));
    REPORT_PANEL_DEFS.filter(d => state.some(px => px.k === d.key && px.off)).forEach(d => {
      const b = el('button', 'btn-ghost', '＋ ' + d.title);
      b.addEventListener('click', () => { const en = state.find(px => px.k === d.key); en.off = 0; store.setPagePanels('reports', state); });
      addRow.appendChild(b);
    });
    view.appendChild(addRow);
  }
  const grid = el('div', 'dash-panels');
  state.forEach(entry => {
    if (entry.off) return;
    const def = REPORT_PANEL_DEFS.find(d => d.key === entry.k); if (!def) return;
    grid.appendChild(dashPanel(store, def, entry, state, ctx, opts));
  });
  view.appendChild(grid);
  attachPanelPacking(grid);
}

function yearSummary(store, y) {
  const d = store.yearData(y);
  const income = incomeYTDall(d);
  const expenses = d.expensePayments.reduce((a, e) => a + expenseAmount(e), 0);   // logged actuals (historically correct)
  return {
    year: y, income, expenses, net: income - expenses,
    dividends: incomeByNamedCategory(store, d, /dividend/i),
    interest: incomeByNamedCategory(store, d, /interest/i),
    rewards: incomeByNamedCategory(store, d, /reward/i),
    // What paycheck jobs withheld that year: gross − net across recorded
    // checks where both amounts are known (taxes, 401k, insurance, …).
    wageDeductions: d.paychecks.filter(p => isPaycheckPaid(p) && p.gross != null && p.net != null)
      .reduce((a, p) => a + Math.max(0, (Number(p.gross) || 0) - (Number(p.net) || 0)), 0)
  };
}
const YOY_COL_LABELS = { income: 'Income', expenses: 'Expenses', net: 'Net', wageDeductions: 'Wage deductions', dividends: 'Dividends', interest: 'Interest', rewards: 'Rewards' };
const YOY_ALL_COLS = ['income', 'expenses', 'net', 'wageDeductions', 'dividends', 'interest', 'rewards'];
function yoyCell(r, key) {
  if (key === 'net') { const td = numCell(r.net, true); td.classList.add(r.net >= 0 ? 'pos' : 'neg'); return td; }
  return numCell(r[key], key === 'income');
}
function yoyOverview(store) {
  const curYear = new Date().getFullYear();
  const years = yearsAvailable().filter(y => y <= curYear);
  const missing = years.filter(y => !store.isYearLoaded(y));
  const card = el('div', 'card');
  const yh = el('div', 'view-head');
  yh.appendChild(el('h3', 'strip-title', 'Year overview'));
  yh.appendChild(columnsButton('yoy', YOY_ALL_COLS, YOY_ALL_COLS, YOY_COL_LABELS, 'Year overview columns'));
  card.appendChild(yh);
  if (missing.length) {
    missing.forEach(y => store.loadYear(y));   // re-renders when each loads
    card.appendChild(el('div', 'muted', 'Loading year data…'));
    return card;
  }
  const rows = years.map(y => yearSummary(store, y)).filter(r => r.income || r.expenses);
  if (!rows.length) { card.appendChild(el('div', 'muted', 'No data yet — add income and expenses to see year-over-year totals.')); return card; }
  const keys = tableColKeys(store, 'yoy', YOY_COL_LABELS, YOY_ALL_COLS);
  const wrap = el('div', 'table-scroll');
  const table = el('table', 'data-table');
  table.innerHTML = '<thead><tr><th>Year</th>' + keys.map(k => '<th class="num">' + YOY_COL_LABELS[k] + '</th>').join('') + '</tr></thead>';
  const tb = el('tbody');
  rows.forEach(r => {
    const tr = el('tr');
    tr.appendChild(el('td', 'strong', String(r.year)));
    keys.forEach(k => tr.appendChild(yoyCell(r, k)));
    tb.appendChild(tr);
  });
  table.appendChild(tb); wrap.appendChild(table); card.appendChild(wrap);
  return card;
}

// ============================================================
// FOMC meetings — the Fed's rate-decision dates. Reference data, not user data,
// so it's a built-in table: the Fed publishes ~18 months ahead and there is NO
// official machine feed (only the HTML calendar), so a hardcoded schedule is
// more reliable than scraping. Refresh once a year from the official page:
//   https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
// Each meeting runs 2 days; the rate decision (what matters here) lands on the
// second day at ~2:00 PM ET. `sep` marks meetings with a Summary of Economic
// Projections (the "dot plot"). Dates only — no minutes, by request.
// ============================================================
const FOMC_SEED = [
  { start: '2025-01-28', end: '2025-01-29' },
  { start: '2025-03-18', end: '2025-03-19', sep: true },
  { start: '2025-05-06', end: '2025-05-07' },
  { start: '2025-06-17', end: '2025-06-18', sep: true },
  { start: '2025-07-29', end: '2025-07-30' },
  { start: '2025-09-16', end: '2025-09-17', sep: true },
  { start: '2025-10-28', end: '2025-10-29' },
  { start: '2025-12-09', end: '2025-12-10', sep: true },
  { start: '2026-01-27', end: '2026-01-28' },
  { start: '2026-03-17', end: '2026-03-18', sep: true },
  { start: '2026-04-28', end: '2026-04-29' },
  { start: '2026-06-16', end: '2026-06-17', sep: true },
  { start: '2026-07-28', end: '2026-07-29' },
  { start: '2026-09-15', end: '2026-09-16', sep: true },
  { start: '2026-10-27', end: '2026-10-28' },
  { start: '2026-12-08', end: '2026-12-09', sep: true },
  { start: '2027-01-26', end: '2027-01-27' },
  { start: '2027-03-16', end: '2027-03-17', sep: true },
  { start: '2027-04-27', end: '2027-04-28' },
  { start: '2027-06-08', end: '2027-06-09', sep: true },
  { start: '2027-07-27', end: '2027-07-28' },
  { start: '2027-09-14', end: '2027-09-15', sep: true },
  { start: '2027-10-26', end: '2027-10-27' },
  { start: '2027-12-07', end: '2027-12-08', sep: true }
];
// Live FOMC schedule. A GitHub Action refreshes clover/fomc.json from the Fed's
// calendar every month; the app fetches that same-origin file (no CORS) and uses
// it in place of the built-in seed. Any failure — offline, 404, malformed —
// falls back to FOMC_SEED, so the calendar is never empty or wrong. No Claude and
// no server of our own in the loop.
let _fomcLive = null, _fomcUpdated = '';
function fomcMeetings() { return _fomcLive || FOMC_SEED; }
function loadFomc() {
  fetch('fomc.json?d=' + new Date().toISOString().slice(0, 10), { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(j => {
      const ms = j && Array.isArray(j.meetings) ? j.meetings : null;
      if (!ms || ms.length < 8 || !ms.every(m => /^\d{4}-\d{2}-\d{2}$/.test(m.start) && /^\d{4}-\d{2}-\d{2}$/.test(m.end))) return;
      _fomcLive = ms.slice().sort((a, b) => a.start.localeCompare(b.start));
      _fomcUpdated = j.updated || '';
      if (currentRoute === 'calendar' || currentRoute === 'credit') renderView(currentRoute);
    })
    .catch(() => {});
}
function fomcShown() { return (window.cloverStore.state.settings.showFomc !== false); }   // default on
function fomcLoadedThroughYear() { return fomcMeetings()[fomcMeetings().length - 1].end.slice(0, 4); }
// The schedule needs refreshing once we're within ~5 months of running out —
// surfaced in the FOMC card so the annual update can't be silently forgotten.
function fomcNeedsRefresh() { const last = fomcMeetings()[fomcMeetings().length - 1]; const d = daysUntil(last.end); return d != null && d < 150; }
// "Jul 28-29, 2026", or "Apr 30 - May 1, 2026" across a month boundary.
function fomcRangeText(m) {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(m.start), b = /^(\d{4})-(\d{2})-(\d{2})/.exec(m.end);
  if (!a || !b) return m.start + ' - ' + m.end;
  if (a[2] === b[2]) return fmtDate(m.start).replace(/,.*/, '') + '-' + (+b[3]) + ', ' + b[1];
  return fmtDate(m.start).replace(/,.*/, '') + ' - ' + fmtDate(m.end);
}

// ============================================================
// Calendar — Phase 7 (part 2)
// ============================================================
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dateInMonth(iso, year, month) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); if (!m) return null;
  if (+m[1] !== year || (+m[2] - 1) !== month) return null;
  return +m[3];
}
function calendarEvents(store, year, month) {
  const events = [];
  const yd = store.yearData(year);
  (yd.paychecks || []).forEach(p => { const d = dateInMonth(p.payDate, year, month); if (d) events.push({ day: d, type: 'Paycheck', label: (p.employer || 'Paycheck') + ' · ' + money(Number(p.gross) || 0), tone: 'green', gid: 'pc-' + (p.id || (p.payDate + '-' + (p.employer || ''))) }); });
  // Expected pay dates from active schedules — shown until a real paycheck
  // gets recorded within 4 days of them (then the recorded one takes over).
  activeSchedules(store).forEach(sch => {
    expectedPayPeriods(sch, year).forEach(per => {
      const d = dateInMonth(per.payDate, year, month); if (!d) return;
      const recorded = (yd.paychecks || []).some(pc => (pc.employer || '').toLowerCase() === (sch.employer || '').toLowerCase() && Math.abs(daysBetweenISO(per.payDate, pc.payDate)) <= 4);
      if (recorded) return;
      events.push({ day: d, type: 'Expected paycheck', label: (sch.employer || 'Paycheck') + ' expected' + (sch.gross ? ' · ~' + money(Number(sch.gross)) : ''), tone: 'green', gid: 'exp-' + sch.id + '-' + per.payDate });
    });
  });
  store.state.recurring.filter(isSubActive).forEach(r => { renewalDaysInMonth(r, year, month).forEach(d => events.push({ day: d, type: 'Bill', label: r.name + (r.frequency === 'once' ? ' due · ' : ' renews · ') + money(Number(r.amount) || 0), tone: 'amber', gid: 'bill-' + r.id + '-' + year + '-' + (month + 1) + '-' + d })); });
  store.state.accounts.filter(a => a.type === 'CD' && a.cdMaturity).forEach(a => {
    const name = a.name + (a.last4 ? ' ••' + a.last4 : '');
    const d = dateInMonth(a.cdMaturity, year, month);
    if (d) events.push({ day: d, type: 'CD matures', label: name + ' matures', tone: 'blue', gid: 'cdm-' + a.id });
    // Heads-up a week ahead — time to decide on rollover vs. withdrawal
    // before the bank's auto-renew window closes.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(a.cdMaturity);
    if (m) {
      const r = addDays(new Date(+m[1], +m[2] - 1, +m[3]), -7);
      if (r.getFullYear() === year && r.getMonth() === month)
        events.push({ day: r.getDate(), type: 'CD reminder', label: name + ' matures in 7 days (' + fmtDate(a.cdMaturity) + ')', tone: 'amber', gid: 'cdr-' + a.id });
    }
  });
  if (fomcShown()) fomcMeetings().forEach(mtg => {
    const d = dateInMonth(mtg.end, year, month);
    if (d) events.push({ day: d, type: 'FOMC', label: 'FOMC rate decision' + (mtg.sep ? ' + projections' : ''), tone: 'purple', gid: 'fomc-' + mtg.end });
  });
  return events;
}

// ============================================================
// Google Calendar one-way push — client-side Google Identity Services.
// No server, no secret: the client id below is public by design. Events go
// to a dedicated "Clover" calendar; each carries a stable cloverId so
// re-syncs update/remove instead of duplicating.
// ============================================================
const GCAL_CLIENT_ID = '102155680656-8gg1s4ms8blhs04pm47jqr48auufdvv8.apps.googleusercontent.com';
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar';
const GCAL_MONTHS_AHEAD = 3;   // sync horizon: this month + the next two
let _gisLoading = null, _gcalToken = null, _gcalTokenExp = 0;
function ensureGIS() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if (_gisLoading) return _gisLoading;
  _gisLoading = new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
    sc.onload = () => resolve();
    sc.onerror = () => { _gisLoading = null; reject(new Error('Couldn’t load Google sign-in')); };
    document.head.appendChild(sc);
  });
  return _gisLoading;
}
function gcalToken() {
  if (_gcalToken && Date.now() < _gcalTokenExp - 60000) return Promise.resolve(_gcalToken);
  return ensureGIS().then(() => new Promise((resolve, reject) => {
    const tc = google.accounts.oauth2.initTokenClient({
      client_id: GCAL_CLIENT_ID, scope: GCAL_SCOPE,
      callback: resp => {
        if (resp && resp.access_token) { _gcalToken = resp.access_token; _gcalTokenExp = Date.now() + (Number(resp.expires_in) || 3600) * 1000; resolve(_gcalToken); }
        else reject(new Error((resp && resp.error) || 'No token'));
      },
      error_callback: e => reject(new Error((e && e.type) === 'popup_closed' ? 'Sign-in popup closed' : ((e && e.type) || 'Sign-in failed')))
    });
    tc.requestAccessToken({ prompt: '' });
  }));
}
function gfetch(path, opts) {
  return gcalToken().then(tok => fetch('https://www.googleapis.com/calendar/v3' + path, Object.assign({}, opts, {
    headers: Object.assign({ Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, (opts || {}).headers)
  }))).then(async r => {
    if (!r.ok) throw new Error('Google Calendar ' + r.status + ' — ' + (await r.text()).slice(0, 160));
    return r.status === 204 ? null : r.json();
  });
}
async function gcalEnsureCalendar(store) {
  const g = store.state.settings.gcal || {};
  const wantName = (g.calendarName || 'Clover').trim() || 'Clover';
  if (g.calendarId) {
    try { await gfetch('/calendars/' + encodeURIComponent(g.calendarId)); return g.calendarId; } catch (e) { /* deleted — recreate */ }
  }
  const list = await gfetch('/users/me/calendarList?minAccessRole=owner&maxResults=250');
  const found = (list.items || []).find(c => c.summary === wantName);
  const id = found ? found.id : (await gfetch('/calendars', { method: 'POST', body: JSON.stringify({ summary: wantName, description: 'Pushed from Clover — paychecks, expected pay dates, bills, CD maturities, and FOMC meeting dates. CD maturities email you 7 days ahead. Safe to delete; the next sync recreates it.' }) })).id;
  store.setGcal({ calendarId: id });
  return id;
}
// Rename the target calendar (both in Google and in settings).
async function gcalRename(store, name) {
  store.setGcal({ calendarName: name });
  const g = store.state.settings.gcal || {};
  if (g.calendarId) await gfetch('/calendars/' + encodeURIComponent(g.calendarId), { method: 'PATCH', body: JSON.stringify({ summary: name }) });
}
function isoOfDay(y, m, d) { return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
function isoNextDay(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); const d = addDays(new Date(+m[1], +m[2] - 1, +m[3]), 1); return isoOfDay(d.getFullYear(), d.getMonth(), d.getDate()); }
// CD maturities are the one event where a nudge matters even if you never open
// the calendar again — miss the bank's auto-renew window and you're locked into
// whatever rate they roll you into. So the maturity event carries an EMAIL
// reminder 7 days out (Google sends it; Clover has no mail server of its own).
// Everything else stays silent, inheriting the calendar's default.
// The reminder rides the maturity event, not the separate "7 days before"
// heads-up event, so the timing is exact and it doesn't depend on that heads-up
// landing inside the 3-month push window.
const CD_EMAIL_REMINDER_MIN = 7 * 24 * 60;   // minutes before the all-day start
function gcalIsCdMaturity(gid) { return typeof gid === 'string' && gid.indexOf('cdm-') === 0; }
// emailOn is the user's Settings toggle (default on). Off means CD events go out
// with no reminder like everything else — and gcalRemindersMatch then flags any
// already-pushed CD event as needing a re-patch to strip the reminder.
function gcalEventBody(w, emailOn) {
  const body = { summary: w.summary, start: { date: w.iso }, end: { date: isoNextDay(w.iso) }, transparency: 'transparent', extendedProperties: { private: { cloverApp: '1', cloverId: w.gid } } };
  if (emailOn && gcalIsCdMaturity(w.gid)) body.reminders = { useDefault: false, overrides: [{ method: 'email', minutes: CD_EMAIL_REMINDER_MIN }] };
  return body;
}
// Does the event already in Google carry exactly the reminder we want? Maturity
// events pushed before this feature shipped won't — flag them for a re-patch so
// the reminder gets added without waiting for the date or name to change.
function gcalRemindersMatch(w, ex, emailOn) {
  const wantEmail = emailOn && gcalIsCdMaturity(w.gid);
  const ov = (ex.reminders && ex.reminders.overrides) || [];
  const hasEmail = ov.some(o => o.method === 'email' && o.minutes === CD_EMAIL_REMINDER_MIN);
  // Non-CD events should carry no Clover-set override; a CD event should carry ours.
  return wantEmail ? hasEmail : !hasEmail;
}
function gcalWindowEvents(store) {
  const out = []; const now = new Date();
  for (let i = 0; i < GCAL_MONTHS_AHEAD; i++) {
    const y = now.getFullYear() + Math.floor((now.getMonth() + i) / 12);
    const m = (now.getMonth() + i) % 12;
    if (!store.isYearLoaded(y)) continue;
    calendarEvents(store, y, m).forEach(ev => { if (ev.gid) out.push({ gid: ev.gid, iso: isoOfDay(y, m, ev.day), summary: ev.label }); });
  }
  return out;
}
async function gcalSyncNow(store) {
  const now = new Date();
  const years = [...new Set(Array.from({ length: GCAL_MONTHS_AHEAD }, (x, i) => now.getFullYear() + Math.floor((now.getMonth() + i) / 12)))];
  await Promise.all(years.map(y => store.loadYear(y)));
  const calId = await gcalEnsureCalendar(store);
  const want = gcalWindowEvents(store);
  const tmin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const tmax = new Date(now.getFullYear(), now.getMonth() + GCAL_MONTHS_AHEAD, 1).toISOString();
  const existing = await gfetch('/calendars/' + encodeURIComponent(calId) + '/events?maxResults=2500&privateExtendedProperty=' + encodeURIComponent('cloverApp=1') + '&timeMin=' + encodeURIComponent(tmin) + '&timeMax=' + encodeURIComponent(tmax));
  const byId = new Map();
  (existing.items || []).forEach(ev => { const k = ev.extendedProperties && ev.extendedProperties.private && ev.extendedProperties.private.cloverId; if (k && !byId.has(k)) byId.set(k, ev); });
  const cdEmailOn = (store.state.settings.gcal || {}).cdEmailReminder !== false;   // default on
  let added = 0, updated = 0, removed = 0;
  for (const w of want) {
    const body = gcalEventBody(w, cdEmailOn);
    const ex = byId.get(w.gid);
    if (!ex) { await gfetch('/calendars/' + encodeURIComponent(calId) + '/events', { method: 'POST', body: JSON.stringify(body) }); added++; }
    else {
      byId.delete(w.gid);
      if ((ex.start && ex.start.date) !== w.iso || ex.summary !== w.summary || !gcalRemindersMatch(w, ex, cdEmailOn)) { await gfetch('/calendars/' + encodeURIComponent(calId) + '/events/' + encodeURIComponent(ex.id), { method: 'PATCH', body: JSON.stringify(body) }); updated++; }
    }
  }
  for (const ex of byId.values()) { await gfetch('/calendars/' + encodeURIComponent(calId) + '/events/' + encodeURIComponent(ex.id), { method: 'DELETE' }); removed++; }
  store.setGcal({ lastSyncAt: new Date().toISOString(), lastCount: want.length });
  return { added, updated, removed, total: want.length };
}
function calShift(delta) {
  let { year, month } = calCursor;
  month += delta;
  if (month < 0) { month = 11; year--; }
  if (month > 11) { month = 0; year++; }
  calCursor = { year, month };
  renderView(currentRoute);
}

function renderCalendar(view) {
  const store = window.cloverStore;
  if (!calCursor) { const t = new Date(); calCursor = { year: t.getFullYear(), month: t.getMonth() }; }
  const { year, month } = calCursor;
  if (!store.isYearLoaded(year)) { view.appendChild(loadingPanel()); store.loadYear(year); return; }

  const head = el('div', 'view-head');
  const left = el('div');
  left.appendChild(el('h3', null, 'Calendar'));
  left.appendChild(el('p', 'muted', 'Paychecks, bill renewals, CD maturities, and FOMC meetings'));
  head.appendChild(left);
  const nav = el('div', 'head-actions');
  const prev = el('button', 'btn-ghost', '‹'); prev.addEventListener('click', () => calShift(-1));
  const lbl = el('span', 'cal-month', MONTH_NAMES[month] + ' ' + year);
  const next = el('button', 'btn-ghost', '›'); next.addEventListener('click', () => calShift(1));
  const today = el('button', 'btn-ghost', 'Today'); today.addEventListener('click', () => { const t = new Date(); calCursor = { year: t.getFullYear(), month: t.getMonth() }; renderView(currentRoute); });
  nav.appendChild(prev); nav.appendChild(lbl); nav.appendChild(next); nav.appendChild(today);
  const g = store.state.settings.gcal || {};
  const gBtn = el('button', 'btn-ghost', g.calendarId ? '↻ Sync to Google' : 'Connect Google Calendar');
  gBtn.title = g.calendarId
    ? 'Push this month + the next two to your dedicated “Clover” Google calendar (adds, updates, and removes — never duplicates).' + (g.lastSyncAt ? ' Last synced ' + fmtDate(g.lastSyncAt.slice(0, 10)) + ' · ' + (g.lastCount || 0) + ' events.' : '')
    : 'One-time Google sign-in, then Clover pushes paychecks, expected pay dates, bills, CD maturities, and FOMC meeting dates to a dedicated “Clover” calendar in your Google account. CD maturities also get an email reminder 7 days ahead, sent by Google. One-way: Clover never reads your calendar.';
  const runSync = async () => {
    gBtn.disabled = true; gBtn.textContent = 'Syncing…';
    try {
      const r = await gcalSyncNow(store);
      toast('Google Calendar synced — ' + r.added + ' added · ' + r.updated + ' updated · ' + r.removed + ' removed');
    } catch (e) { toast(String(e.message || e), 'warn'); }
    renderView(currentRoute);
  };
  gBtn.addEventListener('click', () => {
    // First connect: pick the Google calendar's name (default Clover).
    if (!g.calendarId) promptText('Name the Google calendar Clover will push to', g.calendarName || 'Clover', name => { store.setGcal({ calendarName: name }); runSync(); });
    else runSync();
  });
  nav.appendChild(gBtn);
  if (g.calendarId) {
    const rn = el('button', 'btn-ghost', '✎');
    rn.title = 'Rename the Google calendar Clover pushes to (currently “' + (g.calendarName || 'Clover') + '”)';
    rn.addEventListener('click', () => promptText('Rename the Google calendar', g.calendarName || 'Clover', async name => {
      try { await gcalRename(store, name); toast('Google calendar renamed to “' + name + '”'); } catch (e) { toast(String(e.message || e), 'warn'); }
    }));
    nav.appendChild(rn);
  }
  head.appendChild(nav);
  view.appendChild(head);

  const events = calendarEvents(store, year, month);
  view.appendChild(calendarGrid(year, month, events));
  view.appendChild(calendarAgenda(events, month));
}

// Day-detail popup: full labels for every event on a day — grid chips get
// truncated, so clicking anything in a cell opens this, like a real calendar.
function calendarDayModal(year, month, day, dayEvents) {
  const body = el('div');
  const list = el('div', 'mini-list');
  dayEvents.forEach(e => {
    const row = el('div', 'mini-row');
    const left = el('span');
    left.appendChild(badge(e.type, e.tone === 'green' ? 'green' : e.tone === 'amber' ? 'amber' : e.tone === 'purple' ? 'purple' : ''));
    left.appendChild(document.createTextNode(' ' + e.label));
    row.appendChild(left);
    list.appendChild(row);
  });
  body.appendChild(list);
  openModal({ title: fmtDate(isoOfDay(year, month, day)) + ' · ' + dayEvents.length + ' event' + (dayEvents.length === 1 ? '' : 's'), body, confirmLabel: 'Close', onConfirm: () => {} });
}
function calendarGrid(year, month, events) {
  const card = el('div', 'card cal-card');
  const grid = el('div', 'cal-grid');
  DOW.forEach(d => grid.appendChild(el('div', 'cal-dow', d)));
  const first = new Date(year, month, 1).getDay();
  const dim = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const isCur = today.getFullYear() === year && today.getMonth() === month;
  for (let i = 0; i < first; i++) grid.appendChild(el('div', 'cal-cell empty'));
  for (let day = 1; day <= dim; day++) {
    const cell = el('div', 'cal-cell');
    if (isCur && today.getDate() === day) cell.classList.add('cal-today');
    cell.appendChild(el('div', 'cal-day', String(day)));
    const dayEvents = events.filter(e => e.day === day);
    if (dayEvents.length) {
      const dots = el('div', 'cal-dots');
      dayEvents.slice(0, 4).forEach(e => dots.appendChild(el('span', 'cal-dot ' + e.tone)));
      cell.appendChild(dots);
      dayEvents.slice(0, 3).forEach(e => { const chip = el('div', 'cal-event ' + e.tone, e.label); chip.title = e.label + ' — click for details'; cell.appendChild(chip); });
      if (dayEvents.length > 3) cell.appendChild(el('div', 'cal-more', '+' + (dayEvents.length - 3) + ' more'));
      // The whole cell opens the day view — chips truncate and dots are tiny,
      // so any click on the day shows the full labels.
      cell.classList.add('cal-clickable');
      cell.addEventListener('click', () => calendarDayModal(year, month, day, dayEvents));
    }
    grid.appendChild(cell);
  }
  card.appendChild(grid);
  return card;
}

function calendarAgenda(events, month) {
  const card = el('div', 'card');
  card.appendChild(el('h3', 'strip-title', MONTH_NAMES[month] + ' schedule'));
  if (!events.length) { card.appendChild(el('div', 'muted', 'Nothing scheduled this month.')); return card; }
  const list = el('div', 'mini-list');
  events.slice().sort((a, b) => a.day - b.day).forEach(e => {
    const row = el('div', 'mini-row');
    row.appendChild(el('span', null, MONTHS[month] + ' ' + e.day + ' · ' + e.label));
    row.appendChild(badge(e.type, e.tone === 'green' ? 'green' : e.tone === 'amber' ? 'amber' : ''));
    list.appendChild(row);
  });
  card.appendChild(list);
  return card;
}

// ============================================================
// Import / Export — Phase 8 (part 1: export + backup/restore)
// ============================================================
function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function toCSV(rows, columns) {
  const esc = v => { v = (v == null ? '' : String(v)); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const head = columns.map(c => esc(c.label)).join(',');
  const lines = rows.map(r => columns.map(c => esc(c.get(r))).join(','));
  return [head].concat(lines).join('\r\n');
}

function renderImport(view) {
  const store = window.cloverStore;

  const head = el('div', 'view-head');
  const left = el('div');
  left.appendChild(el('h3', null, 'Import / Export'));
  left.appendChild(el('p', 'muted', 'Back up your data, restore it, or export to spreadsheets'));
  head.appendChild(left);
  view.appendChild(head);

  // ---- Backup / restore ----
  const backup = el('div', 'card');
  backup.appendChild(el('h3', 'strip-title', 'Full backup'));
  backup.appendChild(el('p', 'muted', 'A single JSON file with everything — settings, categories, accounts, bills, and every year of income, expenses, and paychecks. Keep it somewhere safe.'));
  const bActions = el('div', 'io-actions');
  const dl = el('button', 'btn-primary', '⬇ Download backup (JSON)');
  dl.addEventListener('click', async () => {
    dl.disabled = true; dl.textContent = 'Preparing…';
    try {
      const curYear = new Date().getFullYear();
      const years = []; for (let y = curYear + 1; y >= 2015; y--) years.push(y);
      await Promise.all(years.map(y => store.loadYear(y)));
      const data = store.exportAll();
      data.exportedAt = new Date().toISOString();
      data.version = VERSION;
      downloadFile('clover-backup-' + todayISO() + '.json', JSON.stringify(data, null, 2), 'application/json');
      toast('Backup downloaded');
    } catch (e) { toast('Backup failed', 'warn'); }
    dl.disabled = false; dl.textContent = '⬇ Download backup (JSON)';
  });
  bActions.appendChild(dl);

  const restoreLabel = el('label', 'btn-ghost file-btn');
  restoreLabel.textContent = '⬆ Restore from backup…';
  const fileIn = document.createElement('input'); fileIn.type = 'file'; fileIn.accept = 'application/json,.json'; fileIn.style.display = 'none';
  fileIn.addEventListener('change', () => {
    const file = fileIn.files && fileIn.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let obj; try { obj = JSON.parse(reader.result); } catch (e) { toast('That file isn’t valid JSON', 'warn'); fileIn.value = ''; return; }
      if (!obj || obj.app !== 'clover' || !obj.meta) { toast('That doesn’t look like a Clover backup', 'warn'); fileIn.value = ''; return; }
      const body = el('div');
      body.appendChild(el('p', null, 'Restore this backup? It will REPLACE your current data with the contents of the file' + (obj.exportedAt ? ' (from ' + fmtDate(obj.exportedAt.slice(0, 10)) + ')' : '') + '. This can’t be undone.'));
      openModal({
        title: 'Restore backup', body, confirmLabel: 'Replace my data',
        onConfirm: async () => { try { await store.restore(obj); toast('Backup restored'); renderView(currentRoute); } catch (e) { toast('Restore failed', 'warn'); } }
      });
      fileIn.value = '';
    };
    reader.readAsText(file);
  });
  restoreLabel.appendChild(fileIn);
  bActions.appendChild(restoreLabel);
  backup.appendChild(bActions);
  view.appendChild(backup);

  // ---- CSV export ----
  const data = store.isYearLoaded(activeYear) ? store.yearData(activeYear) : null;
  if (!store.isYearLoaded(activeYear)) store.loadYear(activeYear);
  const csv = el('div', 'card');
  csv.appendChild(el('h3', 'strip-title', 'Export to CSV'));
  csv.appendChild(el('p', 'muted', 'Download a spreadsheet of any table. Income, expenses, and paychecks are for the selected year (' + activeYear + '); accounts and bills are your full lists.'));
  const grid = el('div', 'io-actions');

  const exp = (label, filename, rows, columns) => {
    const b = el('button', 'btn-ghost', label + ' (' + rows.length + ')');
    b.addEventListener('click', () => { downloadFile(filename, toCSV(rows, columns), 'text/csv'); toast(label + ' exported'); });
    grid.appendChild(b);
  };

  if (data) {
    exp('Income', 'clover-income-' + activeYear + '.csv', data.income, [
      { label: 'Date', get: r => r.date }, { label: 'Category', get: r => store.incomeGroupName(r.categoryId) },
      { label: 'Source', get: r => store.subName('income', r.categoryId, r.subId) }, { label: 'Account', get: r => store.accountName(r.accountId) },
      { label: 'Person', get: r => store.personName(r.personId) }, { label: 'Gross', get: r => r.gross }, { label: 'Net', get: r => r.net },
      { label: 'Status', get: r => r.status }, { label: 'Received via', get: r => r.receivedVia }, { label: 'Taxable', get: r => r.taxable },
      { label: 'Symbol', get: r => r.symbol }, { label: 'Notes', get: r => r.notes }
    ]);
    exp('Expenses', 'clover-expenses-' + activeYear + '.csv', data.expensePayments, [
      { label: 'Date', get: r => r.date }, { label: 'Category', get: r => store.expenseGroupName(r.categoryId) },
      { label: 'Source', get: r => store.subName('expense', r.categoryId, r.subId) }, { label: 'Account', get: r => store.accountName(r.accountId) },
      { label: 'Person', get: r => store.personName(r.personId) }, { label: 'Amount', get: r => r.amount }, { label: 'Notes', get: r => r.notes }
    ]);
    exp('Paychecks', 'clover-paychecks-' + activeYear + '.csv', data.paychecks, [
      { label: 'Pay date', get: r => r.payDate }, { label: 'Received', get: r => r.receivedDate }, { label: 'Gross', get: r => r.gross },
      { label: 'Net', get: r => r.net }, { label: 'Employer', get: r => r.employer }, { label: 'Person', get: r => store.personName(r.personId) },
      { label: 'Period', get: r => r.periodNum }, { label: 'Status', get: r => r.status }, { label: 'Method', get: r => r.method }, { label: 'Notes', get: r => r.notes }
    ]);
  }
  exp('Bills & subscriptions', 'clover-bills.csv', store.state.recurring, [
    { label: 'Name', get: r => r.name }, { label: 'Vendor', get: r => r.vendor }, { label: 'Category', get: r => store.expenseGroupName(r.categoryId) },
    { label: 'Amount', get: r => r.amount }, { label: 'Frequency', get: r => freqLabel(r) }, { label: 'Monthly', get: r => monthlyEquiv(r).toFixed(2) },
    { label: 'Annual', get: r => annualCost(r).toFixed(2) }, { label: 'Renews', get: r => r.renewalDate }, { label: 'Account', get: r => store.accountName(r.accountId) },
    { label: 'Auto-pay', get: r => r.autoPay ? 'yes' : 'no' }, { label: 'Priority', get: r => r.priority }, { label: 'Status', get: r => r.status }
  ]);
  exp('Accounts', 'clover-accounts.csv', store.state.accounts, [
    { label: 'Name', get: r => r.name }, { label: 'Institution', get: r => r.institution }, { label: 'Type', get: r => r.type },
    { label: 'Last 4', get: r => r.last4 }, { label: 'Owner', get: r => store.personName(r.personId) }, { label: 'Active', get: r => r.active === false ? 'no' : 'yes' },
    { label: 'Beneficiaries', get: r => beneficiaryText(r) }
  ]);
  csv.appendChild(grid);
  view.appendChild(csv);

  // ---- CSV import ----
  view.appendChild(importSection());
  const hist = importHistoryCard();
  if (hist) view.appendChild(hist);
}

// ============================================================
// CSV import wizard — Phase 8 (part 2)
// ============================================================
let _papaLoading = null;
function ensurePapa() {
  if (window.Papa) return Promise.resolve(window.Papa);
  if (_papaLoading) return _papaLoading;
  _papaLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js';
    s.onload = () => resolve(window.Papa);
    s.onerror = () => { _papaLoading = null; reject(new Error('PapaParse failed to load')); };
    document.head.appendChild(s);
  });
  return _papaLoading;
}

// Sample files (fake data) for the generic import targets.
const INCOME_TEMPLATE_CSV = 'Date,Gross,Net,Category,Reward source,Reward type,Other type,Description,Received via,Account,Person,Notes\n'
  + '2026-01-15,25.00,25.00,Rewards,Chase,Cash back,,,Statement credit,Chase ••1111,Me,\n'
  + '2026-02-03,150.00,150.00,Interest,,,,,Deposit,Ally Savings ••2222,Me,Monthly interest\n';
const EXPENSES_TEMPLATE_CSV = 'Date,Amount,Description,Vendor,Category,Applies to day,Account,Person,Check #,Notes\n'
  + '2026-07-10,14.50,Parking — Main St Garage,SpotHero,Auto,2026-07-25,Chase ••1111,Me,,Paid ahead for the 25th\n'
  + '2026-07-02,42.80,Groceries,Local Market,Food,,Checking ••2222,Me,,\n';
const PAYCHECKS_TEMPLATE_CSV = 'Pay date,Gross,Net,Received date,Employer,Person,Period #,Period start,Period end,Status,Method,Check #,Notes\n'
  + '2026-01-02,2000.00,1500.00,2026-01-02,Main Job,Me,1,2025-12-14,2025-12-27,Received,Direct deposit,,\n'
  + '2026-01-16,2000.00,1500.00,2026-01-16,Main Job,Me,2,2025-12-28,2026-01-10,Received,Check,1042,\n';
const SUBS_TEMPLATE_CSV = 'Name,Amount,Frequency,Category,Renewal date,Account,Priority,Status,Auto-pay,Vendor,Notes\n'
  + 'Netflix,15.49,monthly,Streaming,2026-08-08,Chase ••1111,Low,Active,Yes,Netflix,\n'
  + 'Example Insurance,600.00,semiannual,Insurance,2026-11-01,Checking ••2222,Essential,Active,No,Example Mutual,\n';
const SETTLEMENTS_TEMPLATE_CSV = 'Settlement name,Case name,Status,Date filed,Claim deadline,Claim / confirmation #,Claim ID,Method,Amount received,Payout date,Estimated payout,Proof required,URL,Notes\n'
  + 'Facebook Biometric Privacy,In re Facebook Biometric Info Privacy Litigation,Paid,2020-09-23,,FBY-106847310401,,PayPal,397.00,2022-05-18,,No,,\n'
  + 'Example No-Proof Settlement,Doe v. Example Corp,Submitted,2026-03-01,2026-06-30,ABC12345,,PayPal,,,15.00,No,https://examplesettlement.com,\n';
const IMPORT_FIELDS = {
  income: [
    { key: 'date', label: 'Date', req: true, kw: ['date'] },
    { key: 'gross', label: 'Gross amount', req: true, num: true, kw: ['gross', 'amount', 'paid', 'total'] },
    { key: 'net', label: 'Net (optional)', num: true, kw: ['net'] },
    { key: 'category', label: 'Category', kw: ['category', 'affiliate', 'reason'] },
    { key: 'rewardSource', label: 'Reward source', kw: ['reward source', 'program'] },
    { key: 'rewardType', label: 'Reward type', kw: ['reward type'] },
    { key: 'otherType', label: 'Other type', kw: ['other type'] },
    { key: 'description', label: 'Description', kw: ['description', 'case', 'details'] },
    { key: 'receivedVia', label: 'Received via', kw: ['received via', 'via', 'received', 'method'] },
    { key: 'account', label: 'Account', kw: ['account', 'bank', 'broker'] },
    { key: 'person', label: 'Person', kw: ['person', 'owner'] },
    { key: 'notes', label: 'Notes', kw: ['note', 'memo', 'symbol'] }
  ],
  expenses: [
    { key: 'date', label: 'Date paid', req: true, kw: ['date'] },
    { key: 'amount', label: 'Amount', req: true, num: true, kw: ['amount', 'paid', 'cost', 'total'] },
    { key: 'title', label: 'Description', kw: ['description', 'title', 'what'] },
    { key: 'vendor', label: 'Vendor', kw: ['vendor', 'merchant', 'payee'] },
    { key: 'category', label: 'Category', kw: ['category', 'reason', 'type'] },
    { key: 'forDate', label: 'Applies to day', kw: ['applies to', 'parking day', 'toll issued', 'service date', 'for date'] },
    { key: 'gallons', label: 'Gallons', kw: ['gallons', 'gallon', 'qty gal', 'volume'] },
    { key: 'pricePerGallon', label: 'Price / gallon', kw: ['price per gallon', 'price/gallon', 'ppg', 'unit price', 'price per gal'] },
    { key: 'account', label: 'Paid from', kw: ['account', 'card', 'paid from'] },
    { key: 'person', label: 'Person', kw: ['person', 'owner'] },
    { key: 'checkNo', label: 'Check #', kw: ['check #', 'check no', 'check number'] },
    { key: 'notes', label: 'Notes', kw: ['note', 'memo'] }
  ],
  paychecks: [
    { key: 'payDate', label: 'Pay date', req: true, kw: ['pay date', 'date'] },
    { key: 'gross', label: 'Gross', req: true, num: true, kw: ['gross', 'amount'] },
    { key: 'net', label: 'Net', num: true, kw: ['net'] },
    { key: 'receivedDate', label: 'Received date', kw: ['received', 'deposit'] },
    { key: 'employer', label: 'Employer', kw: ['employer', 'source'] },
    { key: 'person', label: 'Person', kw: ['person', 'owner'] },
    { key: 'periodNum', label: 'Period #', kw: ['period #', 'period no', 'period num', 'period'] },
    { key: 'periodStart', label: 'Period start', kw: ['period start', 'pay date start', 'period pay date start', 'start'] },
    { key: 'periodEnd', label: 'Period end', kw: ['period end', 'pay date end', 'period pay date end', 'end'] },
    { key: 'status', label: 'Status', kw: ['status'] },
    { key: 'method', label: 'Method', kw: ['method'] },
    { key: 'checkNo', label: 'Check #', kw: ['check #', 'check no', 'check number'] },
    { key: 'notes', label: 'Notes', kw: ['note', 'memo'] }
  ],
  subscriptions: [
    { key: 'name', label: 'Name', req: true, kw: ['name', 'subscription', 'service', 'item', 'reason'] },
    { key: 'amount', label: 'Amount', req: true, num: true, kw: ['amount', 'monthly', 'annual', 'cost', 'price'] },
    { key: 'frequency', label: 'Frequency', kw: ['frequency', 'freq', 'billing'] },
    { key: 'category', label: 'Category', kw: ['category', 'type'] },
    { key: 'renewalDate', label: 'Renewal date', kw: ['renew', 'renewal', 'next', 'date'] },
    { key: 'account', label: 'Account', kw: ['account', 'card', 'payment', 'method'] },
    { key: 'priority', label: 'Priority', kw: ['priority'] },
    { key: 'status', label: 'Status', kw: ['status', 'active'] },
    { key: 'autoPay', label: 'Auto-pay', kw: ['auto', 'autopay'] },
    { key: 'vendor', label: 'Vendor', kw: ['vendor'] },
    { key: 'notes', label: 'Notes', kw: ['note', 'description', 'memo'] }
  ],
  settlements: [
    { key: 'name', label: 'Settlement name', req: true, kw: ['settlement name', 'name', 'description', 'settlement', 'title'] },
    { key: 'caseName', label: 'Case name', kw: ['case name', 'case', 'caption'] },
    { key: 'status', label: 'Status', kw: ['status'] },
    { key: 'dateFiled', label: 'Date filed', kw: ['date filed', 'filed', 'submitted', 'date'] },
    { key: 'deadline', label: 'Claim deadline', kw: ['deadline'] },
    { key: 'claimNumber', label: 'Claim / confirmation #', kw: ['claim / confirmation', 'confirmation', 'claim #', 'claim number', 'claim no'] },
    { key: 'claimId', label: 'Claim ID', kw: ['claim id', 'settlement claim id', 'identification'] },
    { key: 'method', label: 'Method', kw: ['method', 'payment method'] },
    { key: 'amount', label: 'Amount received', num: true, kw: ['amount received', 'actual payment', 'payout', 'amount', 'payment', 'received'] },
    { key: 'payoutDate', label: 'Payout date', kw: ['payout date', 'payment date', 'paid date'] },
    { key: 'expectedAmount', label: 'Estimated payout', num: true, kw: ['estimated', 'expected', 'estimate'] },
    { key: 'proofRequired', label: 'Proof required', kw: ['proof'] },
    { key: 'url', label: 'URL', kw: ['url', 'link', 'site'] },
    { key: 'notes', label: 'Notes', kw: ['note', 'other', 'memo'] }
  ]
};
function normalizeSettleStatus(t) {
  t = (t || '').trim().toLowerCase();
  if (!t) return 'Submitted';
  if (/paid|complete/.test(t)) return 'Paid';
  if (/approv/.test(t)) return 'Approved';
  if (/deni|reject/.test(t)) return 'Denied';
  if (/exclud|opt.?out/.test(t)) return 'Excluded';
  if (/not.?submit|research|unknown/.test(t)) return 'Submitted';
  return 'Submitted';
}
function parseFrequency(t) {
  t = (t || '').toLowerCase();
  if (/bi.?week/.test(t)) return 'biweekly';
  if (/week/.test(t)) return 'weekly';
  if (/month/.test(t)) return 'monthly';
  if (/quarter/.test(t)) return 'quarterly';
  if (/semi|half.?year|6.?mo/.test(t)) return 'semiannual';
  if (/year|annual|yr/.test(t)) return 'annual';
  return 'monthly';
}
function normalizeSubStatus(t) {
  t = (t || '').trim().toLowerCase();
  const map = { active: 'Active', trial: 'Trial', paused: 'Paused', canceled: 'Canceled', cancelled: 'Canceled', inactive: 'Inactive' };
  return map[t] || (t.includes('review') ? 'Needs review' : 'Active');
}
function normalizePriority(t) {
  t = (t || '').trim().toLowerCase();
  if (t.startsWith('ess')) return 'Essential';
  if (t.startsWith('h')) return 'High';
  if (t.startsWith('l')) return 'Low';
  if (t.startsWith('o')) return 'Optional';
  return 'Medium';
}
function normalizePaycheckStatus(t) {
  t = (t || '').trim().toLowerCase(); if (!t) return 'Received';
  if (/bounce|return/.test(t)) return 'Bounced/Returned';
  if (/manual/.test(t)) return 'Manual deposit';
  if (/late/.test(t)) return 'Late';
  if (/miss/.test(t)) return 'Missing';
  if (/expect|pending/.test(t)) return 'Expected';
  return 'Received';
}
function normalizePayMethod(t) {
  t = (t || '').trim().toLowerCase(); if (!t) return 'Direct deposit';
  if (/direct/.test(t)) return 'Direct deposit';
  if (/check/.test(t)) return 'Check';
  if (/office|pick|mailbox|door|driveway|joe/.test(t)) return 'Office pickup';
  if (/deposit/.test(t)) return 'Direct deposit';
  return 'Other';
}
let importState = { target: 'income', rows: null, headers: null, mapping: {}, fallbackCat: '', filename: '' };

// Jump to the Import page pre-set to a dataset (used by per-page Import buttons).
function startImport(target) {
  importState = { target, rows: null, headers: null, mapping: {}, fallbackCat: '', filename: '' };
  divImportState = null;
  salesImportState = null;
  location.hash = '#import';
}
function importButton(target) {
  const b = el('button', 'btn-ghost', '⬆ Import CSV');
  b.addEventListener('click', () => startImport(target));
  return b;
}

function parseImportDate(str) {
  if (!str) return '';
  str = String(str).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(str); if (iso) return iso[0];
  let d = new Date(str);
  if (isNaN(d)) d = new Date(str.replace(/-/g, ' '));   // "9-Oct-2025" -> "9 Oct 2025"
  if (isNaN(d)) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parseImportAmount(v) {
  if (v == null || v === '') return NaN;
  const s = String(v).replace(/[$,\s()]/g, '');
  return parseFloat(s);
}
function guessColumn(headers, kw) {
  const h = headers.map(x => (x || '').toLowerCase());
  for (const k of kw) { const i = h.findIndex(x => x.includes(k)); if (i >= 0) return headers[i]; }
  return '';
}
function matchCategory(store, kind, text, fallbackId) {
  const cats = kind === 'income' ? store.state.incomeCategories : store.state.expenseCategories;
  const t = (text || '').toLowerCase().trim();
  if (t) { const g = cats.find(c => c.name.toLowerCase() === t) || cats.find(c => t.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(t)); if (g) return g.id; }
  return fallbackId;
}
function matchAccount(store, text) {
  const t = (text || '').toLowerCase().trim(); if (!t) return '';
  const a = store.state.accounts.find(x => x.name.toLowerCase() === t) || store.state.accounts.find(x => (x.last4 && t.includes(x.last4)) || t.includes(x.name.toLowerCase()));
  return a ? a.id : '';
}
function matchPerson(store, text) {
  const t = (text || '').toLowerCase().trim();
  const p = t && store.state.persons.find(x => t.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(t));
  return p ? p.id : (store.state.persons[0] && store.state.persons[0].id);
}
// Human-readable value for one built-entry field, for the import preview table.
function importPreviewText(key, e, store, kind) {
  const gName = kind === 'expense' ? 'expenseGroupName' : 'incomeGroupName';
  switch (key) {
    case 'date': case 'payDate': return fmtDate(e.date || e.payDate) || '—';
    case 'receivedDate': return e.receivedDate ? fmtDate(e.receivedDate) : '—';
    case 'periodStart': return e.periodStart ? fmtDate(e.periodStart) : '—';
    case 'periodEnd': return e.periodEnd ? fmtDate(e.periodEnd) : '—';
    case 'renewalDate': return e.renewalDate ? fmtDate(e.renewalDate) : '—';
    case 'dateFiled': return e.dateFiled ? fmtDate(e.dateFiled) : '—';
    case 'deadline': return e.deadline ? fmtDate(e.deadline) : '—';
    case 'payoutDate': return (e.payments && e.payments[0] && e.payments[0].date) ? fmtDate(e.payments[0].date) : '—';
    case 'category': return store[gName](e.categoryId || e.incomeCategoryId) || '—';
    case 'account': return store.accountName(e.accountId) || '—';
    case 'person': return store.personName(e.personId) || '—';
    case 'frequency': return freqLabel(e);
    case 'name': return e.name || '—';
    default: { const v = e[key]; return (v != null && v !== '') ? String(v) : '—'; }
  }
}

function buildImportEntries(store) {
  const { target, rows, mapping, fallbackCat } = importState;
  const yd = store.yearData(activeYear);
  const existingArr = target === 'income' ? yd.income : target === 'expenses' ? yd.expensePayments : target === 'paychecks' ? yd.paychecks : target === 'settlements' ? (store.state.settlements || []) : store.state.recurring;
  const existing = new Set(existingArr.map(e => dupKey(target, e)));
  const entries = []; let dupes = 0, skipped = 0;
  rows.forEach(row => {
    const g = k => mapping[k] ? (row[mapping[k]] || '') : '';
    let e;
    if (target === 'subscriptions') {
      const name = String(g('name')).trim();
      const amount = parseImportAmount(g('amount'));
      if (!name || isNaN(amount)) { skipped++; return; }
      e = { name, vendor: String(g('vendor')).trim(), categoryId: matchCategory(store, 'expense', g('category'), fallbackCat), subId: '', amount, frequency: parseFrequency(g('frequency')), interval: null, renewalDate: parseImportDate(g('renewalDate')), accountId: matchAccount(store, g('account')), backupAccountId: '', personId: matchPerson(store, g('person')), priority: normalizePriority(g('priority')), status: normalizeSubStatus(g('status')), autoPay: /^(y|yes|true|1)$/i.test(String(g('autoPay')).trim()), url: '', notes: g('notes') };
    } else if (target === 'settlements') {
      const name = String(g('name')).trim();
      if (!name) { skipped++; return; }
      const amt = g('amount') ? parseImportAmount(g('amount')) : null;
      const payoutDate = parseImportDate(g('payoutDate'));
      const method = String(g('method')).trim();
      const payments = (amt != null && !isNaN(amt)) ? [{ id: 'pay' + Math.random().toString(36).slice(2), date: payoutDate || '', amount: amt, method }] : [];
      const expAmt = g('expectedAmount') ? parseImportAmount(g('expectedAmount')) : null;
      e = {
        name, caseName: String(g('caseName')).trim(), status: normalizeSettleStatus(g('status')),
        dateFiled: parseImportDate(g('dateFiled')), deadline: parseImportDate(g('deadline')),
        claimNumber: String(g('claimNumber')).trim(), claimId: String(g('claimId')).trim(), method,
        expectedAmount: (expAmt != null && !isNaN(expAmt)) ? expAmt : null,
        proofRequired: /^(y|yes|true|1)$/i.test(String(g('proofRequired')).trim()), url: String(g('url')).trim(),
        personId: (store.state.persons[0] && store.state.persons[0].id) || '', notes: g('notes'), payments,
        // Mirrors of the single payout, used only for the import preview; stripped on save.
        amount: (amt != null && !isNaN(amt)) ? amt : null, payoutDate: payoutDate || ''
      };
    } else {
      const date = parseImportDate(target === 'paychecks' ? g('payDate') : g('date'));
      const amt = parseImportAmount(target === 'expenses' ? g('amount') : g('gross'));
      if (!date || isNaN(amt)) { skipped++; return; }
      if (target === 'income') {
        const catId = matchCategory(store, 'income', g('category'), fallbackCat);
        let net = g('net') ? parseImportAmount(g('net')) : null;
        // Rewards have no withholding — net equals gross. Fill it in if absent.
        if ((net == null || isNaN(net)) && /reward/i.test(store.incomeGroupName(catId) || '')) net = amt;
        e = { date, gross: amt, net, categoryId: catId, subId: '', accountId: matchAccount(store, g('account')), personId: matchPerson(store, g('person')), status: 'received', rewardSource: String(g('rewardSource')).trim(), rewardType: String(g('rewardType')).trim(), otherType: String(g('otherType')).trim(), description: String(g('description')).trim(), receivedVia: String(g('receivedVia')).trim(), notes: g('notes') };
      }
      else if (target === 'expenses') e = { date, amount: amt, title: String(g('title')).trim(), vendor: String(g('vendor')).trim(), forDate: parseImportDate(g('forDate')) || '', categoryId: matchCategory(store, 'expense', g('category'), fallbackCat), subId: '', accountId: matchAccount(store, g('account')), personId: matchPerson(store, g('person')), checkNo: String(g('checkNo')).trim(), gallons: parseFloat(g('gallons')) || '', pricePerGallon: parseFloat(g('pricePerGallon')) || '', notes: g('notes') };
      else e = {
        payDate: date, gross: amt, net: g('net') ? parseImportAmount(g('net')) : null,
        receivedDate: parseImportDate(g('receivedDate')), employer: String(g('employer')).trim(),
        incomeCategoryId: fallbackCat, personId: matchPerson(store, g('person')),
        periodNum: g('periodNum') ? (parseInt(String(g('periodNum')).replace(/[^\d]/g, ''), 10) || null) : null,
        periodStart: parseImportDate(g('periodStart')), periodEnd: parseImportDate(g('periodEnd')),
        status: normalizePaycheckStatus(g('status')), method: normalizePayMethod(g('method')), checkNo: String(g('checkNo')).trim(), notes: g('notes')
      };
    }
    if (existing.has(dupKey(target, e))) { dupes++; return; }
    entries.push(e);
  });
  return { entries, dupes, skipped };
}
function dupKey(target, e) {
  if (target === 'settlements') return (e.name || '').trim().toLowerCase() + '|' + (e.dateFiled || '');
  if (target === 'subscriptions') return (e.name || '').toLowerCase() + '|' + (Number(e.amount) || 0).toFixed(2);
  if (target === 'expenses') return e.date + '|' + (Number(e.amount) || 0).toFixed(2) + '|' + (e.categoryId || '');
  if (target === 'paychecks') return (e.payDate || '') + '|' + (Number(e.gross) || 0).toFixed(2);
  return e.date + '|' + (Number(e.gross) || 0).toFixed(2) + '|' + (e.categoryId || '');
}

// ============================================================
// Dividend import — broker activity files (M1 Finance, Schwab)
// ============================================================
// M1 exports ALL account activity in one file, so this pipeline keeps only
// dividend rows (purchases are used solely to tag reinvestment), dedups on
// date+symbol+amount, and routes anything ambiguous through a review step.
let divImportState = null;   // { filename, broker, divs, buys, fees, choices, includeFees, feeCat, accountId }
const BROKER_PARSERS = [
  {
    key: 'm1', name: 'M1 Finance',
    detect: h => h.includes('Transaction Type') && h.includes('Symbol') && h.includes('Amount'),
    dateNote: 'Dates shown use each row’s “Date” column; the “Posted Date” is kept too and tells same-day payouts apart (e.g. the same dividend hitting two of your accounts at that broker).',
    parse: rows => {
      const divs = [], buys = [], fees = [];
      rows.forEach((r, i) => {
        const row = i + 2;   // spreadsheet row number (header = row 1)
        const type = String(r['Transaction Type'] || '').toUpperCase();
        const date = parseImportDate(r['Date'] || r['Posted Date']);
        const postedDate = parseImportDate(r['Posted Date']);
        const symbol = String(r['Symbol'] || '').trim().toUpperCase();
        const amt = parseImportAmount(r['Amount']);
        if (!date || isNaN(amt)) return;
        if (type === 'DIVIDEND' && amt > 0) divs.push({ date, postedDate, symbol, amount: amt, action: '', desc: r['Description'] || '', row });
        else if (type === 'PURCHASED' && symbol) buys.push({ date, symbol });
        else if (type === 'OTHER' && symbol && amt < 0) fees.push({ date, symbol, amount: Math.abs(amt), desc: r['Description'] || '', row });
      });
      return { divs, buys, fees };
    }
  },
  {
    // Schwab (ex-TD Ameritrade) transactions export. Dividend actions come in many
    // abbreviations ("Qualified Dividend", "Non-Qualified Div", "Qual Div Reinvest",
    // "Pr Yr Cash Div", "Special Qual Div", …) and reinvestment is stated right in
    // the action, not inferred. Interest rows (Bond/Credit Interest) are skipped on
    // purpose — interest is tracked separately and must not double-log.
    key: 'schwab', name: 'Charles Schwab',
    detect: h => h.includes('Action') && h.includes('Symbol') && h.includes('Amount'),
    dateNote: 'Dates use the “Date” column; any “as of …” suffix is ignored.',
    parse: rows => {
      const divs = [], buys = [], fees = [];
      rows.forEach((r, i) => {
        const row = i + 2;   // spreadsheet row number (header = row 1)
        const action = String(r['Action'] || '').trim();
        const date = parseImportDate(String(r['Date'] || '').split(' as of')[0]);
        const symbol = String(r['Symbol'] || '').trim().toUpperCase();
        const amt = parseImportAmount(r['Amount']);
        if (!date || !action) return;
        if (/reinvest shares/i.test(action) || /^buy$/i.test(action)) { if (symbol) buys.push({ date, symbol }); return; }
        if (/reinvestment adj|cash in lieu|interest|transfer|journaled|litigation|split|sell|misc/i.test(action)) return;
        if (/\bdiv(idend)?\b/i.test(action) && !isNaN(amt) && amt > 0) {
          divs.push({ date, symbol, amount: amt, action, desc: r['Description'] || '', reinvested: /reinvest/i.test(action), row });
        } else if (/fee|adr|foreign tax paid/i.test(action) && !isNaN(amt) && amt < 0 && symbol) {
          fees.push({ date, symbol, amount: Math.abs(amt), desc: (action + ' — ' + (r['Description'] || '')).trim(), row });
        }
      });
      return { divs, buys, fees };
    }
  },
  {
    // Ameriprise portfolio-activity export (ameriprise.com -> Portfolio ->
    // Activity -> All transactions + date range -> download). The real header
    // sits below a few preamble lines — analyzeDividendFileRaw handles that.
    // Money-market ("Insured Money Market") interest rows are collected
    // separately so they can import as Interest income; JOURNAL rows are
    // transfers between accounts and never import.
    key: 'ameriprise', name: 'Ameriprise',
    detect: h => h.includes('Transaction Date') && h.includes('Description') && h.includes('Symbol') && h.includes('Amount'),
    dateNote: 'Dates use the “Transaction Date” column.',
    parse: rows => {
      const divs = [], buys = [], fees = [], interest = [];
      rows.forEach((r, i) => {
        const row = i + 2;   // spreadsheet row number (header = row 1)
        const desc = String(r['Description'] || '').trim();
        const date = parseImportDate(r['Transaction Date']);
        const symbol = String(r['Symbol'] || '').trim().toUpperCase();
        const amt = parseImportAmount(r['Amount']);
        if (!date || !desc) return;
        if (/^JOURNAL/i.test(desc)) return;
        if (/^INTEREST PAYMENT/i.test(desc) && !isNaN(amt) && amt > 0) { interest.push({ date, amount: amt, desc, row }); return; }
        if (/^DIVIDEND PAYMENT/i.test(desc) && !isNaN(amt) && amt > 0) { divs.push({ date, symbol: /^\d+$/.test(symbol) ? '' : symbol, amount: amt, action: '', desc, row }); return; }
        if (/^CHARGE/i.test(desc) && !isNaN(amt) && amt < 0) fees.push({ date, symbol: '', amount: Math.abs(amt), desc, row });
      });
      return { divs, buys, fees, interest };
    }
  }
];
// Sample files (fake data) showing the exact export shape each broker produces —
// downloadable from the import screen so the expected format is never a mystery.
const M1_TEMPLATE_CSV = 'Date,Posted Date,Symbol,Description,Transaction Type,Amount,Units,Unit Type,Unit Price,Security Id,Security Id Type\n'
  + '"Jan 15, 2026","Jan 14, 2026",AAPL,Dividend of 037833100 $1.25 received.,DIVIDEND,$1.25,--,CURRENCY,--,037833100,CUSIP\n'
  + '"Jan 20, 2026","Jan 20, 2026",AAPL,0.005 shares of AAPL purchased.,PURCHASED,$1.25,0.005,SHARES,$250.00,037833100,CUSIP\n'
  + '"Feb 3, 2026","Feb 2, 2026",XYZ,Dividend of 000000000 $0.10 debited.,OTHER,-$0.10,--,CURRENCY,--,000000000,CUSIP\n';
const SCHWAB_TEMPLATE_CSV = '"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"\n'
  + '"01/15/2026","Qualified Dividend","AAPL","APPLE INC","","","","$1.25"\n'
  + '"01/15/2026","Qual Div Reinvest","KO","THE COCA-COLA CO","","","","$5.40"\n'
  + '"01/15/2026","Reinvest Shares","KO","THE COCA-COLA CO","0.09","$60.00","","-$5.40"\n'
  + '"01/20/2026","Non-Qualified Div","XYZ","EXAMPLE FUND","","","","$2.10"\n'
  + '"01/22/2026","ADR Mgmt Fee","BP","BP P L C","","","","-$0.20"\n';
const AMERIPRISE_TEMPLATE_CSV = '"AMERIPRISE BROKERAGE","0000 1111 2222 3 444"\n'
  + '"Filter Criteria","Start Date: 2026-01-01 End Date: 2026-12-31 "\n,\n\n,\n"Completed Transactions"\n'
  + '"Transaction Date","Account","Description","Amount","Quantity","Price","Symbol"\n'
  + '"02/13/2026","AMERIPRISE BROKERAGE (**** 2222 3 444) ","DIVIDEND PAYMENT - EXAMPLE COMPANY INC 021326 100","$25.00","100.000","","XYZ"\n'
  + '"01/30/2026","AMERIPRISE BROKERAGE (**** 2222 3 444) ","INTEREST PAYMENT - AMERIPRISE INSURED MONEY MARKET ACCOUNT 013026 10,000 - APYE .03%","$0.25","10,000.000","","9999840"\n'
  + '"01/20/2026","AMERIPRISE BROKERAGE (**** 2222 3 444) ","CHARGE - QTRLY MAINT FEE","-$25.00","","",""\n';
function divKey(d) { return d.date + '|' + (d.symbol || '') + '|' + (Number(d.amount) || 0).toFixed(2); }
// Existing dividend keys across every loaded year (manual entries included, when
// they carry a symbol) — this is what makes re-imports and overlapping M1 exports safe.
// date|symbol|amount → the set of Clover accountIds ('' = none) that already hold
// that dividend. Lets the review treat "same payout, DIFFERENT account" as new.
function existingDividendAccountsByKey(store) {
  const map = new Map();
  Object.keys(store.state.years).forEach(yk => {
    const d = store.state.years[yk]; if (!d || !d.income) return;
    d.income.forEach(e => {
      if (!e.symbol) return;
      // Special dividends are keyed separately — a special and a regular payout of
      // the same amount on the same day are two different dividends.
      const k = e.date + '|' + String(e.symbol).toUpperCase() + '|' + (Number(e.gross) || 0).toFixed(2) + '|' + (/special/i.test(e.action || '') ? 'S' : '');
      if (!map.has(k)) map.set(k, new Set());
      map.get(k).add(e.accountId || '');
    });
  });
  return map;
}
// Existing money-market/sweep interest income (entries in an Interest-named
// category) keyed date|amount -> set of accountIds, for re-import safety.
function existingInterestAccountsByKey(store) {
  const intCatIds = new Set(store.state.incomeCategories.filter(c => /interest/i.test(c.name)).map(c => c.id));
  const map = new Map();
  Object.keys(store.state.years).forEach(yk => {
    const d = store.state.years[yk]; if (!d || !d.income) return;
    d.income.forEach(e => {
      if (!intCatIds.has(e.categoryId)) return;
      const k = e.date + '|' + (Number(e.gross) || 0).toFixed(2);
      if (!map.has(k)) map.set(k, new Set());
      map.get(k).add(e.accountId || '');
    });
  });
  return map;
}
// Some broker exports (Ameriprise) put preamble lines above the real header —
// find the header row in a header:false re-parse and analyze from there.
function analyzeDividendFileRaw(store, rawRows, filename) {
  const hi = rawRows.findIndex(r => Array.isArray(r) && r.map(x => String(x || '').trim()).includes('Transaction Date') && r.map(x => String(x || '').trim()).includes('Symbol'));
  if (hi < 0) return null;
  const headers = rawRows[hi].map(x => String(x || '').trim());
  const objRows = [];
  for (let i = hi + 1; i < rawRows.length; i++) {
    const r = rawRows[i]; if (!Array.isArray(r)) continue;
    if (!r.some(x => String(x || '').trim() !== '')) continue;
    const o = {}; headers.forEach((h, j) => { o[h] = r[j] != null ? r[j] : ''; });
    objRows.push(o);
  }
  const analyzed = analyzeDividendFile(store, objRows, headers, filename);
  if (analyzed) [analyzed.divs, analyzed.fees, analyzed.interest].forEach(list => (list || []).forEach(x => { if (x.row) x.row += hi; }));
  return analyzed;
}
function analyzeDividendFile(store, rows, headers, filename) {
  const parser = BROKER_PARSERS.find(p => p.detect(headers));
  if (!parser) return null;
  const parsed = parser.parse(rows);
  // Reinvested: Schwab states it in the action itself (explicit, set by the parser);
  // M1 doesn't, so there it's inferred from a same-symbol purchase within 14 days.
  const explicit = parser.key === 'schwab';
  parsed.divs.forEach(d => {
    if (!explicit) d.reinvested = parsed.buys.some(b => b.symbol === d.symbol && daysBetweenISO(b.date, d.date) >= 0 && daysBetweenISO(b.date, d.date) <= 14);
    d.qualified = /non-?qual/i.test(d.action) ? 'Non-qualified' : /\bqual/i.test(d.action) ? 'Qualified' : '';
  });
  // Flag duplicates. DB matches are ACCOUNT-AWARE (resolved against the selected
  // "record under" account at review time): the same payout under a different
  // Clover account is a new entry, not a duplicate. In-file repeats compare the
  // posted date AND the special-dividend flag — the same date+stock+amount can be
  // two real payouts (two accounts at the broker, or a special on top of a
  // regular dividend).
  const dbMap = existingDividendAccountsByKey(store);
  const firstRowByKey = new Map();
  parsed.divs.forEach((d, i) => {
    d.uid = i;
    d.special = !!d.special || /special/i.test(d.action || '');
    const k = divKey(d) + '|' + (d.special ? 'S' : '');
    const kf = k + '|' + (d.postedDate || '');
    d.dbAccts = dbMap.has(k) ? [...dbMap.get(k)] : null;
    if (firstRowByKey.has(kf)) { d.dupFile = true; d.dupRow = firstRowByKey.get(kf); }
    else firstRowByKey.set(kf, d.row);
  });
  const intMap = existingInterestAccountsByKey(store);
  (parsed.interest || []).forEach(t => {
    const k = t.date + '|' + (Number(t.amount) || 0).toFixed(2);
    t.dbAccts = intMap.has(k) ? [...intMap.get(k)] : null;
  });
  return { filename, broker: parser.name, dateNote: parser.dateNote || '', divs: parsed.divs, buys: parsed.buys, fees: parsed.fees, interest: parsed.interest || [], choices: {}, includeFees: true, includeInterest: true, feeCat: '', accountId: '', intAccountId: '' };
}
function dividendReviewCard(store) {
  const st = divImportState, s = store.state;
  ensureYearsScanned(store);
  const card = el('div', 'card');
  card.appendChild(el('h3', 'strip-title', 'Import dividends — ' + st.broker));
  card.appendChild(el('p', 'muted', '“' + st.filename + '” · ' + st.divs.length + ' dividend' + (st.divs.length === 1 ? '' : 's') + ' found · ' + st.buys.length + ' purchases ignored (only used to tag reinvestment) · ' + st.fees.length + ' related fee' + (st.fees.length === 1 ? '' : 's') + ((st.interest || []).length ? ' · ' + st.interest.length + ' money-market interest payment' + (st.interest.length === 1 ? '' : 's') : '') + '.' + (st.dateNote ? ' ' + st.dateNote : '')));

  const divCat = s.incomeCategories.find(c => /dividend/i.test(c.name));
  if (st.divs.length && !divCat) { card.appendChild(el('div', 'muted', 'No “Dividends” income category exists — add one in Settings first.')); return card; }

  const optRow = el('div', 'io-actions');
  const acctSel = attnWhenEmpty(accountSelect(s, st.accountId, '— no account —'));
  acctSel.addEventListener('change', () => { st.accountId = acctSel.value; renderView(currentRoute); });
  optRow.appendChild(labelWrap('Record dividends under', acctSel));
  card.appendChild(optRow);
  card.appendChild(el('p', 'muted', 'This tags every imported dividend as belonging to one of YOUR Clover accounts (e.g. your brokerage account on the Accounts page). The broker’s file doesn’t say which internal account paid — if you keep more than one account at this broker, either import the whole file under one Clover account, or run the import twice with separate per-account exports if the broker offers them.'));

  // Conflict review — DB duplicates are judged against the CURRENTLY selected
  // account, so switching "Record dividends under" re-evaluates them live.
  const isDbDup = d => !!(d.dbAccts && d.dbAccts.includes(st.accountId || ''));
  const crossAcct = st.divs.filter(d => d.dbAccts && !isDbDup(d)).length;
  if (crossAcct) card.appendChild(el('p', 'muted', crossAcct + ' row' + (crossAcct === 1 ? ' matches' : 's match') + ' a dividend already recorded under a DIFFERENT account — treated as new payouts for this account, not duplicates.'));
  const flagged = st.divs.filter(d => isDbDup(d) || d.dupFile);
  if (flagged.length) {
    card.appendChild(el('h3', 'strip-title', 'Needs review (' + flagged.length + ')'));
    card.appendChild(el('p', 'muted', 'Same date + stock + amount as an existing entry (or repeated in this file). “Merge” skips it; “Add as separate” imports it anyway (e.g. a genuine second payout).'));
    const list = el('div', 'mini-list');
    flagged.forEach(d => {
      const row = el('div', 'mini-row');
      const left = el('div');
      const top = el('span');
      top.appendChild(document.createTextNode(fmtDate(d.date) + (d.postedDate && d.postedDate !== d.date ? ' (posted ' + fmtDate(d.postedDate) + ')' : '') + ' · ' + (d.symbol || '—') + ' · ' + money(d.amount) + ' — CSV row ' + d.row + ' '));
      top.appendChild(badge(isDbDup(d) ? 'already recorded' : 'duplicate in file', 'amber'));
      left.appendChild(top);
      left.appendChild(el('div', 'acct-sub', isDbDup(d)
        ? 'Matches a dividend already recorded under this same account for this date, stock, and amount.'
        : 'Same date + stock + amount as CSV row ' + d.dupRow + ' (which will import) — open both rows in Excel to compare.'));
      row.appendChild(left);
      const choice = select([{ value: 'skip', label: 'Merge (skip)' }, { value: 'add', label: 'Add as separate' }], st.choices[d.uid] || 'skip');
      choice.addEventListener('change', () => { st.choices[d.uid] = choice.value; renderView(currentRoute); });
      row.appendChild(choice);
      list.appendChild(row);
    });
    card.appendChild(list);
  }

  if (st.fees.length) {
    const feeCats = s.expenseCategories;
    if (!st.feeCat) { const guess = feeCats.find(c => /invest/i.test(c.name)) || feeCats.find(c => /fee/i.test(c.name)) || feeCats.find(c => /other/i.test(c.name)) || feeCats[0]; st.feeCat = guess ? guess.id : ''; }
    card.appendChild(el('h3', 'strip-title', 'Dividend-related fees (' + st.fees.length + ')'));
    card.appendChild(el('p', 'muted', 'These are NOT dividends — they’re small debits the broker charged against a dividend-paying stock (ADR management fees, foreign tax). They only import if you tick the box below, as expenses in the category you pick. The broker and stock go in each expense’s note.'));
    const feeList = el('div', 'mini-list');
    st.fees.slice(0, 8).forEach(f => {
      const rw = el('div', 'mini-row');
      rw.appendChild(el('span', null, fmtDate(f.date) + ' · ' + (f.symbol || '—') + ' · −' + money(f.amount) + ' — CSV row ' + f.row));
      rw.appendChild(el('span', 'muted', (f.desc || '').slice(0, 60)));
      feeList.appendChild(rw);
    });
    card.appendChild(feeList);
    if (st.fees.length > 8) card.appendChild(el('div', 'muted', '+ ' + (st.fees.length - 8) + ' more'));
    const feeRow = el('div', 'io-actions');
    const cb = checkbox('Import these ' + st.fees.length + ' fee' + (st.fees.length === 1 ? '' : 's') + ' as expenses', st.includeFees, 'On by default — they join the same undoable import batch as the dividends. Untick to leave them out.');
    cb.__input.addEventListener('change', () => { st.includeFees = cb.__input.checked; renderView(currentRoute); });
    feeRow.appendChild(cb);
    const feeSel = select(feeCats.map(c => ({ value: c.id, label: c.name })), st.feeCat);
    // Glows until acknowledged — it's pre-filled with a best guess, so draw the
    // eye to confirm the category is right (a focus or change clears it).
    if (!st.feeCatTouched) feeSel.classList.add('attn-empty');
    const feeTouch = () => { st.feeCatTouched = true; feeSel.classList.remove('attn-empty'); };
    feeSel.addEventListener('focus', feeTouch);
    feeSel.addEventListener('change', () => { st.feeCat = feeSel.value; feeTouch(); });
    feeRow.appendChild(labelWrap('Fee category', feeSel));
    card.appendChild(feeRow);
  }

  // Money-market / sweep-account interest — imports as Interest income under
  // its OWN account pick (the sweep account is often a different Clover
  // account than the brokerage the dividends belong to).
  const intCat = s.incomeCategories.find(c => /interest/i.test(c.name));
  const importableInt = (st.interest || []).filter(t => !(t.dbAccts || []).includes(st.intAccountId || ''));
  if ((st.interest || []).length) {
    card.appendChild(el('h3', 'strip-title', 'Money-market interest (' + st.interest.length + ')'));
    const skippedInt = st.interest.length - importableInt.length;
    card.appendChild(el('p', 'muted', 'Interest paid by the broker’s cash / sweep account (e.g. the insured money market). These import as Interest income.' + (skippedInt ? ' ' + skippedInt + ' already recorded for the account picked below will be skipped automatically.' : '')));
    const iAcctRow = el('div', 'io-actions');
    const iAcctSel = attnWhenEmpty(accountSelect(s, st.intAccountId || '', '— no account —'));
    iAcctSel.addEventListener('change', () => { st.intAccountId = iAcctSel.value; renderView(currentRoute); });
    iAcctRow.appendChild(labelWrap('Record interest under', iAcctSel));
    card.appendChild(iAcctRow);
    card.appendChild(el('p', 'muted', 'Which of YOUR Clover accounts this interest belongs to — often the money market / cash-sweep account itself, which may be a different account than the brokerage the dividends go under.'));
    const il = el('div', 'mini-list');
    st.interest.slice(0, 8).forEach(t => {
      const rw = el('div', 'mini-row');
      rw.appendChild(el('span', null, fmtDate(t.date) + ' · ' + money(t.amount) + ' — CSV row ' + t.row + ((t.dbAccts || []).includes(st.accountId || '') ? ' · already recorded' : '')));
      rw.appendChild(el('span', 'muted', (t.desc || '').slice(0, 60)));
      il.appendChild(rw);
    });
    card.appendChild(il);
    if (st.interest.length > 8) card.appendChild(el('div', 'muted', '+ ' + (st.interest.length - 8) + ' more'));
    const iRow = el('div', 'io-actions');
    const icb = checkbox('Import ' + importableInt.length + ' interest payment' + (importableInt.length === 1 ? '' : 's') + ' as Interest income', st.includeInterest, 'They join the same undoable import batch as the dividends.');
    icb.__input.addEventListener('change', () => { st.includeInterest = icb.__input.checked; renderView(currentRoute); });
    iRow.appendChild(icb);
    card.appendChild(iRow);
    if (st.includeInterest && !intCat) card.appendChild(el('p', 'muted', 'No “Interest” income category exists — add one in Settings to import these.'));
  }
  const intGo = (st.includeInterest && intCat) ? importableInt : [];

  const importable = st.divs.filter(d => (!isDbDup(d) && !d.dupFile) || st.choices[d.uid] === 'add');
  const prevWrap = el('div', 'table-scroll');
  const pt = el('table', 'data-table');
  pt.innerHTML = '<thead><tr><th>Date</th><th>Symbol</th><th class="num">Amount</th><th>Type</th><th>Tags</th></tr></thead>';
  const tb = el('tbody');
  importable.slice(0, 12).forEach(d => {
    const tr = el('tr');
    tr.appendChild(el('td', null, fmtDate(d.date)));
    tr.appendChild(el('td', 'strong', d.symbol || '—'));
    tr.appendChild(numCell(d.amount, true));
    tr.appendChild(el('td', 'muted', [(d.special ? 'Special' : ''), (d.qualified || '')].filter(Boolean).join(' · ') || '—'));
    const tags = el('td'); if (d.reinvested) tags.appendChild(badge('↻ Reinvested', 'type')); tr.appendChild(tags);
    tb.appendChild(tr);
  });
  pt.appendChild(tb); prevWrap.appendChild(pt);
  card.appendChild(el('h3', 'strip-title', 'Dividends that will import (' + importable.length + ')'));
  card.appendChild(el('div', 'muted', 'These go into your Dividends income. Preview of the first ' + Math.min(12, importable.length) + ':'));
  card.appendChild(prevWrap);
  const skippedN = st.divs.length - importable.length;
  card.appendChild(el('p', 'muted', importable.length + ' will import as Dividends income · ' + skippedN + ' merged/skipped as duplicates' + (intGo.length ? ' · ' + intGo.length + ' interest payments as Interest income' : '') + (st.includeFees ? ' · ' + st.fees.length + ' fees as expenses' : '') + '. Reinvested payouts are tagged; the purchases themselves are never imported.'));

  const actions = el('div', 'io-actions');
  const impTotal = importable.length + intGo.length;
  const impBtn = el('button', 'btn-primary', 'Import ' + impTotal + ' entr' + (impTotal === 1 ? 'y' : 'ies'));
  impBtn.disabled = !impTotal && !(st.includeFees && st.fees.length);
  impBtn.addEventListener('click', async () => {
    const me = s.persons[0] && s.persons[0].id;
    const batch = { id: 'batch_' + Math.random().toString(36).slice(2, 9), importedAt: new Date().toISOString(), target: 'income', source: st.filename + ' (dividends · ' + st.broker + ')', count: importable.length + intGo.length + (st.includeFees ? st.fees.length : 0) };
    const byYear = {}, feeByYear = {};
    importable.forEach(d => {
      const yr = +d.date.slice(0, 4);
      (byYear[yr] = byYear[yr] || []).push({
        date: d.date, gross: d.amount, net: d.amount, categoryId: divCat.id, subId: '',
        accountId: st.accountId || '', personId: me, status: 'received', taxable: 'yes',
        symbol: d.symbol || '', action: d.action || d.qualified || '', reinvested: !!d.reinvested,
        receivedVia: st.broker, notes: ''
      });
    });
    intGo.forEach(t => {
      const yr = +t.date.slice(0, 4);
      (byYear[yr] = byYear[yr] || []).push({
        date: t.date, gross: t.amount, net: t.amount, categoryId: intCat.id, subId: '',
        accountId: st.intAccountId || '', personId: me, status: 'received', taxable: 'yes',
        receivedVia: st.broker, notes: (t.desc || '').slice(0, 120)
      });
    });
    // Default investment fees into the Investment Fees subcategory when the
    // chosen fee category offers one (e.g. Other → Investment Fees).
    const feeCatObj = s.expenseCategories.find(c => c.id === st.feeCat);
    const feeSubId = feeCatObj ? (((feeCatObj.subs || []).find(su => /investment fees?/i.test(su.name)) || {}).id || '') : '';
    if (st.includeFees && st.feeCat) st.fees.forEach(f => {
      const yr = +f.date.slice(0, 4);
      (feeByYear[yr] = feeByYear[yr] || []).push({ date: f.date, amount: f.amount, categoryId: st.feeCat, subId: feeSubId, accountId: st.accountId || '', personId: me, notes: ((f.symbol ? f.symbol + ' — ' : '') + f.desc).trim() });
    });
    const years = [...new Set(Object.keys(byYear).concat(Object.keys(feeByYear)))];
    await Promise.all(years.map(y => store.loadYear(y)));
    Object.keys(byYear).forEach(y => store.importEntries(+y, 'income', byYear[y], batch));
    Object.keys(feeByYear).forEach(y => store.importEntries(+y, 'expenses', feeByYear[y], batch));
    toast('Imported ' + importable.length + ' dividends' + (intGo.length ? ' + ' + intGo.length + ' interest' : '') + (st.includeFees && st.fees.length ? ' + ' + st.fees.length + ' fees' : ''));
    divImportState = null;
    importState = { target: 'dividends', rows: null, headers: null, mapping: {}, fallbackCat: '', filename: '' };
    renderView(currentRoute);
  });
  actions.appendChild(impBtn);
  const cancel = el('button', 'btn-ghost', 'Cancel');
  cancel.addEventListener('click', () => { divImportState = null; importState = { target: 'dividends', rows: null, headers: null, mapping: {}, fallbackCat: '', filename: '' }; renderView(currentRoute); });
  actions.appendChild(cancel);
  card.appendChild(actions);
  return card;
}

// ============================================================
// Selling — Poshmark sales report import + sales table
// Get the file: Poshmark → your avatar → My Sales → My Sales Report
// (poshmark.com/activity_report/sales) → have the report emailed.
// The export has ~12 preamble lines before the header and a Totals
// footer; only completed sales appear in it.
// ============================================================
const SALES_COL_LABELS = { platform: 'Platform', listingDate: 'Listed', orderDate: 'Order date', sku: 'SKU', orderId: 'Order Id', title: 'Listing title', department: 'Department', category: 'Category', subcategory: 'Subcategory', brand: 'Brand', color: 'Color', size: 'Size', bundle: 'Bundle?', offer: 'Offer?', nwt: 'NWT', costPrice: 'Cost', orderPrice: 'Order price', shipDiscount: 'Ship discount', upgradeFee: 'Upgrade fee', packagingFee: 'Packaging fee', earnings: 'Your earnings', profit: 'Profit', buyerState: 'Buyer state', buyerZip: 'Buyer ZIP', buyer: 'Buyer', salesTax: 'Sales tax (buyer)', notes: 'Notes', otherInfo: 'Other info' };
const SALES_ALL_COLS = ['platform', 'listingDate', 'orderDate', 'sku', 'orderId', 'title', 'department', 'category', 'subcategory', 'brand', 'color', 'size', 'bundle', 'offer', 'nwt', 'costPrice', 'orderPrice', 'shipDiscount', 'upgradeFee', 'packagingFee', 'earnings', 'profit', 'buyerState', 'buyerZip', 'buyer', 'salesTax', 'notes', 'otherInfo'];
const SALES_DEFAULT_COLS = ['orderDate', 'title', 'brand', 'size', 'costPrice', 'orderPrice', 'earnings', 'profit', 'buyer'];
const POSHMARK_HEADER = 'Listing Date,Order Date,SKU,Order Id,Listing Title,Department,Category,Subcategory,Brand,Color,Size,Bundle Order?,Offer Order,NWT,Cost Price,Order Price,Lowest Set Price,Seller Shipping Discount,Upgraded Shipping Label Fee,Packaging Fee,Your Earnings,Buyer State,Buyer Zip Code,Buyer Username,Sales Tax (Paid by Buyer),Notes,Other Info';
const POSHMARK_TEMPLATE_CSV = 'Poshmark Sales Report,"","","",""\n01/01/2026 - 12/31/2026\n""\n'
  + POSHMARK_HEADER + '\n'
  + '01/05/2025,02/10/2026,SKU1,orderid0001,Vintage Denim Jacket,Men,Jackets & Coats,"",ExampleBrand,Blue,L,N,Y,N,$8.00,$30.00,$0.00,$0.00,$0.00,$0.00,$24.00,AZ,85001,buyer123,$2.10,$0.00,""\n'
  + '03/12/2025,03/01/2026,"",orderid0002,Board Game Sealed,Home,Games,"",ExampleBrand,"Red,White",OS,N,N,Y,"",$18.00,$0.00,$0.00,$0.00,$0.00,$14.40,CA,90001,buyer456,$1.50,$0.00,""\n'
  + 'Totals,"","","","","","","","","","","","","","",$48.00,$0.00,"","","",$38.40\n';
function saleProfit(x) { return (x.earnings != null && x.costPrice != null) ? (Number(x.earnings) || 0) - (Number(x.costPrice) || 0) : null; }
function saleKey(x) { return (x.orderId || '') + '|' + (x.title || '') + '|' + (Number(x.orderPrice) || 0).toFixed(2); }
function existingSaleKeys(store) {
  const keys = new Set();
  Object.keys(store.state.years).forEach(yk => (((store.state.years[yk] || {}).sales) || []).forEach(x => keys.add(saleKey(x))));
  return keys;
}
// rows = raw array-rows (header:false) since the export has a preamble.
function analyzeSalesFile(store, rows, filename) {
  const hi = rows.findIndex(r => Array.isArray(r) && String(r[0]).trim() === 'Listing Date' && r.some(x => String(x).trim() === 'Order Id'));
  if (hi < 0) return null;
  const H = rows[hi].map(x => String(x || '').trim());
  const idx = name => H.indexOf(name);
  const I = { listingDate: idx('Listing Date'), orderDate: idx('Order Date'), sku: idx('SKU'), orderId: idx('Order Id'), title: idx('Listing Title'), department: idx('Department'), category: idx('Category'), subcategory: idx('Subcategory'), brand: idx('Brand'), color: idx('Color'), size: idx('Size'), bundle: idx('Bundle Order?'), offer: idx('Offer Order'), nwt: idx('NWT'), costPrice: idx('Cost Price'), orderPrice: idx('Order Price'), shipDiscount: idx('Seller Shipping Discount'), upgradeFee: idx('Upgraded Shipping Label Fee'), packagingFee: idx('Packaging Fee'), earnings: idx('Your Earnings') >= 0 ? idx('Your Earnings') : idx('Net Earnings'), buyerState: idx('Buyer State'), buyerZip: idx('Buyer Zip Code'), buyer: idx('Buyer Username'), salesTax: idx('Sales Tax (Paid by Buyer)'), notes: idx('Notes'), otherInfo: idx('Other Info') };
  const existing = existingSaleKeys(store);
  const sales = []; let dupes = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]; if (!Array.isArray(r)) continue;
    if (String(r[0]).trim() === 'Totals') break;
    const c = j => (j >= 0 && r[j] != null) ? String(r[j]).trim() : '';
    if (!c(I.orderId)) continue;
    const num = j => { const n = parseImportAmount(c(j)); return isNaN(n) ? null : n; };
    const sale = {
      platform: 'Poshmark',
      listingDate: parseImportDate(c(I.listingDate)), orderDate: parseImportDate(c(I.orderDate)),
      sku: c(I.sku), orderId: c(I.orderId), title: c(I.title),
      department: c(I.department), category: c(I.category), subcategory: c(I.subcategory),
      brand: c(I.brand), color: c(I.color), size: c(I.size),
      bundle: /^y/i.test(c(I.bundle)), offer: /^y/i.test(c(I.offer)), nwt: /^y/i.test(c(I.nwt)),
      costPrice: num(I.costPrice), orderPrice: num(I.orderPrice),
      shipDiscount: num(I.shipDiscount), upgradeFee: num(I.upgradeFee), packagingFee: num(I.packagingFee),
      earnings: num(I.earnings),
      buyerState: c(I.buyerState), buyerZip: c(I.buyerZip), buyer: c(I.buyer),
      salesTax: num(I.salesTax), notes: c(I.notes), otherInfo: c(I.otherInfo)
    };
    if (!sale.orderDate) continue;
    const k = saleKey(sale);
    if (existing.has(k)) { dupes++; continue; }
    existing.add(k);
    sales.push(sale);
  }
  return { filename, sales, dupes };
}
function salesReviewCard(store) {
  const st = salesImportState;
  ensureYearsScanned(store);
  const card = el('div', 'card');
  card.appendChild(el('h3', 'strip-title', 'Import Poshmark sales'));
  const orderTotal = st.sales.reduce((a, x) => a + (Number(x.orderPrice) || 0), 0);
  const earnTotal = st.sales.reduce((a, x) => a + salesEarn(x), 0);
  card.appendChild(el('p', 'muted', '“' + st.filename + '” · ' + st.sales.length + ' completed sale' + (st.sales.length === 1 ? '' : 's') + ' to import · ' + st.dupes + ' duplicate' + (st.dupes === 1 ? '' : 's') + ' skipped (already imported) · order total ' + money(orderTotal) + ' · your earnings ' + money(earnTotal) + '. Earnings roll into your Selling income automatically.'));
  const prevWrap = el('div', 'table-scroll'); const pt = el('table', 'data-table');
  pt.innerHTML = '<thead><tr><th>Order date</th><th>Title</th><th>Brand</th><th class="num">Order price</th><th class="num">Your earnings</th></tr></thead>';
  const tb = el('tbody');
  st.sales.slice(0, 10).forEach(x => {
    const tr = el('tr');
    tr.appendChild(el('td', null, fmtDate(x.orderDate)));
    tr.appendChild(el('td', null, (x.title || '—').slice(0, 48)));
    tr.appendChild(el('td', 'muted', x.brand || '—'));
    tr.appendChild(numCell(Number(x.orderPrice) || 0));
    tr.appendChild(numCell(salesEarn(x), true));
    tb.appendChild(tr);
  });
  pt.appendChild(tb); prevWrap.appendChild(pt);
  card.appendChild(el('div', 'muted', 'Preview (first ' + Math.min(10, st.sales.length) + ' of ' + st.sales.length + '):'));
  card.appendChild(prevWrap);
  const actions = el('div', 'io-actions');
  const impBtn = el('button', 'btn-primary', 'Import ' + st.sales.length + ' sale' + (st.sales.length === 1 ? '' : 's'));
  impBtn.disabled = !st.sales.length;
  impBtn.addEventListener('click', async () => {
    const batch = { id: 'batch_' + Math.random().toString(36).slice(2, 9), importedAt: new Date().toISOString(), target: 'sales', source: st.filename + ' (Poshmark)', count: st.sales.length };
    const byYear = {};
    st.sales.forEach(x => { const yr = +x.orderDate.slice(0, 4); (byYear[yr] = byYear[yr] || []).push(x); });
    const years = Object.keys(byYear);
    await Promise.all(years.map(y => store.loadYear(y)));
    years.forEach(y => store.importEntries(+y, 'sales', byYear[y], batch));
    toast('Imported ' + st.sales.length + ' sales');
    salesImportState = null;
    importState = { target: 'selling', rows: null, headers: null, mapping: {}, fallbackCat: '', filename: '' };
    location.hash = '#selling';
  });
  actions.appendChild(impBtn);
  const cancel = el('button', 'btn-ghost', 'Cancel');
  cancel.addEventListener('click', () => { salesImportState = null; importState = { target: 'selling', rows: null, headers: null, mapping: {}, fallbackCat: '', filename: '' }; renderView(currentRoute); });
  actions.appendChild(cancel);
  card.appendChild(actions);
  return card;
}
function buildSalesCol(store, key) {
  const txt = (get, cls) => ({ label: SALES_COL_LABELS[key], key, value: r => get(r) || '', cell: r => el('td', cls || null, get(r) || '—') });
  const moneyCol = (get, strong) => ({ label: SALES_COL_LABELS[key], key, num: true, value: r => Number(get(r)) || 0, cell: r => { const v = get(r); const td = el('td', 'num'); td.textContent = v == null ? '—' : money(Number(v) || 0); if (strong) td.classList.add('strong'); return td; } });
  const flag = get => ({ label: SALES_COL_LABELS[key], key, value: r => get(r) ? 1 : 0, cell: r => el('td', 'muted', get(r) ? 'Yes' : '—') });
  switch (key) {
    case 'platform': return txt(r => r.platform);
    case 'listingDate': return { label: 'Listed', key, value: r => r.listingDate || '', cell: r => el('td', 'muted', r.listingDate ? fmtDate(r.listingDate) : '—') };
    case 'orderDate': return { label: 'Order date', key, value: r => r.orderDate || '', cell: r => el('td', null, fmtDate(r.orderDate)) };
    case 'sku': return txt(r => r.sku, 'muted');
    case 'orderId': return txt(r => r.orderId, 'muted');
    case 'title': return { label: 'Listing title', key, value: r => r.title || '', cell: r => { const td = el('td'); td.appendChild(el('div', 'acct-name', r.title || '—')); return td; } };
    case 'department': return txt(r => r.department);
    case 'category': return txt(r => r.category);
    case 'subcategory': return txt(r => r.subcategory);
    case 'brand': return txt(r => r.brand);
    case 'color': return txt(r => r.color, 'muted');
    case 'size': return txt(r => r.size);
    case 'bundle': return flag(r => r.bundle);
    case 'offer': return flag(r => r.offer);
    case 'nwt': return flag(r => r.nwt);
    case 'costPrice': return moneyCol(r => r.costPrice);
    case 'orderPrice': return moneyCol(r => r.orderPrice);
    case 'shipDiscount': return moneyCol(r => r.shipDiscount);
    case 'upgradeFee': return moneyCol(r => r.upgradeFee);
    case 'packagingFee': return moneyCol(r => r.packagingFee);
    case 'earnings': return moneyCol(r => r.earnings, true);
    case 'profit': return { label: 'Profit', key, num: true, value: r => saleProfit(r) == null ? -1e9 : saleProfit(r), cell: r => { const p = saleProfit(r); const td = el('td', 'num'); if (p == null) { td.textContent = '—'; td.title = 'Needs a cost price'; return td; } const span = el('span', p >= 0 ? 'pos' : 'neg', (p >= 0 ? '+' : '−') + money(Math.abs(p))); td.appendChild(span); return td; } };
    case 'buyerState': return txt(r => r.buyerState, 'muted');
    case 'buyerZip': return txt(r => r.buyerZip, 'muted');
    case 'buyer': return txt(r => r.buyer, 'muted');
    case 'salesTax': return moneyCol(r => r.salesTax);
    case 'notes': return txt(r => r.notes, 'muted');
    case 'otherInfo': return txt(r => r.otherInfo, 'muted');
  }
  return null;
}
function exportSalesCSV(store) {
  const cols = SALES_ALL_COLS.filter(k => k !== 'profit');
  const rows = [cols.map(k => SALES_COL_LABELS[k]).join(',')];
  Object.keys(store.state.years).sort().forEach(yk => (((store.state.years[yk] || {}).sales) || []).forEach(x => {
    rows.push(cols.map(k => csvEsc(typeof x[k] === 'boolean' ? (x[k] ? 'Y' : 'N') : x[k])).join(','));
  }));
  downloadFile('clover-sales.csv', rows.join('\n'), 'text/csv');
}
function saleModal(existing) {
  const store = window.cloverStore;
  const r = Object.assign({}, existing);
  const oldYear = +String(r.orderDate || '').slice(0, 4);
  const body = el('div', 'form-grid');
  const fDate = input(r.orderDate || todayISO(), { type: 'date' });
  const fTitle = input(r.title || '', { placeholder: 'Listing title' });
  const fBrand = input(r.brand || '', { placeholder: 'Brand' });
  const fSize = input(r.size || '', { placeholder: 'Size' });
  const fOrder = moneyInput(r.orderPrice);
  const fEarn = moneyInput(r.earnings);
  const fCost = moneyInput(r.costPrice);
  const fNotes = document.createElement('textarea'); fNotes.value = r.notes || ''; fNotes.rows = 2; fNotes.placeholder = 'Optional';
  body.appendChild(field('Order date', fDate, 'When the sale happened.'));
  body.appendChild(field('Listing title', fTitle));
  const tr1 = el('div', 'two-col'); tr1.appendChild(field('Brand', fBrand)); tr1.appendChild(field('Size', fSize)); body.appendChild(tr1);
  const tr2 = el('div', 'cd-fields');
  tr2.appendChild(field('Order price', fOrder, 'What the buyer paid for the item.'));
  tr2.appendChild(field('Your earnings', fEarn, 'What you actually received after fees — this is what rolls into Selling income.'));
  tr2.appendChild(field('Cost price', fCost, 'What the item cost you — enables the Profit column.'));
  body.appendChild(tr2);
  body.appendChild(field('Notes', fNotes));
  openModal({
    title: 'Edit sale', body: withHistoryTab(body, r), confirmLabel: 'Save',
    onConfirm: () => {
      Object.assign(r, {
        orderDate: fDate.value || todayISO(), title: fTitle.value.trim(), brand: fBrand.value.trim(), size: fSize.value.trim(),
        orderPrice: fOrder.value === '' ? null : parseFloat(fOrder.value),
        earnings: fEarn.value === '' ? null : parseFloat(fEarn.value),
        costPrice: fCost.value === '' ? null : parseFloat(fCost.value),
        notes: fNotes.value.trim()
      });
      const newYear = +r.orderDate.slice(0, 4);
      if (oldYear && newYear !== oldYear) store.removeSale(oldYear, r.id);
      const doSave = () => store.saveSale(newYear, r);
      if (store.isYearLoaded(newYear)) doSave(); else store.loadYear(newYear).then(doSave);
      toast('Sale updated');
    }
  });
}
function renderSelling(view) {
  const store = window.cloverStore;
  if (!store.isYearLoaded(activeYear)) { view.appendChild(loadingPanel()); store.loadYear(activeYear); return; }
  const data = store.yearData(activeYear);
  const sales = data.sales || [];

  const head = el('div', 'view-head');
  const left = el('div'); left.appendChild(el('h3', null, 'Selling · ' + activeYear));
  left.appendChild(el('p', 'muted', sales.length + ' sale' + (sales.length === 1 ? '' : 's') + ' — earnings roll into Selling income automatically.'));
  head.appendChild(left);
  const actions = el('div', 'head-actions');
  const tmpl = el('button', 'btn-ghost', '⬇ Template');
  tmpl.title = 'Download a sample of the Poshmark sales-report format';
  tmpl.addEventListener('click', () => downloadFile('poshmark-sales-template.csv', POSHMARK_TEMPLATE_CSV, 'text/csv'));
  actions.appendChild(tmpl);
  if (sales.length) { const exp = el('button', 'btn-ghost', '⬇ Export CSV'); exp.addEventListener('click', () => exportSalesCSV(store)); actions.appendChild(exp); }
  const imp = el('button', 'btn-primary', '⬆ Import sales');
  imp.title = 'Import a Poshmark “My Sales Report” CSV (avatar → My Sales → My Sales Report)';
  imp.addEventListener('click', () => startImport('selling'));
  actions.appendChild(imp);
  head.appendChild(actions);
  view.appendChild(head);
  const yt = yearTabs(store, 'selling'); if (yt) view.appendChild(yt);

  if (!sales.length) {
    view.appendChild(emptyState('No sales yet for ' + activeYear, 'Import your Poshmark sales report: on Poshmark, click your avatar → My Sales → My Sales Report, and have the report emailed to you. Then import the CSV here.', '⬆ Import sales', () => startImport('selling')));
    return;
  }

  const orderTotal = sales.reduce((a, x) => a + (Number(x.orderPrice) || 0), 0);
  const earnTotal = sales.reduce((a, x) => a + salesEarn(x), 0);
  const withCost = sales.filter(x => x.costPrice != null);
  const costTotal = withCost.reduce((a, x) => a + (Number(x.costPrice) || 0), 0);
  const sum = el('div', 'sub-summary');
  sum.appendChild(sumCard('Items sold', String(sales.length), 'neutral'));
  sum.appendChild(sumCard('Order total', money(orderTotal), 'neutral'));
  sum.appendChild(sumCard('Your earnings', money(earnTotal), 'income'));
  sum.appendChild(sumCard('Cost basis', money(costTotal), 'expense', withCost.length < sales.length ? withCost.length + ' of ' + sales.length + ' have a cost price' : ''));
  sum.appendChild(sumCard('Est. profit', money(earnTotal - costTotal), (earnTotal - costTotal) < 0 ? 'expense' : 'income', 'earnings − cost basis'));
  view.appendChild(sum);

  const cols = [
    ...tableColKeys(store, 'sales', SALES_COL_LABELS, SALES_DEFAULT_COLS).map(k => buildSalesCol(store, k)).filter(Boolean),
    { label: '', sortable: false, cell: r => {
        const td = el('td', 'row-actions');
        const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => saleModal(r));
        const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove((r.title || 'sale') + ' · ' + fmtDate(r.orderDate), () => store.removeSale(activeYear, r.id)));
        td.appendChild(edit); td.appendChild(del); return td; } }
  ];
  view.appendChild(tableTools(columnsButton('sales', SALES_ALL_COLS, SALES_DEFAULT_COLS, SALES_COL_LABELS, 'Selling columns')));
  const card = el('div', 'card table-card');
  card.appendChild(sortableTable(cols, sales, salesSort, ns => { salesSort = ns || { key: 'orderDate', dir: 'desc' }; renderView(currentRoute); }, null));
  view.appendChild(card);
}

function importSection() {
  const store = window.cloverStore;
  if (importState.target === 'dividends' && divImportState) return dividendReviewCard(store);
  if (importState.target === 'selling' && salesImportState) return salesReviewCard(store);
  const card = el('div', 'card');
  card.appendChild(el('h3', 'strip-title', 'Import from CSV'));

  if (!importState.rows) {
    card.appendChild(el('p', 'muted', importState.target === 'dividends'
      ? 'Upload your broker’s activity export (M1 Finance, Schwab, or Ameriprise). For Ameriprise: ameriprise.com → Portfolio → Activity → All transactions, set the date range, download the CSV. Clover keeps the dividends and money-market interest — purchases are ignored (but used to tag reinvestment), duplicates are caught for review, and fees can come along as investment-fee expenses.'
      : importState.target === 'selling'
      ? 'Upload your Poshmark “My Sales Report” CSV (on Poshmark: your avatar → My Sales → My Sales Report → email the report to yourself). Duplicates are skipped automatically and earnings roll into your Selling income.'
      : 'Upload a CSV of transactions and map its columns to Clover fields. Rows import into the selected year (' + activeYear + ').'));
    const row = el('div', 'io-actions');
    const tSel = select([{ value: 'income', label: 'Income' }, { value: 'expenses', label: 'Expenses' }, { value: 'paychecks', label: 'Paychecks' }, { value: 'subscriptions', label: 'Bills & Subscriptions' }, { value: 'settlements', label: 'Class Action Settlements' }, { value: 'dividends', label: 'Dividends (broker activity)' }, { value: 'selling', label: 'Poshmark sales' }], importState.target);
    tSel.addEventListener('change', () => { importState.target = tSel.value; renderView(currentRoute); });
    row.appendChild(labelWrap('Import as', tSel));
    const fileLabel = el('label', 'btn-primary file-btn'); fileLabel.textContent = 'Choose CSV…';
    const fileIn = document.createElement('input'); fileIn.type = 'file'; fileIn.accept = '.csv,text/csv'; fileIn.style.display = 'none';
    fileIn.addEventListener('change', async () => {
      const file = fileIn.files && fileIn.files[0]; if (!file) return;
      let Papa; try { Papa = await ensurePapa(); } catch (e) { toast('CSV parser couldn’t load', 'warn'); return; }
      const isSalesFile = importState.target === 'selling';
      Papa.parse(file, {
        header: !isSalesFile, skipEmptyLines: true,
        complete: (res) => {
          if (isSalesFile) {
            const analyzed = analyzeSalesFile(store, res.data, file.name);
            if (!analyzed) { toast('Couldn’t find the Poshmark sales header in that file — use the exact “My Sales Report” export', 'warn'); return; }
            if (!analyzed.sales.length && !analyzed.dupes) { toast('No completed sales found in that file', 'warn'); return; }
            salesImportState = analyzed;
            renderView(currentRoute);
            return;
          }
          const headers = (res.meta && res.meta.fields) || [];
          if (!headers.length || !res.data.length) { toast('No rows found in that CSV', 'warn'); return; }
          if (importState.target === 'dividends') {
            const analyzed = analyzeDividendFile(store, res.data, headers, file.name);
            if (analyzed) {
              if (!analyzed.divs.length && !analyzed.interest.length) { toast('No dividend rows found in that file', 'warn'); return; }
              divImportState = analyzed;
              renderView(currentRoute);
              return;
            }
            // Preamble-style exports (Ameriprise) hide the real header a few
            // rows down — retry with a raw parse that locates it.
            Papa.parse(file, {
              header: false, skipEmptyLines: true,
              complete: res2 => {
                const a2 = analyzeDividendFileRaw(store, res2.data, file.name);
                if (!a2) { toast('Couldn’t recognize this broker file — expected an M1 Finance, Schwab, or Ameriprise activity export', 'warn'); return; }
                if (!a2.divs.length && !a2.interest.length) { toast('No dividend or interest rows found in that file', 'warn'); return; }
                divImportState = a2;
                renderView(currentRoute);
              },
              error: () => toast('Couldn’t read that CSV', 'warn')
            });
            return;
          }
          const mapping = {}; IMPORT_FIELDS[importState.target].forEach(f => { mapping[f.key] = guessColumn(headers, f.kw); });
          importState = Object.assign(importState, { rows: res.data, headers, mapping, filename: file.name });
          renderView(currentRoute);
        },
        error: () => toast('Couldn’t read that CSV', 'warn')
      });
    });
    fileLabel.appendChild(fileIn); row.appendChild(fileLabel);
    card.appendChild(row);
    if (importState.target === 'dividends') {
      const tRow = el('div', 'io-actions');
      tRow.appendChild(el('span', 'muted', 'Not sure of the format? Download a sample:'));
      const m1T = el('button', 'btn-ghost', '⬇ M1 Finance template');
      m1T.addEventListener('click', () => downloadFile('m1-activity-template.csv', M1_TEMPLATE_CSV, 'text/csv'));
      tRow.appendChild(m1T);
      const schT = el('button', 'btn-ghost', '⬇ Schwab template');
      schT.addEventListener('click', () => downloadFile('schwab-transactions-template.csv', SCHWAB_TEMPLATE_CSV, 'text/csv'));
      tRow.appendChild(schT);
      const ampT = el('button', 'btn-ghost', '⬇ Ameriprise template');
      ampT.addEventListener('click', () => downloadFile('ameriprise-activity-template.csv', AMERIPRISE_TEMPLATE_CSV, 'text/csv'));
      tRow.appendChild(ampT);
      card.appendChild(tRow);
    }
    if (importState.target === 'selling') {
      const tRow = el('div', 'io-actions');
      tRow.appendChild(el('span', 'muted', 'Not sure of the format? Download a sample:'));
      const pmT = el('button', 'btn-ghost', '⬇ Poshmark template');
      pmT.addEventListener('click', () => downloadFile('poshmark-sales-template.csv', POSHMARK_TEMPLATE_CSV, 'text/csv'));
      tRow.appendChild(pmT);
      card.appendChild(tRow);
    }
    // Every import target has a downloadable sample — never guess a format.
    const GEN_TEMPLATES = {
      income: ['clover-income-template.csv', INCOME_TEMPLATE_CSV],
      expenses: ['clover-expenses-template.csv', EXPENSES_TEMPLATE_CSV],
      paychecks: ['clover-paychecks-template.csv', PAYCHECKS_TEMPLATE_CSV],
      subscriptions: ['clover-bills-template.csv', SUBS_TEMPLATE_CSV],
      settlements: ['clover-class-action-template.csv', SETTLEMENTS_TEMPLATE_CSV]
    };
    if (GEN_TEMPLATES[importState.target]) {
      const tRow = el('div', 'io-actions');
      tRow.appendChild(el('span', 'muted', 'Not sure of the format? Download a sample:'));
      const gt = el('button', 'btn-ghost', '⬇ Template');
      gt.addEventListener('click', () => downloadFile(GEN_TEMPLATES[importState.target][0], GEN_TEMPLATES[importState.target][1], 'text/csv'));
      tRow.appendChild(gt);
      card.appendChild(tRow);
    }
    return card;
  }

  // mapping + preview
  card.appendChild(el('p', 'muted', importState.rows.length + ' rows from “' + importState.filename + '” · importing as ' + importState.target + ' into ' + activeYear));
  const opts = [{ value: '', label: '— not mapped —' }].concat(importState.headers.map(h => ({ value: h, label: h })));
  const mapGrid = el('div', 'map-grid');
  IMPORT_FIELDS[importState.target].forEach(f => {
    const sel = select(opts, importState.mapping[f.key] || '');
    sel.addEventListener('change', () => { importState.mapping[f.key] = sel.value; renderView(currentRoute); });
    mapGrid.appendChild(field(f.label + (f.req ? ' *' : ''), sel));
  });
  card.appendChild(mapGrid);

  // fallback category (settlements have no category, so skip it there)
  const kind = (importState.target === 'expenses' || importState.target === 'subscriptions') ? 'expense' : 'income';
  if (importState.target !== 'settlements') {
    const cats = kind === 'expense' ? store.state.expenseCategories : store.state.incomeCategories;
    const fbSel = select([{ value: '', label: '— none —' }].concat(cats.map(c => ({ value: c.id, label: c.name }))), importState.fallbackCat);
    fbSel.addEventListener('change', () => { importState.fallbackCat = fbSel.value; renderView(currentRoute); });
    card.appendChild(field(importState.target === 'paychecks' ? 'Income category for these paychecks' : 'Category for unmatched rows', fbSel, 'Rows whose category text doesn’t match one of your categories go here.'));
  }

  const { entries, dupes, skipped } = buildImportEntries(store);
  // preview — show every column the user mapped (plus the resolved category),
  // so they can sanity-check the whole row instead of just date/amount.
  const isSub = importState.target === 'subscriptions';
  const fields = IMPORT_FIELDS[importState.target];
  const prevCols = fields.filter(f => importState.mapping[f.key] || f.req);
  const catField = fields.find(f => f.key === 'category');
  if (!isSub && importState.target !== 'paychecks' && catField && prevCols.indexOf(catField) < 0) prevCols.push(catField);
  const prevWrap = el('div', 'table-scroll'); const pt = el('table', 'data-table');
  const thead = el('thead'); const htr = el('tr');
  prevCols.forEach(f => htr.appendChild(el('th', f.num ? 'num' : null, f.label)));
  thead.appendChild(htr); pt.appendChild(thead);
  const ptb = el('tbody');
  const previewN = Math.min(8, entries.length);
  entries.slice(0, previewN).forEach(e => {
    const tr = el('tr');
    prevCols.forEach(f => {
      if (f.num) tr.appendChild(numCell(Number(e[f.key]) || 0, f.key !== 'net'));
      else tr.appendChild(el('td', null, importPreviewText(f.key, e, store, kind)));
    });
    ptb.appendChild(tr);
  });
  pt.appendChild(ptb); prevWrap.appendChild(pt);
  card.appendChild(el('div', 'muted', 'Preview (first ' + previewN + ' of ' + entries.length + ' new rows):')); card.appendChild(prevWrap);

  const summary = el('p', 'muted', entries.length + ' will import · ' + dupes + ' duplicates skipped' + (skipped ? ' · ' + skipped + ' rows had no date/amount' : ''));
  card.appendChild(summary);

  const actions = el('div', 'io-actions');
  const impBtn = el('button', 'btn-primary', 'Import ' + entries.length + ' rows');
  impBtn.disabled = !entries.length;
  impBtn.addEventListener('click', async () => {
    const target = importState.target;
    const missingReq = IMPORT_FIELDS[target].filter(f => f.req && !importState.mapping[f.key]);
    if (missingReq.length) { toast('Map the required fields: ' + missingReq.map(f => f.label).join(', '), 'warn'); return; }
    const batch = { id: 'batch_' + Math.random().toString(36).slice(2, 9), importedAt: new Date().toISOString(), target, source: importState.filename, count: entries.length };
    importState = { target, rows: null, headers: null, mapping: {}, fallbackCat: '', filename: '' };
    if (target === 'subscriptions' || target === 'settlements') {
      store.importEntries(activeYear, target, entries, batch);
    } else {
      // Route each row to the year of its date so a multi-year CSV imports correctly.
      const byYear = {};
      entries.forEach(e => { const m = /^(\d{4})/.exec(e.date || e.payDate || ''); const yr = m ? +m[1] : activeYear; (byYear[yr] = byYear[yr] || []).push(e); });
      const years = Object.keys(byYear);
      await Promise.all(years.map(y => store.loadYear(y)));
      years.forEach(y => store.importEntries(+y, target, byYear[y], batch));
    }
    toast('Imported ' + entries.length + ' rows');
    renderView(currentRoute);
  });
  actions.appendChild(impBtn);
  const cancel = el('button', 'btn-ghost', 'Cancel');
  cancel.addEventListener('click', () => { importState = { target: importState.target, rows: null, headers: null, mapping: {}, fallbackCat: '', filename: '' }; renderView(currentRoute); });
  actions.appendChild(cancel);
  card.appendChild(actions);
  return card;
}

function importHistoryCard() {
  const store = window.cloverStore;
  if (!store.isYearLoaded(activeYear)) return null;
  const batches = (store.yearData(activeYear).importBatches || []).slice().reverse();
  if (!batches.length) return null;
  const card = el('div', 'card');
  card.appendChild(el('h3', 'strip-title', 'Import history · ' + activeYear));
  const list = el('div', 'mini-list');
  batches.forEach(b => {
    const row = el('div', 'mini-row');
    row.appendChild(el('span', null, fmtDate((b.importedAt || '').slice(0, 10)) + ' · ' + b.count + ' ' + b.target + (b.source ? ' · ' + b.source : '')));
    const undo = el('button', 'icon-btn danger', 'Undo');
    undo.addEventListener('click', () => confirmRemove('this import of ' + b.count + ' ' + b.target + ' rows', () => store.undoImportBatch(activeYear, b.id)));
    row.appendChild(undo);
    list.appendChild(row);
  });
  card.appendChild(list);
  return card;
}
