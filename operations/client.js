const { createColumnControls } = await import(document.querySelector("[data-column-client]").dataset.columnClient);
const root = document.querySelector("#inventory");
const controls = document.querySelector(".catalogue__filters");
const $ = selector => root.querySelector(selector) || controls.querySelector(selector);
const { searchableSelect } = await import(document.querySelector("script[data-atlas-client]").src);
const viewerTableSelect = searchableSelect($("#database-view-table"));
const catalogue = JSON.parse(document.querySelector("#atlas-data").textContent).realms;
const cardTemplates = new Map([...document.querySelector("#directory-card-templates").content.querySelectorAll("[data-realm-id]")].map(card => [card.dataset.realmId, card]));
function catalogueCard(row, realm) {
  const card = cardTemplates.get(realm.id).cloneNode(true);
  card.classList.add("inventory-realm");
  card.querySelector("h3").innerHTML = link(row.id);
  const actions = card.querySelector(".realm-row__actions");
  actions.insertAdjacentHTML("beforeend", '<button class="realm-row__link realm-row__link--detail" data-entity="' + escape(row.id) + '" aria-label="Details for ' + escape(row.name) + '">Details <span aria-hidden="true">→</span></button>');
  card.querySelector(".realm-row__details").insertAdjacentHTML("beforeend", '<div class="realm-row__observation">' + status(row.status) + (current === "apps" ? 'HTTP check ' + escape(row.httpStatus || "Unknown") : escape(row.runtime || "Runtime unknown")) + '</div>');
  return '<tr><td colspan="4" class="realm-cell">' + card.outerHTML + '</td></tr>';
}

const sections = { apps: "Apps", agents: "Agents", services: "Services", workflows: "Workflows", databases: "Databases", issues: "Needs attention" };
const glyphs = {
  apps: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  agents: '<path d="m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z"/>',
  services: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6h2M7 17h2"/>',
  workflows: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M5 7v9a3 3 0 0 0 3 3h9M5 11h11a3 3 0 0 0 3-3V3"/>',
  databases: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/>',
  issues: '<path d="m12 3 10 18H2Z M12 9v5M12 17v1"/>'
};
const glyph = section => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + glyphs[section] + '</svg>';
let snapshot, current = "apps", busy = false;
let staleRetries = 0;
const collapsedDatabaseGroups = new Set();
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const sortChoices = {
  apps: [["name_asc", "Name A–Z"], ["name_desc", "Name Z–A"], ["access", "Access"], ["status", "Process state"]],
  agents: [["name_asc", "Name A–Z"], ["name_desc", "Name Z–A"], ["status", "Process state"], ["runtime", "Runtime"]],
  services: [["name_asc", "Name A–Z"], ["name_desc", "Name Z–A"], ["status", "Process state"], ["mapping", "Mapping"]],
  workflows: [["name_asc", "Name A–Z"], ["name_desc", "Name Z–A"], ["last_desc", "Last run: newest"], ["last_asc", "Last run: oldest"], ["status", "Declared state"]],
  databases: [["name_asc", "Name A–Z"], ["name_desc", "Name Z–A"], ["size_desc", "Size: largest"], ["size_asc", "Size: smallest"], ["owner", "Owner A–Z"]],
  issues: [["severity", "Severity"], ["name_asc", "Finding A–Z"], ["name_desc", "Finding Z–A"]]
};
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const when = value => value ? new Date(typeof value === "number" ? value * 1000 : value).toLocaleString("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" }) : "Unknown";
function databaseBackupTime(value) {
  if (!value) return "Not recorded";
  const date = new Date(typeof value === "number" ? value * 1000 : value);
  return '<span class="database-backup-datetime"><span class="database-backup-date">' + escape(date.toLocaleDateString("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium" })) + '</span>, <span class="database-backup-time">' + escape(date.toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", timeStyle: "short" })) + ' SGT</span></span>';
}
const bytes = value => value >= 1073741824 ? (value / 1073741824).toFixed(2) + " GB" : value >= 1048576 ? (value / 1048576).toFixed(1) + " MB" : Math.round(value / 1024) + " KB";
const all = () => Object.keys(sections).filter(k => k !== "issues").flatMap(k => snapshot?.[k] || []);
const entity = id => all().find(row => row.id === id);
const rowOwnership = row => row.ownership || row.systemOwnership || entity(row.owner || row.entity)?.ownership;
function matchesOwnership(row) {
  const category = document.querySelector('[data-ownership-category]').value;
  const role = document.querySelector('[data-ownership-role]').value;
  const ownership = rowOwnership(row);
  const filters = current === "issues" ? columnControls.state.filters : {};
  return (Object.hasOwn(filters, "category") ? filters.category.includes(ownership?.category) : !category || ownership?.category === category) &&
    (Object.hasOwn(filters, "subcategory") ? filters.subcategory.includes(ownership?.subcategory) : !role || ownership?.subcategory === role);
}
const visible = () => location.hash.split("?")[0] === "#list" && !document.hidden;
const observing = () => !document.hidden && (visible() || !document.querySelector(".hero").hidden);
function updateHome(error = false) {
  for (const count of document.querySelectorAll("[data-home-count]")) {
    count.textContent = snapshot ? snapshot[count.dataset.homeCount].length : "—";
  }
  const freshness = document.querySelector("[data-home-freshness]");
  freshness.dataset.state = error ? "error" : snapshot?.stale ? "stale" : "ready";
  freshness.textContent = snapshot
    ? "Last observed " + when(snapshot.observedAt) + " SGT" + (error ? " · Refresh failed; showing previous observation" : snapshot.stale ? " · Stale observation" : "") +
      (snapshot.coverage.automations.status === "stale snapshot" ? " · Zo Scheduled Tasks: saved list is over 24 hours old" : "")
    : "Inventory unavailable · Open List to retry";
}
let selectedId;
const databaseExtraFields = ["component", "size", "engine", "backupOverview", "remarks"];
const databasePresets = { overview: [...databaseExtraFields], backups: ["backupOverview"] };
let databaseExtraColumns = [...databasePresets.overview];
let databaseView = "overview";
const params = () => new URLSearchParams(location.hash.split("?")[1] || "");
function writeLocation() {
  const state = new URLSearchParams();
  if (current !== "apps") state.set("tab", current);
  if ($("#search").value) state.set("q", $("#search").value);
  if ($("#filter").value) state.set("filter", $("#filter").value);
  if (current === "databases" && $("#owner").value) state.set("owner", $("#owner").value);
  if ($("#sort").value !== sortChoices[current][0][0]) state.set("sort", $("#sort").value);
  const columns = columnControls.serialize();
  if (columns) state.set("columns", columns);
  if (selectedId) state.set("entity", selectedId);
  for (const key of ["db", "table"]) if (params().has(key)) state.set(key, params().get(key));
  state.set("dbColumns", databaseExtraColumns.join(","));
  state.set("dbLayout", "6");

  history.replaceState(null, "", location.pathname + location.search + "#list" + (state.size ? "?" + state : ""));
}
const destination = row => catalogue.find(r => (r.kind === "agent" ? "agent:" : "app:") + r.id === row.id)?.href || row.href;
const openLink = row => { const href = destination(row); return href && /^(https:\/\/|\/(?!\/))/.test(href) ? '<a class="open-link" href="' + escape(href) + '">Open realm ↗</a>' : ""; };
const displayName = row => row.displayName || row.name;
const databaseUsedBy = row => row.component || ({ application: "App", "agent runtime": "Agent Runtime", "host runtime": "Host System", development: "Development / Testing" }[row.category]) || "Not confirmed";
const name = id => { const row = entity(id); return row ? displayName(row) : id || "Unmapped"; };
const ownerKey = row => row.owner || (row.systemOwnership ? "__system__" : "__unmapped__");
const ownerName = row => row.owner ? name(row.owner) : row.systemOwnership?.name || "Unmapped";
const ownerOption = id => id === "__system__" ? "SYSTEM" : id === "__unmapped__" ? "Unmapped owner" : name(id);
const link = (id, title) => id ? '<button class="entity" data-entity="' + escape(id) + '">' + escape(title || name(id)) + "</button>" : "Unmapped";
const status = value => {
  const tone = ["fatal", "error", "backoff", "exited", "degraded"].includes(value) ? "bad" : value === "running" ? "good" : ["unknown", "unmapped", "warning", "old snapshot"].includes(value) ? "warn" : "";
  return '<span class="badge ' + tone + '">' + escape(value || "unknown") + "</span>";
};
const projectLabel = row => '<span class="project-label">' + escape(row.ownershipLabel || "Ownership pending") + '</span>';
const backupStatus = row => {
  const state = row.backup?.status || "unknown";
  if (row.backupOnly) return { label: "Source unconfirmed", tone: "is-old" };
  const label = state === "snapshot found" ? (row.backup?.verification?.startsWith("SHA-256 checked") ? "Restore checked" : "Local snapshot") : state === "old snapshot" ? "Older snapshot" : state === "unknown" ? "Not verified" : state;
  return { label, tone: state === "snapshot found" ? "is-found" : state === "old snapshot" ? "is-old" : "" };
};
const databasePurpose = row => (row.remarks || "").replace(/^Created by Hermes framework\.\s*/, "").replace(/\s*Keep the original filename\.$/, "");
function databaseBackupLabel(row) {
  const count = (row.backupCopies || []).length;
  if (!count) return "No copies recorded";
  return (row.backedUpBy || "Not confirmed").replace(/ backup tool/g, "") + " · " + count + (count === 1 ? " copy" : " copies");
}
function databaseBackupOverview(row) {
  return '<div class="database-backup-overview"><strong>' + escape(databaseBackupLabel(row)) + '</strong>' + ((row.backupCopies || []).length ? databaseBackupTime(row.backup?.lastAt) : '') + '</div>';
}
function databaseSummary(row) {
  const copies = row.backupCopies || [];
  const provider = (row.backedUpBy || "Not confirmed").replace(/ backup tool/g, "");
  const evidence = backupStatus(row);
  return '<div class="database-backup-summary"><span>' + escape(provider) + ' · ' + copies.length + (copies.length === 1 ? ' copy' : ' copies') + '</span><span class="backup-evidence ' + evidence.tone + '">' + escape(evidence.label) + '</span></div>';
}
const databaseNextStep = row => !(row.backupCopies || []).length
  ? "Check where this database is backed up and record the location and latest successful backup."
  : row.backupOnly ? "Confirm which database these copies belong to before relying on them for recovery."
  : row.backup?.status === "old snapshot" ? "Check for a newer backup and confirm the saved copy can be restored."
  : "Confirm the saved copy can be restored and whether a separate off-host copy exists.";
function databaseCopyDetails(row) {
  const copies = row.backupCopies || [];
  return copies.length ? '<ol class="database-copy-list">' + copies.map((copy, i) =>
    '<li><strong>Copy ' + (i + 1) + '</strong> · ' + bytes((copy.bytes || 0) + (copy.walBytes || 0)) +
    '<p>Created by: ' + escape(copy.createdBy || "Not confirmed") + '</p>' +
    backupPath(copy.path, 'backup ' + (i + 1)) +
    '<p>' + escape(copy.association || "Association not confirmed") + '</p>' +
    '<p>Modified: ' + escape(copy.modifiedAt ? when(copy.modifiedAt) + ' SGT' : "Not recorded") + '</p></li>'
  ).join('') + '</ol>' : 'No backup location recorded; this does not confirm that backups are missing.';
}
function backupCopiesButton(row) {
  return '<button type="button" class="copy-row backup-copies-icon" data-backup-details="' + escape(row.id) + '" data-backup-index="-1" aria-haspopup="dialog" aria-controls="backup-dialog" aria-label="View backup copies for ' + escape(displayName(row)) + '" data-tooltip="View backup copies"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h18V3H3zM5 8v13h14V8M10 12h4"/></svg><span class="copy-row-label">View backup copies</span></button>';
}
let backupReturnId;
let backupReturnIndex;
function openBackupDetails(id, index = -1) {
  const row = snapshot?.databases.find(item => item.id === id);
  if (!row) return;
  backupReturnId = id;
  backupReturnIndex = index;
  $("#backup-title").textContent = displayName(row) + " — Backups";
  $("#backup-body").innerHTML = '<div class="backup-overview">' + databaseSummary(row) + '<span>Observed: ' + escape(when(snapshot.observedAt)) + ' SGT</span></div>' +
    '<p class="backup-explanation">' + escape(row.backupOnly ? "Original source unconfirmed" : row.backup?.verification || "Not verified") + '</p>' +
    '<section class="backup-section"><h3>Saved copies</h3>' + databaseCopyDetails(row) + '</section>' +
    '<section class="backup-next"><h3>What to check</h3><p>' + escape(databaseNextStep(row)) + '</p></section>' +
    '<p class="backup-limits">Local copies do not establish off-host protection or full application recovery.</p>';
  $("#backup-dialog").showModal();
  $("#backup-body .database-copy-list")?.children[index]?.scrollIntoView({ block: "nearest" });
}
function databaseViewerButton(row) {
  const available = row.viewer?.available === true;
  const reason = row.viewer?.reason || "Database viewing is unavailable.";
  return '<button type="button" class="copy-row database-view-icon" data-view-database="' + escape(row.id) + '" aria-label="' + escape(available ? "View records for " + displayName(row) : reason) + '" aria-haspopup="dialog" aria-controls="database-view-dialog" aria-disabled="' + !available + '" data-tooltip="' + escape(reason) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><span class="copy-row-label">View records</span></button>';
}
let viewerId;
function writeViewerLocation(key, table) {
  const state = params();
  state.delete("db");
  state.delete("table");
  if (key) {
    state.set("db", key);
    if (table) state.set("table", table);
  }
  history.replaceState(null, "", location.pathname + location.search + "#list" + (state.size ? "?" + state : ""));
}
function syncDatabaseViewer() {
  const key = params().get("db");
  if (!visible() || current !== "databases" || !key) {
    if ($("#database-view-dialog").open) $("#database-view-dialog").close();
    return;
  }
  if (!snapshot) return;
  const matches = snapshot.databases.filter(row => row.viewerKey === key);
  const row = matches.length === 1 ? matches[0] : undefined;
  if (!row?.viewer?.available) {
    if ($("#database-view-dialog").open) $("#database-view-dialog").close();
    writeViewerLocation();
    $("#copy-feedback").textContent = row ? "Cannot reopen database: " + row.viewer.reason : "This database is no longer in Garden’s inventory. Choose another database.";
    return;
  }
  if (viewerId === row.id && $("#database-view-dialog").open) {
    const table = params().get("table");
    const select = $("#database-view-table");
    if (table && !select.disabled && select.value !== table && [...select.options].some(option => option.value === table)) {
      select.value = table;
      select.dispatchEvent(new Event("change"));
    }
    return;
  }
  openDatabaseViewer(row.id, params().get("table"));
}
let viewerOffset = 0;
let viewerRequest = 0;
let viewerAbort;
let viewerSearch = "";
let viewerFilters = [];
let viewerSort = null;
let viewerColumns = [];
let viewerFilterColumn = "";
let viewerFilterTrigger;
let viewerGridScroll = 0;
let viewerValueMode = "notIn";
let viewerValueSelection = new Set();
let viewerValues = [];
let viewerValuesAbort;
let viewerValuesTimer;
function isValueFilter(filter) { return ["in", "notIn"].includes(filter.operator); }
function renderViewerValues() {
  $("#database-values-list").replaceChildren();
  for (const value of viewerValues) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = viewerValueMode === "in" ? viewerValueSelection.has(value) : !viewerValueSelection.has(value);
    input.addEventListener("change", () => {
      if (input.checked === (viewerValueMode === "in")) viewerValueSelection.add(value);
      else viewerValueSelection.delete(value);
      if (viewerValueSelection.size > 500 || JSON.stringify([...viewerValueSelection]).length > 16000) {
        viewerValueSelection.delete(value);
        input.checked = !input.checked;
        $("#database-values-status").textContent = "Selection limit reached. Use a condition to narrow these values.";
      }
    });
    const text = document.createElement("span");
    text.textContent = value === null ? "(NULL)" : value === "" ? "(Empty text)" : value;
    label.append(input, text);
    $("#database-values-list").append(label);
  }
}
async function loadViewerValues(more = false) {
  viewerValuesAbort?.abort();
  const controller = viewerValuesAbort = new AbortController();
  if (!more) viewerValues = [];
  $("#database-values-more").hidden = true;
  $("#database-values-status").textContent = "Loading distinct values…";
  if (!more) renderViewerValues();
  const query = new URLSearchParams({ id: viewerId, table: $("#database-view-table").value, distinct: viewerFilterColumn, offset: String(viewerValues.length), valueSearch: $("#database-value-search").value });
  try {
    const response = await fetch("/operations/api/database-viewer?" + query, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
    const data = await response.json();
    if (controller.signal.aborted) return;
    if (!response.ok) throw new Error(data.error || "Could not load values. Try again.");
    viewerValues = [...new Set([...viewerValues, ...data.values])];
    renderViewerValues();
    $("#database-values-more").hidden = !data.hasMore;
    $("#database-values-status").textContent = viewerValues.length + " distinct values" + (data.hasMore ? " shown · Search or load more" : "");
  } catch (error) {
    if (!controller.signal.aborted) $("#database-values-status").textContent = error.message;
  }
}
function resetViewerFilters() {
  viewerSearch = "";
  viewerFilters = [];
  viewerSort = null;
  viewerColumns = [];
  $("#database-view-search").value = "";
  $("#database-view-filter-rows").replaceChildren();
  $("#database-view-add-filter").disabled = false;
  $("#database-filter-dialog").close();
  $("#database-view-active-filters").replaceChildren();
  $("#database-view-active-filters").hidden = true;
  viewerFilterColumn = "";
  viewerGridScroll = 0;
  $("#database-view-grid").scrollLeft = 0;
  $("#database-view-summary").textContent = "";
  $("#database-view-page").textContent = "";
}
const viewerFilterOperators = { contains: "Contains", equals: "Equals", notEquals: "Does not equal", empty: "Is empty", notEmpty: "Is not empty" };
function updateViewerFilterLimit() {
  const limited = $("#database-view-filter-rows").children.length + viewerFilters.filter(filter => filter.column !== viewerFilterColumn).length >= 8;
  $("#database-view-add-filter").disabled = limited;
  $("#database-filter-limit").hidden = !limited;
}
function openViewerColumnFilter(button) {
  viewerFilterColumn = button.dataset.viewerColumn;
  viewerFilterTrigger = button;
  $("#database-view-sort").value = viewerSort?.column === viewerFilterColumn ? viewerSort.direction : "default";
  $("#database-filter-title").textContent = viewerFilterColumn;
  $("#database-view-filter-rows").replaceChildren();
  viewerFilters.filter(filter => filter.column === viewerFilterColumn && !isValueFilter(filter)).forEach(addViewerFilter);
  const valueFilter = viewerFilters.find(filter => filter.column === viewerFilterColumn && isValueFilter(filter));
  viewerValueMode = valueFilter?.operator || "notIn";
  viewerValueSelection = new Set(valueFilter ? JSON.parse(valueFilter.value) : []);
  $("#database-value-search").value = "";
  void loadViewerValues();
  if (!$("#database-view-filter-rows").children.length) addViewerFilter();
  $("#database-filter-conditions").open = viewerFilters.some(filter => filter.column === viewerFilterColumn && !isValueFilter(filter));
  updateViewerFilterLimit();
  button.setAttribute("aria-expanded", "true");
  const dialog = $("#database-filter-dialog");
  dialog.showModal();
  const rect = button.getBoundingClientRect();
  dialog.style.setProperty("--filter-left", Math.max(8, Math.min(rect.left, innerWidth - dialog.offsetWidth - 8)) + "px");
  dialog.style.setProperty("--filter-top", Math.max(8, Math.min(rect.bottom + 4, innerHeight - dialog.offsetHeight - 8)) + "px");
}
function focusViewerColumn(column) {
  const button = [...document.querySelectorAll("[data-viewer-column]")].find(button => button.dataset.viewerColumn === column);
  button?.focus({ preventScroll: true });
}
function renderViewerFilterSummary() {
  const summary = $("#database-view-active-filters");
  summary.hidden = !viewerFilters.length && !viewerSort;
  summary.innerHTML = viewerFilters.map((filter, index) => {
    const text = isValueFilter(filter) ? filter.column + (filter.operator === "in" ? " · Selected " : " · Excluded ") + JSON.parse(filter.value).length + " values" : filter.column + " " + viewerFilterOperators[filter.operator].toLowerCase() + (["empty", "notEmpty"].includes(filter.operator) ? "" : ' “' + filter.value + '”');
    return '<button type="button" class="database-filter-chip" data-remove-viewer-filter="' + index + '" aria-label="Remove filter: ' + escape(text) + '" title="' + escape(text) + '"><span>' + escape(text) + '</span><span aria-hidden="true">×</span></button>';
  }).join("");
  if (viewerSort) {
    const text = viewerSort.column + (viewerSort.direction === "asc" ? " ↑ Ascending" : " ↓ Descending");
    summary.insertAdjacentHTML("beforeend", '<button type="button" class="database-filter-chip" data-clear-viewer-sort aria-label="Remove sort: ' + escape(text) + '" title="' + escape(text) + '"><span>' + escape(text) + '</span><span aria-hidden="true">×</span></button>');
  }
}
function addViewerFilter(filter) {
  const container = $("#database-view-filter-rows");
  if (!viewerColumns.includes(viewerFilterColumn) || container.children.length + viewerFilters.filter(filter => filter.column !== viewerFilterColumn).length >= 8) return;
  const row = document.createElement("div");
  row.className = "database-filter-row";
  row.innerHTML = '<label><span>Condition</span><select aria-label="Filter condition">' + Object.entries(viewerFilterOperators).map(([value, label]) => '<option value="' + value + '">' + label + '</option>').join("") + '</select></label>' +
    '<label class="database-filter-value"><span>Value</span><input aria-label="Filter value" placeholder="Enter a value…" maxlength="200" autocomplete="off"></label><button type="button" class="button database-filter-remove" aria-label="Remove condition" title="Remove condition">×</button>';
  const condition = row.querySelector('[aria-label="Filter condition"]');
  const value = row.querySelector("input");
  if (filter) { condition.value = filter.operator; value.value = filter.value; }
  const syncCondition = () => {
    value.disabled = ["empty", "notEmpty"].includes(condition.value);
    value.placeholder = value.disabled ? "No value needed" : "Enter a value…";
  };
  condition.addEventListener("change", syncCondition);
  syncCondition();
  row.lastElementChild.addEventListener("click", () => {
    row.remove();
    updateViewerFilterLimit();
    ($("#database-view-filter-rows").querySelector("select") || $("#database-view-add-filter")).focus();
  });
  container.append(row);
  updateViewerFilterLimit();
}
function applyViewerSearch() {
  if (!$("#database-view-table").value) return;
  viewerSearch = $("#database-view-search").value.trim();
  void loadDatabaseViewer($("#database-view-table").value);
}

async function loadDatabaseViewer(table, offset = 0, preferredTable) {
  if (table !== undefined) writeViewerLocation(snapshot.databases.find(row => row.id === viewerId)?.viewerKey, table);
  const version = ++viewerRequest;
  viewerAbort?.abort();
  viewerAbort = new AbortController();
  viewerOffset = offset;
  $("#database-view-status").textContent = "Loading…";
  if ($("#database-view-grid").children.length) viewerGridScroll = $("#database-view-grid").scrollLeft;
  $("#database-view-grid").replaceChildren();
  $("#database-view-prev").disabled = true;
  $("#database-view-next").disabled = true;
  const params = new URLSearchParams({ id: viewerId, offset: String(offset) });
  if (table !== undefined) params.set("table", table);
  if (table !== undefined) {
    params.set("search", viewerSearch);
    params.set("filters", JSON.stringify(viewerFilters));
    params.set("sort", JSON.stringify(viewerSort));
  }
  $("#database-view-grid").setAttribute("aria-busy", "true");

  try {
    const response = await fetch("/operations/api/database-viewer?" + params, { headers: { Accept: "application/json" }, cache: "no-store", signal: viewerAbort.signal });
    const data = await response.json();
    if (version !== viewerRequest) return;
    if (!response.ok) throw new Error(data.error || "Could not read this database.");
    if (table === undefined) {
      $("#database-view-table").innerHTML = data.tables.map(name => '<option value="' + escape(name) + '">' + escape(name) + '</option>').join("");
      $("#database-view-table").disabled = data.tables.length === 0;
      $("#database-view-status").textContent = data.tables.length ? "Loading records…" : "No supported tables in this database.";
      $("#database-view-table").title = data.tablesLimited ? "Showing the first 500 tables." : data.tables.length + " tables";
      const selectedTable = data.tables.includes(preferredTable) ? preferredTable : data.tables[0];
      if (selectedTable !== undefined) $("#database-view-table").value = selectedTable;
      viewerTableSelect.sync();
      writeViewerLocation(snapshot.databases.find(row => row.id === viewerId)?.viewerKey, selectedTable);
      if (data.tables.length) void loadDatabaseViewer(selectedTable);
      return;
    }
    viewerColumns = data.columns;
    for (const selector of ["#database-view-search", "#database-view-search-button", "#database-view-clear"]) $(selector).disabled = false;
    const filtered = Boolean(viewerSearch || viewerFilters.length);
    $("#database-view-status").textContent = data.rows.length ? (filtered ? "Matching records " : "Records ") + (offset + 1) + "–" + (offset + data.rows.length) : filtered ? "No matching records. Try a different search or clear your filters." : "No records in this table.";
    $("#database-view-summary").textContent = data.columns.length + " columns · " + (filtered ? "Search and filters cover the entire table" : "50 records per page");
    $("#database-view-page").textContent = "Page " + (Math.floor(offset / 50) + 1);
    $("#database-view-grid").innerHTML = '<table aria-label="Database records preview"><thead><tr>' + data.columns.map(name => {
      const count = viewerFilters.filter(filter => filter.column === name).length;
      const direction = viewerSort?.column === name ? viewerSort.direction : "";
      return '<th scope="col" aria-sort="' + (direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none") + '"><button type="button" class="database-column-filter' + (count || direction ? ' is-filtered' : '') + '" data-viewer-column="' + escape(name) + '" aria-label="Filter column: ' + escape(name) + (count ? ' (' + count + ' active)' : '') + (direction ? ' — ' + (direction === 'asc' ? 'Ascending' : 'Descending') : '') + '" title="Filter and sort ' + escape(name) + '" aria-haspopup="dialog" aria-controls="database-filter-dialog" aria-expanded="false"><span>' + escape(name) + '</span>' + (direction ? '<span class="database-column-direction" aria-hidden="true">' + (direction === 'asc' ? '↑' : '↓') + '</span>' : '') + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 4h16l-6 7v7l-4 2v-9z"/></svg>' + (count ? '<span class="database-column-count">' + count + '</span>' : '') + '</button></th>';
    }).join("") + '</tr></thead><tbody>' + data.rows.map(row => '<tr>' + row.map(value => '<td>' + (value === null ? '<span class="database-null">NULL</span>' : escape(String(value))) + '</td>').join("") + '</tr>').join("") + '</tbody></table>';
    $("#database-view-grid").scrollLeft = viewerGridScroll;
    $("#database-view-prev").disabled = offset === 0;
    $("#database-view-next").disabled = !data.hasMore;
  } catch (error) {
    if (version === viewerRequest && error.name !== "AbortError") {
      $("#database-view-status").textContent = error.message || "Database viewer unavailable. Try again.";
      $("#database-view-summary").textContent = "";
      $("#database-view-page").textContent = "";
    }
  } finally {
    if (version === viewerRequest) $("#database-view-grid").setAttribute("aria-busy", "false");
  }
}
function openDatabaseViewer(id, preferredTable) {
  const row = snapshot?.databases.find(item => item.id === id);
  if (!row?.viewer?.available) return;
  viewerId = id;
  resetViewerFilters();
  for (const selector of ["#database-view-search", "#database-view-search-button", "#database-view-clear"]) $(selector).disabled = true;

  $("#database-view-title").textContent = displayName(row) + " — Records";
  const owner = entity(row.owner);
  const ownership = rowOwnership(row);
  const projects = [...new Set((snapshot.apps || []).filter(app => app.service === row.owner).map(app => app.name))];
  const project = owner?.project || projects.join(", ") || owner?.name || row.systemOwnership?.name || "Not confirmed";
  const pending = ownership?.status === "proposed" ? " (proposed)" : "";
  $("#database-view-context").innerHTML = [
    ["Project", project],
    ["Database", row.name],
    ["Owner", row.owner ? ownerName(row) : row.systemOwnership?.name || "Ownership pending"],
    ["Category", ownership?.category ? ownership.category + pending : "Ownership pending"],
    ["Sub-category", ownership?.subcategory ? ownership.subcategory + pending : "Ownership pending"]
  ].map(([label, value]) => '<div><dt>' + escape(label) + '</dt><dd>' + escape(value) + '</dd></div>').join("");

  $("#database-view-table").innerHTML = '<option value="">Loading tables…</option>';
  $("#database-view-table").disabled = true;
  viewerTableSelect.sync();
  if (!$("#database-view-dialog").open) $("#database-view-dialog").showModal();
  writeViewerLocation(row.viewerKey, preferredTable);
  void loadDatabaseViewer(undefined, 0, preferredTable);
}
function databaseRow(row) {
  const open = selectedId === row.id;
  const fields = tableKeys.databases.slice(1);
  return '<tr class="database-record' + (open ? ' is-selected' : '') + '" data-database-row="' + escape(row.id) + '"><td data-label="Database"><div class="database-heading">' +
    '<div class="database-title"><span class="database-name database-friendly-name" data-entity="' + escape(row.id) + '">' + escape(displayName(row)) + '</span>' + (displayName(row) !== row.name ? '<span class="database-filename">' + escape(row.name) + '</span>' : '') + '</div><div class="database-actions">' + databaseViewerButton(row) + copyRowButton(row) + copyPathButton(row.path, row.backupOnly ? "representative backup, original source unconfirmed" : "source database") + backupCopiesButton(row) + '</div>' +
    '</div>' +
    (row.backupOnly ? '<span class="database-filename">Retained backups · source unconfirmed</span>' : '') + '</td>' +
    fields.map((key, index) => {
      const column = columnDefinitions.databases.find(item => item.key === key);
      const value = key === "component" ? '<span class="database-component">' + (row.componentEntity ? link(row.componentEntity, databaseUsedBy(row)) : escape(databaseUsedBy(row))) + '</span>'
        : key === "size" ? '<strong>' + bytes(row.bytes + row.walBytes) + '</strong><span class="database-wal-size">WAL ' + bytes(row.walBytes || 0) + '</span>'
        : key === "purpose" ? '<p class="database-purpose">' + escape(databasePurpose(row) || "—") + '</p>'
        : key === "remarks" ? '<span class="database-remarks">' + escape(row.remarks || "—").replace(/^Created by Hermes framework\./, '<strong>Created by Hermes framework.</strong>') + '</span>'
        : key === "backupOverview" ? databaseBackupOverview(row)
        : escape(row[key] || "Not confirmed");
      const layout = '--mobile-order:' + index + ';--mobile-span:3';
      return '<td data-field="' + key + '" data-label="' + escape(column.label) + '" style="' + layout + '"' + '>' + value + '</td>';
    }).join("") + '</tr>';
}
function databaseGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    const ownership = rowOwnership(row) || row.systemOwnership;
    const key = JSON.stringify([ownerKey(row), ownerName(row), ownership?.category, ownership?.subcategory]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, group]) => {
    const row = group[0];
    const ownership = rowOwnership(row) || row.systemOwnership;
    const totalSize = group.reduce((sum, item) => sum + (item.bytes || 0) + (item.walBytes || 0), 0);
    const totalWal = group.reduce((sum, item) => sum + (item.walBytes || 0), 0);
    return '<tr class="database-group" data-database-group="' + escape(key) + '"><th colspan="' + tableKeys.databases.length + '" scope="rowgroup"><div class="database-group-heading"><div class="database-group-summary"><span class="database-owner">' + (row.owner ? link(row.owner) : escape(ownerName(row))) +
      '</span><span class="database-ownership">' + escape(ownership?.category || "Ownership pending") + ' / ' + escape(ownership?.subcategory || "Ownership pending") +
      '</span><span class="database-group-count"><span class="database-group-total"><span class="database-stat-value">' + group.length + '</span> <span class="database-stat-label">' + (group.length === 1 ? 'database' : 'databases') + '</span></span><span class="database-group-size"><span class="database-stat-label">Size + WAL</span> <span class="database-stat-value">' + bytes(totalSize) + '</span></span><span class="database-group-wal"><span class="database-stat-label">WAL only</span> <span class="database-stat-value">' + bytes(totalWal) + '</span></span></span></div><button type="button" class="database-group-link database-group-toggle" data-database-group-toggle aria-expanded="true" aria-label="Collapse ' + escape(ownerName(row)) + ' databases"><span data-group-action>Collapse</span></button></div></th></tr>' + group.map(databaseRow).join("");
  }).join("");
}
function updateDatabaseGroups() {
  const groups = [...root.querySelectorAll("[data-database-group]")];
  for (const group of groups) {
    const collapsed = collapsedDatabaseGroups.has(group.dataset.databaseGroup);
    const button = group.querySelector("[data-database-group-toggle]");
    button.setAttribute("aria-expanded", String(!collapsed));
    const action = collapsed ? "Expand" : "Collapse";
    button.querySelector("[data-group-action]").textContent = action;
    button.setAttribute("aria-label", action + " " + group.querySelector(".database-owner").textContent + " databases");
    for (let row = group.nextElementSibling; row?.matches(".database-record"); row = row.nextElementSibling) row.hidden = collapsed;
  }
  $("#database-group-controls").hidden = current !== "databases";
  const toggle = $("#database-groups-toggle");
  const hasCollapsed = groups.some(group => collapsedDatabaseGroups.has(group.dataset.databaseGroup));
  toggle.dataset.databaseGroupsAction = hasCollapsed ? "expand" : "collapse";
  toggle.textContent = hasCollapsed ? "Expand all" : "Collapse all";
  toggle.setAttribute("aria-label", toggle.textContent + " database groups");
  toggle.disabled = groups.length === 0;
}
function highlightDatabase() {
  for (const record of root.querySelectorAll("[data-database-row]")) record.classList.toggle("is-selected", record.dataset.databaseRow === selectedId);
}
function databaseContext(row) {
  const ownership = rowOwnership(row) || row.systemOwnership;
  const copies = row.backupCopies || [];
  const lines = [
    "Garden of Zo — Database",
    "Observed: " + when(snapshot.observedAt) + " SGT" + (snapshot.stale ? " (older observation)" : ""),
    ...(snapshot.collectionError ? ["Collection warning: " + snapshot.collectionError] : []),
    "Database: " + displayName(row),
    "Filename: " + row.name,
    (row.backupOnly ? "Representative backup path: " : "Source path: ") + row.path,
    "Owner: " + ownerName(row),
    "Used by: " + databaseUsedBy(row),
    "Category: " + (ownership?.category || "Ownership pending"),
    "Sub-category: " + (ownership?.subcategory || "Ownership pending"),
    "Engine: " + (row.engine || "Unknown"),
    "Remarks: " + (row.remarks || "—"),
    (row.backupOnly ? "Retained copy size + WAL: " : "Size + WAL: ") + bytes(row.bytes + row.walBytes) + " (" + (row.bytes + row.walBytes) + " bytes)",
    "WAL: " + (row.walBytes || 0) + " bytes",
    "Backup evidence: " + backupStatus(row).label,
    "Backed up by: " + (row.backedUpBy || "Not confirmed"),
    ...(!row.backupOnly && row.backup?.lastAt ? ["Last backup evidence: " + when(row.backup.lastAt) + " SGT"] : []),
    ...(!row.backupOnly && row.backup?.verification ? ["Verification: " + row.backup.verification] : []),
    "Backup copies: " + copies.length
  ];
  copies.forEach((copy, i) => {
    lines.push("Backup " + (i + 1) + ": " + copy.path);
    lines.push("  Created by: " + (copy.createdBy || "Not confirmed") + " (recorded backup location)");
    if (copy.modifiedAt) lines.push("  File modified: " + when(copy.modifiedAt) + " SGT");
    if (Number.isFinite(copy.bytes)) lines.push("  Size + WAL: " + (copy.bytes + (copy.walBytes || 0)) + " bytes");
    lines.push("  Association: " + (copy.association || "Not recorded"));
  });
  if (!copies.length) lines.push("No backup location recorded; this does not confirm backups are missing.");
  lines.push("Local copies do not establish off-host protection or full application recovery.");
  return lines.join("\n");
}
const copyRowIcon = '<svg class="copy-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4"/></svg>';
const copyRowCheck = '<svg class="copy-row-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
const copyRowButton = row => '<button type="button" class="copy-row" data-copy-row="' + escape(row.id) + '" aria-label="Copy row for ' + escape(row.name) + '" data-tooltip="Copy database details">' + copyRowIcon + copyRowCheck + '<span class="copy-row-label">Copy row</span></button>';
const copyTooltip = document.createElement("div");
copyTooltip.id = "database-action-tooltip";
copyTooltip.className = "database-action-tooltip";
copyTooltip.role = "tooltip";
copyTooltip.hidden = true;
let tooltipTarget;
function hideCopyTooltip() {
  tooltipTarget?.removeAttribute("aria-describedby");
  tooltipTarget = undefined;
  copyTooltip.hidden = true;
}
function showCopyTooltip(button) {
  hideCopyTooltip();
  tooltipTarget = button;
  copyTooltip.textContent = button.dataset.tooltip + (button.dataset.tooltipPath ? "\n" + button.dataset.tooltipPath : "");
  (button.closest("dialog") || root).append(copyTooltip);
  copyTooltip.hidden = false;
  button.setAttribute("aria-describedby", copyTooltip.id);
  const bounds = button.getBoundingClientRect();
  const tip = copyTooltip.getBoundingClientRect();
  copyTooltip.style.left = Math.max(8, Math.min(bounds.left, innerWidth - tip.width - 8)) + "px";
  copyTooltip.style.top = (bounds.bottom + tip.height + 8 < innerHeight ? bounds.bottom + 6 : Math.max(8, bounds.top - tip.height - 6)) + "px";
}
root.addEventListener("pointerover", event => {
  const button = event.target.closest("[data-tooltip]");
  if (button && event.pointerType !== "touch") showCopyTooltip(button);
});
root.addEventListener("pointerout", event => {
  if (tooltipTarget && !tooltipTarget.contains(event.relatedTarget)) hideCopyTooltip();
});
root.addEventListener("focusin", event => {
  const button = event.target.closest("[data-tooltip]");
  if (button) showCopyTooltip(button);
});
root.addEventListener("focusout", hideCopyTooltip);
root.addEventListener("click", hideCopyTooltip);
document.addEventListener("keydown", event => {
  if (event.key === "Escape") hideCopyTooltip();
});
document.addEventListener("scroll", hideCopyTooltip, true);
window.addEventListener("resize", hideCopyTooltip);
window.addEventListener("hashchange", hideCopyTooltip);
let copyReturnFocus;
async function copyDatabaseRow(button) {
  const row = snapshot?.databases.find(item => item.id === button.dataset.copyRow);
  if (!row) return;
  const text = databaseContext(row);
  try {
    await navigator.clipboard.writeText(text);
    button.classList.add("is-copied");
    button.querySelector(".copy-row-label").textContent = "Copied";
    button.dataset.tooltip = "Copied";
    if (tooltipTarget === button) showCopyTooltip(button);
    $("#copy-feedback").textContent = "Copied " + row.name + " with ownership and backup details.";
    clearTimeout(button.copyResetTimer);
    button.copyResetTimer = setTimeout(() => {
      if (!button.isConnected) return;
      button.classList.remove("is-copied");
      button.querySelector(".copy-row-label").textContent = "Copy row";
      button.dataset.tooltip = "Copy database details";
      if (tooltipTarget === button) showCopyTooltip(button);
    }, 2500);
  } catch {
    copyReturnFocus = button;
    $("#copy-row-text").value = text;
    $("#copy-row-dialog").showModal();
    $("#copy-row-text").focus();
    $("#copy-row-text").select();
  }
}
const copyPathIcon = '<svg class="copy-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>';
const copyPathButton = (path, label) => '<button type="button" class="copy-row copy-path-icon" data-copy-path="' + escape(path) + '" aria-label="Copy ' + escape(label) + ' path" data-tooltip="Copy file path" data-tooltip-path="' + escape(path) + '">' + copyPathIcon + copyRowCheck + '<span class="copy-row-label">Copy path</span></button>';
const backupPath = (path, label) => '<div class="backup-path"><code>' + escape(path) + '</code><button type="button" class="button" data-copy-path="' + escape(path) + '" aria-label="Copy ' + escape(label) + ' path">Copy path</button></div>';
async function copyBackupPath(button) {
  try {
    await navigator.clipboard.writeText(button.dataset.copyPath);
    if (button.classList.contains("copy-path-icon")) {
      button.classList.add("is-copied");
      $("#copy-feedback").textContent = "File path copied.";
      clearTimeout(button.copyResetTimer);
      button.copyResetTimer = setTimeout(() => button.classList.remove("is-copied"), 2500);
    } else button.textContent = "Copied";
  } catch {
    if (button.classList.contains("copy-path-icon")) {
      copyReturnFocus = button;
      $("#copy-row-text").value = button.dataset.copyPath;
      $("#copy-row-dialog").showModal();
      $("#copy-row-text").focus();
      $("#copy-row-text").select();
      return;
    }
    const selection = getSelection();
    const range = document.createRange();
    range.selectNodeContents(button.previousElementSibling);
    selection.removeAllRanges();
    selection.addRange(range);
    button.textContent = "Path selected";
  }
}
const openFindingSections = new Set();
let updatingBackups = false;
let backupUpdateMessage = "";
function backupUpdateControls() {
  for (const button of root.querySelectorAll("[data-update-backups]")) {
    button.disabled = updatingBackups;
    button.textContent = updatingBackups ? "Checking & updating backups…" : "Check & update backups";
  }
  for (const feedback of root.querySelectorAll("[data-backup-feedback]")) feedback.textContent = backupUpdateMessage;
}
function backupUpdateActions() {
  return '<div class="finding-task-actions"><button class="button" type="button" data-update-backups>Check &amp; update backups</button></div>' +
    '<p>Checks all backup warnings, including projects hidden by filters. Creates verified local copies for Garden-managed databases. App-managed backups use their own procedure; existing copies are kept.</p>' +
    '<p data-backup-feedback role="status" aria-live="polite"></p>';
}
async function updateBackups() {
  if (updatingBackups) return;
  updatingBackups = true;
  backupUpdateMessage = "Checking existing copies and updating Garden-managed backups…";
  backupUpdateControls();
  try {
    let method = "POST";
    for (;;) {
      const response = await fetch("/operations/api/backups/update", {
        method, headers: { Accept: "application/json", "X-Garden-Action": "update-backups" }, signal: AbortSignal.timeout(30000)
      });
      const state = await response.json();
      if (!response.ok || state.error) throw new Error(state.error || "Backup check unavailable. Try again.");
      if (!state.running) {
        const result = state.result;
        if (!result) throw new Error("No completed backup check was found. Try again.");
        const identify = item => {
          const db = snapshot.databases.find(row => row.path === item.source);
          return db ? (db.ownershipLabel || "Ownership pending") + " | " + (db.projectName || name(db.owner)) + " · " + displayName(db) : item.source;
        };
        backupUpdateMessage = "Finished: " + result.verifiedDatabases + " new verified copies; " + result.skipped.length + " existing copies kept. " +
          (result.skipped.some(item => item.reason === "app-managed backup") ? "App-managed copies were checked; use their own backup procedure if still old. " : "") +
          (result.failures.length ? "Still needs attention: " + result.failures.map(item => identify(item) + ": " + item.error).join("; ") + ". " : "") +
          "Remaining warnings below show what still needs checking. Local copies do not protect against loss of this machine.";
        while (busy) await new Promise(resolve => setTimeout(resolve, 100));
        await refresh(true);
        break;
      }
      method = "GET";
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  } catch (error) {
    backupUpdateMessage = error.message + " The server may still be checking backups; press the button again to reconnect.";
  } finally { updatingBackups = false; backupUpdateControls(); }
}
let updatingTasks = false;
let taskUpdateMessage = "";
function taskUpdateControls() {
  for (const button of root.querySelectorAll("[data-update-tasks]")) {
    button.disabled = updatingTasks;
    button.textContent = updatingTasks ? "Updating task list…" : "Update task list";
  }
  for (const feedback of root.querySelectorAll("[data-task-feedback]")) feedback.textContent = taskUpdateMessage;
}
async function updateTaskList() {
  if (updatingTasks) return;
  updatingTasks = true;
  taskUpdateMessage = "Getting the latest tasks from Zo…";
  taskUpdateControls();
  try {
    const response = await fetch("/operations/api/scheduled-tasks/sync", {
      method: "POST", headers: { Accept: "application/json", "X-Garden-Action": "sync-tasks" },
      signal: AbortSignal.timeout(30000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The task list could not be updated. Try again.");
    taskUpdateMessage = "Updated " + result.count + " scheduled tasks · " + when(result.observedAt) + " SGT. Your schedules are unchanged.";
    while (busy) await new Promise(resolve => setTimeout(resolve, 100));
    await refresh(true);
  } catch (error) {
    taskUpdateMessage = error.name === "TimeoutError"
      ? "The update took too long. Your previous list is still shown; try again."
      : error.message || "Could not connect. Your previous list is still shown; try again.";
  } finally { updatingTasks = false; taskUpdateControls(); }
}
function findingDetails(row) {  if (row.kind === "scheduled-task-list") return '<article class="finding finding-tasks">' +
    '<header class="finding-heading"><div><span class="finding-kicker">Saved list needs attention</span><h4>' + escape(row.message) + '</h4></div></header>' +
    '<p class="finding-context">GOZ | PLATFORM | Garden of Zo · Last updated: ' + (row.observedAt ? when(row.observedAt) + ' SGT' : 'Unknown') + '</p>' +
    '<div class="finding-guide"><section class="finding-meaning"><h5>What this means</h5><p>' + escape(row.reason) + '</p></section>' +
    '<section class="finding-next"><h5>What to do</h5><p>' + escape(row.nextStep) + '</p>' +
    '<div class="finding-task-actions"><button class="button" type="button" data-update-tasks>Update task list</button>' +
    '<a class="button" href="https://sayyidkhan.zo.computer/?t=automations" target="_blank" rel="noopener noreferrer">Open Zo Scheduled Tasks ↗</a></div>' +
    '<p data-task-feedback role="status" aria-live="polite"></p>' +
    '</section></div></article>';

  const heading = '<header class="finding-heading"><span class="finding-indicator" aria-hidden="true">!</span><div><span class="finding-kicker">' + escape(row.severity === "error" ? "Needs attention" : "Evidence to check") + '</span><h4>' + escape(row.message) + '</h4></div>' + status(row.severity === "warning" ? "Needs checking" : row.severity) + '</header>';
  if (!row.affected?.length) return '<article class="finding">' + heading + (row.entity ? '<div class="finding-context">Affected record · ' + link(row.entity) + '</div>' : '') + '</article>';
  const affected = row.affected.map(entity).filter(Boolean).filter(matchesOwnership);
  const groups = new Map();
  for (const db of affected) {
    const label = db.ownershipLabel || "Ownership pending";
    const project = db.projectName || name(db.owner);
    const key = label + " | " + project;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(db);
  }
  const findingKey = row.reason || row.message;
  const disclosure = key => ' data-finding-key="' + escape(key) + '"' + (openFindingSections.has(key) ? ' open' : '');
  const chevron = '<svg class="finding-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m7 4 6 6-6 6"/></svg>';
  const breakdown = [...groups].sort(([a], [b]) => collator.compare(a, b)).map(([key, databases]) => {
    const db = databases[0];
    const project = db.projectName || name(db.owner);
    const label = db.ownershipLabel || "Ownership pending";
    return '<details class="finding-project"' + disclosure(findingKey + ":" + key) + '><summary><span class="finding-project-identity"><span class="finding-project-label">' +
      escape(label) + '</span><strong>' + escape(project) + '</strong></span><span class="finding-file-count">' + databases.length +
      (databases.length === 1 ? ' file' : ' files') + '</span>' + chevron + '</summary><ul>' +
      databases.sort((a, b) => collator.compare(a.path, b.path)).map(db =>
        '<li>' + link(db.id, displayName(db)) + '<small class="finding-path">' + escape(db.path) + '</small>' +
        (db.path.startsWith("/root/.openclaw/") || db.path.includes("/migration/openclaw/")
          ? '<small class="finding-retained">Retained OpenClaw file · Review recovery retention</small>' : '') + '</li>').join('') + '</ul></details>';
  }).join('');
  const filtered = affected.length !== row.affected.length;
  const backupFinding = row.message.includes("unconfirmed backup status");
  const checks = backupFinding
    ? '<ol><li><strong>Find the backup</strong><span>Check where each project keeps its copies and when the latest backup succeeded.</span></li><li><strong>Check recovery</strong><span>Confirm whether a saved copy can be restored.</span></li><li><strong>Close the gap</strong><span>Record existing backup evidence in Garden, or arrange backups for data that needs keeping.</span></li></ol>'
    : '<p>' + escape(row.nextStep) + '</p>';
  return '<article class="finding">' +
    '<div class="finding-top">' + heading +
    '<div class="finding-stats"><span><strong>' + affected.length + '</strong><span>database files' + (filtered ? ' matching labels' : '') +
    '</span></span><span><strong>' + groups.size + '</strong><span>project groups</span></span></div></div>' +
    '<div class="finding-guide"><section class="finding-meaning"><h5>What this means</h5><p class="finding-explanation">' + escape(row.reason) + '</p>' +
    (row.scopeNote ? '<p class="finding-scope">' + escape(row.scopeNote) + '</p>' : '') + '</section>' +
    '<section class="finding-next"><h5>What to check</h5>' + checks + (row.kind === "database-backups" ? backupUpdateActions() : '') + '</section></div>' +
    '<details class="finding-breakdown"' + disclosure(findingKey) + '><summary>' + chevron +
    '<span class="finding-disclosure-copy"><strong>Project breakdown</strong><span>Owners, database files and locations</span></span>' +
    '<span class="finding-summary-note"><span class="finding-show">Show</span><span class="finding-hide">Hide</span> breakdown</span></summary>' +
    '<div class="finding-project-grid">' + breakdown + '</div></details></article>';
}
const definitions = {
  apps: ["App / destination", "Access", "Process state", "Service"],
  agents: ["Agent", "Role / runtime", "Process observation", "Registry state"],
  services: ["Service", "Process state", "Working directory", "Inventory mapping"],
  workflows: ["Workflow", "Trigger", "Declared state", "Last run evidence"],
  databases: ["Database", "Purpose", "Size + WAL"],
  issues: ["Severity", "Finding", "Entity"]
};
const field = (key, label, value, extra = {}) => ({ key, label, value, ...extra });
const categoryValue = row => rowOwnership(row)?.category || row.systemOwnership?.category || "Ownership pending";
const roleValue = row => rowOwnership(row)?.subcategory || row.systemOwnership?.subcategory || "Ownership pending";
const nameField = label => field("name", label, row => row.name);
const labelFields = [field("category", "Category", categoryValue), field("subcategory", "Sub-category", roleValue)];
const columnDefinitions = {
  apps: [nameField("Name"), ...labelFields, field("access", "Access", row => row.access), field("status", "Process state", row => row.status)],
  agents: [nameField("Name"), ...labelFields, field("runtime", "Runtime", row => row.runtime), field("status", "Process state", row => row.status), field("enabled", "Registry state", row => row.enabled ? "Enabled" : "Disabled")],
  services: [nameField("Service"), field("status", "Process state", row => row.status), field("workdir", "Working directory", row => row.workdir), field("mapped", "Inventory mapping", row => row.mapped ? "Linked" : "Unmapped")],
  workflows: [nameField("Workflow"), field("trigger", "Trigger", row => row.trigger), field("status", "Declared state", row => row.status),
    field("lastRun", "Last run evidence", row => (row.lastRun?.status || "Unknown") + (row.lastRun?.lastAt ? " · " + when(row.lastRun.lastAt) : ""), { numeric: true, date: true, sortValue: row => { const value = row.lastRun?.lastAt; return value ? typeof value === "number" ? value * 1000 : Date.parse(value) || null : null; } })],
  databases: [field("name", "Database", displayName), field("owner", "Owner", ownerName), field("component", "Used by", databaseUsedBy), ...labelFields, field("size", "Size + WAL", row => row.bytes + row.walBytes, { numeric: true, format: value => bytes(Number(value)) }),
    field("remarks", "Remarks", row => row.remarks || "—")],
  issues: [field("severity", "Severity", row => row.severity), field("finding", "Finding", row => row.message), field("entity", "Entity", row => name(row.entity))]
};
const tableKeys = Object.fromEntries(Object.entries(columnDefinitions).map(([key, columns]) => [key, columns.map(column => column.key)]));
tableKeys.databases = ["name", "purpose", "size"];
columnDefinitions.databases.push(field("backupOverview", "Backup Info", databaseBackupLabel));
columnDefinitions.databases.push(field("purpose", "Purpose", row => databasePurpose(row) || "—"));
columnDefinitions.databases.push(field("engine", "Engine", row => row.engine || "Unknown"));
columnDefinitions.databases.push(field("lastBackup", "Last backup", row => row.backup?.lastAt ? when(row.backup.lastAt) + " SGT" : "Not recorded", { date: true, numeric: true, sortValue: row => row.backup?.lastAt ? typeof row.backup.lastAt === "number" ? row.backup.lastAt * 1000 : Date.parse(row.backup.lastAt) || null : null }));
columnDefinitions.databases.push(field("backedUpBy", "Backed up by", row => row.backedUpBy || "Not confirmed"));
columnDefinitions.databases.push(field("backupCount", "Backup count", row => (row.backupCopies || []).length, { numeric: true, format: value => value + (Number(value) === 1 ? " copy" : " copies"), relatedKeys: ["backupCount"] }));
columnDefinitions.workflows.push(field("type", "Workflow type", row => row.type));
for (const section of ["services", "workflows", "issues"]) columnDefinitions[section].push(...labelFields.map(column => section !== "issues" ? column : {
  ...column, values: row => row.affected ? [...new Set(row.affected.map(entity).filter(Boolean).map(column.value))] : [column.value(row)]
}));
const seededLabels = new Set();
function migrateFilters() {
  if (!snapshot) return;
  const state = columnControls.state;
  for (const [key, aliases] of Object.entries({ category: { "Host system": "SYSTEM" }, subcategory: { Runtime: "RUNTIME", "Temporary files": "TEMPORARY" } })) {
    if (state.filters[key]) state.filters[key] = [...new Set(state.filters[key].map(value => aliases[value] || value))];
  }
  if (current === "databases" && state.filters.component) {
    const labels = { "Agent runtime": "Agent Runtime", "Agent dashboard": "Agent Dashboard" };
    state.filters.component = [...new Set(state.filters.component.map(value => labels[value] || value))];
  }
  if (current === "databases" && state.filters.name) {
    state.filters.name = [...new Set(state.filters.name.flatMap(value => {
      const matches = snapshot.databases.filter(row => row.name === value);
      return matches.length ? matches.map(displayName) : [value];
    }))];
  }
  if (current === "databases" && state.filters.owner) {
    state.filters.owner = [...new Set(state.filters.owner.map(value => value === "orin-hermes-dashboard" ? name("agent:orin") : value))];
  }
  if (!seededLabels.has(current)) {
    seededLabels.add(current);
    const labels = new URLSearchParams(location.search);
    if (!Object.hasOwn(state.filters, "category") && labels.get("category")) state.filters.category = [labels.get("category")];
    if (!Object.hasOwn(state.filters, "subcategory") && labels.get("role")) state.filters.subcategory = [labels.get("role")];
    const access = document.querySelector('[data-filter][aria-pressed="true"]').dataset.filter;
    if (current === "apps" && !Object.hasOwn(state.filters, "access") && access !== "all") state.filters.access = [access];
  }
  const filter = $("#filter").value;
  if (filter) {
    const matches = snapshot[current].filter(row => matchesFilter(row, filter));
    const [legacyKey] = filter.split(":");
    const key = current === "databases" && legacyKey === "category" ? "component" : legacyKey;
    const column = columnDefinitions[current].find(column => column.key === key);
    if (column) state.filters[key] = [...new Set(matches.map(row => String(column.value(row) ?? "")))];
    $("#filter").value = "";
  }
  const owner = $("#owner").value;
  if (current === "databases" && owner) {
    state.filters.owner = [...new Set(snapshot.databases.filter(row => ownerKey(row) === owner).map(ownerName))];
    $("#owner").value = "";
  }
  const order = $("#sort").value;
  if (!state.sort && order && order !== sortChoices[current][0][0] && order !== "column") {
    const key = order.startsWith("name_") ? (current === "issues" ? "finding" : "name") : order.startsWith("size_") ? "size" : order.startsWith("last_") ? "lastRun" : order === "mapping" ? "mapped" : order;
    if (columnDefinitions[current].some(column => column.key === key)) state.sort = { key, direction: order.endsWith("_desc") ? "desc" : "asc" };
  }
}
let columnRows = [];
const columnControls = createColumnControls({
  rows: () => columnRows,
  onChange: ({ sortChanged }) => {
    $("#filter").value = "";
    $("#owner").value = "";
    document.dispatchEvent(new CustomEvent("garden:listlabels", { detail: columnControls.state }));
    options();
    if (sortChanged) $("#sort").value = columnControls.state.sort ? "column" : sortChoices[current][0][0];
    writeLocation();
    render();
  }
});
const option = (value, label) => '<option value="' + escape(value) + '">' + escape(label) + '</option>';
const unique = values => [...new Set(values.filter(v => v !== null && v !== undefined && v !== ""))].sort(collator.compare);
function options() {
  columnControls.activate(current, columnDefinitions[current]);
  const previous = { filter: $("#filter").value, owner: $("#owner").value, sort: $("#sort").value };
  const rows = snapshot?.[current] || [];
  const groups = current === "databases" ? [["category", "Category", rows.map(r => r.category)], ["backup", "Backup", rows.map(r => r.backup?.status)]] :
    current === "workflows" ? [["type", "Type", rows.map(r => r.type)], ["status", "State", rows.map(r => r.status)]] :
    current === "apps" ? [["access", "Access", rows.map(r => r.access)], ["status", "Process", rows.map(r => r.status)]] :
    current === "agents" ? [["status", "Process", rows.map(r => r.status)], ["runtime", "Runtime", rows.map(r => r.runtime)]] :
    current === "services" ? [["status", "Process", rows.map(r => r.status)], ["mapped", "Mapping", ["linked", "unmapped"]]] :
    [["severity", "Severity", rows.map(r => r.severity)]];
  $("#filter").innerHTML = option("", "All records") + groups.map(([field, label, values]) =>
    '<optgroup label="' + escape(label) + '">' + unique(values).map(v => option(field + ":" + v, label + ": " + v)).join("") + "</optgroup>").join("");
  $("#filter").value = previous.filter;
  if (!$("#filter").selectedOptions.length) $("#filter").value = "";
  $("#owner-field").hidden = current !== "databases";
  const owners = current === "databases" ? unique(rows.map(ownerKey)).sort((a, b) => collator.compare(ownerOption(a), ownerOption(b))) : [];
  $("#owner").innerHTML = option("", "All owners") + owners.map(id => option(id, ownerOption(id)));
  $("#owner").value = previous.owner === "service:orin-hermes-dashboard" ? "agent:orin" : previous.owner;
  if (!$("#owner").selectedOptions.length) $("#owner").value = "";
  $("#sort").innerHTML = sortChoices[current].map(([value, label]) => option(value, label)).join("") + (columnControls.state.sort ? option("column", "Column: " + columnDefinitions[current].find(column => column.key === columnControls.state.sort.key).label + (columnControls.state.sort.direction === "asc" ? " ↑" : " ↓")) : "");
  $("#sort").value = columnControls.state.sort ? "column" : previous.sort;
  if (!$("#sort").selectedOptions.length) $("#sort").value = sortChoices[current][0][0];
}
function matchesFilter(row, value) {
  if (!value) return true;
  const cut = value.indexOf(":");
  const field = value.slice(0, cut), expected = value.slice(cut + 1);
  if (field === "mapped") return (row.mapped ? "linked" : "unmapped") === expected;
  return String(field === "backup" ? row.backup?.status : row[field]) === expected;
}
function sortRows(rows) {
  if (columnControls.state.sort) return columnControls.sort(rows);
  const order = $("#sort").value;
  const text = (a, b) => collator.compare(String(a ?? ""), String(b ?? ""));
  const lastAt = row => { const value = row.lastRun?.lastAt; return typeof value === "number" ? value * 1000 : Date.parse(value || "") || 0; };
  return rows.sort((a, b) => {
    let result = 0;
    if (order === "name_desc") result = text(displayName(b) || b.message, displayName(a) || a.message);
    else if (order === "size_desc") result = (b.bytes + b.walBytes) - (a.bytes + a.walBytes);
    else if (order === "size_asc") result = (a.bytes + a.walBytes) - (b.bytes + b.walBytes);
    else if (order === "last_desc" || order === "last_asc") result = !lastAt(a) ? 1 : !lastAt(b) ? -1 : order === "last_desc" ? lastAt(b) - lastAt(a) : lastAt(a) - lastAt(b);
    else if (order === "severity") result = ({ error: 0, warning: 1, info: 2 }[a.severity] ?? 3) - ({ error: 0, warning: 1, info: 2 }[b.severity] ?? 3);
    else if (order === "mapping") result = Number(a.mapped) - Number(b.mapped);
    else if (order === "owner") result = text(ownerName(a), ownerName(b));
    else if (order === "backup") result = text(a.backup?.status, b.backup?.status);
    else if (order === "access" || order === "status" || order === "runtime") result = text(a[order], b[order]);
    else result = text(displayName(a) || a.message, displayName(b) || b.message);
    return result || text(a.name || a.message, b.name || b.message) || text(a.id, b.id);
  });
}
function select(section) {
  if (!sections[section]) return;
  current = section;
  $("#filter").value = "";
  $("#owner").value = "";
  $("#sort").value = "";
  options();
  writeLocation();
  render();
}
function renderColumnToolbar() {
  const toolbar = $("[data-columns-toolbar]");
  columnControls.render(toolbar, false, ["apps", "agents", "issues"].includes(current) || innerWidth <= 760 ? undefined : columnDefinitions[current].filter(column => !tableKeys[current].includes(column.key)).map(column => column.key));
}
function render() {
  if (!snapshot) return;
  const focusedTab = document.activeElement?.closest("#tabs [data-tab]")?.dataset.tab;
  const tabScroll = $("#tabs").scrollLeft;
  $("#summary").innerHTML = ["apps", "agents", "services", "workflows", "databases"].map(k => '<button data-tab="' + k + '"><strong>' + snapshot[k].length + "</strong><span>" + sections[k] + "</span></button>").join("");
  $("#tabs").innerHTML = Object.entries(sections).map(([k,v]) => '<button data-tab="' + k + '" aria-pressed="' + (current === k) + '">' + glyph(k) + '<span>' + v + '</span><span class="tab-count">' + snapshot[k].length + "</span></button>").join("");
  if (focusedTab) $('#tabs [data-tab="' + focusedTab + '"]').focus({ preventScroll: true });
  $("#tabs").scrollLeft = tabScroll;
  $("#section-title").textContent = sections[current];
  const realms = current === "apps" || current === "agents";
  $("table").classList.toggle("realm-table", realms);
  $("table").classList.toggle("database-table", current === "databases");
  $("#head").hidden = realms || current === "issues";
  $("table").classList.toggle("findings-table", current === "issues");
  $("#notice").hidden = !snapshot.collectionError && (current === "issues" || !snapshot.issues.length);
  const query = $("#search").value.trim().toLowerCase();
  const filter = $("#filter").value;
  const owner = $("#owner").value;
  const access = document.querySelector('[data-filter][aria-pressed="true"]').dataset.filter;
  migrateFilters();
  columnRows = snapshot[current].filter(row => !query || (JSON.stringify(row) + name(row.owner) + (current === "databases" ? databaseUsedBy(row) : "")).toLowerCase().includes(query));
  const rows = sortRows(columnControls.filter(columnRows));
  tableKeys.databases = ["name", "purpose", ...databaseExtraColumns];

  $(".table-wrap").classList.toggle("database-scroll", current === "databases");
  $(".table-wrap").tabIndex = current === "databases" ? 0 : -1;
  $(".table-wrap").setAttribute("aria-label", current === "databases" ? "Database records" : "Inventory table");
  const oldColumns = $("table colgroup");
  if (oldColumns) oldColumns.remove();
  if (current === "databases") {
    const colgroup = document.createElement("colgroup");
    const widths = { size:96, component:136, engine:88, backupOverview:208 };
    const columnWidth = key => widths[key] || (key === "remarks" ? 360 : 160);
    colgroup.innerHTML = '<col class="database-label-col"><col class="database-purpose-col">' + databaseExtraColumns.map(key => '<col style="width:' + columnWidth(key) + 'px">').join("");
    $("table").prepend(colgroup);
    $("table").style.setProperty("--database-table-min", (databaseExtraColumns.reduce((total, key) => total + columnWidth(key), 380)) + "px");
    $("table").classList.toggle("database-locked-only", !databaseExtraColumns.length);
  }
  requestAnimationFrame(() => {
    const cell = $("#head th");
    if (cell) $(".table-wrap").style.setProperty("--database-label-width", cell.getBoundingClientRect().width + "px");
  });
  columnControls.render($("#head"), true, tableKeys[current]);
  renderColumnToolbar();
  columnControls.summary($("[data-columns-summary]"));
  $("#rows").innerHTML = (current === "databases" ? databaseGroups(rows) : rows.map(row => {
    if (realms) {
      const realm = catalogue.find(r => (r.kind === "agent" ? "agent:" : "app:") + r.id === row.id);
      if (realm && cardTemplates.has(realm.id)) return catalogueCard(row, realm);
      const art = realm ? '<img src="' + escape(realm.art) + '" alt="" loading="lazy" decoding="async">' : glyph(current);
      const category = realm?.category || (current === "agents" ? row.role : "Private tool");
      const access = current === "apps" ? (row.access === "private" ? "Owner access" : "Public access") : (row.runtime || "Agent");
      const byline = projectLabel(row) + (realm ? 'By <a href="' + escape(realm.author.profileUrl) + '" target="_blank" rel="noreferrer">' + escape(realm.author.name) + '</a> · ' + escape(access) : escape(access));
      const observation = current === "apps" ? '<span class="realm-observation">HTTP check <strong>' + escape(row.httpStatus || "Unknown") + '</strong>' + (row.listed ? '' : ' · Private tool') + '</span>' : '<span class="realm-observation">' + escape(row.runtime || "Runtime unknown") + '</span>';
      return '<tr><td colspan="4" class="realm-cell"><article class="inventory-realm"><div class="inventory-art" aria-hidden="true">' + art + '</div><div class="realm-body"><div class="realm-heading"><span class="realm-category">' + escape(category) + '</span>' + status(row.status) + '</div><h3 class="realm-name">' + link(row.id) + '</h3><p class="realm-description">' + escape(row.description) + '</p><span class="realm-byline">' + byline + '</span></div><div class="realm-foot">' + observation + '<div class="realm-actions"><button class="realm-detail" data-entity="' + escape(row.id) + '" aria-label="Details for ' + escape(row.name) + '">Details <span aria-hidden="true">→</span></button>' + openLink(row) + '</div></div></article></td></tr>';
    }
    let cells;
    if (current === "services") cells = [link(row.id) + projectLabel(row) + "<small>" + (row.pid ? "PID " + row.pid : "No observed PID") + "</small>", status(row.status), "<small>" + escape(row.workdir) + "</small>", row.mapped ? "Linked" : status("unmapped")];
    if (current === "workflows") cells = [link(row.id) + projectLabel(row) + "<small>" + escape(row.type) + "</small>", "<small>" + escape(row.trigger) + "</small>", status(row.status), escape(row.lastRun?.status) + "<small>" + when(row.lastRun?.lastAt) + "</small>"];
    if (current === "issues") return '<tr><td colspan="3" class="finding-cell">' + findingDetails(row) + '</td></tr>';
    return "<tr>" + cells.map((cell, i) => '<td data-label="' + escape(definitions[current][i]) + '">' + cell + "</td>").join("") + "</tr>";
  }).join("")) || '<tr><td colspan="' + tableKeys[current].length + '" class="empty">No matching records. Try another search or filter.</td></tr>';
  updateDatabaseGroups();
  const total = current === "databases" ? " · " + bytes(rows.reduce((sum, r) => sum + r.bytes + r.walBytes, 0)) + " including WAL" : "";
  const scheduleNote = current === "workflows" ? " · Zo Scheduled Tasks: saved list updated " + when(snapshot.coverage.automations.observedAt) + " SGT; run history unavailable." : "";
  $("#caption").textContent = rows.length + " of " + snapshot[current].length + " records" + total + (current === "databases" ? " · Grouped by owner; sorted within each group" : "");
  $("#evidence-caption").textContent = (["services", "agents", "apps"].includes(current) ? "Running confirms a process exists; application health is not verified." : "") + scheduleNote;
  taskUpdateControls();
  backupUpdateControls();
}
function detail(id) {
  const row = entity(id);
  if (!row) return;
  if (snapshot.databases.some(database => database.id === id)) {
    const changed = selectedId !== id || current !== "databases";
    if ($("#detail").open) $("#detail").close();
    if (current !== "databases") select("databases");
    selectedId = id;
    render();
    writeLocation();
    if (changed) requestAnimationFrame(() => {
      const record = root.querySelector('[data-database-row="' + CSS.escape(id) + '"]');
      record?.scrollIntoView({ block: "nearest" });
    });
    return;
  }
  selectedId = id;
  writeLocation();
  const dialog = $("#detail");

  highlightDatabase();
  $("#detail-title").textContent = displayName(row);
  const fields = Object.entries(row).filter(([key]) => !["id", "displayName"].includes(key) && (key !== "name" || row.displayName)).map(([key, value]) => [key === "name" ? "Filename" : key, value]);
  $("#detail-body").innerHTML = "<dl>" + fields.map(([key,value]) => "<dt>" + escape(key.replace(/([A-Z])/g, " $1")) + "</dt><dd>" + (key === "owner" ? link(value) : key === "componentEntity" ? link(value, row.component) : key === "href" && /^https:\/\//.test(value) ? '<a target="_blank" rel="noreferrer" href="' + escape(value) + '">Open destination ↗</a>' : escape(typeof value === "object" ? JSON.stringify(value, null, 2) : value)) + "</dd>").join("") + "</dl>";
  for (const [direction, heading] of [["from", "Depends on / uses"], ["to", "Used by / affected consumers"]]) {
    const other = direction === "from" ? "to" : "from";
    const related = snapshot.dependencies.filter(d => d[direction] === id);
    $("#detail-body").insertAdjacentHTML("beforeend", "<h2>" + heading + "</h2><div class='related'>" +
      (related.map(d => '<button class="button" data-entity="' + escape(d[other]) + '" title="' + escape(d.evidence) + '">' + escape(name(d[other])) + "</button>").join("") || "<span class='muted'>No relationship recorded.</span>") + "</div>");
  }
  const realm = catalogue.find(r => (r.kind === "agent" ? "agent:" : "app:") + r.id === id);
  if (realm) $("#detail-body").insertAdjacentHTML("afterbegin", '<p><a href="' + escape(realm.href) + '">Open destination ↗</a> · <a target="_blank" rel="noreferrer" href="' + escape(realm.repositoryUrl) + '">View GitHub ↗</a> · <a target="_blank" rel="noreferrer" href="' + escape(realm.author.profileUrl) + '">By ' + escape(realm.author.name) + "</a></p>");
  if (!$("#detail").open) $("#detail").showModal();
}
async function refresh(fresh = false) {
  if (busy) return;
  busy = true;
  $("#refresh").disabled = true;
  $("#refresh").textContent = "Refreshing…";
  try {
    const response = await fetch("/operations/api/inventory" + (fresh ? "?fresh=1" : ""), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error("Inventory request failed (" + response.status + ").");
    snapshot = await response.json();    updateHome();
    $("#updated").textContent = "Observed " + when(snapshot.observedAt) + " SGT" + (snapshot.stale ? " · STALE" : "");
    $("#inventory-stale").hidden = !snapshot.stale;
    $("#inventory-stale").title = "Showing data from " + when(snapshot.observedAt) + " SGT";
    $("#notice").hidden = false;
    const failures = snapshot.issues.filter(i => i.severity === "error").length;
    const gaps = snapshot.issues.filter(i => i.severity === "warning").length;
    $("#notice").innerHTML = '<span>' + escape(snapshot.collectionError || failures + (failures === 1 ? ' failure' : ' failures') + ' · ' + gaps + ' evidence gaps in your garden') + '</span><button data-tab="issues">Review findings ↗</button>';
    $("#notice").hidden = !snapshot.collectionError && !failures && !gaps;
    const sourceNames = { databases: "Database scan", automations: "Zo Scheduled Tasks", apps: "Apps", services: "Services", agents: "Agents", backups: "Backup evidence", workflows: "Workflows" };
    const fieldNames = { roots: "Folders checked", complete: "Scan complete", excludedDirectories: "Folders skipped", unreadablePaths: "Unreadable paths", status: "Source status", observedAt: "Source updated", note: "Limitations" };
    const evidenceValue = (key, value) => key === "observedAt" ? when(value) + " SGT" : typeof value === "boolean" ? (value ? "Yes" : "No") : Array.isArray(value) ? value.join(" · ") : String(value ?? "Unknown");
    $("#coverage").innerHTML = Object.entries(snapshot.coverage).map(([key, value]) => '<section class="coverage-source"><h3>' + escape(sourceNames[key] || key) + '</h3>' + (value && typeof value === "object" ? '<dl>' + Object.entries(value).map(([field, evidence]) => '<dt>' + escape(fieldNames[field] || field) + '</dt><dd>' + escape(evidenceValue(field, evidence)) + '</dd>').join("") + '</dl>' : '<p>' + escape(value) + '</p>') +
      (key === "automations" ? '<button class="button" type="button" data-update-tasks>Update task list</button><p data-task-feedback role="status" aria-live="polite"></p>' : '') +
      (key === "backups" ? backupUpdateActions() : '') + '</section>').join("");
    const state = params();
    options();
    $("#filter").value = state.get("filter") || "";
    $("#owner").value = state.get("owner") || "";
    $("#sort").value = state.get("sort") || sortChoices[current][0][0];
    if (!$("#sort").selectedOptions.length) $("#sort").value = sortChoices[current][0][0];
    render();
    if (visible() && params().get("entity")) detail(params().get("entity"));
    syncDatabaseViewer();
    if (snapshot.stale && observing() && staleRetries < 3) {
      staleRetries++;
      setTimeout(() => { if (observing()) void refresh(); }, 2500);
    } else if (!snapshot.stale) staleRetries = 0;
  } catch (error) {
    $("#notice").hidden = false;    updateHome(true);
    $("#notice").textContent = error.message + (snapshot ? " Showing the previous observation." : " No inventory is available yet.");
    $("#inventory-stale").hidden = !snapshot;
  } finally { busy = false; $("#refresh").disabled = false; $("#refresh").textContent = "Refresh"; }
}
root.addEventListener("toggle", event => {
  const key = event.target.dataset?.findingKey;
  if (!key) return;
  if (event.target.open) openFindingSections.add(key);
  else openFindingSections.delete(key);
}, true);
root.addEventListener("click", event => {
  const groupToggle = event.target.closest("[data-database-group-toggle]");
  if (groupToggle) {
    const key = groupToggle.closest("[data-database-group]").dataset.databaseGroup;
    if (collapsedDatabaseGroups.has(key)) collapsedDatabaseGroups.delete(key);
    else collapsedDatabaseGroups.add(key);
    updateDatabaseGroups();
    return;
  }
  const allGroups = event.target.closest("[data-database-groups-action]");
  if (allGroups) {
    for (const group of root.querySelectorAll("[data-database-group]")) {
      if (allGroups.dataset.databaseGroupsAction === "collapse") collapsedDatabaseGroups.add(group.dataset.databaseGroup);
      else collapsedDatabaseGroups.delete(group.dataset.databaseGroup);
    }
    updateDatabaseGroups();
    return;
  }
  const viewDatabase = event.target.closest("[data-view-database]");
  if (viewDatabase) { openDatabaseViewer(viewDatabase.dataset.viewDatabase); return; }
  const backup = event.target.closest("[data-backup-details]");
  if (backup) openBackupDetails(backup.dataset.backupDetails, Number(backup.dataset.backupIndex));
  const update = event.target.closest("[data-update-tasks]");
  if (update) void updateTaskList();
  if (event.target.closest("[data-update-backups]")) void updateBackups();
  const tab = event.target.closest("[data-tab]");
  if (tab) select(tab.dataset.tab);
  const copyRow = event.target.closest("[data-copy-row]");
  if (copyRow) void copyDatabaseRow(copyRow);
  const copy = event.target.closest("[data-copy-path]");
  if (copy) void copyBackupPath(copy);
  const target = event.target.closest("button[data-entity]");
  if (target) detail(target.dataset.entity);
});
$("#close-database-view").addEventListener("click", () => $("#database-view-dialog").close());
$("#database-view-table").addEventListener("change", event => {
  viewerTableSelect.sync();
  resetViewerFilters();
  if (event.target.value) void loadDatabaseViewer(event.target.value);
});
$("#database-view-search-form").addEventListener("submit", event => { event.preventDefault(); applyViewerSearch(); });
$("#database-view-search").addEventListener("search", applyViewerSearch);
$("#database-view-grid").addEventListener("click", event => {
  const button = event.target.closest("[data-viewer-column]");
  if (button) openViewerColumnFilter(button);
});
$("#database-view-add-filter").addEventListener("click", () => {
  addViewerFilter();
  $("#database-view-filter-rows").lastElementChild?.querySelector("select").focus();
});
$("#database-view-reset-filters").addEventListener("click", () => {
  $("#database-view-filter-rows").replaceChildren();
  viewerValueMode = "notIn";
  viewerValueSelection.clear();
  renderViewerValues();
  updateViewerFilterLimit();
});
$("#database-view-cancel-filters").addEventListener("click", () => $("#database-filter-dialog").close());
$("#database-value-search").addEventListener("input", () => {
  clearTimeout(viewerValuesTimer);
  viewerValuesAbort?.abort();
  viewerValuesTimer = setTimeout(() => void loadViewerValues(), 250);
});
$("#database-value-search").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    clearTimeout(viewerValuesTimer);
    void loadViewerValues();
  }
});
$("#database-values-more").addEventListener("click", () => void loadViewerValues(true));
for (const [id, mode] of [["all", "notIn"], ["none", "in"]]) {
  $("#database-values-" + id).addEventListener("click", () => {
    viewerValueMode = mode;
    viewerValueSelection.clear();
    renderViewerValues();
  });
}
$("#database-filter-dialog").addEventListener("close", () => {
  clearTimeout(viewerValuesTimer);
  viewerValuesAbort?.abort();
  viewerValues = [];
  viewerValueSelection.clear();
  $("#database-values-list").replaceChildren();
  viewerFilterTrigger?.setAttribute("aria-expanded", "false");
  if (viewerFilterTrigger?.isConnected) viewerFilterTrigger.focus({ preventScroll: true });
});
$("#database-filter-dialog").addEventListener("keydown", event => {
  if (event.key !== "Tab") return;
  const fields = [...event.currentTarget.querySelectorAll("input:not(:disabled),select:not(:disabled),button:not(:disabled),summary")].filter(field => field.getClientRects().length);
  const first = fields[0], last = fields.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
$("#database-view-filters").addEventListener("submit", event => {
  event.preventDefault();
  const nextFilters = [...viewerFilters.filter(filter => filter.column !== viewerFilterColumn), ...[...$("#database-view-filter-rows").children].map(row => ({
    column: viewerFilterColumn,
    operator: row.querySelector('[aria-label="Filter condition"]').value,
    value: row.querySelector("input").disabled ? "" : row.querySelector("input").value
  })).filter(filter => filter.operator !== "contains" || filter.value !== "")];
  if (viewerValueMode === "in" || viewerValueSelection.size) nextFilters.push({ column: viewerFilterColumn, operator: viewerValueMode, value: JSON.stringify([...viewerValueSelection]) });
  if (nextFilters.length > 8) {
    $("#database-values-status").textContent = "Maximum of 8 filters. Remove a condition before applying values.";
    return;
  }
  viewerFilters = nextFilters;
  const direction = $("#database-view-sort").value;
  if (direction !== "default") viewerSort = { column: viewerFilterColumn, direction };
  else if (viewerSort?.column === viewerFilterColumn) viewerSort = null;
  renderViewerFilterSummary();
  $("#database-filter-dialog").close();
  void loadDatabaseViewer($("#database-view-table").value).then(() => focusViewerColumn(viewerFilterColumn));
});
$("#database-view-active-filters").addEventListener("click", event => {
  if (event.target.closest("[data-clear-viewer-sort]")) {
    const column = viewerSort.column;
    viewerSort = null;
    renderViewerFilterSummary();
    void loadDatabaseViewer($("#database-view-table").value).then(() => focusViewerColumn(column));
    return;
  }
  const chip = event.target.closest("[data-remove-viewer-filter]");
  if (!chip) return;
  const column = viewerFilters[Number(chip.dataset.removeViewerFilter)].column;
  viewerFilters.splice(Number(chip.dataset.removeViewerFilter), 1);
  renderViewerFilterSummary();
  void loadDatabaseViewer($("#database-view-table").value).then(() => focusViewerColumn(column));
});
$("#database-view-clear").addEventListener("click", () => {
  resetViewerFilters();
  void loadDatabaseViewer($("#database-view-table").value);
});
$("#database-view-prev").addEventListener("click", () => void loadDatabaseViewer($("#database-view-table").value, Math.max(0, viewerOffset - 50)));
$("#database-view-next").addEventListener("click", () => void loadDatabaseViewer($("#database-view-table").value, viewerOffset + 50));
$("#database-view-dialog").addEventListener("close", () => {
  if ($("#database-view-dialog").open) return;
  const closedKey = snapshot?.databases.find(row => row.id === viewerId)?.viewerKey;
  if (visible() && params().get("db") === closedKey) writeViewerLocation();
  viewerRequest++;
  viewerAbort?.abort();
  $("#database-view-grid").replaceChildren();
  resetViewerFilters();
  $("#database-view-table").replaceChildren();
  $("#database-view-table").disabled = true;
  viewerTableSelect.sync();
  $("#database-view-context").replaceChildren();
  [...root.querySelectorAll("[data-view-database]")].find(button => button.dataset.viewDatabase === viewerId)?.focus({ preventScroll: true });
  viewerId = undefined;
});
$("#close-backup").addEventListener("click", () => $("#backup-dialog").close());
$("#backup-dialog").addEventListener("close", () => {
  [...root.querySelectorAll("[data-backup-details]")].find(button => button.dataset.backupDetails === backupReturnId && Number(button.dataset.backupIndex) === backupReturnIndex)?.focus({ preventScroll: true });
  backupReturnId = undefined;
});
$("#close-copy-row").addEventListener("click", () => $("#copy-row-dialog").close());
$("#copy-row-dialog").addEventListener("close", () => {
  if (copyReturnFocus?.isConnected) copyReturnFocus.focus();
  copyReturnFocus = undefined;
});
new ResizeObserver(() => {
  $(".table-wrap").style.setProperty("--database-group-width", Math.max(0, $(".table-wrap").clientWidth - 32) + "px");
  const cell = $("#head th");
  if (cell) $(".table-wrap").style.setProperty("--database-label-width", cell.getBoundingClientRect().width + "px");
}).observe($(".table-wrap"));
$("#close").addEventListener("click", () => $("#detail").close());
$("#detail").addEventListener("close", () => {
  if ($("#detail").open) return;
  if (!snapshot?.databases.some(row => row.id === selectedId)) selectedId = undefined;
  highlightDatabase();
  if (visible()) writeLocation();
});
$("#search").addEventListener("input", () => { writeLocation(); render(); });
$("#filter").addEventListener("change", () => { writeLocation(); render(); });
$("#owner").addEventListener("change", () => { writeLocation(); render(); });
$("#sort").addEventListener("change", () => { columnControls.clearSort(); options(); writeLocation(); render(); });
$("#refresh").addEventListener("click", () => refresh(true));
$("#inventory-info").addEventListener("click", () => $("#inventory-info-dialog").showModal());
$("#close-inventory-info").addEventListener("click", () => $("#inventory-info-dialog").close());
$("#inventory-info-dialog").addEventListener("close", () => $("#inventory-info").focus());
function sync() {
  if (!visible()) {
    syncDatabaseViewer();
    if ($("#detail").open) $("#detail").close();
    if ($("#inventory-info-dialog").open) $("#inventory-info-dialog").close();
    if (observing() && !snapshot) refresh();
    return;
  }
  const state = params();
  databaseView = state.get("dbView") === "backups" ? "backups" : "overview";
  const savedColumns = [...new Set((state.get("dbColumns") || "").split(",").map(key => key === "type" ? "component" : key === "wal" ? "size" : ["backedUpBy", "lastBackup", "backupCount"].includes(key) ? "backupOverview" : key).filter(key => databaseExtraFields.includes(key)))];
  databaseExtraColumns = ["2", "3", "4", "5", "6"].includes(state.get("dbLayout")) ? savedColumns : [...new Set([...databasePresets[databaseView], ...savedColumns])];
  if (!["3", "4", "5", "6"].includes(state.get("dbLayout"))) databaseExtraColumns.sort((a, b) => databaseExtraFields.indexOf(a) - databaseExtraFields.indexOf(b));
  if (state.get("dbLayout") === "3") {
    const sizeIndex = databaseExtraColumns.indexOf("size");
    const componentIndex = databaseExtraColumns.indexOf("component");
    if (sizeIndex >= 0 && componentIndex > sizeIndex) {
      [databaseExtraColumns[sizeIndex], databaseExtraColumns[componentIndex]] = ["component", "size"];
    }
  }
  if (["3", "4"].includes(state.get("dbLayout"))) {
    const technicalColumns = ["engine"].filter(key => databaseExtraColumns.includes(key));
    databaseExtraColumns = databaseExtraColumns.filter(key => !technicalColumns.includes(key));
    const backupIndex = databaseExtraColumns.findIndex(key => ["backupOverview", "remarks"].includes(key));
    databaseExtraColumns.splice(backupIndex < 0 ? databaseExtraColumns.length : backupIndex, 0, ...technicalColumns);
  }
  current = sections[state.get("tab")] ? state.get("tab") : "apps";
  columnControls.activate(current, columnDefinitions[current]);
  columnControls.restore(state.get("columns"));
  seededLabels.delete(current);
  options();
  $("#search").value = state.get("q") || "";
  $("#filter").value = state.get("filter") || "";
  $("#owner").value = state.get("owner") || "";
  $("#sort").value = state.get("sort") || sortChoices[current][0][0];
  if (!$("#sort").selectedOptions.length) $("#sort").value = sortChoices[current][0][0];
  selectedId = state.get("entity") || undefined;
  if (state.has("dbColumns") && state.get("dbLayout") !== "6") writeLocation();
  render();
  if (snapshot && selectedId) detail(selectedId);
  else if ($("#detail").open) $("#detail").close();
  syncDatabaseViewer();
  if (!snapshot) refresh();
}
document.addEventListener("garden:viewchange", sync);
document.addEventListener("garden:cataloguefilterchange", render);
document.addEventListener("garden:ownershipchange", () => {
  for (const [key, selector] of [["category", "[data-ownership-category]"], ["subcategory", "[data-ownership-role]"]]) {
    const value = document.querySelector(selector).value;
    if (value) columnControls.state.filters[key] = [value]; else delete columnControls.state.filters[key];
  }
  render();
});
addEventListener("resize", () => {
  if (visible()) renderColumnToolbar();
});
addEventListener("hashchange", sync);
document.addEventListener("visibilitychange", sync);
options();
sync();
setInterval(() => { if (observing()) refresh(); }, 60000);
