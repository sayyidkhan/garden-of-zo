import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createHandler, loadConfig, loadCatalogConfigs, renderIndex } from "./server";
import { createSnapshotCache } from "./operations/inventory";

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
