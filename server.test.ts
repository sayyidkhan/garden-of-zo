import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createHandler, loadCatalogConfigs, loadConfig, renderIndex, validateAtlasGraph, validateAuthors } from "./server";

const publicFile = join(import.meta.dir, "public.routes.json");
const privateFile = join(import.meta.dir, "private.routes.json");

describe("Garden of Zo catalogue", () => {
  test("catalogues all public and private router apps", () => {
    const html = renderIndex(loadConfig(publicFile), loadCatalogConfigs(publicFile));
    expect((html.match(/<article[^>]+data-atlas-card/g) ?? []).length).toBe(13);
    expect((html.match(/<article[^>]+data-list-card/g) ?? []).length).toBe(13);
    expect((html.match(/class="realm-row__kingdom"/g) ?? []).length).toBe(13);
    expect(html).toContain("realm-row__visual--relationship-mapper");
    for (const art of ["itachis-crow", "zo-expert", "pocketbase", "zo-drive", "zo-tube", "zo-moments", "zo-backlog", "zo-usage", "mailhub", "riven-proj-tracker"]) {
      expect((html.match(new RegExp(`garden-realm-${art}\\.webp`, "g")) ?? []).length).toBe(2);
    }
    expect((html.match(/garden-realm-relationship-mapper\.webp/g) ?? []).length).toBe(6);
    expect((html.match(/data-sky-node/g) ?? []).length).toBe(13);
    expect(html).toContain("Pannable sky atlas");
    expect(html).toContain('data-view="atlas"');
    expect(html).toContain('data-view="list"');
    expect(html).toContain("Sky Atlas View");
    expect(html).toContain("catalogue__commandbar");
    expect(html).toContain("is-atlas-view");
    expect(html).toContain("grid-template-rows: auto minmax(0, 1fr) auto");
    expect(html).toContain("grid-row: 3");
    expect(html).toContain("env(safe-area-inset-bottom)");
    expect(html).toContain('data-view-panel="list"');
    expect(html).toContain("Choose the next horizon.");
    expect(html).not.toContain("Choose the next<br />horizon.");
    expect(html).toContain('data-screen="landing"');
    expect(html).toContain('data-screen="catalogue" hidden');
    expect(html).toContain('href="#atlas" aria-controls="realms"');
    expect(html).toContain("Back to home");
    expect(html).not.toContain("Back to garden");
    expect(html.indexOf("Back to home")).toBeLessThan(html.lastIndexOf("Garden of Zo</span></a>"));
    expect(html).toContain("kingdom-sparkle");
    expect(html).toContain("kingdom-node.is-active.is-arrived .kingdom-node__art::before");
    expect(html).toContain("kingdom-node.is-active.is-arrived .kingdom-node__enter::before");
    expect(html).toContain("if (activeNode === node) node.classList.add('is-arrived')");
    expect((html.match(/<button[^>]+data-atlas-select/g) ?? []).length).toBe(13);
    expect(html).toContain("focusNode");
    expect(html).toContain("enter-realm-shimmer");
    expect(html).not.toContain('class="kingdom-node__island" href=');
    expect(html).toContain("addEventListener('hashchange', syncScreen)");
    expect(html).toContain("selected === 'list' ? '#list' : '#atlas'");
    expect(html).toContain("location.hash === '#list'");
    expect(html).toContain('aria-label="Filter realms by type"');
    expect(html).toContain('data-kind-filter="app"');
    expect(html).toContain('data-kind-filter="workflow"');
    expect(html).toContain('data-kind-filter="agent"');
    expect(html).toContain("Apps 11");
    expect(html).toContain("Workflows 1");
    expect(html).toContain("Agents 1");
    expect((html.match(/<article[^>]+data-kind="app"/g) ?? []).length).toBe(22);
    expect((html.match(/<article[^>]+data-kind="workflow"/g) ?? []).length).toBe(2);
    expect((html.match(/<article[^>]+data-kind="agent"/g) ?? []).length).toBe(2);
    expect(html).toContain("garden-of-zo-view");
    expect((html.match(/<path data-sky-route /g) ?? []).length).toBe(13);
    expect((html.match(/<path data-sky-route-terminal/g) ?? []).length).toBe(26);
    expect(html).toContain('d="M 650 620 C');
    expect(html).toContain('class="sky-route-terminals"');
    expect(html).toContain('class="kingdom-node__art"');
    expect(html).toContain("height: auto; aspect-ratio: 520 / 293");
    expect(html).toContain("data-atlas-zoom-out");
    expect(html).toContain("data-atlas-zoom-in");
    expect(html).toContain("data-atlas-reset");
    expect(html).toContain("data-atlas-previous");
    expect(html).toContain("data-atlas-next");
    expect(html).toContain("data-atlas-current");
    expect(html).toContain("data-atlas-minimap");
    expect(html).toContain("data-atlas-minimap-window");
    expect((html.match(/<circle data-minimap-node/g) ?? []).length).toBe(13);
    expect((html.match(/<path data-minimap-route/g) ?? []).length).toBe(13);
    expect(html).toContain("navigateSpatially");
    expect(html).toContain("fitMap");
    expect(html).toContain("Math.hypot(pendingDragX - dragStartX, pendingDragY - dragStartY) < 5");
    expect(html).toContain("animateZoom");
    expect(html).toContain("animateCamera");
    expect(html).toContain("Math.min(maximumZoom(), value)");
    expect(html).toContain("innerWidth < 620 ? 2 : 2.4");
    expect(html).not.toContain("refreshRoute(); fitMap('auto'); updateAtlas();");
    expect(html).toContain("innerWidth < 620 ? 1.05");
    expect(html).toContain("Map controls");
    expect(html).toContain("scroll to zoom");
    expect(html).toContain("zoomTarget");
    expect(html).toContain("is-zooming");
    expect(html).toContain("Relationship Mapper");
    expect(html).toContain("Zo Tube");
    expect(html).not.toContain(">ZoTube<");
    expect(html).toContain("Zo Usage");
    expect(html).toContain("9 open");
    expect(html).toContain("4 owner-only");
    expect((html.match(/class="kingdom-node__github"/g) ?? []).length).toBe(13);
    expect((html.match(/class="realm-row__link realm-row__link--github"/g) ?? []).length).toBe(13);
    expect((html.match(/>View GitHub</g) ?? []).length).toBe(13);
    expect((html.match(/target="_blank" rel="noreferrer"/g) ?? []).length).toBe(52);
    expect((html.match(/class="kingdom-node__author"/g) ?? []).length).toBe(13);
    expect((html.match(/class="realm-row__author"/g) ?? []).length).toBe(13);
    expect((html.match(/By Sayyid Khan/g) ?? []).length).toBe(24);
    expect((html.match(/By PocketBase/g) ?? []).length).toBe(2);
    expect(html).toContain('data-author="sayyidkhan"');
    expect(html).toContain('data-author="pocketbase"');
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
    expect(await health.json()).toMatchObject({ ok: true, access: "public", catalogSize: 13 });

    for (const path of ["garden-sky-v2.webp", "garden-kingdom.webp", "garden-kingdom-observatory.webp", "garden-kingdom-outpost.webp", "garden-pegasus.webp", "garden-pegasus-atlas.webp", "garden-realm-relationship-mapper.webp", "garden-realm-itachis-crow.webp", "garden-realm-zo-expert.webp", "garden-realm-pocketbase.webp", "garden-realm-zo-drive.webp", "garden-realm-zo-tube.webp", "garden-realm-zo-moments.webp", "garden-realm-zo-backlog.webp", "garden-realm-zo-usage.webp", "garden-realm-mailhub.webp", "garden-realm-riven-proj-tracker.webp"]) {
      const asset = await handler(new Request(`http://localhost/assets/${path}`));
      expect(asset.status).toBe(200);
      expect(asset.headers.get("content-type")).toBe("image/webp");
    }
  });

});
