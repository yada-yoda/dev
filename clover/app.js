// ============================================================
// Clover — app shell & routing
// Auth gate, sidebar nav, hash routing, period selectors, and
// (Phase 1) the Settings + Accounts feature views. Remaining
// sections render navigable placeholders until their phase.
// ============================================================

const VERSION = '0.3.1';

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
  { id: 'subscriptions', label: 'Subscriptions',  ico: '↻', phase: 3 },
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
const expandedIncomeGroups = new Set();

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
      window.cloverStore.load(currentUser.uid);
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

// Feature views (Phase 1: settings, accounts; Phase 2: income).
const LIVE_VIEWS = { settings: renderSettings, accounts: renderAccounts, income: renderIncome };

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
function field(label, node) { const w = el('label', 'field'); w.appendChild(el('span', null, label)); w.appendChild(node); return w; }
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
function checkbox(label, checked) { const w = el('label', 'check'); const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!checked; w.appendChild(c); w.appendChild(document.createTextNode(' ' + label)); w.__input = c; return w; }
function badge(text, tone) { return el('span', 'badge ' + (tone || ''), text); }

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
function renderSettings(view) {
  const store = window.cloverStore, s = store.state;
  const grid = el('div', 'settings-grid');
  grid.appendChild(simpleListCard('People', 'Who money belongs to — you, joint, or others', s.persons,
    { addLabel: 'Add person', onAdd: v => store.addPerson(v), onRemove: id => store.removePerson(id) }));
  grid.appendChild(categoryCard('income', s.incomeCategories));
  grid.appendChild(categoryCard('expense', s.expenseCategories));
  grid.appendChild(simpleListCard('Institutions', 'Banks, brokers & card issuers used by accounts', s.catalog.institutions,
    { addLabel: 'Add institution', onAdd: v => store.addCatalog('institutions', v), onRemove: id => store.removeCatalog('institutions', id) }));
  grid.appendChild(simpleListCard('Reward programs', 'Cashback & rewards sources', s.catalog.rewardPrograms,
    { addLabel: 'Add reward program', onAdd: v => store.addCatalog('rewardPrograms', v), onRemove: id => store.removeCatalog('rewardPrograms', id) }));
  grid.appendChild(simpleListCard('Gift card types', 'Redemption types for rewards', s.catalog.giftCardTypes,
    { addLabel: 'Add gift card type', onAdd: v => store.addCatalog('giftCardTypes', v), onRemove: id => store.removeCatalog('giftCardTypes', id) }));
  view.appendChild(grid);
}

function sectionHead(title, subtitle, onAdd) {
  const h = el('div', 'section-head');
  const left = el('div'); left.appendChild(el('h3', null, title)); if (subtitle) left.appendChild(el('p', 'muted', subtitle));
  h.appendChild(left);
  if (onAdd) { const b = el('button', 'btn-primary', '+ Add'); b.addEventListener('click', onAdd); h.appendChild(b); }
  return h;
}

function simpleListCard(title, subtitle, items, { addLabel, onAdd, onRemove }) {
  const card = el('div', 'card');
  card.appendChild(sectionHead(title, subtitle, () => promptText(addLabel || 'Add', '', onAdd)));
  const list = el('div', 'chip-list');
  if (!items.length) list.appendChild(el('div', 'muted', 'Nothing yet.'));
  items.forEach(it => {
    const chip = el('div', 'chip', it.name);
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

  const card = el('div', 'card table-card');
  const table = el('table', 'data-table');
  table.innerHTML = '<thead><tr><th>Name</th><th>Institution</th><th>Type</th><th>Last 4</th><th>Owner</th><th>Flags</th><th></th></tr></thead>';
  const tb = el('tbody');
  s.accounts.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(a => {
    const tr = el('tr');
    if (a.active === false) tr.className = 'inactive-row';
    tr.appendChild(el('td', null, a.name));
    tr.appendChild(el('td', null, a.institution || '—'));
    const tType = el('td'); tType.appendChild(badge(a.type || '—', 'type')); tr.appendChild(tType);
    tr.appendChild(el('td', null, a.last4 ? ('••' + a.last4) : '—'));
    tr.appendChild(el('td', null, store.personName(a.personId)));
    const tFlags = el('td'); const flags = el('div', 'flags');
    flags.appendChild(a.active === false ? badge('Inactive', 'red') : badge('Active', 'green'));
    if (a.usedForAutopay) flags.appendChild(badge('Auto-pay', 'amber'));
    if (a.rewardsCard) flags.appendChild(badge('Rewards', 'green'));
    tFlags.appendChild(flags); tr.appendChild(tFlags);
    const act = el('td', 'row-actions');
    const edit = el('button', 'icon-btn', 'Edit'); edit.addEventListener('click', () => accountModal(a));
    const del = el('button', 'icon-btn danger', 'Remove'); del.addEventListener('click', () => confirmRemove(a.name, () => store.removeAccount(a.id)));
    act.appendChild(edit); act.appendChild(del); tr.appendChild(act);
    tb.appendChild(tr);
  });
  table.appendChild(tb); card.appendChild(table); view.appendChild(card);
}

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
  const a = existing ? Object.assign({}, existing) : { active: true, usedForExpenses: true };
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
  const cActive = checkbox('Active', a.active !== false);
  const cIncome = checkbox('Used for income', a.usedForIncome);
  const cExpense = checkbox('Used for expenses', a.usedForExpenses);
  const cAuto = checkbox('Used for auto-pay', a.usedForAutopay);
  const cRewards = checkbox('Rewards card', a.rewardsCard);
  const fNotes = document.createElement('textarea'); fNotes.value = a.notes || ''; fNotes.rows = 2; fNotes.placeholder = 'Optional';

  const fTerm = input(a.cdTerm || '', { placeholder: 'e.g. 12 months' });
  const fApy = input(a.cdApy || '', { placeholder: 'e.g. 4.00' });
  const fMat = input(a.cdMaturity || '', { type: 'date' });
  const cdWrap = el('div', 'cd-fields');
  cdWrap.appendChild(field('CD term', fTerm)); cdWrap.appendChild(field('APY %', fApy)); cdWrap.appendChild(field('Maturity date', fMat));
  const syncCd = () => { cdWrap.style.display = fType.value === 'CD' ? '' : 'none'; };
  fType.addEventListener('change', syncCd);

  body.appendChild(field('Name', fName));
  body.appendChild(field('Institution', fInst));
  body.appendChild(field('Type', fType));
  body.appendChild(field('Last 4', fLast4));
  body.appendChild(field('Owner', fOwner));
  body.appendChild(cdWrap);
  const flags = el('div', 'check-row'); [cActive, cIncome, cExpense, cAuto, cRewards].forEach(c => flags.appendChild(c));
  body.appendChild(field('Flags', flags));
  body.appendChild(field('Notes', fNotes));
  syncCd();

  openModal({
    title: existing ? 'Edit account' : 'Add account', body, confirmLabel: 'Save',
    onConfirm: () => {
      const name = fName.value.trim();
      if (!name) { fName.focus(); toast('Name is required', 'warn'); return false; }
      const acc = Object.assign(a, {
        name, institution: fInst.value.trim(), type: fType.value,
        last4: fLast4.value.replace(/\D/g, '').slice(0, 4), personId: fOwner.value,
        active: cActive.__input.checked, usedForIncome: cIncome.__input.checked,
        usedForExpenses: cExpense.__input.checked, usedForAutopay: cAuto.__input.checked,
        rewardsCard: cRewards.__input.checked, notes: fNotes.value.trim(),
        cdTerm: fTerm.value.trim(), cdApy: fApy.value.trim(), cdMaturity: fMat.value
      });
      store.saveAccount(acc);
      toast(existing ? 'Account updated' : 'Account added');
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
  const received = data.income.filter(countable).reduce((s, e) => s + amountOf(e), 0);
  const n = data.income.length;
  left.appendChild(el('p', 'muted', money(received) + ' received · ' + n + ' entr' + (n === 1 ? 'y' : 'ies')));
  head.appendChild(left);

  const right = el('div', 'head-actions');
  const tabs = el('div', 'tabs');
  [['grid', 'Annual grid'], ['list', 'List']].forEach(([t, label]) => {
    const b = el('button', 'tab' + (incomeTab === t ? ' active' : ''), label);
    b.addEventListener('click', () => { incomeTab = t; renderView(currentRoute); });
    tabs.appendChild(b);
  });
  right.appendChild(tabs);
  const add = el('button', 'btn-primary', '+ Add income'); add.addEventListener('click', () => incomeModal(null));
  right.appendChild(add);
  head.appendChild(right);
  view.appendChild(head);

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
    monthly.forEach((v, i) => grand[i] += v);
    const open = expandedIncomeGroups.has(g.id);
    tb.appendChild(addRow('grp-row', g.name, monthly,
      () => { open ? expandedIncomeGroups.delete(g.id) : expandedIncomeGroups.add(g.id); renderView(currentRoute); },
      open ? '▾' : '▸'));
    if (open) {
      g.subs.forEach(sub => tb.appendChild(addRow('sub-row', sub.name, monthsFor(gEntries.filter(e => e.subId === sub.id)))));
      const noSub = gEntries.filter(e => !e.subId || !g.subs.some(s => s.id === e.subId));
      if (noSub.length) tb.appendChild(addRow('sub-row', '(no subcategory)', monthsFor(noSub)));
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
  const cReinv = checkbox('Reinvested', e.reinvested);
  const cPaid = checkbox('Paid out', e.paidOut);
  const fNotes = document.createElement('textarea'); fNotes.value = e.notes || ''; fNotes.rows = 2; fNotes.placeholder = 'Optional';

  const fSym = input(e.symbol || '', { placeholder: 'e.g. AAPL' });
  const fAction = input(e.action || '', { placeholder: 'e.g. Qualified Dividend' });
  const fQty = input(e.qty != null ? e.qty : '', { type: 'number', placeholder: 'shares' }); fQty.step = 'any';
  const fPrice = input(e.price != null ? e.price : '', { type: 'number', placeholder: 'price' }); fPrice.step = '0.01';
  const divWrap = el('div', 'div-fields');
  divWrap.appendChild(field('Symbol', fSym)); divWrap.appendChild(field('Action', fAction));
  divWrap.appendChild(field('Qty', fQty)); divWrap.appendChild(field('Price', fPrice));
  const syncDiv = () => { const g = s.incomeCategories.find(c => c.id === fCat.value); divWrap.style.display = (g && /dividend/i.test(g.name)) ? '' : 'none'; };
  fCat.addEventListener('change', () => { rebuildSubs(); syncDiv(); });
  rebuildSubs(); syncDiv();

  body.appendChild(field('Date', fDate));
  body.appendChild(field('Category', fCat));
  body.appendChild(field('Source (subcategory)', fSub));
  body.appendChild(field('Account', fAcct));
  body.appendChild(field('Person', fPerson));
  const amtRow = el('div', 'two-col'); amtRow.appendChild(field('Gross amount', fGross)); amtRow.appendChild(field('Net (optional)', fNet)); body.appendChild(amtRow);
  const stRow = el('div', 'two-col'); stRow.appendChild(field('Status', fStatus)); stRow.appendChild(field('Expected date', fExpected)); body.appendChild(stRow);
  body.appendChild(field('Received via', fVia));
  const tRow = el('div', 'two-col');
  tRow.appendChild(field('Taxable', fTax));
  const flagsWrap = el('div', 'check-row'); flagsWrap.appendChild(cReinv); flagsWrap.appendChild(cPaid);
  tRow.appendChild(field('Flags', flagsWrap));
  body.appendChild(tRow);
  body.appendChild(divWrap);
  body.appendChild(field('Notes', fNotes));

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
