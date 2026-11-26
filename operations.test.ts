import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createHandler, loadConfig, loadCatalogConfigs, renderIndex } from "./server";
import { collectInventory, createSnapshotCache, databaseRecords, databaseRemarks } from "./operations/inventory";

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

test("Orin databases share agent ownership while retaining runtime, dashboard and backup associations", async () => {
  const runtime = "/root/.hermes/profiles/orin/projects.db";
  const karma = "/home/workspace/Start/pal/pal-agent-orin/workspace/karma.sqlite";
  const database = (path: string, owner: string | null, category = "application", backupSource?: string) => ({
    id: "database:" + path, path, name: path.split("/").at(-1), owner, category, backupSource,
    ownershipEvidence: owner ? "service working directory" : "unmapped",
    bytes: 1024, walBytes: 0, backup: { status: "unknown", lastAt: null }
  });
  const snapshot = await collectInventory([], async () => ({
    services: [{ id: "service:orin-hermes-dashboard", name: "orin-hermes-dashboard", status: "running", ports: [] }],
    issues: [], coverage: {}, youtubeEvidence: { status: "unknown" },
    databases: [
      database(karma, "service:orin-hermes-dashboard"),
      database(runtime, null, "agent runtime"),
      database("/home/workspace/Data/database-backups/test/karma.sqlite", null, "backup", karma),
      database("/home/workspace/unrelated/karma.sqlite", null)
    ]
  }));
  const dashboard = snapshot.databases.find(row => row.path === karma)!;
  expect(dashboard).toMatchObject({
    owner: "agent:orin", projectName: "Orin Forgekeeper", component: "Agent Dashboard",
    componentEntity: "service:orin-hermes-dashboard", ownershipLabel: "PAL | AGENT"
  });
  expect(dashboard.backupCopies).toHaveLength(1);
  expect(dashboard.backedUpBy).toBe("Garden");
  expect(snapshot.databases.find(row => row.path === runtime)).toMatchObject({ owner: "agent:orin", component: "Agent Runtime" });
  expect(snapshot.databases.find(row => row.path.includes("/unrelated/"))).toMatchObject({ owner: null });
  expect(snapshot.dependencies).toContainEqual({ from: "service:orin-hermes-dashboard", to: dashboard.id, evidence: "service working directory" });
  expect(snapshot.dependencies.some(row => row.from === "agent:orin" && row.to === dashboard.id)).toBe(true);
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
import importlib.util, tempfile, sqlite3, sys
from pathlib import Path
sys.path.insert(0, str(Path("operations").resolve()))
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

test("old verified database copies produce a freshness warning without becoming unconfirmed", async () => {
  const database = {
    id: "database:/root/.hermes/profiles/orin/state.db",
    path: "/root/.hermes/profiles/orin/state.db", name: "state.db", category: "agent runtime",
    owner: null, backup: { status: "snapshot found", lastAt: Date.now() / 1000 - 90000 }
  };
  const snapshot = await collectInventory([], async () => ({
    services: [], issues: [], databases: [database], coverage: {}, youtubeEvidence: { status: "unknown" }
  }));
  expect(snapshot.databases[0].backup.status).toBe("old snapshot");
  expect(snapshot.issues.some(row => row.message.includes("unconfirmed backup status"))).toBe(false);
  expect(snapshot.issues.find(row => row.message.includes("over 24 hours old"))?.affected).toEqual([database.id]);
});

test("backup copies inherit verified source owners while host stores stay outside project labels", async () => {
  const database = (path: string, category: string, extra = {}) => ({
    id: "database:" + path, path, name: path.split("/").at(-1), category,
    owner: null, backup: { status: "unknown", lastAt: null }, ...extra
  });
  const source = "/root/.hermes/profiles/orin/state.db";
  const snapshot = await collectInventory([], async () => ({
    services: [], issues: [], coverage: {}, youtubeEvidence: { status: "unknown" },
    databases: [
      database("/home/workspace/Data/database-backups/test/copy.db", "backup", { backupSource: source }),
      database(source, "agent runtime"),
      database("/root/.hermes/backups/runa/stamp/state.db", "backup"),
      database("/root/.hermes/backups/orin/stamp/karma.sqlite", "backup"),
      database("/root/.hermes/state.db", "agent runtime"),
      database("/root/.codex/state_5.sqlite", "host runtime"),
      database("/home/.z/workspaces/con_test/project/data.db", "development"),
      database("/home/workspace/Data/database-backups/test/unknown.db", "backup"),
      database("/home/workspace/Data/database-backups/test/system.db", "backup", { backupSource: "/root/.hermes/state.db" }),
      database("/home/workspace/unknown/state.db", "application")
    ]
  }));
  const rows = [
    snapshot.databases.find(db => db.path === source), null,
    snapshot.databases.find(db => db.path.includes("/backups/runa/")),
    snapshot.databases.find(db => db.path.includes("/backups/orin/")),
    snapshot.databases.find(db => db.path === "/root/.hermes/state.db"),
    snapshot.databases.find(db => db.path === "/root/.codex/state_5.sqlite"),
    snapshot.databases.find(db => db.path.includes("/con_test/")),
    snapshot.databases.find(db => db.path.endsWith("/unknown.db")),
    snapshot.databases.find(db => db.path === "/root/.hermes/state.db"),
    snapshot.databases.find(db => db.path === "/home/workspace/unknown/state.db")
  ];
  expect(rows[0]).toMatchObject({ owner: "agent:orin", ownershipLabel: "PAL | AGENT" });
  expect(rows[0].backupCopies[0].path).toEndWith("/copy.db");
  expect(rows[8].backupCopies[0].path).toEndWith("/system.db");
  expect(snapshot.databases).toHaveLength(8);
  expect(snapshot.dependencies).toContainEqual({ from: "agent:orin", to: rows[0].id, evidence: "documented runtime location" });
  expect(rows[2]).toMatchObject({ owner: "agent:runa", ownershipLabel: "PAL | AGENT" });
  expect(rows[3]).toMatchObject({ owner: "agent:orin", ownershipLabel: "PAL | AGENT" });
  expect(rows[4]).toMatchObject({ owner: null, ownership: null, systemOwnership: { name: "Hermes shared runtime" } });
  expect(rows[5]).toMatchObject({ owner: null, ownership: null, systemOwnership: { name: "Codex" } });
  expect(rows[6]).toMatchObject({ systemOwnership: { category: "Host system", subcategory: "Temporary files" } });
  expect(rows[7]).toMatchObject({ owner: null, ownershipLabel: "Ownership pending" });
  expect(rows[8]).toMatchObject({ owner: null, systemOwnership: { name: "Hermes shared runtime" } });
  expect(rows[9]).toMatchObject({ owner: null, ownershipLabel: "Ownership pending" });
  expect(snapshot.issues.find(issue => issue.message.includes("need an owner mapping"))?.affected).toEqual([rows[9].id]);
});

test("discovery links backup ownership only when its source snapshot checksum verifies", () => {
  const script = `
import importlib.util, tempfile, sqlite3, sys, json
from pathlib import Path
sys.path.insert(0, str(Path("operations").resolve()))
import database_backups
spec = importlib.util.spec_from_file_location("discovery", "operations/discover.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    source = root / "source.db"
    with sqlite3.connect(source) as connection:
        connection.execute("CREATE TABLE marker (id INTEGER)")
    database_backups.BACKUPS = root / "backups"
    copy = database_backups.BACKUPS / "stamp" / "copy.db"
    entry = database_backups.backup_database(source, copy)
    module.EVIDENCE = root / "evidence.json"
    module.EVIDENCE.write_text(json.dumps({str(source): entry}))
    module.ROOT = root
    module.SCAN_ROOTS = [root]
    rows, coverage = module.database_inventory([])
    assert next(row for row in rows if row["path"] == str(copy))["backupSource"] == str(source)
    with copy.open("ab") as stream:
        stream.write(b"changed")
    rows, coverage = module.database_inventory([])
    assert "backupSource" not in next(row for row in rows if row["path"] == str(copy))
`;
  const result = Bun.spawnSync(["python3", "-c", script], { cwd: import.meta.dir });
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
});

test("database rows combine copies without merging unrelated sources or upgrading backup evidence", () => {
  const source = (id: string, owner: string) => ({ id, path: "/" + id, name: "state.db", owner, category: "application", bytes: 100, walBytes: 5, backup: { status: "unknown" } });
  const copy = (id: string, owner: string, extra = {}) => ({ ...source(id, owner), category: "backup", ...extra });
  const records = databaseRecords([
    source("one", "a"), source("two", "b"), source("three", "c"), source("four", "c"),
    copy("copy-one", "a", { backupSource: "/one" }), copy("copy-two", "a"),
    copy("ambiguous", "c"), copy("ambiguous-older", "c"), copy("other-owner", "d")
  ]);
  expect(records).toHaveLength(6);
  expect(records[0].backupCopies.map((copy: any) => copy.id)).toEqual(["copy-one", "copy-two"]);
  expect(records[0].backup.status).toBe("unknown");
  expect(records[1].backupCopies).toEqual([]);
  expect(records[4]).toMatchObject({ backupOnly: true, bytes: 200, walBytes: 10 });
  expect(records[4].backupCopies).toHaveLength(2);
  expect(records[5].owner).toBe("d");
});

test("backup creators stay separate from database ownership and retain mixed copy provenance", () => {
  const path = "/root/.hermes/profiles/orin/state.db";
  const native = "/root/.hermes/backups/orin/stamp/state.db";
  const garden = "/home/workspace/Data/database-backups/stamp/orin.sqlite";
  const [row, unknown] = databaseRecords([
    { id: "orin", path, name: "state.db", category: "agent runtime", owner: "agent:orin", backup: { path: native, status: "old snapshot" } },
    { id: "native", path: native, category: "backup", backupSource: path },
    { id: "garden", path: garden, category: "backup", backupSource: path },
    { id: "unknown", path: "/app/backups/custom.db", name: "custom.db", category: "backup", owner: "agent:orin" }
  ]);
  expect(row.backedUpBy).toBe("Orin backup tool, Garden");
  expect(row.backupCopies.map((copy: any) => copy.createdBy)).toEqual(["Orin backup tool", "Garden"]);
  expect(row.backup.status).toBe("old snapshot");
  expect(unknown.backedUpBy).toBe("Not confirmed");
  expect(unknown.backupOnly).toBe(true);
  const [runa] = databaseRecords([{ path: "/source", category: "application", backup: { path: "/root/.hermes/backups/runa/stamp/projects.db" } }]);
  expect(runa.backedUpBy).toBe("Runa backup tool");
  expect(databaseRecords([{ path: "/empty", category: "application" }])[0].backedUpBy).toBe("Not confirmed");
});

test("framework remarks use exact Hermes locations without mislabelling app, browser or unconfirmed backup files", () => {
  const roots = ["/root/.hermes", "/root/.hermes/profiles/orin", "/root/.hermes/profiles/runa"];
  for (const root of roots) {
    for (const file of ["state.db", "projects.db", "cron/executions.db", "cron/notepad.db"]) {
      expect(databaseRemarks({ path: root + "/" + file })).toContain("Created by Hermes framework.");
    }
  }
  for (const path of [
    "/root/.hermes/profiles/orin/home/.local/share/pki/nssdb/cert9.db",
    "/root/.hermes/profiles/orin/home/.local/share/pki/nssdb/key4.db",
    "/home/workspace/Start/pal/pal-agent-orin/workspace/karma.sqlite",
    "/home/workspace/hackathon/example/projects.db",
    "/root/.hermes/profiles/orin/archive/projects.db"
  ]) expect(databaseRemarks({ path })).toBe("");
  expect(databaseRemarks({ path: "/root/.hermes/backups/orin/old/projects.db", backupOnly: true })).toBe("");
  expect(databaseRemarks({ path: "/root/.hermes/backups/orin/old/projects.db", backupOnly: true,
    backupSource: "/root/.hermes/profiles/orin/projects.db" })).toContain("separate from Stakefolio");
  expect(databaseRemarks({ path: roots[1] + "/projects.db", remarks: "Owner's saved note" })).toBe("Owner's saved note");
  const [row] = databaseRecords([{ path: roots[1] + "/cron/notepad.db", category: "agent runtime" }]);
  expect(row.remarks).toContain("Notes that scheduled tasks can remember between runs");
});
