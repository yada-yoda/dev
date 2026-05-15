// SceneSeed — tiny QR helper
//
// Wraps the `qrcode` npm package (loaded as ESM from jsdelivr) so
// the rest of the app doesn't have to know the library exists.
// Generates inline SVG for display + a 1024×1024 PNG dataURL for download.

import QRCode from 'https://esm.run/qrcode@1.5.3';

const DEFAULT_COLOR = { dark: '#0f172a', light: '#ffffff' };

export async function generateQrSvg(text, options = {}) {
  return QRCode.toString(text, {
    type: 'svg',
    margin: 2,
    width: 320,
    color: DEFAULT_COLOR,
    errorCorrectionLevel: 'M',
    ...options
  });
}

export async function generateQrPngDataUrl(text, options = {}) {
  return QRCode.toDataURL(text, {
    type: 'image/png',
    margin: 4,
    width: 1024,
    color: DEFAULT_COLOR,
    errorCorrectionLevel: 'M',
    ...options
  });
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 0);
}
