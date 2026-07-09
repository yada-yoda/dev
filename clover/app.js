// ============================================================
// Clover — app shell & routing
// Auth gate, sidebar nav, hash routing, period selectors, and
// (Phase 1) the Settings + Accounts feature views. Remaining
// sections render navigable placeholders until their phase.
// ============================================================

const VERSION = '1.0.67';

// Owner allowlist (client-side convenience gate). The REAL security
// boundary is firestore.rules — this only improves UX by showing a
// friendly "not authorized" screen instead of silent permission errors.
// Leave empty during first-run setup; the app shows your account ID so
// you can lock both this and firestore.rules to it.
const OWNER_UIDS = ['I8IKdH8q6XW34vIc4ZkwNj2roVu1'];

const ROUTES = [
  { id: 'dashboard',     label: 'Dashboard',      ico: '◆', phase: 6 },
  { id: 'income',        label: 'Income',         ico: '▲', phase: 2 },
  { id: 'paychecks',     label: 'Paychecks',      ico: '▤', phase: 4 },
  { id: 'raises',        label: 'Raises',         ico: '↗', phase: 9 },
  { id: 'selling',       label: 'Selling',        ico: '▧', phase: 9 },
  { id: 'expenses',      label: 'Expenses',       ico: '▼', phase: 3 },
  { id: 'subscriptions', label: 'Bills & Subscriptions', ico: '↻', phase: 3 },
  { id: 'accounts',      label: 'Accounts',       ico: '▦', phase: 1 },
  { sep: true },
  { id: 'credit',        label: 'Credit & Rates', ico: '％', phase: 5 },
  { id: 'taxes',         label: 'Taxes',          ico: '§', phase: 9 },
  { id: 'reports',       label: 'Reports',        ico: '▥', phase: 7 },
  { id: 'calendar',      label: 'Calendar',       ico: '▣', phase: 7 },
  { sep: true },
  { id: 'import',        label: 'Import / Export', ico: '⇅', phase: 8 },
  { id: 'settings',      label: 'Settings',       ico: '⚙', phase: 1 }
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
let subsSort = { key: 'monthly', dir: 'desc' };
let subsCatFilter = 'all';
let subsStatusFilter = 'active';   // 'active' | 'all'
let subPriceSel = null;            // which bill's price history the chart shows
let subsBadgeFilter = null;        // { key, value } from clicking a subs value badge
let taxesSort = { key: 'taxYear', dir: 'desc' };
let salesSort = { key: 'orderDate', dir: 'desc' };
let salesImportState = null;   // parsed Poshmark sales awaiting review
let expenseTab = 'grid';           // 'grid' | 'list'
let expenseCatFilter = 'all';
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
const LIVE_VIEWS = { dashboard: renderDashboard, settings: renderSettings, accounts: renderAccounts, income: renderIncome, subscriptions: renderSubscriptions, expenses: renderExpenses, paychecks: renderPaychecks, raises: renderRaises, selling: renderSelling, credit: renderCredit, taxes: renderTaxes, reports: renderReports, calendar: renderCalendar, import: renderImport };
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

function renderView(route) {
  const view = document.getElementById('view');
  view.innerHTML = '';
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
function field(label, node, hint) {
  const w = el('label', 'field');
  const lab = el('span', null, label);
  if (hint) { const i = el('span', 'info', 'ⓘ'); i.title = hint; lab.appendChild(document.createTextNode(' ')); lab.appendChild(i); }
  w.appendChild(lab); w.appendChild(node); return w;
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
function openModal({ title, body, confirmLabel = 'Save', onConfirm = null }) {
  document.getElementById('modal-title').textContent = title;
  const b = document.getElementById('modal-body'); b.innerHTML = ''; if (body) b.appendChild(body);
  document.getElementById('modal-confirm').textContent = confirmLabel;
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
    'Your data is private to your Google account — nothing here is public.'
  ].forEach(t => { const li = el('li'); li.innerHTML = t; ul.appendChild(li); });
  card.appendChild(ul);
  card.appendChild(el('div', 'muted', 'Clover v' + VERSION));
  return card;
}

function renderSettings(view) {
  const store = window.cloverStore, s = store.state;
  view.appendChild(helpCard());
  const grid = el('div', 'settings-grid');
  grid.appendChild(simpleListCard('People', 'Who money belongs to — you, joint, or others. Click a name to rename.', s.persons,
    { addLabel: 'Add person', onAdd: v => store.addPerson(v), onRemove: id => store.removePerson(id), onRename: (id, v) => store.renamePerson(id, v) }));
  grid.appendChild(categoryCard('income', s.incomeCategories));
  grid.appendChild(categoryCard('expense', s.expenseCategories));
  grid.appendChild(simpleListCard('Institutions', 'Banks, brokers & card issuers used by accounts', s.catalog.institutions,
    { addLabel: 'Add institution', onAdd: v => store.addCatalog('institutions', v), onRemove: id => store.removeCatalog('institutions', id), onRename: (id, v) => store.renameCatalog('institutions', id, v) }));
  grid.appendChild(simpleListCard('Reward programs', 'Cashback & rewards sources', s.catalog.rewardPrograms,
    { addLabel: 'Add reward program', onAdd: v => store.addCatalog('rewardPrograms', v), onRemove: id => store.removeCatalog('rewardPrograms', id), onRename: (id, v) => store.renameCatalog('rewardPrograms', id, v) }));
  grid.appendChild(simpleListCard('Gift card types', 'Redemption types for rewards', s.catalog.giftCardTypes,
    { addLabel: 'Add gift card type', onAdd: v => store.addCatalog('giftCardTypes', v), onRemove: id => store.removeCatalog('giftCardTypes', id), onRename: (id, v) => store.renameCatalog('giftCardTypes', id, v) }));
  grid.appendChild(simpleListCard('Tax forms', 'Form names offered in the tax-history pickers — update here if the IRS changes things (see irs.gov/forms-instructions-and-publications)', s.catalog.taxForms || [],
    { addLabel: 'Add tax form', onAdd: v => store.addCatalog('taxForms', v), onRemove: id => store.removeCatalog('taxForms', id), onRename: (id, v) => store.renameCatalog('taxForms', id, v) }));
  grid.appendChild(paySchedulesCard());
  grid.appendChild(accountDefaultsCard());
  grid.appendChild(yearsCard());
  view.appendChild(grid);
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
const ACCT_COL_LABELS = { name: 'Name', institution: 'Institution', type: 'Type', last4: 'Last 4', owner: 'Owner', flags: 'Flags', cdApy: 'CD APY', cdMaturity: 'CD maturity', savingsRate: 'Savings APY (latest)', beneficiaries: 'Beneficiaries', notes: 'Notes' };
const ACCT_ALL_COLS = ['name', 'institution', 'type', 'last4', 'owner', 'flags', 'cdApy', 'cdMaturity', 'savingsRate', 'beneficiaries', 'notes'];
const ACCT_DEFAULT_COLS = ['name', 'institution', 'type', 'last4', 'owner', 'flags'];
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
        if (BENEFICIARY_TYPES.includes(a.type) && !(a.beneficiaries || '').trim()) flags.appendChild(badge('No beneficiary', 'amber'));
        td.appendChild(flags); return td; } };
    case 'beneficiaries': return { label: 'Beneficiaries', key: 'beneficiaries', value: a => a.beneficiaries || '', cell: a => { const td = el('td'); td.appendChild(valueBadge('accounts', 'beneficiaries', (a.beneficiaries || '').trim())); return td; } };
    case 'cdApy': return { label: 'CD APY', key: 'cdApy', num: true, value: a => Number(a.cdApy) || 0, cell: a => { const td = el('td', 'num'); td.textContent = (a.type === 'CD' && a.cdApy != null && a.cdApy !== '') ? (Number(a.cdApy).toFixed(2) + '%') : '—'; return td; } };
    case 'cdMaturity': return { label: 'CD maturity', key: 'cdMaturity', value: a => a.cdMaturity || '', cell: a => el('td', null, a.cdMaturity ? fmtDate(a.cdMaturity) : '—') };
    case 'savingsRate': return { label: 'Savings APY (latest)', key: 'savingsRate', num: true, value: a => { const r = latestRateFor(store, a.institution); return r ? Number(r.apy) || 0 : -1; }, cell: a => {
        const td = el('td', 'num');
        const r = /savings|cd/i.test(a.type || '') ? latestRateFor(store, a.institution) : null;
        if (!r) { td.textContent = '—'; return td; }
        td.textContent = Number(r.apy).toFixed(2) + '%';
        td.appendChild(el('div', 'acct-sub', 'recorded ' + fmtDate(r.date)));
        return td; } };
    case 'notes': return { label: 'Notes', key: 'notes', value: a => a.notes || '', cell: a => { const td = el('td', 'muted'); td.textContent = a.notes || '—'; return td; } };
  }
  return null;
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

  const cols = [
    ...tableColKeys(store, 'accounts', ACCT_COL_LABELS, ACCT_DEFAULT_COLS).map(k => buildAcctCol(store, k)).filter(Boolean),
    { label: '', sortable: false, cell: a => {
        const td = el('td', 'row-actions');
        const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => accountModal(a));
        const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove(a.name, () => store.removeAccount(a.id)));
        td.appendChild(edit); td.appendChild(del); return td; } }
  ];
  const bestCal = bestCardCallout(store);
  if (bestCal) view.appendChild(bestCal);

  let acctRows = s.accounts;
  if (accountsFilter) {
    const f = accountsFilter;
    const valOf = a => f.key === 'owner' ? store.personName(a.personId) : f.key === 'beneficiaries' ? (a.beneficiaries || '').trim() : (a[f.key] || '');
    acctRows = s.accounts.filter(a => valOf(a) === f.value);
    const bar = el('div', 'filter-bar');
    bar.appendChild(el('span', 'muted', 'Showing ' + acctRows.length + ' account' + (acctRows.length === 1 ? '' : 's') + ' where ' + (ACCT_COL_LABELS[f.key] || f.key) + ' = “' + f.value + '”'));
    const clear = el('button', 'btn-ghost', '✕ Clear filter');
    clear.addEventListener('click', () => { accountsFilter = null; renderView(currentRoute); });
    bar.appendChild(clear);
    view.appendChild(bar);
  }
  view.appendChild(tableTools(columnsButton('accounts', ACCT_ALL_COLS, ACCT_DEFAULT_COLS, ACCT_COL_LABELS, 'Account columns')));
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
  const fBenef = document.createElement('textarea'); fBenef.value = a.beneficiaries || ''; fBenef.rows = 2; fBenef.placeholder = 'e.g. names and any % split';

  const fTerm = input(a.cdTerm || '', { placeholder: 'e.g. 12 months' });
  const fApy = input(a.cdApy || '', { placeholder: 'e.g. 4.00' });
  const fMat = input(a.cdMaturity || '', { type: 'date' });
  const cdWrap = el('div', 'cd-fields');
  cdWrap.appendChild(field('CD term', fTerm, 'The length of the CD — e.g. "12 months".'));
  cdWrap.appendChild(field('APY %', fApy, 'The annual percentage yield this CD earns.'));
  cdWrap.appendChild(field('Maturity date', fMat, 'When the CD matures. Will show on the calendar and in renewal warnings.'));

  const fCcOpen = dayField('Statement opens (day)', 'Day of month the statement period begins (optional; static cycle only).', a.statementStartDay);
  const fCcClose = dayField('Statement closes (day)', 'Day of month the statement closes/cuts. Used with the due day to estimate float.', a.statementCloseDay);
  const fCcDue = dayField('Payment due (day)', 'Day of month the payment is due. Use “Last day” for cards that cut on the last day, since not every month has 31 days. Clover uses this to estimate the float — days until a purchase made today would be due.', a.dueDay);
  const ccWrap = el('div', 'cd-fields');
  ccWrap.appendChild(fCcOpen); ccWrap.appendChild(fCcClose); ccWrap.appendChild(fCcDue);

  const syncTypeFields = () => {
    cdWrap.style.display = fType.value === 'CD' ? '' : 'none';
    ccWrap.style.display = fType.value === 'Credit Card' ? '' : 'none';
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
  const flags = el('div', 'check-row'); [cActive, cIncome, cExpense, cAuto, cRewards].forEach(c => flags.appendChild(c));
  body.appendChild(field('Flags', flags));
  body.appendChild(field('Notes', fNotes));
  syncTypeFields();

  openModal({
    title: existing ? 'Edit account' : 'Add account', body, confirmLabel: 'Save',
    onConfirm: () => {
      const name = fName.value.trim();
      if (!name) { fName.focus(); toast('Name is required', 'warn'); return false; }
      const prevId = fPrev.value || '';
      if (prevId) {
        const prev = store.account(prevId);
        if (prev && a.id && prev.previousAccountId === a.id) { toast('That would link the two accounts in a loop', 'warn'); return false; }
      }
      const acc = Object.assign(a, {
        name, institution: fInst.value.trim(), type: fType.value,
        last4: fLast4.value.replace(/\D/g, '').slice(0, 4), personId: fOwner.value,
        beneficiaries: fBenef.value.trim(),
        active: cActive.__input.checked, usedForIncome: cIncome.__input.checked,
        usedForExpenses: cExpense.__input.checked, usedForAutopay: cAuto.__input.checked,
        rewardsCard: cRewards.__input.checked, notes: fNotes.value.trim(),
        cdTerm: fTerm.value.trim(), cdApy: fApy.value.trim(), cdMaturity: fMat.value,
        statementStartDay: fCcOpen.__value(), statementCloseDay: fCcClose.__value(), dueDay: fCcDue.__value(),
        previousAccountId: prevId
      });
      store.saveAccount(acc);
      // A rolled-over account's old number is closed — mark the predecessor inactive.
      if (prevId) {
        const prev = store.account(prevId);
        if (prev && prev.active !== false) { prev.active = false; store.saveAccount(prev); toast('Marked “' + prev.name + '” as rolled over'); }
        else toast(existing ? 'Account updated' : 'Account added');
      } else {
        toast(existing ? 'Account updated' : 'Account added');
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
function accountOptions(s, noneLabel) {
  return [{ value: '', label: noneLabel || '—' }].concat(
    s.accounts.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map(a => ({ value: a.id, label: a.name + (a.last4 ? ' ••' + a.last4 : '') })));
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
      if (rewardCat || interestCat || dividendCat || otherCat) {
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

function incomeList(data) {
  const store = window.cloverStore;
  let rows = data.income.slice();
  if (activeMonth > 0) rows = rows.filter(e => monthIdx(e.date) === activeMonth - 1);
  if (incomeCatFilter !== 'all') rows = rows.filter(e => e.categoryId === incomeCatFilter);
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const wrap = el('div');
  const bar = el('div', 'filter-bar');
  const catSel = select([{ value: 'all', label: 'All categories' }].concat(store.state.incomeCategories.map(c => ({ value: c.id, label: c.name }))), incomeCatFilter);
  catSel.addEventListener('change', () => { incomeCatFilter = catSel.value; renderView(currentRoute); });
  bar.appendChild(labelWrap('Category', catSel));
  bar.appendChild(el('div', 'muted', rows.length + ' shown' + (activeMonth > 0 ? ' · ' + MONTHS[activeMonth - 1] : '')));
  wrap.appendChild(bar);

  if (!rows.length) {
    wrap.appendChild(emptyState('No income entries', 'Add income for ' + activeYear + (activeMonth > 0 ? ' / ' + MONTHS[activeMonth - 1] : '') + '.', '+ Add income', () => incomeModal(null)));
    return wrap;
  }

  const card = el('div', 'card table-card');
  const table = el('table', 'data-table');
  table.innerHTML = '<thead><tr><th>Date</th><th>Category</th><th>Source</th><th>Account</th><th>Received via</th><th class="num">Gross</th><th class="num">Net</th><th>Person</th><th>Status</th><th></th></tr></thead>';
  const tb = el('tbody');
  rows.forEach(e => {
    const tr = el('tr');
    tr.appendChild(el('td', null, fmtDate(e.date)));
    tr.appendChild(el('td', null, store.incomeGroupName(e.categoryId)));
    const srcTd = el('td');
    srcTd.appendChild(document.createTextNode(e.rewardSource || e.otherType || e.symbol || store.subName('income', e.categoryId, e.subId) || '—'));
    if (e.reinvested) { srcTd.appendChild(document.createTextNode(' ')); srcTd.appendChild(badge('↻ Reinvested', 'type')); }
    const srcSub = e.rewardType || e.description || (e.symbol && e.action ? e.action : '');
    if (srcSub) srcTd.appendChild(el('div', 'acct-sub', srcSub));
    tr.appendChild(srcTd);
    tr.appendChild(el('td', null, store.accountName(e.accountId) || '—'));
    tr.appendChild(el('td', 'muted', e.receivedVia || '—'));
    tr.appendChild(numCell(amountOf(e), true));
    tr.appendChild(numCell(Number(e.net) || 0));
    tr.appendChild(el('td', null, store.personName(e.personId)));
    const stTd = el('td'); stTd.appendChild(e.status === 'pending' ? badge('Pending', 'amber') : badge('Received', 'green')); tr.appendChild(stTd);
    const act = el('td', 'row-actions');
    const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => incomeModal(e));
    const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove(fmtDate(e.date) + ' · ' + store.incomeGroupName(e.categoryId), () => store.removeIncome(activeYear, e.id)));
    act.appendChild(edit); act.appendChild(del); tr.appendChild(act);
    tb.appendChild(tr);
  });
  table.appendChild(tb); card.appendChild(table); wrap.appendChild(card);
  return wrap;
}

function incomeModal(existing) {
  const store = window.cloverStore, s = store.state;
  const e = existing ? Object.assign({}, existing) : { status: 'received', taxable: 'unknown', date: todayISO() };
  const body = el('div', 'form-grid');

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
  const fAcct = select(accountOptions(s), e.accountId || '');
  const fPerson = select(s.persons.map(p => ({ value: p.id, label: p.name })), e.personId || (s.persons[0] && s.persons[0].id));
  const fGross = input(e.gross != null ? e.gross : '', { type: 'number', placeholder: '0.00' }); fGross.step = '0.01';
  const fNet = input(e.net != null ? e.net : '', { type: 'number', placeholder: 'optional' }); fNet.step = '0.01';
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
  const fPrice = input(e.price != null ? e.price : '', { type: 'number', placeholder: 'price' }); fPrice.step = '0.01';
  const divWrap = el('div', 'div-fields');
  divWrap.appendChild(field('Symbol', fSym, 'The stock/fund ticker this dividend came from.'));
  divWrap.appendChild(field('Action', fAction, 'The dividend type as your broker labels it — e.g. Qualified Dividend, Cash Dividend, Reinvest.'));
  divWrap.appendChild(field('Qty', fQty, 'Shares involved, if reinvested.'));
  divWrap.appendChild(field('Price', fPrice, 'Share price at reinvestment, if applicable.'));

  // Reward-specific fields (shown when the category looks like Rewards).
  // Program is a real dropdown so your Settings → Reward programs list is
  // visible up front (a type-ahead suggestion box hid it too well).
  const rwPrograms = [...new Set(((s.catalog && s.catalog.rewardPrograms) || []).map(pr => pr.name).filter(Boolean))];
  const rwCommon = ['Chase', 'Amex', 'Apple Card', 'Discover', 'Citi', 'Capital One', 'Coinbase', 'Fetch Rewards', 'Rakuten / Ebates', 'ReceiptPal', 'Microsoft Rewards', 'PayPal'].filter(v => !rwPrograms.includes(v));
  const curRwSrc = e.rewardSource || '';
  const rwKnownSrc = !curRwSrc || rwPrograms.includes(curRwSrc) || rwCommon.includes(curRwSrc);
  const fRwSel = select([{ value: '', label: '— Select program —' }]
    .concat(rwPrograms.map(n => ({ value: n, label: n })))
    .concat(rwCommon.map(n => ({ value: n, label: n })))
    .concat([{ value: '__other', label: 'Other / type manually…' }]), rwKnownSrc ? curRwSrc : '__other');
  const fRwOther = input(rwKnownSrc ? '' : curRwSrc, { placeholder: 'Program name' });
  const rwOtherWrap = el('div'); rwOtherWrap.style.marginTop = '6px';
  rwOtherWrap.appendChild(fRwOther);
  rwOtherWrap.style.display = rwKnownSrc ? 'none' : '';
  fRwSel.addEventListener('change', () => { rwOtherWrap.style.display = fRwSel.value === '__other' ? '' : 'none'; if (fRwSel.value === '__other') fRwOther.focus(); });
  const rwSrcNode = el('div'); rwSrcNode.appendChild(fRwSel); rwSrcNode.appendChild(rwOtherWrap);
  const rwTypeList = el('datalist'); rwTypeList.id = 'rw-type-list';
  ['Cash back', 'Statement credit', 'Gift card', 'Crypto', 'Points', 'Miles', 'Referral bonus'].forEach(v => { const o = el('option'); o.value = v; rwTypeList.appendChild(o); });
  body.appendChild(rwTypeList);
  const fRwType = input(e.rewardType || '', { placeholder: 'e.g. Cash back, Gift card', list: 'rw-type-list' });
  const fOrderConf = input(e.orderConf || '', { placeholder: 'optional' });
  const rwWrap = el('div', 'div-fields');
  rwWrap.appendChild(field('Reward program', rwSrcNode, 'Which program or card the reward came from — your reward programs from Settings are listed first, then common issuers. Pick Other to type a new one.'));
  rwWrap.appendChild(field('Reward type', fRwType, 'What kind of reward it is — e.g. Cash back, Statement credit, Gift card, Crypto.'));
  rwWrap.appendChild(field('Order confirmation #', fOrderConf, 'If the reward came with an order or confirmation number (gift-card redemptions often do), keep it here for reference.'));

  // Other-income fields (shown when the category looks like Other) — e.g. lawsuit
  // settlements, gifts, stimulus, rebates, winnings.
  const otTypeList = el('datalist'); otTypeList.id = 'ot-type-list';
  ['Lawsuit', 'Class action', 'Settlement', 'Gift', 'Stimulus', 'Rebate', 'Winnings', 'Survey reward', 'Refund', 'Inheritance'].forEach(v => { const o = el('option'); o.value = v; otTypeList.appendChild(o); });
  body.appendChild(otTypeList);
  const fOtType = input(e.otherType || '', { placeholder: 'e.g. Lawsuit, Gift, Rebate', list: 'ot-type-list' });
  const fDesc = input(e.description || '', { placeholder: 'e.g. case name or what it was' });
  const otWrap = el('div', 'div-fields');
  otWrap.appendChild(field('Type', fOtType, 'What kind of “other” income this is — e.g. Lawsuit settlement, Gift, Stimulus, Rebate, Winnings.'));
  otWrap.appendChild(field('Description', fDesc, 'A short label or name — e.g. the class-action case name, or what the gift/rebate was for.'));

  const syncCat = () => {
    const g = s.incomeCategories.find(c => c.id === fCat.value);
    const isRw = !!(g && /reward/i.test(g.name));
    divWrap.style.display = (g && /dividend/i.test(g.name)) ? '' : 'none';
    rwWrap.style.display = isRw ? '' : 'none';
    otWrap.style.display = (g && /other/i.test(g.name)) ? '' : 'none';
    // Rewards are take-home by definition: you enter the NET, and Gross is greyed
    // out and mirrors it (they're always equal for rewards).
    fGross.readOnly = isRw;
    fGross.classList.toggle('mirrored', isRw);
    if (isRw) { if (!fNet.value && fGross.value) fNet.value = fGross.value; fGross.value = fNet.value; }
  };
  fNet.addEventListener('input', () => { if (fGross.readOnly) fGross.value = fNet.value; });
  fCat.addEventListener('change', () => { rebuildSubs(); syncCat(); });
  rebuildSubs(); syncCat();

  body.appendChild(field('Date', fDate, 'When you received this money. For pending items, the date you expect it.'));
  body.appendChild(field('Category', fCat, 'The type of income — e.g. Wages, Dividends, Interest, Rewards. Manage the list in Settings.'));
  body.appendChild(field('Source (subcategory)', fSub, 'A more specific source within the category — e.g. a particular broker or bank. Add these under the category in Settings.'));
  body.appendChild(field('Account', fAcct, 'Which of your accounts the money went INTO — e.g. the bank or broker that received it. Optional, but lets you see income by account (like dividends per broker, or interest per bank).'));
  body.appendChild(field('Person', fPerson, 'Who this income belongs to — you, joint, or another person you track.'));
  const amtRow = el('div', 'two-col');
  amtRow.appendChild(field('Gross amount', fGross, 'The full amount before any taxes or withholding.'));
  amtRow.appendChild(field('Net (optional)', fNet, 'The amount actually received after taxes/withholding, if it differs from gross.'));
  body.appendChild(amtRow);
  const stRow = el('div', 'two-col');
  stRow.appendChild(field('Status', fStatus, 'Received = money is in hand and counts toward totals. Pending = expected but not yet received (tracked, but left out of grid totals).'));
  stRow.appendChild(field('Expected date', fExpected, 'For pending income, when you expect it to arrive.'));
  body.appendChild(stRow);
  body.appendChild(field('Received via', fVia, 'How the money arrived — e.g. Direct Deposit, PayPal, Venmo, check.'));
  const tRow = el('div', 'two-col');
  tRow.appendChild(field('Taxable', fTax, 'Whether this income is taxable, if you know. Use Unknown if unsure.'));
  const flagsWrap = el('div', 'check-row'); flagsWrap.appendChild(cReinv); flagsWrap.appendChild(cPaid);
  tRow.appendChild(field('Flags', flagsWrap));
  body.appendChild(tRow);
  body.appendChild(divWrap);
  body.appendChild(rwWrap);
  body.appendChild(otWrap);
  body.appendChild(field('Notes', fNotes, 'Anything else worth remembering about this entry.'));

  openModal({
    title: existing ? 'Edit income' : 'Add income', body, confirmLabel: 'Save',
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
        rewardSource: (fRwSel.value === '__other' ? fRwOther.value : fRwSel.value).trim(), rewardType: fRwType.value.trim(), orderConf: fOrderConf.value.trim(),
        otherType: fOtType.value.trim(), description: fDesc.value.trim()
      });
      store.saveIncome(activeYear, entry);
      toast(existing ? 'Income updated' : 'Income added');
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

// The flag labels a bill carries (must mirror the Flags column cell).
function subFlags(r) {
  const out = [];
  if (!isSubActive(r)) out.push(r.status || 'Inactive');
  else if (r.status === 'Trial') out.push('Trial');
  if (r.autoPay) out.push('Auto-pay');
  if (r.priority && r.priority !== 'Medium') out.push(r.priority);
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
const SUBS_COL_LABELS = { name: 'Name', category: 'Category', subcategory: 'Subcategory', vendor: 'Vendor', amount: 'Amount', frequency: 'Frequency', monthly: 'Monthly', annual: 'Annual', pct: '% net', renews: 'Renews', account: 'Account', backupAccount: 'Backup account', person: 'Person', priority: 'Priority', status: 'Status', links: 'Links', customerNo: 'Customer #', apr: 'APR %', flags: 'Flags', notes: 'Notes' };
const SUBS_ALL_COLS = ['name', 'category', 'subcategory', 'vendor', 'amount', 'frequency', 'monthly', 'annual', 'pct', 'renews', 'account', 'backupAccount', 'person', 'priority', 'status', 'links', 'customerNo', 'apr', 'flags', 'notes'];
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
    case 'amount': return { label: 'Amount', key: 'amount', num: true, value: r => Number(r.amount) || 0, cell: r => numCell(Number(r.amount) || 0) };
    case 'frequency': return { label: 'Frequency', key: 'freq', value: r => freqLabel(r), cell: r => { const td = el('td'); td.appendChild(valueBadge('subs', 'frequency', freqLabel(r))); return td; } };
    case 'monthly': return { label: 'Monthly', key: 'monthly', num: true, value: r => monthlyEquiv(r), cell: r => numCell(monthlyEquiv(r), true) };
    case 'annual': return { label: 'Annual', key: 'annual', num: true, value: r => annualCost(r), cell: r => numCell(annualCost(r)) };
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
    case 'apr': return { label: 'APR %', key: 'apr', num: true, value: r => r.apr != null ? Number(r.apr) : -1, cell: r => el('td', 'num', (r.apr != null && r.apr !== '') ? (Number(r.apr).toFixed(2) + '%') : '—') };
    case 'person': return { label: 'Person', key: 'person', value: r => store.personName(r.personId), cell: r => el('td', null, store.personName(r.personId)) };
    case 'flags': return { label: 'Flags', sortable: false, cell: r => {
        const td = el('td'); const flags = el('div', 'flags');
        if (!isSubActive(r)) flags.appendChild(subsFilterBadge('flags', r.status || 'Inactive', 'red'));
        else if (r.status === 'Trial') flags.appendChild(subsFilterBadge('flags', 'Trial', 'amber'));
        if (r.autoPay) flags.appendChild(subsFilterBadge('flags', 'Auto-pay', 'amber'));
        if (r.priority && r.priority !== 'Medium') flags.appendChild(subsFilterBadge('flags', r.priority, r.priority === 'Essential' ? 'red' : r.priority === 'High' ? 'amber' : r.priority === 'Low' ? 'green' : ''));
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
  const narrowed = !!(subsBadgeFilter || subsCatFilter !== 'all');
  const shownActive = rows.filter(isSubActive);
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
  sum.appendChild(sumCard('Total monthly', money(totalMonthly), 'expense', fHint));
  sum.appendChild(sumCard('Total annual', money(totalAnnual), 'expense', fHint));
  if (net > 0) {
    const unalloc = net - totalMonthly;
    sum.appendChild(sumCard('Left after subs', money(unalloc), unalloc < 0 ? 'expense' : 'income', fHint));
    sum.appendChild(sumCard('% of net income', (totalMonthly / net * 100).toFixed(1) + '%', 'neutral', fHint));
  }
  view.appendChild(sum);

  const bar = el('div', 'filter-bar');
  const statusSel = select([{ value: 'active', label: 'Active only' }, { value: 'all', label: 'All' }], subsStatusFilter);
  statusSel.addEventListener('change', () => { subsStatusFilter = statusSel.value; renderView(currentRoute); });
  bar.appendChild(labelWrap('Show', statusSel));
  const catSel = select([{ value: 'all', label: 'All categories' }].concat(s.expenseCategories.map(c => ({ value: c.id, label: c.name }))), subsCatFilter);
  catSel.addEventListener('change', () => { subsCatFilter = catSel.value; renderView(currentRoute); });
  bar.appendChild(labelWrap('Category', catSel));
  view.appendChild(bar);
  if (chipBar) view.appendChild(chipBar);

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
        const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove(r.name, () => store.removeRecurring(r.id)));
        td.appendChild(edit); td.appendChild(del); return td; } }
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

function sumCard(label, value, tone, hint) {
  const c = el('div', 'sum-card');
  c.appendChild(el('div', 'sum-label', label));
  c.appendChild(el('div', 'sum-value ' + (tone || ''), value));
  if (hint) c.appendChild(el('div', 'sum-hint', hint));
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
  const fAmount = input(r.amount != null ? r.amount : '', { type: 'number', placeholder: '0.00' }); fAmount.step = '0.01';
  const fFreq = select(FREQUENCIES.map(f => ({ value: f.key, label: f.label })), r.frequency || 'monthly');
  const fInterval = input(r.interval || '', { type: 'number', placeholder: 'N' }); fInterval.min = 1;
  const intervalWrap = field('Interval (N)', fInterval, 'How many months or years between charges.');
  const syncInterval = () => { intervalWrap.style.display = (fFreq.value === 'everyNMonths' || fFreq.value === 'everyNYears') ? '' : 'none'; };
  fFreq.addEventListener('change', syncInterval);
  const fRenew = input(r.renewalDate || '', { type: 'date' });
  const fAcct = select(accountOptions(s), r.accountId || '');
  const fBackup = select(accountOptions(s, '— None —'), r.backupAccountId || '');
  const fPerson = select(s.persons.map(p => ({ value: p.id, label: p.name })), r.personId || (s.persons[0] && s.persons[0].id));
  const fPriority = select(PRIORITIES, r.priority || 'Medium');
  const fStatus = select(SUB_STATUSES, r.status || 'Active');
  const cAuto = checkbox('Auto-pay', r.autoPay, 'Charged automatically — no manual action needed.');
  const fUrl = input(r.url || '', { placeholder: 'https:// (optional)' });
  const fPayUrl = input(r.payUrl || '', { placeholder: 'https:// (optional)' });
  // Customer/account number stays masked unless the field is focused.
  const fCust = input(r.customerNo || '', { placeholder: 'optional' });
  fCust.type = 'password'; fCust.autocomplete = 'off';
  fCust.addEventListener('focus', () => { fCust.type = 'text'; });
  fCust.addEventListener('blur', () => { fCust.type = 'password'; });
  const fApr = input(r.apr != null ? r.apr : '', { type: 'number', placeholder: 'e.g. 24.99' }); fApr.step = '0.01'; fApr.min = 0;
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
  body.appendChild(renewField);
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
  const flagsWrap = el('div', 'check-row'); flagsWrap.appendChild(cAuto);
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
  const syncOnce = () => { renewLblNode.nodeValue = fFreq.value === 'once' ? 'Due date' : 'Renewal / due date'; };
  fFreq.addEventListener('change', syncOnce);
  rebuildSubs(); syncInterval(); syncCatFields(); syncOnce();
  fCat.addEventListener('change', () => { rebuildSubs(); syncCatFields(); });

  openModal({
    title: existing ? 'Edit subscription' : 'Add subscription', body, confirmLabel: 'Save',
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
        renewalDate: fRenew.value || '', accountId: fAcct.value || '', backupAccountId: fBackup.value || '',
        personId: fPerson.value, priority: fPriority.value, status: fStatus.value, autoPay: cAuto.__input.checked,
        url: fUrl.value.trim(), payUrl: fPayUrl.value.trim(), customerNo: fCust.value.trim(),
        apr: fApr.value === '' ? null : parseFloat(fApr.value), notes: fNotes.value.trim(), priceHistory: hist
      });
      store.saveRecurring(item);
      toast(existing ? 'Subscription updated' : 'Subscription added');
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
  table.innerHTML = '<thead><tr><th>Category</th>' + MONTHS.map(m => '<th class="num">' + m + '</th>').join('') + '<th class="num">YTD</th><th class="num" title="Average per month, across the months that have amounts">Avg / mo</th></tr></thead>';
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

  const gtr = el('tr', 'total-row');
  gtr.appendChild(el('td', 'grp-name', 'Total expenses'));
  grand.forEach(v => gtr.appendChild(numCell(v)));
  gtr.appendChild(numCell(grand.reduce((a, b) => a + b, 0), true));
  gtr.appendChild(numCell(avgOf(grand), true));
  tb.appendChild(gtr);

  table.appendChild(tb); card.appendChild(table);
  return card;
}

function expenseList(data) {
  const store = window.cloverStore;
  let rows = data.expensePayments.slice();
  if (activeMonth > 0) rows = rows.filter(e => monthIdx(e.date) === activeMonth - 1);
  if (expenseCatFilter !== 'all') rows = rows.filter(e => e.categoryId === expenseCatFilter);
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const wrap = el('div');
  const bar = el('div', 'filter-bar');
  const catSel = select([{ value: 'all', label: 'All categories' }].concat(store.state.expenseCategories.map(c => ({ value: c.id, label: c.name }))), expenseCatFilter);
  catSel.addEventListener('change', () => { expenseCatFilter = catSel.value; renderView(currentRoute); });
  bar.appendChild(labelWrap('Category', catSel));
  bar.appendChild(el('div', 'muted', rows.length + ' shown' + (activeMonth > 0 ? ' · ' + MONTHS[activeMonth - 1] : '')));
  wrap.appendChild(bar);

  if (!rows.length) {
    wrap.appendChild(emptyState('No expenses logged', 'Add one-off or actual expenses for ' + activeYear + (activeMonth > 0 ? ' / ' + MONTHS[activeMonth - 1] : '') + '. (Recurring bills live on the Subscriptions page.)', '+ Add expense', () => expenseModal(null)));
    return wrap;
  }

  const card = el('div', 'card table-card');
  const table = el('table', 'data-table');
  table.innerHTML = '<thead><tr><th>Date</th><th>Category</th><th>Source</th><th>Account</th><th class="num">Amount</th><th>Person</th><th></th></tr></thead>';
  const tb = el('tbody');
  rows.forEach(e => {
    const tr = el('tr');
    tr.appendChild(el('td', null, fmtDate(e.date)));
    tr.appendChild(el('td', null, store.expenseGroupName(e.categoryId)));
    tr.appendChild(el('td', null, store.subName('expense', e.categoryId, e.subId) || '—'));
    tr.appendChild(el('td', null, store.accountName(e.accountId) || '—'));
    tr.appendChild(numCell(expenseAmount(e), true));
    tr.appendChild(el('td', null, store.personName(e.personId)));
    const act = el('td', 'row-actions');
    const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => expenseModal(e));
    const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove(fmtDate(e.date) + ' · ' + store.expenseGroupName(e.categoryId), () => store.removeExpense(activeYear, e.id)));
    act.appendChild(edit); act.appendChild(del); tr.appendChild(act);
    tb.appendChild(tr);
  });
  table.appendChild(tb); card.appendChild(table); wrap.appendChild(card);
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
  const fAcct = select(accountOptions(s), e.accountId || '');
  const fPerson = select(s.persons.map(p => ({ value: p.id, label: p.name })), e.personId || (s.persons[0] && s.persons[0].id));
  const fAmount = input(e.amount != null ? e.amount : '', { type: 'number', placeholder: '0.00' }); fAmount.step = '0.01';
  const fNotes = document.createElement('textarea'); fNotes.value = e.notes || ''; fNotes.rows = 2; fNotes.placeholder = 'Optional';

  body.appendChild(field('Date', fDate, 'When you paid this.'));
  if (recActive.length) body.appendChild(field('For which bill?', fBill, 'Link this to a recurring bill (e.g. the actual ComEd amount this month). It replaces that bill’s estimate for the month so it isn’t double-counted. Leave as “one-off” for regular expenses.'));
  body.appendChild(field('Category', fCat, 'The type of expense. Manage the list in Settings.'));
  body.appendChild(field('Source (subcategory)', fSub, 'A more specific grouping within the category (optional).'));
  body.appendChild(field('Account', fAcct, 'Which account or card this was paid from.'));
  body.appendChild(field('Person', fPerson, 'Who this expense belongs to.'));
  body.appendChild(field('Amount', fAmount, 'How much you paid.'));
  body.appendChild(field('Notes', fNotes, 'Anything else worth remembering about this expense.'));
  rebuildSubs();
  fCat.addEventListener('change', rebuildSubs);

  openModal({
    title: existing ? 'Edit expense' : 'Add expense', body, confirmLabel: 'Save',
    onConfirm: () => {
      if (!fCat.value) { toast('Pick a category', 'warn'); fCat.focus(); return false; }
      const amount = parseFloat(fAmount.value);
      if (isNaN(amount)) { toast('Amount is required', 'warn'); fAmount.focus(); return false; }
      const entry = Object.assign(e, {
        date: fDate.value || todayISO(), categoryId: fCat.value, subId: fSub.value || '',
        accountId: fAcct.value || '', personId: fPerson.value, amount, notes: fNotes.value.trim(),
        recurringId: fBill.value || ''
      });
      store.saveExpense(activeYear, entry);
      toast(existing ? 'Expense updated' : 'Expense added');
    }
  });
}

// ============================================================
// Paychecks — Phase 4 (source of truth for wages)
// ============================================================
const PAYCHECK_STATUSES = ['Received', 'Expected', 'Late', 'Missing', 'Bounced/Returned', 'Manual deposit'];
const PAYCHECK_METHODS = ['Direct deposit', 'Check', 'Office pickup', 'Other'];
const PAYCHECK_KINDS = ['Regular', 'Bonus', 'Reimbursement', 'Adjustment', 'Other one-time'];
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
  employer: 'Employer', person: 'Person', status: 'Status', method: 'Method', notes: 'Notes'
};
const PAYCHECK_ALL_COLS = ['payDate', 'received', 'timing', 'period', 'periodStart', 'periodEnd', 'gross', 'net', 'employer', 'person', 'status', 'method', 'notes'];
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
    [['current', 'Paychecks'], ['upcoming', 'Upcoming']].forEach(([v, label]) => {
      const b = el('button', 'tab' + (paycheckView === v ? ' active' : ''), label);
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

  const bar = el('div', 'filter-bar');
  const statusSel = select([{ value: 'all', label: 'All statuses' }].concat(PAYCHECK_STATUSES.map(s => ({ value: s, label: s }))), paycheckStatusFilter);
  statusSel.addEventListener('change', () => { paycheckStatusFilter = statusSel.value; renderView(currentRoute); });
  bar.appendChild(labelWrap('Status', statusSel));
  if (!upcomingView && !allMode && schedActive) bar.appendChild(el('div', 'muted', 'Greyed rows are expected paychecks not recorded yet — they don’t count toward totals.'));
  view.appendChild(bar);

  // Bulk selection applies only to real recorded paychecks in the single-year current view.
  const showSel = !allMode && paycheckView === 'current';
  if (!showSel) { paycheckSel = new Set(); paycheckSelYear = null; }
  else {
    if (paycheckSelYear !== activeYear) { paycheckSel = new Set(); paycheckSelYear = activeYear; }
    const validIds = new Set(pays.map(p => p.id));
    [...paycheckSel].forEach(id => { if (!validIds.has(id)) paycheckSel.delete(id); });
  }

  // Rows: recorded (+ past-missing) for the current view; future expected for upcoming.
  let rows;
  if (upcomingView) rows = expectedRows(store, activeYear, pays, 'upcoming');
  else if (!allMode && schedActive) rows = pays.concat(expectedRows(store, activeYear, pays, 'missing'));
  else rows = pays.slice();
  if (paycheckStatusFilter !== 'all') rows = rows.filter(p => (p.status || 'Received') === paycheckStatusFilter);

  if (!rows.length) {
    if (upcomingView) view.appendChild(el('div', 'card muted pad', 'No upcoming paychecks scheduled.'));
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
  const mSel = select([{ value: '', label: 'Method: no change' }].concat(PAYCHECK_METHODS.map(m => ({ value: m, label: m }))), '');
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
  const fGross = input(p.gross != null ? p.gross : '', { type: 'number', placeholder: '0.00' }); fGross.step = '0.01';
  const fNet = input(p.net != null ? p.net : '', { type: 'number', placeholder: '0.00' }); fNet.step = '0.01';
  const fEmp = input(p.employer || '', { placeholder: 'Employer / source', list: 'emp-list' });
  const fCat = select(s.incomeCategories.map(c => ({ value: c.id, label: c.name })), p.incomeCategoryId || (wages && wages.id));
  const fPerson = select(s.persons.map(x => ({ value: x.id, label: x.name })), p.personId || (s.persons[0] && s.persons[0].id));
  const fPeriodNum = input(p.periodNum || '', { type: 'number', placeholder: '#' }); fPeriodNum.min = 1;
  const fPeriodStart = input(p.periodStart || '', { type: 'date' });
  const fPeriodEnd = input(p.periodEnd || '', { type: 'date' });
  const fStatus = select(PAYCHECK_STATUSES, p.status || 'Received');
  const fMethod = select(PAYCHECK_METHODS, p.method || 'Direct deposit');
  const fKind = select(PAYCHECK_KINDS, p.checkType || 'Regular');
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
  body.appendChild(field('Check type', fKind, 'Most checks are Regular — on a salary, every regular check is about the same. Mark bonuses, reimbursements, or other one-time checks so they don’t skew the deductions breakdown or raise detection.'));
  body.appendChild(field('Notes', fNotes, 'Anything unusual — bounced check, wrong amount, deposit delay, etc.'));

  const isEdit = !!(existing && existing.id);
  openModal({
    title: isEdit ? 'Edit paycheck' : 'Add paycheck', body, confirmLabel: 'Save',
    onConfirm: () => {
      const gross = parseFloat(fGross.value);
      if (isNaN(gross)) { fGross.focus(); toast('Gross is required', 'warn'); return false; }
      const entry = Object.assign(p, {
        payDate: fPay.value || todayISO(), receivedDate: fRecv.value || '',
        gross, net: fNet.value === '' ? null : parseFloat(fNet.value),
        employer: fEmp.value.trim(), incomeCategoryId: fCat.value, personId: fPerson.value,
        periodNum: fPeriodNum.value === '' ? null : parseInt(fPeriodNum.value, 10),
        periodStart: fPeriodStart.value || '', periodEnd: fPeriodEnd.value || '',
        status: fStatus.value, method: fMethod.value, checkType: fKind.value, notes: fNotes.value.trim()
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
  const fGross = input(c.gross != null ? c.gross : '', { type: 'number', placeholder: '0.00' }); fGross.step = '0.01';
  const fNet = input(c.net != null ? c.net : '', { type: 'number', placeholder: '0.00' }); fNet.step = '0.01';
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
      const fAmt2 = input(d0.amount != null ? Math.abs(d0.amount) : '', { type: 'number', placeholder: 'e.g. 150.00' }); fAmt2.step = '0.01'; fAmt2.min = 0;
      fAmt2.title = 'Enter as a positive amount — it\u2019s subtracted from gross automatically (that\u2019s what the \u2212 means).';
      fAmt2.addEventListener('input', () => { d0.amount = fAmt2.value === '' ? null : Math.abs(parseFloat(fAmt2.value)); });
      const x = el('button', 'icon-btn danger', '✕'); x.title = 'Remove this line item';
      x.addEventListener('click', () => { deductions.splice(i, 1); renderDed(); });
      const amtWrap = el('span', 'ded-amt');
      const minus = el('span', 'ded-minus', '−'); minus.title = fAmt2.title;
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
    title: existing ? 'Edit pay schedule' : 'Add pay schedule', body, confirmLabel: 'Save',
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
let raiseYoYSort = { key: 'date', dir: 'asc' };
// Effective previous amount for a raise: the entered one, else inferred from
// the prior same-employer raise on the same basis — unless the raise is
// marked standalone (noPrev, e.g. a job/role change makes them incomparable).
function raisePrev(store, r) {
  if (r.prevAmount != null && r.prevAmount !== '') return { v: Number(r.prevAmount), derived: false };
  if (r.noPrev) return null;
  const prior = store.state.raises
    .filter(x => x.id !== r.id && (x.employer || '').toLowerCase() === (r.employer || '').toLowerCase() && (x.date || '') < (r.date || '') && (x.basis || 'check') === (r.basis || 'check') && x.amount != null)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  return prior ? { v: Number(prior.amount), derived: true } : null;
}
// How long this pay level lasted: until the employer's NEXT raise, or counting
// up to today for the latest one.
function raiseDurationDays(store, r) {
  const next = store.state.raises
    .filter(x => x.id !== r.id && (x.employer || '').toLowerCase() === (r.employer || '').toLowerCase() && (x.date || '') > (r.date || ''))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
  return { days: daysBetweenISO(next ? next.date : todayISO(), r.date), ongoing: !next };
}
const RAISE_COL_LABELS = { employer: 'Employer', title: 'Position', empType: 'Employment', date: 'Date', amount: 'New gross', net: 'New net', prevAmount: 'Previous', change: 'Change', gap: 'At this pay', notes: 'Notes' };
const RAISE_ALL_COLS = ['employer', 'title', 'empType', 'date', 'amount', 'net', 'prevAmount', 'change', 'gap', 'notes'];
const RAISE_DEFAULT_COLS = ['employer', 'title', 'empType', 'date', 'amount', 'prevAmount', 'change', 'gap'];
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
    case 'prevAmount': return { label: 'Previous', key: 'prevAmount', num: true, value: r => { const pv = raisePrev(store, r); return pv ? pv.v : 0; }, cell: r => { const pv = raisePrev(store, r); if (!pv) return el('td', 'num', '—'); const td = numCell(pv.v); td.appendChild(el('span', 'muted', raiseSuf(r))); if (pv.derived) { td.classList.add('muted'); td.title = 'Inferred from this employer’s prior raise (tick “doesn’t follow the prior raise” on the raise to stop this)'; } return td; } };
    case 'change': return { label: 'Change', key: 'change', num: true, value: r => { const pv = raisePrev(store, r); return (pv && r.amount != null) ? Number(r.amount) - pv.v : 0; }, cell: r => {
        const td = el('td', 'num');
        const pv = raisePrev(store, r);
        if (!pv || r.amount == null) { td.textContent = '—'; return td; }
        const diff = Number(r.amount) - pv.v;
        const pct = pv.v > 0 ? (diff / pv.v * 100) : null;
        const span = el('span', diff >= 0 ? 'pos' : 'neg', (diff >= 0 ? '+' : '−') + money(Math.abs(diff)) + (pct != null ? ' (' + (diff >= 0 ? '+' : '−') + Math.abs(pct).toFixed(1) + '%)' : ''));
        if (pv.derived) span.title = 'Previous inferred from this employer’s prior raise';
        td.appendChild(span); return td; } };
    case 'gap': return { label: 'At this pay', key: 'gap', num: true, value: r => raiseDurationDays(store, r).days, cell: r => {
        const td = el('td', 'num'); const d = raiseDurationDays(store, r);
        td.textContent = d.days + ' days' + (d.ongoing ? ' · counting' : '');
        td.title = d.ongoing ? 'Still at this pay — counting up until the next raise' : 'How long this pay level lasted before the next raise';
        return td; } };
    case 'notes': return { label: 'Notes', key: 'notes', value: r => r.notes || '', cell: r => { const td = el('td', 'muted'); td.textContent = r.notes || '—'; return td; } };
  }
  return null;
}
// US CPI-U annual average inflation, % (2025 preliminary) — for comparing raises.
const INFLATION_CPI = { 2010: 1.6, 2011: 3.2, 2012: 2.1, 2013: 1.5, 2014: 1.6, 2015: 0.1, 2016: 1.3, 2017: 2.1, 2018: 2.4, 2019: 1.8, 2020: 1.2, 2021: 4.7, 2022: 8.0, 2023: 4.1, 2024: 2.9, 2025: 2.7 };
const RAISES_CSV_HEADERS = ['Employer', 'Position title', 'Employment type', 'Date', 'Amounts are', 'New gross', 'New net', 'Previous gross', 'Standalone', 'Notes'];
const RAISES_TEMPLATE_CSV = RAISES_CSV_HEADERS.join(',') + '\n'
  + 'Main Job,Support Tech,Full-time,2025-04-04,Per paycheck,2100.00,1650.00,2000.00,Annual review\n'
  + 'Main Job,Senior Support Tech,Full-time,2026-04-03,Annual salary,62000.00,47000.00,56000.00,Promotion with title change\n'
  + 'Weekend Gig,Crew Lead,Part-time,2026-05-10,Hourly rate,19.50,16.25,17.00,Hourly bump\n';
function exportRaisesCSV(store) {
  const rows = [RAISES_CSV_HEADERS.join(',')];
  store.state.raises.forEach(r => rows.push([r.employer, r.title, r.empType, r.date, r.basis === 'annual' ? 'Annual salary' : r.basis === 'hourly' ? 'Hourly rate' : 'Per paycheck', r.amount, r.net, r.prevAmount, r.noPrev ? 'Yes' : '', r.notes].map(csvEsc).join(',')));
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
    store.saveRaise({ employer, title: g(r, 'Position title') || g(r, 'Position') || g(r, 'Title'), empType: g(r, 'Employment type') || g(r, 'Employment'), date, basis, amount, net: isNaN(net) ? null : net, prevAmount: isNaN(prev) ? null : prev, noPrev: /^y|^true/i.test(g(r, 'Standalone')), notes: g(r, 'Notes') });
    added++;
  });
  toast('Imported ' + added + ' raise' + (added === 1 ? '' : 's') + (skipped ? ' · ' + skipped + ' skipped' : ''));
}
// Employer profile: tenure, totals paid, hours, hourly, raise history summary.
function employerProfileCard(store, emp) {
  const sch = store.state.paySchedules.find(x => (x.employer || '').toLowerCase() === emp.toLowerCase());
  let gross = 0, net = 0, regChecks = 0, firstPay = '', lastPay = '';
  Object.keys(store.state.years).forEach(yk => (store.state.years[yk].paychecks || []).forEach(pc => {
    if ((pc.employer || '').toLowerCase() !== emp.toLowerCase() || !isPaycheckPaid(pc)) return;
    gross += Number(pc.gross) || 0; net += paycheckNet(pc);
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
  row('Total paid (gross)', money(gross), 'net ' + money(net));
  row('Regular checks', String(regChecks), '');
  if (sch && sch.hoursPerCheck) {
    row('Total hours (est.)', (regChecks * Number(sch.hoursPerCheck)).toLocaleString('en-US'), '@ ' + sch.hoursPerCheck + ' hrs/check');
    if (sch.gross) row('Hourly now', money(Number(sch.gross) / Number(sch.hoursPerCheck)) + '/hr gross', sch.net ? money(Number(sch.net) / Number(sch.hoursPerCheck)) + '/hr net' : '');
  }
  if (raises.length) {
    const last = raises[raises.length - 1];
    const titled = raises.filter(x => (x.title || '').trim());
    if (titled.length) row('Position', titled[titled.length - 1].title, 'as of ' + fmtDate(titled[titled.length - 1].date));
    const typed = raises.filter(x => (x.empType || '').trim());
    if (typed.length) row('Employment type', typed[typed.length - 1].empType, 'as of ' + fmtDate(typed[typed.length - 1].date));
    row('Raises recorded', String(raises.length), 'last ' + fmtDate(last.date));
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
const RYOY_COL_LABELS = { date: 'Date', amount: 'New gross', pct: 'Raise %', inflation: 'Inflation that year', real: 'Real (vs inflation)' };
const RYOY_ALL_COLS = ['date', 'amount', 'pct', 'inflation', 'real'];
function buildRaiseYoYCol(key) {
  const pctCell = (v, titles) => { const td = el('td', 'num'); if (v == null) { td.textContent = '—'; return td; } const sp = el('span', v >= 0 ? 'pos' : 'neg', (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '%'); if (titles) td.title = v >= 0 ? titles[0] : titles[1]; td.appendChild(sp); return td; };
  switch (key) {
    case 'date': return { label: 'Date', key: 'date', value: x => x.date || '', cell: x => el('td', null, fmtDate(x.date)) };
    case 'amount': return { label: 'New gross', key: 'amount', num: true, value: x => Number(x.amount) || 0, cell: x => { const td = numCell(Number(x.amount) || 0, true); td.appendChild(el('span', 'muted', raiseSuf(x))); return td; } };
    case 'pct': return { label: 'Raise %', key: 'pct', num: true, value: x => x.pct == null ? -1e9 : x.pct, cell: x => pctCell(x.pct) };
    case 'inflation': return { label: 'Inflation that year', key: 'inflation', num: true, value: x => x.infl == null ? -1e9 : x.infl, cell: x => el('td', 'num', x.infl != null ? x.infl.toFixed(1) + '%' : '—') };
    case 'real': return { label: 'Real (vs inflation)', key: 'real', num: true, value: x => x.real == null ? -1e9 : x.real, cell: x => pctCell(x.real, ['Beat inflation', 'Behind inflation']) };
  }
  return null;
}
function raiseYoYCard(store, emp) {
  const raises = store.state.raises.filter(r => (r.employer || '').toLowerCase() === emp.toLowerCase() && r.amount != null).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (raises.length < 3) return null;
  const card = el('div', 'card');
  const yh = el('div', 'view-head');
  yh.appendChild(el('h3', 'strip-title', 'YoY raises vs inflation · ' + emp));
  yh.appendChild(columnsButton('raiseYoY', RYOY_ALL_COLS, RYOY_ALL_COLS, RYOY_COL_LABELS, 'YoY raise columns'));
  card.appendChild(yh);
  // Precompute the chain: each raise's % over the prior one (same basis, and
  // not across a raise marked standalone), inflation for its calendar year,
  // and the real (inflation-adjusted) %.
  const rows = raises.map((r, i) => {
    const prior = i > 0 && !r.noPrev && (raises[i - 1].basis || 'check') === (r.basis || 'check') ? Number(raises[i - 1].amount) : null;
    const prev = (r.prevAmount != null && r.prevAmount !== '') ? Number(r.prevAmount) : prior;
    const pct = (prev && prev > 0) ? (Number(r.amount) - prev) / prev * 100 : null;
    const infl = INFLATION_CPI[+String(r.date || '').slice(0, 4)];
    return { date: r.date, amount: r.amount, basis: r.basis, pct, infl: infl != null ? infl : null, real: (pct != null && infl != null) ? pct - infl : null };
  });
  const cols = tableColKeys(store, 'raiseYoY', RYOY_COL_LABELS, RYOY_ALL_COLS).map(k => buildRaiseYoYCol(k)).filter(Boolean);
  const wrap = el('div', 'table-scroll');
  wrap.appendChild(sortableTable(cols, rows, raiseYoYSort, ns => { raiseYoYSort = ns || { key: 'date', dir: 'asc' }; renderView(currentRoute); }, null));
  card.appendChild(wrap);
  card.appendChild(el('div', 'sum-hint', 'Inflation = US CPI-U annual average for the raise’s calendar year (2025 preliminary). “Real” = raise % minus inflation.'));
  return card;
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
  const add = el('button', 'btn-primary', '+ Add raise'); add.addEventListener('click', () => raiseModal(null));
  actions.appendChild(add);
  head.appendChild(actions);
  view.appendChild(head);

  if (!s.raises.length) {
    view.appendChild(emptyState('No raises recorded yet', 'Add raises by hand, or use “Detect from paychecks” to find where your gross per check changed.', '+ Add raise', () => raiseModal(null)));
    return;
  }

  // Per-employer "days since last raise" — ongoing while still employed (active
  // schedule or a paycheck in the last 45 days), else counted to the last check.
  const byEmp = {};
  s.raises.forEach(r => { const k = (r.employer || '').toLowerCase(); if (!byEmp[k] || (r.date || '') > (byEmp[k].date || '')) byEmp[k] = r; });
  const sum = el('div', 'sub-summary');
  Object.values(byEmp).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 4).forEach(r => {
    const emp = r.employer || '—';
    const lastPay = lastPaycheckDateFor(store, emp);
    const employed = activeSchedules(store).some(sch => (sch.employer || '').toLowerCase() === emp.toLowerCase())
      || (lastPay && daysBetweenISO(todayISO(), lastPay) <= 45);
    const days = employed ? daysBetweenISO(todayISO(), r.date) : (lastPay ? Math.max(0, daysBetweenISO(lastPay, r.date)) : null);
    sum.appendChild(sumCard(emp, days == null ? '—' : (days + 'd'), 'neutral',
      'since last raise (' + fmtDate(r.date) + ')' + (employed ? ' · counting' : ' · through last paycheck')));
  });
  view.appendChild(sum);

  // Employer profiles (tenure, totals, hours/hourly) + YoY-vs-inflation analysis.
  const profEmps = [...new Set(s.raises.map(r => (r.employer || '').trim()).filter(Boolean))];
  const profGrid = el('div', 'dash-cols');
  profEmps.slice(0, 4).forEach(emp => profGrid.appendChild(employerProfileCard(store, emp)));
  if (profEmps.length) view.appendChild(profGrid);
  profEmps.forEach(emp => { const yoy = raiseYoYCard(store, emp); if (yoy) view.appendChild(yoy); });

  const cols = [
    ...tableColKeys(store, 'raises', RAISE_COL_LABELS, RAISE_DEFAULT_COLS).map(k => buildRaiseCol(store, k)).filter(Boolean),
    { label: '', sortable: false, cell: r => {
        const td = el('td', 'row-actions');
        const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => raiseModal(r));
        const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove((r.employer || 'raise') + ' · ' + fmtDate(r.date), () => store.removeRaise(r.id)));
        td.appendChild(edit); td.appendChild(del); return td; } }
  ];
  view.appendChild(tableTools(columnsButton('raises', RAISE_ALL_COLS, RAISE_DEFAULT_COLS, RAISE_COL_LABELS, 'Raise columns')));
  const card = el('div', 'card table-card');
  card.appendChild(sortableTable(cols, s.raises, raisesSort, ns => { raisesSort = ns || { key: 'date', dir: 'desc' }; renderView(currentRoute); }, null));
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
  const fAmt = input(r.amount != null ? r.amount : '', { type: 'number', placeholder: '0.00' }); fAmt.step = '0.01';
  const fNet = input(r.net != null ? r.net : '', { type: 'number', placeholder: '0.00' }); fNet.step = '0.01';
  const fPrev = input(r.prevAmount != null ? r.prevAmount : '', { type: 'number', placeholder: '0.00' }); fPrev.step = '0.01';
  const cNoPrev = checkbox('Doesn’t follow the prior raise', r.noPrev, 'Normally, when Previous is left blank, Clover infers it from this employer’s prior recorded raise. Tick this when that comparison doesn’t apply — e.g. a different role or pay structure.');
  const fNotes = document.createElement('textarea'); fNotes.value = r.notes || ''; fNotes.rows = 2; fNotes.placeholder = 'Optional — promotion, annual review, etc.';
  body.appendChild(field('Employer', fEmp, 'Which job the raise is from — matches your paycheck employer names.'));
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
  const syncBasis = () => {
    const b = fBasis.value;
    amtLbl.nodeValue = b === 'annual' ? 'New annual gross salary' : b === 'hourly' ? 'New hourly rate (gross)' : 'New gross per check';
    netLbl.nodeValue = b === 'annual' ? 'New annual net (optional)' : b === 'hourly' ? 'New hourly net (optional)' : 'New net per check (optional)';
  };
  fBasis.addEventListener('change', syncBasis); syncBasis();
  body.appendChild(field('Notes', fNotes, 'Anything worth remembering — promotion, title change, merit increase.'));
  openModal({
    title: existing ? 'Edit raise' : 'Add raise', body, confirmLabel: 'Save',
    onConfirm: () => {
      if (!fEmp.value.trim()) { fEmp.focus(); toast('Employer is required', 'warn'); return false; }
      const amount = parseFloat(fAmt.value);
      if (isNaN(amount)) { fAmt.focus(); toast('New gross amount is required', 'warn'); return false; }
      store.saveRaise(Object.assign(r, {
        employer: fEmp.value.trim(), title: fTitle.value.trim(), empType: fEmpType.value, date: fDate.value || todayISO(),
        basis: fBasis.value, amount, net: fNet.value === '' ? null : parseFloat(fNet.value),
        prevAmount: fPrev.value === '' ? null : parseFloat(fPrev.value), noPrev: cNoPrev.__input.checked, notes: fNotes.value.trim()
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

function renderCreditTab(view) {
  const store = window.cloverStore, s = store.state;
  const allRows = s.creditScores.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!allRows.length) { view.appendChild(emptyState('No credit scores yet', 'Log your scores over time to chart them by provider (Credit Karma, Chase, Amex, etc.).', '+ Add score', () => creditScoreModal(null))); return; }

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

function renderRatesTab(view) {
  const store = window.cloverStore, s = store.state;
  const allRows = s.rateHistory.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!allRows.length) { view.appendChild(emptyState('No savings rates yet', 'Log a bank’s APY over time to compare how each institution’s rate moves.', '+ Add rate', () => rateModal(null))); return; }

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
  view.appendChild(tableTools(columnsButton('rates', RATES_ALL_COLS, RATES_ALL_COLS, RATES_COL_LABELS, 'Savings rate columns')));
  const card = el('div', 'card table-card'); card.appendChild(sortableTable(cols, s.rateHistory, rateSort, ns => { rateSort = ns || { key: 'date', dir: 'desc' }; renderView(currentRoute); }, null)); view.appendChild(card);
}

function creditScoreModal(existing) {
  const store = window.cloverStore, s = store.state;
  const r = existing ? Object.assign({}, existing) : { date: todayISO() };
  const body = el('div', 'form-grid');
  const provList = el('datalist'); provList.id = 'prov-list';
  [...new Set(COMMON_PROVIDERS.concat(s.creditScores.map(x => x.provider).filter(Boolean)))].forEach(p => { const o = el('option'); o.value = p; provList.appendChild(o); });
  body.appendChild(provList);

  const fDate = input(r.date || todayISO(), { type: 'date' });
  const fScore = input(r.score != null ? r.score : '', { type: 'number', placeholder: '300–850' }); fScore.min = 300; fScore.max = 900;
  const fProv = input(r.provider || '', { placeholder: 'e.g. Credit Karma', list: 'prov-list' });
  body.appendChild(field('Date', fDate, 'When this score was reported.'));
  body.appendChild(field('Score', fScore, 'The credit score number (usually 300–850).'));
  body.appendChild(field('Provider', fProv, 'Who reported it — Credit Karma, Chase, Amex, a bureau, etc. Charted as its own line.'));

  openModal({
    title: existing ? 'Edit score' : 'Add score', body, confirmLabel: 'Save',
    onConfirm: () => {
      const score = parseInt(fScore.value, 10);
      if (isNaN(score)) { fScore.focus(); toast('Score is required', 'warn'); return false; }
      store.saveCreditScore(Object.assign(r, { date: fDate.value || todayISO(), score, provider: fProv.value.trim() }));
      toast(existing ? 'Score updated' : 'Score added');
    }
  });
}

function rateModal(existing) {
  const store = window.cloverStore, s = store.state;
  const r = existing ? Object.assign({}, existing) : { date: todayISO() };
  const body = el('div', 'form-grid');
  const instList = el('datalist'); instList.id = 'rate-inst-list';
  s.catalog.institutions.slice().sort((a, b) => a.name.localeCompare(b.name))
    .forEach(i => { const o = el('option'); o.value = i.name; instList.appendChild(o); });
  body.appendChild(instList);

  const fDate = input(r.date || todayISO(), { type: 'date' });
  const fInst = input(rateInstitution(store, r), { placeholder: 'e.g. Ally', list: 'rate-inst-list' });
  const fApy = input(r.apy != null ? r.apy : '', { type: 'number', placeholder: 'e.g. 3.75' }); fApy.step = '0.01';
  body.appendChild(field('Date', fDate, 'When this rate was in effect.'));
  body.appendChild(field('Bank / institution', fInst, 'Which bank the APY is for (e.g. Ally, Synchrony). Rates are tracked per institution and each is charted as its own line. Pick from the list or type your own; manage the list in Settings.'));
  body.appendChild(field('APY %', fApy, 'The annual percentage yield at that date.'));

  openModal({
    title: existing ? 'Edit rate' : 'Add rate', body, confirmLabel: 'Save',
    onConfirm: () => {
      const inst = fInst.value.trim();
      if (!inst) { fInst.focus(); toast('Enter a bank / institution', 'warn'); return false; }
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
function expenseByCategory(store, data) {
  const m = {};
  data.expensePayments.forEach(e => { const g = store.expenseGroupName(e.categoryId); m[g] = (m[g] || 0) + expenseAmount(e); });
  return m;
}
function donutCard(map) {
  const card = el('div', 'card');
  const entries = Object.entries(map).filter(([k, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) { card.appendChild(el('div', 'muted', 'No data yet.')); return card; }
  const total = entries.reduce((a, e) => a + e[1], 0);
  const wrap = el('div', 'donut-wrap'); const cv = document.createElement('canvas'); wrap.appendChild(cv); card.appendChild(wrap);
  buildDoughnut(cv, { labels: entries.map(e => e[0] + ' · ' + (total > 0 ? (e[1] / total * 100).toFixed(1) : '0.0') + '%'), data: entries.map(e => e[1]) });
  return card;
}
function buildWarnings(store, data, s) {
  const warn = s.settings.warnWindows || [7, 14, 30, 60];
  const maxW = Math.max.apply(null, warn);
  const renewSoon = s.recurring.filter(isSubActive).map(r => ({ r, d: daysUntil(nextRenewalDate(r)) })).filter(x => x.d != null && x.d >= 0 && x.d <= maxW).sort((a, b) => a.d - b.d);
  const overdue = data.paychecks.filter(p => !isPaycheckPaid(p) && p.status !== 'Bounced/Returned' && (p.status === 'Late' || p.status === 'Missing' || (p.payDate && daysUntil(p.payDate) < 0)));
  if (!renewSoon.length && !overdue.length) return null;
  const strip = el('div', 'card warn-strip');
  const list = el('div', 'warn-list');
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
const DASH_PANEL_DEFS = [
  { key: 'kpis', title: 'Key numbers', span2: true, build: ctx => dashKpisBody(ctx) },
  { key: 'warnings', title: '⚠ Attention', span2: true, build: ctx => buildWarnings(ctx.store, ctx.data, ctx.s) || el('div', 'card muted', 'Nothing needs attention right now.') },
  { key: 'incomeMix', title: 'Income mix (YTD)', span2: true, build: ctx => dashIncomeMixBody(ctx) },
  { key: 'incomeDonut', title: 'Income by category (YTD)', build: ctx => donutCard(incomeByCategory(ctx.store, ctx.data)) },
  { key: 'expenseDonut', title: 'Expenses by category (YTD)', build: ctx => donutCard(expenseByCategory(ctx.store, ctx.data)) },
  { key: 'renewals', title: 'Upcoming renewals', build: ctx => upcomingRenewalsCard(ctx.store, ctx.s) },
  { key: 'activity', title: 'Recent activity', build: ctx => recentActivityCard(ctx.store, ctx.data) },
  { key: 'taxes', title: 'Taxes', build: ctx => dashTaxesBody(ctx) },
  { key: 'bestCard', title: '💳 Best card to use today', build: ctx => bestCardCallout(ctx.store) || el('div', 'card muted', 'Add credit cards with statement close + due days (on the Accounts page) to see which card gives a purchase the longest float.') },
  { key: 'projIncome', title: '📈 Projected annual income', build: ctx => {
      const wrap = el('div', 'sub-summary');
      const me = ctx.monthsElapsed > 0 ? ctx.monthsElapsed : 1;
      const avgG = ctx.incYTD / me, avgN = ctx.netYTD / me;
      wrap.appendChild(kpiCard('Projected gross / yr', money(avgG * 12), 'income', 'avg ' + money(avgG) + ' / mo so far × 12'));
      wrap.appendChild(kpiCard('Projected net / yr', money(avgN * 12), 'income', 'avg ' + money(avgN) + ' / mo take-home × 12'));
      return wrap;
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
      .map(p => ({ k: p.k, c: !!p.c, w: (p.w === 1 || p.w === 2) ? p.w : 0, off: p.off ? 1 : 0 }));
    // Panels shipped after this layout was saved won't be in it — surface
    // them at the end instead of hiding them forever. Removing a panel keeps
    // an off-flagged entry, so deliberate removals stay removed.
    defs.forEach(d => { if (!entries.some(p => p.k === d.key)) entries.push({ k: d.key, c: false, w: 0, off: 0 }); });
    return entries;
  }
  return defs.map(d => ({ k: d.key, c: false, w: 0, off: 0 }));
}
function dashPanelState(store) { return pagePanelState(store, 'dashboard', DASH_PANEL_DEFS); }
function dashKpisBody(ctx) {
  const kpis = el('div', 'sub-summary');
  kpis.appendChild(kpiCard('Income · ' + ctx.monthName, money(ctx.incThisMonth), 'income'));
  kpis.appendChild(kpiCard('Spending · ' + ctx.monthName, money(ctx.spendThisMonth), 'expense'));
  kpis.appendChild(kpiCard('Recurring / mo', money(ctx.recurringMonthly), 'expense', money(ctx.recurringAnnual) + ' / yr'));
  kpis.appendChild(kpiCard('Net · ' + ctx.monthName, money(ctx.netThisMonth), ctx.netThisMonth < 0 ? 'expense' : 'income', 'take-home − spend − bills'));
  kpis.appendChild(kpiCard('Should be left / mo', money(ctx.shouldLeft), ctx.shouldLeft < 0 ? 'expense' : 'income', 'avg take-home − bills − avg spend'));
  kpis.appendChild(kpiCard('Projected income', money(ctx.projAnnualIncome), 'income', 'annualized from YTD'));
  kpis.appendChild(kpiCard('Projected expenses', money(ctx.projAnnualExpense), 'expense', 'subs + annualized spend'));
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
  const width = entry.w || (def.span2 ? 2 : 1);   // snap widths: 1 = half, 2 = full
  const panel = el('div', 'dash-panel' + (width === 2 ? ' span2' : ''));
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
    const wBtn = el('button', 'dph-x dph-w', width === 2 ? '⇥ Half' : '⇤ Full');
    wBtn.title = 'Snap this panel to ' + (width === 2 ? 'half' : 'full') + ' width';
    wBtn.addEventListener('click', ev => { ev.stopPropagation(); entry.w = width === 2 ? 1 : 2; save(state); });
    head.appendChild(wBtn);
    const x = el('button', 'dph-x', '✕'); x.title = 'Remove this panel';
    x.addEventListener('click', ev => { ev.stopPropagation(); entry.off = 1; save(state); });
    head.appendChild(x);
  }
  head.addEventListener('click', () => { entry.c = !entry.c; save(state); });
  panel.appendChild(head);
  if (!entry.c) { const body = el('div', 'dash-panel-body'); body.appendChild(def.build(ctx)); panel.appendChild(body); }
  return panel;
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
  left.appendChild(el('p', 'muted', monthName + ' ' + activeYear + ' snapshot'));
  head.appendChild(left);
  const lockBtn = el('button', 'btn-ghost', dashUnlocked ? '✓ Done editing' : '✎ Edit layout');
  lockBtn.title = dashUnlocked ? 'Lock the layout' : 'Unlock to reorder, remove, or add panels';
  lockBtn.addEventListener('click', () => { dashUnlocked = !dashUnlocked; renderView(currentRoute); });
  head.appendChild(lockBtn);
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
  buildDoughnut(cv, { labels: entries.map(e => e[0]), data: entries.map(e => e[1]) });
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
function expenseByCategoryFull(store, data) {
  const m = {};
  data.expensePayments.forEach(e => { const g = store.expenseGroupName(e.categoryId); m[g] = (m[g] || 0) + expenseAmount(e); });
  if (recurringAppliesTo(activeYear)) store.state.expenseCategories.forEach(cat => { const rec = recurringMonthsForCategory(store, cat.id, data.expensePayments).reduce((a, b) => a + b, 0); if (rec > 0) m[cat.name] = (m[cat.name] || 0) + rec; });
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
  const fFedAmt = input(r.fedAmount != null ? r.fedAmount : '', { type: 'number', placeholder: '0.00' }); fFedAmt.step = '0.01';
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
  const fStAmt = input(r.stateAmount != null ? r.stateAmount : '', { type: 'number', placeholder: '0.00' }); fStAmt.step = '0.01';
  const fFiled = input(r.filedDate || '', { type: 'date' });
  const cExt = checkbox('Filed an extension', !!r.extended, 'You filed for an extension this year (e.g. Form 4868), moving the filing deadline out.');
  const fCpa = input(r.preparer || '', { placeholder: 'CPA / preparer, or “Self”', list: 'cpa-list' });
  const fCost = input(r.prepCost != null ? r.prepCost : '', { type: 'number', placeholder: '0.00' }); fCost.step = '0.01';
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
      const fAmt = input(fc.cost != null ? fc.cost : '', { type: 'number', placeholder: '0.00' }); fAmt.step = '0.01';
      fAmt.addEventListener('input', () => { fc.cost = fAmt.value === '' ? null : parseFloat(fAmt.value); });
      const x = el('button', 'icon-btn danger', '✕'); x.title = 'Remove this form cost';
      x.addEventListener('click', () => { formCosts.splice(i, 1); renderFC(); });
      row.appendChild(fForm); row.appendChild(fAmt); row.appendChild(x);
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
    body, confirmLabel: 'Save',
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
  lockBtn.title = reportsUnlocked ? 'Lock the layout' : 'Unlock to reorder, remove, or add report panels';
  lockBtn.addEventListener('click', () => { reportsUnlocked = !reportsUnlocked; renderView(currentRoute); });
  head.appendChild(lockBtn);
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
  (yd.paychecks || []).forEach(p => { const d = dateInMonth(p.payDate, year, month); if (d) events.push({ day: d, type: 'Paycheck', label: (p.employer || 'Paycheck') + ' · ' + money(Number(p.gross) || 0), tone: 'green' }); });
  store.state.recurring.filter(isSubActive).forEach(r => { renewalDaysInMonth(r, year, month).forEach(d => events.push({ day: d, type: 'Bill', label: r.name + (r.frequency === 'once' ? ' due · ' : ' renews · ') + money(Number(r.amount) || 0), tone: 'amber' })); });
  store.state.accounts.filter(a => a.type === 'CD' && a.cdMaturity).forEach(a => {
    const name = a.name + (a.last4 ? ' ••' + a.last4 : '');
    const d = dateInMonth(a.cdMaturity, year, month);
    if (d) events.push({ day: d, type: 'CD matures', label: name + ' matures', tone: 'blue' });
    // Heads-up a week ahead — time to decide on rollover vs. withdrawal
    // before the bank's auto-renew window closes.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(a.cdMaturity);
    if (m) {
      const r = addDays(new Date(+m[1], +m[2] - 1, +m[3]), -7);
      if (r.getFullYear() === year && r.getMonth() === month)
        events.push({ day: r.getDate(), type: 'CD reminder', label: name + ' matures in 7 days (' + fmtDate(a.cdMaturity) + ')', tone: 'amber' });
    }
  });
  return events;
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
  left.appendChild(el('p', 'muted', 'Paychecks, bill renewals, and CD maturities'));
  head.appendChild(left);
  const nav = el('div', 'head-actions');
  const prev = el('button', 'btn-ghost', '‹'); prev.addEventListener('click', () => calShift(-1));
  const lbl = el('span', 'cal-month', MONTH_NAMES[month] + ' ' + year);
  const next = el('button', 'btn-ghost', '›'); next.addEventListener('click', () => calShift(1));
  const today = el('button', 'btn-ghost', 'Today'); today.addEventListener('click', () => { const t = new Date(); calCursor = { year: t.getFullYear(), month: t.getMonth() }; renderView(currentRoute); });
  nav.appendChild(prev); nav.appendChild(lbl); nav.appendChild(next); nav.appendChild(today);
  head.appendChild(nav);
  view.appendChild(head);

  const events = calendarEvents(store, year, month);
  view.appendChild(calendarGrid(year, month, events));
  view.appendChild(calendarAgenda(events, month));
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
      dayEvents.slice(0, 3).forEach(e => { const chip = el('div', 'cal-event ' + e.tone, e.label); chip.title = e.label; cell.appendChild(chip); });
      if (dayEvents.length > 3) cell.appendChild(el('div', 'cal-more', '+' + (dayEvents.length - 3) + ' more'));
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
    { label: 'Beneficiaries', get: r => r.beneficiaries }
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
    { key: 'date', label: 'Date', req: true, kw: ['date'] },
    { key: 'amount', label: 'Amount', req: true, num: true, kw: ['amount', 'paid', 'cost', 'total'] },
    { key: 'category', label: 'Category', kw: ['category', 'reason', 'type', 'description'] },
    { key: 'account', label: 'Account', kw: ['account', 'card', 'method'] },
    { key: 'person', label: 'Person', kw: ['person', 'owner'] },
    { key: 'notes', label: 'Notes', kw: ['note', 'memo', 'description'] }
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
  ]
};
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
  const existingArr = target === 'income' ? yd.income : target === 'expenses' ? yd.expensePayments : target === 'paychecks' ? yd.paychecks : store.state.recurring;
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
      else if (target === 'expenses') e = { date, amount: amt, categoryId: matchCategory(store, 'expense', g('category'), fallbackCat), subId: '', accountId: matchAccount(store, g('account')), personId: matchPerson(store, g('person')), notes: g('notes') };
      else e = {
        payDate: date, gross: amt, net: g('net') ? parseImportAmount(g('net')) : null,
        receivedDate: parseImportDate(g('receivedDate')), employer: String(g('employer')).trim(),
        incomeCategoryId: fallbackCat, personId: matchPerson(store, g('person')),
        periodNum: g('periodNum') ? (parseInt(String(g('periodNum')).replace(/[^\d]/g, ''), 10) || null) : null,
        periodStart: parseImportDate(g('periodStart')), periodEnd: parseImportDate(g('periodEnd')),
        status: normalizePaycheckStatus(g('status')), method: normalizePayMethod(g('method')), notes: g('notes')
      };
    }
    if (existing.has(dupKey(target, e))) { dupes++; return; }
    entries.push(e);
  });
  return { entries, dupes, skipped };
}
function dupKey(target, e) {
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
  const acctSel = attnWhenEmpty(select(accountOptions(s, '— no account —'), st.accountId));
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
    const iAcctSel = attnWhenEmpty(select(accountOptions(s, '— no account —'), st.intAccountId || ''));
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
    if (st.includeFees && st.feeCat) st.fees.forEach(f => {
      const yr = +f.date.slice(0, 4);
      (feeByYear[yr] = feeByYear[yr] || []).push({ date: f.date, amount: f.amount, categoryId: st.feeCat, subId: '', accountId: st.accountId || '', personId: me, notes: ((f.symbol ? f.symbol + ' — ' : '') + f.desc).trim() });
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
  const fOrder = input(r.orderPrice != null ? r.orderPrice : '', { type: 'number', placeholder: '0.00' }); fOrder.step = '0.01';
  const fEarn = input(r.earnings != null ? r.earnings : '', { type: 'number', placeholder: '0.00' }); fEarn.step = '0.01';
  const fCost = input(r.costPrice != null ? r.costPrice : '', { type: 'number', placeholder: '0.00' }); fCost.step = '0.01';
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
    title: 'Edit sale', body, confirmLabel: 'Save',
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
    const tSel = select([{ value: 'income', label: 'Income' }, { value: 'expenses', label: 'Expenses' }, { value: 'paychecks', label: 'Paychecks' }, { value: 'subscriptions', label: 'Bills & Subscriptions' }, { value: 'dividends', label: 'Dividends (broker activity)' }, { value: 'selling', label: 'Poshmark sales' }], importState.target);
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

  // fallback category
  const kind = (importState.target === 'expenses' || importState.target === 'subscriptions') ? 'expense' : 'income';
  const cats = kind === 'expense' ? store.state.expenseCategories : store.state.incomeCategories;
  const fbSel = select([{ value: '', label: '— none —' }].concat(cats.map(c => ({ value: c.id, label: c.name }))), importState.fallbackCat);
  fbSel.addEventListener('change', () => { importState.fallbackCat = fbSel.value; renderView(currentRoute); });
  card.appendChild(field(importState.target === 'paychecks' ? 'Income category for these paychecks' : 'Category for unmatched rows', fbSel, 'Rows whose category text doesn’t match one of your categories go here.'));

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
    if (target === 'subscriptions') {
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
