import { join } from "node:path";
import { loadConfig, loadCatalogConfigs } from "./config";
import { renderIndex, renderFavicon } from "./view";
import { createOperationsHandler } from "./operations/handler";
export * from "./config";
export { renderIndex } from "./view";

export function createHandler(configFile: string, prewarm = false) {
  const config = loadConfig(configFile);
  const catalog = loadCatalogConfigs(configFile);
  const operations = createOperationsHandler(config, catalog, prewarm);
  let clientBuild: Promise<string> | undefined;
  const realmArtFiles = new Map(catalog.flatMap((gateway) => gateway.routes.filter((route) => route.listed !== false).map((route) => {
    const file = `garden-realm-${route.atlas.art}.webp`;
    return [`/assets/${file}`, file] as const;
  })));

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname === "/operations" || url.pathname.startsWith("/operations/")) return operations(request);

    if (url.pathname === "/garden-client.js") {
      return new Response(Bun.file(join(import.meta.dir, "client/shell.js")), { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" } });
    }

    if (url.pathname === "/atlas-client.js") {
      clientBuild ??= Bun.build({ entrypoints: [join(import.meta.dir, "client/atlas.ts")], target: "browser", minify: true }).then(async result => {
        if (!result.success) throw new Error(result.logs.join("\n"));
        return result.outputs[0].text();
      }).catch(error => { clientBuild = undefined; throw error; });
      return new Response(await clientBuild, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" } });
    }

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "zo-platform",
        title: config.title,
        access: config.access,
        catalogSize: catalog.reduce((total, gateway) => total + gateway.routes.filter((route) => route.listed !== false).length, 0),
        routes: config.routes.map((route) => ({ prefix: route.prefix, label: route.label }))
      });
    }

    if (url.pathname === "/favicon.svg") {
      return new Response(renderFavicon(), { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
    }

    const heroAssets: Record<string, string> = {
      "/assets/garden-sky.webp": "garden-sky.webp",
      "/assets/garden-sky-v2.webp": "garden-sky-v2.webp",
      "/assets/garden-kingdom.webp": "garden-kingdom.webp",
      "/assets/garden-kingdom-observatory.webp": "garden-kingdom-observatory.webp",
      "/assets/garden-kingdom-outpost.webp": "garden-kingdom-outpost.webp",
      "/assets/garden-pegasus.webp": "garden-pegasus.webp",
      "/assets/garden-kingdom-atlas.webp": "garden-kingdom-atlas.webp",
      "/assets/garden-kingdom-observatory-atlas.webp": "garden-kingdom-observatory-atlas.webp",
      "/assets/garden-kingdom-outpost-atlas.webp": "garden-kingdom-outpost-atlas.webp",
      "/assets/garden-pegasus-atlas.webp": "garden-pegasus-atlas.webp"
    };

    const assetFile = heroAssets[url.pathname] ?? realmArtFiles.get(url.pathname);
    if (assetFile) {
      return new Response(Bun.file(join(import.meta.dir, "assets", assetFile)), {
        headers: { "content-type": "image/webp", "cache-control": "public, max-age=604800, immutable" }
      });
    }

    if (url.pathname === "/") {
      return new Response(renderIndex(config, catalog), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }


    return new Response("Not found", { status: 404 });
  };
}

if (import.meta.main) {
  const root = process.env.ROUTES_DIR || join(import.meta.dir, "../zo-router");
  for (const access of ["public", "private"] as const) {
    const port = Number(process.env["PLATFORM_" + access.toUpperCase() + "_PORT"] || (access === "public" ? "8834" : "8835"));
    Bun.serve({ hostname: "127.0.0.1", port, fetch: createHandler(join(root, access + ".routes.json"), true) });
    console.log(`zo-platform ${access} listening on loopback port ${port}`);
  }
}
