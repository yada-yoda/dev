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
    settings: { activeYear: new Date().getFullYear(), warnWindows: [7, 14, 30, 60] },
    persons: [
      { id: mkId('p'), name: 'You' },
      { id: mkId('p'), name: 'Joint' }
    ],
    incomeCategories: seedGroups(SEED_INCOME_GROUPS),
    expenseCategories: seedGroups(SEED_EXPENSE_GROUPS),
    accounts: [],
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
  s.catalog  = Object.assign({}, d.catalog,  data && data.catalog);
  return s;
}

const state = { _uid: null, _loaded: false, _dirty: false };
const subscribers = new Set();
let saveTimer = null;

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
  renamePerson(id, name) { const p = state.persons.find(x => x.id === id); if (p) { p.name = name.trim(); scheduleSave(); notify(); } },
  removePerson(id) { state.persons = state.persons.filter(x => x.id !== id); scheduleSave(); notify(); },

  // --- categories (kind = 'income' | 'expense') ---
  _cats(kind) { return kind === 'income' ? state.incomeCategories : state.expenseCategories; },
  addGroup(kind, name) { const a = this._cats(kind); a.push({ id: mkId('cat'), name: name.trim(), order: a.length, subs: [] }); scheduleSave(); notify(); },
  renameGroup(kind, id, name) { const g = this._cats(kind).find(x => x.id === id); if (g) { g.name = name.trim(); scheduleSave(); notify(); } },
  removeGroup(kind, id) { const k = kind === 'income' ? 'incomeCategories' : 'expenseCategories'; state[k] = state[k].filter(x => x.id !== id); scheduleSave(); notify(); },
  addSub(kind, groupId, name) { const g = this._cats(kind).find(x => x.id === groupId); if (g) { g.subs.push({ id: mkId('sub'), name: name.trim() }); scheduleSave(); notify(); } },
  removeSub(kind, groupId, subId) { const g = this._cats(kind).find(x => x.id === groupId); if (g) { g.subs = g.subs.filter(s => s.id !== subId); scheduleSave(); notify(); } },

  // --- catalog lists (list = 'institutions' | 'rewardPrograms' | 'giftCardTypes') ---
  addCatalog(list, name) { state.catalog[list].push({ id: mkId('item'), name: name.trim() }); scheduleSave(); notify(); },
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

  personName(id) { const p = state.persons.find(x => x.id === id); return p ? p.name : '—'; },
  flush
};
