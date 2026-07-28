// ============================================================
// RemodelHQ — application shell, routing and views
//
// Rendering only. Every Firestore call lives in store.js, and every
// authorization decision is enforced by firestore.rules — the role checks
// here shape the interface, they do not protect the data.
// ============================================================

import { CONFIGURED, onAuth, signIn, signOutNow, currentUser } from "./firebase-config.js";
import * as store from "./store.js";

export const VERSION = "0.1.0";

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
  route: "dashboard"
};

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: iconGrid },
  { id: "rooms",     label: "Rooms",     icon: iconRooms },
  { id: "people",    label: "People",    icon: iconPeople },
  { id: "settings",  label: "Settings",  icon: iconGear }
];

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

  const navHtml = NAV.map((item) => `
    <a href="#/${item.id}" class="${item.id === state.route ? "on" : ""}" data-nav="${item.id}">
      ${item.icon()}<span>${item.label}</span>
    </a>`).join("");
  $("#nav").innerHTML = navHtml;
  $("#bottom-nav").innerHTML = navHtml;

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
  try {
    [rooms, members] = await Promise.all([
      store.loadRooms(ws.id),
      store.loadMembers(ws.id)
    ]);
  } catch (err) {
    host.querySelector(".loading").outerHTML =
      `<div class="error-box">${esc(store.describeError(err))}</div>`;
    return;
  }

  const area = rooms.reduce((sum, r) => sum + (store.roomArea(r) || 0), 0);
  const canAdd = store.canEdit(ws.myRole);

  host.querySelector(".loading").outerHTML = `
    <div class="grid-stats">
      <div class="card stat"><span>Rooms</span><b class="num">${rooms.length}</b>
        <span class="sub">${area ? area.toLocaleString("en-US") + " sq ft measured" : "No dimensions yet"}</span></div>
      <div class="card stat"><span>People</span><b class="num">${members.length}</b>
        <span class="sub">${members.length === 1 ? "Just you so far" : "with access"}</span></div>
      <div class="card stat"><span>Your role</span><b>${esc(store.ROLES[ws.myRole]?.label || ws.myRole)}</b>
        <span class="sub">${esc(store.ROLES[ws.myRole]?.description || "")}</span></div>
      <div class="card stat"><span>Started</span><b>${esc(fmtDate(ws.createdAt))}</b>
        <span class="sub">Workspace created</span></div>
    </div>

    ${rooms.length === 0 ? `
      <div class="section">
        <div class="empty">
          <h3>Start with the rooms</h3>
          <p>Rooms are what everything else hangs off — projects, photos, budgets and
             contractor access are all organized by room.</p>
          ${canAdd ? `<button class="btn" id="dash-add-rooms">Add rooms</button>` : ""}
        </div>
      </div>` : `
      <div class="section">
        <div class="section-head">
          <h2>Rooms</h2>
          <a href="#/rooms">View all</a>
        </div>
        <div class="grid">
          ${rooms.slice(0, 6).map(roomCardHtml).join("")}
        </div>
      </div>`}

    <div class="section">
      <div class="section-head"><h2>Coming next</h2></div>
      <div class="card">
        <p class="muted">This is the foundation release. Next up, in order:
          projects with phases and tasks; photos, ideas and mood boards; budget,
          contractors and the product registry; then scoped contractor sharing,
          reports and backups.</p>
      </div>
    </div>`;

  $("#dash-add-rooms")?.addEventListener("click", () => { location.hash = "#/rooms"; });
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
function readRoute() {
  const raw = (location.hash || "").replace(/^#\/?/, "").split("?")[0];
  return NAV.some((n) => n.id === raw) ? raw : "dashboard";
}

function onHashChange() {
  const next = readRoute();
  if (next === state.route) return;
  state.route = next;
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
    if (link) setTimeout(() => { state.route = readRoute(); renderChrome(); }, 0);
  });
}

function boot() {
  wireChrome();
  state.route = readRoute();
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
function iconGear() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
    <circle cx="12" cy="12" r="3.2"/>
    <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3"/></svg>`;
}

boot();
