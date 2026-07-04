// ============================================================
// Clover — app shell & routing
// Auth gate, sidebar nav, hash routing, period selectors, and
// (Phase 1) the Settings + Accounts feature views. Remaining
// sections render navigable placeholders until their phase.
// ============================================================

const VERSION = '1.0.5';

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
  { id: 'expenses',      label: 'Expenses',       ico: '▼', phase: 3 },
  { id: 'subscriptions', label: 'Bills & Subscriptions', ico: '↻', phase: 3 },
  { id: 'accounts',      label: 'Accounts',       ico: '▦', phase: 1 },
  { sep: true },
  { id: 'credit',        label: 'Credit & Rates', ico: '％', phase: 5 },
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
let incomeCatFilter = 'all';
let accountsSort = { key: 'name', dir: 'asc' };
let subsSort = { key: 'monthly', dir: 'desc' };
let subsCatFilter = 'all';
let subsStatusFilter = 'active';   // 'active' | 'all'
let expenseTab = 'grid';           // 'grid' | 'list'
let expenseCatFilter = 'all';
let expenseIncludeRecurring = true;  // roll active bills into the expense grid
let paycheckSort = { key: 'payDate', dir: 'desc' };
let paycheckStatusFilter = 'all';
let paycheckSel = new Set();       // selected paycheck ids for bulk edit
let paycheckSelYear = null;
let creditTab = 'credit';   // 'credit' | 'rates'
const expandedIncomeGroups = new Set();
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
  window.cloverStore.subscribe(() => { storeReady = window.cloverStore.isLoaded(); if (currentRoute) renderView(currentRoute); });
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
const LIVE_VIEWS = { dashboard: renderDashboard, settings: renderSettings, accounts: renderAccounts, income: renderIncome, subscriptions: renderSubscriptions, expenses: renderExpenses, paychecks: renderPaychecks, credit: renderCredit, reports: renderReports, calendar: renderCalendar, import: renderImport };
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
function buildPeriodSelectors() {
  const ySel = document.getElementById('sel-year');
  const mSel = document.getElementById('sel-month');
  const now = new Date();
  const thisYear = now.getFullYear();
  for (let y = thisYear + 1; y >= 2020; y--) {
    const o = document.createElement('option'); o.value = y; o.textContent = y;
    if (y === thisYear) o.selected = true; ySel.appendChild(o);
  }
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
  for (let y = cur + 1; y >= 2020; y--) { if (!store.isYearLoaded(y)) { allLoaded = false; store.loadYear(y); } }
  if (allLoaded) _yearsScanned = true;
}
// A row of year tabs for a per-year section, shown only when >1 year has data.
function yearTabs(store, section) {
  ensureYearsScanned(store);
  const cur = new Date().getFullYear();
  const years = [];
  for (let y = cur + 1; y >= 2020; y--) {
    if (!store.isYearLoaded(y)) continue;
    const d = store.yearData(y);
    const has = section === 'income' ? (d.income.length || d.paychecks.length)
      : section === 'expenses' ? d.expensePayments.length
      : d.paychecks.length;
    if (has) years.push(y);
  }
  if (!years.includes(activeYear)) years.push(activeYear);
  years.sort((a, b) => b - a);
  if (years.length < 2) return null;
  const strip = el('div', 'year-tabs');
  years.forEach(y => {
    const b = el('button', 'ytab' + (y === activeYear ? ' active' : ''), String(y));
    b.addEventListener('click', () => setActiveYear(y));
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
      th.addEventListener('click', () => onSort({ key: c.key, dir: (active && sort.dir === 'asc') ? 'desc' : 'asc' }));
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
  grid.appendChild(accountDefaultsCard());
  view.appendChild(grid);
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
function renderAccounts(view) {
  const store = window.cloverStore, s = store.state;
  const head = el('div', 'view-head');
  const left = el('div'); left.appendChild(el('h3', null, 'Accounts'));
  left.appendChild(el('p', 'muted', s.accounts.length + ' account' + (s.accounts.length === 1 ? '' : 's')));
  head.appendChild(left);
  const add = el('button', 'btn-primary', '+ Add account'); add.addEventListener('click', () => accountModal(null));
  head.appendChild(add);
  view.appendChild(head);

  if (!s.accounts.length) {
    view.appendChild(emptyState('No accounts yet',
      'Add your banks, cards, and brokerages so they can be linked to income and expenses.',
      '+ Add account', () => accountModal(null)));
    return;
  }

  const cols = [
    { label: 'Name', key: 'name', value: a => a.name, cell: a => {
        const td = el('td'); td.appendChild(el('div', 'acct-name', a.name));
        if (a.previousAccountId) {
          const prev = store.account(a.previousAccountId);
          const lbl = prev ? (prev.name + (prev.last4 ? ' ••' + prev.last4 : '')) : 'a previous account';
          td.appendChild(el('div', 'acct-sub', '↳ rollover of ' + lbl));
        }
        return td; } },
    { label: 'Institution', key: 'institution', value: a => a.institution || '', cell: a => el('td', null, a.institution || '—') },
    { label: 'Type', key: 'type', value: a => a.type || '', cell: a => { const td = el('td'); td.appendChild(badge(a.type || '—', 'type')); return td; } },
    { label: 'Last 4', key: 'last4', value: a => a.last4 || '', cell: a => el('td', null, a.last4 ? ('••' + a.last4) : '—') },
    { label: 'Owner', key: 'owner', value: a => store.personName(a.personId), cell: a => el('td', null, store.personName(a.personId)) },
    { label: 'Flags', sortable: false, cell: a => {
        const td = el('td'); const flags = el('div', 'flags');
        flags.appendChild(a.active === false ? badge('Inactive', 'red') : badge('Active', 'green'));
        if (store.successorOf(a.id)) flags.appendChild(badge('Rolled over'));
        if (a.usedForAutopay) flags.appendChild(badge('Auto-pay', 'amber'));
        if (a.rewardsCard) flags.appendChild(badge('Rewards', 'green'));
        const fl = ccFloatToday(a);
        if (fl != null) { const b = badge('~' + fl + 'd float'); b.title = 'Days until a purchase made today would be due'; flags.appendChild(b); }
        if (BENEFICIARY_TYPES.includes(a.type) && !(a.beneficiaries || '').trim()) flags.appendChild(badge('No beneficiary', 'amber'));
        td.appendChild(flags); return td; } },
    { label: '', sortable: false, cell: a => {
        const td = el('td', 'row-actions');
        const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => accountModal(a));
        const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove(a.name, () => store.removeAccount(a.id)));
        td.appendChild(edit); td.appendChild(del); return td; } }
  ];
  // "Best card to use today" — the active credit card whose purchase-today has the most float.
  const cardsWithFloat = s.accounts
    .filter(a => a.type === 'Credit Card' && a.active !== false && ccFloatToday(a) != null)
    .map(a => ({ a, float: ccFloatToday(a) }))
    .sort((x, y) => y.float - x.float);
  if (cardsWithFloat.length) {
    const best = cardsWithFloat[0];
    const cal = el('div', 'callout');
    cal.innerHTML = '💳 <strong>Best card to use today:</strong> ' + best.a.name +
      (best.a.last4 ? ' ••' + best.a.last4 : '') + ' — <strong>' + best.float + ' days</strong> until a purchase made today is due.';
    if (cardsWithFloat.length > 1) {
      const rest = cardsWithFloat.slice(1).map(c => c.a.name + ' (' + c.float + 'd)').join(', ');
      cal.appendChild(el('div', 'callout-sub', 'Others: ' + rest));
    }
    view.appendChild(cal);
  }

  const card = el('div', 'card table-card');
  card.appendChild(sortableTable(cols, s.accounts, accountsSort, ns => { accountsSort = ns; renderView(currentRoute); }, a => a.active === false ? 'inactive-row' : ''));
  view.appendChild(card);
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

function renderIncome(view) {
  const store = window.cloverStore;
  if (!store.isYearLoaded(activeYear)) { view.appendChild(loadingPanel()); store.loadYear(activeYear); return; }
  const data = store.yearData(activeYear);

  const head = el('div', 'view-head');
  const left = el('div');
  left.appendChild(el('h3', null, 'Income · ' + activeYear));
  const pcGross = data.paychecks.filter(isPaycheckPaid).reduce((s, p) => s + (Number(p.gross) || 0), 0);
  const received = data.income.filter(countable).reduce((s, e) => s + amountOf(e), 0) + pcGross;
  const n = data.income.length;
  left.appendChild(el('p', 'muted', money(received) + ' received · ' + n + ' entr' + (n === 1 ? 'y' : 'ies') + (pcGross ? ' + paychecks' : '')));
  head.appendChild(left);

  const right = el('div', 'head-actions');
  const tabs = el('div', 'tabs');
  [['grid', 'Annual grid'], ['list', 'List']].forEach(([t, label]) => {
    const b = el('button', 'tab' + (incomeTab === t ? ' active' : ''), label);
    b.addEventListener('click', () => { incomeTab = t; renderView(currentRoute); });
    tabs.appendChild(b);
  });
  right.appendChild(tabs);
  right.appendChild(importButton('income'));
  const add = el('button', 'btn-primary', '+ Add income'); add.addEventListener('click', () => incomeModal(null));
  right.appendChild(add);
  head.appendChild(right);
  view.appendChild(head);

  const yt = yearTabs(store, 'income'); if (yt) view.appendChild(yt);
  view.appendChild(incomeTab === 'grid' ? incomeGrid(data) : incomeList(data));
}

function incomeGrid(data) {
  const store = window.cloverStore, groups = store.state.incomeCategories;
  const entries = data.income.filter(countable);
  const card = el('div', 'card table-card');
  const table = el('table', 'data-table grid-table');
  table.innerHTML = '<thead><tr><th>Category</th>' + MONTHS.map(m => '<th class="num">' + m + '</th>').join('') + '<th class="num">YTD</th><th class="num">Avg</th></tr></thead>';
  const tb = el('tbody');
  const grand = new Array(12).fill(0);

  const monthsFor = list => { const m = new Array(12).fill(0); list.forEach(e => { const mi = monthIdx(e.date); if (mi >= 0) m[mi] += amountOf(e); }); return m; };
  const addRow = (cls, label, monthly, onClick, caret) => {
    const tr = el('tr', cls);
    const c0 = el('td', cls === 'sub-row' ? 'sub-name' : 'grp-name');
    if (caret != null) { c0.appendChild(el('span', 'caret', caret)); c0.appendChild(document.createTextNode(' ' + label)); }
    else c0.textContent = label;
    if (onClick) { c0.style.cursor = 'pointer'; c0.addEventListener('click', onClick); }
    tr.appendChild(c0);
    monthly.forEach(v => tr.appendChild(numCell(v)));
    tr.appendChild(numCell(monthly.reduce((a, b) => a + b, 0), true));
    tr.appendChild(numCell(avgOf(monthly), true));
    return tr;
  };

  groups.forEach(g => {
    const gEntries = entries.filter(e => e.categoryId === g.id);
    const monthly = monthsFor(gEntries);
    // Paychecks are the source of truth for wages — roll their gross into the
    // mapped income category (so wages aren't entered twice).
    const pcMonthly = paycheckMonthsFor(data.paychecks, g.id);
    const hasPc = pcMonthly.some(v => v > 0);
    for (let i = 0; i < 12; i++) monthly[i] += pcMonthly[i];
    monthly.forEach((v, i) => grand[i] += v);
    const open = expandedIncomeGroups.has(g.id);
    tb.appendChild(addRow('grp-row', g.name, monthly,
      () => { open ? expandedIncomeGroups.delete(g.id) : expandedIncomeGroups.add(g.id); renderView(currentRoute); },
      open ? '▾' : '▸'));
    if (open) {
      g.subs.forEach(sub => tb.appendChild(addRow('sub-row', sub.name, monthsFor(gEntries.filter(e => e.subId === sub.id)))));
      const noSub = gEntries.filter(e => !e.subId || !g.subs.some(s => s.id === e.subId));
      if (noSub.length) tb.appendChild(addRow('sub-row', '(no subcategory)', monthsFor(noSub)));
      if (hasPc) tb.appendChild(addRow('sub-row', '↳ Paychecks', pcMonthly));
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
  table.innerHTML = '<thead><tr><th>Date</th><th>Category</th><th>Source</th><th>Account</th><th class="num">Gross</th><th class="num">Net</th><th>Person</th><th>Status</th><th></th></tr></thead>';
  const tb = el('tbody');
  rows.forEach(e => {
    const tr = el('tr');
    tr.appendChild(el('td', null, fmtDate(e.date)));
    tr.appendChild(el('td', null, store.incomeGroupName(e.categoryId)));
    tr.appendChild(el('td', null, store.subName('income', e.categoryId, e.subId) || '—'));
    tr.appendChild(el('td', null, store.accountName(e.accountId) || '—'));
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
  const fAcct = select([{ value: '', label: '—' }].concat(s.accounts.map(a => ({ value: a.id, label: a.name + (a.last4 ? ' ••' + a.last4 : '') }))), e.accountId || '');
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
  const syncDiv = () => { const g = s.incomeCategories.find(c => c.id === fCat.value); divWrap.style.display = (g && /dividend/i.test(g.name)) ? '' : 'none'; };
  fCat.addEventListener('change', () => { rebuildSubs(); syncDiv(); });
  rebuildSubs(); syncDiv();

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
  body.appendChild(field('Notes', fNotes, 'Anything else worth remembering about this entry.'));

  openModal({
    title: existing ? 'Edit income' : 'Add income', body, confirmLabel: 'Save',
    onConfirm: () => {
      if (!fCat.value) { toast('Pick a category', 'warn'); fCat.focus(); return false; }
      const gross = parseFloat(fGross.value);
      if (isNaN(gross)) { toast('Gross amount is required', 'warn'); fGross.focus(); return false; }
      const entry = Object.assign(e, {
        date: fDate.value || todayISO(), categoryId: fCat.value, subId: fSub.value || '',
        accountId: fAcct.value || '', personId: fPerson.value, gross,
        net: fNet.value === '' ? null : parseFloat(fNet.value), status: fStatus.value,
        expectedDate: fExpected.value || '', receivedVia: fVia.value.trim(), taxable: fTax.value,
        reinvested: cReinv.__input.checked, paidOut: cPaid.__input.checked, notes: fNotes.value.trim(),
        symbol: fSym.value.trim(), action: fAction.value.trim(),
        qty: fQty.value === '' ? null : parseFloat(fQty.value), price: fPrice.value === '' ? null : parseFloat(fPrice.value)
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
  { key: 'everyNYears', label: 'Every N years', occ: null }
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

function renderSubscriptions(view) {
  const store = window.cloverStore, s = store.state;
  const all = s.recurring;
  const active = all.filter(isSubActive);
  const totalMonthly = active.reduce((sum, r) => sum + monthlyEquiv(r), 0);
  const totalAnnual = active.reduce((sum, r) => sum + annualCost(r), 0);
  const net = store.netMonthlyIncome();

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
  const netInput = input(net || '', { type: 'number', placeholder: '0.00' }); netInput.step = '0.01'; netInput.className = 'net-input';
  netInput.addEventListener('change', () => store.setNetMonthlyIncome(netInput.value));
  const netCard = el('div', 'sum-card');
  netCard.appendChild(el('div', 'sum-label', 'Net monthly income'));
  const netWrap = el('div', 'sum-net'); netWrap.appendChild(el('span', 'sum-dollar', '$')); netWrap.appendChild(netInput);
  netCard.appendChild(netWrap);
  netCard.appendChild(el('div', 'sum-hint', 'Used for % of income'));
  sum.appendChild(netCard);
  sum.appendChild(sumCard('Total monthly', money(totalMonthly), 'expense'));
  sum.appendChild(sumCard('Total annual', money(totalAnnual), 'expense'));
  if (net > 0) {
    const unalloc = net - totalMonthly;
    sum.appendChild(sumCard('Left after subs', money(unalloc), unalloc < 0 ? 'expense' : 'income'));
    sum.appendChild(sumCard('% of net income', (totalMonthly / net * 100).toFixed(1) + '%', 'neutral'));
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

  let rows = all.slice();
  if (subsStatusFilter === 'active') rows = rows.filter(isSubActive);
  if (subsCatFilter !== 'all') rows = rows.filter(r => r.categoryId === subsCatFilter);

  if (!rows.length) {
    view.appendChild(emptyState('No subscriptions yet',
      'Add your recurring bills and subscriptions to see monthly-equivalent cost, renewals, and what share of your income they take.',
      '+ Add subscription', () => subscriptionModal(null)));
    return;
  }

  const cols = [
    { label: 'Name', key: 'name', value: r => r.name, cell: r => {
        const td = el('td'); td.appendChild(el('div', 'acct-name', r.name));
        if (r.vendor) td.appendChild(el('div', 'acct-sub', r.vendor));
        return td; } },
    { label: 'Category', key: 'category', value: r => store.expenseGroupName(r.categoryId), cell: r => el('td', null, store.expenseGroupName(r.categoryId)) },
    { label: 'Amount', key: 'amount', num: true, value: r => Number(r.amount) || 0, cell: r => numCell(Number(r.amount) || 0) },
    { label: 'Frequency', key: 'freq', value: r => freqLabel(r), cell: r => el('td', null, freqLabel(r)) },
    { label: 'Monthly', key: 'monthly', num: true, value: r => monthlyEquiv(r), cell: r => numCell(monthlyEquiv(r), true) },
    { label: 'Annual', key: 'annual', num: true, value: r => annualCost(r), cell: r => numCell(annualCost(r)) },
    { label: '% net', key: 'pct', num: true, value: r => net > 0 ? monthlyEquiv(r) / net * 100 : 0, cell: r => { const td = el('td', 'num'); td.textContent = net > 0 ? (monthlyEquiv(r) / net * 100).toFixed(2) + '%' : '—'; return td; } },
    { label: 'Renews', key: 'renews', value: r => { const d = daysUntil(r.renewalDate); return d == null ? 999999 : d; }, cell: r => renewCell(r) },
    { label: 'Account', key: 'account', value: r => store.accountName(r.accountId), cell: r => el('td', null, store.accountName(r.accountId) || '—') },
    { label: 'Flags', sortable: false, cell: r => {
        const td = el('td'); const flags = el('div', 'flags');
        if (!isSubActive(r)) flags.appendChild(badge(r.status || 'Inactive', 'red'));
        else if (r.status === 'Trial') flags.appendChild(badge('Trial', 'amber'));
        if (r.autoPay) flags.appendChild(badge('Auto-pay', 'amber'));
        if (r.priority && r.priority !== 'Medium') flags.appendChild(badge(r.priority));
        td.appendChild(flags); return td; } },
    { label: '', sortable: false, cell: r => {
        const td = el('td', 'row-actions');
        const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => subscriptionModal(r));
        const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove(r.name, () => store.removeRecurring(r.id)));
        td.appendChild(edit); td.appendChild(del); return td; } }
  ];
  const card = el('div', 'card table-card');
  card.appendChild(sortableTable(cols, rows, subsSort, ns => { subsSort = ns; renderView(currentRoute); }, r => isSubActive(r) ? '' : 'inactive-row'));
  view.appendChild(card);
}

function sumCard(label, value, tone) {
  const c = el('div', 'sum-card');
  c.appendChild(el('div', 'sum-label', label));
  c.appendChild(el('div', 'sum-value ' + (tone || ''), value));
  return c;
}
function renewCell(r) {
  const td = el('td');
  const d = daysUntil(r.renewalDate);
  if (d == null) { td.textContent = '—'; return td; }
  const warn = window.cloverStore.state.settings.warnWindows || [7, 14, 30, 60];
  const maxW = Math.max.apply(null, warn);
  td.appendChild(el('span', null, fmtDate(r.renewalDate) + ' '));
  if (d < 0) td.appendChild(badge('Overdue', 'red'));
  else if (d <= maxW) td.appendChild(badge('in ' + d + 'd', d <= 7 ? 'red' : 'amber'));
  else td.appendChild(el('span', 'muted', 'in ' + d + 'd'));
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
  const fAcct = select([{ value: '', label: '—' }].concat(s.accounts.map(a => ({ value: a.id, label: a.name + (a.last4 ? ' ••' + a.last4 : '') }))), r.accountId || '');
  const fBackup = select([{ value: '', label: '— None —' }].concat(s.accounts.map(a => ({ value: a.id, label: a.name + (a.last4 ? ' ••' + a.last4 : '') }))), r.backupAccountId || '');
  const fPerson = select(s.persons.map(p => ({ value: p.id, label: p.name })), r.personId || (s.persons[0] && s.persons[0].id));
  const fPriority = select(PRIORITIES, r.priority || 'Medium');
  const fStatus = select(SUB_STATUSES, r.status || 'Active');
  const cAuto = checkbox('Auto-pay', r.autoPay, 'Charged automatically — no manual action needed.');
  const fUrl = input(r.url || '', { placeholder: 'https:// (optional)' });
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
  body.appendChild(field('Next renewal date', fRenew, 'When it next renews or is due. Drives the renewal warnings (7/14/30/60 days).'));
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
  body.appendChild(field('Vendor URL', fUrl, 'Link to manage or cancel the subscription (optional).'));
  body.appendChild(field('Notes', fNotes, 'Anything else — promo pricing, renewal quirks, etc.'));
  rebuildSubs(); syncInterval();
  fCat.addEventListener('change', rebuildSubs);

  openModal({
    title: existing ? 'Edit subscription' : 'Add subscription', body, confirmLabel: 'Save',
    onConfirm: () => {
      const name = fName.value.trim();
      if (!name) { fName.focus(); toast('Name is required', 'warn'); return false; }
      const amount = parseFloat(fAmount.value);
      if (isNaN(amount)) { fAmount.focus(); toast('Amount is required', 'warn'); return false; }
      const isN = fFreq.value === 'everyNMonths' || fFreq.value === 'everyNYears';
      const item = Object.assign(r, {
        name, vendor: fVendor.value.trim(), categoryId: fCat.value, subId: fSub.value || '',
        amount, frequency: fFreq.value, interval: isN ? (parseInt(fInterval.value, 10) || 1) : null,
        renewalDate: fRenew.value || '', accountId: fAcct.value || '', backupAccountId: fBackup.value || '',
        personId: fPerson.value, priority: fPriority.value, status: fStatus.value, autoPay: cAuto.__input.checked,
        url: fUrl.value.trim(), notes: fNotes.value.trim()
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
function recurringMonthsForCategory(store, catId, payments) {
  const bills = store.state.recurring.filter(isSubActive).filter(r => r.categoryId === catId);
  const m = new Array(12).fill(0);
  bills.forEach(bill => {
    const me = monthlyEquiv(bill);
    for (let mi = 0; mi < 12; mi++) {
      const overridden = payments.some(p => p.recurringId === bill.id && monthIdx(p.date) === mi);
      if (!overridden) m[mi] += me;
    }
  });
  return m;
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
  left.appendChild(el('p', 'muted', money(total) + ' logged · ' + n + ' entr' + (n === 1 ? 'y' : 'ies') +
    (expenseIncludeRecurring && hasBills ? ' + recurring bills' : '')));
  head.appendChild(left);

  const right = el('div', 'head-actions');
  const tabs = el('div', 'tabs');
  [['grid', 'Annual grid'], ['list', 'List']].forEach(([t, label]) => {
    const b = el('button', 'tab' + (expenseTab === t ? ' active' : ''), label);
    b.addEventListener('click', () => { expenseTab = t; renderView(currentRoute); });
    tabs.appendChild(b);
  });
  right.appendChild(tabs);
  if (expenseTab === 'grid' && hasBills) {
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
  view.appendChild(expenseTab === 'grid' ? expenseGrid(data) : expenseList(data));
}

function expenseGrid(data) {
  const store = window.cloverStore, groups = store.state.expenseCategories;
  const entries = data.expensePayments;
  const card = el('div', 'card table-card');
  const table = el('table', 'data-table grid-table');
  table.innerHTML = '<thead><tr><th>Category</th>' + MONTHS.map(m => '<th class="num">' + m + '</th>').join('') + '<th class="num">YTD</th><th class="num">Avg</th></tr></thead>';
  const tb = el('tbody');
  const grand = new Array(12).fill(0);

  const monthsFor = list => { const m = new Array(12).fill(0); list.forEach(e => { const mi = monthIdx(e.date); if (mi >= 0) m[mi] += expenseAmount(e); }); return m; };
  const addRow = (cls, label, monthly, onClick, caret) => {
    const tr = el('tr', cls);
    const c0 = el('td', cls === 'sub-row' ? 'sub-name' : 'grp-name');
    if (caret != null) { c0.appendChild(el('span', 'caret', caret)); c0.appendChild(document.createTextNode(' ' + label)); }
    else c0.textContent = label;
    if (onClick) { c0.style.cursor = 'pointer'; c0.addEventListener('click', onClick); }
    tr.appendChild(c0);
    monthly.forEach(v => tr.appendChild(numCell(v)));
    tr.appendChild(numCell(monthly.reduce((a, b) => a + b, 0), true));
    tr.appendChild(numCell(avgOf(monthly), true));
    return tr;
  };

  groups.forEach(g => {
    const gEntries = entries.filter(e => e.categoryId === g.id);
    const monthly = monthsFor(gEntries);
    const rec = expenseIncludeRecurring ? recurringMonthsForCategory(store, g.id, entries) : new Array(12).fill(0);
    const hasRec = rec.some(v => v > 0);
    for (let i = 0; i < 12; i++) monthly[i] += rec[i];
    monthly.forEach((v, i) => grand[i] += v);
    const open = expandedExpenseGroups.has(g.id);
    tb.appendChild(addRow('grp-row', g.name, monthly,
      () => { open ? expandedExpenseGroups.delete(g.id) : expandedExpenseGroups.add(g.id); renderView(currentRoute); },
      open ? '▾' : '▸'));
    if (open) {
      g.subs.forEach(sub => tb.appendChild(addRow('sub-row', sub.name, monthsFor(gEntries.filter(e => e.subId === sub.id)))));
      const noSub = gEntries.filter(e => !e.subId || !g.subs.some(s => s.id === e.subId));
      if (noSub.length) tb.appendChild(addRow('sub-row', '(no subcategory)', monthsFor(noSub)));
      if (hasRec) tb.appendChild(addRow('sub-row', '↻ Recurring bills', rec));
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
  const fAcct = select([{ value: '', label: '—' }].concat(s.accounts.map(a => ({ value: a.id, label: a.name + (a.last4 ? ' ••' + a.last4 : '') }))), e.accountId || '');
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

function isPaycheckPaid(p) { return !!p.receivedDate && p.status !== 'Bounced/Returned' && p.status !== 'Missing'; }
function paycheckDaysLate(p) {
  if (!p.payDate || !p.receivedDate) return null;
  const pm = /^(\d{4})-(\d{2})-(\d{2})/.exec(p.payDate), rm = /^(\d{4})-(\d{2})-(\d{2})/.exec(p.receivedDate);
  if (!pm || !rm) return null;
  const pd = new Date(+pm[1], +pm[2] - 1, +pm[3]), rd = new Date(+rm[1], +rm[2] - 1, +rm[3]);
  return Math.round((rd - pd) / 86400000);
}
// Monthly gross for PAID paychecks mapped to a given income category (by pay-date month).
function paycheckMonthsFor(paychecks, incomeCatId) {
  const m = new Array(12).fill(0);
  (paychecks || []).forEach(p => {
    if (!isPaycheckPaid(p)) return;
    if ((p.incomeCategoryId || '') !== incomeCatId) return;
    const mi = monthIdx(p.payDate); if (mi >= 0) m[mi] += Number(p.gross) || 0;
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
  if (!store.isYearLoaded(activeYear)) { view.appendChild(loadingPanel()); store.loadYear(activeYear); return; }
  const data = store.yearData(activeYear);
  const pays = data.paychecks;
  const paid = pays.filter(isPaycheckPaid);
  const grossYTD = paid.reduce((s, p) => s + (Number(p.gross) || 0), 0);
  const netYTD = paid.reduce((s, p) => s + (Number(p.net) || 0), 0);
  const outstanding = pays.filter(p => !isPaycheckPaid(p) && p.status !== 'Bounced/Returned');

  const head = el('div', 'view-head');
  const left = el('div');
  left.appendChild(el('h3', null, 'Paychecks · ' + activeYear));
  left.appendChild(el('p', 'muted', paid.length + ' received · ' + pays.length + ' total'));
  head.appendChild(left);
  const pcActions = el('div', 'head-actions');
  pcActions.appendChild(importButton('paychecks'));
  const add = el('button', 'btn-primary', '+ Add paycheck'); add.addEventListener('click', () => paycheckModal(null));
  pcActions.appendChild(add);
  head.appendChild(pcActions);
  view.appendChild(head);
  const yt = yearTabs(store, 'paychecks'); if (yt) view.appendChild(yt);

  const sum = el('div', 'sub-summary');
  sum.appendChild(sumCard('Gross YTD', money(grossYTD), 'income'));
  sum.appendChild(sumCard('Net YTD', money(netYTD), 'income'));
  sum.appendChild(sumCard('Received', String(paid.length), 'neutral'));
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

  const bar = el('div', 'filter-bar');
  const statusSel = select([{ value: 'all', label: 'All statuses' }].concat(PAYCHECK_STATUSES.map(s => ({ value: s, label: s }))), paycheckStatusFilter);
  statusSel.addEventListener('change', () => { paycheckStatusFilter = statusSel.value; renderView(currentRoute); });
  bar.appendChild(labelWrap('Status', statusSel));
  view.appendChild(bar);

  // Reset bulk selection when the year changes; drop ids that no longer exist.
  if (paycheckSelYear !== activeYear) { paycheckSel = new Set(); paycheckSelYear = activeYear; }
  const validIds = new Set(pays.map(p => p.id));
  [...paycheckSel].forEach(id => { if (!validIds.has(id)) paycheckSel.delete(id); });

  let rows = pays.slice();
  if (paycheckStatusFilter !== 'all') rows = rows.filter(p => (p.status || 'Received') === paycheckStatusFilter);

  if (!rows.length) {
    view.appendChild(emptyState('No paychecks yet', 'Add your paychecks — main job and any acting/side gigs — to track expected vs. received, days early/late, and wage totals. Wages roll into the Income view automatically.', '+ Add paycheck', () => paycheckModal(null)));
    return;
  }

  const bulkContainer = el('div'); bulkContainer.id = 'pc-bulk-bar';
  if (paycheckSel.size) bulkContainer.appendChild(paycheckBulkBar(store));
  view.appendChild(bulkContainer);

  const cols = [
    { sortable: false, headCell: () => {
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.title = 'Select all';
        cb.checked = rows.length > 0 && rows.every(r => paycheckSel.has(r.id));
        cb.addEventListener('change', () => {
          rows.forEach(r => cb.checked ? paycheckSel.add(r.id) : paycheckSel.delete(r.id));
          document.querySelectorAll('#view .data-table tbody .sel-cell input').forEach(box => { box.checked = cb.checked; });
          updatePaycheckSelectionUI();
        });
        return cb; },
      cell: p => {
        const td = el('td', 'sel-cell'); const cb = document.createElement('input'); cb.type = 'checkbox';
        cb.checked = paycheckSel.has(p.id);
        cb.addEventListener('change', () => { cb.checked ? paycheckSel.add(p.id) : paycheckSel.delete(p.id); updatePaycheckSelectionUI(); });
        td.appendChild(cb); return td; } },
    { label: 'Pay date', key: 'payDate', value: p => p.payDate || '', cell: p => el('td', null, fmtDate(p.payDate)) },
    { label: 'Received', key: 'received', value: p => p.receivedDate || '', cell: p => {
        const td = el('td'); td.appendChild(el('span', null, p.receivedDate ? fmtDate(p.receivedDate) + ' ' : '— '));
        const b = daysLateBadge(p); if (b) td.appendChild(b); return td; } },
    { label: 'Gross', key: 'gross', num: true, value: p => Number(p.gross) || 0, cell: p => numCell(Number(p.gross) || 0, true) },
    { label: 'Net', key: 'net', num: true, value: p => Number(p.net) || 0, cell: p => numCell(Number(p.net) || 0) },
    { label: 'Employer', key: 'employer', value: p => p.employer || '', cell: p => {
        const td = el('td'); td.appendChild(el('div', 'acct-name', p.employer || '—'));
        const cat = store.incomeGroupName(p.incomeCategoryId); if (cat && cat !== '—') td.appendChild(el('div', 'acct-sub', cat));
        return td; } },
    { label: 'Person', key: 'person', value: p => store.personName(p.personId), cell: p => el('td', null, store.personName(p.personId)) },
    { label: 'Period', key: 'period', num: true, value: p => Number(p.periodNum) || 0, cell: p => {
        const td = el('td'); td.textContent = p.periodNum ? '#' + p.periodNum : '—';
        if (p.periodStart || p.periodEnd) td.title = fmtDate(p.periodStart) + ' – ' + fmtDate(p.periodEnd); return td; } },
    { label: 'Status', key: 'status', value: p => p.status || 'Received', cell: p => {
        const td = el('td'); const st = p.status || 'Received';
        const tone = st === 'Received' || st === 'Manual deposit' ? 'green' : (st === 'Late' || st === 'Missing' || st === 'Bounced/Returned') ? 'red' : 'amber';
        td.appendChild(badge(st, tone)); return td; } },
    { label: 'Method', key: 'method', value: p => p.method || '', cell: p => el('td', 'muted', p.method || '—') },
    { label: '', sortable: false, cell: p => {
        const td = el('td', 'row-actions');
        const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => paycheckModal(p));
        const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove(fmtDate(p.payDate) + ' · ' + (p.employer || 'paycheck'), () => store.removePaycheck(activeYear, p.id)));
        td.appendChild(edit); td.appendChild(del); return td; } }
  ];
  const card = el('div', 'card table-card');
  card.appendChild(sortableTable(cols, rows, paycheckSort, ns => { paycheckSort = ns; renderView(currentRoute); }, p => isPaycheckPaid(p) ? '' : 'inactive-row'));
  view.appendChild(card);
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
  body.appendChild(field('Notes', fNotes, 'Anything unusual — bounced check, wrong amount, deposit delay, etc.'));

  openModal({
    title: existing ? 'Edit paycheck' : 'Add paycheck', body, confirmLabel: 'Save',
    onConfirm: () => {
      const gross = parseFloat(fGross.value);
      if (isNaN(gross)) { fGross.focus(); toast('Gross is required', 'warn'); return false; }
      const entry = Object.assign(p, {
        payDate: fPay.value || todayISO(), receivedDate: fRecv.value || '',
        gross, net: fNet.value === '' ? null : parseFloat(fNet.value),
        employer: fEmp.value.trim(), incomeCategoryId: fCat.value, personId: fPerson.value,
        periodNum: fPeriodNum.value === '' ? null : parseInt(fPeriodNum.value, 10),
        periodStart: fPeriodStart.value || '', periodEnd: fPeriodEnd.value || '',
        status: fStatus.value, method: fMethod.value, notes: fNotes.value.trim()
      });
      store.savePaycheck(activeYear, entry);
      toast(existing ? 'Paycheck updated' : 'Paycheck added');
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

function renderCreditTab(view) {
  const store = window.cloverStore, s = store.state;
  const rows = s.creditScores.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!rows.length) { view.appendChild(emptyState('No credit scores yet', 'Log your scores over time to chart them by provider (Credit Karma, Chase, Amex, etc.).', '+ Add score', () => creditScoreModal(null))); return; }

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

  const cols = [
    { label: 'Date', key: 'date', value: r => r.date || '', cell: r => el('td', null, fmtDate(r.date)) },
    { label: 'Score', key: 'score', num: true, value: r => Number(r.score) || 0, cell: r => { const td = el('td', 'num strong'); td.textContent = r.score || '—'; return td; } },
    { label: 'Provider', key: 'provider', value: r => r.provider || '', cell: r => el('td', null, r.provider || '—') },
    { label: '', sortable: false, cell: r => { const td = el('td', 'row-actions'); const e = el('button', 'icon-btn', 'Edit'); e.addEventListener('click', () => creditScoreModal(r)); const d = el('button', 'icon-btn danger', 'Remove'); d.addEventListener('click', () => confirmRemove(fmtDate(r.date) + ' · ' + (r.provider || 'score'), () => store.removeCreditScore(r.id))); td.appendChild(e); td.appendChild(d); return td; } }
  ];
  const card = el('div', 'card table-card'); card.appendChild(sortableTable(cols, s.creditScores, creditSort, ns => { creditSort = ns; renderView(currentRoute); }, null)); view.appendChild(card);
}

// An entry's institution, with a fallback for any legacy accountId-based rows.
function rateInstitution(store, r) {
  if (r.institution) return r.institution;
  if (r.accountId) { const a = store.account(r.accountId); return (a && a.institution) || store.accountName(r.accountId) || ''; }
  return '';
}

function renderRatesTab(view) {
  const store = window.cloverStore, s = store.state;
  const rows = s.rateHistory.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!rows.length) { view.appendChild(emptyState('No savings rates yet', 'Log a bank’s APY over time to compare how each institution’s rate moves.', '+ Add rate', () => rateModal(null))); return; }

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

  const cols = [
    { label: 'Date', key: 'date', value: r => r.date || '', cell: r => el('td', null, fmtDate(r.date)) },
    { label: 'Bank / institution', key: 'institution', value: r => rateInstitution(store, r), cell: r => el('td', null, rateInstitution(store, r) || '—') },
    { label: 'APY', key: 'apy', num: true, value: r => Number(r.apy) || 0, cell: r => { const td = el('td', 'num strong'); td.textContent = (r.apy != null && r.apy !== '') ? (Number(r.apy).toFixed(2) + '%') : '—'; return td; } },
    { label: '', sortable: false, cell: r => { const td = el('td', 'row-actions'); const e = el('button', 'icon-btn', 'Edit'); e.addEventListener('click', () => rateModal(r)); const d = el('button', 'icon-btn danger', 'Remove'); d.addEventListener('click', () => confirmRemove(fmtDate(r.date) + ' · ' + rateInstitution(store, r), () => store.removeRate(r.id))); td.appendChild(e); td.appendChild(d); return td; } }
  ];
  const card = el('div', 'card table-card'); card.appendChild(sortableTable(cols, s.rateHistory, rateSort, ns => { rateSort = ns; renderView(currentRoute); }, null)); view.appendChild(card);
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
  return sum;
}
function incomeYTDall(data) {
  let sum = data.income.filter(countable).reduce((a, e) => a + amountOf(e), 0);
  sum += data.paychecks.filter(isPaycheckPaid).reduce((a, p) => a + (Number(p.gross) || 0), 0);
  return sum;
}
function incomeByCategory(store, data) {
  const m = {};
  data.income.filter(countable).forEach(e => { const g = store.incomeGroupName(e.categoryId); m[g] = (m[g] || 0) + amountOf(e); });
  data.paychecks.filter(isPaycheckPaid).forEach(p => { const g = store.incomeGroupName(p.incomeCategoryId); m[g] = (m[g] || 0) + (Number(p.gross) || 0); });
  return m;
}
function expenseByCategory(store, data) {
  const m = {};
  data.expensePayments.forEach(e => { const g = store.expenseGroupName(e.categoryId); m[g] = (m[g] || 0) + expenseAmount(e); });
  return m;
}
function donutCard(title, map) {
  const card = el('div', 'card');
  card.appendChild(el('h3', 'strip-title', title));
  const entries = Object.entries(map).filter(([k, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) { card.appendChild(el('div', 'muted', 'No data yet.')); return card; }
  const wrap = el('div', 'donut-wrap'); const cv = document.createElement('canvas'); wrap.appendChild(cv); card.appendChild(wrap);
  buildDoughnut(cv, { labels: entries.map(e => e[0]), data: entries.map(e => e[1]) });
  return card;
}
function buildWarnings(store, data, s) {
  const warn = s.settings.warnWindows || [7, 14, 30, 60];
  const maxW = Math.max.apply(null, warn);
  const renewSoon = s.recurring.filter(isSubActive).map(r => ({ r, d: daysUntil(r.renewalDate) })).filter(x => x.d != null && x.d >= 0 && x.d <= maxW).sort((a, b) => a.d - b.d);
  const overdue = data.paychecks.filter(p => !isPaycheckPaid(p) && p.status !== 'Bounced/Returned' && (p.status === 'Late' || p.status === 'Missing' || (p.payDate && daysUntil(p.payDate) < 0)));
  if (!renewSoon.length && !overdue.length) return null;
  const strip = el('div', 'card warn-strip');
  strip.appendChild(el('h3', 'strip-title', '⚠ Attention'));
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
  card.appendChild(el('h3', 'strip-title', 'Upcoming renewals'));
  const items = s.recurring.filter(isSubActive).map(r => ({ r, d: daysUntil(r.renewalDate) })).filter(x => x.d != null && x.d >= 0).sort((a, b) => a.d - b.d).slice(0, 8);
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
  card.appendChild(el('h3', 'strip-title', 'Recent activity'));
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
  const spendThisMonth = data.expensePayments.filter(e => monthIdx(e.date) === focusMonth).reduce((a, e) => a + expenseAmount(e), 0);
  const activeSubs = s.recurring.filter(isSubActive);
  const recurringMonthly = activeSubs.reduce((a, r) => a + monthlyEquiv(r), 0);
  const recurringAnnual = activeSubs.reduce((a, r) => a + annualCost(r), 0);
  const netThisMonth = incThisMonth - spendThisMonth - recurringMonthly;
  const incYTD = incomeYTDall(data);
  const spendYTD = data.expensePayments.reduce((a, e) => a + expenseAmount(e), 0);
  const projAnnualIncome = monthsElapsed > 0 ? incYTD / monthsElapsed * 12 : incYTD;
  const projAnnualExpense = recurringAnnual + (monthsElapsed > 0 ? spendYTD / monthsElapsed * 12 : spendYTD);

  // "Should be left over" for a typical month: income basis − recurring bills −
  // typical (average) non-recurring spending.
  const setNet = store.netMonthlyIncome();
  const avgSpend = monthsElapsed > 0 ? spendYTD / monthsElapsed : spendThisMonth;
  const incomeBasis = setNet > 0 ? setNet : (monthsElapsed > 0 ? incYTD / monthsElapsed : incThisMonth);
  const shouldLeft = incomeBasis - recurringMonthly - avgSpend;

  const head = el('div', 'view-head');
  const left = el('div'); left.appendChild(el('h3', null, 'Dashboard'));
  left.appendChild(el('p', 'muted', monthName + ' ' + activeYear + ' snapshot'));
  head.appendChild(left);
  view.appendChild(head);

  const kpis = el('div', 'sub-summary');
  kpis.appendChild(kpiCard('Income · ' + monthName, money(incThisMonth), 'income'));
  kpis.appendChild(kpiCard('Spending · ' + monthName, money(spendThisMonth), 'expense'));
  kpis.appendChild(kpiCard('Recurring / mo', money(recurringMonthly), 'expense', money(recurringAnnual) + ' / yr'));
  kpis.appendChild(kpiCard('Net · ' + monthName, money(netThisMonth), netThisMonth < 0 ? 'expense' : 'income'));
  kpis.appendChild(kpiCard('Should be left / mo', money(shouldLeft), shouldLeft < 0 ? 'expense' : 'income', (setNet > 0 ? 'take-home' : 'avg income') + ' − bills − avg spend'));
  kpis.appendChild(kpiCard('Projected income', money(projAnnualIncome), 'income', 'annualized from YTD'));
  kpis.appendChild(kpiCard('Projected expenses', money(projAnnualExpense), 'expense', 'subs + annualized spend'));
  view.appendChild(kpis);

  const warns = buildWarnings(store, data, s);
  if (warns) view.appendChild(warns);

  const chartsRow = el('div', 'dash-charts');
  chartsRow.appendChild(donutCard('Income by category (YTD)', incomeByCategory(store, data)));
  chartsRow.appendChild(donutCard('Expenses by category (YTD)', expenseByCategory(store, data)));
  view.appendChild(chartsRow);

  const bottom = el('div', 'dash-cols');
  bottom.appendChild(upcomingRenewalsCard(store, s));
  bottom.appendChild(recentActivityCard(store, data));
  view.appendChild(bottom);
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
  if (includeRecurring) { const rec = monthlyRecurringTotals(store, data.expensePayments); for (let i = 0; i < 12; i++) m[i] += rec[i]; }
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
  store.state.expenseCategories.forEach(cat => { const rec = recurringMonthsForCategory(store, cat.id, data.expensePayments).reduce((a, b) => a + b, 0); if (rec > 0) m[cat.name] = (m[cat.name] || 0) + rec; });
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

function renderReports(view) {
  destroyCharts();
  const store = window.cloverStore;
  if (!store.isYearLoaded(activeYear)) { view.appendChild(loadingPanel()); store.loadYear(activeYear); return; }
  const data = store.yearData(activeYear);

  const head = el('div', 'view-head');
  const left = el('div');
  left.appendChild(el('h3', null, 'Reports · ' + activeYear));
  left.appendChild(el('p', 'muted', 'Charts follow the year selector in the top bar'));
  head.appendChild(left);
  view.appendChild(head);

  const inc = monthlyIncomeTotals(store, data);
  const exp = monthlyExpenseTotals(store, data, true);
  const net = inc.map((v, i) => v - exp[i]);
  const wGross = wageMonthly(data, 'gross');
  const wNet = wageMonthly(data, 'net');

  const gallery = el('div', 'report-gallery');
  gallery.appendChild(reportCard('Income vs Expenses', cv => buildBarChart(cv, {
    labels: MONTHS, datasets: [
      { label: 'Income', data: inc, backgroundColor: '#16a34a' },
      { label: 'Expenses', data: exp, backgroundColor: '#dc2626' }
    ]
  })));
  gallery.appendChild(reportCard('Net cashflow by month', cv => buildBarChart(cv, {
    labels: MONTHS, datasets: [{ label: 'Net', data: net, backgroundColor: net.map(v => v >= 0 ? '#16a34a' : '#dc2626') }]
  })));
  gallery.appendChild(reportCard('Wages: gross vs net', cv => buildBarChart(cv, {
    labels: MONTHS, datasets: [
      { label: 'Gross', data: wGross, backgroundColor: '#2563eb' },
      { label: 'Net', data: wNet, backgroundColor: '#16a34a' }
    ]
  })));
  gallery.appendChild(reportCard('Income by category', cv => doughnutInto(cv, incomeByCategory(store, data))));
  gallery.appendChild(reportCard('Expenses by category', cv => doughnutInto(cv, expenseByCategoryFull(store, data))));
  gallery.appendChild(reportCard('Expenses by payment method', cv => doughnutInto(cv, expenseByAccount(store, data))));
  view.appendChild(gallery);

  view.appendChild(yoyOverview(store));
}

function yearSummary(store, y) {
  const d = store.yearData(y);
  const income = incomeYTDall(d);
  const expenses = d.expensePayments.reduce((a, e) => a + expenseAmount(e), 0);   // logged actuals (historically correct)
  return {
    year: y, income, expenses, net: income - expenses,
    dividends: incomeByNamedCategory(store, d, /dividend/i),
    interest: incomeByNamedCategory(store, d, /interest/i),
    rewards: incomeByNamedCategory(store, d, /reward/i)
  };
}
function yoyOverview(store) {
  const curYear = new Date().getFullYear();
  const years = []; for (let y = curYear; y >= 2020; y--) years.push(y);
  const missing = years.filter(y => !store.isYearLoaded(y));
  const card = el('div', 'card');
  card.appendChild(el('h3', 'strip-title', 'Year overview'));
  if (missing.length) {
    missing.forEach(y => store.loadYear(y));   // re-renders when each loads
    card.appendChild(el('div', 'muted', 'Loading year data…'));
    return card;
  }
  const rows = years.map(y => yearSummary(store, y)).filter(r => r.income || r.expenses);
  if (!rows.length) { card.appendChild(el('div', 'muted', 'No data yet — add income and expenses to see year-over-year totals.')); return card; }
  const wrap = el('div', 'table-scroll');
  const table = el('table', 'data-table');
  table.innerHTML = '<thead><tr><th>Year</th><th class="num">Income</th><th class="num">Expenses</th><th class="num">Net</th><th class="num">Dividends</th><th class="num">Interest</th><th class="num">Rewards</th></tr></thead>';
  const tb = el('tbody');
  rows.forEach(r => {
    const tr = el('tr');
    tr.appendChild(el('td', 'strong', String(r.year)));
    tr.appendChild(numCell(r.income, true));
    tr.appendChild(numCell(r.expenses));
    const netTd = numCell(r.net, true); netTd.classList.add(r.net >= 0 ? 'pos' : 'neg'); tr.appendChild(netTd);
    tr.appendChild(numCell(r.dividends));
    tr.appendChild(numCell(r.interest));
    tr.appendChild(numCell(r.rewards));
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
  store.state.recurring.filter(isSubActive).forEach(r => { const d = dateInMonth(r.renewalDate, year, month); if (d) events.push({ day: d, type: 'Bill', label: r.name + ' renews · ' + money(Number(r.amount) || 0), tone: 'amber' }); });
  store.state.accounts.filter(a => a.type === 'CD' && a.cdMaturity).forEach(a => { const d = dateInMonth(a.cdMaturity, year, month); if (d) events.push({ day: d, type: 'CD matures', label: a.name + (a.last4 ? ' ••' + a.last4 : '') + ' matures', tone: 'blue' }); });
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
    { key: 'category', label: 'Category', kw: ['category', 'affiliate', 'reason', 'action', 'description', 'type'] },
    { key: 'account', label: 'Account', kw: ['account', 'bank', 'broker'] },
    { key: 'person', label: 'Person', kw: ['person', 'owner'] },
    { key: 'notes', label: 'Notes', kw: ['note', 'memo', 'symbol', 'description'] }
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
      if (target === 'income') e = { date, gross: amt, net: g('net') ? parseImportAmount(g('net')) : null, categoryId: matchCategory(store, 'income', g('category'), fallbackCat), subId: '', accountId: matchAccount(store, g('account')), personId: matchPerson(store, g('person')), status: 'received', notes: g('notes') };
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

function importSection() {
  const store = window.cloverStore;
  const card = el('div', 'card');
  card.appendChild(el('h3', 'strip-title', 'Import from CSV'));

  if (!importState.rows) {
    card.appendChild(el('p', 'muted', 'Upload a CSV of transactions and map its columns to Clover fields. Rows import into the selected year (' + activeYear + ').'));
    const row = el('div', 'io-actions');
    const tSel = select([{ value: 'income', label: 'Income' }, { value: 'expenses', label: 'Expenses' }, { value: 'paychecks', label: 'Paychecks' }, { value: 'subscriptions', label: 'Bills & Subscriptions' }], importState.target);
    tSel.addEventListener('change', () => { importState.target = tSel.value; });
    row.appendChild(labelWrap('Import as', tSel));
    const fileLabel = el('label', 'btn-primary file-btn'); fileLabel.textContent = 'Choose CSV…';
    const fileIn = document.createElement('input'); fileIn.type = 'file'; fileIn.accept = '.csv,text/csv'; fileIn.style.display = 'none';
    fileIn.addEventListener('change', async () => {
      const file = fileIn.files && fileIn.files[0]; if (!file) return;
      let Papa; try { Papa = await ensurePapa(); } catch (e) { toast('CSV parser couldn’t load', 'warn'); return; }
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: (res) => {
          const headers = (res.meta && res.meta.fields) || [];
          if (!headers.length || !res.data.length) { toast('No rows found in that CSV', 'warn'); return; }
          const mapping = {}; IMPORT_FIELDS[importState.target].forEach(f => { mapping[f.key] = guessColumn(headers, f.kw); });
          importState = Object.assign(importState, { rows: res.data, headers, mapping, filename: file.name });
          renderView(currentRoute);
        },
        error: () => toast('Couldn’t read that CSV', 'warn')
      });
    });
    fileLabel.appendChild(fileIn); row.appendChild(fileLabel);
    card.appendChild(row);
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
  // preview
  const isSub = importState.target === 'subscriptions';
  const prevWrap = el('div', 'table-scroll'); const pt = el('table', 'data-table');
  pt.innerHTML = '<thead><tr><th>' + (isSub ? 'Name' : 'Date') + '</th><th class="num">Amount</th><th>' + (isSub ? 'Frequency' : 'Category') + '</th></tr></thead>';
  const ptb = el('tbody');
  entries.slice(0, 6).forEach(e => {
    const tr = el('tr');
    tr.appendChild(el('td', null, isSub ? (e.name || '—') : fmtDate(e.date || e.payDate)));
    tr.appendChild(numCell(Number(e.amount != null ? e.amount : e.gross) || 0, true));
    tr.appendChild(el('td', null, isSub ? freqLabel(e) : (importState.target === 'paychecks' ? (e.employer || '—') : store[kind === 'expense' ? 'expenseGroupName' : 'incomeGroupName'](e.categoryId))));
    ptb.appendChild(tr);
  });
  pt.appendChild(ptb); prevWrap.appendChild(pt); card.appendChild(el('div', 'muted', 'Preview (first 6 of ' + entries.length + ' new rows):')); card.appendChild(prevWrap);

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
