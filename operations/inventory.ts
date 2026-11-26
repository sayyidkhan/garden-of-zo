import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RouterConfig } from "../config";
import { projectOwnership, ownershipLabel } from "../project-labels";

const kingdom = "/home/workspace/Start/pal/kingdom-of-pal";
const databaseOwners: Record<string, string> = {
  [join(kingdom, "state/pal-registry.sqlite3")]: "service:pal-agent-registry",
  "/home/workspace/Start/pal/pal-agent-bastion/var/bastion.db": "agent:bastion",
  "/home/workspace/Start/garden-of-zo/zo-order-tracker/zorder-data/zorder.sqlite": "service:zo-order-tracker"
};
const servicePresentation: Record<string, { name: string; description: string; project?: string; mappingEvidence?: string }> = {
  tailscale: { name: "Tailscale", description: "Shared private networking infrastructure for Garden of Zo.", project: "Garden of Zo", mappingEvidence: "Owner-confirmed shared infrastructure; project tracking only." },
  "stakefolio-staging": { name: "Stakefolio — Web", description: "Web interface for Stakefolio's ownership and governance ledger." },
  "stakefolio-ledger-data": { name: "Stakefolio — Backend", description: "API, access controls and persistence for Stakefolio's ownership and governance ledger." },
  "pal-omnigent-server": { name: "Social Media Whisperer — Coordinator", description: "Coordinates Social Media Whisperer sessions on this Zo." },
  "pal-omnigent-host": { name: "Social Media Whisperer — Worker", description: "Executes Social Media Whisperer sessions on this Zo." }
};
type Row = Record<string, any>;
export type Snapshot = { observedAt: string; services: Row[]; apps: Row[]; agents: Row[]; workflows: Row[]; databases: Row[]; dependencies: Row[]; issues: Row[]; coverage: Row };

function backupCreator(path: string): string {
  if (path.startsWith("/root/.hermes/backups/orin/")) return "Orin backup tool";
  if (path.startsWith("/root/.hermes/backups/runa/")) return "Runa backup tool";
  if (path.startsWith("/home/workspace/Data/database-backups/") ||
      path.startsWith("/home/workspace/Start/pal/pal-projects/stakefolio/stakefolio-ledger/backups/garden-databases/")) return "Garden";
  return "Not confirmed";
}

export function databaseRemarks(record: Row): string {
  if (record.remarks) return record.remarks;
  const path = record.backupOnly ? record.backupSource : record.path;
  const relative = path?.match(/^\/root\/\.hermes\/(?:profiles\/[^/]+\/)?(state\.db|projects\.db|cron\/(?:executions|notepad)\.db|shared-state\.db|kanban\.db)$/)?.[1];
  const purposes: Record<string, string> = {
    "state.db": "Conversation history and session state.",
    "projects.db": "Hermes workspace names, folders and settings; separate from Stakefolio project records.",
    "cron/executions.db": "Scheduled-task run history and outcomes.",
    "cron/notepad.db": "Notes that scheduled tasks can remember between runs; may exist even when empty.",
    "shared-state.db": "Shared chat-room coordination between Hermes profiles.",
    "kanban.db": "Hermes built-in task board shared across profiles; separate from Stakefolio."
  };
  return relative ? "Created by Hermes framework. " + purposes[relative] + " Keep the original filename." : "";
}

function databaseDisplayName(record: Row): string {
  const path = record.backupOnly ? record.backupSource : record.path;
  const names: Record<string, string> = {
    "/root/.hermes/profiles/orin/state.db": "Conversation history",
    "/root/.hermes/profiles/orin/projects.db": "Hermes workspaces",
    "/root/.hermes/profiles/orin/cron/executions.db": "Scheduled-task history",
    "/root/.hermes/profiles/orin/cron/notepad.db": "Scheduled-task notes",
    "/home/workspace/Start/pal/pal-agent-orin/workspace/karma.sqlite": "Community Karma scores",
    "/root/.hermes/profiles/orin/home/.local/share/pki/nssdb/cert9.db": "Browser certificates",
    "/root/.hermes/profiles/orin/home/.local/share/pki/nssdb/key4.db": "Browser security keys"
  };
  return names[path] || record.name;
}

export function databaseRecords(databases: Row[]): Row[] {
  const sources = databases.filter(db => db.category !== "backup").map(db => ({ ...db }));
  const groups = new Map<string, Row>();
  for (const source of sources) source.backupCopies = [];
  for (const copy of databases.filter(db => db.category === "backup")) {
    const exact = sources.find(db => db.path === copy.backupSource || db.backup?.path === copy.path);
    const candidates = sources.filter(db => copy.owner && db.owner === copy.owner && db.name === copy.name);
    const source = exact || (candidates.length === 1 ? candidates[0] : undefined);
    const key = JSON.stringify([copy.owner || copy.systemOwnership?.name || copy.path.slice(0, copy.path.lastIndexOf("/")), copy.name]);
    let record = source || groups.get(key);
    if (!record) {
      record = { ...copy, bytes: 0, walBytes: 0, backupCopies: [], backupOnly: true };
      groups.set(key, record);
    }
    record.backupCopies.push({
      id: copy.id, path: copy.path, bytes: copy.bytes, walBytes: copy.walBytes,
      modifiedAt: copy.modifiedAt, createdBy: backupCreator(copy.path),
      association: exact ? "Recorded source" : source ? "Same owner and unique database name; recovery not verified" : "Source not confirmed"
    });
    if (!source) {
      record.bytes += copy.bytes || 0;
      record.walBytes += copy.walBytes || 0;
    }
  }
  for (const source of sources) {
    if (source.backup?.path && !source.backupCopies.some((copy: Row) => copy.path === source.backup.path)) {
      source.backupCopies.push({ path: source.backup.path, createdBy: backupCreator(source.backup.path), association: "Recorded backup evidence" });
    }
  }
  return [...sources, ...groups.values()].map(record => ({
    ...record,
    displayName: databaseDisplayName(record),
    remarks: databaseRemarks(record),
    backedUpBy: [...new Set(record.backupCopies.map((copy: Row) => copy.createdBy))].join(", ") || "Not confirmed"
  }));
}

async function yaml(path: string): Promise<Row> {
  return Bun.YAML.parse(await readFile(path, "utf8")) as Row;
}

export async function discoverHost(): Promise<Row> {
  const child = Bun.spawn(["python3", join(import.meta.dir, "discover.py")], { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => child.kill(), 30_000);
  try {
    const [output, , code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    if (code !== 0) throw new Error("Host inventory could not be collected.");
    return JSON.parse(output);
  } finally { clearTimeout(timer); }
}

export async function probeHttp(url: string, request = fetch) {
  let response = await request(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(2500) });
  if ([404, 405, 501].includes(response.status)) {
    await response.body?.cancel();
    response = await request(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(2500) });
  }
  await response.body?.cancel();
  return response.status;
}

export async function collectInventory(configs: RouterConfig[], discover = discoverHost): Promise<Snapshot> {
  const host = await discover();
  const observedAt = new Date().toISOString();
  const services: Row[] = host.services;
  const issues: Row[] = host.issues.map((message: string) => ({ severity: "warning", message }));
  const dependencies: Row[] = [];
  const relate = (from: string, to: string, evidence: string) => {
    if (!dependencies.some(d => d.from === from && d.to === to)) dependencies.push({ from, to, evidence });
  };
  const service = (name: string) => services.find(s => s.name === name);
  const apps = configs.flatMap(gateway => gateway.routes.filter(r => r.listed !== false && !r.websocketOnly && r.kind === "app").map(route => {
    const port = Number(new URL(route.targetOrigin).port);
    const aliases: Record<string, string> = { "gigradar-mailhub": "gr-mailhub", "runa": "runa-hermes-dashboard",
      "batam-100-site": "batam-100-staging", "stakefolio": "stakefolio-staging", "stakefolio-studio": "stakefolio-staging",
      "shouldijoin": "shouldijoin-staging", "ideas-bank": "ideas-bank-review" };
    const match = service(aliases[route.label] || route.label) || services.find(s => s.ports.includes(port));
    const id = "app:" + route.label;
    if (match) relate(id, match.id, "route label / configured port");
    else issues.push({ severity: "warning", entity: id, message: route.title + " has no matching managed service." });
    return { id, name: route.title, description: route.description, kind: route.kind,
      access: gateway.access, listed: route.listed !== false, href: gateway.gatewayUrl + route.prefix + (route.entryPath || ""),
      service: match?.id || null, status: match?.status || "unmapped", source: gateway.access + ".routes.json" };
  }));
  await Promise.all(apps.map(async app => {
    const route = configs.flatMap(c => c.routes).find(r => "app:" + r.label === app.id)!;
    const target = new URL(route.targetOrigin);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) { app.httpStatus = "not probed"; return; }
    const began = Date.now();
    try {
      const code = await probeHttp(route.targetOrigin + (route.stripPrefix ? route.entryPath || "/" : route.prefix + (route.entryPath || "")));
      app.httpStatus = "HTTP " + code;
      app.responseMs = Date.now() - began;
      if (code >= 500) issues.push({ severity: "error", entity: app.id, message: app.name + " responds with HTTP " + code + "." });
    } catch {
      app.httpStatus = "unreachable";
      issues.push({ severity: "error", entity: app.id, message: app.name + " did not respond to a local HTTP probe." });
    }
  }));
  const platform = service("zo-platform");
  if (platform) {
    for (const label of ["public-apps", "private-apps"]) {
      const proxy = service(label);
      if (proxy) relate(proxy.id, platform.id, "Garden homepage forwarding only");
    }
  }
  const agents: Row[] = [];
  try {
    const registry = (await yaml(join(kingdom, "os/registry/agents.yaml"))).spec;
    for (const entry of [...registry.agents, ...registry.extensions]) {
      const manifest = await yaml(join(kingdom, entry.manifest));
      const spec = manifest.spec;
      const runtime = spec.runtime || {};
      const aliases: Record<string, string[]> = { orin: ["orin-hermes-dashboard", "orin-hermes-gateway"], runa: ["runa-hermes-dashboard", "runa-hermes-gateway"],
        "riven-buildsmith": ["riven-proj-tracker"], kensho: ["kensho-reviewer"] };
      const names = aliases[entry.id] || spec.health?.dependencies || (runtime.serviceLabel ? [runtime.serviceLabel] : []);
      const linked = names.map(service).filter(Boolean) as Row[];
      const id = "agent:" + entry.id;
      linked.forEach(s => relate(id, s.id, "agent runtime mapping"));
      if (runtime.serviceLabel && !service(runtime.serviceLabel)) issues.push({ severity: "warning", entity: id,
        message: manifest.metadata.displayName + " declares service " + runtime.serviceLabel + "; verify its runtime mapping." });
      const destination = configs.flatMap(c => c.routes.map(r => ({ ...r, gateway: c.gatewayUrl }))).find(r => r.kind === "agent" && r.label === entry.id);
      agents.push({ id, href: destination ? destination.gateway + destination.prefix + (destination.entryPath || "") : null, name: manifest.metadata.displayName, description: manifest.metadata.description,
        role: spec.role, enabled: entry.enabled, runtime: runtime.harness || runtime.adapter || spec.implementation,
        declaredStatus: runtime.status, status: linked.length ? linked.every(s => s.status === "running") ? "running" : "degraded" : "not observed",
        services: linked.map(s => s.id), permissions: spec.permissions || [], source: join(kingdom, entry.manifest) });
    }
  } catch { issues.push({ severity: "warning", message: "Agent registry could not be fully read." }); }
  for (const gateway of configs) {
    for (const route of gateway.routes.filter(r => r.kind === "agent" && !r.websocketOnly)) {
      if (agents.some(a => a.id === "agent:" + route.label)) continue;
      const match = service(route.label);
      const id = "agent:" + route.label;
      if (match) relate(id, match.id, "agent catalogue route");
      agents.push({ id, name: route.title, description: route.description, role: route.category, enabled: true,
        runtime: "catalogue destination", declaredStatus: "outside PAL registry", status: match?.status || "not observed",
        services: match ? [match.id] : [], permissions: [], href: gateway.gatewayUrl + route.prefix, source: gateway.access + ".routes.json" });
    }
  }
  const workflows: Row[] = [];
  try {
    const registry = (await yaml(join(kingdom, "os/registry/workflows.yaml"))).spec.workflows;
    for (const entry of registry) {
      const definition = await yaml(join(kingdom, entry.definition));
      const id = "workflow:" + entry.id;
      const owner = "agent:" + entry.owner;
      relate(id, owner, "workflow registry owner");
      for (const agent of entry.availableTo || []) relate(id, "agent:" + agent, "available to agent");
      workflows.push({ id, name: entry.displayName, description: entry.description, owner, type: "registered",
        status: entry.availability, trigger: definition.spec?.trigger?.type || "on demand",
        lastRun: entry.id === "youtube-research" ? host.youtubeEvidence : { status: "unknown", lastAt: null },
        source: join(kingdom, entry.definition) });
    }
    if (workflows.some(w => w.id === "workflow:youtube-research")) {
      for (const name of ["pal-youtube-research", "kasm-browser"]) if (service(name)) relate("workflow:youtube-research", "service:" + name, "documented workflow implementation");
    }
    if (workflows.some(w => w.id === "workflow:instagram-media-research")) {
      for (const name of ["pal-omnigent-server", "pal-omnigent-host"]) {
        const runtime = service(name);
        if (runtime) relate("workflow:instagram-media-research", runtime.id, "Social Media Whisperer documented runtime");
      }
    }
  } catch { issues.push({ severity: "warning", message: "Workflow registry could not be fully read." }); }
  let automationCoverage: Row = { status: "unavailable", observedAt: null };
  try {
    const snapshot = JSON.parse(await readFile(join(import.meta.dir, "automations.local.json"), "utf8"));
    const age = Date.now() - Date.parse(snapshot.observedAt);
    automationCoverage = { status: age > 86400_000 ? "stale snapshot" : "snapshot", observedAt: snapshot.observedAt,
      note: "Zo Scheduled Tasks is a saved list. Use Update task list in Inventory info to fetch current schedules. Task run history is unavailable; Refresh only reloads Garden’s inventory." };
    for (const entry of snapshot.automations) {
      const id = "automation:" + entry.id;
      workflows.push({ id, name: entry.name, type: "automation", status: entry.active ? "enabled" : "paused",
        trigger: entry.schedule, lastRun: { status: "unknown", lastAt: null }, source: "Zo Scheduled Tasks (saved list)" });
      const owner = /Orin/.test(entry.name) ? "orin" : /Bastion/.test(entry.name) ? "bastion" : /Kensho/.test(entry.name) ? "kensho" : null;
      if (owner) relate(id, "agent:" + owner, "automation title");
      if (/Zo Usage/.test(entry.name)) relate(id, "service:zo-usage", "automation title");
    }
  } catch { automationCoverage = { status: "unavailable", observedAt: null }; }
  if (["unavailable", "stale snapshot"].includes(automationCoverage.status)) issues.push({
    severity: "warning", kind: "scheduled-task-list", entity: "service:zo-platform",
    message: automationCoverage.status === "unavailable" ? "Zo Scheduled Tasks: Garden’s saved list is unavailable." : "Zo Scheduled Tasks: Garden’s saved list needs updating.",
    observedAt: automationCoverage.observedAt,
    reason: "Garden’s saved list of task names, schedules and enabled states needs updating. This warning does not mean your tasks have failed; task run results are not available here.",
    nextStep: "Click Update task list to get the latest schedules from Zo. Garden will update this list and clear the warning. Your tasks and their schedules stay unchanged."
  });
  for (const app of apps) {
    const gateway = service(app.access === "private" ? "private-apps" : "public-apps");
    if (gateway) relate(app.id, gateway.id, "gateway route");
    const ledger = service("stakefolio-ledger-data");
    if (ledger && ["app:stakefolio", "app:stakefolio-studio"].includes(app.id)) {
      relate(app.id, ledger.id, "Stakefolio documented backend");
    }
  }
  const stakefolioWeb = service("stakefolio-staging");
  const stakefolioBackend = service("stakefolio-ledger-data");
  if (stakefolioWeb && stakefolioBackend) relate(stakefolioWeb.id, stakefolioBackend.id, "Stakefolio web uses backend API");
  for (const s of services.filter(s => s.name.startsWith("orin-"))) relate("agent:orin", s.id, "Orin support service");
  if (service("zominai-runtime")) relate("app:zo-drive", "service:zominai-runtime", "Zo Drive runtime");
  if (service("pal-agent-registry")) agents.forEach(a => relate(a.id, "service:pal-agent-registry", "Kingdom registry membership"));
  const databases: Row[] = host.databases;
  for (const db of databases) {
    if (!db.owner) {
      if (databaseOwners[db.path]) db.owner = databaseOwners[db.path];
      else if (db.path.startsWith("/root/.hermes/profiles/runa/")) db.owner = "agent:runa";
      else if (db.path.startsWith("/root/.hermes/profiles/orin/")) db.owner = "agent:orin";
      else if (db.path.startsWith("/root/.hermes/backups/orin/")) db.owner = "agent:orin";
      else if (db.path.startsWith("/root/.hermes/backups/runa/")) db.owner = "agent:runa";
      else if (db.path.startsWith("/root/.openclaw/")) db.owner = "service:openclaw-dashboard";
      else if (db.path.includes("/zo-drive-data/")) db.owner = "service:zo-drive";
      else if (db.path.includes("/zo-memories-data/")) db.owner = "service:zo-moments";
      else {
        const agent = agents.find(a => db.path.includes("/pal-agent-" + a.id.replace("-buildsmith", "") + "/"));
        if (agent) db.owner = agent.id;
      }
      if (db.owner) db.ownershipEvidence = "documented runtime location";
    }
    if (db.owner === "service:orin-hermes-dashboard") {
      db.component = "Agent Dashboard";
      db.componentEntity = db.owner;
      relate(db.componentEntity, db.id, db.ownershipEvidence);
      db.owner = "agent:orin";
      db.ownershipEvidence = "Orin dashboard belongs to Orin Forgekeeper";
    } else if (db.owner === "agent:orin" && db.path.startsWith("/root/.hermes/profiles/orin/")) {
      db.component = "Agent Runtime";
    }
    if (db.owner) relate(db.owner, db.id, db.ownershipEvidence);
    if (db.path.endsWith("/pal-workflow-youtuberesearch/outputs/youtube-research.sqlite")) relate("workflow:youtube-research", db.id, "workflow store");
    if (db.backup.lastAt && Date.now() / 1000 - db.backup.lastAt > 86400) db.backup.status = "old snapshot";
  }
  for (const db of databases.filter(db => !db.owner)) {
    const name = db.path.startsWith("/root/.codex/") ? "Codex" : db.path.startsWith("/home/.z/workspaces/") ? "Zo temporary workspace" :
      ["/root/.hermes/shared-state.db", "/root/.hermes/kanban.db", "/root/.hermes/state.db"].includes(db.path) ? "Hermes shared runtime" : null;
    if (name) {
      db.systemOwnership = { category: "Host system", subcategory: name === "Zo temporary workspace" ? "Temporary files" : "Runtime", name };
      db.ownershipEvidence = "host runtime location; outside project ownership labels";
    }
  }
  for (const db of databases.filter(db => db.category === "backup" && !db.owner && db.backupSource)) {
    const source = databases.find(source => source.path === db.backupSource && source.category !== "backup");
    if (source?.owner || source?.systemOwnership) {
      db.owner = source.owner;
      db.systemOwnership = source.systemOwnership;
      db.ownershipEvidence = "checksum-verified backup of " + source.path;
      if (db.owner) relate(db.owner, db.id, db.ownershipEvidence);
    }
  }
  for (const db of databases.filter(db => db.category === "backup" && db.backupSource)) {
    const source = databases.find(source => source.path === db.backupSource && source.category !== "backup");
    if (source?.component) {
      db.component = source.component;
      db.componentEntity = source.componentEntity;
    }
  }
  for (const s of services) {
    if (servicePresentation[s.name]) {
      s.serviceName = s.name;
      Object.assign(s, servicePresentation[s.name]);
    }
    if (!["running", "stopped"].includes(s.status)) issues.push({ severity: s.status === "unknown" ? "warning" : "error", entity: s.id, message: s.name + " is " + s.status + "." });
    s.mapped = dependencies.some(d => d.to === s.id) || Boolean(servicePresentation[s.serviceName || s.name]?.project);
    if (!s.mapped) issues.push({ severity: "info", entity: s.id, message: s.name + " is discovered but has no project, app, agent or workflow mapping." });
  }
  const unknownOwners = databases.filter(d => !d.owner && d.category === "application").length;
  for (const row of [...apps, ...agents, ...services, ...workflows]) {
    const ownership = projectOwnership(row.id.slice(row.id.indexOf(":") + 1));
    row.ownership = ownership || null;
    row.ownershipLabel = ownershipLabel(ownership);
  }
  for (const db of databases) {
    const owner = [...agents, ...services, ...apps, ...workflows].find(row => row.id === db.owner);
    db.ownership = owner?.ownership || (db.owner ? projectOwnership(db.owner.slice(db.owner.indexOf(":") + 1)) : null);
    db.ownershipLabel = db.systemOwnership ? db.systemOwnership.category + " · " + db.systemOwnership.subcategory : ownershipLabel(db.ownership);
    db.projectName = db.owner === "service:openclaw-dashboard" ? "PAL OpenClaw (retained files)" : owner?.name || db.systemOwnership?.name || "Ownership pending";
  }
  if (unknownOwners) issues.push({
    severity: "warning", message: unknownOwners + " application databases need an owner mapping.",
    affected: databases.filter(d => !d.owner && d.category === "application").map(d => d.id),
    reason: "Garden found these database files but has no recorded project owner.",
    nextStep: "Check the file location against the project's configuration, then record its confirmed owner. A missing owner does not mean the database is broken."
  });
  const unknownBackups = databases.filter(d => ["application", "agent runtime"].includes(d.category) && d.backup.status === "unknown");
  if (unknownBackups.length) issues.push({
    severity: "warning", message: unknownBackups.length + " database files have unconfirmed backup status.",
    affected: unknownBackups.map(d => d.id),
    reason: "Garden could not verify a saved database copy for the files below. A recognised copy must exist and match its recorded checksum. This does not prove their backups are missing.",
    nextStep: "For each project, check its backup location, latest successful backup and whether a copy can be restored. If backups exist, add their evidence to Garden; if not, arrange backups for data that needs keeping.",
    scopeNote: "This is a count of database files, including supporting runtime files; it is not a count of active apps. Local database copies do not establish protection outside this machine or recovery of attachments, logins and configuration."
  });
  const oldBackups = databases.filter(d => ["application", "agent runtime"].includes(d.category) && d.backup.status === "old snapshot");
  if (oldBackups.length) issues.push({
    severity: "warning", message: oldBackups.length + " database backups are over 24 hours old.",
    affected: oldBackups.map(d => d.id),
    reason: "Saved copies exist, but changes since the last copy are not covered.",
    nextStep: "Use the app or agent backup procedure where available, then update Garden with its evidence. Only explicitly refresh Garden-created copies using Garden's database backup procedure. Regular automatic backups are not configured by this procedure.",
    scopeNote: "Local copies protect against accidental changes; a separate private destination is needed for host-loss recovery."
  });
  try {
    const text = await readFile(join(import.meta.dir, "database-remarks.local.json"), "utf8");
    if (text.length > 65536) throw new Error("Remarks file is too large");
    const remarks = JSON.parse(text);
    if (!remarks || Array.isArray(remarks) || typeof remarks !== "object" ||
        Object.values(remarks).some(value => typeof value !== "string" || value.length > 2000)) {
      throw new Error("Invalid database remarks");
    }
    for (const db of databases) {
      const path = db.category === "backup" ? db.backupSource : db.path;
      if (Object.hasOwn(remarks, path)) db.remarks = remarks[path];
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      issues.push({ severity: "warning", message: "Saved database remarks could not be read. Check operations/database-remarks.local.json; framework descriptions are still shown." });
    }
  }
  const records = databaseRecords(databases);
  const recordIds = new Map(databases.filter(db => db.category === "backup").map(db => [
    db.id, records.find(record => record.backupCopies?.some((copy: Row) => copy.id === db.id))?.id || db.id
  ]));
  const recordDependencies = dependencies.map(edge => ({ ...edge, to: recordIds.get(edge.to) || edge.to, from: recordIds.get(edge.from) || edge.from }));
  return { observedAt, services, apps, agents, workflows, databases: records,
    dependencies: recordDependencies.filter((edge, i) => edge.from !== edge.to && recordDependencies.findIndex(other => other.from === edge.from && other.to === edge.to) === i), issues,
    coverage: { databases: host.coverage, automations: automationCoverage,
      apps: "Listed catalogue apps, matching the public Apps filter. Compatibility aliases and hidden tools are excluded; their managed services remain under Services. Garden itself is represented by zo-platform under Services.",
      services: "Live supervisor configuration and process state. Running does not prove application health.",
      agents: "Kingdom of PAL manifests; permissions and enabled flags are declarations, not runtime enforcement checks.",
      backups: "Private local database snapshots: recorded SHA-256 checksums are rechecked during discovery. Garden snapshots have passed isolated SQLite restore integrity and table-count checks. Older Runa manifests indicate copies only. No off-host protection or full application recovery is established.",
      workflows: "Registered PAL workflows and Zo Scheduled Tasks. Task run history is shown only where available." } };
}

export function createSnapshotCache(collect: () => Promise<Snapshot>, ttl = 60_000) {
  let cached: Snapshot | undefined;
  let pending: Promise<Snapshot> | undefined;
  let lastAt = 0;
  const refresh = () => {
    pending ??= collect().then(snapshot => { cached = snapshot; lastAt = Date.now(); return snapshot; }).finally(() => { pending = undefined; });
    return pending;
  };
  return async (fresh = false) => {
    if (!fresh && cached && Date.now() - lastAt < ttl) return { ...cached, stale: false };
    if (cached && !fresh) {
      void refresh().catch(() => {});
      return { ...cached, stale: true, collectionError: "A new observation is being collected; showing the last completed one." };
    }
    try { return { ...await refresh(), stale: false }; }
    catch {
      if (cached) return { ...cached, stale: true, collectionError: "Refresh failed; showing the last successful observation." };
      throw new Error("Inventory unavailable; no successful observation yet.");
    }
  };
}
