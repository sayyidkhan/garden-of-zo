import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createHandler, loadCatalogConfigs, loadConfig, renderIndex, validateAtlasGraph } from "./server";

const publicFile = join(import.meta.dir, "public.routes.json");
const privateFile = join(import.meta.dir, "private.routes.json");

describe("Garden of Zo catalogue", () => {
  test("catalogues all public and private router apps", () => {
    const html = renderIndex(loadConfig(publicFile), loadCatalogConfigs(publicFile));
    expect((html.match(/<article[^>]+data-atlas-card/g) ?? []).length).toBe(8);
    expect((html.match(/<article[^>]+data-list-card/g) ?? []).length).toBe(8);
    expect((html.match(/data-sky-node/g) ?? []).length).toBe(8);
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
    expect(html).toContain("kingdom-node.is-active.is-arrived .kingdom-node__label > a::before");
    expect(html).toContain("if (activeNode === node) node.classList.add('is-arrived')");
    expect((html.match(/<button[^>]+data-atlas-select/g) ?? []).length).toBe(8);
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
    expect(html).toContain("Apps 6");
    expect(html).toContain("Workflows 1");
    expect(html).toContain("Agents 1");
    expect((html.match(/<article[^>]+data-kind="app"/g) ?? []).length).toBe(12);
    expect((html.match(/<article[^>]+data-kind="workflow"/g) ?? []).length).toBe(2);
    expect((html.match(/<article[^>]+data-kind="agent"/g) ?? []).length).toBe(2);
    expect(html).toContain("garden-of-zo-view");
    expect((html.match(/<path data-sky-route /g) ?? []).length).toBe(11);
    expect((html.match(/<path data-sky-route-terminal/g) ?? []).length).toBe(22);
    expect(html).toContain('d="M 265 444 C');
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
    expect((html.match(/<circle data-minimap-node/g) ?? []).length).toBe(8);
    expect((html.match(/<path data-minimap-route/g) ?? []).length).toBe(11);
    expect(html).toContain("navigateSpatially");
    expect(html).toContain("fitMap");
    expect(html).toContain("animateZoom");
    expect(html).toContain("animateCamera");
    expect(html).toContain("Math.min(maximumZoom(), value)");
    expect(html).toContain("innerWidth < 620 ? 2 : 2.4");
    expect(html).not.toContain("refreshRoute(); fitMap('auto'); updateAtlas();");
    expect(html).toContain("innerWidth < 620 ? 1.05");
    expect(html).toContain("world.animate([");
    expect(html).toContain("DOMMatrixReadOnly");
    expect(html).toContain("zoomTarget");
    expect(html).toContain("is-zooming");
    expect(html).toContain("Relationship Mapper");
    expect(html).toContain("Zo Usage");
    expect(html).toContain("6 open");
    expect(html).toContain("2 owner-only");
  });

  test("loads Atlas placement and graph links from the route manifests", () => {
    const catalog = loadCatalogConfigs(publicFile);
    const routes = catalog.flatMap((gateway) => gateway.routes);
    const mapper = routes.find((route) => route.label === "zo-relationship-mapper");
    const usage = routes.find((route) => route.label === "zo-usage");

    expect(mapper?.atlas).toMatchObject({ x: 265, y: 444, art: "outpost", scale: 0.88 });
    expect(mapper?.atlas.links?.map((link) => link.to)).toEqual(["zo-expert", "zo-pocketbase"]);
    expect(usage?.atlas).toMatchObject({ x: 2015, y: 334, art: "outpost", scale: 1.12 });
    expect(routes.flatMap((route) => route.atlas.links ?? [])).toHaveLength(11);
  });

  test("rejects Atlas links that cannot resolve to a manifest realm", () => {
    const catalog = structuredClone(loadCatalogConfigs(publicFile));
    catalog[0].routes[0].atlas.links = [{ to: "missing-realm" }];
    expect(() => validateAtlasGraph(catalog)).toThrow("Unknown atlas link from zo-relationship-mapper to missing-realm");
  });

  test("public view sends private apps through the authenticated gateway", () => {
    const html = renderIndex(loadConfig(publicFile), loadCatalogConfigs(publicFile));
    expect(html).toContain('href="https://private-apps-sayyidkhan.zo.computer/backlog"');
    expect(html).toContain('href="/pocketbase/_/"');
    expect(html).toContain('data-access="private"');
    expect(html).toContain("Owner access");
  });

  test("private view keeps private routes local and public routes on the public gateway", () => {
    const html = renderIndex(loadConfig(privateFile), loadCatalogConfigs(privateFile));
    expect(html).toContain('href="/backlog"');
    expect(html).toContain('href="https://public-apps-sayyidkhan.zocomputer.io/mapper"');
  });

  test("serves catalogue metadata and the layered hero assets", async () => {
    const handler = createHandler(publicFile);
    const health = await handler(new Request("http://localhost/health"));
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, access: "public", catalogSize: 8 });

    for (const path of ["garden-sky-v2.webp", "garden-kingdom.webp", "garden-kingdom-observatory.webp", "garden-kingdom-outpost.webp", "garden-pegasus.webp", "garden-kingdom-atlas.webp", "garden-kingdom-observatory-atlas.webp", "garden-kingdom-outpost-atlas.webp", "garden-pegasus-atlas.webp"]) {
      const asset = await handler(new Request(`http://localhost/assets/${path}`));
      expect(asset.status).toBe(200);
      expect(asset.headers.get("content-type")).toBe("image/webp");
    }
  });
});
