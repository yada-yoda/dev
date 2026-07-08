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
      accountDefaults: { active: true, usedForIncome: false, usedForExpenses: false, usedForAutopay: false, rewardsCard: false },
      paycheckCols: null,  // legacy (pre-1.0.24) paycheck column list
      tableCols: {},       // per-table ordered visible-column lists, keyed by table
      dashPanels: null     // dashboard panel order/visibility [{k, c}] (null = default)
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
    },
    creditScores: [],   // {id, date, score, provider}
    rateHistory: [],    // {id, date, accountId, apy}
    // Expected-payroll schedules: {id, name, employer, incomeCategoryId, personId,
    // frequency, anchorDate, day2, gross, net, active} — drive missing-paycheck
    // detection + auto period numbers.
    paySchedules: [],
    // Tax filing history: {id, taxYear, kind:'original'|'amendment', fedForm, stateForm,
    // fedOutcome:'refund'|'owed'|'none', fedAmount, stateOutcome, stateAmount,
    // prepCost, preparer, extended, filedDate, notes}
    taxRecords: []
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

// Coalesce synchronous notify() calls into one microtask render, so a burst of
// mutations (e.g. loading several years at once) can't cause re-entrant renders.
let _notifyScheduled = false;
function notify() {
  if (_notifyScheduled) return;
  _notifyScheduled = true;
  Promise.resolve().then(() => { _notifyScheduled = false; subscribers.forEach(cb => { try { cb(); } catch (e) { console.error(e); } }); });
}

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
    catalog: state.catalog,
    creditScores: state.creditScores,
    rateHistory: state.rateHistory,
    paySchedules: state.paySchedules,
    taxRecords: state.taxRecords
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
  state.creditScores = s.creditScores || [];
  state.rateHistory = s.rateHistory || [];
  state.paySchedules = s.paySchedules || [];
  state.taxRecords = s.taxRecords || [];
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
  setPaycheckCols(arr) { state.settings.paycheckCols = (Array.isArray(arr) && arr.length) ? arr.slice() : null; scheduleSave(); notify(); },
  setTableCols(tableKey, arr) {
    if (!state.settings.tableCols) state.settings.tableCols = {};
    if (Array.isArray(arr) && arr.length) state.settings.tableCols[tableKey] = arr.slice();
    else delete state.settings.tableCols[tableKey];
    scheduleSave(); notify();
  },
  setDashPanels(arr) { state.settings.dashPanels = (Array.isArray(arr) && arr.length) ? arr.map(p => ({ k: p.k, c: p.c ? 1 : 0 })) : null; scheduleSave(); notify(); },

  // --- recurring / subscriptions ---
  saveRecurring(item) {
    if (item.id) { const i = state.recurring.findIndex(x => x.id === item.id); if (i >= 0) state.recurring[i] = item; else state.recurring.push(item); }
    else { item.id = mkId('rec'); state.recurring.push(item); }
    scheduleSave(); notify(); return item;
  },
  removeRecurring(id) { state.recurring = state.recurring.filter(x => x.id !== id); scheduleSave(); notify(); },
  expenseGroup(id) { return state.expenseCategories.find(c => c.id === id) || null; },
  expenseGroupName(id) { const g = this.expenseGroup(id); return g ? g.name : '—'; },

  // --- credit scores + savings-rate history (Phase 5, meta doc, cross-year) ---
  saveCreditScore(entry) {
    if (entry.id) { const i = state.creditScores.findIndex(x => x.id === entry.id); if (i >= 0) state.creditScores[i] = entry; else state.creditScores.push(entry); }
    else { entry.id = mkId('cs'); state.creditScores.push(entry); }
    scheduleSave(); notify(); return entry;
  },
  removeCreditScore(id) { state.creditScores = state.creditScores.filter(x => x.id !== id); scheduleSave(); notify(); },
  saveRate(entry) {
    if (entry.id) { const i = state.rateHistory.findIndex(x => x.id === entry.id); if (i >= 0) state.rateHistory[i] = entry; else state.rateHistory.push(entry); }
    else { entry.id = mkId('rate'); state.rateHistory.push(entry); }
    scheduleSave(); notify(); return entry;
  },
  removeRate(id) { state.rateHistory = state.rateHistory.filter(x => x.id !== id); scheduleSave(); notify(); },
  savePaySchedule(entry) {
    if (entry.id) { const i = state.paySchedules.findIndex(x => x.id === entry.id); if (i >= 0) state.paySchedules[i] = entry; else state.paySchedules.push(entry); }
    else { entry.id = mkId('sch'); state.paySchedules.push(entry); }
    scheduleSave(); notify(); return entry;
  },
  removePaySchedule(id) { state.paySchedules = state.paySchedules.filter(x => x.id !== id); scheduleSave(); notify(); },
  saveTaxRecord(entry) {
    if (entry.id) { const i = state.taxRecords.findIndex(x => x.id === entry.id); if (i >= 0) state.taxRecords[i] = entry; else state.taxRecords.push(entry); }
    else { entry.id = mkId('tax'); state.taxRecords.push(entry); }
    scheduleSave(); notify(); return entry;
  },
  removeTaxRecord(id) { state.taxRecords = state.taxRecords.filter(x => x.id !== id); scheduleSave(); notify(); },

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
  // Force a re-fetch of a year from Firestore (drops the cached copy first), so a
  // manual "refresh" picks up changes made elsewhere. Flushes any pending save first.
  async reloadYear(y) {
    y = String(y);
    await this.flushYear(+y);
    delete state.years[y];
    return this.loadYear(y);
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

  // --- paychecks (source of truth for wages; roll into income categories) ---
  savePaycheck(y, entry) {
    const d = state.years[String(y)]; if (!d) return null;
    if (entry.id) { const i = d.paychecks.findIndex(x => x.id === entry.id); if (i >= 0) d.paychecks[i] = entry; else d.paychecks.push(entry); }
    else { entry.id = mkId('pay'); d.paychecks.push(entry); }
    this.scheduleSaveYear(y); notify(); return entry;
  },
  removePaycheck(y, id) { const d = state.years[String(y)]; if (!d) return; d.paychecks = d.paychecks.filter(x => x.id !== id); this.scheduleSaveYear(y); notify(); },
  bulkUpdatePaychecks(y, ids, changes) {
    const d = state.years[String(y)]; if (!d) return 0;
    const set = new Set(ids); let n = 0;
    d.paychecks.forEach(p => { if (set.has(p.id)) { Object.assign(p, changes); n++; } });
    if (n) { this.scheduleSaveYear(y); notify(); }
    return n;
  },
  // Relabel/merge an employer across every loaded year's paychecks + any pay
  // schedule that used it. Returns how many paychecks were renamed.
  renameEmployer(oldName, newName) {
    const o = (oldName || '').trim().toLowerCase(), n = (newName || '').trim();
    if (!o || !n) return 0;
    let count = 0;
    Object.keys(state.years).forEach(yk => {
      const d = state.years[yk]; if (!d || !d.paychecks) return;
      let changed = false;
      d.paychecks.forEach(p => { if ((p.employer || '').trim().toLowerCase() === o) { p.employer = n; count++; changed = true; } });
      if (changed) this.scheduleSaveYear(+yk);
    });
    (state.paySchedules || []).forEach(sch => { if ((sch.employer || '').trim().toLowerCase() === o) sch.employer = n; });
    scheduleSave(); notify();
    return count;
  },

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

  // --- CSV import (batched, undoable) ---
  importEntries(y, target, entries, batch) {
    const d = state.years[String(y)]; if (!d) return;
    if (target === 'subscriptions') {
      // recurring lives in the meta doc; the batch is still logged in the year doc.
      entries.forEach(e => { e.id = mkId('rec'); e.batchId = batch.id; state.recurring.push(e); });
      d.importBatches = d.importBatches || []; d.importBatches.push(batch);
      scheduleSave(); this.scheduleSaveYear(y); notify(); return;
    }
    const key = target === 'income' ? 'income' : target === 'expenses' ? 'expensePayments' : 'paychecks';
    entries.forEach(e => { e.id = mkId(target.slice(0, 3)); e.batchId = batch.id; d[key].push(e); });
    d.importBatches = d.importBatches || [];
    // One history entry per batch per year, even when a batch spans targets
    // (e.g. dividends + their fees land in income AND expensePayments).
    if (!d.importBatches.some(b => b.id === batch.id)) d.importBatches.push(batch);
    this.scheduleSaveYear(y); notify();
  },
  undoImportBatch(y, batchId) {
    // A batch can span multiple years — remove it from every loaded year.
    Object.keys(state.years).forEach(yr => {
      const d = state.years[yr];
      ['income', 'expensePayments', 'paychecks'].forEach(k => { d[k] = d[k].filter(e => e.batchId !== batchId); });
      d.importBatches = (d.importBatches || []).filter(b => b.id !== batchId);
      this.scheduleSaveYear(yr);
    });
    if (state.recurring.some(r => r.batchId === batchId)) { state.recurring = state.recurring.filter(r => r.batchId !== batchId); scheduleSave(); }
    notify();
  },

  // --- backup / restore ---
  exportAll() { return { app: 'clover', meta: snapshot(), years: JSON.parse(JSON.stringify(state.years)) }; },
  async restore(obj) {
    if (obj.meta) { apply(obj.meta); if (state._uid) { try { await window.cloverData.saveMeta(state._uid, snapshot()); } catch (e) { console.warn(e); } } }
    if (obj.years) {
      for (const y of Object.keys(obj.years)) {
        state.years[y] = Object.assign(emptyYear(), obj.years[y]);
        if (state._uid) { try { await window.cloverData.saveYear(state._uid, y, state.years[y]); } catch (e) { console.warn(e); } }
      }
    }
    notify();
  },
  account(id) { return state.accounts.find(a => a.id === id) || null; },
  // The account (if any) that lists `id` as the one it continued from — i.e. `id` was rolled over.
  successorOf(id) { return state.accounts.find(a => a.previousAccountId === id) || null; },
  flush
};
