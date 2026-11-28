import { createHash } from "node:crypto";
import { join } from "node:path";
import { collectInventory, createSnapshotCache } from "./inventory";
import type { RouterConfig } from "../config";
import { createTaskListSync, TaskSyncError } from "./scheduled-tasks";
import { databaseViewerCapability, readDatabasePage, DatabaseViewError } from "./database-viewer";
import { createBackupUpdate } from "./backup-update";

export function createOperationsHandler(config: RouterConfig, catalog: RouterConfig[], prewarm = false, syncTasks = createTaskListSync(), backupUpdate = createBackupUpdate(() => collectInventory(catalog))) {
  const snapshot = createSnapshotCache(() => collectInventory(catalog));
  if (prewarm && config.access === "private") void snapshot().catch(() => {});
  return async (request: Request): Promise<Response> => {
    const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin", "x-frame-options": "SAMEORIGIN",
      "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'" };
    if (config.access !== "private") return new Response("Not found", { status: 404, headers });
    const url = new URL(request.url);
    if (url.pathname === "/operations/api/backups/update") {
      if (!["GET", "POST"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: { ...headers, allow: "GET, POST" } });
      const origin = request.headers.get("origin");
      if ((origin && ![new URL(config.gatewayUrl).origin, url.origin].includes(origin)) ||
          ["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") || "") ||
          (request.method === "POST" && request.headers.get("x-garden-action") !== "update-backups")) {
        return Response.json({ error: "Open private Garden and use Check & update backups." }, { status: 403, headers });
      }
      return Response.json(request.method === "POST" ? backupUpdate.start() : backupUpdate.status(), { headers });
    }
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
    if (path === "/operations/api/database-viewer") {
      if (request.method === "HEAD") return new Response(null, { headers });
      if (["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") || "") ||
          (request.headers.has("origin") && ![url.origin, new URL(config.gatewayUrl).origin].includes(request.headers.get("origin")!))) {
        return Response.json({ error: "Open the viewer from private Garden." }, { status: 403, headers });
      }
      try {
        const inventory = await snapshot();
        return Response.json(await readDatabasePage(inventory.databases, url.searchParams), { headers });
      } catch (error) {
        return Response.json({ error: error instanceof DatabaseViewError ? error.message : "Database viewer unavailable. Try again." },
          { status: error instanceof DatabaseViewError ? error.status : 503, headers });
      }
    }
    if (path === "/operations/api/inventory") {
      try {
        const inventory = await snapshot(url.searchParams.get("fresh") === "1");
        const databases = await Promise.all(inventory.databases.map(async row => ({ ...row, viewerKey: createHash("sha256").update(row.id).digest("hex").slice(0, 24), viewer: await databaseViewerCapability(row) })));
        return Response.json({ ...inventory, databases }, { headers });
      }
      catch { return Response.json({ error: "Inventory unavailable; check the private gateway logs." }, { status: 503, headers }); }
    }
    const file = path === "/operations/client.js" ? "client.js" : null;
    if (!file) return new Response("Not found", { status: 404, headers });
    return new Response(request.method === "HEAD" ? null : Bun.file(join(import.meta.dir, file)), { headers: { ...headers, "content-type": file.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8" } });
  };
}
