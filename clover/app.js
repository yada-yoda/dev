// ============================================================
// Clover — app shell & routing (Phase 0)
// Auth gate, sidebar nav, hash routing, period selectors.
// Feature pages arrive in later phases; Phase 0 renders
// navigable placeholders so the shell is real and testable.
// ============================================================

const VERSION = '0.1.1';

// Owner allowlist (client-side convenience gate). The REAL security
// boundary is firestore.rules — this only improves UX by showing a
// friendly "not authorized" screen instead of silent permission errors.
// Leave empty during first-run setup; the app shows your account ID so
// you can lock both this and firestore.rules to it.
const OWNER_UIDS = [];

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

// ---------- boot ----------
document.getElementById('ver').textContent = VERSION;
buildNav();
buildPeriodSelectors();
wireChrome();

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
  document.querySelectorAll('.nav a').forEach(a =>
    a.classList.toggle('active', a.dataset.route === route.id));
  document.getElementById('view-title').textContent = route.label;
  closeDrawer();
  renderView(route);
}

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
    if (i === now.getMonth() + 1) o.selected = true; mSel.appendChild(o);
  });
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
