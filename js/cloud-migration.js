import { api } from "./api-v227.js";

const $ = id => document.getElementById(id);
const state = {
  source: "",
  container: "",
  items: [],
  breadcrumbs: [],
  selected: new Set(),
  running: false
};

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toLocaleString("de-DE", { maximumFractionDigits: 1 })} ${units[index]}`;
}

function setLog(message, type = "") {
  const line = document.createElement("div");
  line.className = `migration-log-line ${type}`;
  line.textContent = `${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} · ${message}`;
  $("migrationLog").prepend(line);
}

function renderConnections(services = {}) {
  const labels = [
    ["dropbox", "Dropbox"],
    ["onedrive", "OneDrive"],
    ["googleDrive", "Google Drive"]
  ];
  $("migrationConnections").innerHTML = labels.map(([key, label]) => {
    const service = services[key] || {};
    const detail = service.connected
      ? `${service.name || service.email || "verbunden"}`
      : service.error || "nicht verbunden";
    return `<div class="connection-state ${service.connected ? "ok" : "err"}">${label}: ${detail}</div>`;
  }).join("");
}

async function testConnections() {
  $("migrationTestConnections").disabled = true;
  try {
    const result = await api("/migration/status");
    renderConnections(result.services);
  } catch (error) {
    setLog(error.message, "error");
  } finally {
    $("migrationTestConnections").disabled = false;
  }
}

async function listAll(source, container) {
  const items = [];
  let cursor = "";
  do {
    const params = new URLSearchParams({ source });
    if (container) params.set("container", container);
    if (cursor) params.set("cursor", cursor);
    const result = await api(`/migration/items?${params}`);
    items.push(...(result.items || []));
    cursor = result.cursor || "";
  } while (cursor);
  return items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, "de");
  });
}

function renderBreadcrumbs() {
  const rootLabel = state.source === "dropbox" ? "Dropbox" : "OneDrive";
  const parts = [{ name: rootLabel, index: -1 }, ...state.breadcrumbs.map((item, index) => ({ ...item, index }))];
  $("migrationBreadcrumbs").innerHTML = parts.map(part =>
    `<button type="button" data-migration-crumb="${part.index}">${part.name}</button>`
  ).join("<span>›</span>");
}

function renderItems() {
  renderBreadcrumbs();
  if (!state.items.length) {
    $("migrationBrowser").innerHTML = '<p class="hint">Dieser Ordner ist leer.</p>';
  } else {
    $("migrationBrowser").innerHTML = state.items.map((item, index) => `
      <div class="migration-item">
        <label>
          <input type="checkbox" data-migration-select="${index}" ${state.selected.has(index) ? "checked" : ""}>
          <span class="migration-item-icon">${item.kind === "folder" ? "▣" : "▤"}</span>
          <span><strong>${item.name.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]))}</strong><small>${item.kind === "folder" ? "Ordner" : formatBytes(item.size)}</small></span>
        </label>
        ${item.kind === "folder" ? `<button type="button" class="secondary" data-migration-open="${index}">Öffnen</button>` : ""}
      </div>
    `).join("");
  }
  $("migrationSelectAll").disabled = !state.items.length || state.running;
  $("migrationStart").disabled = !state.selected.size || state.running;
}

async function openContainer(source, container = "", breadcrumb = null) {
  state.source = source;
  state.container = container;
  state.selected.clear();
  $("migrationBrowser").innerHTML = '<p class="hint">Ordner werden geladen …</p>';
  if (breadcrumb) state.breadcrumbs.push(breadcrumb);
  state.items = await listAll(source, container);
  renderItems();
}

async function buildTree(item) {
  if (item.kind === "file") return { ...item };
  const container = state.source === "dropbox" ? item.path : item.id;
  const children = await listAll(state.source, container);
  const nodes = [];
  for (const child of children) nodes.push(await buildTree(child));
  return { ...item, children: nodes };
}

function flattenFiles(nodes, output = []) {
  for (const node of nodes) {
    if (node.kind === "file") output.push(node);
    else flattenFiles(node.children || [], output);
  }
  return output;
}

async function createTargetFolder(name = "", parentId = "") {
  const result = await api("/migration/folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: state.source, name, parentId })
  });
  return result.folder;
}

async function copyTree(nodes, parentId, progress) {
  for (const node of nodes) {
    if (node.kind === "folder") {
      const folder = await createTargetFolder(node.name, parentId);
      await copyTree(node.children || [], folder.id, progress);
      continue;
    }
    $("migrationCurrentFile").textContent = `Kopiere: ${node.name}`;
    try {
      const result = await api("/migration/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: state.source, item: node, parentId })
      });
      if (result.file?.skipped) {
        progress.skipped += 1;
        setLog(`${node.name} bereits vorhanden – übersprungen`, "skip");
      } else {
        progress.copied += 1;
        progress.bytes += Number(node.size || 0);
        setLog(`${node.name} kopiert`, "ok");
      }
    } catch (error) {
      progress.failed += 1;
      setLog(`${node.name}: ${error.message}`, "error");
    }
    progress.done += 1;
    const percent = progress.total ? Math.round(progress.done / progress.total * 100) : 100;
    $("migrationProgress").value = percent;
    $("migrationProgressPercent").textContent = `${percent} %`;
    $("migrationProgressTitle").textContent = `${progress.done} von ${progress.total} Dateien`;
    $("migrationSummary").textContent =
      `${progress.copied} kopiert · ${progress.skipped} übersprungen · ${progress.failed} Fehler · ${formatBytes(progress.bytes)}`;
  }
}

async function startMigration() {
  if (state.running || !state.selected.size) return;
  state.running = true;
  renderItems();
  $("migrationLog").innerHTML = "";
  $("migrationProgress").value = 0;
  $("migrationProgressPercent").textContent = "0 %";
  $("migrationProgressTitle").textContent = "Auswahl wird vorbereitet …";
  try {
    const selectedItems = [...state.selected].map(index => state.items[index]).filter(Boolean);
    const trees = [];
    for (const item of selectedItems) {
      $("migrationCurrentFile").textContent = `Prüfe: ${item.name}`;
      trees.push(await buildTree(item));
    }
    const files = flattenFiles(trees);
    const progress = { total: files.length, done: 0, copied: 0, skipped: 0, failed: 0, bytes: 0 };
    const targetRoot = await createTargetFolder();
    await copyTree(trees, targetRoot.id, progress);
    $("migrationCurrentFile").textContent = progress.failed
      ? "Migration beendet – einzelne Fehler können über einen erneuten Start nachgeholt werden."
      : "Migration erfolgreich abgeschlossen.";
    $("migrationProgressTitle").textContent = "Migration abgeschlossen";
    if (!files.length) {
      $("migrationProgress").value = 100;
      $("migrationProgressPercent").textContent = "100 %";
    }
  } catch (error) {
    setLog(error.message, "error");
    $("migrationProgressTitle").textContent = "Migration unterbrochen";
    $("migrationCurrentFile").textContent = "Du kannst den Lauf erneut starten. Bereits kopierte Dateien werden übersprungen.";
  } finally {
    state.running = false;
    renderItems();
  }
}

$("migrationTestConnections")?.addEventListener("click", testConnections);
document.querySelectorAll("[data-migration-source]").forEach(button => button.addEventListener("click", async () => {
  state.breadcrumbs = [];
  try {
    await openContainer(button.dataset.migrationSource);
  } catch (error) {
    setLog(error.message, "error");
  }
}));
$("migrationBrowser")?.addEventListener("change", event => {
  const index = Number(event.target.dataset.migrationSelect);
  if (!Number.isInteger(index)) return;
  if (event.target.checked) state.selected.add(index);
  else state.selected.delete(index);
  $("migrationStart").disabled = !state.selected.size || state.running;
});
$("migrationBrowser")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-migration-open]");
  if (!button) return;
  const item = state.items[Number(button.dataset.migrationOpen)];
  if (!item) return;
  try {
    await openContainer(
      state.source,
      state.source === "dropbox" ? item.path : item.id,
      { name: item.name, container: state.source === "dropbox" ? item.path : item.id }
    );
  } catch (error) {
    setLog(error.message, "error");
  }
});
$("migrationBreadcrumbs")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-migration-crumb]");
  if (!button || state.running) return;
  const index = Number(button.dataset.migrationCrumb);
  const target = index < 0 ? null : state.breadcrumbs[index];
  state.breadcrumbs = index < 0 ? [] : state.breadcrumbs.slice(0, index + 1);
  try {
    await openContainer(state.source, target?.container || "");
  } catch (error) {
    setLog(error.message, "error");
  }
});
$("migrationSelectAll")?.addEventListener("click", () => {
  const allSelected = state.selected.size === state.items.length;
  state.selected = new Set(allSelected ? [] : state.items.map((_, index) => index));
  renderItems();
});
$("migrationStart")?.addEventListener("click", startMigration);

