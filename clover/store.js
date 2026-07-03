// ============================================================
// Clover — client data store (Phase 1)
// Holds the meta doc (settings, persons, categories, accounts,
// catalog) in memory, seeds sensible defaults on first run,
// and persists to Firestore (debounced). Views subscribe to
// change notifications and re-render.
//
// Persistence uses window.cloverData (firebase-config.js):
//   finance/{uid}  ← this whole meta object.
// ============================================================

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID().slice(0, 8)
                            : Math.random().toString(36).slice(2, 10));
}
function mkId(p) { return p + '_' + uid(); }

// ---------- generic, non-personal seed catalog ----------
// Common institutions/programs anyone might use — the user's ACTUAL
// accounts are created from these (or free-typed) and live only in
// their private Firestore, never in this public repo.
const SEED_INSTITUTIONS = [
  'Ally', 'Chase', 'Bank of America', 'Wells Fargo', 'Citi', 'Capital One',
  'US Bank', 'PNC', 'Truist', 'Fifth Third', 'Huntington', 'Barclays',
  'Synchrony', 'Marcus by Goldman Sachs', 'Discover', 'American Express',
  'Apple', 'SoFi', 'Fidelity', 'Charles Schwab', 'Vanguard', 'Robinhood',
  'Webull', 'E*Trade', 'TD Ameritrade', 'M1 Finance', 'Interactive Brokers',
  'Merrill', 'Ameriprise', 'Tastytrade', 'Coinbase', 'Kraken', 'Uphold', 'PayPal'
];
const SEED_REWARD_PROGRAMS = [
  'Rakuten', 'TopCashback', 'Swagbucks', 'Fetch Rewards', 'Microsoft Rewards',
  'ReceiptPal', 'Shopkick', 'Honey', 'Ibotta', 'Upside'
];
const SEED_GIFT_CARD_TYPES = [
  'Amazon', 'Target', 'Walmart', 'Cash Back', 'Statement Credit', 'PayPal', 'Visa'
];
const SEED_INCOME_GROUPS = [
  'Wages', 'Acting', 'Side Jobs', 'Dividends', 'Investments', 'Interest',
  'Passive / Affiliate', 'Rewards', 'Selling', 'Other'
];
const SEED_EXPENSE_GROUPS = [
  'Mortgage / Rent', 'Utility', 'Insurance', 'Streaming', 'Membership',
  'Software', 'Medical', 'Pet', 'Phone', 'Internet', 'Credit Card', 'Loan',
  'Tax', 'Auto', 'Food', 'Entertainment', 'Other'
];

export const ACCOUNT_TYPES = [
  'Checking', 'Savings', 'CD', 'Credit Card', 'Brokerage',
  'Retirement', 'Cash App / Payment', 'Other'
];

function seedGroups(names) {
  return names.map((name, i) => ({ id: mkId('cat'), name, order: i, subs: [] }));
}
function seedList(names) {
  return names.map(name => ({ id: mkId('item'), name }));
}

function defaults() {
  return {
    settings: {
      activeYear: new Date().getFullYear(),
      warnWindows: [7, 14, 30, 60],
      netMonthlyIncome: 0,   // reference figure for "% of net income" on subscriptions
      // which flags start checked when adding a NEW account
      accountDefaults: { active: true, usedForIncome: false, usedForExpenses: false, usedForAutopay: false, rewardsCard: false }
    },
    // The "self" person is renamed at runtime to "Me (<Google first name>)" —
    // the real name is never hard-coded here (public repo); it comes from the
    // signed-in account and lives only in the user's private data.
    persons: [
      { id: mkId('p'), name: 'Me', self: true },
      { id: mkId('p'), name: 'Joint' }
    ],
    incomeCategories: seedGroups(SEED_INCOME_GROUPS),
    expenseCategories: seedGroups(SEED_EXPENSE_GROUPS),
    accounts: [],
    recurring: [],   // subscriptions & recurring bills (Phase 3)
    catalog: {
      institutions: seedList(SEED_INSTITUTIONS),
      rewardPrograms: seedList(SEED_REWARD_PROGRAMS),
      giftCardTypes: seedList(SEED_GIFT_CARD_TYPES)
    }
  };
}

// Ensure every expected key exists (forward-compat when the model grows).
function withDefaults(data) {
  const d = defaults();
  const s = Object.assign({}, d, data || {});
  s.settings = Object.assign({}, d.settings, data && data.settings);
  s.settings.accountDefaults = Object.assign({}, d.settings.accountDefaults, data && data.settings && data.settings.accountDefaults);
  s.catalog  = Object.assign({}, d.catalog,  data && data.catalog);
  return s;
}

const state = { _uid: null, _loaded: false, _dirty: false, years: {}, _yearLoading: {} };
const subscribers = new Set();
let saveTimer = null;
const yearSaveTimers = {};

function emptyYear() { return { income: [], paychecks: [], expensePayments: [], importBatches: [] }; }

function notify() { subscribers.forEach(cb => { try { cb(); } catch (e) { console.error(e); } }); }

function scheduleSave() {
  state._dirty = true;
  if (!state._uid) return;             // no owner (e.g. preview) — keep in memory
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 600);
}

async function flush() {
  if (!state._uid || !state._dirty) return;
  const snap = snapshot();
  state._dirty = false;
  try {
    await window.cloverData.saveMeta(state._uid, snap);
  } catch (e) {
    state._dirty = true;               // retry on next change
    console.warn('save failed:', e);
    window.cloverToast && window.cloverToast('⚠️ Couldn’t save — will retry', 'warn');
  }
}

function snapshot() {
  return {
    settings: state.settings,
    persons: state.persons,
    incomeCategories: state.incomeCategories,
    expenseCategories: state.expenseCategories,
    accounts: state.accounts,
    recurring: state.recurring,
    catalog: state.catalog
  };
}

function apply(data) {
  const s = withDefaults(data);
  state.settings = s.settings;
  state.persons = s.persons;
  state.incomeCategories = s.incomeCategories;
  state.expenseCategories = s.expenseCategories;
  state.accounts = s.accounts;
  state.recurring = s.recurring || [];
  state.catalog = s.catalog;
  state._loaded = true;
}

// ============================================================
// Public store API
// ============================================================
window.cloverStore = {
  state,
  ACCOUNT_TYPES,
  subscribe(cb) { subscribers.add(cb); return () => subscribers.delete(cb); },
  isLoaded() { return state._loaded; },

  async load(ownerUid) {
    state._uid = ownerUid || null;
    let data = null;
    if (ownerUid) {
      try { data = await window.cloverData.getMeta(ownerUid); }
      catch (e) { console.warn('load failed (using defaults):', e); }
    }
    apply(data);
    if (ownerUid && !data) { scheduleSave(); }   // first run — persist the seed
    notify();
  },

  // --- persons ---
  addPerson(name) { state.persons.push({ id: mkId('p'), name: name.trim() }); scheduleSave(); notify(); },
  renamePerson(id, name) { const p = state.persons.find(x => x.id === id); if (p) { p.name = name.trim(); if (p.self) p.selfNamed = true; scheduleSave(); notify(); } },
  removePerson(id) { state.persons = state.persons.filter(x => x.id !== id); scheduleSave(); notify(); },
  // Auto-label the self person "Me (<first name>)" from the Google display name,
  // unless the user has already renamed it. Called once after load with the
  // signed-in account's displayName. Never hard-codes a real name.
  setSelfNameFromDisplay(displayName) {
    const self = state.persons.find(p => p.self) || state.persons[0];
    if (!self || self.selfNamed) return;
    if (self.name === 'Me' || self.name === 'You') {
      const first = (displayName || '').trim().split(/\s+/)[0];
      const next = first ? ('Me (' + first + ')') : 'Me';
      if (next !== self.name) { self.name = next; scheduleSave(); notify(); }
    }
  },

  // --- categories (kind = 'income' | 'expense') ---
  _cats(kind) { return kind === 'income' ? state.incomeCategories : state.expenseCategories; },
  addGroup(kind, name) { const a = this._cats(kind); a.push({ id: mkId('cat'), name: name.trim(), order: a.length, subs: [] }); scheduleSave(); notify(); },
  renameGroup(kind, id, name) { const g = this._cats(kind).find(x => x.id === id); if (g) { g.name = name.trim(); scheduleSave(); notify(); } },
  removeGroup(kind, id) { const k = kind === 'income' ? 'incomeCategories' : 'expenseCategories'; state[k] = state[k].filter(x => x.id !== id); scheduleSave(); notify(); },
  addSub(kind, groupId, name) { const g = this._cats(kind).find(x => x.id === groupId); if (g) { g.subs.push({ id: mkId('sub'), name: name.trim() }); scheduleSave(); notify(); } },
  removeSub(kind, groupId, subId) { const g = this._cats(kind).find(x => x.id === groupId); if (g) { g.subs = g.subs.filter(s => s.id !== subId); scheduleSave(); notify(); } },

  // --- settings ---
  accountDefaults() { return state.settings.accountDefaults; },
  setAccountDefault(key, val) { state.settings.accountDefaults[key] = !!val; scheduleSave(); notify(); },
  netMonthlyIncome() { return Number(state.settings.netMonthlyIncome) || 0; },
  setNetMonthlyIncome(v) { state.settings.netMonthlyIncome = Number(v) || 0; scheduleSave(); notify(); },

  // --- recurring / subscriptions ---
  saveRecurring(item) {
    if (item.id) { const i = state.recurring.findIndex(x => x.id === item.id); if (i >= 0) state.recurring[i] = item; else state.recurring.push(item); }
    else { item.id = mkId('rec'); state.recurring.push(item); }
    scheduleSave(); notify(); return item;
  },
  removeRecurring(id) { state.recurring = state.recurring.filter(x => x.id !== id); scheduleSave(); notify(); },
  expenseGroup(id) { return state.expenseCategories.find(c => c.id === id) || null; },
  expenseGroupName(id) { const g = this.expenseGroup(id); return g ? g.name : '—'; },

  // --- catalog lists (list = 'institutions' | 'rewardPrograms' | 'giftCardTypes') ---
  addCatalog(list, name) { state.catalog[list].push({ id: mkId('item'), name: name.trim() }); scheduleSave(); notify(); },
  renameCatalog(list, id, name) { const it = state.catalog[list].find(x => x.id === id); if (it) { it.name = name.trim(); scheduleSave(); notify(); } },
  removeCatalog(list, id) { state.catalog[list] = state.catalog[list].filter(x => x.id !== id); scheduleSave(); notify(); },

  // --- accounts ---
  saveAccount(acc) {
    if (acc.id) {
      const i = state.accounts.findIndex(a => a.id === acc.id);
      if (i >= 0) state.accounts[i] = acc; else state.accounts.push(acc);
    } else {
      acc.id = mkId('acct');
      state.accounts.push(acc);
    }
    scheduleSave(); notify();
    return acc;
  },
  removeAccount(id) { state.accounts = state.accounts.filter(a => a.id !== id); scheduleSave(); notify(); },

  // --- per-year documents (income, paychecks, expensePayments, importBatches) ---
  isYearLoaded(y) { return !!state.years[String(y)]; },
  yearData(y) { return state.years[String(y)] || emptyYear(); },
  loadYear(y) {
    y = String(y);
    if (state.years[y]) return Promise.resolve(state.years[y]);
    if (state._yearLoading[y]) return state._yearLoading[y];
    state._yearLoading[y] = (async () => {
      let data = null;
      if (state._uid) { try { data = await window.cloverData.getYear(state._uid, y); } catch (e) { console.warn('year load failed:', e); } }
      state.years[y] = Object.assign(emptyYear(), data || {});
      delete state._yearLoading[y];
      notify();
      return state.years[y];
    })();
    return state._yearLoading[y];
  },
  scheduleSaveYear(y) {
    y = String(y);
    if (!state._uid) return;
    clearTimeout(yearSaveTimers[y]);
    yearSaveTimers[y] = setTimeout(() => this.flushYear(y), 600);
  },
  async flushYear(y) {
    y = String(y);
    const d = state.years[y];
    if (!state._uid || !d) return;
    try { await window.cloverData.saveYear(state._uid, y, d); }
    catch (e) { console.warn('year save failed:', e); window.cloverToast && window.cloverToast('⚠️ Couldn’t save — will retry', 'warn'); }
  },

  // --- income ---
  saveIncome(y, entry) {
    const d = state.years[String(y)]; if (!d) return null;
    if (entry.id) { const i = d.income.findIndex(x => x.id === entry.id); if (i >= 0) d.income[i] = entry; else d.income.push(entry); }
    else { entry.id = mkId('inc'); d.income.push(entry); }
    this.scheduleSaveYear(y); notify(); return entry;
  },
  removeIncome(y, id) { const d = state.years[String(y)]; if (!d) return; d.income = d.income.filter(x => x.id !== id); this.scheduleSaveYear(y); notify(); },

  // --- expense payments (one-off / actual cash-basis expenses) ---
  saveExpense(y, entry) {
    const d = state.years[String(y)]; if (!d) return null;
    if (entry.id) { const i = d.expensePayments.findIndex(x => x.id === entry.id); if (i >= 0) d.expensePayments[i] = entry; else d.expensePayments.push(entry); }
    else { entry.id = mkId('exp'); d.expensePayments.push(entry); }
    this.scheduleSaveYear(y); notify(); return entry;
  },
  removeExpense(y, id) { const d = state.years[String(y)]; if (!d) return; d.expensePayments = d.expensePayments.filter(x => x.id !== id); this.scheduleSaveYear(y); notify(); },

  // --- lookups ---
  personName(id) { const p = state.persons.find(x => x.id === id); return p ? p.name : '—'; },
  incomeGroup(id) { return state.incomeCategories.find(c => c.id === id) || null; },
  incomeGroupName(id) { const g = this.incomeGroup(id); return g ? g.name : '—'; },
  subName(kind, catId, subId) {
    const cats = kind === 'income' ? state.incomeCategories : state.expenseCategories;
    const g = cats.find(c => c.id === catId); if (!g) return '';
    const s = g.subs.find(x => x.id === subId); return s ? s.name : '';
  },
  accountName(id) { const a = state.accounts.find(x => x.id === id); return a ? a.name : ''; },
  account(id) { return state.accounts.find(a => a.id === id) || null; },
  // The account (if any) that lists `id` as the one it continued from — i.e. `id` was rolled over.
  successorOf(id) { return state.accounts.find(a => a.previousAccountId === id) || null; },
  flush
};
