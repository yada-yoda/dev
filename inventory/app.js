/* ============================================================
   The Ledger — Inventory Application
   Pure vanilla JS, localStorage persistence
   Features: UPC lookup, barcode scanning, Beanie DB auto-fill,
             Multi-format import/export
   ============================================================ */

const APP_VERSION = '0.10.2';

const STORAGE_KEY = 'theLedger.inventory.v1';
const SETTINGS_KEY = 'theLedger.settings.v1';
// Set ONLY when the user clicks "Exit demo" — that's an explicit "I want
// to start fresh, don't auto-demo me again." Auto-demo otherwise fires on
// every load when there's no inventory data and the user hasn't signed in,
// so visitors keep seeing the populated app even on repeat visits.
const DEMO_DISMISSED_KEY = 'theLedger.demoDismissed.v1';

const DEFAULT_FIELDS = {
  id: '', name: '', category: 'Beanie Baby', sku: '', upc: '',
  brand: '', model: '', size: '', color: '', material: '',
  country: '', location: '', quantity: 1,
  // Beanie-specific
  bb_year: '', bb_birthday: '', bb_poem: '',
  bb_swing_gen: '', bb_tush_gen: '',
  bb_swing_cond: 'Mint (no creases/bends)', bb_tush_cond: 'Mint',
  bb_style_num: '', bb_pellets: '',
  bb_errors: '', bb_rarity: '',
  // Variations (each one is unique — tye-dye, hand-painted, color-varied)
  has_variations: false, variation_description: '',
  // Condition
  condition: 'Like New / Excellent Used', condition_notes: '',
  has_packaging: 'No',
  environment: 'Smoke-free & Pet-free home',
  authentication: '',
  // Listing
  listing_title: '', listing_desc: '',
  listing_desc_ebay: '', listing_desc_poshmark: '',
  tags: '',
  cost: '', price: '', min_price: '', sold_price: '',
  // Additional cost basis
  item_tax: '', other_expenses: '', other_expenses_notes: '',
  status: 'Draft', sold_platform: '',
  date_listed: '', date_sold: '',
  url_poshmark: '', url_ebay: '',
  ebay_item_number: '', poshmark_order_number: '',
  // Pricing research (manual entries with date stamps)
  research_ebay_avg: '', research_ebay_date: '', research_ebay_notes: '',
  research_poshmark_avg: '', research_poshmark_date: '', research_poshmark_notes: '',
  research_guide_avg: '', research_guide_date: '', research_guide_notes: '',
  // Shipping
  weight_value: '', weight_unit: 'oz', dim_unit: 'in',
  box_length: '', box_width: '', box_height: '',
  package_type: 'Padded Mailer / Bubble Mailer',
  carrier: 'USPS Ground Advantage',
  ship_cost: '',     // Postage charged to buyer (kept name for back-compat)
  postage_paid: '',  // Actual label cost we paid
  ship_notes: '',
  // Platform fees (filled when sold; Auto-fill button computes standard rates)
  fee_ebay_insertion: '',
  fee_ebay_fvf: '',
  fee_ebay_fvf_shipping: '',
  fee_ebay_per_order: '',
  fee_poshmark: '',
  fee_paypal: '',
  fee_other: '', fee_other_notes: '',
  // Photos & notes
  photos: [], private_notes: '',
  // Meta
  created_at: '', updated_at: ''
};

// ============ STATE ============
let state = {
  items: [],
  settings: { view: 'grid' },
  currentEditId: null,
  currentPhotos: [],
  filter: { search: '', category: '', status: '', sort: 'created_desc' },
  scanner: { stream: null, detector: null, loop: null },
  demoMode: false
};

// ============ STORAGE ============
function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) state.items = JSON.parse(saved);
    const settings = localStorage.getItem(SETTINGS_KEY);
    if (settings) state.settings = { ...state.settings, ...JSON.parse(settings) };
  } catch (e) {
    console.error('Load failed:', e);
    toast('Could not load saved data', 'error');
  }
}

function saveState() {
  // Demo mode is purely in-memory — never persist.
  if (state.demoMode) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch (e) {
    console.error('Save failed:', e);
    toast('Save failed — storage may be full. Export a backup.', 'error');
  }
}

// ============ UTIL ============
function uid() { return 'it_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function nowISO() { return new Date().toISOString(); }
function formatMoney(v) {
  const n = parseFloat(v);
  if (!isFinite(n) || n === 0) return '';
  return '$' + n.toFixed(2);
}
function slug(s) { return (s || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 3400);
}

function confirmDialog(title, message, options = {}) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    const ok = document.getElementById('confirmOk');
    const cancel = document.getElementById('confirmCancel');
    ok.textContent = options.okLabel || 'Confirm';
    cancel.textContent = options.cancelLabel || 'Cancel';
    ok.className = 'btn ' + (options.okClass || 'btn-danger');
    modal.classList.add('open');
    const cleanup = (result) => {
      modal.classList.remove('open');
      ok.onclick = null; cancel.onclick = null;
      ok.textContent = 'Confirm';
      ok.className = 'btn btn-danger';
      cancel.textContent = 'Cancel';
      resolve(result);
    };
    ok.onclick = () => cleanup(true);
    cancel.onclick = () => cleanup(false);
    modal.querySelector('.modal-backdrop').onclick = () => cleanup(false);
  });
}

// ============ SKU GEN ============
function nextSku(category) {
  const prefix = (category === 'Beanie Baby') ? 'BB-' : (slug(category).slice(0, 3).toUpperCase() + '-');
  let max = 0;
  state.items.forEach(it => {
    if (it.sku && it.sku.startsWith(prefix)) {
      const num = parseInt(it.sku.slice(prefix.length), 10);
      if (isFinite(num) && num > max) max = num;
    }
  });
  return prefix + String(max + 1).padStart(4, '0');
}

// ============ RENDER ============
function render() {
  renderStats();
  const filtered = applyFilters(state.items);
  const grid = document.getElementById('itemGrid');
  const table = document.getElementById('itemTable');
  const empty = document.getElementById('emptyState');
  const count = document.getElementById('resultCount');
  const view = state.settings.view;

  if (state.items.length === 0) {
    grid.style.display = 'none';
    table.style.display = 'none';
    empty.classList.add('visible');
    count.textContent = '';
    return;
  }

  empty.classList.remove('visible');
  count.textContent = `${filtered.length} of ${state.items.length} items`;

  if (view === 'grid') {
    grid.style.display = '';
    table.style.display = 'none';
    grid.innerHTML = filtered.map(renderCard).join('');
  } else {
    grid.style.display = 'none';
    table.style.display = '';
    table.innerHTML = renderTable(filtered);
  }

  document.querySelectorAll('[data-edit-id]').forEach(el => {
    el.addEventListener('click', () => openEditor(el.dataset.editId));
  });
  populateCategoryFilter();
}

function renderStats() {
  const total = state.items.length;
  const active = state.items.filter(i => ['Listed - Poshmark','Listed - eBay','Listed - Both','Ready to List'].includes(i.status)).length;
  const sold = state.items.filter(i => ['Sold','Shipped'].includes(i.status)).length;
  const value = state.items.reduce((sum, i) => {
    const price = parseFloat(i.price) || 0;
    return (['Sold','Shipped','Archived'].includes(i.status)) ? sum : sum + price;
  }, 0);
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statActive').textContent = active;
  document.getElementById('statSold').textContent = sold;
  document.getElementById('statValue').textContent = '$' + value.toFixed(0);
  // Reflect current scope filter on the stat cards
  const scope = state.filter.scope || '';
  document.querySelectorAll('.stat[data-scope]').forEach(el => {
    const elScope = el.dataset.scope;
    const matches = (elScope === 'all' && !scope) || (elScope === scope);
    el.classList.toggle('selected', matches);
  });
}

function renderCard(item) {
  const img = (item.photos && item.photos[0])
    ? `<img src="${item.photos[0]}" alt="${escapeHtml(item.name)}" />`
    : `<span class="card-image-placeholder">
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="20" cy="22" r="6"/><circle cx="44" cy="22" r="6"/>
          <circle cx="32" cy="34" r="14"/>
          <circle cx="26" cy="32" r="1.5" fill="currentColor"/><circle cx="38" cy="32" r="1.5" fill="currentColor"/>
          <path d="M 28 40 Q 32 42.5 36 40" stroke-linecap="round"/>
        </svg>
      </span>`;
  const metaParts = [];
  if (item.category) metaParts.push(escapeHtml(item.category));
  if (item.bb_year) metaParts.push(escapeHtml(item.bb_year));
  if (item.brand && item.category !== 'Beanie Baby') metaParts.push(escapeHtml(item.brand));
  if (item.location) metaParts.push(escapeHtml(item.location));

  const statusClass = 'status-' + slug(item.status || 'draft');
  const price = item.status === 'Sold' || item.status === 'Shipped'
    ? (item.sold_price ? `<span class="card-price sold">${formatMoney(item.sold_price)}</span>` : `<span class="card-price no-price">Sold</span>`)
    : (item.price ? `<span class="card-price">${formatMoney(item.price)}</span>` : `<span class="card-price no-price">unpriced</span>`);

  return `
    <div class="item-card" data-edit-id="${item.id}">
      <div class="card-image">${img}</div>
      <div class="card-body">
        <div class="card-sku">${escapeHtml(item.sku || '—')}</div>
        <div class="card-name">${escapeHtml(item.name || 'Untitled')}</div>
        <div class="card-meta">${metaParts.map((p, i) => i === 0 ? p : `<span class="card-meta-dot">·</span>${p}`).join(' ')}</div>
        <div class="card-footer">
          ${price}
          <span class="status-badge ${statusClass}">${escapeHtml(item.status || 'Draft')}</span>
        </div>
      </div>
    </div>`;
}

function renderTable(items) {
  return `<table><thead><tr>
    <th>SKU</th><th>Name</th><th>Category</th><th>Year</th>
    <th>Condition</th><th>Status</th><th>Price</th><th>Location</th>
  </tr></thead><tbody>${items.map(i => `
    <tr data-edit-id="${i.id}">
      <td class="col-sku">${escapeHtml(i.sku || '—')}</td>
      <td class="col-name">${escapeHtml(i.name || 'Untitled')}</td>
      <td>${escapeHtml(i.category || '')}</td>
      <td>${escapeHtml(i.bb_year || '')}</td>
      <td>${escapeHtml(i.condition || '')}</td>
      <td><span class="status-badge status-${slug(i.status || 'draft')}">${escapeHtml(i.status || 'Draft')}</span></td>
      <td class="col-price">${formatMoney(i.status === 'Sold' || i.status === 'Shipped' ? i.sold_price : i.price) || '—'}</td>
      <td>${escapeHtml(i.location || '')}</td>
    </tr>`).join('')}</tbody></table>`;
}

function populateCategoryFilter() {
  const sel = document.getElementById('filterCategory');
  const current = sel.value;
  const cats = [...new Set(state.items.map(i => i.category).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option value="${escapeHtml(c)}"${c === current ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
}

// ============ FILTERS ============
// Active = items currently for sale or queued to list. Drafts are excluded
// because the stat-card count (renderStats) also excludes them — keep
// these two definitions in sync.
const ACTIVE_STATUSES = ['Ready to List', 'Listed - Poshmark', 'Listed - eBay', 'Listed - Both'];
const SOLD_STATUSES = ['Sold', 'Shipped'];

function applyFilters(items) {
  const { search, category, status, sort, scope } = state.filter;
  let result = items.filter(i => {
    if (scope === 'active' && !ACTIVE_STATUSES.includes(i.status)) return false;
    if (scope === 'sold' && !SOLD_STATUSES.includes(i.status)) return false;
    if (category && i.category !== category) return false;
    if (status && i.status !== status) return false;
    if (search) {
      const q = search.toLowerCase();
      const blob = [i.name, i.sku, i.upc, i.brand, i.tags, i.location, i.listing_title, i.bb_year, i.category]
        .join(' ').toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
  const sorters = {
    created_desc: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
    created_asc: (a, b) => (a.created_at || '').localeCompare(b.created_at || ''),
    name_asc: (a, b) => (a.name || '').localeCompare(b.name || ''),
    name_desc: (a, b) => (b.name || '').localeCompare(a.name || ''),
    price_desc: (a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0),
    price_asc: (a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0),
    sku_asc: (a, b) => (a.sku || '').localeCompare(b.sku || '', undefined, { numeric: true }),
  };
  result.sort(sorters[sort] || sorters.created_desc);
  return result;
}

// ============ EDITOR ============
function setFieldValue(el, value) {
  if (!el || el.type === 'file') return;
  if (el.type === 'checkbox') {
    el.checked = !!value;
  } else {
    el.value = value ?? '';
  }
}

function syncVariationFieldVisibility() {
  const toggle = document.getElementById('hasVariationsToggle');
  const field = document.getElementById('variationDescField');
  if (!toggle || !field) return;
  field.style.display = toggle.checked ? '' : 'none';
}

// ============ PRICING RESEARCH ============
// Estimate net after typical platform fees:
//   Poshmark — 20% on sales >= $15, flat $2.95 below; we use the 80% rule
//              for any price (close enough for the suggest panel).
//   eBay     — ~13% final value fee + tiny payment-processing flat. We
//              approximate as 87% of asking price.
const POSHMARK_NET_RATE = 0.80;
const EBAY_NET_RATE     = 0.87;
const STALE_DAYS = 30;

function isResearchStale(dateStr) {
  if (!dateStr) return false;
  const t = Date.parse(dateStr);
  if (isNaN(t)) return false;
  const daysOld = (Date.now() - t) / (1000 * 60 * 60 * 24);
  return daysOld > STALE_DAYS;
}

function updateResearchSummary() {
  const form = document.getElementById('itemForm');
  if (!form) return;

  const ebayVal = parseFloat(form.elements.research_ebay_avg.value);
  const poshVal = parseFloat(form.elements.research_poshmark_avg.value);
  const guideVal = parseFloat(form.elements.research_guide_avg.value);

  const present = [ebayVal, poshVal, guideVal].filter(v => isFinite(v) && v > 0);
  const valueEl = document.getElementById('suggestedPrice');
  const subEl   = document.getElementById('suggestedSub');
  const useBtn  = document.getElementById('useSuggestedPrice');
  const marginRow = document.getElementById('marginRow');

  if (present.length === 0) {
    valueEl.textContent = '—';
    valueEl.classList.add('empty');
    subEl.textContent = 'Fill in any platform above';
    useBtn.disabled = true;
    marginRow.hidden = true;
  } else {
    const avg = present.reduce((a, b) => a + b, 0) / present.length;
    valueEl.textContent = '$' + avg.toFixed(2);
    valueEl.classList.remove('empty');
    subEl.textContent = `Average of ${present.length} ${present.length === 1 ? 'source' : 'sources'}`;
    useBtn.disabled = false;
    useBtn.dataset.value = avg.toFixed(2);

    // Margin estimate uses the suggested avg as the asking price proxy
    const cost = parseFloat(form.elements.cost.value) || 0;
    const poshNet = avg * POSHMARK_NET_RATE;
    const ebayNet = avg * EBAY_NET_RATE;
    document.getElementById('marginPoshmark').textContent = '$' + poshNet.toFixed(2);
    document.getElementById('marginEbay').textContent = '$' + ebayNet.toFixed(2);
    if (cost > 0) {
      const poshProfit = poshNet - cost;
      const ebayProfit = ebayNet - cost;
      const psub = document.getElementById('marginPoshmarkSub');
      const esub = document.getElementById('marginEbaySub');
      psub.textContent = (poshProfit >= 0 ? 'Profit ' : 'Loss ') + '$' + Math.abs(poshProfit).toFixed(2) + ' over $' + cost.toFixed(2) + ' cost';
      esub.textContent = (ebayProfit >= 0 ? 'Profit ' : 'Loss ') + '$' + Math.abs(ebayProfit).toFixed(2) + ' over $' + cost.toFixed(2) + ' cost';
      document.getElementById('marginPoshmark').classList.toggle('profit', poshProfit >= 0);
      document.getElementById('marginPoshmark').classList.toggle('loss', poshProfit < 0);
      document.getElementById('marginEbay').classList.toggle('profit', ebayProfit >= 0);
      document.getElementById('marginEbay').classList.toggle('loss', ebayProfit < 0);
    } else {
      document.getElementById('marginPoshmarkSub').innerHTML = '&nbsp;';
      document.getElementById('marginEbaySub').innerHTML = '&nbsp;';
      document.getElementById('marginPoshmark').classList.remove('profit', 'loss');
      document.getElementById('marginEbay').classList.remove('profit', 'loss');
    }
    marginRow.hidden = false;
  }

  // Stale badges
  const platformDates = {
    ebay: form.elements.research_ebay_date.value,
    poshmark: form.elements.research_poshmark_date.value,
    guide: form.elements.research_guide_date.value
  };
  Object.entries(platformDates).forEach(([key, date]) => {
    const badge = document.querySelector(`.research-stale[data-stale-for="${key}"]`);
    if (badge) badge.hidden = !isResearchStale(date);
  });
}

function openEditor(id = null) {
  const modal = document.getElementById('itemModal');
  const form = document.getElementById('itemForm');
  form.reset();
  state.currentEditId = id;
  state.currentPhotos = [];

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'basics'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === 'basics'));
  document.getElementById('upcStatus').textContent = '';
  document.getElementById('upcStatus').className = 'lookup-status';
  document.getElementById('beanieLookupResults').classList.remove('open');

  let item;
  if (id) {
    item = state.items.find(i => i.id === id);
    if (!item) return;
    document.getElementById('modalEyebrow').textContent = `Entry · ${item.sku || '—'}`;
    document.getElementById('modalTitle').textContent = item.name || 'Untitled';
    document.getElementById('deleteBtn').style.display = '';
    Object.entries(item).forEach(([k, v]) => {
      setFieldValue(form.elements[k], v);
    });
    state.currentPhotos = [...(item.photos || [])];
  } else {
    item = { ...DEFAULT_FIELDS };
    document.getElementById('modalEyebrow').textContent = 'New Entry';
    document.getElementById('modalTitle').textContent = 'Catalogue Item';
    document.getElementById('deleteBtn').style.display = 'none';
    Object.entries(DEFAULT_FIELDS).forEach(([k, v]) => {
      const el = form.elements[k];
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = !!v;
      } else if (el.type !== 'file' && v !== '' && v != null) {
        el.value = v;
      }
    });
    form.elements.sku.value = nextSku(form.elements.category.value);
  }

  toggleBeanieTab(form.elements.category.value);
  syncVariationFieldVisibility();
  updateResearchSummary();
  updatePnl();
  renderPhotoPreview();
  updateTitleCount();
  modal.classList.add('open');
  setTimeout(() => form.elements.name.focus(), 100);
}

function closeEditor() {
  document.getElementById('itemModal').classList.remove('open');
  state.currentEditId = null;
  state.currentPhotos = [];
  document.getElementById('beanieSuggest').classList.remove('open');
}

function toggleBeanieTab(category) {
  const tab = document.getElementById('beanieTab');
  tab.style.display = (category === 'Beanie Baby') ? '' : 'none';
}

function updateTitleCount() {
  const input = document.querySelector('[name="listing_title"]');
  const counter = document.getElementById('titleCount');
  if (input && counter) {
    const len = input.value.length;
    counter.textContent = `${len} / 80${len > 50 ? ' (over Poshmark limit)' : ''}`;
    counter.className = 'char-count' + (len > 80 ? ' error' : len > 50 ? ' over' : '');
  }
}

async function saveItem(e) {
  e.preventDefault();
  const form = document.getElementById('itemForm');
  const data = {};
  Array.from(form.elements).forEach(el => {
    if (!el.name) return;
    data[el.name] = (el.type === 'checkbox') ? el.checked : el.value;
  });

  if (!data.name.trim()) { toast('Name is required', 'error'); return; }
  if (!data.sku.trim()) { toast('SKU is required', 'error'); return; }
  const dup = state.items.find(i => i.sku === data.sku && i.id !== state.currentEditId);
  if (dup) { toast(`SKU "${data.sku}" is already used by "${dup.name}"`, 'error'); return; }

  data.quantity = parseInt(data.quantity, 10) || 1;
  data.photos = state.currentPhotos;

  let savedItem;
  if (state.currentEditId) {
    const idx = state.items.findIndex(i => i.id === state.currentEditId);
    if (idx >= 0) {
      data.id = state.currentEditId;
      data.created_at = state.items[idx].created_at || nowISO();
      data.updated_at = nowISO();
      state.items[idx] = { ...DEFAULT_FIELDS, ...state.items[idx], ...data };
      savedItem = state.items[idx];
    }
  } else {
    data.id = uid();
    data.created_at = nowISO();
    data.updated_at = nowISO();
    savedItem = { ...DEFAULT_FIELDS, ...data };
    state.items.unshift(savedItem);
  }
  saveState();
  closeEditor();
  render();
  toast('Saved', 'success');

  if (savedItem && isSignedIn()) {
    try {
      const hasBase64 = (savedItem.photos || []).some(p => typeof p === 'string' && p.startsWith('data:'));
      if (hasBase64 && window.firebaseStorageApi) {
        const urls = await Promise.all((savedItem.photos || []).map(async (p) => {
          if (typeof p === 'string' && p.startsWith('data:')) {
            return await window.firebaseStorageApi.uploadPhoto(cloudUid, savedItem.id, p);
          }
          return p;
        }));
        savedItem.photos = urls;
        const idx = state.items.findIndex(i => i.id === savedItem.id);
        if (idx >= 0) state.items[idx].photos = urls;
        saveState();
        render();
      }
      cloudSaveItemSafe(savedItem);
    } catch (err) {
      console.error('Photo upload failed:', err);
      toast('Photo upload failed — item saved to cloud without new photos', 'error');
      cloudSaveItemSafe(savedItem);
    }
  }
}

async function deleteCurrentItem() {
  if (!state.currentEditId) return;
  const item = state.items.find(i => i.id === state.currentEditId);
  if (!item) return;
  const ok = await confirmDialog('Delete Item', `Permanently delete "${item.name}"? This cannot be undone.`);
  if (!ok) return;
  const deletedId = state.currentEditId;
  state.items = state.items.filter(i => i.id !== deletedId);
  saveState();
  cloudDeleteItemSafe(deletedId);
  if (isSignedIn() && window.firebaseStorageApi) {
    window.firebaseStorageApi.deleteItemPhotos(cloudUid, deletedId);
  }
  closeEditor();
  render();
  toast('Item deleted', 'success');
}

// ============ UPC LOOKUP ============
async function lookupUPC(upc) {
  const status = document.getElementById('upcStatus');
  const code = upc.replace(/\D/g, '');
  if (code.length < 8) {
    status.textContent = 'Enter at least 8 digits';
    status.className = 'lookup-status error';
    return;
  }

  status.textContent = 'Looking up product data…';
  status.className = 'lookup-status loading';

  // Try multiple free APIs in sequence.
  // 1) Open Food Facts (free, no key) - general products despite the name
  // 2) Open Library - books (ISBN)
  const results = await Promise.allSettled([
    fetchOpenFoodFacts(code),
    (code.length === 10 || code.length === 13) ? fetchOpenLibrary(code) : Promise.reject()
  ]);

  let found = null;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) { found = r.value; break; }
  }

  if (found) {
    applyProductData(found);
    status.innerHTML = `✓ Found via <strong>${found.source}</strong> — review the auto-filled fields`;
    status.className = 'lookup-status success';
  } else {
    status.innerHTML = `No match found in public databases. This is normal for vintage/collectible items — fill in manually. UPC is saved for reference.`;
    status.className = 'lookup-status';
  }
}

async function fetchOpenFoodFacts(code) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;
    const p = data.product;
    return {
      source: 'Open Food Facts',
      name: p.product_name || p.generic_name || '',
      brand: p.brands || '',
      country: p.countries || '',
      material: p.packaging || '',
      size: p.quantity || '',
      image: (p.image_front_url || p.image_url || '')
    };
  } catch (e) { return null; }
}

async function fetchOpenLibrary(isbn) {
  try {
    const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`);
    if (!res.ok) return null;
    const data = await res.json();
    const key = `ISBN:${isbn}`;
    if (!data[key]) return null;
    const b = data[key];
    return {
      source: 'Open Library',
      name: b.title || '',
      brand: (b.authors && b.authors[0]) ? b.authors[0].name : '',
      model: b.publishers && b.publishers[0] ? b.publishers[0].name : '',
      country: '',
      size: b.number_of_pages ? b.number_of_pages + ' pages' : '',
      material: 'Book',
      image: (b.cover && (b.cover.large || b.cover.medium)) || ''
    };
  } catch (e) { return null; }
}

function applyProductData(data) {
  const form = document.getElementById('itemForm');
  // Only fill empty fields — don't overwrite user-entered data
  const setIfEmpty = (name, value) => {
    if (!value) return;
    const el = form.elements[name];
    if (el && !el.value) el.value = value;
  };
  setIfEmpty('name', data.name);
  setIfEmpty('brand', data.brand);
  setIfEmpty('country', data.country);
  setIfEmpty('material', data.material);
  setIfEmpty('size', data.size);
  setIfEmpty('model', data.model);

  // If there's an image and user has no photos, try to add it
  if (data.image && state.currentPhotos.length === 0) {
    addPhotoFromUrl(data.image).catch(() => {/* ignore */});
  }

  // Switch category away from Beanie Baby if it was the default and this looks non-Beanie
  const cat = form.elements.category;
  if (cat.value === 'Beanie Baby' && data.source !== 'Ty') {
    if (data.material === 'Book') cat.value = 'Books / Media';
    else cat.value = 'Other';
    toggleBeanieTab(cat.value);
  }
}

async function addPhotoFromUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const blob = await res.blob();
    const reader = new FileReader();
    reader.onload = e => {
      downscaleImage(e.target.result, 900).then(data => {
        state.currentPhotos.push(data);
        renderPhotoPreview();
      });
    };
    reader.readAsDataURL(blob);
  } catch (e) { /* CORS or network issue — ignore silently */ }
}

// ============ BARCODE SCANNER ============

// Lazy-load the barcode-detector polyfill ONLY if native BarcodeDetector
// is missing. Avoids paying ~280 KB on Chrome/Edge/Samsung where it's
// built in. Side-effects entry patches globalThis.BarcodeDetector for us
// so the rest of this code can keep using `new BarcodeDetector()`.
let polyfillPromise = null;
async function ensureBarcodeDetector() {
  if ('BarcodeDetector' in window) return true;
  if (!polyfillPromise) {
    polyfillPromise = import('https://cdn.jsdelivr.net/npm/barcode-detector@2/dist/es/side-effects.min.js')
      .catch(err => { polyfillPromise = null; throw err; });
  }
  try {
    await polyfillPromise;
    return 'BarcodeDetector' in window;
  } catch (err) {
    console.error('Failed to load barcode-detector polyfill:', err);
    return false;
  }
}

async function openScanner() {
  const modal = document.getElementById('scannerModal');
  const video = document.getElementById('scannerVideo');
  const status = document.getElementById('scannerStatus');

  modal.classList.add('open');

  if (!('BarcodeDetector' in window)) {
    status.textContent = 'Loading scanner for this browser…';
  } else {
    status.textContent = 'Starting camera…';
  }

  const supported = await ensureBarcodeDetector();
  if (!supported) {
    status.textContent = 'Barcode scanning is not available here.';
    toast('Scanner could not load. You can still type the UPC manually above.', 'error');
    return;
  }
  status.textContent = 'Starting camera…';

  try {
    const formats = await BarcodeDetector.getSupportedFormats();
    state.scanner.detector = new BarcodeDetector({ formats: formats });
    state.scanner.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    video.srcObject = state.scanner.stream;
    await video.play();
    status.textContent = 'Position the barcode in the frame…';
    scanLoop();
  } catch (e) {
    console.error(e);
    status.textContent = 'Camera access denied or unavailable.';
    toast('Camera access failed: ' + e.message, 'error');
  }
}

function scanLoop() {
  const video = document.getElementById('scannerVideo');
  const modal = document.getElementById('scannerModal');
  if (!modal.classList.contains('open') || !state.scanner.detector) return;
  state.scanner.detector.detect(video)
    .then(codes => {
      if (codes && codes.length > 0) {
        const code = codes[0].rawValue;
        closeScanner();
        document.getElementById('upcInput').value = code;
        toast(`Scanned: ${code}`, 'success');
        lookupUPC(code);
      } else {
        state.scanner.loop = requestAnimationFrame(scanLoop);
      }
    })
    .catch(() => {
      state.scanner.loop = requestAnimationFrame(scanLoop);
    });
}

function closeScanner() {
  const modal = document.getElementById('scannerModal');
  modal.classList.remove('open');
  if (state.scanner.stream) {
    state.scanner.stream.getTracks().forEach(t => t.stop());
    state.scanner.stream = null;
  }
  if (state.scanner.loop) {
    cancelAnimationFrame(state.scanner.loop);
    state.scanner.loop = null;
  }
  state.scanner.detector = null;
}

// ============ BEANIE DB ============
function onBeanieNameInput(value) {
  const form = document.getElementById('itemForm');
  if (form.elements.category.value !== 'Beanie Baby') return;

  const sug = document.getElementById('beanieSuggest');
  if (!value || value.length < 2) {
    sug.classList.remove('open');
    return;
  }
  const results = searchBeanieDB(value);
  if (results.length === 0) {
    sug.classList.remove('open');
    return;
  }
  sug.innerHTML = results.map((r, idx) => `
    <button type="button" data-bb-idx="${idx}">
      <strong>${escapeHtml(r.name)}</strong>
      <small>${escapeHtml(r.year || '')}${r.style ? ' · Style #' + escapeHtml(r.style) : ''}${r.retired ? ' · Retired ' + escapeHtml(r.retired) : ''}</small>
    </button>
  `).join('');
  sug.classList.add('open');
  sug.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      fillFromBeanieEntry(results[parseInt(btn.dataset.bbIdx, 10)]);
      sug.classList.remove('open');
    };
  });
}

function doBeanieLookup() {
  const query = document.getElementById('beanieLookupInput').value;
  const results = searchBeanieDB(query);
  const resEl = document.getElementById('beanieLookupResults');
  if (results.length === 0) {
    resEl.innerHTML = `<div style="padding: 0.7rem; color: var(--text-2); font-size: 0.85rem;">No matches found. Try a different spelling, or fill fields below and click <strong>Save to DB</strong> to add your own entry.</div>`;
    resEl.classList.add('open');
    return;
  }
  resEl.innerHTML = results.map((r, idx) => `
    <button type="button" class="beanie-result" data-bb-idx="${idx}">
      <strong>${escapeHtml(r.name)}</strong>
      <small>${escapeHtml(r.year || '')}${r.style ? ' · Style #' + escapeHtml(r.style) : ''}${r.retired ? ' · Retired ' + escapeHtml(r.retired) : ''}${r.notes ? ' — ' + escapeHtml(r.notes.slice(0, 80)) + (r.notes.length > 80 ? '…' : '') : ''}</small>
    </button>
  `).join('');
  resEl.classList.add('open');
  resEl.querySelectorAll('.beanie-result').forEach(btn => {
    btn.onclick = () => fillFromBeanieEntry(results[parseInt(btn.dataset.bbIdx, 10)]);
  });
}

function fillFromBeanieEntry(entry) {
  const form = document.getElementById('itemForm');
  const setIfEmpty = (name, val) => {
    if (!val) return;
    const el = form.elements[name];
    if (el && !el.value) el.value = val;
  };
  // Name is ALWAYS replaced with the canonical DB value — the user's partial
  // typing (which triggered the suggest in the first place) shouldn't win
  // over the entry they just clicked on.
  if (entry.name) form.elements.name.value = entry.name;
  setIfEmpty('bb_year', entry.year);
  setIfEmpty('bb_birthday', entry.birthday);
  setIfEmpty('bb_poem', entry.poem);
  setIfEmpty('bb_style_num', entry.style);
  setIfEmpty('brand', 'Ty Inc.');
  // Retirement → rarity field
  if (entry.retired || entry.notes) {
    const el = form.elements.bb_rarity;
    if (el && !el.value) {
      const parts = [];
      if (entry.retired) parts.push('Retired ' + entry.retired);
      if (entry.notes) parts.push(entry.notes);
      el.value = parts.join('. ');
    }
  }
  toast(`Filled from: ${entry.name}`, 'success');
  // Switch to beanie tab to show results
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'beanie'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === 'beanie'));
}

function saveCurrentAsBeanie() {
  const form = document.getElementById('itemForm');
  const name = form.elements.name.value.trim();
  if (!name) { toast('Enter a name first', 'error'); return; }
  const entry = {
    name,
    year: form.elements.bb_year.value,
    birthday: form.elements.bb_birthday.value,
    style: form.elements.bb_style_num.value,
    poem: form.elements.bb_poem.value,
    retired: '',
    notes: form.elements.bb_rarity.value,
    custom: true
  };
  saveUserBeanie(entry);
  cloudSaveBeanieSafe(entry);
  toast(`"${name}" saved to your reference DB`, 'success');
}

// ============ PHOTOS ============
function handlePhotoFiles(files) {
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      downscaleImage(e.target.result, 900).then(data => {
        state.currentPhotos.push(data);
        renderPhotoPreview();
      });
    };
    reader.readAsDataURL(file);
  });
}

function downscaleImage(dataUrl, maxDim) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function renderPhotoPreview() {
  const el = document.getElementById('photoPreview');
  el.innerHTML = state.currentPhotos.map((src, idx) => `
    <div class="photo-thumb">
      <img src="${src}" alt="photo ${idx + 1}" />
      <button type="button" class="photo-remove" data-idx="${idx}">×</button>
    </div>`).join('');
  el.querySelectorAll('.photo-remove').forEach(btn => {
    btn.onclick = () => {
      state.currentPhotos.splice(parseInt(btn.dataset.idx, 10), 1);
      renderPhotoPreview();
    };
  });
}

// ============ IMPORT / EXPORT ============
function exportJSON() {
  const payload = {
    exported_at: nowISO(),
    app: 'The Ledger',
    version: 1,
    count: state.items.length,
    items: state.items,
    userBeanies: getUserBeanies()
  };
  downloadBlob(JSON.stringify(payload, null, 2), `ledger-backup-${todayStr()}.json`, 'application/json');
  toast(`Exported ${state.items.length} items`, 'success');
}

function exportCSV() {
  if (!state.items.length) { toast('No items to export', 'error'); return; }
  const fields = Object.keys(DEFAULT_FIELDS).filter(f => f !== 'photos');
  const header = fields.join(',');
  const rows = state.items.map(i => fields.map(f => csvEscape(i[f])).join(','));
  downloadBlob([header, ...rows].join('\n'), `ledger-${todayStr()}.csv`, 'text/csv');
  toast('CSV exported', 'success');
}

function exportPoshmark() {
  const listable = state.items.filter(i => !['Sold','Shipped','Archived'].includes(i.status));
  if (!listable.length) { toast('No listable items', 'error'); return; }
  const out = listable.map(i => {
    const title = i.listing_title || i.name;
    const lines = [];
    lines.push('═══════════════════════════════════════════');
    lines.push(`TITLE (${(title || '').length}/50): ${title}`);
    lines.push(`SKU: ${i.sku}`);
    lines.push(`CATEGORY: ${i.category}`);
    if (i.brand) lines.push(`BRAND: ${i.brand}`);
    if (i.size) lines.push(`SIZE: ${i.size}`);
    if (i.color) lines.push(`COLOR: ${i.color}`);
    lines.push(`CONDITION: ${i.condition}`);
    lines.push(`PRICE: ${formatMoney(i.price) || '—'}`);
    if (i.min_price) lines.push(`MIN ACCEPT: ${formatMoney(i.min_price)}`);
    lines.push('');
    lines.push('DESCRIPTION:');
    lines.push(buildDescription(i, 'poshmark'));
    lines.push('');
    if (i.tags) lines.push(`TAGS: ${i.tags}`);
    lines.push('');
    return lines.join('\n');
  }).join('\n\n');
  downloadBlob(out, `poshmark-listings-${todayStr()}.txt`, 'text/plain');
  toast(`${listable.length} Poshmark listings prepared`, 'success');
}

function exportEbay() {
  const listable = state.items.filter(i => !['Sold','Shipped','Archived'].includes(i.status));
  if (!listable.length) { toast('No listable items', 'error'); return; }
  const header = [
    'Action(SiteID=US|Country=US|Currency=USD|Version=1193)',
    'CustomLabel', 'Category', 'Title', 'ConditionID', 'Description',
    'PicURL', 'Quantity', 'Format', 'StartPrice', 'Duration',
    'Location', 'ShippingService-1:Option', 'ShippingService-1:Cost',
    'DispatchTimeMax', 'ReturnsAcceptedOption', 'Brand', 'UPC',
    'C:Type', 'C:Character', 'C:Year Manufactured', 'C:Country/Region of Manufacture',
    'PackageLength', 'PackageWidth', 'PackageDepth', 'WeightMajor', 'WeightMinor'
  ];
  const conditionMap = {
    'New With Tags (NWT)': '1000', 'New Without Tags (NWOT)': '1500',
    'New With Defects': '1750', 'Like New / Excellent Used': '3000',
    'Very Good': '4000', 'Good': '5000', 'Fair': '6000', 'Poor / For Parts': '7000'
  };
  const rows = listable.map(i => {
    const weightLb = i.weight_unit === 'lb' ? Math.floor(parseFloat(i.weight_value) || 0) : 0;
    const weightOz = i.weight_unit === 'oz' ? (parseFloat(i.weight_value) || 0) :
                     i.weight_unit === 'lb' ? Math.round(((parseFloat(i.weight_value) || 0) - weightLb) * 16) :
                     i.weight_unit === 'g' ? Math.round((parseFloat(i.weight_value) || 0) / 28.3495) :
                     i.weight_unit === 'kg' ? Math.round((parseFloat(i.weight_value) || 0) * 35.274) : '';
    return [
      'Add', i.sku, '', i.listing_title || i.name,
      conditionMap[i.condition] || '3000',
      buildDescription(i, 'ebay').replace(/\n/g, '<br>'),
      '', i.quantity || 1, 'FixedPrice', i.price || '', 'GTC',
      '', 'USPSGroundAdvantage', i.ship_cost || '',
      '1', 'ReturnsAccepted', i.brand || '', i.upc || '',
      i.category === 'Beanie Baby' ? 'Plush Beanbag' : '',
      i.name || '', i.bb_year || '', i.country || '',
      i.box_length || '', i.box_width || '', i.box_height || '',
      weightLb || '', weightOz || ''
    ].map(csvEscape).join(',');
  });
  downloadBlob([header.join(','), ...rows].join('\n'), `ebay-file-exchange-${todayStr()}.csv`, 'text/csv');
  toast(`${listable.length} eBay listings prepared`, 'success');
}

function buildDescription(i, platform) {
  const parts = [];
  // Prefer platform-specific description when present, then the shared
  // listing_desc, then fall back to auto-generated lead text.
  const platformDesc = platform === 'ebay' ? i.listing_desc_ebay
                     : platform === 'poshmark' ? i.listing_desc_poshmark
                     : '';
  if (platformDesc) {
    parts.push(platformDesc);
  } else if (i.listing_desc) {
    parts.push(i.listing_desc);
  } else {
    parts.push(`${i.name}${i.brand ? ' by ' + i.brand : ''}`);
  }
  parts.push('');
  parts.push('DETAILS:');
  if (i.category === 'Beanie Baby') {
    if (i.bb_year) parts.push(`• Year: ${i.bb_year}`);
    if (i.bb_birthday) parts.push(`• Date of Birth: ${i.bb_birthday}`);
    if (i.bb_swing_gen) parts.push(`• Heart Tag Generation: ${i.bb_swing_gen}`);
    if (i.bb_tush_gen) parts.push(`• Tush Tag Generation: ${i.bb_tush_gen}`);
    if (i.bb_swing_cond) parts.push(`• Heart Tag Condition: ${i.bb_swing_cond}`);
    if (i.bb_tush_cond) parts.push(`• Tush Tag Condition: ${i.bb_tush_cond}`);
    if (i.bb_style_num) parts.push(`• Style #: ${i.bb_style_num}`);
    if (i.bb_pellets) parts.push(`• Pellet Type: ${i.bb_pellets}`);
    if (i.bb_errors) parts.push(`• Errors/Variations: ${i.bb_errors}`);
    if (i.bb_rarity) parts.push(`• Rarity: ${i.bb_rarity}`);
  } else {
    if (i.brand) parts.push(`• Brand: ${i.brand}`);
    if (i.model) parts.push(`• Model: ${i.model}`);
    if (i.size) parts.push(`• Size: ${i.size}`);
    if (i.color) parts.push(`• Color: ${i.color}`);
    if (i.material) parts.push(`• Material: ${i.material}`);
    if (i.country) parts.push(`• Country of Manufacture: ${i.country}`);
    if (i.upc) parts.push(`• UPC: ${i.upc}`);
  }
  if (i.has_variations && i.variation_description) {
    parts.push(`• Variation: ${i.variation_description}`);
  } else if (i.has_variations) {
    parts.push(`• Variation: each one is unique — colors and patterns vary`);
  }
  parts.push(`• Condition: ${i.condition}`);
  if (i.condition_notes) parts.push(`• Flaws/Notes: ${i.condition_notes}`);
  if (i.has_packaging && i.has_packaging !== 'No') parts.push(`• Packaging: ${i.has_packaging}`);
  if (i.environment) parts.push(`• From: ${i.environment}`);
  if (i.authentication) parts.push(`• Authentication: ${i.authentication}`);
  parts.push('');
  const dim = [i.box_length, i.box_width, i.box_height].filter(Boolean);
  if (dim.length === 3) parts.push(`Ships in ${dim.join(' × ')} ${i.dim_unit} package`);
  if (i.weight_value) parts.push(`Weight: ${i.weight_value} ${i.weight_unit}`);
  parts.push('');
  parts.push('Thank you for looking! Message with any questions.');
  return parts.join('\n');
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openImportModal() {
  document.getElementById('importModal').classList.add('open');
  document.getElementById('importFile').value = '';
}

function doImport() {
  const file = document.getElementById('importFile').files[0];
  if (!file) { toast('Choose a file first', 'error'); return; }
  const mode = document.querySelector('input[name="importMode"]:checked').value;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      let incoming;
      let userBeanies = null;
      let formatLabel = 'CSV';
      if (file.name.toLowerCase().endsWith('.json')) {
        const data = JSON.parse(e.target.result);
        incoming = Array.isArray(data) ? data : (data.items || []);
        if (data.userBeanies) userBeanies = data.userBeanies;
        formatLabel = 'JSON backup';
      } else {
        const rows = parseCSV(e.target.result);
        if (rows.length && looksLikeEbayCsv(Object.keys(rows[0]))) {
          incoming = rows.map(ebayRowToItem);
          formatLabel = 'eBay Seller Hub CSV';
        } else {
          incoming = rows;
          formatLabel = 'The Ledger CSV';
        }
      }
      if (!incoming.length) throw new Error('No items found in file');

      incoming = incoming.map(raw => {
        const item = { ...DEFAULT_FIELDS };
        Object.entries(raw).forEach(([k, v]) => {
          if (k in DEFAULT_FIELDS) item[k] = v;
        });
        item.id = item.id || uid();
        item.created_at = item.created_at || nowISO();
        item.updated_at = nowISO();
        item.photos = Array.isArray(item.photos) ? item.photos : [];
        return item;
      });

      if (mode === 'replace') {
        state.items = incoming;
      } else {
        incoming.forEach(imp => {
          const existingIdx = state.items.findIndex(i => i.id === imp.id || (imp.sku && i.sku === imp.sku));
          if (existingIdx >= 0) state.items[existingIdx] = imp;
          else state.items.push(imp);
        });
      }
      saveState();
      // Also restore user beanie entries
      if (userBeanies && Array.isArray(userBeanies)) {
        localStorage.setItem('theLedger.userBeanies.v1', JSON.stringify(userBeanies));
      }
      render();
      document.getElementById('importModal').classList.remove('open');
      toast(`Imported ${incoming.length} items from ${formatLabel} (${mode})`, 'success');
    } catch (err) {
      console.error(err);
      toast('Import failed: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ============ Ledger CSV template (header + 1 example row) ============
// Downloaded from the Import modal so users have a ready-to-fill template
// matching exactly the columns parseCSV / doImport expect.
function buildCsvTemplate() {
  const skip = new Set(['id', 'created_at', 'updated_at', 'photos']);
  const fields = Object.keys(DEFAULT_FIELDS).filter(f => !skip.has(f));
  // Plausible example values for the well-known fields — every column the
  // user might fill is demonstrated here. Fields not listed default to ''.
  const example = {
    name: 'Princess',
    category: 'Beanie Baby',
    sku: 'BB-0001',
    brand: 'Ty Inc.',
    color: 'Royal purple',
    material: 'Plush, PE pellets',
    country: 'Indonesia',
    location: 'Bin A-3',
    quantity: 1,
    bb_year: 1997,
    bb_swing_gen: '4th Gen (1996-98)',
    bb_tush_gen: '5th Gen Tush (1997)',
    bb_swing_cond: 'Mint (no creases/bends)',
    bb_tush_cond: 'Mint',
    bb_style_num: '4300',
    bb_pellets: 'PE Pellets',
    bb_rarity: 'Retired 1999-04-13. Diana Memorial bear.',
    has_variations: false,
    condition: 'New With Tags (NWT)',
    condition_notes: 'Mint hang tag, no fading.',
    has_packaging: 'No',
    environment: 'Smoke-free & Pet-free home',
    listing_title: 'VTG 1997 Ty Princess Diana Beanie Baby Mint Tags',
    tags: 'vintage, 90s, beanie, ty, princess',
    cost: '5.00',
    price: '45.00',
    min_price: '38.00',
    item_tax: '0.40',
    other_expenses: '0.50',
    other_expenses_notes: 'Bubble mailer + label',
    status: 'Listed - Both',
    date_listed: '2026-04-25',
    weight_value: '4',
    weight_unit: 'oz',
    dim_unit: 'in',
    box_length: '6',
    box_width: '4',
    box_height: '3',
    package_type: 'Padded Mailer / Bubble Mailer',
    carrier: 'USPS Ground Advantage',
    ship_cost: '4.50',
    private_notes: 'Source: estate sale',
  };
  const header = fields.join(',');
  const row = fields.map(f => csvEscape(example[f] != null ? example[f] : ''));
  return header + '\n' + row.join(',') + '\n';
}

function downloadCsvTemplate(e) {
  if (e) e.preventDefault();
  downloadBlob(buildCsvTemplate(), 'the-ledger-import-template.csv', 'text/csv');
  toast('Template downloaded — fill it in and re-upload via Import', 'success');
}

// ============ eBay Seller Hub CSV → The Ledger schema ============
// eBay's "Active listings" / "Sold listings" / "Unsold listings" reports
// all share roughly the same column set. Map only what's useful to us;
// everything else in the row is ignored (rather than dumped into a junk
// field) so the imported item is clean.
const EBAY_COLUMN_MAP = {
  'Item number':         'ebay_item_number',
  'Item ID':             'ebay_item_number',
  'Custom label':        'sku',
  'Custom label (SKU)':  'sku',
  'SKU':                 'sku',
  'Title':               'listing_title',
  'Available quantity':  'quantity',
  'Quantity available':  'quantity',
  'Quantity':            'quantity',
  'Start price':         'price',
  'Current price':       'price',
  'Buy It Now price':    'price',
  'Sold for':            'sold_price',
  'Sale price':          'sold_price',
  'Sold price':          'sold_price',
  'Start date':          'date_listed',
  'Sold date':           'date_sold',
  'Sale date':           'date_sold',
};

function looksLikeEbayCsv(headers) {
  const set = new Set(headers.map(h => (h || '').trim()));
  return set.has('Item number') || set.has('Item ID') ||
         set.has('Custom label') || set.has('Custom label (SKU)') ||
         set.has('Sold for');
}

function ebayRowToItem(row) {
  const item = {};
  Object.entries(row).forEach(([k, v]) => {
    const dst = EBAY_COLUMN_MAP[(k || '').trim()];
    if (dst) item[dst] = String(v == null ? '' : v).trim();
  });
  // Fallback: use the listing title as the item name
  if (!item.name && item.listing_title) item.name = item.listing_title;
  // Strip currency symbols / commas off price-y fields
  ['price', 'sold_price', 'min_price'].forEach(f => {
    if (item[f]) item[f] = item[f].replace(/[$£€¥,]/g, '').trim();
  });
  // Normalize dates (eBay typically gives "MMM-DD-YY" or "MM/DD/YYYY")
  ['date_listed', 'date_sold'].forEach(f => {
    if (item[f]) {
      const d = new Date(item[f]);
      if (!isNaN(d)) item[f] = d.toISOString().slice(0, 10);
    }
  });
  // Status inference — if there's a sold price, treat it as a closed sale
  const sp = parseFloat(item.sold_price);
  if (isFinite(sp) && sp > 0) {
    item.status = 'Sold';
    item.sold_platform = 'eBay';
  } else {
    item.status = 'Listed - eBay';
  }
  // Default category for unmapped imports — user can adjust per item
  if (!item.category) item.category = 'Other';
  // Quantity defaults to 1 if missing
  if (!item.quantity) item.quantity = 1;
  return item;
}

function parseCSV(text) {
  const rows = [];
  let cur = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { cur.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (field !== '' || cur.length > 0) { cur.push(field); rows.push(cur); cur = []; field = ''; }
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else field += ch;
    }
  }
  if (field !== '' || cur.length > 0) { cur.push(field); rows.push(cur); }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map(r => {
    const o = {};
    header.forEach((h, idx) => { o[h.trim()] = r[idx] ?? ''; });
    return o;
  });
}

// ============ WIRE UP ============
// ============ FEES & PROFIT ============
// Standard fee rates as of 2026 — close enough for Auto-fill defaults.
// User can override every value to match their actual seller statement.
const EBAY_FVF_RATE       = 0.1325;   // 13.25%, most categories
const EBAY_PER_ORDER_FEE  = 0.30;     // flat per-order fixed
const POSHMARK_HIGH_RATE  = 0.20;     // 20% on sales >= $15
const POSHMARK_LOW_FLAT   = 2.95;     // flat $2.95 on sales < $15
const POSHMARK_THRESHOLD  = 15.00;

function num(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }
function fmt$(n) {
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(n).toFixed(2);
}

function computeStandardFees(soldPlatform, soldPrice, postageCharged) {
  const fees = {
    fee_ebay_insertion: '',
    fee_ebay_fvf: '',
    fee_ebay_fvf_shipping: '',
    fee_ebay_per_order: '',
    fee_poshmark: '',
    fee_paypal: '',
  };
  const sp = num(soldPrice);
  const sh = num(postageCharged);
  const isEbay = /ebay/i.test(soldPlatform || '');
  const isPosh = /posh/i.test(soldPlatform || '');
  if (isEbay) {
    fees.fee_ebay_fvf = (sp * EBAY_FVF_RATE).toFixed(2);
    fees.fee_ebay_fvf_shipping = (sh * EBAY_FVF_RATE).toFixed(2);
    fees.fee_ebay_per_order = sp > 0 ? EBAY_PER_ORDER_FEE.toFixed(2) : '';
    fees.fee_ebay_insertion = ''; // usually $0 under free quota
  }
  if (isPosh) {
    if (sp >= POSHMARK_THRESHOLD) fees.fee_poshmark = (sp * POSHMARK_HIGH_RATE).toFixed(2);
    else if (sp > 0) fees.fee_poshmark = POSHMARK_LOW_FLAT.toFixed(2);
  }
  return fees;
}

function autoFillFees() {
  const form = document.getElementById('itemForm');
  const fees = computeStandardFees(
    form.elements.sold_platform.value,
    form.elements.sold_price.value,
    form.elements.ship_cost.value
  );
  Object.entries(fees).forEach(([k, v]) => {
    if (v !== '' && form.elements[k]) form.elements[k].value = v;
  });
  updatePnl();
  toast('Standard fees filled — adjust to match your seller statement', 'success');
}

function getPnlInputs() {
  const form = document.getElementById('itemForm');
  if (!form) return null;
  const sold = !!form.elements.sold_price.value && num(form.elements.sold_price.value) > 0;
  // When sold, revenue = sold_price + postage charged. Pre-sale, project from listing price.
  const revenueItem = sold ? num(form.elements.sold_price.value) : num(form.elements.price.value);
  const revenuePostage = num(form.elements.ship_cost.value);
  const cost = num(form.elements.cost.value);
  const itemTax = num(form.elements.item_tax.value);
  const otherExpenses = num(form.elements.other_expenses.value);
  const postagePaid = num(form.elements.postage_paid.value);
  const fees = {
    ebay_insertion: num(form.elements.fee_ebay_insertion.value),
    ebay_fvf:       num(form.elements.fee_ebay_fvf.value),
    ebay_fvf_ship:  num(form.elements.fee_ebay_fvf_shipping.value),
    ebay_per_order: num(form.elements.fee_ebay_per_order.value),
    poshmark:       num(form.elements.fee_poshmark.value),
    paypal:         num(form.elements.fee_paypal.value),
    other:          num(form.elements.fee_other.value),
  };
  return { sold, revenueItem, revenuePostage, cost, itemTax, otherExpenses, postagePaid, fees };
}

function updatePnl() {
  const i = getPnlInputs();
  if (!i) return;
  const $ = id => document.getElementById(id);

  const totalRevenue = i.revenueItem + i.revenuePostage;
  const totalCost = i.cost + i.itemTax + i.otherExpenses + i.postagePaid;
  const totalFees = Object.values(i.fees).reduce((a, b) => a + b, 0);
  const net = totalRevenue - totalCost - totalFees;

  // Status line
  $('pnlStatus').textContent = i.sold
    ? 'Item is sold — values reflect actuals'
    : 'Not sold yet — values are projections based on listing price';

  // Revenue
  if (totalRevenue > 0) {
    $('pnlRevenue').textContent = fmt$(totalRevenue);
    const parts = [];
    if (i.revenueItem > 0) parts.push((i.sold ? 'Sold price ' : 'List price ') + fmt$(i.revenueItem));
    if (i.revenuePostage > 0) parts.push('+ postage ' + fmt$(i.revenuePostage));
    $('pnlRevenueDetail').textContent = parts.join('  ');
  } else {
    $('pnlRevenue').textContent = '—';
    $('pnlRevenueDetail').textContent = 'No price set';
  }

  // Cost basis
  if (totalCost > 0) {
    $('pnlCost').textContent = '-' + fmt$(totalCost);
    const parts = [];
    if (i.cost > 0) parts.push('Cost ' + fmt$(i.cost));
    if (i.itemTax > 0) parts.push('+ tax ' + fmt$(i.itemTax));
    if (i.otherExpenses > 0) parts.push('+ supplies ' + fmt$(i.otherExpenses));
    if (i.postagePaid > 0) parts.push('+ postage paid ' + fmt$(i.postagePaid));
    $('pnlCostDetail').textContent = parts.join('  ');
  } else {
    $('pnlCost').textContent = '—';
    $('pnlCostDetail').textContent = 'No costs entered';
  }

  // Fees
  if (totalFees > 0) {
    $('pnlFees').textContent = '-' + fmt$(totalFees);
    const parts = [];
    const ebayTotal = i.fees.ebay_insertion + i.fees.ebay_fvf + i.fees.ebay_fvf_ship + i.fees.ebay_per_order;
    if (ebayTotal > 0) parts.push('eBay ' + fmt$(ebayTotal));
    if (i.fees.poshmark > 0) parts.push('Poshmark ' + fmt$(i.fees.poshmark));
    if (i.fees.paypal > 0) parts.push('PayPal ' + fmt$(i.fees.paypal));
    if (i.fees.other > 0) parts.push('Other ' + fmt$(i.fees.other));
    $('pnlFeesDetail').textContent = parts.join('  ');
  } else {
    $('pnlFees').textContent = '—';
    $('pnlFeesDetail').textContent = i.sold ? 'No fees entered — try Auto-fill' : 'Fees fill in once sold';
  }

  // Net
  const netEl = $('pnlNet');
  if (totalRevenue === 0 && totalCost === 0) {
    netEl.textContent = '—';
    netEl.className = 'pnl-row-amount';
    $('pnlMarginDetail').textContent = '';
  } else {
    netEl.textContent = fmt$(net);
    netEl.className = 'pnl-row-amount ' + (net >= 0 ? 'pos' : 'neg');
    if (totalCost > 0) {
      const margin = (net / totalCost) * 100;
      $('pnlMarginDetail').textContent = (net >= 0 ? '+' : '') + margin.toFixed(0) + '% over cost basis';
    } else {
      $('pnlMarginDetail').textContent = '';
    }
  }

  updateDaysPanel();
}

function daysBetween(aStr, bStr) {
  const a = Date.parse(aStr); const b = Date.parse(bStr);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function updateDaysPanel() {
  const form = document.getElementById('itemForm');
  if (!form) return;
  const listed = form.elements.date_listed.value;
  const sold = form.elements.date_sold.value;
  const panel = document.getElementById('daysPanel');
  const soldBlock = document.getElementById('daysSoldBlock');

  if (!listed) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  const today = new Date().toISOString().slice(0, 10);
  const activeDays = sold ? daysBetween(listed, sold) : daysBetween(listed, today);
  const activeLabel = document.getElementById('daysActiveLabel');
  activeLabel.textContent = sold ? 'Total days listed' : 'Days active';
  document.getElementById('daysActiveValue').textContent = activeDays != null ? activeDays + ' days' : '—';
  document.getElementById('daysActiveSub').textContent = sold
    ? `Listed ${listed} → sold ${sold}`
    : `Listed ${listed}`;

  if (sold) {
    soldBlock.hidden = false;
    const dts = daysBetween(listed, sold);
    document.getElementById('daysToSoldValue').textContent = dts != null ? dts + ' days' : '—';
    document.getElementById('daysToSoldSub').textContent = dts != null
      ? (dts < 7 ? 'Quick flip' : dts < 30 ? 'Normal turnover' : dts < 90 ? 'Slow mover' : 'Long tail')
      : '';
  } else {
    soldBlock.hidden = true;
  }
}

// ============ SETTINGS ============
function openSettings() {
  // Refresh the dynamic fields each open
  document.getElementById('settingsVersion').textContent = 'v' + APP_VERSION;
  document.getElementById('settingsItemCount').textContent = String(state.items.length);
  const user = (window.firebaseAuth && window.firebaseAuth.currentUser) || null;
  const syncEl = document.getElementById('settingsSyncStatus');
  if (user) {
    syncEl.textContent = (user.displayName || user.email || 'Signed in') + ' · synced';
  } else if (state.demoMode) {
    syncEl.textContent = 'Demo mode (in memory only)';
  } else {
    syncEl.textContent = 'Guest — local only';
  }
  // Wipe-button copy varies depending on auth state
  const wipeNote = document.getElementById('wipeNote');
  if (user) {
    wipeNote.innerHTML = 'Clears items, settings, and demo flag from this device\'s localStorage. Your cloud data is <strong>not</strong> touched — you\'d still see your items after signing in again.';
  } else {
    wipeNote.innerHTML = 'Clears items, settings, and demo flag from this device\'s localStorage. <strong>Cannot be undone</strong> for guest data — export a JSON backup first if you want to keep it.';
  }
  document.getElementById('settingsModal').classList.add('open');
}

function closeSettings() {
  document.getElementById('settingsModal').classList.remove('open');
}

function reenableDemoOnNextVisit() {
  try { localStorage.removeItem(DEMO_DISMISSED_KEY); } catch (e) {}
  toast('Demo will auto-load on your next visit', 'success');
  closeSettings();
}

async function wipeLocalData() {
  const user = (window.firebaseAuth && window.firebaseAuth.currentUser) || null;
  const msg = user
    ? 'Sign out (if signed in) and clear all local data on this device? Cloud data stays.'
    : 'Clear all local items and settings on this device? This cannot be undone for guest data.';
  const ok = await confirmDialog('Wipe local data', msg, {
    okLabel: 'Wipe', cancelLabel: 'Cancel', okClass: 'btn-danger'
  });
  if (!ok) return;
  try {
    if (user && window.firebaseSignOut) {
      await window.firebaseSignOut();
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(DEMO_DISMISSED_KEY);
    localStorage.removeItem('theLedger.userBeanies.v1');
  } catch (e) {
    console.error('Wipe failed:', e);
  }
  // Reload so the app re-inits cleanly (auto-demo will fire if no inventory)
  location.reload();
}

// ============ DEMO MODE ============
function shouldAutoDemo() {
  // Auto-demo on every load when there's no real inventory and the user
  // hasn't explicitly dismissed it. So a visitor who hasn't signed up sees
  // the populated app on every visit, not just the first one.
  try {
    if (localStorage.getItem(STORAGE_KEY)) return false;
    if (localStorage.getItem(DEMO_DISMISSED_KEY)) return false;
  } catch (e) {
    return false; // localStorage disabled / private mode — bail safely
  }
  return true;
}

function enterDemoMode() {
  if (isSignedIn()) {
    toast('Sign out first to try demo mode', 'error');
    return;
  }
  if (typeof DEMO_ITEMS === 'undefined') {
    console.warn('DEMO_ITEMS not loaded');
    return;
  }
  state.demoMode = true;
  state.items = DEMO_ITEMS.map(i => ({ ...DEFAULT_FIELDS, ...i }));
  state.filter = { search: '', category: '', status: '', sort: 'created_desc', scope: '' };
  document.getElementById('searchInput').value = '';
  document.getElementById('filterCategory').value = '';
  document.getElementById('filterStatus').value = '';
  const banner = document.getElementById('demoBanner');
  if (banner) banner.hidden = false;
  document.body.classList.add('demo-mode');
  render();
  toast('Demo mode on — sample data, nothing is saved', 'success');
}

// userDismissed=true means the visitor clicked "Exit demo" deliberately —
// remember that choice so auto-demo doesn't keep loading on every reload.
// Sign-in-driven exits (which also clear demo state) pass userDismissed=false
// so a future sign-out restores auto-demo eligibility.
function exitDemoMode(userDismissed = true) {
  state.demoMode = false;
  const banner = document.getElementById('demoBanner');
  if (banner) banner.hidden = true;
  document.body.classList.remove('demo-mode');
  if (userDismissed) {
    try { localStorage.setItem(DEMO_DISMISSED_KEY, '1'); } catch (e) {}
  }
  loadState();
  render();
  // Strip ?demo=1 from URL so a refresh doesn't re-enter demo
  if (location.search.includes('demo=')) {
    const url = new URL(location.href);
    url.searchParams.delete('demo');
    history.replaceState(null, '', url.toString());
  }
  toast('Demo mode off', '');
}

// ============ AUTH UI ============
function renderAuthState(user) {
  const bar = document.querySelector('.auth-bar');
  const signInBtn = document.getElementById('signInBtn');
  const pill = document.getElementById('signedInPill');
  const statusText = document.querySelector('.auth-status-text');
  const userName = document.getElementById('userName');

  if (user) {
    bar.classList.add('signed-in');
    signInBtn.hidden = true;
    pill.hidden = false;
    userName.textContent = user.displayName || user.email || 'Account';
    statusText.textContent = 'Signed in · syncing across devices';
  } else {
    bar.classList.remove('signed-in');
    signInBtn.hidden = false;
    pill.hidden = true;
    userName.textContent = '';
    statusText.textContent = 'Guest mode · data stored locally on this device';
  }
}

// ============ CLOUD SYNC ============
let cloudUid = null;
let cloudUnsubItems = null;
let cloudUnsubBeanies = null;
let cloudUserBeanies = [];
let cloudMigrationOffered = false;

function isSignedIn() { return !!cloudUid; }

function getLocalStorageItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function getEffectiveUserBeanies() {
  return isSignedIn() ? cloudUserBeanies.slice() : getUserBeanies();
}
window.getEffectiveUserBeanies = getEffectiveUserBeanies;

function onCloudAuthChanged(user) {
  if (cloudUnsubItems) { cloudUnsubItems(); cloudUnsubItems = null; }
  if (cloudUnsubBeanies) { cloudUnsubBeanies(); cloudUnsubBeanies = null; }
  cloudUserBeanies = [];

  if (user) {
    // If demo auto-loaded for a visitor whose Firebase session is now
    // restoring, silently exit demo before subscribing to cloud data so
    // we don't flash demo content over their real inventory.
    if (state.demoMode) {
      state.demoMode = false;
      document.body.classList.remove('demo-mode');
      const banner = document.getElementById('demoBanner');
      if (banner) banner.hidden = true;
      if (location.search.includes('demo=')) {
        const url = new URL(location.href);
        url.searchParams.delete('demo');
        history.replaceState(null, '', url.toString());
      }
    }
    cloudUid = user.uid;
    cloudMigrationOffered = false;
    if (!window.firestoreApi) {
      console.warn('Firestore bridge not ready; skipping cloud subscription');
      return;
    }
    cloudUnsubItems = window.firestoreApi.subscribeItems(
      user.uid,
      async (items) => {
        state.items = items.map(i => ({ ...DEFAULT_FIELDS, ...i }));
        render();
        if (!cloudMigrationOffered) {
          cloudMigrationOffered = true;
          maybeOfferMigration();
        }
      },
      (err) => {
        const code = err && err.code;
        if (code === 'permission-denied') {
          toast('Cloud access denied — check Firestore rules', 'error');
        } else {
          toast('Cloud sync error: ' + (code || err.message || 'unknown'), 'error');
        }
      }
    );
    cloudUnsubBeanies = window.firestoreApi.subscribeBeanies(
      user.uid,
      (beanies) => { cloudUserBeanies = beanies; }
    );
  } else {
    cloudUid = null;
    cloudMigrationOffered = false;
    loadState();
    render();
  }
}

async function maybeOfferMigration() {
  if (!isSignedIn()) return;

  const localItems = getLocalStorageItems();
  const cloudIds = new Set(state.items.map(i => i.id));
  const localOnlyItems = localItems.filter(i => i && i.id && !cloudIds.has(i.id));

  const localBeanies = (typeof getUserBeanies === 'function') ? getUserBeanies() : [];
  const cloudBeanieKeys = new Set(cloudUserBeanies.map(b => slug(b.name || '')));
  const localOnlyBeanies = localBeanies.filter(b => b && b.name && !cloudBeanieKeys.has(slug(b.name)));

  if (localOnlyItems.length === 0 && localOnlyBeanies.length === 0) return;

  const parts = [];
  if (localOnlyItems.length > 0) parts.push(`${localOnlyItems.length} item${localOnlyItems.length === 1 ? '' : 's'}`);
  if (localOnlyBeanies.length > 0) parts.push(`${localOnlyBeanies.length} custom Beanie reference${localOnlyBeanies.length === 1 ? '' : 's'}`);
  const summary = parts.join(' and ');

  const ok = await confirmDialog(
    'Upload local data to your account?',
    `Found ${summary} saved on this device that aren't in your cloud account yet. Upload now? Your local copy stays as a backup either way.`,
    { okLabel: 'Upload', cancelLabel: 'Not Now', okClass: 'btn-primary' }
  );
  if (!ok) return;

  toast(`Uploading ${summary}…`, '');
  let itemsOk = 0, itemsFail = 0;
  for (const item of localOnlyItems) {
    try {
      const toUpload = { ...item };
      if (Array.isArray(item.photos) && item.photos.length > 0 && window.firebaseStorageApi) {
        const urls = await Promise.all(item.photos.map(async (p) => {
          if (typeof p === 'string' && p.startsWith('data:')) {
            return await window.firebaseStorageApi.uploadPhoto(cloudUid, item.id, p);
          }
          return p;
        }));
        toUpload.photos = urls;
      }
      await window.firestoreApi.saveItem(cloudUid, toUpload);
      itemsOk++;
    } catch (err) {
      console.error('Migration upload failed for item', item.id, err);
      itemsFail++;
    }
  }

  let beaniesOk = 0;
  for (const beanie of localOnlyBeanies) {
    try {
      const key = slug(beanie.name);
      if (key) {
        await window.firestoreApi.saveBeanie(cloudUid, key, beanie);
        beaniesOk++;
      }
    } catch (err) {
      console.error('Migration upload failed for beanie', beanie.name, err);
    }
  }

  if (itemsFail > 0) {
    toast(`Uploaded ${itemsOk} of ${localOnlyItems.length} items (${itemsFail} failed — see console)`, 'error');
  } else {
    const summaryDone = [];
    if (itemsOk > 0) summaryDone.push(`${itemsOk} item${itemsOk === 1 ? '' : 's'}`);
    if (beaniesOk > 0) summaryDone.push(`${beaniesOk} Beanie reference${beaniesOk === 1 ? '' : 's'}`);
    toast(`Uploaded ${summaryDone.join(' and ')} to your account`, 'success');
  }
}

function cloudSaveItemSafe(item) {
  if (!isSignedIn() || !window.firestoreApi) return;
  window.firestoreApi.saveItem(cloudUid, item).catch(err => {
    console.error('Cloud save failed:', err);
    toast('Cloud save failed — change is saved locally', 'error');
  });
}

function cloudDeleteItemSafe(itemId) {
  if (!isSignedIn() || !window.firestoreApi) return;
  window.firestoreApi.deleteItem(cloudUid, itemId).catch(err => {
    console.error('Cloud delete failed:', err);
    toast('Cloud delete failed — try again when online', 'error');
  });
}

function cloudSaveBeanieSafe(entry) {
  if (!isSignedIn() || !window.firestoreApi) return;
  const key = slug(entry.name);
  if (!key) return;
  window.firestoreApi.saveBeanie(cloudUid, key, entry).catch(err => {
    console.error('Cloud beanie save failed:', err);
  });
}

function wireAuthUI() {
  const signInBtn = document.getElementById('signInBtn');
  const signOutBtn = document.getElementById('signOutBtn');

  signInBtn.onclick = async () => {
    if (!window.firebaseSignIn) {
      toast('Sign-in not loaded yet, try again in a moment', 'error');
      return;
    }
    // Clear demo state to make room for the user's cloud data — but don't
    // mark them as having "dismissed" demo, since signing out later should
    // restore auto-demo eligibility.
    if (state.demoMode) exitDemoMode(false);
    signInBtn.disabled = true;
    try {
      await window.firebaseSignIn();
    } catch (err) {
      const code = err && err.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // user dismissed — silent
      } else if (code === 'auth/popup-blocked') {
        toast('Popup blocked. Allow popups for this site and try again.', 'error');
      } else {
        toast('Sign-in failed. Check your connection and try again.', 'error');
      }
    } finally {
      signInBtn.disabled = false;
    }
  };

  signOutBtn.onclick = async () => {
    if (!window.firebaseSignOut) return;
    try {
      await window.firebaseSignOut();
      toast('Signed out', 'success');
    } catch (err) {
      toast('Sign-out failed', 'error');
    }
  };

  window.addEventListener('firebaseAuthChanged', (e) => {
    renderAuthState(e.detail);
    onCloudAuthChanged(e.detail);
  });
  window.addEventListener('firebaseAuthError', (e) => {
    console.error('Firebase auth error:', e.detail);
  });
}

function init() {
  loadState();

  const verEl = document.getElementById('appVersion');
  if (verEl) verEl.textContent = 'v' + APP_VERSION;
  // Keep <title> in sync with APP_VERSION as the single source of truth —
  // covers the case where someone forgets to bump the static title on
  // release. The static title still matters for SEO + social cards, so
  // we leave a sensible hardcoded fallback in index.html.
  document.title = 'The Ledger v' + APP_VERSION + ' — Collectibles Inventory';

  wireAuthUI();

  // Settings panel
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) settingsBtn.onclick = openSettings;
  const settingsClose = document.getElementById('settingsClose');
  if (settingsClose) settingsClose.onclick = closeSettings;
  const settingsModal = document.getElementById('settingsModal');
  if (settingsModal) settingsModal.querySelector('.modal-backdrop').onclick = closeSettings;
  const reenableDemoBtn = document.getElementById('reenableDemoBtn');
  if (reenableDemoBtn) reenableDemoBtn.onclick = reenableDemoOnNextVisit;
  const wipeLocalBtn = document.getElementById('wipeLocalBtn');
  if (wipeLocalBtn) wipeLocalBtn.onclick = wipeLocalData;

  // Demo mode buttons + ?demo=1 URL param + auto-demo on first visit
  const tryDemoBtn = document.getElementById('tryDemoBtn');
  if (tryDemoBtn) tryDemoBtn.onclick = enterDemoMode;
  const exitDemoBtn = document.getElementById('exitDemoBtn');
  if (exitDemoBtn) exitDemoBtn.onclick = () => exitDemoMode(true);
  // Footer demo link: real href so right-click-copy gives a shareable URL,
  // but left-click triggers demo mode in place (no page reload).
  const demoFooterLink = document.getElementById('demoFooterLink');
  if (demoFooterLink) {
    demoFooterLink.onclick = (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // honor open-in-new-tab
      e.preventDefault();
      if (state.demoMode) { toast('Already in demo mode', ''); return; }
      enterDemoMode();
      if (state.demoMode && !location.search.includes('demo=')) {
        const url = new URL(location.href);
        url.searchParams.set('demo', '1');
        history.replaceState(null, '', url.toString());
      }
    };
  }
  const urlParams = new URLSearchParams(location.search);
  const urlDemo = urlParams.get('demo');
  if (urlDemo === '1') {
    setTimeout(enterDemoMode, 50);
  } else if (urlDemo !== '0' && shouldAutoDemo()) {
    // No inventory, not explicitly dismissed, not ?demo=0 — auto-load demo
    // so the visitor sees the populated app every visit (not just first).
    setTimeout(enterDemoMode, 50);
  }

  document.getElementById('addBtn').onclick = () => openEditor();
  document.getElementById('modalClose').onclick = closeEditor;
  document.getElementById('cancelBtn').onclick = closeEditor;
  document.querySelector('#itemModal .modal-backdrop').onclick = closeEditor;
  document.getElementById('deleteBtn').onclick = deleteCurrentItem;
  document.getElementById('itemForm').onsubmit = saveItem;

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === btn.dataset.tab));
    };
  });

  // Category change
  document.getElementById('categorySelect').onchange = e => {
    toggleBeanieTab(e.target.value);
    if (!state.currentEditId) {
      document.querySelector('[name="sku"]').value = nextSku(e.target.value);
    }
  };
  document.getElementById('autoSku').onclick = () => {
    const cat = document.getElementById('categorySelect').value;
    document.querySelector('[name="sku"]').value = nextSku(cat);
  };
  document.querySelector('[name="listing_title"]').addEventListener('input', updateTitleCount);

  const hasVarToggle = document.getElementById('hasVariationsToggle');
  if (hasVarToggle) hasVarToggle.addEventListener('change', syncVariationFieldVisibility);

  // Pricing research: live-update the suggest + margin panel as fields change.
  // Cost field also matters for margin, so include it.
  ['research_ebay_avg', 'research_ebay_date',
   'research_poshmark_avg', 'research_poshmark_date',
   'research_guide_avg', 'research_guide_date',
   'cost'].forEach(name => {
    const el = document.querySelector(`[name="${name}"]`);
    if (el) el.addEventListener('input', updateResearchSummary);
  });
  const useBtn = document.getElementById('useSuggestedPrice');
  if (useBtn) useBtn.onclick = () => {
    const v = useBtn.dataset.value;
    if (!v) return;
    const priceField = document.querySelector('[name="price"]');
    if (priceField) {
      priceField.value = v;
      toast(`Listing price set to $${v}`, 'success');
    }
  };

  // P&L panel: live-update when any cost / price / fee / postage / date field changes.
  ['cost', 'item_tax', 'other_expenses',
   'price', 'sold_price', 'ship_cost', 'postage_paid',
   'sold_platform', 'date_listed', 'date_sold',
   'fee_ebay_insertion', 'fee_ebay_fvf', 'fee_ebay_fvf_shipping', 'fee_ebay_per_order',
   'fee_poshmark', 'fee_paypal', 'fee_other'].forEach(name => {
    const el = document.querySelector(`[name="${name}"]`);
    if (el) el.addEventListener('input', updatePnl);
    if (el && (el.tagName === 'SELECT' || el.type === 'date')) {
      el.addEventListener('change', updatePnl);
    }
  });
  const autoFillBtn = document.getElementById('autoFillFeesBtn');
  if (autoFillBtn) autoFillBtn.onclick = autoFillFees;

  // UPC lookup
  document.getElementById('upcLookup').onclick = () => {
    const val = document.getElementById('upcInput').value.trim();
    if (!val) { toast('Enter a UPC', 'error'); return; }
    lookupUPC(val);
  };
  document.getElementById('upcInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('upcLookup').click(); }
  });
  document.getElementById('upcScan').onclick = openScanner;
  document.getElementById('scannerClose').onclick = closeScanner;
  document.querySelector('#scannerModal .modal-backdrop').onclick = closeScanner;

  // Beanie name typeahead
  const nameInput = document.getElementById('nameInput');
  nameInput.addEventListener('input', e => onBeanieNameInput(e.target.value));
  nameInput.addEventListener('blur', () => setTimeout(() => document.getElementById('beanieSuggest').classList.remove('open'), 200));
  nameInput.addEventListener('focus', e => {
    if (e.target.value.length >= 2) onBeanieNameInput(e.target.value);
  });

  // Beanie lookup on beanie tab
  document.getElementById('beanieLookupInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doBeanieLookup(); }
  });
  document.getElementById('beanieLookupInput').addEventListener('input', () => doBeanieLookup());
  document.getElementById('saveBeanieBtn').onclick = saveCurrentAsBeanie;

  // Photos
  const photoInput = document.getElementById('photoInput');
  photoInput.onchange = e => handlePhotoFiles(e.target.files);
  const drop = document.getElementById('photoDrop');
  drop.addEventListener('click', e => {
    if (e.target.tagName !== 'BUTTON') photoInput.click();
  });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('dragover');
    handlePhotoFiles(e.dataTransfer.files);
  });

  // Search / filters
  document.getElementById('searchInput').addEventListener('input', e => {
    state.filter.search = e.target.value;
    render();
  });
  document.getElementById('filterCategory').onchange = e => { state.filter.category = e.target.value; render(); };
  document.getElementById('filterStatus').onchange = e => { state.filter.status = e.target.value; render(); };
  document.getElementById('sortBy').onchange = e => { state.filter.sort = e.target.value; render(); };

  // Interactive stat cards: click to filter the grid to Items/Active/Sold.
  // Clicking the currently-selected card clears the scope.
  document.querySelectorAll('.stat[data-scope]').forEach(el => {
    el.onclick = () => {
      const target = el.dataset.scope === 'all' ? '' : el.dataset.scope;
      state.filter.scope = (state.filter.scope === target && target !== '') ? '' : target;
      render();
    };
  });

  // View toggle
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.view = btn.dataset.view;
      saveState();
      render();
    };
  });

  // Export dropdown
  const exportBtn = document.getElementById('exportBtn');
  const exportMenu = document.getElementById('exportMenu');
  exportBtn.onclick = e => {
    e.stopPropagation();
    exportMenu.classList.toggle('open');
  };
  document.addEventListener('click', () => exportMenu.classList.remove('open'));
  exportMenu.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const format = btn.dataset.format;
    exportMenu.classList.remove('open');
    if (format === 'json') exportJSON();
    else if (format === 'csv') exportCSV();
    else if (format === 'poshmark') exportPoshmark();
    else if (format === 'ebay') exportEbay();
  });

  // Import
  document.getElementById('importBtn').onclick = openImportModal;
  document.getElementById('importCancel').onclick = () => document.getElementById('importModal').classList.remove('open');
  document.getElementById('importConfirm').onclick = doImport;
  const dlTpl = document.getElementById('downloadTemplateLink');
  if (dlTpl) dlTpl.onclick = downloadCsvTemplate;
  document.querySelector('#importModal .modal-backdrop').onclick = () => document.getElementById('importModal').classList.remove('open');

  // Restore view
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === state.settings.view));

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeScanner();
      document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'n' && !document.querySelector('.modal.open')) {
      e.preventDefault();
      openEditor();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's' && document.getElementById('itemModal').classList.contains('open')) {
      e.preventDefault();
      document.getElementById('itemForm').requestSubmit();
    }
  });

  render();
}

document.addEventListener('DOMContentLoaded', init);
