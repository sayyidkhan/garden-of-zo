import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createHandler, loadConfig, loadCatalogConfigs, renderIndex } from "./server";
import { collectInventory, createSnapshotCache } from "./operations/inventory";

const publicFile = join(import.meta.dir, "../zo-router/public.routes.json");
const privateFile = join(import.meta.dir, "../zo-router/private.routes.json");

describe("private oversight boundary", () => {
  test("public gateway rejects the page, script and inventory even with a private Host header", async () => {
    const handler = createHandler(publicFile);
    for (const path of ["/operations", "/operations/", "/operations/client.js", "/operations/api/inventory", "/operations/not-found"]) {
      const response = await handler(new Request("http://localhost" + path, { headers: { host: "private-apps-sayyidkhan.zo.computer" } }));
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain("services");
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
  });
  test("legacy page redirects to the unified list and write methods are blocked", async () => {
    const handler = createHandler(privateFile);
    const page = await handler(new Request("http://localhost/operations/"));
    expect(page.status).toBe(302);
    expect(page.headers.get("location")).toBe("/?garden-list=1");
    const home = await handler(new Request("http://localhost/"));
    expect(await home.text()).toContain('id="inventory"');
    expect(page.headers.get("content-security-policy")).toContain("connect-src 'self'");
    for (const method of ["POST", "PUT", "DELETE"]) {
      const response = await handler(new Request("http://localhost/operations/api/inventory", { method }));
      expect(response.status).toBe(405);
    }
    expect((await handler(new Request("http://localhost/operations/discover.py"))).status).toBe(404);
    expect((await handler(new Request("http://localhost/operations/automations.local.json"))).status).toBe(404);
  });
  test("Atlas has only apps and agents and links to authenticated oversight", () => {
    const catalog = loadCatalogConfigs(publicFile);
    const html = renderIndex(loadConfig(publicFile), catalog);
    expect(html).not.toContain('data-kind-filter="workflow"');
    expect(html).toContain('https://private-apps-sayyidkhan.zo.computer/#list');
    expect(catalog.flatMap(c => c.routes).every(r => ["app", "agent"].includes(r.kind))).toBe(true);
    expect(html).not.toContain("/root/.hermes");
    expect(html).not.toContain("automations.local.json");
    expect(html).not.toContain('id="inventory"');
    expect(html).not.toContain('src="/operations/client.js');
  });
  test("public health does not disclose backend addresses", async () => {
    const response = await createHandler(publicFile)(new Request("http://localhost/health"));
    const body = await response.text();
    expect(body).not.toContain("targetOrigin");
    expect(body).not.toContain("127.0.0.1");
  });
});

test("private Apps matches catalogue apps while platform services retain their dependencies", async () => {
  const catalog = loadCatalogConfigs(publicFile);
  const expected = catalog.flatMap(g => g.routes.filter(r => r.listed !== false && r.kind === "app").map(r => "app:" + r.label)).sort();
  const configs = structuredClone(catalog);
  for (const gateway of configs) for (const route of gateway.routes) route.targetOrigin = "https://example.invalid";
  const snapshot = await collectInventory(configs, async () => ({
    services: ["zo-platform", "public-apps", "private-apps", "kasm-browser"].map(name => ({
      id: "service:" + name, name, status: "running", ports: []
    })),
    issues: [], databases: [], coverage: {}, youtubeEvidence: { status: "unknown" }
  }));
  expect(snapshot.apps.map(app => app.id).sort()).toEqual(expected);
  expect(snapshot.apps.every(app => app.listed)).toBe(true);
  expect(snapshot.apps.some(app => ["app:zo-platform", "app:tampalidea", "app:tampalidea-studio", "app:kasm-browser"].includes(app.id))).toBe(false);
  expect(snapshot.services.find(s => s.name === "zo-platform")).toMatchObject({ mapped: true, ownershipLabel: "GOZ | PLATFORM" });
  expect(snapshot.services.some(s => s.name === "kasm-browser")).toBe(true);
  for (const gateway of ["public-apps", "private-apps"]) {
    expect(snapshot.dependencies).toContainEqual({ from: "service:" + gateway, to: "service:zo-platform", evidence: "Garden homepage forwarding only" });
  }
});

test("Social Media Whisperer services have readable names and workflow links without changing IDs", async () => {
  const names = ["pal-omnigent-server", "pal-omnigent-host"];
  const snapshot = await collectInventory([], async () => ({
    services: names.map(name => ({ id: "service:" + name, name, status: "running", ports: [] })),
    issues: [], databases: [], coverage: {}, youtubeEvidence: { status: "unknown" }
  }));
  for (const [index, name] of names.entries()) {
    const id = "service:" + name;
    expect(snapshot.services.find(s => s.id === id)).toMatchObject({
      name: "Social Media Whisperer — " + (index === 0 ? "Coordinator" : "Worker"),
      serviceName: name, mapped: true, ownershipLabel: "PAL | WORKFLOW", status: "running"
    });
    expect(snapshot.dependencies).toContainEqual({
      from: "workflow:instagram-media-research", to: id, evidence: "Social Media Whisperer documented runtime"
    });
    expect(snapshot.issues.some(issue => issue.entity === id)).toBe(false);
  }
});

test("Stakefolio ledger components inherit governance ownership and link the catalogue to its backend", async () => {
  const configs = structuredClone(loadCatalogConfigs(publicFile));
  for (const gateway of configs) for (const route of gateway.routes) route.targetOrigin = "https://example.invalid";
  const snapshot = await collectInventory(configs, async () => ({
    services: ["stakefolio-staging", "stakefolio-ledger-data"].map(name => ({
      id: "service:" + name, name, status: "running", ports: []
    })),
    issues: [], databases: [], coverage: {}, youtubeEvidence: { status: "unknown" }
  }));
  for (const [technical, component] of [["stakefolio-staging", "Web"], ["stakefolio-ledger-data", "Backend"]]) {
    expect(snapshot.services.find(s => s.id === "service:" + technical)).toMatchObject({
      name: "Stakefolio — " + component, serviceName: technical, mapped: true, ownershipLabel: "STAKEFOLIO | GOVERNANCE"
    });
    expect(snapshot.issues.some(issue => issue.entity === "service:" + technical)).toBe(false);
  }
  for (const id of ["app:stakefolio", "app:stakefolio-studio"]) {
    expect(snapshot.apps.find(app => app.id === id)?.ownershipLabel).toBe("STAKEFOLIO | GOVERNANCE");
    expect(snapshot.dependencies).toContainEqual({ from: id, to: "service:stakefolio-ledger-data", evidence: "Stakefolio documented backend" });
  }
  expect(snapshot.dependencies).toContainEqual({
    from: "service:stakefolio-staging", to: "service:stakefolio-ledger-data", evidence: "Stakefolio web uses backend API"
  });
});

test("confirmed database owners resolve labels and dependencies without matching unrelated files", async () => {
  const paths = [
    "/home/workspace/Start/pal/kingdom-of-pal/state/pal-registry.sqlite3",
    "/home/workspace/Start/pal/pal-agent-bastion/var/bastion.db",
    "/home/workspace/Start/garden-of-zo/zo-order-tracker/zorder-data/zorder.sqlite"
  ];
  const database = (path: string, owner: string | null = null) => ({
    id: "database:" + path, path, name: path.split("/").at(-1), category: "application",
    owner, ownershipEvidence: owner ? "service working directory" : "unmapped",
    backup: { status: "unknown", lastAt: null }
  });
  const collect = (databases: any[]) => collectInventory([], async () => ({
    services: ["pal-agent-registry", "zo-order-tracker"].map(name => ({
      id: "service:" + name, name, status: "running", ports: []
    })),
    issues: [], databases, coverage: {}, youtubeEvidence: { status: "unknown" }
  }));
  const snapshot = await collect(paths.map(path => database(path)));
  const expected = [
    ["service:pal-agent-registry", "PAL | PLATFORM"],
    ["agent:bastion", "PAL | AGENT"],
    ["service:zo-order-tracker", "GOZ | APP"]
  ];
  for (const [index, [owner, label]] of expected.entries()) {
    const db = snapshot.databases[index];
    expect(db.owner).toBe(owner);
    expect([...snapshot.services, ...snapshot.agents].find(row => row.id === owner)?.ownershipLabel).toBe(label);
    expect(snapshot.dependencies).toContainEqual({ from: owner, to: db.id, evidence: "documented runtime location" });
  }
  expect(snapshot.issues.some(issue => issue.message.includes("databases need an owner mapping"))).toBe(false);
  const unrelated = await collect([
    database("/home/workspace/var/bastion.db"),
    database("/home/workspace/_scratch/pal-registry.sqlite3"),
    database("/home/workspace/_scratch/zorder.sqlite"),
    database(paths[2], "service:existing-owner")
  ]);
  expect(unrelated.databases.slice(0, 3).every(db => db.owner === null)).toBe(true);
  expect(unrelated.databases[3]).toMatchObject({ owner: "service:existing-owner", ownershipEvidence: "service working directory" });
  expect(unrelated.issues.some(issue => issue.message === "3 application databases need an owner mapping.")).toBe(true);
});

describe("inventory freshness", () => {
  test("concurrent refreshes coalesce and failed refreshes preserve the observation time", async () => {
    let count = 0;
    let fail = false;
    const original: any = { observedAt: "2026-01-01T00:00:00Z", services: [] };
    const cached = createSnapshotCache(async () => {
      count++;
      await new Promise(resolve => setTimeout(resolve, 5));
      if (fail) throw new Error("private error details");
      return original;
    }, 0);
    const values = await Promise.all([cached(), cached(), cached()]);
    expect(count).toBe(1);
    expect(values.every(v => !v.stale)).toBe(true);
    fail = true;
    const stale = await cached();
    expect(stale.stale).toBe(true);
    expect(stale.observedAt).toBe(original.observedAt);
    expect(JSON.stringify(stale)).not.toContain("private error details");
  });
  test("first collection failure never presents an empty inventory as success", async () => {
    const cached = createSnapshotCache(async () => { throw new Error("failed"); });
    expect(cached()).rejects.toThrow("no successful observation");
  });
  test("expired observations return immediately while refresh runs, and explicit refresh waits", async () => {
    const original: any = { observedAt: "2026-01-01T00:00:00Z", services: [] };
    const updated: any = { observedAt: "2026-01-01T00:01:00Z", services: [] };
    let finish: (value: any) => void = () => {};
    let calls = 0;
    const cached = createSnapshotCache(async () => ++calls === 1 ? original : new Promise(resolve => { finish = resolve; }), 0);
    expect((await cached()).observedAt).toBe(original.observedAt);
    await new Promise(resolve => setTimeout(resolve, 2));
    const stale = await cached();
    expect(stale.stale).toBe(true);
    expect(stale.observedAt).toBe(original.observedAt);
    expect(calls).toBe(2);
    const fresh = cached(true);
    finish(updated);
    expect((await fresh).observedAt).toBe(updated.observedAt);
  });
});

test("database warnings identify exact affected files and preserve unknown backup evidence", async () => {
  const database = (path: string, status = "unknown", category = "agent runtime") => ({
    id: "database:" + path, path, name: path.split("/").at(-1), category,
    owner: null, backup: { status, lastAt: null }
  });
  const databases = [
    database("/root/.hermes/profiles/orin/state.db"),
    database("/root/.hermes/profiles/runa/projects.db", "snapshot found"),
    database("/root/.openclaw/state/openclaw.sqlite"),
    database("/home/workspace/_scratch/unknown.sqlite", "unknown", "application"),
    database("/home/workspace/_scratch/archive.sqlite", "unknown", "backup"),
    database("/home/workspace/_scratch/test.sqlite", "unknown", "development")
  ];
  const snapshot = await collectInventory([], async () => ({
    services: [], issues: [], databases, coverage: {}, youtubeEvidence: { status: "unknown" }
  }));
  const backup = snapshot.issues.find(issue => issue.message.includes("unconfirmed backup status"));
  expect(backup.affected).toEqual([databases[0].id, databases[2].id, databases[3].id]);
  expect(backup.reason).toContain("does not prove their backups are missing");
  expect(backup.scopeNote).toContain("not a count of active apps");
  expect(backup.nextStep).toContain("restored");
  expect(snapshot.databases[0]).toMatchObject({ owner: "agent:orin", ownershipLabel: "PAL | AGENT" });
  expect(snapshot.databases[2]).toMatchObject({
    ownershipLabel: "PAL | LEGACY", projectName: "PAL OpenClaw (retained files)", backup: { status: "unknown" }
  });
  const ownership = snapshot.issues.find(issue => issue.message.includes("need an owner mapping"));
  expect(ownership.affected).toEqual([databases[3].id]);
});

test("database discovery ignores shared working directories but retains specific project owners", () => {
  const script = `
import importlib.util, tempfile, sqlite3
from pathlib import Path
spec = importlib.util.spec_from_file_location("discovery", "operations/discover.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    project = root / "project"
    project.mkdir()
    for path in [root / "unowned.db", project / "owned.db"]:
        with sqlite3.connect(path) as connection:
            connection.execute("CREATE TABLE marker (id INTEGER)")
    module.ROOT = root
    module.SCAN_ROOTS = [root]
    services = [{"id": "service:shared", "name": "shared", "workdir": str(root)},
                {"id": "service:project", "name": "project", "workdir": str(project)},
                {"id": "service:root", "name": "root", "workdir": "/"}]
    rows, coverage = module.database_inventory(services)
    owners = {row["name"]: row["owner"] for row in rows}
    assert owners == {"unowned.db": None, "owned.db": "service:project"}, owners
    assert coverage["complete"]
`;
  const result = Bun.spawnSync(["python3", "-c", script], { cwd: import.meta.dir });
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
});
