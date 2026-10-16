import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

export type Access = "public" | "private";
export type RealmKind = "app" | "agent";
export type AtlasArt = string;

export type AuthorProfile = {
  name: string;
  handle: string;
  profileUrl: string;
};

export type AtlasLink = {
  to: string;
  bend?: number;
};

export type AtlasNode = {
  x: number;
  y: number;
  art: AtlasArt;
  scale: number;
  links?: AtlasLink[];
};

export type RouteConfig = {
  prefix: string;
  label: string;
  title: string;
  description: string;
  category: string;
  kind: RealmKind;
  icon: string;
  authorId: string;
  repositoryUrl: string;
  targetOrigin: string;
  bufferMedia?: boolean;
  entryPath?: string;
  stripPrefix?: boolean;
  assetQuery?: string;
  rewriteVitePreloadBase?: boolean;
  listed?: boolean;
  websocketOnly?: boolean;
  websocketPaths?: string[];
  allowedWebSocketOrigins?: string[];
  upstreamWebSocketOrigin?: string;
  upstreamWebSocketProtocol?: string;
  kasmHttpTransport?: boolean;
  rootQuery?: Record<string, string>;
  webSocketBridgeBase?: string;
  atlas: AtlasNode;
};

export type RouterConfig = {
  title: string;
  description?: string;
  access: Access;
  gatewayUrl: string;
  authors: Record<string, AuthorProfile>;
  routes: RouteConfig[];
};

function normalizePrefix(value: string): string {
  const raw = value.trim();
  if (!raw || raw === "/") throw new Error(`Invalid route prefix: ${value}`);
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "");
}

export function validateAuthors(routes: RouteConfig[], authors: Record<string, AuthorProfile>): void {
  for (const [id, author] of Object.entries(authors)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !author.name || !author.handle || !/^https:\/\//.test(author.profileUrl)) {
      throw new Error(`Invalid author profile: ${id}`);
    }
  }
  for (const route of routes) {
    if (!route.authorId || !authors[route.authorId]) {
      throw new Error(`Unknown author for ${route.label}: ${route.authorId || "missing"}`);
    }
  }
}

export function loadConfig(file: string): RouterConfig {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as RouterConfig;
  const authors = JSON.parse(readFileSync(join(import.meta.dir, "authors.json"), "utf8")) as Record<string, AuthorProfile>;
  if (!parsed.routes?.length) throw new Error(`No routes defined in ${file}`);
  if (parsed.access !== "public" && parsed.access !== "private") {
    throw new Error(`Invalid access level in ${file}`);
  }
  parsed.gatewayUrl = parsed.gatewayUrl.replace(/\/+$/, "");
  parsed.authors = authors;
  const catalogue = JSON.parse(readFileSync(join(import.meta.dir, "catalogue.json"), "utf8")) as Record<Access, Record<string, Partial<RouteConfig>>>;
  const fields = ["title", "description", "category", "kind", "icon", "authorId", "repositoryUrl", "atlas", "entryPath", "listed"];
  parsed.routes = parsed.routes.map(route => {
    const metadata = catalogue[parsed.access]?.[route.label];
    if (!metadata) throw new Error(`Missing catalogue metadata for ${parsed.access}:${route.label}`);
    return { ...route, ...Object.fromEntries(Object.entries(metadata).filter(([key]) => fields.includes(key))),
      prefix: normalizePrefix(route.prefix), targetOrigin: route.targetOrigin.replace(/\/+$/, "") };
  });
  validateAuthors(parsed.routes, authors);
  for (const route of parsed.routes) {
    if (!(["app", "agent"] as string[]).includes(route.kind)) {
      throw new Error(`Invalid realm kind for ${route.label}: ${route.kind}`);
    }
    if (!route.label || !route.atlas || !Number.isFinite(route.atlas.x) || !Number.isFinite(route.atlas.y)) {
      throw new Error(`Invalid atlas placement for ${route.label || route.prefix}`);
    }
    if (!(route.atlas.scale > 0) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route.atlas.art)) {
      throw new Error(`Invalid atlas artwork for ${route.label}`);
    }
    if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(route.repositoryUrl)) {
      throw new Error(`Invalid GitHub repository URL for ${route.label}`);
    }
  }
  return parsed;
}

export function loadCatalogConfigs(configFile: string): RouterConfig[] {
  const root = dirname(configFile);
  const configs = ["public.routes.json", "private.routes.json"].map((file) => loadConfig(join(root, file)));
  validateAtlasGraph(configs);
  return configs;
}

export function validateAtlasGraph(configs: RouterConfig[]): void {
  const routes = configs.flatMap((config) => config.routes.filter((route) => route.listed !== false));
  const ids = new Set<string>();
  for (const route of routes) {
    if (ids.has(route.label)) throw new Error(`Duplicate realm label: ${route.label}`);
    ids.add(route.label);
  }
  const edges = new Set<string>();
  for (const route of routes) {
    for (const link of route.atlas.links ?? []) {
      if (!ids.has(link.to)) throw new Error(`Unknown atlas link from ${route.label} to ${link.to}`);
      if (link.to === route.label) throw new Error(`Atlas realm cannot link to itself: ${route.label}`);
      const edge = [route.label, link.to].sort().join("::");
      if (edges.has(edge)) throw new Error(`Duplicate atlas link: ${edge}`);
      edges.add(edge);
    }
  }
}
