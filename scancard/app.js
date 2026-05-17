(function () {
  'use strict';

  const els = {
    stepCapture: document.getElementById('step-capture'),
    stepProgress: document.getElementById('step-progress'),
    stepForm: document.getElementById('step-form'),
    fileFront: document.getElementById('file-front'),
    fileBack: document.getElementById('file-back'),
    previewFront: document.getElementById('preview-front'),
    previewBack: document.getElementById('preview-back'),
    tileFront: document.querySelector('label[for="file-front"]'),
    tileBack: document.querySelector('label[for="file-back"]'),
    btnExtract: document.getElementById('btn-extract'),
    progressBar: document.getElementById('progress-bar'),
    progressLabel: document.getElementById('progress-label'),
    form: document.getElementById('card-form'),
    phoneList: document.getElementById('phone-list'),
    btnAddPhone: document.getElementById('btn-add-phone'),
    btnReset: document.getElementById('btn-reset'),
    btnSave: document.getElementById('btn-save'),
    embedPhoto: document.getElementById('embed-photo'),
    rawText: document.getElementById('raw-text'),
    saveHint: document.getElementById('save-hint')
  };

  const state = {
    front: null,
    back: null,
    embedDataUrl: null
  };

  els.fileFront.addEventListener('change', (e) => handleFile(e, 'front'));
  els.fileBack.addEventListener('change', (e) => handleFile(e, 'back'));
  els.btnExtract.addEventListener('click', runOcr);
  els.btnReset.addEventListener('click', resetAll);
  els.btnAddPhone.addEventListener('click', () => addPhoneRow('work', ''));
  els.form.addEventListener('submit', onSave);

  function handleFile(e, side) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    state[side] = file;
    const url = URL.createObjectURL(file);
    const img = side === 'front' ? els.previewFront : els.previewBack;
    const tile = side === 'front' ? els.tileFront : els.tileBack;
    img.src = url;
    img.hidden = false;
    tile.classList.add('capture-tile--filled');
    els.btnExtract.disabled = !state.front;
  }

  async function runOcr() {
    els.btnExtract.disabled = true;
    els.stepProgress.hidden = false;
    els.stepForm.hidden = true;
    setProgress(0, 'Preparing image…');

    try {
      const frontOcrImg = await prepareForOcr(state.front);
      let backOcrImg = null;
      if (state.back) backOcrImg = await prepareForOcr(state.back);

      if (els.embedPhoto.checked) {
        state.embedDataUrl = await downscaleJpegFromFile(state.front, 600, 0.82);
      } else {
        state.embedDataUrl = null;
      }

      setProgress(5, 'Loading OCR engine…');
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const pct = 10 + Math.round(m.progress * 80);
            setProgress(pct, `Reading text… ${Math.round(m.progress * 100)}%`);
          } else if (m.status) {
            setProgress(null, m.status.charAt(0).toUpperCase() + m.status.slice(1) + '…');
          }
        }
      });

      setProgress(15, 'Reading front…');
      const { data: { text: frontText } } = await worker.recognize(frontOcrImg);

      let backText = '';
      if (backOcrImg) {
        setProgress(55, 'Reading back…');
        const r = await worker.recognize(backOcrImg);
        backText = r.data.text;
      }

      await worker.terminate();
      setProgress(100, 'Parsing…');

      const combined = (frontText + '\n' + backText).trim();
      els.rawText.textContent = combined;
      const parsed = parseCard(frontText, backText);
      populateForm(parsed);

      els.stepProgress.hidden = true;
      els.stepForm.hidden = false;
      els.stepForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      console.error(err);
      els.progressLabel.textContent = 'OCR failed: ' + (err && err.message ? err.message : err);
      els.btnExtract.disabled = false;
    }
  }

  function setProgress(pct, label) {
    if (pct !== null) els.progressBar.style.width = pct + '%';
    if (label) els.progressLabel.textContent = label;
  }

  async function prepareForOcr(file) {
    return await downscaleJpegFromFile(file, 1600, 0.9);
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
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  const PHONE_RE = /(?:\+?\d{1,3}[\s.\-])?(?:\(\d{2,4}\)|\d{2,4})[\s.\-]?\d{2,4}[\s.\-]?\d{2,4}(?:[\s.\-]?\d{1,4})?/;
  const URL_RE = /(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9][A-Za-z0-9-]{0,62}(?:\.[A-Za-z0-9-]{1,63})+(?:\/[^\s]*)?/;
  const ZIP_RE = /\b\d{5}(?:-\d{4})?\b/;
  const STREET_RE = /\b\d+\s+\S+.*\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|pkwy|parkway|hwy|highway|ste|suite|fl|floor|bldg|building)\b\.?/i;
  const NAME_LINE_RE = /^[A-Z][A-Za-z'\-.]+(?:\s+[A-Z][A-Za-z'\-.]+){1,3}$/;

  const PHONE_HINTS = [
    { re: /\bmobile\b|\bcell\b|\bm\.?\s*$/i, type: 'cell' },
    { re: /\bfax\b|\bf\.?\s*$/i, type: 'fax' },
    { re: /\bhome\b|\bh\.?\s*$/i, type: 'home' },
    { re: /\boffice\b|\bwork\b|\btel\b|\bphone\b|\bp\.?\s*$|\bo\.?\s*$|\bt\.?\s*$/i, type: 'work' }
  ];

  function parseCard(frontText, backText) {
    const full = [frontText, backText].filter(Boolean).join('\n');
    const lines = full.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const used = new Set();

    const result = {
      name: '', title: '', org: '',
      email: '', phones: [], url: '',
      address: '', note: ''
    };

    lines.forEach((line, i) => {
      const m = line.match(EMAIL_RE);
      if (m && !result.email) {
        result.email = m[0];
        used.add(i);
      }
    });

    lines.forEach((line, i) => {
      const re = new RegExp(PHONE_RE.source, 'g');
      const matches = line.match(re);
      if (!matches) return;
      const valid = matches.filter(p => p.replace(/\D/g, '').length >= 7);
      if (!valid.length) return;
      let type = 'work';
      for (const h of PHONE_HINTS) {
        if (h.re.test(line)) { type = h.type; break; }
      }
      valid.forEach(p => result.phones.push({ type, number: p.trim() }));
      used.add(i);
    });

    lines.forEach((line, i) => {
      if (used.has(i)) return;
      if (EMAIL_RE.test(line)) return;
      const m = line.match(URL_RE);
      if (m && !result.url) {
        result.url = m[0];
        used.add(i);
      }
    });

    for (let i = 0; i < lines.length; i++) {
      if (used.has(i)) continue;
      if (!STREET_RE.test(lines[i])) continue;
      const addr = [lines[i]];
      used.add(i);
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        if (used.has(j)) continue;
        if (ZIP_RE.test(lines[j]) || /^[A-Za-z .,'\-]+(?:,\s*[A-Z]{2})?$/.test(lines[j])) {
          addr.push(lines[j]);
          used.add(j);
          if (ZIP_RE.test(lines[j])) break;
        } else {
          break;
        }
      }
      result.address = addr.join(', ');
      break;
    }

    for (let i = 0; i < lines.length; i++) {
      if (used.has(i)) continue;
      if (NAME_LINE_RE.test(lines[i])) {
        result.name = lines[i];
        used.add(i);
        break;
      }
    }
    if (!result.name) {
      for (let i = 0; i < lines.length; i++) {
        if (used.has(i)) continue;
        const words = lines[i].split(/\s+/);
        if (words.length >= 2 && words.length <= 4 && /^[A-Za-z .'\-]+$/.test(lines[i])) {
          result.name = lines[i];
          used.add(i);
          break;
        }
      }
    }

    const remaining = lines.filter((_, i) => !used.has(i));
    if (remaining[0]) result.title = remaining[0];
    if (remaining[1]) result.org = remaining[1];
    if (remaining.length > 2) {
      result.note = remaining.slice(2).join('\n');
    }

    return result;
  }

  function populateForm(parsed) {
    els.form.name.value = parsed.name;
    els.form.title.value = parsed.title;
    els.form.org.value = parsed.org;
    els.form.email.value = parsed.email;
    els.form.url.value = parsed.url;
    els.form.address.value = parsed.address;
    els.form.note.value = parsed.note;
    els.phoneList.innerHTML = '';
    if (parsed.phones.length === 0) {
      addPhoneRow('work', '');
    } else {
      parsed.phones.forEach(p => addPhoneRow(p.type, p.number));
    }
  }

  function addPhoneRow(type, number) {
    const row = document.createElement('div');
    row.className = 'phone-row';
    row.innerHTML = `
      <select>
        <option value="work">Work</option>
        <option value="cell">Mobile</option>
        <option value="home">Home</option>
        <option value="fax">Fax</option>
        <option value="other">Other</option>
      </select>
      <input type="tel" inputmode="tel" placeholder="Phone number">
      <button type="button" aria-label="Remove">&times;</button>
    `;
    row.querySelector('select').value = type;
    row.querySelector('input').value = number;
    row.querySelector('button').addEventListener('click', () => row.remove());
    els.phoneList.appendChild(row);
  }

  function onSave(e) {
    e.preventDefault();
    const data = collectForm();
    if (!data.name && !data.org && !data.email && data.phones.length === 0) {
      els.saveHint.hidden = false;
      els.saveHint.textContent = 'Add at least a name, company, email, or phone before saving.';
      return;
    }
    els.saveHint.hidden = true;

    const vcard = buildVCard(data, els.embedPhoto.checked ? state.embedDataUrl : null);
    const filename = vcardFilename(data);
    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function collectForm() {
    const fd = new FormData(els.form);
    const phones = Array.from(els.phoneList.querySelectorAll('.phone-row'))
      .map(row => ({
        type: row.querySelector('select').value,
        number: row.querySelector('input').value.trim()
      }))
      .filter(p => p.number);
    return {
      name: (fd.get('name') || '').trim(),
      title: (fd.get('title') || '').trim(),
      org: (fd.get('org') || '').trim(),
      email: (fd.get('email') || '').trim(),
      url: (fd.get('url') || '').trim(),
      address: (fd.get('address') || '').trim(),
      note: (fd.get('note') || '').trim(),
      phones
    };
  }

  function vcardFilename(data) {
    const base = (data.name || data.org || 'contact')
      .replace(/[^\w\-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'contact';
    return base + '.vcf';
  }

  function escapeVcard(s) {
    return String(s)
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  function splitName(full) {
    const parts = full.trim().split(/\s+/);
    if (parts.length === 1) return { first: parts[0], last: '' };
    const first = parts[0];
    const last = parts.slice(1).join(' ');
    return { first, last };
  }

  function foldLine(line) {
    const max = 75;
    if (line.length <= max) return line;
    const chunks = [line.slice(0, max)];
    for (let i = max; i < line.length; i += max - 1) {
      chunks.push(' ' + line.slice(i, i + max - 1));
    }
    return chunks.join('\r\n');
  }

  const TYPE_MAP = {
    work: 'WORK,VOICE',
    cell: 'CELL,VOICE',
    home: 'HOME,VOICE',
    fax: 'WORK,FAX',
    other: 'VOICE'
  };

  function buildVCard(data, photoDataUrl) {
    const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
    if (data.name) {
      const { first, last } = splitName(data.name);
      lines.push('FN:' + escapeVcard(data.name));
      lines.push('N:' + escapeVcard(last) + ';' + escapeVcard(first) + ';;;');
    } else if (data.org) {
      lines.push('FN:' + escapeVcard(data.org));
      lines.push('N:;;;;');
    }
    if (data.org) lines.push('ORG:' + escapeVcard(data.org));
    if (data.title) lines.push('TITLE:' + escapeVcard(data.title));
    data.phones.forEach(p => {
      const type = TYPE_MAP[p.type] || 'VOICE';
      lines.push('TEL;TYPE=' + type + ':' + p.number);
    });
    if (data.email) lines.push('EMAIL;TYPE=INTERNET,WORK:' + data.email);
    if (data.url) {
      const url = /^https?:\/\//i.test(data.url) ? data.url : 'https://' + data.url;
      lines.push('URL:' + url);
    }
    if (data.address) {
      lines.push('ADR;TYPE=WORK:;;' + escapeVcard(data.address) + ';;;;');
    }
    if (data.note) lines.push('NOTE:' + escapeVcard(data.note));
    if (photoDataUrl) {
      const comma = photoDataUrl.indexOf(',');
      const b64 = comma >= 0 ? photoDataUrl.slice(comma + 1) : '';
      if (b64) lines.push(foldLine('PHOTO;ENCODING=b;TYPE=JPEG:' + b64));
    }
    lines.push('END:VCARD');
    return lines.join('\r\n') + '\r\n';
  }

  function resetAll() {
    state.front = null;
    state.back = null;
    state.embedDataUrl = null;
    els.fileFront.value = '';
    els.fileBack.value = '';
    els.previewFront.hidden = true;
    els.previewBack.hidden = true;
    els.previewFront.src = '';
    els.previewBack.src = '';
    els.tileFront.classList.remove('capture-tile--filled');
    els.tileBack.classList.remove('capture-tile--filled');
    els.btnExtract.disabled = true;
    els.stepForm.hidden = true;
    els.stepProgress.hidden = true;
    els.form.reset();
    els.embedPhoto.checked = true;
    els.phoneList.innerHTML = '';
    els.rawText.textContent = '';
    els.saveHint.hidden = true;
    els.stepCapture.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
})();
