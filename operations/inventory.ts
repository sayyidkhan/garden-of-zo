import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RouterConfig } from "../config";

const kingdom = "/home/workspace/Start/pal/kingdom-of-pal";
type Row = Record<string, any>;
export type Snapshot = { observedAt: string; services: Row[]; apps: Row[]; agents: Row[]; workflows: Row[]; databases: Row[]; dependencies: Row[]; issues: Row[]; coverage: Row };

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
  const apps = configs.flatMap(gateway => gateway.routes.filter(r => !r.websocketOnly && r.kind === "app").map(route => {
    const port = Number(new URL(route.targetOrigin).port);
    const aliases: Record<string, string> = { "gigradar-mailhub": "gr-mailhub", "runa": "runa-hermes-dashboard",
      "batam-100-site": "batam-100-staging", "stakefolio": "stakefolio-staging", "stakefolio-studio": "stakefolio-staging", "tampalidea": "stakefolio-staging", "tampalidea-studio": "stakefolio-staging",
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
    const id = "app:zo-platform";
    const gateway = configs.find(config => config.access === "private");
    apps.push({ id, name: "Garden of Zo", description: "Garden homepage, Atlas, catalogue and private inventory.",
      kind: "app", access: "private", listed: true, href: (gateway?.gatewayUrl || "") + "/#list",
      service: platform.id, status: platform.status, source: "platform deployment mapping" });
    relate(id, platform.id, "Garden platform managed service");
    for (const label of ["public-apps", "private-apps"]) {
      const proxy = service(label);
      if (proxy) relate(id, proxy.id, "Garden homepage forwarding only");
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
  } catch { issues.push({ severity: "warning", message: "Workflow registry could not be fully read." }); }
  let automationCoverage: Row = { status: "unavailable", observedAt: null };
  try {
    const snapshot = JSON.parse(await readFile(join(import.meta.dir, "automations.local.json"), "utf8"));
    const age = Date.now() - Date.parse(snapshot.observedAt);
    automationCoverage = { status: age > 86400_000 ? "stale snapshot" : "snapshot", observedAt: snapshot.observedAt,
      note: "Zo schedules are an imported snapshot; run history is not available. Refreshing this page does not refresh this source." };
    for (const entry of snapshot.automations) {
      const id = "automation:" + entry.id;
      workflows.push({ id, name: entry.name, type: "automation", status: entry.active ? "enabled" : "paused",
        trigger: entry.schedule, lastRun: { status: "unknown", lastAt: null }, source: "Zo list_automations snapshot" });
      const owner = /Orin/.test(entry.name) ? "orin" : /Bastion/.test(entry.name) ? "bastion" : /Kensho/.test(entry.name) ? "kensho" : null;
      if (owner) relate(id, "agent:" + owner, "automation title");
      if (/Zo Usage/.test(entry.name)) relate(id, "service:zo-usage", "automation title");
    }
  } catch { issues.push({ severity: "warning", message: "Zo automation snapshot is unavailable." }); }
  if (automationCoverage.status === "stale snapshot") issues.push({ severity: "warning", message: "Zo automation inventory is older than 24 hours; re-import schedules." });
  for (const app of apps) {
    const gateway = service(app.access === "private" ? "private-apps" : "public-apps");
    if (gateway) relate(app.id, gateway.id, "gateway route");
  }
  for (const s of services.filter(s => s.name.startsWith("orin-"))) relate("agent:orin", s.id, "Orin support service");
  if (service("zominai-runtime")) relate("app:zo-drive", "service:zominai-runtime", "Zo Drive runtime");
  if (service("pal-agent-registry")) agents.forEach(a => relate(a.id, "service:pal-agent-registry", "Kingdom registry membership"));
  const databases: Row[] = host.databases;
  for (const db of databases) {
    if (!db.owner) {
      if (db.path.startsWith("/root/.hermes/profiles/runa/")) db.owner = "agent:runa";
      else if (db.path.startsWith("/root/.hermes/profiles/orin/")) db.owner = "agent:orin";
      else if (db.path.startsWith("/root/.openclaw/")) db.owner = "service:openclaw-dashboard";
      else if (db.path.includes("/zo-drive-data/")) db.owner = "service:zo-drive";
      else if (db.path.includes("/zo-memories-data/")) db.owner = "service:zo-moments";
      else {
        const agent = agents.find(a => db.path.includes("/pal-agent-" + a.id.replace("-buildsmith", "") + "/"));
        if (agent) db.owner = agent.id;
      }
      if (db.owner) db.ownershipEvidence = "documented runtime location";
    }
    if (db.owner) relate(db.owner, db.id, db.ownershipEvidence);
    if (db.path.endsWith("/pal-workflow-youtuberesearch/outputs/youtube-research.sqlite")) relate("workflow:youtube-research", db.id, "workflow store");
    if (db.backup.lastAt && Date.now() / 1000 - db.backup.lastAt > 86400) db.backup.status = "old snapshot";
  }
  for (const s of services) {
    if (!["running", "stopped"].includes(s.status)) issues.push({ severity: s.status === "unknown" ? "warning" : "error", entity: s.id, message: s.name + " is " + s.status + "." });
    s.mapped = dependencies.some(d => d.to === s.id);
    if (!s.mapped) issues.push({ severity: "info", entity: s.id, message: s.name + " is discovered but has no app, agent or workflow mapping." });
  }
  const unknownOwners = databases.filter(d => !d.owner && d.category === "application").length;
  if (unknownOwners) issues.push({ severity: "warning", message: unknownOwners + " application databases need an owner mapping." });
  const unknownBackups = databases.filter(d => ["application", "agent runtime"].includes(d.category) && d.backup.status === "unknown").length;
  if (unknownBackups) issues.push({ severity: "warning", message: unknownBackups + " application / agent databases have no verified backup evidence." });
  return { observedAt, services, apps, agents, workflows, databases, dependencies, issues,
    coverage: { databases: host.coverage, automations: automationCoverage,
      services: "Live supervisor configuration and process state. Running does not prove application health.",
      agents: "Kingdom of PAL manifests; permissions and enabled flags are declarations, not runtime enforcement checks.",
      backups: "Local Runa snapshots only. No external backup or restore verification.",
      workflows: "Registered PAL workflows and imported Zo automations; last-run gaps are shown explicitly." } };
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
