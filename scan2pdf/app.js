(function () {
  'use strict';

  const APP_VERSION = '0.1.0';
  const LS_KEY = 'scan2pdf.settings.v1';
  const MAX_DIM = 2000;
  const JPEG_QUALITY = 0.88;
  const PDF_MARGIN_PT = 18;

  const els = {
    stepPages: document.getElementById('step-pages'),
    stepSettings: document.getElementById('step-settings'),
    stepProgress: document.getElementById('step-progress'),
    stepDone: document.getElementById('step-done'),
    pageList: document.getElementById('page-list'),
    pageCount: document.getElementById('page-count'),
    emptyHint: document.getElementById('empty-hint'),
    fileInput: document.getElementById('file-page'),
    prefix: document.getElementById('prefix'),
    language: document.getElementById('language'),
    ocrEnabled: document.getElementById('ocr-enabled'),
    filenamePreview: document.getElementById('filename-preview'),
    btnGenerate: document.getElementById('btn-generate'),
    progressBar: document.getElementById('progress-bar'),
    progressLabel: document.getElementById('progress-label'),
    doneInfo: document.getElementById('done-info'),
    btnShare: document.getElementById('btn-share'),
    btnDownload: document.getElementById('btn-download'),
    btnBack: document.getElementById('btn-back'),
    btnNew: document.getElementById('btn-new'),
    shareHint: document.getElementById('share-hint')
  };

  const state = {
    pages: [],
    settings: { prefix: 'Scan', language: 'eng', ocrEnabled: true },
    generatedPdf: null
  };

  loadSettings();
  populateSettingsUI();
  updateFilenamePreview();
  updateButtons();

  els.fileInput.addEventListener('change', onFilesSelected);
  els.prefix.addEventListener('input', () => {
    state.settings.prefix = els.prefix.value;
    saveSettings();
    updateFilenamePreview();
  });
  els.language.addEventListener('change', () => {
    state.settings.language = els.language.value;
    saveSettings();
  });
  els.ocrEnabled.addEventListener('change', () => {
    state.settings.ocrEnabled = els.ocrEnabled.checked;
    saveSettings();
  });
  els.btnGenerate.addEventListener('click', generatePdf);
  els.btnShare.addEventListener('click', shareOrDownload);
  els.btnDownload.addEventListener('click', () => {
    if (state.generatedPdf) downloadBlob(state.generatedPdf.blob, state.generatedPdf.filename);
  });
  els.btnBack.addEventListener('click', returnToEdit);
  els.btnNew.addEventListener('click', resetAll);
  els.pageList.addEventListener('click', onPageListClick);

  function loadSettings() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.prefix === 'string') state.settings.prefix = parsed.prefix;
      if (typeof parsed.language === 'string') state.settings.language = parsed.language;
      if (typeof parsed.ocrEnabled === 'boolean') state.settings.ocrEnabled = parsed.ocrEnabled;
    } catch (e) { /* ignore */ }
  }

  function saveSettings() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state.settings));
    } catch (e) { /* ignore */ }
  }

  function populateSettingsUI() {
    els.prefix.value = state.settings.prefix;
    els.language.value = state.settings.language;
    els.ocrEnabled.checked = state.settings.ocrEnabled;
  }

  async function onFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    for (const file of files) {
      try {
        const page = await processImageFile(file);
        state.pages.push(page);
      } catch (err) {
        console.error('Failed to process image', err);
      }
    }
    renderPageList();
    updateButtons();
  }

  async function processImageFile(file) {
    const { dataUrl, width, height } = await downscaleJpegFromFile(file, MAX_DIM, JPEG_QUALITY);
    return {
      id: 'p_' + Math.random().toString(36).slice(2, 10),
      dataUrl,
      width,
      height
    };
  }

  function downscaleJpegFromFile(file, maxDim, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Failed to decode image'));
        img.onload = () => {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), width: w, height: h });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderPageList() {
    if (!state.pages.length) {
      els.pageList.hidden = true;
      els.pageList.innerHTML = '';
      els.emptyHint.hidden = false;
      els.pageCount.hidden = true;
      return;
    }
    els.emptyHint.hidden = true;
    els.pageList.hidden = false;
    els.pageCount.hidden = false;
    els.pageCount.textContent = String(state.pages.length);

    els.pageList.innerHTML = state.pages.map((p, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === state.pages.length - 1;
      return `<li class="page-item" data-id="${escapeAttr(p.id)}">
        <img class="page-thumb" src="${escapeAttr(p.dataUrl)}" alt="">
        <div class="page-info">
          <span class="page-num">Page ${idx + 1}</span>
          <span class="page-dims">${p.width}×${p.height}</span>
        </div>
        <div class="page-actions">
          <button type="button" class="icon-btn" data-action="up" aria-label="Move up"${isFirst ? ' disabled' : ''}>↑</button>
          <button type="button" class="icon-btn" data-action="down" aria-label="Move down"${isLast ? ' disabled' : ''}>↓</button>
          <button type="button" class="icon-btn" data-action="del" aria-label="Remove page">×</button>
        </div>
      </li>`;
    }).join('');
  }

  function onPageListClick(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const item = btn.closest('.page-item');
    if (!item) return;
    const id = item.dataset.id;
    const idx = state.pages.findIndex(p => p.id === id);
    if (idx < 0) return;
    const action = btn.dataset.action;
    if (action === 'up' && idx > 0) {
      const [p] = state.pages.splice(idx, 1);
      state.pages.splice(idx - 1, 0, p);
    } else if (action === 'down' && idx < state.pages.length - 1) {
      const [p] = state.pages.splice(idx, 1);
      state.pages.splice(idx + 1, 0, p);
    } else if (action === 'del') {
      state.pages.splice(idx, 1);
    } else {
      return;
    }
    renderPageList();
    updateButtons();
  }

  function updateButtons() {
    els.btnGenerate.disabled = state.pages.length === 0;
  }

  function updateFilenamePreview() {
    els.filenamePreview.textContent = makeFilename(state.settings.prefix);
  }

  function makeFilename(prefix) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const safe = sanitizeForFilename(prefix);
    return `${safe}_${stamp}.pdf`;
  }

  function sanitizeForFilename(s) {
    const base = String(s || '').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').replace(/^_+|_+$/g, '');
    return base.slice(0, 40) || 'Scan';
  }

  async function generatePdf() {
    if (!state.pages.length) return;
    els.stepProgress.hidden = false;
    els.stepDone.hidden = true;
    els.btnGenerate.disabled = true;
    setProgress(0, 'Initializing…');

    try {
      if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('PDF library failed to load. Check your connection and refresh.');
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: true });

      let worker = null;
      const ocrOn = state.settings.ocrEnabled;
      if (ocrOn) {
        if (typeof Tesseract === 'undefined') throw new Error('OCR engine failed to load. Check your connection and refresh.');
        setProgress(2, 'Loading OCR engine…');
        worker = await Tesseract.createWorker(state.settings.language, 1, {
          logger: () => { /* per-page progress is handled below */ }
        });
      }

      const totalPages = state.pages.length;
      const ocrSliceStart = 10;
      const ocrSliceEnd = 95;

      for (let i = 0; i < totalPages; i++) {
        const page = state.pages[i];
        if (i > 0) {
          const isLandscape = page.width > page.height;
          doc.addPage('letter', isLandscape ? 'landscape' : 'portrait');
        } else {
          if (page.width > page.height) {
            doc.deletePage(1);
            doc.addPage('letter', 'landscape');
          }
        }

        const layout = computePageLayout(doc, page);
        doc.addImage(page.dataUrl, 'JPEG', layout.x, layout.y, layout.w, layout.h, undefined, 'FAST');

        if (worker) {
          const pageBase = ocrSliceStart + (ocrSliceEnd - ocrSliceStart) * (i / totalPages);
          const pageSpan = (ocrSliceEnd - ocrSliceStart) / totalPages;
          setProgress(Math.round(pageBase), `Running OCR on page ${i + 1}/${totalPages}…`);

          const ocrResult = await worker.recognize(page.dataUrl, {}, { hocr: true });
          const words = parseHocrWords(ocrResult.data && ocrResult.data.hocr);
          const scale = { sx: layout.w / page.width, sy: layout.h / page.height };
          drawInvisibleTextLayer(doc, words, layout, scale);
          setProgress(Math.round(pageBase + pageSpan), `Page ${i + 1}/${totalPages} done`);
        } else {
          setProgress(10 + Math.round(85 * ((i + 1) / totalPages)), `Adding page ${i + 1}/${totalPages}…`);
        }
      }

      if (worker) await worker.terminate();

      setProgress(98, 'Finalizing PDF…');
      const blob = doc.output('blob');
      const filename = makeFilename(state.settings.prefix);
      state.generatedPdf = { blob, filename, pageCount: totalPages };

      setProgress(100, 'Done.');
      showDone();
    } catch (err) {
      console.error(err);
      els.progressLabel.textContent = 'Failed: ' + (err && err.message ? err.message : err);
      els.btnGenerate.disabled = false;
    }
  }

  function computePageLayout(doc, page) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const maxW = pageW - 2 * PDF_MARGIN_PT;
    const maxH = pageH - 2 * PDF_MARGIN_PT;
    const imgAspect = page.width / page.height;
    const boxAspect = maxW / maxH;
    let w, h;
    if (imgAspect > boxAspect) {
      w = maxW;
      h = maxW / imgAspect;
    } else {
      h = maxH;
      w = maxH * imgAspect;
    }
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    return { x, y, w, h };
  }

  function parseHocrWords(hocrString) {
    if (!hocrString) return [];
    const parser = new DOMParser();
    const docHtml = parser.parseFromString(hocrString, 'text/html');
    const nodes = docHtml.querySelectorAll('.ocrx_word');
    const out = [];
    nodes.forEach(node => {
      const text = (node.textContent || '').trim();
      if (!text) return;
      const title = node.getAttribute('title') || '';
      const m = title.match(/bbox\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
      if (!m) return;
      const x0 = +m[1], y0 = +m[2], x1 = +m[3], y1 = +m[4];
      if (x1 <= x0 || y1 <= y0) return;
      out.push({ text, x0, y0, x1, y1 });
    });
    return out;
  }

  function drawInvisibleTextLayer(doc, words, layout, scale) {
    if (!words.length) return;
    for (const w of words) {
      const wPdfW = (w.x1 - w.x0) * scale.sx;
      const wPdfH = (w.y1 - w.y0) * scale.sy;
      if (wPdfH < 1 || wPdfW < 1) continue;
      const x = layout.x + w.x0 * scale.sx;
      const baseline = layout.y + w.y1 * scale.sy;
      const fontSize = Math.max(1, Math.min(72, wPdfH));
      doc.setFontSize(fontSize);
      try {
        doc.text(w.text, x, baseline, { renderingMode: 'invisible' });
      } catch (e) {
        try { doc.text(w.text, x, baseline); } catch (e2) { /* skip */ }
      }
    }
  }

  function setProgress(pct, label) {
    if (pct !== null && pct !== undefined) els.progressBar.style.width = pct + '%';
    if (label) els.progressLabel.textContent = label;
  }

  function showDone() {
    els.stepProgress.hidden = true;
    els.stepDone.hidden = false;
    const sizeKb = Math.round(state.generatedPdf.blob.size / 1024);
    const sizeStr = sizeKb >= 1024 ? (sizeKb / 1024).toFixed(2) + ' MB' : sizeKb + ' KB';
    els.doneInfo.innerHTML = `<strong>${escapeHtml(state.generatedPdf.filename)}</strong><br>${state.generatedPdf.pageCount} page${state.generatedPdf.pageCount === 1 ? '' : 's'} · ${sizeStr}`;

    const canShareFiles = !!(navigator.canShare && navigator.share);
    if (canShareFiles) {
      els.btnShare.hidden = false;
      els.btnDownload.hidden = false;
    } else {
      els.btnShare.hidden = true;
      els.btnDownload.hidden = false;
      els.btnDownload.classList.add('btn--primary');
      els.btnDownload.classList.remove('btn--ghost');
    }
    els.stepDone.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function shareOrDownload() {
    if (!state.generatedPdf) return;
    const { blob, filename } = state.generatedPdf;
    const file = new File([blob], filename, { type: 'application/pdf' });
    els.shareHint.hidden = true;

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        els.shareHint.hidden = false;
        els.shareHint.textContent = 'Share canceled or unavailable — falling back to download.';
      }
    }
    downloadBlob(blob, filename);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function returnToEdit() {
    els.stepDone.hidden = true;
    els.btnGenerate.disabled = state.pages.length === 0;
    els.stepPages.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetAll() {
    state.pages = [];
    state.generatedPdf = null;
    renderPageList();
    updateButtons();
    els.stepDone.hidden = true;
    els.stepProgress.hidden = true;
    setProgress(0, 'Starting…');
    els.stepPages.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function escapeAttr(s) {
    return escapeHtml(s);
  }
})();
