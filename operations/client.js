const root = document.querySelector("#inventory");
const $ = selector => root.querySelector(selector);
const catalogue = JSON.parse(document.querySelector("#atlas-data").textContent).realms;
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
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const sortChoices = {
  apps: [["name_asc", "Name A–Z"], ["name_desc", "Name Z–A"], ["access", "Access"], ["status", "Process state"]],
  agents: [["name_asc", "Name A–Z"], ["name_desc", "Name Z–A"], ["status", "Process state"], ["runtime", "Runtime"]],
  services: [["name_asc", "Name A–Z"], ["name_desc", "Name Z–A"], ["status", "Process state"], ["mapping", "Mapping"]],
  workflows: [["name_asc", "Name A–Z"], ["name_desc", "Name Z–A"], ["last_desc", "Last run: newest"], ["last_asc", "Last run: oldest"], ["status", "Declared state"]],
  databases: [["name_asc", "Name A–Z"], ["name_desc", "Name Z–A"], ["size_desc", "Size: largest"], ["size_asc", "Size: smallest"], ["owner", "Owner A–Z"], ["backup", "Backup evidence"]],
  issues: [["severity", "Severity"], ["name_asc", "Finding A–Z"], ["name_desc", "Finding Z–A"]]
};
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const when = value => value ? new Date(typeof value === "number" ? value * 1000 : value).toLocaleString("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" }) : "Unknown";
const bytes = value => value >= 1073741824 ? (value / 1073741824).toFixed(2) + " GB" : value >= 1048576 ? (value / 1048576).toFixed(1) + " MB" : Math.round(value / 1024) + " KB";
const all = () => Object.keys(sections).filter(k => k !== "issues").flatMap(k => snapshot?.[k] || []);
const entity = id => all().find(row => row.id === id);
const visible = () => location.hash.split("?")[0] === "#list" && !document.hidden;
let selectedId;
const params = () => new URLSearchParams(location.hash.split("?")[1] || "");
function writeLocation() {
  const state = new URLSearchParams();
  if (current !== "apps") state.set("tab", current);
  if ($("#search").value) state.set("q", $("#search").value);
  if ($("#filter").value) state.set("filter", $("#filter").value);
  if (current === "databases" && $("#owner").value) state.set("owner", $("#owner").value);
  if ($("#sort").value !== sortChoices[current][0][0]) state.set("sort", $("#sort").value);
  if (selectedId) state.set("entity", selectedId);
  history.replaceState(null, "", location.pathname + location.search + "#list" + (state.size ? "?" + state : ""));
}
const destination = row => catalogue.find(r => (r.kind === "agent" ? "agent:" : "app:") + r.id === row.id)?.href || row.href;
const openLink = row => { const href = destination(row); return href && /^(https:\/\/|\/(?!\/))/.test(href) ? '<a class="open-link" href="' + escape(href) + '">Open realm ↗</a>' : ""; };
const name = id => entity(id)?.name || id || "Unmapped";
const link = (id, title) => id ? '<button class="entity" data-entity="' + escape(id) + '">' + escape(title || name(id)) + "</button>" : "Unmapped";
const status = value => {
  const tone = ["fatal", "error", "backoff", "exited", "degraded"].includes(value) ? "bad" : value === "running" ? "good" : ["unknown", "unmapped", "warning", "old snapshot"].includes(value) ? "warn" : "";
  return '<span class="badge ' + tone + '">' + escape(value || "unknown") + "</span>";
};
const backupEvidence = row => {
  if (row.category === "backup") return '<span class="backup-evidence">Not assessed</span>';
  const state = row.backup?.status || "unknown";
  const label = state === "snapshot found" ? "Local snapshot" : state === "old snapshot" ? "Older snapshot" : state === "unknown" ? "Not verified" : state;
  const date = row.backup?.lastAt ? '<small>' + when(row.backup.lastAt) + '</small>' : '';
  return '<span class="backup-evidence' + (state === "snapshot found" ? ' is-found' : state === "old snapshot" ? ' is-old' : '') + '" title="' + escape(state) + '">' + escape(label) + '</span>' + date;
};
const definitions = {
  apps: ["App / destination", "Access", "Process state", "Service"],
  agents: ["Agent", "Role / runtime", "Process observation", "Registry state"],
  services: ["Service", "Process state", "Working directory", "Inventory mapping"],
  workflows: ["Workflow", "Trigger", "Declared state", "Last run evidence"],
  databases: ["Database", "Owner", "Size + WAL", "Backup evidence"],
  issues: ["Severity", "Finding", "Entity"]
};
const option = (value, label) => '<option value="' + escape(value) + '">' + escape(label) + '</option>';
const unique = values => [...new Set(values.filter(v => v !== null && v !== undefined && v !== ""))].sort(collator.compare);
function options() {
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
  const owners = current === "databases" ? unique(rows.map(r => r.owner || "__unmapped__")).sort((a, b) => collator.compare(a === "__unmapped__" ? "Unmapped owner" : name(a), b === "__unmapped__" ? "Unmapped owner" : name(b))) : [];
  $("#owner").innerHTML = option("", "All owners") + owners.map(id => option(id, id === "__unmapped__" ? "Unmapped owner" : name(id)));
  $("#owner").value = previous.owner;
  if (!$("#owner").selectedOptions.length) $("#owner").value = "";
  $("#sort").innerHTML = sortChoices[current].map(([value, label]) => option(value, label)).join("");
  $("#sort").value = previous.sort;
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
  const order = $("#sort").value;
  const text = (a, b) => collator.compare(String(a ?? ""), String(b ?? ""));
  const lastAt = row => { const value = row.lastRun?.lastAt; return typeof value === "number" ? value * 1000 : Date.parse(value || "") || 0; };
  return rows.sort((a, b) => {
    let result = 0;
    if (order === "name_desc") result = text(b.name || b.message, a.name || a.message);
    else if (order === "size_desc") result = (b.bytes + b.walBytes) - (a.bytes + a.walBytes);
    else if (order === "size_asc") result = (a.bytes + a.walBytes) - (b.bytes + b.walBytes);
    else if (order === "last_desc" || order === "last_asc") result = !lastAt(a) ? 1 : !lastAt(b) ? -1 : order === "last_desc" ? lastAt(b) - lastAt(a) : lastAt(a) - lastAt(b);
    else if (order === "severity") result = ({ error: 0, warning: 1, info: 2 }[a.severity] ?? 3) - ({ error: 0, warning: 1, info: 2 }[b.severity] ?? 3);
    else if (order === "mapping") result = Number(a.mapped) - Number(b.mapped);
    else if (order === "owner") result = text(a.owner ? name(a.owner) : "Unmapped", b.owner ? name(b.owner) : "Unmapped");
    else if (order === "backup") result = text(a.backup?.status, b.backup?.status);
    else if (order === "access" || order === "status" || order === "runtime") result = text(a[order], b[order]);
    else result = text(a.name || a.message, b.name || b.message);
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
  $("#head").hidden = realms;
  const query = $("#search").value.trim().toLowerCase();
  const filter = $("#filter").value;
  const owner = $("#owner").value;
  const rows = sortRows(snapshot[current].filter(row => (!query || (JSON.stringify(row) + name(row.owner)).toLowerCase().includes(query)) &&
    matchesFilter(row, filter) && (current !== "databases" || !owner || (row.owner || "__unmapped__") === owner)));
  $("#head").innerHTML = "<tr>" + definitions[current].map(v => "<th scope='col'>" + v + "</th>").join("") + "</tr>";
  $("#rows").innerHTML = rows.map(row => {
    if (realms) {
      const realm = catalogue.find(r => (r.kind === "agent" ? "agent:" : "app:") + r.id === row.id);
      const art = realm ? '<img src="' + escape(realm.art) + '" alt="" loading="lazy" decoding="async">' : glyph(current);
      const category = realm?.category || (current === "agents" ? row.role : "Private tool");
      const access = current === "apps" ? (row.access === "private" ? "Owner access" : "Public access") : (row.runtime || "Agent");
      const byline = realm ? 'By <a href="' + escape(realm.author.profileUrl) + '" target="_blank" rel="noreferrer">' + escape(realm.author.name) + '</a> · ' + escape(access) : escape(access);
      const observation = current === "apps" ? '<span class="realm-observation">HTTP check <strong>' + escape(row.httpStatus || "Unknown") + '</strong>' + (row.listed ? '' : ' · Private tool') + '</span>' : '<span class="realm-observation">' + escape(row.runtime || "Runtime unknown") + '</span>';
      return '<tr><td colspan="4" class="realm-cell"><article class="inventory-realm"><div class="inventory-art" aria-hidden="true">' + art + '</div><div class="realm-body"><div class="realm-heading"><span class="realm-category">' + escape(category) + '</span>' + status(row.status) + '</div><h3 class="realm-name">' + link(row.id) + '</h3><p class="realm-description">' + escape(row.description) + '</p><span class="realm-byline">' + byline + '</span></div><div class="realm-foot">' + observation + '<div class="realm-actions"><button class="realm-detail" data-entity="' + escape(row.id) + '" aria-label="Details for ' + escape(row.name) + '">Details <span aria-hidden="true">→</span></button>' + openLink(row) + '</div></div></article></td></tr>';
    }
    let cells;
    if (current === "services") cells = [link(row.id) + "<small>" + (row.pid ? "PID " + row.pid : "No observed PID") + "</small>", status(row.status), "<small>" + escape(row.workdir) + "</small>", row.mapped ? "Linked" : status("unmapped")];
    if (current === "workflows") cells = [link(row.id) + "<small>" + escape(row.type) + "</small>", "<small>" + escape(row.trigger) + "</small>", status(row.status), escape(row.lastRun?.status) + "<small>" + when(row.lastRun?.lastAt) + "</small>"];
    if (current === "databases") {
      const directory = row.path.slice(0, -row.name.length).replace(/\/$/, "");
      const segments = directory.split("/").filter(Boolean);
      const location = (segments.length > 4 ? "…/" : "/") + segments.slice(-4).join("/");
      cells = [
        '<div class="database-identity"><button class="entity database-name" data-entity="' + escape(row.id) + '" title="' + escape(row.name) + '">' + escape(row.name) + '</button><div class="database-meta"><span class="database-category">' + escape(row.category) + '</span><span class="database-location" title="' + escape(row.path) + '">' + escape(location) + '</span></div></div>',
        '<span class="database-owner">' + link(row.owner) + '</span>',
        '<span class="database-storage"><strong>' + bytes(row.bytes + row.walBytes) + '</strong><small>' + escape(row.engine) + (row.walBytes ? ' · WAL ' + bytes(row.walBytes) : '') + '</small></span>',
        backupEvidence(row)
      ];
    }
    if (current === "issues") cells = [status(row.severity), escape(row.message), row.entity ? link(row.entity) : "Inventory coverage"];
    return "<tr>" + cells.map((cell, i) => '<td data-label="' + escape(definitions[current][i]) + '">' + cell + "</td>").join("") + "</tr>";
  }).join("") || '<tr><td colspan="4" class="empty">No matching records. Try another search or filter.</td></tr>';
  const total = current === "databases" ? " · " + bytes(rows.reduce((sum, r) => sum + r.bytes + r.walBytes, 0)) + " including WAL" : "";
  const scheduleNote = current === "workflows" ? " · Zo schedules: snapshot from " + when(snapshot.coverage.automations.observedAt) + " SGT; run history unavailable." : "";
  $("#caption").textContent = rows.length + " of " + snapshot[current].length + " records" + total + (current === "services" || current === "agents" || current === "apps" ? " · Running confirms a process exists; application health is not verified." : "") + scheduleNote;
}
function detail(id) {
  const row = entity(id);
  if (!row) return;
  selectedId = id;
  const section = Object.keys(sections).find(k => k !== "issues" && snapshot[k].some(r => r.id === id));
  if (section && section !== current) { current = section; options(); render(); }
  writeLocation();
  $("#detail-title").textContent = row.name;
  const fields = Object.entries(row).filter(([key]) => !["id", "name"].includes(key));
  $("#detail-body").innerHTML = "<dl>" + fields.map(([key,value]) => "<dt>" + escape(key.replace(/([A-Z])/g, " $1")) + "</dt><dd>" + (key === "href" && /^https:\/\//.test(value) ? '<a target="_blank" rel="noreferrer" href="' + escape(value) + '">Open destination ↗</a>' : escape(typeof value === "object" ? JSON.stringify(value, null, 2) : value)) + "</dd>").join("") + "</dl>";
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
  $("#refresh").textContent = "Observing…";
  try {
    const response = await fetch("/operations/api/inventory" + (fresh ? "?fresh=1" : ""), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error("Inventory request failed (" + response.status + ").");
    snapshot = await response.json();
    $("#updated").textContent = "Observed " + when(snapshot.observedAt) + " SGT" + (snapshot.stale ? " · STALE" : "");
    $("#notice").hidden = false;
    const failures = snapshot.issues.filter(i => i.severity === "error").length;
    const gaps = snapshot.issues.filter(i => i.severity === "warning").length;
    $("#notice").innerHTML = '<span>' + escape(snapshot.collectionError || failures + (failures === 1 ? ' failure' : ' failures') + ' · ' + gaps + ' evidence gaps in your garden') + '</span><button data-tab="issues">Review findings ↗</button>';
    $("#notice").hidden = !snapshot.collectionError && !failures && !gaps;
    $("#coverage").innerHTML = Object.entries(snapshot.coverage).map(([key,value]) => "<p><strong>" + escape(key) + "</strong><br>" + escape(typeof value === "object" ? JSON.stringify(value, null, 2) : value) + "</p>").join("");
    const state = params();
    options();
    $("#filter").value = state.get("filter") || "";
    $("#owner").value = state.get("owner") || "";
    $("#sort").value = state.get("sort") || sortChoices[current][0][0];
    if (!$("#sort").selectedOptions.length) $("#sort").value = sortChoices[current][0][0];
    render();
    if (visible() && params().get("entity")) detail(params().get("entity"));
    if (snapshot.stale && visible() && staleRetries < 3) {
      staleRetries++;
      setTimeout(() => { if (visible()) void refresh(); }, 2500);
    } else if (!snapshot.stale) staleRetries = 0;
  } catch (error) {
    $("#notice").hidden = false;
    $("#notice").textContent = error.message + (snapshot ? " Showing the previous observation." : " No inventory is available yet.");
  } finally { busy = false; $("#refresh").disabled = false; $("#refresh").textContent = "Refresh"; }
}
root.addEventListener("click", event => {
  const tab = event.target.closest("[data-tab]");
  if (tab) select(tab.dataset.tab);
  const target = event.target.closest("[data-entity]");
  if (target) detail(target.dataset.entity);
});
$("#close").addEventListener("click", () => $("#detail").close());
$("#detail").addEventListener("close", () => { selectedId = undefined; if (visible()) writeLocation(); });
$("#search").addEventListener("input", () => { writeLocation(); render(); });
$("#filter").addEventListener("change", () => { writeLocation(); render(); });
$("#owner").addEventListener("change", () => { writeLocation(); render(); });
$("#sort").addEventListener("change", () => { writeLocation(); render(); });
$("#refresh").addEventListener("click", () => refresh(true));
function sync() {
  if (!visible()) { if ($("#detail").open) $("#detail").close(); return; }
  const state = params();
  current = sections[state.get("tab")] ? state.get("tab") : "apps";
  options();
  $("#search").value = state.get("q") || "";
  $("#filter").value = state.get("filter") || "";
  $("#owner").value = state.get("owner") || "";
  $("#sort").value = state.get("sort") || sortChoices[current][0][0];
  if (!$("#sort").selectedOptions.length) $("#sort").value = sortChoices[current][0][0];
  selectedId = state.get("entity") || undefined;
  render();
  if (snapshot && selectedId) detail(selectedId);
  else if ($("#detail").open) $("#detail").close();
  if (!snapshot) refresh();
}
document.addEventListener("garden:viewchange", sync);
addEventListener("hashchange", sync);
document.addEventListener("visibilitychange", sync);
options();
sync();
setInterval(() => { if (visible()) refresh(); }, 60000);
