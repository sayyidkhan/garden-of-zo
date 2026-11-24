import { join } from "node:path";
import { collectInventory, createSnapshotCache } from "./inventory";
import type { RouterConfig } from "../config";
import { createTaskListSync, TaskSyncError } from "./scheduled-tasks";

export function createOperationsHandler(config: RouterConfig, catalog: RouterConfig[], prewarm = false, syncTasks = createTaskListSync()) {
  const snapshot = createSnapshotCache(() => collectInventory(catalog));
  if (prewarm && config.access === "private") void snapshot().catch(() => {});
  return async (request: Request): Promise<Response> => {
    const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin", "x-frame-options": "SAMEORIGIN",
      "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'" };
    if (config.access !== "private") return new Response("Not found", { status: 404, headers });
    const url = new URL(request.url);
    if (url.pathname === "/operations/api/scheduled-tasks/sync") {
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { ...headers, allow: "POST" } });
      const origin = request.headers.get("origin");
      const allowedOrigins = new Set([new URL(config.gatewayUrl).origin, url.origin]);
      if (request.headers.get("x-garden-action") !== "sync-tasks" ||
          (origin && !allowedOrigins.has(origin)) ||
          ["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") || "")) {
        return Response.json({ error: "Open private Garden and use Update task list." }, { status: 403, headers });
      }
      try {
        const list = await syncTasks();
        return Response.json({ observedAt: list.observedAt, count: list.automations.length }, { headers });
      } catch (error) {
        return Response.json({ error: error instanceof TaskSyncError ? error.message : "The task list could not be updated. Try again." },
          { status: error instanceof TaskSyncError ? error.status : 503, headers });
      }
    }
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: { ...headers, allow: "GET, HEAD" } });
    const path = url.pathname;
    if (path === "/operations" || path === "/operations/") {
      url.searchParams.set("garden-list", "1");
      return new Response(null, { status: 302, headers: { ...headers, location: "/" + url.search } });
    }
    if (path === "/operations/api/inventory") {
      try { return Response.json(await snapshot(url.searchParams.get("fresh") === "1"), { headers }); }
      catch { return Response.json({ error: "Inventory unavailable; check the private gateway logs." }, { status: 503, headers }); }
    }
    const file = path === "/operations/client.js" ? "client.js" : null;
    if (!file) return new Response("Not found", { status: 404, headers });
    return new Response(request.method === "HEAD" ? null : Bun.file(join(import.meta.dir, file)), { headers: { ...headers, "content-type": file.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8" } });
  };
}
