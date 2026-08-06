import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createHandler, loadCatalogConfigs, loadConfig, renderIndex } from "./server";

const publicFile = join(import.meta.dir, "public.routes.json");
const privateFile = join(import.meta.dir, "private.routes.json");

describe("Garden of Zo catalogue", () => {
  test("catalogues all public and private router apps", () => {
    const html = renderIndex(loadConfig(publicFile), loadCatalogConfigs(publicFile));
    expect((html.match(/<article[^>]+data-app-card/g) ?? []).length).toBe(8);
    expect((html.match(/data-sky-node/g) ?? []).length).toBe(8);
    expect(html).toContain("Horizontal sky atlas");
    expect(html).toContain("data-atlas-prev");
    expect(html).toContain("data-atlas-next");
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

    for (const path of ["garden-sky-v2.webp", "garden-kingdom.webp", "garden-kingdom-observatory.webp", "garden-kingdom-outpost.webp", "garden-pegasus.webp"]) {
      const asset = await handler(new Request(`http://localhost/assets/${path}`));
      expect(asset.status).toBe(200);
      expect(asset.headers.get("content-type")).toBe("image/webp");
    }
  });
});
