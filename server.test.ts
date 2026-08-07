import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createHandler, loadCatalogConfigs, loadConfig, renderIndex } from "./server";

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
    expect(html).toContain('data-view-panel="list"');
    expect(html).toContain('data-screen="landing"');
    expect(html).toContain('data-screen="catalogue" hidden');
    expect(html).toContain('href="#atlas" aria-controls="realms"');
    expect(html).toContain("Back to garden");
    expect(html).toContain("addEventListener('hashchange', syncScreen)");
    expect(html).toContain('aria-label="Filter realms by type"');
    expect(html).toContain('data-kind-filter="app"');
    expect(html).toContain('data-kind-filter="workflow"');
    expect(html).toContain('data-kind-filter="agent"');
    expect(html).toContain("Apps 6");
    expect(html).toContain("Workflows 1");
    expect(html).toContain("Agents 1");
    expect((html.match(/data-kind="app"/g) ?? []).length).toBe(12);
    expect((html.match(/data-kind="workflow"/g) ?? []).length).toBe(2);
    expect((html.match(/data-kind="agent"/g) ?? []).length).toBe(2);
    expect(html).toContain("garden-of-zo-view");
    expect((html.match(/<path data-sky-route/g) ?? []).length).toBe(11);
    expect(html).toContain('d="M 265 444 C');
    expect(html).toContain('class="kingdom-node__art"');
    expect(html).toContain("height: auto; aspect-ratio: 520 / 293");
    expect(html).toContain("data-atlas-zoom-out");
    expect(html).toContain("data-atlas-zoom-in");
    expect(html).toContain("data-atlas-reset");
    expect(html).toContain("Relationship Mapper");
    expect(html).toContain("Zo Usage");
    expect(html).toContain("6 open");
    expect(html).toContain("2 owner-only");
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
