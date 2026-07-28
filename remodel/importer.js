// ============================================================
// RemodelHQ — project import
//
// Reads a CSV exported from another tool (Notion's "Export → CSV" is the
// case this was built against) and turns each row into a project, creating
// any rooms it mentions that do not exist yet.
//
// Deliberately a three-step flow — parse, preview, apply — because an
// import that silently creates fifty records is impossible to undo. Nothing
// is written until the preview has been confirmed, existing projects are
// never overwritten, and the caller gets a report of what happened.
// ============================================================

/**
 * Minimal RFC 4180 CSV parser: handles quoted fields containing commas,
 * newlines and escaped quotes, which Notion exports produce routinely.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  // Strip a UTF-8 BOM, which Excel and Notion both like to add.
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);

  if (!rows.length) return { headers: [], records: [] };

  const headers = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((h, idx) => { record[h] = (cells[idx] ?? "").trim(); });
    return record;
  });
  return { headers, records };
}

// ---------- column matching ----------
// Header names vary between tools, so match on intent rather than exact text.
const COLUMN_HINTS = {
  title:    ["name", "title", "project", "task", "item"],
  status:   ["status", "state", "stage"],
  priority: ["priority", "importance", "urgency"],
  room:     ["room", "rooms", "area", "location", "space"],
  start:    ["start date", "start", "planned start", "begin"],
  end:      ["finish date", "end date", "finish", "due", "planned end", "target"],
  notes:    ["notes", "description", "details", "comment", "summary"],
  tags:     ["tags", "labels", "category", "type"],
  // Idea-shaped columns
  vendor:   ["vendor", "store", "brand", "shop", "retailer", "supplier"],
  model:    ["model", "sku", "part", "item number", "product code", "kit"],
  price:    ["price", "cost", "amount", "estimate"],
  url:      ["url", "link", "source", "website", "product link"]
};

const norm = (s) => String(s || "").trim().toLowerCase();

export function detectColumns(headers) {
  const map = {};
  for (const [field, hints] of Object.entries(COLUMN_HINTS)) {
    // Prefer an exact header match, then fall back to a contains match.
    const exact = headers.find((h) => hints.includes(norm(h)));
    const loose = headers.find((h) => hints.some((hint) => norm(h).includes(hint)));
    const found = exact || loose;
    if (found) map[field] = found;
  }
  return map;
}

// ---------- value mapping ----------
const STATUS_MAP = {
  idea: "idea",
  ideas: "idea",
  wishlist: "idea",          // kept as an idea, plus a "wishlist" tag
  "wish list": "idea",
  someday: "idea",
  maybe: "idea",
  researching: "researching",
  research: "researching",
  planned: "planned",
  planning: "planned",
  "awaiting bid": "awaiting_bid",
  bidding: "awaiting_bid",
  quote: "awaiting_bid",
  "awaiting approval": "awaiting_approval",
  approved: "approved",
  scheduled: "scheduled",
  "in progress": "in_progress",
  doing: "in_progress",
  active: "in_progress",
  started: "in_progress",
  blocked: "blocked",
  stuck: "blocked",
  "on hold": "on_hold",
  paused: "on_hold",
  complete: "complete",
  completed: "complete",
  done: "complete",
  finished: "complete",
  cancelled: "cancelled",
  canceled: "cancelled",
  dropped: "cancelled"
};

/** Statuses that arrive as a wishlist-style label get this tag added. */
const WISHLIST_LABELS = ["wishlist", "wish list", "someday", "maybe"];

const PRIORITY_MAP = {
  low: "low", "1": "low", lowest: "low",
  medium: "medium", med: "medium", normal: "medium", "2": "medium",
  high: "high", "3": "high",
  critical: "critical", urgent: "critical", highest: "critical", "4": "critical"
};

export function mapStatus(raw) {
  return STATUS_MAP[norm(raw)] || "idea";
}
export function mapPriority(raw) {
  return PRIORITY_MAP[norm(raw)] || "medium";
}
export function isWishlist(raw) {
  return WISHLIST_LABELS.includes(norm(raw));
}

/** Multi-select values arrive comma or semicolon separated. */
export function splitMulti(raw) {
  return String(raw || "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseDate(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  // The app's date inputs want yyyy-mm-dd in local time.
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);

/**
 * "$1,234.56" -> 1234.56. An empty cell is no price at all, not zero — a
 * free item and an unknown price are different things.
 */
function parseMoney(raw) {
  const cleaned = String(raw ?? "").replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

const IDEA_STATUS_MAP = {
  saved: "saved", idea: "saved", wishlist: "saved", "wish list": "saved",
  researching: "researching", research: "researching", considering: "researching",
  shortlisted: "shortlisted", shortlist: "shortlisted", maybe: "shortlisted",
  selected: "selected", chosen: "selected", picked: "selected",
  purchased: "purchased", bought: "purchased", ordered: "purchased",
  rejected: "rejected", no: "rejected", passed: "rejected"
};

/**
 * A file is idea-shaped when it carries the things an idea needs — a vendor,
 * a price or a link — rather than schedule columns.
 */
export function guessTarget(columns) {
  const ideaSignals = ["vendor", "price", "url", "model"].filter((k) => columns[k]).length;
  const projectSignals = ["status", "start", "end", "priority"].filter((k) => columns[k]).length;
  return ideaSignals > projectSignals ? "ideas" : "projects";
}

/** Same three-step contract as buildPlan, for the idea library. */
export function buildIdeaPlan(records, columns, existing) {
  const existingTitles = new Set((existing.ideas || []).map((i) => norm(i.title)));
  const roomsByName = new Map((existing.rooms || []).map((r) => [norm(r.name), r]));

  const newRooms = [];
  const ideas = [];
  const skipped = [];
  const seenInFile = new Set();

  for (const record of records) {
    const title = (columns.title ? record[columns.title] : "").trim();

    if (!title) { skipped.push({ title: "(untitled row)", reason: "no name" }); continue; }
    if (existingTitles.has(norm(title))) {
      skipped.push({ title, reason: "already saved" }); continue;
    }
    if (seenInFile.has(norm(title))) {
      skipped.push({ title, reason: "duplicated in the file" }); continue;
    }
    seenInFile.add(norm(title));

    const roomNames = columns.room ? splitMulti(record[columns.room]) : [];
    let roomId = null;
    let roomName = "";
    if (roomNames.length) {
      roomName = roomNames[0];
      const match = roomsByName.get(norm(roomName));
      if (match) roomId = match.id;
      else if (!newRooms.some((r) => norm(r) === norm(roomName))) newRooms.push(roomName);
    }

    const tags = [];
    roomNames.slice(1).forEach((extra) => tags.push(slug(extra)));
    if (columns.tags) splitMulti(record[columns.tags]).forEach((t) => tags.push(slug(t)));

    ideas.push({
      title,
      status: IDEA_STATUS_MAP[norm(columns.status ? record[columns.status] : "")] || "saved",
      roomName,
      roomId,
      vendor: columns.vendor ? String(record[columns.vendor] || "").slice(0, 120) : "",
      model: columns.model ? String(record[columns.model] || "").slice(0, 120) : "",
      estPrice: columns.price ? parseMoney(record[columns.price]) : null,
      sourceUrl: columns.url ? String(record[columns.url] || "").slice(0, 500) : "",
      notes: columns.notes ? String(record[columns.notes] || "").slice(0, 4000) : "",
      tags: [...new Set(tags.filter(Boolean))].slice(0, 20)
    });
  }

  return { ideas, newRooms, skipped };
}

/**
 * Turns parsed rows into a plan: what would be created, what would be
 * skipped, and why. Pure — touches nothing.
 *
 * @param records  rows from parseCsv
 * @param columns  result of detectColumns (or a user-corrected version)
 * @param existing { projects: [{title}], rooms: [{id, name}] }
 */
export function buildPlan(records, columns, existing) {
  const existingTitles = new Set((existing.projects || []).map((p) => norm(p.title)));
  const roomsByName = new Map((existing.rooms || []).map((r) => [norm(r.name), r]));

  const newRooms = [];
  const projects = [];
  const skipped = [];
  const seenInFile = new Set();

  for (const record of records) {
    const title = (columns.title ? record[columns.title] : "").trim();

    if (!title) {
      skipped.push({ title: "(untitled row)", reason: "no name" });
      continue;
    }
    if (existingTitles.has(norm(title))) {
      skipped.push({ title, reason: "already in this workspace" });
      continue;
    }
    if (seenInFile.has(norm(title))) {
      skipped.push({ title, reason: "duplicated in the file" });
      continue;
    }
    seenInFile.add(norm(title));

    const rawStatus = columns.status ? record[columns.status] : "";
    const roomNames = columns.room ? splitMulti(record[columns.room]) : [];

    // A project belongs to one room. When a row lists several, the first
    // becomes the room and the rest are kept as tags so nothing is lost.
    let roomId = null;
    let roomName = "";
    if (roomNames.length) {
      roomName = roomNames[0];
      const match = roomsByName.get(norm(roomName));
      if (match) {
        roomId = match.id;
      } else if (!newRooms.some((r) => norm(r) === norm(roomName))) {
        newRooms.push(roomName);
      }
    }

    const tags = [];
    if (isWishlist(rawStatus)) tags.push("wishlist");
    roomNames.slice(1).forEach((extra) => tags.push(slug(extra)));
    if (columns.tags) splitMulti(record[columns.tags]).forEach((t) => tags.push(slug(t)));

    projects.push({
      title,
      status: mapStatus(rawStatus),
      priority: mapPriority(columns.priority ? record[columns.priority] : ""),
      roomName,
      roomId,
      plannedStart: parseDate(columns.start ? record[columns.start] : ""),
      plannedEnd: parseDate(columns.end ? record[columns.end] : ""),
      description: columns.notes ? String(record[columns.notes] || "").slice(0, 4000) : "",
      tags: [...new Set(tags.filter(Boolean))].slice(0, 20),
      completionPct: 0,
      originalStatus: rawStatus
    });
  }

  return { projects, newRooms, skipped };
}
