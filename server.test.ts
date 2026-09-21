import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createHandler, loadCatalogConfigs, loadConfig, renderIndex, validateAtlasGraph, validateAuthors } from "./server";

const publicFile = join(import.meta.dir, "public.routes.json");
const privateFile = join(import.meta.dir, "private.routes.json");

describe("Garden of Zo catalogue", () => {
  test("catalogues every realm in canvas data and the accessible list", () => {
    const catalog = loadCatalogConfigs(publicFile);
    const expected = catalog.flatMap(gateway => gateway.routes);
    const html = renderIndex(loadConfig(publicFile), catalog);
    const data = JSON.parse(html.match(/id="atlas-data">([\s\S]*?)<\/script>/)![1]);
    expect(data.realms).toHaveLength(expected.length);
    expect((html.match(/<article[^>]+data-list-card/g) ?? [])).toHaveLength(expected.length);
    expect((html.match(/class="realm-row__kingdom"/g) ?? [])).toHaveLength(expected.length);
    expect((html.match(/<circle data-minimap-node/g) ?? [])).toHaveLength(expected.length);
    for (const route of expected) {
      const realm = data.realms.find((entry: any) => entry.id === route.label);
      expect(realm).toMatchObject({ title: route.title, x: route.atlas.x, y: route.atlas.y, repositoryUrl: route.repositoryUrl });
      expect(realm.author.name).toBeTruthy();
      expect(realm.href).toBeTruthy();
    }
    expect(data.links).toHaveLength(expected.flatMap(route => route.atlas.links ?? []).length);
    for (const marker of ['data-realm-panel', 'data-realm-chooser', 'data-realm-enter', 'data-realm-source', 'data-panel-close', 'data-atlas-minimap', 'data-filter="private"', 'data-kind-filter="workflow"', 'data-view="list"', 'data-view="atlas"', '/atlas-client.js']) expect(html).toContain(marker);
    expect(html).not.toContain('data-atlas-world');
    expect(html).toContain('href="#atlas"');
    expect(html).toContain('Back to home');
  });

  test("escapes embedded map data without exposing internal routing targets", () => {
    const catalog = structuredClone(loadCatalogConfigs(publicFile));
    catalog[0].routes[0].title = '</script><script>alert(1)</script>';
    const html = renderIndex(catalog[0], catalog);
    const dataText = html.match(/id="atlas-data">([\s\S]*?)<\/script>/)![1];
    expect(JSON.parse(dataText).realms[0].title).toBe(catalog[0].routes[0].title);
    expect(dataText).not.toContain('</script>');
    expect(dataText).not.toContain('targetOrigin');
    expect(dataText).not.toContain('127.0.0.1');
  });

  test("loads Atlas placement and graph links from the route manifests", () => {
    const catalog = loadCatalogConfigs(publicFile);
    const routes = catalog.flatMap((gateway) => gateway.routes);
    const mapper = routes.find((route) => route.label === "zo-relationship-mapper");
    const usage = routes.find((route) => route.label === "zo-usage");
    const mailhub = routes.find((route) => route.label === "gigradar-mailhub");
    const riven = routes.find((route) => route.label === "riven-proj-tracker");
    const batam = routes.find((route) => route.label === "batam-100-site");
    const tampalidea = routes.find((route) => route.label === "tampalidea");
    const crow = routes.find((route) => route.label === "itachiscrow");

    expect(mapper?.atlas).toMatchObject({ x: 650, y: 620, art: "relationship-mapper", scale: 0.88 });
    expect(mapper?.atlas.links?.map((link) => link.to)).toEqual(["zo-expert", "zo-pocketbase"]);
    expect(mapper?.repositoryUrl).toBe("https://github.com/sayyidkhan/zo-relationship-mapper");
    expect(mapper?.authorId).toBe("sayyidkhan");
    expect(catalog[0].authors.sayyidkhan).toMatchObject({ name: "Sayyid Khan", handle: "@sayyidkhan" });
    expect(catalog[0].authors.pocketbase).toMatchObject({ name: "PocketBase", handle: "@pocketbase" });
    expect(usage?.atlas).toMatchObject({ x: 3020, y: 420, art: "zo-usage", scale: 1.12 });
    expect(mailhub).toMatchObject({ prefix: "/mailhub", targetOrigin: "http://127.0.0.1:8787" });
    expect(mailhub?.atlas).toMatchObject({ x: 3170, y: 1520, art: "mailhub", scale: 1 });
    expect(riven).toMatchObject({ prefix: "/riven-proj-tracker", targetOrigin: "http://127.0.0.1:8798" });
    expect(riven?.atlas).toMatchObject({ x: 2470, y: 1740, art: "riven-proj-tracker", scale: 0.98 });
    expect(batam).toMatchObject({ prefix: "/staging/batam-100-site", targetOrigin: "http://127.0.0.1:8807", stripPrefix: true });
    expect(tampalidea).toMatchObject({ prefix: "/staging/tampalidea", targetOrigin: "http://127.0.0.1:8808", stripPrefix: true });
    expect(crow).toMatchObject({ prefix: "/crow", targetOrigin: "http://127.0.0.1:8806", stripPrefix: true });
    expect(crow?.atlas).toMatchObject({ x: 1770, y: 460, art: "itachis-crow", scale: 1.02 });
    expect(routes.flatMap((route) => route.atlas.links ?? [])).toHaveLength(13);
  });

  test("rejects Atlas links that cannot resolve to a manifest realm", () => {
    const catalog = structuredClone(loadCatalogConfigs(publicFile));
    catalog[0].routes[0].atlas.links = [{ to: "missing-realm" }];
    expect(() => validateAtlasGraph(catalog)).toThrow("Unknown atlas link from zo-relationship-mapper to missing-realm");
  });

  test("keeps neighbouring kingdoms clear of expanded labels and artwork", () => {
    const routes = loadCatalogConfigs(publicFile).flatMap((gateway) => gateway.routes);
    for (let index = 0; index < routes.length; index++) {
      for (const other of routes.slice(index + 1)) {
        const node = routes[index];
        const separated = Math.abs(node.atlas.x - other.atlas.x) >= 380 || Math.abs(node.atlas.y - other.atlas.y) >= 460;
        expect(separated, `${node.label} overlaps ${other.label}`).toBe(true);
      }
    }
  });

  test("keeps the Atlas in the existing homepage view on either gateway", async () => {
    for (const file of [publicFile, privateFile]) {
      const handler = createHandler(file);
      const homepage = await handler(new Request("http://localhost/"));
      expect(homepage.status).toBe(200);
      const html = await homepage.text();
      expect(html).toContain('href="#atlas"');
      expect(html).toContain('id="atlas-view"');
      for (const path of ["/map", "/map/"]) {
        const response = await handler(new Request(`http://localhost${path}`));
        expect(response.status).toBe(404);
      }
    }
  });

  test("rejects realms whose author is missing from the registry", () => {
    const config = structuredClone(loadConfig(publicFile));
    config.routes[0].authorId = "missing-author";
    expect(() => validateAuthors(config.routes, config.authors)).toThrow("Unknown author for zo-relationship-mapper: missing-author");
  });

  test("public view sends private apps through the authenticated gateway", () => {
    const html = renderIndex(loadConfig(publicFile), loadCatalogConfigs(publicFile));
    expect(html).toContain('href="https://private-apps-sayyidkhan.zo.computer/backlog"');
    expect(html).toContain('href="https://private-apps-sayyidkhan.zo.computer/mailhub"');
    expect(html).toContain('href="https://private-apps-sayyidkhan.zo.computer/riven-proj-tracker"');
    expect(html).toContain('href="/pocketbase/_/"');
    expect(html).toContain('data-access="private"');
    expect(html).toContain("Owner access");
    expect(html).toContain('href="https://github.com/sayyidkhan/zo-backlog"');
    expect(html).toContain('href="https://github.com/sayyidkhan/zo-usage"');
  });

  test("private view keeps private routes local and public routes on the public gateway", () => {
    const html = renderIndex(loadConfig(privateFile), loadCatalogConfigs(privateFile));
    expect(html).toContain('href="/backlog"');
    expect(html).toContain('href="/mailhub"');
    expect(html).toContain('href="/riven-proj-tracker"');
    expect(html).toContain('href="https://public-apps-sayyidkhan.zocomputer.io/mapper"');
    expect(html).toContain('href="https://public-apps-sayyidkhan.zocomputer.io/crow/explore.html"');
  });

  test("serves catalogue metadata and the layered hero assets", async () => {
    const handler = createHandler(publicFile);
    const health = await handler(new Request("http://localhost/health"));
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, access: "public", catalogSize: loadCatalogConfigs(publicFile).flatMap(gateway => gateway.routes).length });

    for (const path of ["garden-sky-v2.webp", "garden-kingdom.webp", "garden-kingdom-observatory.webp", "garden-kingdom-outpost.webp", "garden-pegasus.webp", "garden-pegasus-atlas.webp", "garden-realm-relationship-mapper.webp", "garden-realm-itachis-crow.webp", "garden-realm-zo-expert.webp", "garden-realm-pocketbase.webp", "garden-realm-zo-drive.webp", "garden-realm-zo-tube.webp", "garden-realm-zo-moments.webp", "garden-realm-zo-backlog.webp", "garden-realm-zo-usage.webp", "garden-realm-mailhub.webp", "garden-realm-riven-proj-tracker.webp"]) {
      const asset = await handler(new Request(`http://localhost/assets/${path}`));
      expect(asset.status).toBe(200);
      expect(asset.headers.get("content-type")).toBe("image/webp");
    }
  });

});
