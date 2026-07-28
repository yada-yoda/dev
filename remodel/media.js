// ============================================================
// RemodelHQ — image pipeline
//
// Everything that turns a camera file into something storable lives here,
// behind a small interface, so the storage target can change later (an
// object store, someone else's bucket) without touching feature code.
//
// What happens to a photo on the way in:
//   * EXIF orientation is applied, then all EXIF is discarded — including
//     GPS. A re-encode through a canvas cannot carry metadata across, so
//     location data cannot leak into a shared photo by accident.
//   * The image is resized to a sensible long edge and encoded to WebP,
//     stepping quality down until it fits the document budget.
//   * A separate small thumbnail is produced. Galleries load only these,
//     which keeps browsing cheap against the free tier's read quota.
// ============================================================

export const FULL_MAX_EDGE = 1600;
export const THUMB_MAX_EDGE = 400;

// Firestore caps a document at 1 MiB. These leave room for the rest of the
// document and must stay at or below the limits in firestore.rules.
export const FULL_MAX_BYTES = 900000;
export const THUMB_MAX_BYTES = 70000;

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

/** Rough guide for the storage meter: the free Firestore tier is 1 GiB. */
export const STORAGE_BUDGET_BYTES = 1024 * 1024 * 1024;

export function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Decodes a file with EXIF orientation already applied.
 * createImageBitmap handles this natively; the <img> fallback covers
 * browsers that do not support the option.
 */
async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through to the <img> path */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("That file could not be read as an image."));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function fit(width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    w: Math.max(1, Math.round(width * scale)),
    h: Math.max(1, Math.round(height * scale))
  };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Encodes to WebP, stepping quality down until it fits the budget, then
 * shrinking the image itself if quality alone is not enough.
 */
async function encode(source, srcW, srcH, maxEdge, maxBytes) {
  let edge = maxEdge;

  for (let attempt = 0; attempt < 6; attempt++) {
    const { w, h } = fit(srcW, srcH, edge);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, w, h);

    for (const quality of [0.82, 0.7, 0.58, 0.45]) {
      let blob = await canvasToBlob(canvas, "image/webp", quality);
      // Safari versions without WebP encoding return a PNG; JPEG is the
      // fallback that is still smaller than an unencoded PNG.
      if (!blob || blob.type !== "image/webp") {
        blob = await canvasToBlob(canvas, "image/jpeg", quality);
      }
      if (blob && blob.size <= maxBytes) {
        return { blob, width: w, height: h };
      }
    }
    edge = Math.round(edge * 0.75);
  }
  throw new Error("That image is too large to store even after compression.");
}

/**
 * file -> { full, thumb, width, height, bytes, type }
 * `full` and `thumb` are Uint8Arrays ready to be wrapped as Firestore bytes.
 */
export async function processImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }
  const source = await decode(file);
  const srcW = source.width || source.naturalWidth;
  const srcH = source.height || source.naturalHeight;
  if (!srcW || !srcH) throw new Error("That image could not be read.");

  const full = await encode(source, srcW, srcH, FULL_MAX_EDGE, FULL_MAX_BYTES);
  const thumb = await encode(source, srcW, srcH, THUMB_MAX_EDGE, THUMB_MAX_BYTES);
  if (typeof source.close === "function") source.close();

  return {
    full: new Uint8Array(await full.blob.arrayBuffer()),
    thumb: new Uint8Array(await thumb.blob.arrayBuffer()),
    width: full.width,
    height: full.height,
    bytes: full.blob.size + thumb.blob.size,
    type: full.blob.type
  };
}

// ---------- viewing ----------
// Object URLs are cached per media id so re-opening a photo in a session does
// not re-read it from Firestore, which protects the daily read quota.
const urlCache = new Map();

export function toObjectUrl(mediaId, bytes, type = "image/webp") {
  if (urlCache.has(mediaId)) return urlCache.get(mediaId);
  const view = bytes instanceof Uint8Array ? bytes : bytes.toUint8Array();
  const url = URL.createObjectURL(new Blob([view], { type }));
  urlCache.set(mediaId, url);
  return url;
}

export function forgetObjectUrl(mediaId) {
  const url = urlCache.get(mediaId);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(mediaId);
  }
}

export function clearObjectUrls() {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}
