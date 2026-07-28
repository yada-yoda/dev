// ============================================================
// RemodelHQ — application shell, routing and views
//
// Rendering only. Every Firestore call lives in store.js, and every
// authorization decision is enforced by firestore.rules — the role checks
// here shape the interface, they do not protect the data.
// ============================================================

// The ?v on these imports must match the one in index.html: it is what stops a
// browser pairing a fresh app.js with a cached store.js after a deploy.
import { CONFIGURED, onAuth, signIn, signOutNow, currentUser } from "./firebase-config.js?v=0.3.0";
import * as store from "./store.js?v=0.3.0";
import * as media from "./media.js?v=0.3.0";

export const VERSION = "0.3.0";

// ---------- tiny DOM helpers ----------
const $ = (sel) => document.querySelector(sel);

/** Escapes user-supplied text before it goes into an HTML string. */
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" });
const fmtDate = (d) => (d ? DATE_FMT.format(d) : "—");

// USD by default, with the currency kept configurable for later.
const MONEY_FMT = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2
});
const fmtMoney = (n) => (Number.isFinite(n) ? MONEY_FMT.format(n) : "—");

/** GA4 event, no-op when analytics is opted out or blocked. */
function track(name, params) {
  if (typeof window.gtag === "function") window.gtag("event", name, params || {});
}

// ---------- state ----------
const state = {
  user: null,
  workspaces: [],
  invites: [],
  wsId: localStorage.getItem("rhq_ws") || null,
  ws: null,
  route: "dashboard",
  routeId: null,
  rooms: []
};

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: iconGrid },
  { id: "projects",  label: "Projects",  icon: iconList },
  { id: "photos",    label: "Photos",    icon: iconPhoto },
  { id: "ideas",     label: "Ideas",     icon: iconBulb },
  { id: "rooms",     label: "Rooms",     icon: iconRooms },
  { id: "people",    label: "People",    icon: iconPeople },
  { id: "settings",  label: "Settings",  icon: iconGear }
];

// A phone bottom bar fits five targets. The rest live behind More.
const MOBILE_PRIMARY = ["dashboard", "projects", "photos", "ideas"];

const photoUI = {
  mode: localStorage.getItem("rhq_photo_mode") || "grid",
  room: "",
  project: "",
  category: ""
};

const ideaUI = { status: "", room: "" };

// Projects view state: filters, list-or-board, sort, and which optional
// columns are shown. The column choice is saved per workspace.
const projectUI = {
  mode: localStorage.getItem("rhq_proj_mode") || "list",
  q: "",
  room: "",
  status: "",
  priority: "",
  tag: "",
  sort: { key: "title", dir: "asc" }
};

const ALL_COLUMNS = [
  { key: "room",       label: "Room" },
  { key: "status",     label: "Status" },
  { key: "priority",   label: "Priority" },
  { key: "planned",    label: "Planned dates" },
  { key: "completion", label: "Complete" },
  { key: "tags",       label: "Tags" }
];
const DEFAULT_COLUMNS = ["room", "status", "priority", "planned", "completion"];

function columnKey() {
  return `rhq_cols_${state.wsId || "none"}`;
}
function visibleColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(columnKey()) || "null");
    if (Array.isArray(saved)) return saved.filter((k) => ALL_COLUMNS.some((c) => c.key === k));
  } catch { /* fall through to defaults */ }
  return DEFAULT_COLUMNS;
}
function saveColumns(keys) {
  localStorage.setItem(columnKey(), JSON.stringify(keys));
}

// ============================================================
// Toasts — top-center, passive confirmations only
// ============================================================
function toast(message, kind = "ok") {
  const host = $("#toast-host");
  const node = document.createElement("div");
  node.className = "toast" + (kind === "bad" ? " toast-bad" : "");
  node.setAttribute("role", kind === "bad" ? "alert" : "status");
  node.textContent = message;
  host.appendChild(node);
  setTimeout(() => node.remove(), kind === "bad" ? 6000 : 3200);
}

// ============================================================
// Modal — closes via X, Cancel, confirm or Escape. Never on a
// backdrop click, so a stray click cannot discard a half-filled form.
// ============================================================
let modalState = null;

function openModal({ title, body, confirmText = "Save", danger = false, onConfirm, hideConfirm = false }) {
  const host = $("#modal-host");
  $("#modal-title").textContent = title;
  const bodyEl = $("#modal-body");
  bodyEl.innerHTML = body;

  const confirmBtn = $("#modal-confirm");
  confirmBtn.textContent = confirmText;
  confirmBtn.className = "btn" + (danger ? " btn-danger" : "");
  confirmBtn.classList.toggle("hidden", hideConfirm);
  confirmBtn.disabled = false;

  host.classList.remove("hidden");
  modalState = { onConfirm };

  const focusTarget = bodyEl.querySelector("input, select, textarea, button");
  if (focusTarget) setTimeout(() => focusTarget.focus(), 20);
  return bodyEl;
}

function closeModal() {
  $("#modal-host").classList.add("hidden");
  $("#modal-body").innerHTML = "";
  modalState = null;
}

async function runConfirm() {
  if (!modalState?.onConfirm) return closeModal();
  const btn = $("#modal-confirm");
  btn.disabled = true;
  try {
    const result = await modalState.onConfirm();
    if (result !== false) closeModal();
    else btn.disabled = false;
  } catch (err) {
    btn.disabled = false;
    showModalError(store.describeError(err));
  }
}

function showModalError(message) {
  let box = $("#modal-body .field-error-box");
  if (!box) {
    box = document.createElement("p");
    box.className = "field-error field-error-box";
    $("#modal-body").prepend(box);
  }
  box.textContent = message;
}

/** A decision the user must make deliberately — always a modal, never a toast. */
function confirmDialog({ title, message, confirmText = "Confirm", danger = true, onConfirm }) {
  openModal({ title, body: `<p>${esc(message)}</p>`, confirmText, danger, onConfirm });
}

// ============================================================
// Auth gate
// ============================================================
function renderGate(errorMessage) {
  $("#gate").classList.remove("hidden");
  $("#shell").classList.add("hidden");
  $("#picker").classList.add("hidden");

  const err = $("#gate-error");
  if (errorMessage) {
    err.textContent = errorMessage;
    err.classList.remove("hidden");
  } else {
    err.classList.add("hidden");
  }

  const setupNote = $("#gate-setup");
  setupNote.classList.toggle("hidden", CONFIGURED);
  $("#btn-signin").disabled = !CONFIGURED;
}

// ============================================================
// Workspace picker — also where pending invitations surface
// ============================================================
async function renderPicker() {
  $("#gate").classList.add("hidden");
  $("#shell").classList.add("hidden");
  const host = $("#picker");
  host.classList.remove("hidden");
  host.innerHTML = `<div class="loading">Loading your workspaces…</div>`;

  let workspaces = [];
  let invites = [];
  try {
    [workspaces, invites] = await Promise.all([
      store.loadMyWorkspaces(),
      store.loadMyInvites()
    ]);
  } catch (err) {
    host.innerHTML = `<div class="error-box">${esc(store.describeError(err))}</div>`;
    return;
  }

  state.workspaces = workspaces;
  invites = invites.filter((inv) => !store.isDeclined(inv.id));
  state.invites = invites;

  const inviteHtml = invites.map((inv) => `
    <div class="invite-card">
      <div class="grow">
        <strong>You have been invited to collaborate</strong>
        <div class="muted">Role: ${esc(store.ROLES[inv.role]?.label || inv.role)} ·
          expires ${esc(fmtDate(inv.expiresAt))}</div>
      </div>
      <button class="btn btn-sm" data-accept="${esc(inv.id)}">Accept</button>
      <button class="btn btn-ghost btn-sm" data-decline="${esc(inv.id)}">Not now</button>
    </div>`).join("");

  const listHtml = workspaces.length
    ? `<div class="picker-list">${workspaces.map((ws) => `
        <button class="picker-item" data-open="${esc(ws.id)}">
          <span class="pi-name wrap-any">${esc(ws.name)}</span>
          <span class="chip">${esc(store.ROLES[ws.role]?.label || ws.role)}</span>
        </button>`).join("")}</div>`
    : `<div class="empty">
         <h3>No workspace yet</h3>
         <p>A workspace holds one property: its rooms, projects, photos, budget and the
            people you share it with. Create one to get started.</p>
       </div>`;

  host.innerHTML = `
    <h1>Your remodels</h1>
    <p class="muted" style="margin:6px 0 22px">Signed in as ${esc(state.user?.email || "")}</p>
    ${inviteHtml}
    ${listHtml}
    <button class="btn" id="btn-new-ws">Create a workspace</button>
    <p style="margin-top:22px"><button class="btn-link" id="btn-signout-picker">Sign out</button></p>
  `;

  host.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => selectWorkspace(btn.dataset.open));
  });
  host.querySelectorAll("[data-accept]").forEach((btn) => {
    btn.addEventListener("click", () => acceptInvite(btn.dataset.accept));
  });
  host.querySelectorAll("[data-decline]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await store.declineInvite(btn.dataset.decline);
      toast("Invitation hidden on this device.");
      renderPicker();
    });
  });
  $("#btn-new-ws").addEventListener("click", promptCreateWorkspace);
  $("#btn-signout-picker").addEventListener("click", () => signOutNow());
}

function promptCreateWorkspace() {
  openModal({
    title: "Create a workspace",
    confirmText: "Create",
    body: `
      <div class="field">
        <label for="new-ws-name">Workspace name
          <span class="info" title="Usually the property this remodel is for. You can rename it later.">i</span>
        </label>
        <input type="text" id="new-ws-name" maxlength="80" placeholder="Condo remodel" autocomplete="off">
        <span class="hint">Usually the property this remodel is for — you can rename it later.</span>
      </div>`,
    onConfirm: async () => {
      const name = $("#new-ws-name").value.trim();
      if (!name) { showModalError("Give the workspace a name."); return false; }
      const wsId = await store.createWorkspace(name);
      track("workspace_create");
      toast("Workspace created.");
      await selectWorkspace(wsId);
    }
  });
}

async function acceptInvite(inviteId) {
  const invite = state.invites.find((i) => i.id === inviteId);
  if (!invite) return;
  try {
    await store.acceptInvite(invite);
    track("invite_accept");
    toast("You have joined the workspace.");
    await selectWorkspace(invite.workspaceId);
  } catch (err) {
    toast(store.describeError(err), "bad");
  }
}

// ============================================================
// Workspace shell
// ============================================================
async function selectWorkspace(wsId) {
  state.wsId = wsId;
  localStorage.setItem("rhq_ws", wsId);
  await bootWorkspace();
}

async function bootWorkspace() {
  try {
    state.ws = await store.loadWorkspace(state.wsId);
  } catch (err) {
    toast(store.describeError(err), "bad");
    state.ws = null;
  }
  if (!state.ws) {
    // Removed, deleted, or a stale pointer from another device.
    localStorage.removeItem("rhq_ws");
    state.wsId = null;
    return renderPicker();
  }
  $("#gate").classList.add("hidden");
  $("#picker").classList.add("hidden");
  $("#shell").classList.remove("hidden");
  renderChrome();
  renderRoute();
}

function renderChrome() {
  const ws = state.ws;
  const role = store.ROLES[ws.myRole];

  $("#ws-name").textContent = ws.name;
  $("#ws-role").textContent = role?.label || ws.myRole;
  // On phones the sidebar is hidden, so the bar carries the workspace you are
  // in rather than repeating the page heading below it.
  $("#topbar-title").textContent = ws.name;
  $("#topbar-role").textContent = role?.label || ws.myRole;

  $("#nav").innerHTML = NAV.map((item) => `
    <a href="#/${item.id}" class="${item.id === state.route ? "on" : ""}" data-nav="${item.id}">
      ${item.icon()}<span>${item.label}</span>
    </a>`).join("");

  const secondary = NAV.filter((n) => !MOBILE_PRIMARY.includes(n.id));
  $("#bottom-nav").innerHTML =
    NAV.filter((n) => MOBILE_PRIMARY.includes(n.id)).map((item) => `
      <a href="#/${item.id}" class="${item.id === state.route ? "on" : ""}" data-nav="${item.id}">
        ${item.icon()}<span>${item.label}</span>
      </a>`).join("") +
    `<a href="#" id="btn-more" class="${secondary.some((n) => n.id === state.route) ? "on" : ""}">
      ${iconMore()}<span>More</span></a>`;

  $("#btn-more")?.addEventListener("click", (e) => {
    e.preventDefault();
    openModal({
      title: "More",
      hideConfirm: true,
      body: `<nav class="more-menu">${secondary.map((item) => `
        <a href="#/${item.id}" data-more>${item.icon()}<span>${item.label}</span></a>`).join("")}</nav>`
    });
    document.querySelectorAll("[data-more]").forEach((link) => {
      link.addEventListener("click", () => closeModal());
    });
  });

  const user = state.user;
  $("#side-user").innerHTML = `
    ${user?.photoURL ? `<img src="${esc(user.photoURL)}" alt="">` : ""}
    <span class="who wrap-any">${esc(user?.displayName || user?.email || "")}</span>`;
  $("#app-version").textContent = "v" + VERSION;
}

function renderRoute() {
  const view = $("#view");
  view.scrollTop = 0;
  renderChrome();
  track("view_section", { section: state.route });

  switch (state.route) {
    case "projects": return state.routeId ? viewProject(view, state.routeId) : viewProjects(view);
    case "photos":   return viewPhotos(view);
    case "ideas":    return viewIdeas(view);
    case "rooms":    return viewRooms(view);
    case "people":   return viewPeople(view);
    case "settings": return viewSettings(view);
    default:         return viewDashboard(view);
  }
}

// ============================================================
// View — Dashboard
// ============================================================
async function viewDashboard(host) {
  const ws = state.ws;
  host.innerHTML = `
    <div class="view-head">
      <div class="grow">
        <h1 class="wrap-any">${esc(ws.name)}</h1>
        <p>Everything for this remodel lives here.</p>
      </div>
    </div>
    <div class="loading">Loading…</div>`;

  let rooms = [];
  let members = [];
  let projects = [];
  let openTasks = [];
  try {
    [rooms, members, projects, openTasks] = await Promise.all([
      store.loadRooms(ws.id),
      store.loadMembers(ws.id),
      store.loadProjects(ws.id),
      store.loadOpenTasks(ws.id)
    ]);
  } catch (err) {
    host.querySelector(".loading").outerHTML =
      `<div class="error-box">${esc(store.describeError(err))}</div>`;
    return;
  }
  state.rooms = rooms;

  const canAdd = store.canEdit(ws.myRole);
  const live = projects.filter((p) => !store.isClosedStatus(p.status));
  const active = projects.filter((p) => p.status === "in_progress");
  const stalled = projects.filter((p) => p.status === "blocked" || p.status === "on_hold");
  const done = projects.filter((p) => p.status === "complete");

  const today = new Date(new Date().toDateString());
  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < today);

  // Overall completion is averaged across everything not cancelled, so a
  // finished project keeps counting toward the total.
  const counted = projects.filter((p) => p.status !== "cancelled");
  const overall = counted.length
    ? Math.round(counted.reduce((sum, p) =>
        sum + (p.status === "complete" ? 100 : (p.completionPct || 0)), 0) / counted.length)
    : 0;

  host.querySelector(".loading").outerHTML = `
    ${counted.length ? `
      <div class="progress-wrap">
        <div class="progress-lbl"><span>Overall completion</span><span class="num">${overall}%</span></div>
        <div class="progress"><i style="width:${overall}%"></i></div>
      </div>` : ""}

    <div class="grid-stats">
      <div class="card stat"><span>Active projects</span><b class="num">${active.length}</b>
        <span class="sub ${stalled.length ? "is-warn" : ""}">${
          stalled.length ? `${stalled.length} blocked or on hold` : `${live.length} open in total`}</span></div>
      <div class="card stat"><span>Overdue tasks</span><b class="num">${overdue.length}</b>
        <span class="sub">${openTasks.length} open in total</span></div>
      <div class="card stat"><span>Rooms</span><b class="num">${rooms.length}</b>
        <span class="sub">${done.length} project${done.length === 1 ? "" : "s"} complete</span></div>
      <div class="card stat"><span>People</span><b class="num">${members.length}</b>
        <span class="sub">${members.length === 1 ? "Just you so far" : "with access"}</span></div>
    </div>

    ${projects.length === 0 ? `
      <div class="section">
        <div class="empty">
          <h3>${rooms.length ? "Add your first project" : "Start with the rooms"}</h3>
          <p>${rooms.length
            ? "A project is one piece of work — replacing the cabinets, retiling the shower. Everything else hangs off projects."
            : "Rooms are what everything else hangs off — projects, photos, budgets and contractor access are all organized by room."}</p>
          ${canAdd ? `<a class="btn" href="#/${rooms.length ? "projects" : "rooms"}">${rooms.length ? "Go to projects" : "Add rooms"}</a>` : ""}
        </div>
      </div>` : `
      <div class="section">
        <div class="section-head">
          <h2>${active.length ? "In progress" : "Projects"}</h2>
          <a href="#/projects">View all</a>
        </div>
        <div class="grid">
          ${(active.length ? active : live.slice(0, 6)).slice(0, 6).map((p) => `
            <a class="card board-card" href="#/projects/${esc(p.id)}">
              <strong class="wrap-any">${esc(p.title)}</strong>
              ${p.roomId ? `<span class="muted board-room">${esc(roomName(p.roomId))}</span>` : ""}
              <span class="board-chips">${statusChip(p.status)}${priorityChip(p.priority)}</span>
              <span class="mini"><i style="width:${p.completionPct || 0}%"></i></span>
            </a>`).join("")}
        </div>
      </div>`}

    ${stalled.length ? `
      <div class="section">
        <div class="section-head"><h2>Needs attention</h2></div>
        <div class="card">
          <ul class="plain-list">
            ${stalled.map((p) => `<li>
              <a href="#/projects/${esc(p.id)}" class="wrap-any">${esc(p.title)}</a>
              ${statusChip(p.status)}</li>`).join("")}
          </ul>
        </div>
      </div>` : ""}

    <div class="section">
      <div class="section-head"><h2>Recent activity</h2></div>
      <div class="card" id="dash-activity"><p class="muted">Loading…</p></div>
    </div>`;

  store.loadActivity(ws.id, 8).then((events) => {
    const box = $("#dash-activity");
    if (!box) return;
    box.innerHTML = events.length
      ? `<ul class="activity">${events.map((e) => `
          <li><span class="wrap-any">${esc(e.summary)}</span>
            <span class="muted act-when">${esc(e.byName || "")} · ${esc(fmtDate(e.at))}</span></li>`).join("")}</ul>`
      : `<p class="muted">Nothing yet. Project changes will show up here.</p>`;
  }).catch(() => {
    const box = $("#dash-activity");
    if (box) box.innerHTML = `<p class="muted">History unavailable.</p>`;
  });
}

// ============================================================
// View — Projects (list + board)
// ============================================================
function roomName(roomId) {
  if (!roomId) return "";
  return state.rooms.find((r) => r.id === roomId)?.name || "";
}

function statusChip(status) {
  const closed = store.isClosedStatus(status);
  const attention = status === "blocked" || status === "on_hold";
  const cls = closed ? "chip chip-out" : attention ? "chip chip-warn" : "chip chip-solid";
  return `<span class="${cls}">${esc(store.statusLabel(status))}</span>`;
}

function priorityChip(priority) {
  const cls = priority === "critical" ? "chip chip-bad"
    : priority === "high" ? "chip chip-warn"
    : "chip chip-out";
  return `<span class="${cls}">${esc(store.priorityLabel(priority))}</span>`;
}

function applyFilters(projects) {
  const q = projectUI.q.trim().toLowerCase();
  return projects.filter((p) => {
    if (projectUI.room && p.roomId !== projectUI.room) return false;
    if (projectUI.status && p.status !== projectUI.status) return false;
    if (projectUI.priority && p.priority !== projectUI.priority) return false;
    if (projectUI.tag && !(p.tags || []).includes(projectUI.tag)) return false;
    if (q) {
      const hay = `${p.title} ${p.description || ""} ${roomName(p.roomId)} ${(p.tags || []).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function sortProjects(projects) {
  const { key, dir } = projectUI.sort;
  const mul = dir === "desc" ? -1 : 1;
  const statusOrder = store.PROJECT_STATUSES.map((s) => s.value);
  const priorityOrder = store.PRIORITIES.map((p) => p.value);
  return [...projects].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "room":       cmp = roomName(a.roomId).localeCompare(roomName(b.roomId)); break;
      case "status":     cmp = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status); break;
      case "priority":   cmp = priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority); break;
      case "planned":    cmp = (a.plannedStart?.getTime() || 0) - (b.plannedStart?.getTime() || 0); break;
      case "completion": cmp = (a.completionPct || 0) - (b.completionPct || 0); break;
      default:           cmp = (a.title || "").localeCompare(b.title || "");
    }
    return cmp * mul;
  });
}

async function viewProjects(host) {
  const ws = state.ws;
  const mayEdit = store.canEdit(ws.myRole);

  host.innerHTML = `
    <div class="view-head">
      <div class="grow">
        <h1>Projects</h1>
        <p>Every piece of work in this remodel, from a first idea to a finished room.</p>
      </div>
      ${mayEdit ? `<button class="btn" id="btn-new-project">New project</button>` : ""}
    </div>
    <div class="loading">Loading projects…</div>`;

  $("#btn-new-project")?.addEventListener("click", () => promptProject(null));

  let projects = [];
  try {
    [projects, state.rooms] = await Promise.all([
      store.loadProjects(ws.id),
      store.loadRooms(ws.id)
    ]);
  } catch (err) {
    host.querySelector(".loading").outerHTML =
      `<div class="error-box">${esc(store.describeError(err))}</div>`;
    return;
  }

  if (!projects.length) {
    host.querySelector(".loading").outerHTML = `
      <div class="empty">
        <h3>No projects yet</h3>
        <p>A project is one piece of work — "replace the kitchen cabinets", "retile
           the shower". Give it a room, a status and a priority, then break it into
           phases and tasks as it firms up.</p>
        ${mayEdit ? `<button class="btn" id="btn-first-project">Add the first project</button>` : ""}
      </div>`;
    $("#btn-first-project")?.addEventListener("click", () => promptProject(null));
    return;
  }

  const allTags = [...new Set(projects.flatMap((p) => p.tags || []))].sort();
  const filtered = applyFilters(projects);

  host.querySelector(".loading").outerHTML = `
    <div class="toolbar">
      <input type="search" id="pf-q" class="toolbar-search" placeholder="Search projects…"
             value="${esc(projectUI.q)}" aria-label="Search projects">
      <select id="pf-room" aria-label="Filter by room">
        <option value="">All rooms</option>
        ${state.rooms.map((r) => `<option value="${esc(r.id)}" ${projectUI.room === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}
      </select>
      <select id="pf-status" aria-label="Filter by status">
        <option value="">Any status</option>
        ${store.PROJECT_STATUSES.map((s) => `<option value="${s.value}" ${projectUI.status === s.value ? "selected" : ""}>${s.label}</option>`).join("")}
      </select>
      <select id="pf-priority" aria-label="Filter by priority">
        <option value="">Any priority</option>
        ${store.PRIORITIES.map((p) => `<option value="${p.value}" ${projectUI.priority === p.value ? "selected" : ""}>${p.label}</option>`).join("")}
      </select>
      ${allTags.length ? `<select id="pf-tag" aria-label="Filter by tag">
        <option value="">Any tag</option>
        ${allTags.map((t) => `<option value="${esc(t)}" ${projectUI.tag === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
      </select>` : ""}
      <div class="toolbar-right">
        <div class="seg" role="group" aria-label="View">
          <button class="${projectUI.mode === "list" ? "on" : ""}" data-mode="list" type="button">List</button>
          <button class="${projectUI.mode === "board" ? "on" : ""}" data-mode="board" type="button">Board</button>
        </div>
        ${projectUI.mode === "list" ? `<button class="btn btn-ghost btn-sm" id="btn-columns">Columns</button>` : ""}
      </div>
    </div>

    <p class="muted result-count">${filtered.length} of ${projects.length} shown${
      filtered.length !== projects.length ? ` · <button class="btn-link" id="btn-clear-filters">Clear filters</button>` : ""}</p>

    <div id="projects-body">${
      filtered.length
        ? (projectUI.mode === "board" ? boardHtml(filtered) : listHtml(filtered))
        : `<div class="empty"><h3>Nothing matches</h3><p>No project matches those filters.</p></div>`
    }</div>`;

  wireProjectToolbar();
}

function listHtml(projects) {
  const cols = visibleColumns();
  const shown = ALL_COLUMNS.filter((c) => cols.includes(c.key));
  const sorted = sortProjects(projects);
  const arrow = (key) => projectUI.sort.key === key
    ? (projectUI.sort.dir === "asc" ? " ↑" : " ↓") : "";

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th><button class="btn-link" data-sort="title">Project${arrow("title")}</button></th>
            ${shown.map((c) => `<th class="${c.key === "planned" ? "date" : ""}">
              <button class="btn-link" data-sort="${c.key}">${c.label}${arrow(c.key)}</button></th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${sorted.map((p) => `
            <tr>
              <td data-label="Project" class="wrap-any">
                <a href="#/projects/${esc(p.id)}">${esc(p.title)}</a>
              </td>
              ${shown.map((c) => `<td data-label="${c.label}" class="${c.key === "planned" ? "date" : ""}">${cellHtml(p, c.key)}</td>`).join("")}
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function cellHtml(p, key) {
  switch (key) {
    case "room":     return esc(roomName(p.roomId)) || `<span class="muted">—</span>`;
    case "status":   return statusChip(p.status);
    case "priority": return priorityChip(p.priority);
    case "planned":  return p.plannedStart || p.plannedEnd
      ? `${esc(fmtDate(p.plannedStart))} – ${esc(fmtDate(p.plannedEnd))}`
      : `<span class="muted">—</span>`;
    case "completion": return `<span class="num">${p.completionPct || 0}%</span>
      <span class="mini mini-inline"><i style="width:${p.completionPct || 0}%"></i></span>`;
    case "tags":     return (p.tags || []).length
      ? (p.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join(" ")
      : `<span class="muted">—</span>`;
    default: return "";
  }
}

function boardHtml(projects) {
  return `<div class="board">${store.BOARD_LANES.map((lane) => {
    const inLane = projects.filter((p) => store.statusLane(p.status) === lane.id);
    return `
      <section class="lane" aria-label="${lane.label}">
        <header class="lane-head">
          <h3>${lane.label}</h3><span class="lane-count num">${inLane.length}</span>
        </header>
        ${inLane.length ? inLane.map((p) => `
          <a class="card board-card" href="#/projects/${esc(p.id)}">
            <strong class="wrap-any">${esc(p.title)}</strong>
            ${p.roomId ? `<span class="muted board-room">${esc(roomName(p.roomId))}</span>` : ""}
            <span class="board-chips">${statusChip(p.status)}${priorityChip(p.priority)}</span>
            ${p.completionPct ? `<span class="mini"><i style="width:${p.completionPct}%"></i></span>` : ""}
          </a>`).join("") : `<p class="lane-empty muted">Nothing here</p>`}
      </section>`;
  }).join("")}</div>`;
}

function wireProjectToolbar() {
  const rerender = () => renderRoute();

  const q = $("#pf-q");
  if (q) {
    let timer = null;
    q.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        projectUI.q = q.value;
        rerender();
        const again = $("#pf-q");
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      }, 250);
    });
  }

  const bind = (sel, prop) => {
    const el = $(sel);
    el?.addEventListener("change", () => { projectUI[prop] = el.value; rerender(); });
  };
  bind("#pf-room", "room");
  bind("#pf-status", "status");
  bind("#pf-priority", "priority");
  bind("#pf-tag", "tag");

  $("#btn-clear-filters")?.addEventListener("click", () => {
    projectUI.q = ""; projectUI.room = ""; projectUI.status = "";
    projectUI.priority = ""; projectUI.tag = "";
    rerender();
  });

  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      projectUI.mode = btn.dataset.mode;
      localStorage.setItem("rhq_proj_mode", projectUI.mode);
      rerender();
    });
  });

  // Sort cycles ascending, descending, then back to the default.
  document.querySelectorAll("[data-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      if (projectUI.sort.key !== key) projectUI.sort = { key, dir: "asc" };
      else if (projectUI.sort.dir === "asc") projectUI.sort.dir = "desc";
      else projectUI.sort = { key: "title", dir: "asc" };
      rerender();
    });
  });

  $("#btn-columns")?.addEventListener("click", promptColumns);
}

function promptColumns() {
  const current = visibleColumns();
  openModal({
    title: "Columns",
    confirmText: "Save",
    body: `
      <p class="muted" style="margin-bottom:12px">Choose what the list shows. Saved for
         this workspace on this device.</p>
      ${ALL_COLUMNS.map((c) => `
        <label class="check-row">
          <input type="checkbox" value="${c.key}" ${current.includes(c.key) ? "checked" : ""}>
          <span>${c.label}</span>
        </label>`).join("")}`,
    onConfirm: async () => {
      const picked = [...document.querySelectorAll("#modal-body input:checked")].map((i) => i.value);
      saveColumns(picked);
      toast("Columns saved.");
      renderRoute();
    }
  });
}

function promptProject(project) {
  const editing = !!project;
  const iso = (d) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : "");

  openModal({
    title: editing ? "Edit project" : "New project",
    confirmText: editing ? "Save changes" : "Create project",
    body: `
      <div class="field">
        <label for="pr-title">Title</label>
        <input type="text" id="pr-title" maxlength="120" value="${esc(project?.title || "")}"
               placeholder="Replace kitchen cabinets" autocomplete="off">
      </div>
      <div class="field-row">
        <div class="field">
          <label for="pr-room">Room
            <span class="info" title="Which area this work belongs to. Photos, costs and contractor access all roll up by room.">i</span>
          </label>
          <select id="pr-room">
            <option value="">Not room-specific</option>
            ${state.rooms.map((r) => `<option value="${esc(r.id)}" ${project?.roomId === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="pr-status">Status
            <span class="info" title="Where this sits in the remodel: from a loose idea through to complete.">i</span>
          </label>
          <select id="pr-status" ${editing ? "" : 'class="needs-choice"'}>
            ${store.PROJECT_STATUSES.map((s) => `<option value="${s.value}" ${(project?.status || "idea") === s.value ? "selected" : ""}>${s.label}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="pr-priority">Priority</label>
          <select id="pr-priority">
            ${store.PRIORITIES.map((p) => `<option value="${p.value}" ${(project?.priority || "medium") === p.value ? "selected" : ""}>${p.label}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="pr-pct">Complete (%)
            <span class="info" title="Your own judgement of progress. Rolls up into the dashboard.">i</span>
          </label>
          <input type="number" id="pr-pct" min="0" max="100" step="5" value="${project?.completionPct ?? 0}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="pr-start">Planned start</label>
          <input type="date" id="pr-start" value="${iso(project?.plannedStart)}">
        </div>
        <div class="field">
          <label for="pr-end">Planned finish</label>
          <input type="date" id="pr-end" value="${iso(project?.plannedEnd)}">
        </div>
      </div>
      <div class="field">
        <label for="pr-tags">Tags
          <span class="info" title="Comma separated. Handy for cutting across rooms, e.g. plumbing or permit.">i</span>
        </label>
        <input type="text" id="pr-tags" value="${esc((project?.tags || []).join(", "))}"
               placeholder="plumbing, permit" autocomplete="off">
        <span class="hint">Comma separated — useful for cutting across rooms.</span>
      </div>
      <div class="field">
        <label for="pr-desc">Description</label>
        <textarea id="pr-desc" maxlength="4000" placeholder="Scope, decisions still open, anything a contractor should know…">${esc(project?.description || "")}</textarea>
      </div>`,
    onConfirm: async () => {
      const data = {
        title: $("#pr-title").value,
        roomId: $("#pr-room").value,
        status: $("#pr-status").value,
        priority: $("#pr-priority").value,
        completionPct: $("#pr-pct").value,
        plannedStart: $("#pr-start").value,
        plannedEnd: $("#pr-end").value,
        tags: $("#pr-tags").value,
        description: $("#pr-desc").value,
        sortOrder: project?.sortOrder ?? Date.now() % 100000
      };
      if (!data.title.trim()) { showModalError("Give the project a title."); return false; }

      if (editing) {
        const note = project.status !== data.status
          ? `Moved "${data.title}" to ${store.statusLabel(data.status)}`
          : null;
        await store.updateProject(state.ws.id, project.id, data, note);
        toast("Project updated.");
      } else {
        await store.createProject(state.ws.id, data);
        track("project_create");
        toast("Project created.");
      }
      renderRoute();
    }
  });

  const statusSel = $("#pr-status");
  statusSel?.addEventListener("change", () => statusSel.classList.remove("needs-choice"));
}

// ============================================================
// View — single project
// ============================================================
async function viewProject(host, projectId) {
  const ws = state.ws;
  const mayEdit = store.canEdit(ws.myRole);
  host.innerHTML = `<div class="loading">Loading project…</div>`;

  let project, phases, tasks, note;
  try {
    [project, phases, tasks, state.rooms] = await Promise.all([
      store.loadProject(ws.id, projectId),
      store.loadPhases(ws.id, projectId),
      store.loadTasks(ws.id, projectId),
      store.loadRooms(ws.id)
    ]);
    note = await store.loadPrivateNote(ws.id, projectId);
  } catch (err) {
    host.innerHTML = `<div class="error-box">${esc(store.describeError(err))}</div>`;
    return;
  }

  if (!project) {
    host.innerHTML = `
      <div class="empty">
        <h3>Project not found</h3>
        <p>It may have been deleted.</p>
        <a class="btn btn-sec" href="#/projects">Back to projects</a>
      </div>`;
    return;
  }

  const openTasks = tasks.filter((t) => !t.done).length;

  host.innerHTML = `
    <nav class="crumbs"><a href="#/projects">Projects</a> <span aria-hidden="true">/</span>
      <span class="muted wrap-any">${esc(project.title)}</span></nav>

    <div class="view-head">
      <div class="grow">
        <h1 class="wrap-any">${esc(project.title)}</h1>
        <div class="chips" style="margin-top:8px">
          ${statusChip(project.status)}${priorityChip(project.priority)}
          ${project.roomId ? `<span class="chip">${esc(roomName(project.roomId))}</span>` : ""}
          ${(project.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}
        </div>
      </div>
      ${mayEdit ? `
        <div class="row-actions">
          <button class="btn btn-sec btn-sm" id="btn-edit-project">Edit</button>
          <button class="btn btn-ghost btn-sm" id="btn-delete-project">Delete</button>
        </div>` : ""}
    </div>

    <div class="grid-stats">
      <div class="card stat"><span>Complete</span><b class="num">${project.completionPct || 0}%</b>
        <span class="mini"><i style="width:${project.completionPct || 0}%"></i></span></div>
      <div class="card stat"><span>Planned</span><b class="stat-date">${esc(fmtDate(project.plannedStart))}</b>
        <span class="sub">to ${esc(fmtDate(project.plannedEnd))}</span></div>
      <div class="card stat"><span>Open tasks</span><b class="num">${openTasks}</b>
        <span class="sub">${tasks.length} total</span></div>
      <div class="card stat"><span>Phases</span><b class="num">${phases.length}</b>
        <span class="sub">${phases.length ? "" : "None yet"}</span></div>
    </div>

    ${project.description ? `
      <div class="section">
        <div class="section-head"><h2>Description</h2></div>
        <div class="card"><p class="wrap-any" style="white-space:pre-wrap">${esc(project.description)}</p></div>
      </div>` : ""}

    <div class="section">
      <div class="section-head">
        <h2>Phases and tasks</h2>
        ${mayEdit ? `<div class="row-actions">
          <button class="btn btn-sec btn-sm" id="btn-add-phase">Add phase</button>
          <button class="btn btn-sm" id="btn-add-task">Add task</button>
        </div>` : ""}
      </div>
      <div id="tasks-body">${phasesHtml(phases, tasks, mayEdit)}</div>
    </div>

    ${note !== null ? `
      <div class="section">
        <div class="section-head">
          <h2>Private notes</h2>
          <span class="chip chip-out">Never shared with contractors</span>
        </div>
        <div class="card">
          <p class="muted" style="margin-bottom:10px">Stored separately from the project
             itself, so scoped contractor access cannot reach it.</p>
          <textarea id="pr-note" maxlength="8000" ${mayEdit ? "" : "disabled"}
            placeholder="Quotes that felt high, things you would rather not share…">${esc(note)}</textarea>
          ${mayEdit ? `<div style="margin-top:10px"><button class="btn btn-sm" id="btn-save-note">Save notes</button></div>` : ""}
        </div>
      </div>` : ""}

    <div class="section">
      <div class="section-head"><h2>History</h2></div>
      <div id="project-activity" class="card"><p class="muted">Loading…</p></div>
    </div>`;

  $("#btn-edit-project")?.addEventListener("click", () => promptProject(project));
  $("#btn-delete-project")?.addEventListener("click", () => {
    confirmDialog({
      title: "Delete this project?",
      message: `"${project.title}", its ${phases.length} phase(s), ${tasks.length} task(s) and its private notes will be removed. This cannot be undone.`,
      confirmText: "Delete project",
      onConfirm: async () => {
        await store.deleteProject(ws.id, project.id);
        await store.logActivity(ws.id, "project_delete", `Deleted project "${project.title}"`, null);
        toast("Project deleted.");
        location.hash = "#/projects";
      }
    });
  });

  $("#btn-add-phase")?.addEventListener("click", () => {
    openModal({
      title: "Add phase",
      confirmText: "Add phase",
      body: `<div class="field">
          <label for="ph-name">Phase name
            <span class="info" title="A stage of the work, for example Demo, Rough-in, Finish.">i</span>
          </label>
          <input type="text" id="ph-name" maxlength="120" placeholder="Demo" autocomplete="off">
          <span class="hint">A stage of the work — Demo, Rough-in, Finish.</span>
        </div>`,
      onConfirm: async () => {
        const name = $("#ph-name").value.trim();
        if (!name) { showModalError("Give the phase a name."); return false; }
        await store.createPhase(ws.id, projectId, name, phases.length);
        toast("Phase added.");
        renderRoute();
      }
    });
  });

  $("#btn-add-task")?.addEventListener("click", () => promptTask(projectId, phases, null));
  $("#btn-save-note")?.addEventListener("click", async () => {
    try {
      await store.savePrivateNote(ws.id, projectId, $("#pr-note").value);
      toast("Notes saved.");
    } catch (err) {
      toast(store.describeError(err), "bad");
    }
  });

  wireTaskRows(projectId, phases, mayEdit);

  store.loadActivity(ws.id, 50).then((events) => {
    const mine = events.filter((e) => e.entityId === projectId);
    const box = $("#project-activity");
    if (!box) return;
    box.innerHTML = mine.length
      ? `<ul class="activity">${mine.map((e) => `
          <li><span class="wrap-any">${esc(e.summary)}</span>
            <span class="muted act-when">${esc(e.byName || "")} · ${esc(fmtDate(e.at))}</span></li>`).join("")}</ul>`
      : `<p class="muted">Nothing recorded yet. Status changes and edits show up here.</p>`;
  }).catch(() => {
    const box = $("#project-activity");
    if (box) box.innerHTML = `<p class="muted">History unavailable.</p>`;
  });
}

function phasesHtml(phases, tasks, mayEdit) {
  const unphased = tasks.filter((t) => !t.phaseId);
  const groups = [
    ...phases.map((ph) => ({ phase: ph, items: tasks.filter((t) => t.phaseId === ph.id) })),
    ...(unphased.length || !phases.length ? [{ phase: null, items: unphased }] : [])
  ];

  if (!tasks.length && !phases.length) {
    return `<div class="empty">
      <h3>No tasks yet</h3>
      <p>Break the work into tasks, and group them into phases once the sequence matters.</p>
    </div>`;
  }

  return groups.map((g) => `
    <div class="phase">
      <div class="phase-head">
        <h3>${g.phase ? esc(g.phase.name) : "Unassigned"}</h3>
        <span class="muted num">${g.items.filter((t) => !t.done).length} open</span>
        ${g.phase && mayEdit ? `
          <button class="btn btn-ghost btn-sm" data-phase-rename="${esc(g.phase.id)}">Rename</button>
          <button class="btn btn-ghost btn-sm" data-phase-delete="${esc(g.phase.id)}">Delete</button>` : ""}
      </div>
      ${g.items.length ? `<ul class="tasks">${g.items.map((t) => taskRowHtml(t, mayEdit)).join("")}</ul>`
        : `<p class="muted phase-empty">No tasks in this phase.</p>`}
    </div>`).join("");
}

function taskRowHtml(task, mayEdit) {
  const overdue = !task.done && task.dueDate && task.dueDate < new Date(new Date().toDateString());
  return `
    <li class="task ${task.done ? "is-done" : ""}">
      <label class="task-check">
        <input type="checkbox" data-task-done="${esc(task.id)}" ${task.done ? "checked" : ""}
               ${mayEdit ? "" : "disabled"} aria-label="Mark complete">
        <span class="task-title wrap-any">${esc(task.title)}</span>
      </label>
      <span class="task-meta">
        ${task.dueDate ? `<span class="date ${overdue ? "is-overdue" : "muted"}">${overdue ? "Overdue " : "Due "}${esc(fmtDate(task.dueDate))}</span>` : ""}
        ${task.priority && task.priority !== "medium" ? priorityChip(task.priority) : ""}
        ${mayEdit ? `<button class="btn btn-ghost btn-sm" data-task-delete="${esc(task.id)}" aria-label="Delete task">Remove</button>` : ""}
      </span>
    </li>`;
}

function wireTaskRows(projectId, phases, mayEdit) {
  if (!mayEdit) return;

  document.querySelectorAll("[data-task-done]").forEach((box) => {
    box.addEventListener("change", async () => {
      try {
        await store.updateTask(state.ws.id, box.dataset.taskDone, { done: box.checked });
        box.closest(".task")?.classList.toggle("is-done", box.checked);
      } catch (err) {
        box.checked = !box.checked;
        toast(store.describeError(err), "bad");
      }
    });
  });

  document.querySelectorAll("[data-task-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      confirmDialog({
        title: "Remove this task?",
        message: "The task will be deleted. This cannot be undone.",
        confirmText: "Remove",
        onConfirm: async () => {
          await store.deleteTask(state.ws.id, btn.dataset.taskDelete);
          toast("Task removed.");
          renderRoute();
        }
      });
    });
  });

  document.querySelectorAll("[data-phase-rename]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const phase = phases.find((p) => p.id === btn.dataset.phaseRename);
      openModal({
        title: "Rename phase",
        confirmText: "Save",
        body: `<div class="field"><label for="ph-new">Phase name</label>
          <input type="text" id="ph-new" maxlength="120" value="${esc(phase?.name || "")}"></div>`,
        onConfirm: async () => {
          const name = $("#ph-new").value.trim();
          if (!name) { showModalError("Give the phase a name."); return false; }
          await store.renamePhase(state.ws.id, phase.id, name);
          toast("Phase renamed.");
          renderRoute();
        }
      });
    });
  });

  document.querySelectorAll("[data-phase-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      confirmDialog({
        title: "Delete this phase?",
        message: "Its tasks are kept and moved to Unassigned.",
        confirmText: "Delete phase",
        onConfirm: async () => {
          await store.deletePhase(state.ws.id, btn.dataset.phaseDelete);
          toast("Phase deleted.");
          renderRoute();
        }
      });
    });
  });
}

function promptTask(projectId, phases, task) {
  openModal({
    title: task ? "Edit task" : "Add task",
    confirmText: task ? "Save" : "Add task",
    body: `
      <div class="field">
        <label for="tk-title">Task</label>
        <input type="text" id="tk-title" maxlength="200" value="${esc(task?.title || "")}"
               placeholder="Confirm the soffit can come out" autocomplete="off">
      </div>
      <div class="field-row">
        <div class="field">
          <label for="tk-phase">Phase</label>
          <select id="tk-phase">
            <option value="">Unassigned</option>
            ${phases.map((p) => `<option value="${esc(p.id)}" ${task?.phaseId === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="tk-priority">Priority</label>
          <select id="tk-priority">
            ${store.PRIORITIES.map((p) => `<option value="${p.value}" ${(task?.priority || "medium") === p.value ? "selected" : ""}>${p.label}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field">
        <label for="tk-due">Due date</label>
        <input type="date" id="tk-due" value="">
      </div>`,
    onConfirm: async () => {
      const title = $("#tk-title").value.trim();
      if (!title) { showModalError("Give the task a title."); return false; }
      await store.createTask(state.ws.id, projectId, {
        title,
        phaseId: $("#tk-phase").value,
        priority: $("#tk-priority").value,
        dueDate: $("#tk-due").value
      });
      toast("Task added.");
      renderRoute();
    }
  });
}

// ============================================================
// View — Photos
// ============================================================
const MONTH_FMT = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long" });

async function viewPhotos(host) {
  const ws = state.ws;
  const mayEdit = store.canEdit(ws.myRole);

  host.innerHTML = `
    <div class="view-head">
      <div class="grow">
        <h1>Photos</h1>
        <p>Before, during and after. Images are compressed and stripped of location
           data on the way in.</p>
      </div>
      ${mayEdit ? `<button class="btn" id="btn-upload">Add photos</button>` : ""}
    </div>
    <input type="file" id="file-input" accept="image/*" multiple class="hidden">
    <div class="loading">Loading photos…</div>`;

  let items = [];
  try {
    [items, state.rooms, state.projects] = await Promise.all([
      store.loadMedia(ws.id),
      store.loadRooms(ws.id),
      store.loadProjects(ws.id)
    ]);
  } catch (err) {
    host.querySelector(".loading").outerHTML =
      `<div class="error-box">${esc(store.describeError(err))}</div>`;
    return;
  }

  const input = $("#file-input");
  $("#btn-upload")?.addEventListener("click", () => input.click());
  input?.addEventListener("change", () => {
    if (input.files?.length) promptUpload([...input.files]);
    input.value = "";
  });

  if (!items.length) {
    host.querySelector(".loading").outerHTML = `
      <div class="empty">
        <h3>No photos yet</h3>
        <p>Photograph every room before anything is touched — the "before" shots are
           the ones people always wish they had taken. On a phone this opens the
           camera directly.</p>
        ${mayEdit ? `<button class="btn" id="btn-upload-empty">Add photos</button>` : ""}
      </div>`;
    $("#btn-upload-empty")?.addEventListener("click", () => input.click());
    return;
  }

  const filtered = items.filter((it) =>
    (!photoUI.room || it.roomId === photoUI.room) &&
    (!photoUI.project || it.projectId === photoUI.project) &&
    (!photoUI.category || it.category === photoUI.category));

  host.querySelector(".loading").outerHTML = `
    <div class="toolbar">
      <select id="ph-room" aria-label="Filter by room">
        <option value="">All rooms</option>
        ${state.rooms.map((r) => `<option value="${esc(r.id)}" ${photoUI.room === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}
      </select>
      <select id="ph-project" aria-label="Filter by project">
        <option value="">All projects</option>
        ${state.projects.map((p) => `<option value="${esc(p.id)}" ${photoUI.project === p.id ? "selected" : ""}>${esc(p.title)}</option>`).join("")}
      </select>
      <select id="ph-cat" aria-label="Filter by category">
        <option value="">Any type</option>
        ${store.MEDIA_CATEGORIES.map((c) => `<option value="${c.value}" ${photoUI.category === c.value ? "selected" : ""}>${c.label}</option>`).join("")}
      </select>
      <div class="toolbar-right">
        <div class="seg" role="group" aria-label="View">
          <button class="${photoUI.mode === "grid" ? "on" : ""}" data-pmode="grid" type="button">Grid</button>
          <button class="${photoUI.mode === "timeline" ? "on" : ""}" data-pmode="timeline" type="button">Timeline</button>
          <button class="${photoUI.mode === "compare" ? "on" : ""}" data-pmode="compare" type="button">Compare</button>
        </div>
      </div>
    </div>
    <p class="muted result-count">${filtered.length} of ${items.length} shown</p>
    <div id="photo-body">${
      photoUI.mode === "compare" ? compareHtml(items)
        : photoUI.mode === "timeline" ? timelineHtml(filtered)
        : galleryHtml(filtered)
    }</div>`;

  const bind = (sel, prop) => {
    const el = $(sel);
    el?.addEventListener("change", () => { photoUI[prop] = el.value; renderRoute(); });
  };
  bind("#ph-room", "room");
  bind("#ph-project", "project");
  bind("#ph-cat", "category");

  document.querySelectorAll("[data-pmode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      photoUI.mode = btn.dataset.pmode;
      localStorage.setItem("rhq_photo_mode", photoUI.mode);
      renderRoute();
    });
  });

  hydrateThumbs();
  document.querySelectorAll("[data-photo]").forEach((el) => {
    el.addEventListener("click", () => openLightbox(el.dataset.photo, items, mayEdit));
  });
}

function photoTileHtml(item) {
  return `
    <button class="tile" data-photo="${esc(item.id)}" type="button"
            aria-label="${esc(item.caption || store.mediaCategoryLabel(item.category))}">
      <span class="tile-img" data-thumb="${esc(item.id)}"></span>
      <span class="tile-cat">${esc(store.mediaCategoryLabel(item.category))}</span>
      ${item.caption ? `<span class="tile-cap wrap-any">${esc(item.caption)}</span>` : ""}
    </button>`;
}

function galleryHtml(items) {
  if (!items.length) return `<div class="empty"><h3>Nothing matches</h3><p>No photo matches those filters.</p></div>`;
  return `<div class="gallery">${items.map(photoTileHtml).join("")}</div>`;
}

function timelineHtml(items) {
  if (!items.length) return `<div class="empty"><h3>Nothing matches</h3><p>No photo matches those filters.</p></div>`;
  const groups = new Map();
  for (const it of items) {
    const when = it.takenAt || it.createdAt;
    const key = when ? MONTH_FMT.format(when) : "Undated";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  return [...groups.entries()].map(([month, list]) => `
    <div class="section" style="margin-top:20px">
      <div class="section-head"><h2>${esc(month)}</h2><span class="muted num">${list.length}</span></div>
      <div class="gallery">${list.map(photoTileHtml).join("")}</div>
    </div>`).join("");
}

/** Pairs the newest before with the newest after for each room. */
function compareHtml(items) {
  const rooms = state.rooms.filter((room) =>
    items.some((i) => i.roomId === room.id && (i.category === "before" || i.category === "after")));

  if (!rooms.length) {
    return `<div class="empty">
      <h3>Nothing to compare yet</h3>
      <p>Tag a photo as <strong>Before</strong> and another as <strong>After</strong> in the
         same room, and they will line up side by side here.</p>
    </div>`;
  }

  return rooms.map((room) => {
    const pick = (cat) => items
      .filter((i) => i.roomId === room.id && i.category === cat)
      .sort((a, b) => (b.takenAt?.getTime() || 0) - (a.takenAt?.getTime() || 0))[0];
    const before = pick("before");
    const after = pick("after");
    const side = (item, label) => item
      ? `<figure class="compare-side">
           <button class="tile" data-photo="${esc(item.id)}" type="button">
             <span class="tile-img" data-thumb="${esc(item.id)}"></span>
           </button>
           <figcaption>${label} · ${esc(fmtDate(item.takenAt || item.createdAt))}</figcaption>
         </figure>`
      : `<figure class="compare-side compare-missing">
           <span class="tile-img is-empty"></span>
           <figcaption class="muted">No ${label.toLowerCase()} photo yet</figcaption>
         </figure>`;
    return `
      <div class="section" style="margin-top:20px">
        <div class="section-head"><h2>${esc(room.name)}</h2></div>
        <div class="compare">${side(before, "Before")}${side(after, "After")}</div>
      </div>`;
  }).join("");
}

/** Thumbnails load after the layout is on screen, one document each. */
async function hydrateThumbs() {
  const slots = [...document.querySelectorAll("[data-thumb]")];
  for (const slot of slots) {
    const id = slot.dataset.thumb;
    try {
      const bytes = await store.loadThumb(state.ws.id, id);
      if (!bytes) { slot.classList.add("is-empty"); continue; }
      const url = media.toObjectUrl("t_" + id, bytes);
      slot.style.backgroundImage = `url("${url}")`;
      slot.classList.add("is-loaded");
    } catch {
      slot.classList.add("is-empty");
    }
  }
}

async function openLightbox(mediaId, items, mayEdit) {
  const item = items.find((i) => i.id === mediaId);
  if (!item) return;

  const body = openModal({
    title: item.caption || store.mediaCategoryLabel(item.category),
    hideConfirm: true,
    body: `
      <div class="lightbox"><div class="lightbox-img is-loading" id="lb-img"></div></div>
      <dl class="meta-list">
        <div><dt>Type</dt><dd>${esc(store.mediaCategoryLabel(item.category))}</dd></div>
        ${item.roomId ? `<div><dt>Room</dt><dd>${esc(roomName(item.roomId))}</dd></div>` : ""}
        <div><dt>Taken</dt><dd class="date">${esc(fmtDate(item.takenAt || item.createdAt))}</dd></div>
        <div><dt>Size</dt><dd>${esc(media.formatBytes(item.bytes))} · ${item.width}×${item.height}</dd></div>
      </dl>
      ${mayEdit ? `<div class="row-actions" style="margin-top:14px">
        <button class="btn btn-sec btn-sm" id="lb-edit">Edit details</button>
        <button class="btn btn-ghost btn-sm" id="lb-delete">Delete</button>
      </div>` : ""}`
  });

  try {
    const bytes = await store.loadFullImage(state.ws.id, mediaId);
    const slot = body.querySelector("#lb-img");
    if (bytes && slot) {
      slot.style.backgroundImage = `url("${media.toObjectUrl(mediaId, bytes, item.contentType)}")`;
      slot.classList.remove("is-loading");
    }
  } catch (err) {
    const slot = body.querySelector("#lb-img");
    if (slot) { slot.classList.remove("is-loading"); slot.textContent = store.describeError(err); }
  }

  body.querySelector("#lb-delete")?.addEventListener("click", () => {
    confirmDialog({
      title: "Delete this photo?",
      message: "The image and its thumbnail are removed. This cannot be undone.",
      confirmText: "Delete",
      onConfirm: async () => {
        await store.deleteMedia(state.ws.id, mediaId);
        media.forgetObjectUrl(mediaId);
        media.forgetObjectUrl("t_" + mediaId);
        toast("Photo deleted.");
        renderRoute();
      }
    });
  });

  body.querySelector("#lb-edit")?.addEventListener("click", () => promptPhotoMeta(item));
}

function promptPhotoMeta(item) {
  openModal({
    title: "Photo details",
    confirmText: "Save",
    body: photoFieldsHtml(item, false),
    onConfirm: async () => {
      await store.updateMediaMeta(state.ws.id, item.id, {
        category: $("#pm-cat").value,
        caption: $("#pm-caption").value,
        roomId: $("#pm-room").value,
        projectId: $("#pm-project").value,
        tags: $("#pm-tags").value.split(",")
      });
      toast("Photo updated.");
      renderRoute();
    }
  });
}

function photoFieldsHtml(item, isUpload) {
  return `
    ${isUpload ? `<p class="muted" style="margin-bottom:14px">These details apply to every
      photo in this batch. You can change any of them afterwards.</p>` : ""}
    <div class="field">
      <label for="pm-cat">Type
        <span class="info" title="Before, in progress and after drive the comparison view. Receipts and plans keep paperwork out of the photo stream.">i</span>
      </label>
      <select id="pm-cat" ${isUpload ? 'class="needs-choice"' : ""}>
        ${store.MEDIA_CATEGORIES.map((c) => `<option value="${c.value}" ${item?.category === c.value ? "selected" : ""}>${c.label}</option>`).join("")}
      </select>
      <span class="hint">Before and After power the side-by-side comparison.</span>
    </div>
    <div class="field-row">
      <div class="field">
        <label for="pm-room">Room</label>
        <select id="pm-room">
          <option value="">Not room-specific</option>
          ${state.rooms.map((r) => `<option value="${esc(r.id)}" ${item?.roomId === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="pm-project">Project</label>
        <select id="pm-project">
          <option value="">None</option>
          ${(state.projects || []).map((p) => `<option value="${esc(p.id)}" ${item?.projectId === p.id ? "selected" : ""}>${esc(p.title)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="field">
      <label for="pm-caption">Caption</label>
      <input type="text" id="pm-caption" maxlength="500" value="${esc(item?.caption || "")}"
             placeholder="Soffit above the sink" autocomplete="off">
    </div>
    <div class="field">
      <label for="pm-tags">Tags</label>
      <input type="text" id="pm-tags" value="${esc((item?.tags || []).join(", "))}"
             placeholder="cabinets, tile" autocomplete="off">
    </div>`;
}

function promptUpload(files) {
  const tooMany = files.length > 20 ? files.slice(0, 20) : files;

  openModal({
    title: `Add ${tooMany.length} photo${tooMany.length === 1 ? "" : "s"}`,
    confirmText: "Upload",
    body: `
      ${files.length > 20 ? `<p class="field-error">Only the first 20 will be added.</p>` : ""}
      ${photoFieldsHtml(null, true)}
      <div id="upload-progress" class="hidden">
        <div class="progress"><i id="up-bar" style="width:0%"></i></div>
        <p class="muted" id="up-label" style="margin-top:8px"></p>
      </div>`,
    onConfirm: async () => {
      const meta = {
        category: $("#pm-cat").value,
        caption: $("#pm-caption").value,
        roomId: $("#pm-room").value,
        projectId: $("#pm-project").value,
        tags: $("#pm-tags").value.split(",")
      };

      $("#upload-progress").classList.remove("hidden");
      const bar = $("#up-bar");
      const label = $("#up-label");
      let done = 0;
      const failures = [];

      for (const file of tooMany) {
        label.textContent = `Processing ${file.name}…`;
        try {
          const processed = await media.processImage(file);
          await store.saveMedia(state.ws.id, processed, { ...meta, fileName: file.name });
        } catch (err) {
          failures.push(`${file.name}: ${store.describeError(err)}`);
        }
        done++;
        bar.style.width = `${Math.round((done / tooMany.length) * 100)}%`;
      }

      if (failures.length) {
        showModalError(failures.join(" · "));
        label.textContent = `${done - failures.length} of ${tooMany.length} added.`;
        if (failures.length === tooMany.length) return false;
      }

      track("photo_upload", { count: done - failures.length });
      toast(`${done - failures.length} photo${done - failures.length === 1 ? "" : "s"} added.`);
      renderRoute();
    }
  });

  const cat = $("#pm-cat");
  cat?.addEventListener("change", () => cat.classList.remove("needs-choice"));
}

// ============================================================
// View — Ideas
// ============================================================
async function viewIdeas(host) {
  const ws = state.ws;
  const mayEdit = store.canEdit(ws.myRole);

  host.innerHTML = `
    <div class="view-head">
      <div class="grow">
        <h1>Ideas</h1>
        <p>Products, materials and inspiration you are considering — with where you
           found them, what they cost, and whether you chose them.</p>
      </div>
      ${mayEdit ? `<button class="btn" id="btn-new-idea">Save an idea</button>` : ""}
    </div>
    <div class="loading">Loading ideas…</div>`;

  $("#btn-new-idea")?.addEventListener("click", () => promptIdea(null));

  let ideas = [];
  try {
    [ideas, state.rooms, state.projects] = await Promise.all([
      store.loadIdeas(ws.id),
      store.loadRooms(ws.id),
      store.loadProjects(ws.id)
    ]);
  } catch (err) {
    host.querySelector(".loading").outerHTML =
      `<div class="error-box">${esc(store.describeError(err))}</div>`;
    return;
  }

  if (!ideas.length) {
    host.querySelector(".loading").outerHTML = `
      <div class="empty">
        <h3>No ideas saved yet</h3>
        <p>When you find a tile, a fixture or a finish worth remembering, save it here
           with its price and a link. Later you will not remember which of the four
           shortlisted faucets was the one you liked.</p>
        ${mayEdit ? `<button class="btn" id="btn-first-idea">Save an idea</button>` : ""}
      </div>`;
    $("#btn-first-idea")?.addEventListener("click", () => promptIdea(null));
    return;
  }

  const filtered = ideas.filter((i) =>
    (!ideaUI.status || i.status === ideaUI.status) &&
    (!ideaUI.room || i.roomId === ideaUI.room));

  host.querySelector(".loading").outerHTML = `
    <div class="toolbar">
      <select id="id-status" aria-label="Filter by status">
        <option value="">Any status</option>
        ${store.IDEA_STATUSES.map((s) => `<option value="${s.value}" ${ideaUI.status === s.value ? "selected" : ""}>${s.label}</option>`).join("")}
      </select>
      <select id="id-room" aria-label="Filter by room">
        <option value="">All rooms</option>
        ${state.rooms.map((r) => `<option value="${esc(r.id)}" ${ideaUI.room === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}
      </select>
    </div>
    <p class="muted result-count">${filtered.length} of ${ideas.length} shown</p>
    <div class="grid">
      ${filtered.map((idea) => `
        <div class="card idea-card" data-idea="${esc(idea.id)}">
          <div class="room-top">
            <h3 class="wrap-any">${esc(idea.title)}</h3>
            <span class="chip ${idea.status === "selected" || idea.status === "purchased" ? "chip-good" : idea.status === "rejected" ? "chip-out" : "chip-solid"}">${esc(store.ideaStatusLabel(idea.status))}</span>
          </div>
          <div class="idea-meta">
            ${idea.vendor ? `<span class="wrap-any">${esc(idea.vendor)}</span>` : ""}
            ${idea.model ? `<span class="muted wrap-any">${esc(idea.model)}</span>` : ""}
            ${idea.estPrice != null ? `<span class="num idea-price">${esc(fmtMoney(idea.estPrice))}</span>` : ""}
          </div>
          ${idea.roomId ? `<span class="chip">${esc(roomName(idea.roomId))}</span>` : ""}
          ${idea.notes ? `<p class="room-notes wrap-any">${esc(idea.notes)}</p>` : ""}
          <div class="row-actions">
            ${idea.sourceUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(idea.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open source</a>` : ""}
            ${mayEdit ? `<button class="btn btn-ghost btn-sm" data-idea-edit="${esc(idea.id)}">Edit</button>
            <button class="btn btn-ghost btn-sm" data-idea-delete="${esc(idea.id)}">Delete</button>` : ""}
          </div>
        </div>`).join("")}
    </div>`;

  const bind = (sel, prop) => {
    const el = $(sel);
    el?.addEventListener("change", () => { ideaUI[prop] = el.value; renderRoute(); });
  };
  bind("#id-status", "status");
  bind("#id-room", "room");

  document.querySelectorAll("[data-idea-edit]").forEach((btn) => {
    btn.addEventListener("click", () =>
      promptIdea(ideas.find((i) => i.id === btn.dataset.ideaEdit)));
  });
  document.querySelectorAll("[data-idea-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idea = ideas.find((i) => i.id === btn.dataset.ideaDelete);
      confirmDialog({
        title: "Delete this idea?",
        message: `"${idea.title}" will be removed. This cannot be undone.`,
        confirmText: "Delete",
        onConfirm: async () => {
          await store.deleteIdea(state.ws.id, idea.id);
          toast("Idea deleted.");
          renderRoute();
        }
      });
    });
  });
}

function promptIdea(idea) {
  const editing = !!idea;
  openModal({
    title: editing ? "Edit idea" : "Save an idea",
    confirmText: editing ? "Save changes" : "Save idea",
    body: `
      <div class="field">
        <label for="ix-title">What is it</label>
        <input type="text" id="ix-title" maxlength="160" value="${esc(idea?.title || "")}"
               placeholder="Matte white shaker cabinet" autocomplete="off">
      </div>
      <div class="field-row">
        <div class="field">
          <label for="ix-status">Status
            <span class="info" title="Track a candidate from saved through shortlisted to selected or rejected, so old options stay on record.">i</span>
          </label>
          <select id="ix-status" ${editing ? "" : 'class="needs-choice"'}>
            ${store.IDEA_STATUSES.map((s) => `<option value="${s.value}" ${(idea?.status || "saved") === s.value ? "selected" : ""}>${s.label}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="ix-room">Room</label>
          <select id="ix-room">
            <option value="">Not room-specific</option>
            ${state.rooms.map((r) => `<option value="${esc(r.id)}" ${idea?.roomId === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="ix-vendor">Vendor or brand</label>
          <input type="text" id="ix-vendor" maxlength="120" value="${esc(idea?.vendor || "")}" autocomplete="off">
        </div>
        <div class="field">
          <label for="ix-model">Model or SKU
            <span class="info" title="Worth recording now: it is what you need to reorder, claim a warranty, or match a finish years later.">i</span>
          </label>
          <input type="text" id="ix-model" maxlength="120" value="${esc(idea?.model || "")}" autocomplete="off">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="ix-price">Estimated price</label>
          <div class="money-wrap">
            <span class="money-prefix">$</span>
            <input type="number" id="ix-price" min="0" step="0.01" class="money-input"
                   value="${idea?.estPrice != null ? idea.estPrice.toFixed(2) : ""}">
          </div>
        </div>
        <div class="field">
          <label for="ix-project">Project</label>
          <select id="ix-project">
            <option value="">None</option>
            ${(state.projects || []).map((p) => `<option value="${esc(p.id)}" ${idea?.projectId === p.id ? "selected" : ""}>${esc(p.title)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field">
        <label for="ix-url">Where you found it</label>
        <input type="text" id="ix-url" maxlength="500" value="${esc(idea?.sourceUrl || "")}"
               placeholder="example.com/product" autocomplete="off">
      </div>
      <div class="field">
        <label for="ix-notes">Notes</label>
        <textarea id="ix-notes" maxlength="4000" placeholder="Why it works, what worries you, alternatives…">${esc(idea?.notes || "")}</textarea>
      </div>`,
    onConfirm: async () => {
      const data = {
        title: $("#ix-title").value,
        status: $("#ix-status").value,
        roomId: $("#ix-room").value,
        projectId: $("#ix-project").value,
        vendor: $("#ix-vendor").value,
        model: $("#ix-model").value,
        estPrice: $("#ix-price").value,
        sourceUrl: $("#ix-url").value,
        notes: $("#ix-notes").value
      };
      if (!data.title.trim()) { showModalError("Give the idea a title."); return false; }
      if (editing) {
        await store.updateIdea(state.ws.id, idea.id, data);
        toast("Idea updated.");
      } else {
        await store.createIdea(state.ws.id, data);
        track("idea_create");
        toast("Idea saved.");
      }
      renderRoute();
    }
  });

  // House standard: money fields settle to two decimals when you leave them.
  const price = $("#ix-price");
  price?.addEventListener("blur", () => {
    const n = Number(price.value);
    if (Number.isFinite(n) && price.value !== "") price.value = n.toFixed(2);
  });

  const statusSel = $("#ix-status");
  statusSel?.addEventListener("change", () => statusSel.classList.remove("needs-choice"));
}

// ============================================================
// View — Rooms
// ============================================================
function roomCardHtml(room) {
  const area = store.roomArea(room);
  const dims = room.lengthFt && room.widthFt
    ? `${room.lengthFt} × ${room.widthFt} ft`
    : null;
  // The type chip earns its space only when it says something the name does
  // not — "Kitchen / Kitchen" is noise.
  const typeLabel = store.roomTypeLabel(room.type);
  const showType = typeLabel.toLowerCase() !== (room.name || "").trim().toLowerCase();
  return `
    <div class="card room-card" data-room="${esc(room.id)}">
      <div class="room-top">
        <h3 class="wrap-any">${esc(room.name)}</h3>
        ${showType ? `<span class="chip">${esc(typeLabel)}</span>` : ""}
      </div>
      ${(dims || area) ? `<div class="room-meta">
        ${dims ? `<span class="num">${esc(dims)}</span>` : ""}
        ${area ? `<span class="num">${area.toLocaleString("en-US")} sq ft</span>` : ""}
        ${room.ceilingFt ? `<span class="num">${room.ceilingFt} ft ceiling</span>` : ""}
      </div>` : ""}
      ${room.notes ? `<p class="room-notes wrap-any">${esc(room.notes)}</p>` : ""}
    </div>`;
}

async function viewRooms(host) {
  const ws = state.ws;
  const canAdd = store.canEdit(ws.myRole);

  host.innerHTML = `
    <div class="view-head">
      <div class="grow">
        <h1>Rooms</h1>
        <p>Areas of the property. Projects, photos and budgets are organized by room.</p>
      </div>
      ${canAdd ? `<button class="btn" id="btn-add-room">Add room</button>` : ""}
    </div>
    <div class="loading">Loading rooms…</div>`;

  $("#btn-add-room")?.addEventListener("click", () => promptRoom(null));

  let rooms = [];
  try {
    rooms = await store.loadRooms(ws.id);
  } catch (err) {
    host.querySelector(".loading").outerHTML =
      `<div class="error-box">${esc(store.describeError(err))}</div>`;
    return;
  }

  if (!rooms.length) {
    host.querySelector(".loading").outerHTML = `
      <div class="empty">
        <h3>No rooms yet</h3>
        <p>Add them one at a time, or start from a typical two-bedroom, two-bathroom
           condo layout and adjust from there.</p>
        ${canAdd ? `
          <button class="btn" id="btn-starter">Use the starter layout</button>
          <button class="btn btn-sec" id="btn-first-room">Add one room</button>` : ""}
      </div>`;
    $("#btn-first-room")?.addEventListener("click", () => promptRoom(null));
    $("#btn-starter")?.addEventListener("click", () => {
      confirmDialog({
        title: "Add the starter layout?",
        message: `This adds ${store.STARTER_ROOMS.length} rooms: ` +
          store.STARTER_ROOMS.map((r) => r.name).join(", ") +
          ". You can rename or delete any of them afterwards.",
        confirmText: "Add rooms",
        danger: false,
        onConfirm: async () => {
          await store.createRooms(ws.id, store.STARTER_ROOMS);
          track("rooms_starter_added");
          toast("Starter rooms added.");
          renderRoute();
        }
      });
    });
    return;
  }

  host.querySelector(".loading").outerHTML = `
    <div class="grid" id="room-grid">${rooms.map(roomCardHtml).join("")}</div>`;

  // Card actions are added after render so the markup helper stays reusable
  // between the dashboard preview (read-only) and this page.
  if (store.canEdit(ws.myRole)) {
    host.querySelectorAll("[data-room]").forEach((card) => {
      const id = card.dataset.room;
      const room = rooms.find((r) => r.id === id);
      const actions = document.createElement("div");
      actions.className = "row-actions";
      actions.innerHTML = `
        <button class="btn btn-ghost btn-sm" data-edit>Edit</button>
        <button class="btn btn-ghost btn-sm" data-del>Delete</button>`;
      card.appendChild(actions);
      actions.querySelector("[data-edit]").addEventListener("click", () => promptRoom(room));
      actions.querySelector("[data-del]").addEventListener("click", () => {
        confirmDialog({
          title: "Delete this room?",
          message: `"${room.name}" will be removed. Anything later attached to it — ` +
            "projects, photos, expenses — would need a new home. This cannot be undone yet.",
          confirmText: "Delete room",
          onConfirm: async () => {
            await store.deleteRoom(ws.id, room.id);
            track("room_delete");
            toast("Room deleted.");
            renderRoute();
          }
        });
      });
    });
  }
}

function promptRoom(room) {
  const editing = !!room;
  const typeOptions = store.ROOM_TYPES.map((t) =>
    `<option value="${t.value}" ${room?.type === t.value ? "selected" : ""}>${t.label}</option>`
  ).join("");

  openModal({
    title: editing ? "Edit room" : "Add room",
    confirmText: editing ? "Save changes" : "Add room",
    body: `
      <div class="field">
        <label for="rm-name">Name</label>
        <input type="text" id="rm-name" maxlength="80" value="${esc(room?.name || "")}"
               placeholder="Kitchen" autocomplete="off">
      </div>
      <div class="field">
        <label for="rm-type">Type
          <span class="info" title="Groups rooms of the same kind in reports and filters later on.">i</span>
        </label>
        <select id="rm-type" ${editing ? "" : 'class="needs-choice"'}>${typeOptions}</select>
        <span class="hint">Groups similar rooms in reports and filters later on.</span>
      </div>
      <div class="field">
        <label>Dimensions
          <span class="info" title="Optional. Used later to estimate materials like flooring and paint.">i</span>
        </label>
        <div class="field-row">
          <div class="field">
            <label for="rm-len" class="muted">Length (ft)</label>
            <input type="number" id="rm-len" min="0" step="0.1" value="${esc(room?.lengthFt ?? "")}">
          </div>
          <div class="field">
            <label for="rm-wid" class="muted">Width (ft)</label>
            <input type="number" id="rm-wid" min="0" step="0.1" value="${esc(room?.widthFt ?? "")}">
          </div>
          <div class="field">
            <label for="rm-ceil" class="muted">Ceiling (ft)</label>
            <input type="number" id="rm-ceil" min="0" step="0.1" value="${esc(room?.ceilingFt ?? "")}">
          </div>
        </div>
        <span class="hint">Optional — used later to estimate flooring, paint and materials.</span>
      </div>
      <div class="field">
        <label for="rm-notes">Notes</label>
        <textarea id="rm-notes" maxlength="4000"
          placeholder="Condition, what needs doing, measurements to confirm…">${esc(room?.notes || "")}</textarea>
      </div>`,
    onConfirm: async () => {
      const data = {
        name: $("#rm-name").value,
        type: $("#rm-type").value,
        lengthFt: $("#rm-len").value,
        widthFt: $("#rm-wid").value,
        ceilingFt: $("#rm-ceil").value,
        notes: $("#rm-notes").value,
        sortOrder: room?.sortOrder ?? Date.now() % 100000
      };
      if (!data.name.trim()) { showModalError("Give the room a name."); return false; }
      if (editing) {
        await store.updateRoom(state.ws.id, room.id, data);
        toast("Room updated.");
      } else {
        await store.createRoom(state.ws.id, data);
        track("room_create");
        toast("Room added.");
      }
      renderRoute();
    }
  });

  // Clear the amber attention glow as soon as a deliberate choice is made.
  const typeSel = $("#rm-type");
  typeSel?.addEventListener("change", () => typeSel.classList.remove("needs-choice"));
}

// ============================================================
// View — People
// ============================================================
let peopleSort = { key: "role", dir: "asc" };

async function viewPeople(host) {
  const ws = state.ws;
  const manages = store.canManageMembers(ws.myRole);

  host.innerHTML = `
    <div class="view-head">
      <div class="grow">
        <h1>People</h1>
        <p>Who can see and change this remodel. Contractors get their own scoped,
           expiring access in a later release — these are your collaborators.</p>
      </div>
      ${manages ? `<button class="btn" id="btn-invite">Invite someone</button>` : ""}
    </div>
    <div class="loading">Loading people…</div>`;

  $("#btn-invite")?.addEventListener("click", promptInvite);

  let members = [];
  let invites = [];
  try {
    members = await store.loadMembers(ws.id);
    if (manages) invites = await store.loadInvites(ws.id);
  } catch (err) {
    host.querySelector(".loading").outerHTML =
      `<div class="error-box">${esc(store.describeError(err))}</div>`;
    return;
  }

  const sorted = sortMembers(members);
  const roleOptions = (current) => store.INVITABLE_ROLES
    .map((r) => `<option value="${r}" ${current === r ? "selected" : ""}>${store.ROLES[r].label}</option>`)
    .join("");

  host.querySelector(".loading").outerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th><button class="btn-link" data-sort="name">Person</button></th>
            <th><button class="btn-link" data-sort="role">Role</button></th>
            <th class="date"><button class="btn-link" data-sort="joined">Joined</button></th>
            ${manages ? `<th></th>` : ""}
          </tr>
        </thead>
        <tbody>
          ${sorted.map((member) => {
            const isMe = member.id === state.user?.uid;
            const isOwnerRow = member.role === "owner";
            const editable = manages && !isMe && !isOwnerRow;
            return `
              <tr>
                <td data-label="Person" class="wrap-any">
                  <span>${esc(member.displayName || member.email || member.id)}
                    ${isMe ? `<span class="chip" style="margin-left:6px">You</span>` : ""}
                  </span>
                </td>
                <td data-label="Role">
                  ${editable
                    ? `<select data-role-for="${esc(member.id)}" aria-label="Role">${roleOptions(member.role)}</select>`
                    : `<span class="chip ${isOwnerRow ? "chip-solid" : "chip-out"}">${esc(store.ROLES[member.role]?.label || member.role)}</span>`}
                </td>
                <td data-label="Joined" class="date">${esc(fmtDate(member.joinedAt))}</td>
                ${manages ? `<td data-label="">
                  ${editable ? `<button class="btn btn-ghost btn-sm" data-remove="${esc(member.id)}">Remove</button>` : ""}
                </td>` : ""}
              </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>

    ${manages && invites.length ? `
      <div class="section">
        <div class="section-head"><h2>Pending invitations</h2></div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Email</th><th>Role</th><th class="date">Expires</th><th></th></tr>
            </thead>
            <tbody>
              ${invites.map((inv) => `
                <tr>
                  <td data-label="Email" class="wrap-any">${esc(inv.email)}</td>
                  <td data-label="Role"><span class="chip chip-out">${esc(store.ROLES[inv.role]?.label || inv.role)}</span></td>
                  <td data-label="Expires" class="date">${esc(fmtDate(inv.expiresAt))}</td>
                  <td data-label=""><button class="btn btn-ghost btn-sm" data-revoke="${esc(inv.id)}">Revoke</button></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>` : ""}

    <div class="section">
      <div class="card">
        <h3>What each role can do</h3>
        <ul style="margin:10px 0 0 18px">
          ${Object.entries(store.ROLES).map(([key, role]) =>
            `<li style="margin-bottom:4px"><strong>${role.label}</strong> — ${esc(role.description)}</li>`
          ).join("")}
        </ul>
      </div>
    </div>`;

  host.querySelectorAll("[data-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      if (peopleSort.key !== key) peopleSort = { key, dir: "asc" };
      else if (peopleSort.dir === "asc") peopleSort.dir = "desc";
      else peopleSort = { key: "role", dir: "asc" };   // asc -> desc -> reset
      renderRoute();
    });
  });

  host.querySelectorAll("[data-role-for]").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const uid = sel.dataset.roleFor;
      const previous = members.find((mm) => mm.id === uid)?.role;
      try {
        await store.setMemberRole(ws.id, uid, sel.value);
        track("member_role_change");
        toast("Role updated.");
        renderRoute();
      } catch (err) {
        sel.value = previous;
        toast(store.describeError(err), "bad");
      }
    });
  });

  host.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const member = members.find((mm) => mm.id === btn.dataset.remove);
      confirmDialog({
        title: "Remove this person?",
        message: `${member.displayName || member.email} will immediately lose access to this workspace.`,
        confirmText: "Remove",
        onConfirm: async () => {
          await store.removeMember(ws.id, member.id);
          toast("Person removed.");
          renderRoute();
        }
      });
    });
  });

  host.querySelectorAll("[data-revoke]").forEach((btn) => {
    btn.addEventListener("click", () => {
      confirmDialog({
        title: "Revoke this invitation?",
        message: "The link stops working immediately. You can always invite them again.",
        confirmText: "Revoke",
        onConfirm: async () => {
          await store.revokeInvite(btn.dataset.revoke);
          toast("Invitation revoked.");
          renderRoute();
        }
      });
    });
  });
}

function sortMembers(members) {
  const order = Object.keys(store.ROLES);
  const dir = peopleSort.dir === "desc" ? -1 : 1;
  const key = peopleSort.key;
  return [...members].sort((a, b) => {
    let cmp = 0;
    if (key === "name") {
      cmp = (a.displayName || a.email || "").localeCompare(b.displayName || b.email || "");
    } else if (key === "joined") {
      cmp = (a.joinedAt?.getTime() || 0) - (b.joinedAt?.getTime() || 0);
    } else {
      cmp = order.indexOf(a.role) - order.indexOf(b.role);
    }
    return cmp * dir;
  });
}

function promptInvite() {
  openModal({
    title: "Invite someone",
    confirmText: "Create invitation",
    body: `
      <div class="field">
        <label for="inv-email">Their email address
          <span class="info" title="Must be the Google account they will sign in with.">i</span>
        </label>
        <input type="email" id="inv-email" maxlength="200" placeholder="name@example.com" autocomplete="off">
        <span class="hint">Must match the Google account they sign in with.</span>
      </div>
      <div class="field">
        <label for="inv-role">Role</label>
        <select id="inv-role" class="needs-choice">
          <option value="">Choose a role…</option>
          ${store.INVITABLE_ROLES.map((r) =>
            `<option value="${r}">${store.ROLES[r].label} — ${store.ROLES[r].description}</option>`).join("")}
        </select>
        <span class="hint">You can change this at any time afterwards.</span>
      </div>
      <p class="muted" style="font-size:12.5px">
        RemodelHQ does not send email yet. After you create the invitation, tell them to
        open this site and sign in with that Google account — the invitation will be
        waiting for them. It expires in 14 days.
      </p>`,
    onConfirm: async () => {
      const email = $("#inv-email").value.trim();
      const role = $("#inv-role").value;
      if (!email) { showModalError("Enter their email address."); return false; }
      if (!role) { showModalError("Choose a role for this person."); return false; }
      await store.createInvite(state.ws.id, email, role);
      track("invite_create");
      toast("Invitation created.");
      renderRoute();
    }
  });

  const roleSel = $("#inv-role");
  roleSel?.addEventListener("change", () => {
    roleSel.classList.toggle("needs-choice", !roleSel.value);
  });
}

// ============================================================
// View — Settings
// ============================================================
async function viewSettings(host) {
  const ws = state.ws;
  const manages = store.canManageMembers(ws.myRole);
  const owner = store.isOwner(ws.myRole);
  const user = state.user;

  host.innerHTML = `
    <div class="view-head">
      <div class="grow">
        <h1>Settings</h1>
        <p>Workspace details, your access, and your account.</p>
      </div>
    </div>

    <div class="section" style="margin-top:0">
      <div class="section-head"><h2>Workspace</h2></div>
      <div class="card">
        <div class="field" style="margin-bottom:0">
          <label for="set-ws-name">Name</label>
          <input type="text" id="set-ws-name" maxlength="80"
                 value="${esc(ws.name)}" ${manages ? "" : "disabled"}>
          ${manages
            ? `<span class="hint">Press Save to rename this workspace for everyone.</span>`
            : `<span class="hint">Only an owner or admin can rename the workspace.</span>`}
        </div>
        ${manages ? `<div style="margin-top:14px"><button class="btn btn-sm" id="btn-rename">Save</button></div>` : ""}
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Your access</h2></div>
      <div class="card">
        <p><strong>${esc(store.ROLES[ws.myRole]?.label || ws.myRole)}</strong></p>
        <p class="muted">${esc(store.ROLES[ws.myRole]?.description || "")}</p>
        <p class="muted" style="margin-top:10px">Signed in as ${esc(user?.email || "")}</p>
        <div style="margin-top:14px" class="row-actions">
          <button class="btn btn-sec btn-sm" id="btn-switch">Switch workspace</button>
          <button class="btn btn-ghost btn-sm" id="btn-signout">Sign out</button>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>About</h2></div>
      <div class="card">
        <p class="muted">RemodelHQ v${VERSION} — foundation release.</p>
        <p class="muted">Your data lives in your own Firebase project and is visible only
           to the people invited here. Photo storage, budgets and contractor sharing
           arrive in later releases.</p>
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Danger zone</h2></div>
      <div class="card danger-zone">
        ${owner ? `
          <h3>Delete this workspace</h3>
          <p class="muted">Permanently removes the workspace, its rooms and everyone's
             access. This cannot be undone.</p>
          <div style="margin-top:14px"><button class="btn btn-danger btn-sm" id="btn-delete-ws">Delete workspace</button></div>
        ` : `
          <h3>Leave this workspace</h3>
          <p class="muted">You will lose access immediately. An owner or admin would need
             to invite you again.</p>
          <div style="margin-top:14px"><button class="btn btn-danger btn-sm" id="btn-leave-ws">Leave workspace</button></div>
        `}
      </div>
    </div>`;

  $("#btn-rename")?.addEventListener("click", async () => {
    const name = $("#set-ws-name").value.trim();
    if (!name) return toast("Give the workspace a name.", "bad");
    try {
      await store.renameWorkspace(ws.id, name);
      state.ws.name = name;
      toast("Workspace renamed.");
      renderChrome();
    } catch (err) {
      toast(store.describeError(err), "bad");
    }
  });

  $("#btn-switch")?.addEventListener("click", () => {
    localStorage.removeItem("rhq_ws");
    state.wsId = null;
    state.ws = null;
    renderPicker();
  });

  $("#btn-signout")?.addEventListener("click", () => signOutNow());

  $("#btn-leave-ws")?.addEventListener("click", () => {
    confirmDialog({
      title: "Leave this workspace?",
      message: "You will lose access immediately and would need a new invitation to return.",
      confirmText: "Leave",
      onConfirm: async () => {
        await store.leaveWorkspace(ws.id);
        toast("You left the workspace.");
        localStorage.removeItem("rhq_ws");
        state.wsId = null;
        state.ws = null;
        renderPicker();
      }
    });
  });

  $("#btn-delete-ws")?.addEventListener("click", () => {
    openModal({
      title: "Delete this workspace?",
      confirmText: "Delete permanently",
      danger: true,
      body: `
        <p>This permanently deletes <strong>${esc(ws.name)}</strong>, its rooms, and
           everyone's access to it. This cannot be undone.</p>
        <div class="field" style="margin-top:14px">
          <label for="del-confirm">Type the workspace name to confirm</label>
          <input type="text" id="del-confirm" autocomplete="off" placeholder="${esc(ws.name)}">
        </div>`,
      onConfirm: async () => {
        if ($("#del-confirm").value.trim() !== ws.name) {
          showModalError("The name does not match.");
          return false;
        }
        await store.deleteWorkspace(ws.id);
        track("workspace_delete");
        toast("Workspace deleted.");
        localStorage.removeItem("rhq_ws");
        state.wsId = null;
        state.ws = null;
        renderPicker();
      }
    });
  });
}

// ============================================================
// Routing
// ============================================================
/** "#/projects/abc" -> { route: "projects", id: "abc" } */
function readRoute() {
  const raw = (location.hash || "").replace(/^#\/?/, "").split("?")[0];
  const [head, id] = raw.split("/");
  return {
    route: NAV.some((n) => n.id === head) ? head : "dashboard",
    id: id || null
  };
}

function onHashChange() {
  const next = readRoute();
  if (next.route === state.route && next.id === state.routeId) return;
  state.route = next.route;
  state.routeId = next.id;
  if (state.ws) renderRoute();
}

// ============================================================
// Boot
// ============================================================
function wireChrome() {
  $("#btn-signin").addEventListener("click", async () => {
    try {
      await signIn();
    } catch (err) {
      const code = err?.code || "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
      if (code === "auth/unauthorized-domain") {
        return renderGate("This domain is not authorized in the Firebase project yet. " +
          "Add it under Authentication > Settings > Authorized domains.");
      }
      renderGate(store.describeError(err));
    }
  });

  $("#modal-x").addEventListener("click", closeModal);
  $("#modal-cancel").addEventListener("click", closeModal);
  $("#modal-confirm").addEventListener("click", runConfirm);

  // Escape closes; a backdrop click deliberately does not, so a stray click
  // never discards a half-filled form.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalState) closeModal();
  });

  window.addEventListener("hashchange", onHashChange);

  document.body.addEventListener("click", (e) => {
    const link = e.target.closest("[data-nav]");
    if (link) setTimeout(() => { state.route = readRoute().route; renderChrome(); }, 0);
  });
}

function boot() {
  wireChrome();
  const initial = readRoute();
  state.route = initial.route;
  state.routeId = initial.id;
  $("#year").textContent = new Date().getFullYear();

  onAuth(async (user) => {
    state.user = user;
    if (!user) {
      state.ws = null;
      state.workspaces = [];
      return renderGate();
    }
    if (state.wsId) {
      await bootWorkspace();
    } else {
      await renderPicker();
    }
  });
}

// ---------- icons ----------
function iconGrid() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`;
}
function iconRooms() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
    <path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M12 21v-6"/></svg>`;
}
function iconPeople() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
    <circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/>
    <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M17.5 14.5A5.5 5.5 0 0 1 20.5 20"/></svg>`;
}
function iconList() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
    <path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.6" cy="6" r="1.3" fill="currentColor" stroke="none"/>
    <circle cx="3.6" cy="12" r="1.3" fill="currentColor" stroke="none"/>
    <circle cx="3.6" cy="18" r="1.3" fill="currentColor" stroke="none"/></svg>`;
}
function iconPhoto() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10.5" r="1.8"/>
    <path d="m4.5 17 4.2-4.2a2 2 0 0 1 2.8 0L16 17.5"/><path d="m14.5 14 1.6-1.6a2 2 0 0 1 2.8 0l1.6 1.6"/></svg>`;
}
function iconBulb() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
    <path d="M9.5 17.5a5.8 5.8 0 1 1 5 0"/><path d="M9.7 17.5h4.6"/><path d="M10.3 20.5h3.4"/></svg>`;
}
function iconMore() {
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`;
}
function iconGear() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
    <circle cx="12" cy="12" r="3.2"/>
    <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3"/></svg>`;
}

boot();
