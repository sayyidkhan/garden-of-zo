import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

export type Access = "public" | "private";
export type RealmKind = "app" | "workflow" | "agent";
export type AtlasArt = string;

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
  repositoryUrl: string;
  targetOrigin: string;
  entryPath?: string;
  stripPrefix?: boolean;
  assetQuery?: string;
  atlas: AtlasNode;
};

export type RouterConfig = {
  title: string;
  description?: string;
  access: Access;
  gatewayUrl: string;
  routes: RouteConfig[];
};

type TrafficSample = {
  at: number;
  application: string;
  receivedBytes: number;
  sentBytes: number;
  requestCount: number;
  errorCount: number;
};

const iconPaths: Record<string, string> = {
  network: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="m8 7 3 9m5-9-3 9M8 6h8"/>',
  spark: '<path d="m12 3-1.4 4.1a5 5 0 0 1-3.2 3.2L3 12l4.4 1.7a5 5 0 0 1 3.2 3.2L12 21l1.4-4.1a5 5 0 0 1 3.2-3.2L21 12l-4.4-1.7a5 5 0 0 1-3.2-3.2L12 3Z"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M3 10h18"/>',
  play: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18.5v-13Z"/><path d="m10 9 5 3-5 3V9Z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m5 18 5-5 3 3 2-2 4 4"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>'
};

function normalizePrefix(value: string): string {
  const raw = value.trim();
  if (!raw || raw === "/") throw new Error(`Invalid route prefix: ${value}`);
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "");
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] as string);
}

export function loadConfig(file: string): RouterConfig {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as RouterConfig;
  if (!parsed.routes?.length) throw new Error(`No routes defined in ${file}`);
  if (parsed.access !== "public" && parsed.access !== "private") {
    throw new Error(`Invalid access level in ${file}`);
  }
  parsed.gatewayUrl = parsed.gatewayUrl.replace(/\/+$/, "");
  parsed.routes = parsed.routes.map((route) => ({
    ...route,
    prefix: normalizePrefix(route.prefix),
    targetOrigin: route.targetOrigin.replace(/\/+$/, "")
  }));
  for (const route of parsed.routes) {
    if (!(["app", "workflow", "agent"] as string[]).includes(route.kind)) {
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
  const routes = configs.flatMap((config) => config.routes);
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

type Point = { x: number; y: number };

function atlasRouteGeometry(from: Point, to: Point, bend = 0) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const c1 = { x: from.x + dx / 3 + normalX * bend, y: from.y + dy / 3 + normalY * bend };
  const c2 = { x: from.x + dx * 2 / 3 + normalX * bend, y: from.y + dy * 2 / 3 + normalY * bend };
  const terminal = (anchor: Point, control: Point) => {
    const tx = control.x - anchor.x;
    const ty = control.y - anchor.y;
    const length = Math.max(1, Math.hypot(tx, ty));
    const ux = tx / length;
    const uy = ty / length;
    return `M ${Math.round(anchor.x + ux * 27)} ${Math.round(anchor.y + uy * 27)} L ${Math.round(anchor.x + ux * 76)} ${Math.round(anchor.y + uy * 76)}`;
  };
  return {
    path: `M ${from.x} ${from.y} C ${Math.round(c1.x)} ${Math.round(c1.y)}, ${Math.round(c2.x)} ${Math.round(c2.y)}, ${to.x} ${to.y}`,
    fromTerminal: terminal(from, c1),
    toTerminal: terminal(to, c2)
  };
}

function icon(name: string, className = "icon"): string {
  const paths = iconPaths[name] ?? iconPaths.compass;
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export function renderIndex(current: RouterConfig, catalog: RouterConfig[]): string {
  const allApps = catalog.flatMap((gateway) => gateway.routes.map((route) => ({ gateway, route })));
  const publicCount = allApps.filter(({ gateway }) => gateway.access === "public").length;
  const privateCount = allApps.length - publicCount;
  const kindCounts = {
    app: allApps.filter(({ route }) => route.kind === "app").length,
    workflow: allApps.filter(({ route }) => route.kind === "workflow").length,
    agent: allApps.filter(({ route }) => route.kind === "agent").length
  };
  const nodeHalfWidth = 135;
  const nodeBeaconOffset = 54;
  const appEntries = allApps.map(({ gateway, route }, index) => {
    const restricted = gateway.access === "private";
    const sameGateway = gateway.access === current.access;
    const routeHref = `${route.prefix}${route.entryPath ?? ""}`;
    const href = sameGateway ? routeHref : `${gateway.gatewayUrl}${routeHref}`;
    const accessLabel = restricted ? "Owner access" : "Open access";
    const action = "Enter realm";

    return { gateway, route, index, restricted, href, accessLabel, action };
  });
  const nodes = appEntries.map(({ gateway, route, index, restricted, href, accessLabel, action }) => {
    const position = route.atlas;
    const artFile = `garden-realm-${position.art}.webp`;
    return `<article class="kingdom-node kingdom-node--${position.art} ${restricted ? "kingdom-node--private" : ""}" data-atlas-card data-sky-node data-node-index="${index}" data-node-title="${escapeHtml(route.title)}" data-access="${gateway.access}" data-kind="${route.kind}" style="--order:${index};--node-x:${position.x - nodeHalfWidth}px;--node-y:${position.y - nodeBeaconOffset}px;--node-scale:${position.scale}">
      <button class="kingdom-node__island" type="button" data-atlas-select aria-label="Focus on ${escapeHtml(route.title)}" aria-pressed="false">
        <span class="kingdom-node__art" aria-hidden="true">
          <span class="kingdom-node__halo"></span>
          <img src="/assets/${artFile}" alt="" decoding="async" draggable="false" />
        </span>
        <span class="kingdom-node__beacon" aria-hidden="true">${icon(route.icon)}<i></i></span>
      </button>
      <div class="kingdom-node__label">
        <span class="kingdom-node__number">${String(index + 1).padStart(2, "0")}</span>
        <div><span class="kingdom-node__category">${escapeHtml(route.category)}</span><h2>${escapeHtml(route.title)}</h2></div>
        <span class="kingdom-node__access">${restricted ? icon("lock", "badge-icon") : ""}${accessLabel}</span>
        <div class="kingdom-node__actions">
          <a class="kingdom-node__enter" href="${escapeHtml(href)}" aria-label="${action}: ${escapeHtml(route.title)}"><span>${action}</span><span aria-hidden="true">&nearr;</span></a>
          <a class="kingdom-node__github" href="${escapeHtml(route.repositoryUrl)}" target="_blank" rel="noreferrer" aria-label="View ${escapeHtml(route.title)} on GitHub"><span>GitHub</span><span aria-hidden="true">&nearr;</span></a>
        </div>
      </div>
    </article>`;
  }).join("");
  const entryById = new Map(appEntries.map((entry) => [entry.route.label, entry]));
  const graphLinks = appEntries.flatMap((from) => (from.route.atlas.links ?? []).map((link) => {
    const to = entryById.get(link.to)!;
    return { from, to, geometry: atlasRouteGeometry(from.route.atlas, to.route.atlas, link.bend) };
  }));
  const routes = graphLinks.map(({ from, to, geometry }) => `<path data-sky-route data-from="${from.index}" data-to="${to.index}" d="${geometry.path}" />`).join("");
  const routeTerminals = graphLinks.map(({ from, to, geometry }) => `<path data-sky-route-terminal data-from="${from.index}" data-to="${to.index}" d="${geometry.fromTerminal}" /><path data-sky-route-terminal data-from="${from.index}" data-to="${to.index}" d="${geometry.toTerminal}" />`).join("");
  const minimapRoutes = graphLinks.map(({ from, to, geometry }) => `<path data-minimap-route data-from="${from.index}" data-to="${to.index}" d="${geometry.path}" />`).join("");
  const minimapNodes = appEntries.map(({ gateway, route, index }) => {
    const position = route.atlas;
    return `<circle data-minimap-node data-node-index="${index}" data-access="${gateway.access}" data-kind="${route.kind}" cx="${position.x}" cy="${position.y}" r="26" />`;
  }).join("");
  const listCards = appEntries.map(({ gateway, route, index, restricted, href, accessLabel, action }) => {
    const artFile = `garden-realm-${route.atlas.art}.webp`;
    return `<article class="realm-row ${restricted ? "realm-row--private" : ""}" data-list-card data-access="${gateway.access}" data-kind="${route.kind}" style="--order:${index}">
      <span class="realm-row__number">${String(index + 1).padStart(2, "0")}</span>
      <span class="realm-row__visual realm-row__visual--${route.atlas.art}" aria-hidden="true">
        <img class="realm-row__kingdom" src="/assets/${artFile}" alt="" loading="lazy" decoding="async" />
        <span class="realm-row__icon">${icon(route.icon)}</span>
      </span>
      <div class="realm-row__identity">
        <span class="realm-row__category">${escapeHtml(route.category)}</span>
        <h3>${escapeHtml(route.title)}</h3>
      </div>
      <p>${escapeHtml(route.description)}</p>
      <span class="access-badge ${restricted ? "access-badge--private" : ""}">
        ${restricted ? icon("lock", "badge-icon") : ""}${accessLabel}
      </span>
      <div class="realm-row__actions">
        <a class="realm-row__link realm-row__link--enter" href="${escapeHtml(href)}" aria-label="${action}: ${escapeHtml(route.title)}">
          <span>${action}</span><span aria-hidden="true">&nearr;</span>
        </a>
        <a class="realm-row__link realm-row__link--github" href="${escapeHtml(route.repositoryUrl)}" target="_blank" rel="noreferrer" aria-label="View ${escapeHtml(route.title)} on GitHub">
          <span>View GitHub</span><span aria-hidden="true">&nearr;</span>
        </a>
      </div>
    </article>`;
  }).join("");

  const viewLabel = current.access === "private" ? "Owner's atlas" : "Open sky atlas";
  const heroCopy = current.access === "private"
    ? "Your private command deck for every realm in the garden."
    : "A constellation of tools, agents and experiments growing on one personal cloud computer.";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#071721" />
  <meta name="description" content="${escapeHtml(current.description ?? "A catalogue of apps growing on Zo Computer.")}" />
  <title>Garden of Zo</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="preload" href="/assets/garden-sky-v2.webp" as="image" fetchpriority="high" />
  <style>
    :root {
      color-scheme: dark;
      --ink: #f8f2df;
      --muted: #b7c5c2;
      --night: #06151d;
      --deep: #0a2229;
      --glass: rgba(8, 28, 33, .72);
      --line: rgba(224, 205, 157, .18);
      --gold: #e4c178;
      --coral: #dd7d66;
      --mint: #8ac7b4;
      --serif: "Cormorant Garamond", "Iowan Old Style", "Palatino Linotype", serif;
      --sans: "Avenir Next", "Century Gothic", sans-serif;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; background: var(--night); }
    body { margin: 0; min-width: 320px; background: var(--night); color: var(--ink); font-family: var(--sans); }
    a { color: inherit; }
    button { font: inherit; }
    .shell { position: relative; overflow: hidden; min-height: 100vh; background: radial-gradient(circle at 20% 5%, #174b55 0, transparent 36rem), linear-gradient(180deg, #071721 0%, #0b2830 55%, #06151d 100%); }
    .shell::before { content: ""; position: fixed; inset: 0; pointer-events: none; opacity: .12; z-index: 10; background-image: radial-gradient(circle, rgba(255,255,255,.42) 0 .6px, transparent .8px); background-size: 5px 5px; }
    .hero { position: relative; min-height: 100svh; isolation: isolate; }
    .hero__art { position: absolute; inset: 0; background: url('/assets/garden-sky-v2.webp') center center / cover no-repeat; transform: scale(1.025); animation: reveal-art 1.6s cubic-bezier(.2,.7,.2,1) both; }
    .hero__art::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(3,16,22,.89) 0%, rgba(3,16,22,.57) 38%, rgba(3,16,22,.03) 72%), linear-gradient(180deg, rgba(4,18,25,.48) 0%, transparent 28%, rgba(6,21,29,.18) 64%, #0a252d 100%); }
    .hero__kingdom, .hero__pegasus { position: absolute; z-index: 2; pointer-events: none; }
    .hero__kingdom { animation: kingdom-float 9s ease-in-out infinite alternate; }
    .hero__kingdom::before { content: ""; position: absolute; z-index: -1; left: 17%; right: 16%; bottom: 5%; height: 14%; border-radius: 50%; background: rgba(0, 8, 13, .94); filter: blur(10px); transform: skewX(-12deg); opacity: .98; }
    .hero__kingdom img { display: block; width: 100%; height: auto; filter: drop-shadow(0 34px 13px rgba(0, 7, 11, .88)); }
    .hero__kingdom--main { top: 2px; right: -2%; width: min(48vw, 690px); z-index: 3; }
    .hero__kingdom--observatory { top: 85px; right: 43%; width: min(21vw, 300px); opacity: .96; animation-delay: -4s; }
    .hero__kingdom--outpost { top: 250px; right: 30%; width: min(17vw, 240px); opacity: .92; animation-delay: -7s; }
    .hero__pegasus { right: -6%; bottom: 80px; width: min(59vw, 860px); z-index: 4; animation: pegasus-soar 11s ease-in-out infinite alternate; }
    .hero__pegasus img { display: block; width: 100%; height: auto; filter: drop-shadow(0 24px 12px rgba(0, 8, 13, .8)); }
    .nav { position: relative; z-index: 4; display: flex; align-items: center; justify-content: space-between; width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 26px 0; border-bottom: 1px solid rgba(255,255,255,.16); }
    .brand { display: inline-flex; align-items: center; gap: 12px; text-decoration: none; font-family: var(--serif); font-weight: 700; letter-spacing: .04em; font-size: 1.2rem; }
    .brand__mark { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid rgba(244,216,155,.5); border-radius: 50%; color: var(--gold); background: rgba(6,21,29,.46); backdrop-filter: blur(12px); }
    .brand__mark svg { width: 21px; }
    .nav__status { display: flex; align-items: center; gap: 9px; padding: 9px 13px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; background: rgba(5,20,27,.46); backdrop-filter: blur(12px); color: #e7eee8; font-size: .76rem; font-weight: 700; letter-spacing: .08em; text-decoration: none; text-transform: uppercase; }
    .nav__status::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--mint); box-shadow: 0 0 14px var(--mint); }
    .hero__content { position: relative; z-index: 3; width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 132px 0 190px; }
    .eyebrow { margin: 0 0 22px; color: #f1d9a2; font-size: .76rem; font-weight: 800; letter-spacing: .2em; text-transform: uppercase; }
    .hero h1 { max-width: 720px; margin: 0; font: 600 clamp(4.6rem, 10vw, 8.6rem)/.78 var(--serif); letter-spacing: -.055em; text-wrap: balance; text-shadow: 0 8px 50px rgba(0,0,0,.4); }
    .hero h1 em { display: block; color: #f2d59b; font-weight: 400; }
    .hero__lede { max-width: 590px; margin: 34px 0 0; color: #e4ebe5; font: 400 clamp(1rem, 2vw, 1.2rem)/1.7 var(--sans); text-shadow: 0 2px 20px #06151d; }
    .hero__footer { display: flex; align-items: center; gap: 26px; margin-top: 42px; }
    .explore { display: inline-flex; align-items: center; gap: 12px; padding: 14px 19px; border-radius: 999px; color: #142026; background: var(--ink); font-size: .82rem; font-weight: 800; letter-spacing: .04em; text-decoration: none; transition: transform .25s ease, background .25s ease; }
    .explore:hover { transform: translateY(-3px); background: #fffaf0; }
    .hero__count { color: #d9e3dd; font: 500 .78rem/1.4 var(--sans); letter-spacing: .08em; text-transform: uppercase; }
    .hero__count strong { color: var(--gold); }
    .hero[hidden], .catalogue[hidden], .footer[hidden] { display: none; }
    .catalogue { position: relative; z-index: 3; width: min(1180px, calc(100% - 40px)); min-height: 100svh; margin: 0 auto; padding: 28px 0 70px; }
    .catalogue__nav { display: flex; align-items: center; justify-content: space-between; padding-bottom: 22px; border-bottom: 1px solid rgba(255,255,255,.14); }
    .catalogue__return { display: inline-flex; align-items: center; gap: 9px; padding: 10px 14px; border: 1px solid rgba(228,193,120,.28); border-radius: 999px; color: #d5e1dc; background: rgba(3,18,23,.48); font-size: .7rem; font-weight: 800; letter-spacing: .08em; text-decoration: none; text-transform: uppercase; transition: transform .2s, border-color .2s; }
    .catalogue__return:hover { transform: translateY(-2px); border-color: rgba(228,193,120,.65); }
    .catalogue__head { display: grid; grid-template-columns: 1fr; align-items: start; gap: 24px; margin-bottom: 28px; }
    .catalogue__nav + .catalogue__head { margin-top: 54px; }
    .catalogue__head h2 { margin: 0; max-width: none; font: 500 clamp(2.8rem, 6vw, 5.2rem)/.94 var(--serif); letter-spacing: -.035em; white-space: nowrap; }
    .catalogue__head p { max-width: none; margin: 18px 0 0; color: var(--muted); line-height: 1.65; white-space: nowrap; }
    .catalogue__tools { display: flex; justify-content: flex-end; min-width: 0; width: 100%; }
    .catalogue__commandbar { display: flex; align-items: center; justify-content: flex-end; gap: 5px; min-width: 0; max-width: 100%; padding: 5px; border: 1px solid rgba(228,193,120,.24); border-radius: 18px; background: rgba(3,18,23,.78); box-shadow: 0 14px 34px rgba(0,0,0,.2); overflow-x: auto; scrollbar-width: none; }
    .catalogue__commandbar::-webkit-scrollbar { display: none; }
    .view-toggle, .filters, .realm-kind-filters { display: flex; flex: none; gap: 3px; }
    .view-toggle__button { display: inline-flex; align-items: center; gap: 7px; border: 0; border-radius: 12px; padding: 9px 11px; color: #94aaa6; background: transparent; cursor: pointer; font-size: .66rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; white-space: nowrap; transition: color .2s, background .2s, box-shadow .2s; }
    .view-toggle__button svg { width: 16px; height: 16px; }
    .view-toggle__button[aria-pressed="true"] { color: #101b20; background: linear-gradient(135deg, #fff0bd, var(--gold)); box-shadow: 0 0 0 1px rgba(255,240,189,.72), 0 7px 22px rgba(228,193,120,.38); }
    .filter { border: 0; border-radius: 10px; padding: 9px 10px; color: #aebfbb; background: transparent; cursor: pointer; font-size: .66rem; font-weight: 800; letter-spacing: .03em; white-space: nowrap; transition: color .2s, background .2s; }
    .filter[aria-pressed="true"] { color: #101b20; background: #fff7e3; box-shadow: 0 0 0 1px rgba(255,255,255,.72), 0 5px 16px rgba(248,242,223,.2); }
    .commandbar__divider { flex: none; width: 1px; height: 24px; margin: 0 3px; background: rgba(228,193,120,.2); }
    body.is-atlas-view { overflow: hidden; }
    body.is-atlas-view .shell { height: 100svh; min-height: 0; overflow: hidden; }
    body.is-atlas-view .catalogue { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; grid-template-columns: minmax(0, 1fr); width: 100%; height: 100svh; min-height: 0; margin: 0; padding: 0; overflow: hidden; }
    body.is-atlas-view .catalogue[hidden] { display: none; }
    body.is-atlas-view .catalogue__nav { width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 14px 0; }
    body.is-atlas-view .catalogue__nav + .catalogue__head { margin-top: 0; }
    body.is-atlas-view .catalogue__head { display: block; grid-row: 3; width: 100%; min-width: 0; margin: 0; padding: 9px max(20px, calc((100vw - 1180px) / 2)) max(9px, env(safe-area-inset-bottom)); border-top: 1px solid rgba(228,193,120,.13); background: linear-gradient(180deg, rgba(3,18,23,.9), rgba(3,18,23,.98)); box-shadow: 0 -16px 42px rgba(0,0,0,.24); overflow: hidden; }
    body.is-atlas-view .catalogue__intro { display: none; }
    body.is-atlas-view .catalogue__tools { display: flex; justify-content: center; width: 100%; }
    body.is-atlas-view .catalogue__commandbar { width: max-content; }
    body.is-atlas-view .atlas { display: grid; grid-row: 2; grid-template-rows: auto minmax(0, 1fr) 3px; width: 100%; max-width: 100vw; min-height: 0; margin: 0; }
    body.is-atlas-view .atlas__bar { padding-block: 10px; }
    body.is-atlas-view .atlas__viewport { height: auto; min-height: 0; }
    body.is-atlas-view .legend, body.is-atlas-view .footer { display: none; }
    .atlas { position: relative; width: 100vw; margin-left: calc(50% - 50vw); border-block: 1px solid rgba(228,193,120,.13); background: radial-gradient(circle at 16% 18%, rgba(58,111,115,.18), transparent 24rem), radial-gradient(circle at 78% 64%, rgba(221,125,102,.09), transparent 28rem), linear-gradient(180deg, rgba(4,18,25,.64), rgba(6,29,35,.94)); overflow: hidden; }
    .atlas::before { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .3; background-image: radial-gradient(circle, rgba(244,230,196,.8) 0 1px, transparent 1.5px); background-size: 67px 67px; mask-image: linear-gradient(90deg, transparent, black 12%, black 88%, transparent); }
    .atlas__bar { position: relative; z-index: 3; display: flex; align-items: center; justify-content: space-between; gap: 20px; width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 20px 0; }
    .atlas__status { display: flex; align-items: center; gap: 12px; color: #d6e3df; font-size: .76rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    .atlas__status::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 18px rgba(228,193,120,.9); }
    .atlas__hint { color: #849c99; font-weight: 500; letter-spacing: .04em; }
    .atlas__controls { display: flex; align-items: center; gap: 8px; }
    .atlas__node-controls, .atlas__zoom-controls { display: flex; align-items: center; gap: 8px; }
    .atlas__control { display: grid; place-items: center; min-width: 42px; height: 42px; padding: 0 13px; border: 1px solid rgba(228,193,120,.25); border-radius: 999px; color: var(--ink); background: rgba(6,25,31,.7); cursor: pointer; font-size: .72rem; font-weight: 900; letter-spacing: .04em; transition: transform .2s, border-color .2s, background .2s; }
    .atlas__control:hover:not(:disabled) { transform: translateY(-2px); border-color: rgba(228,193,120,.66); background: rgba(25,54,58,.9); }
    .atlas__control:disabled { cursor: default; opacity: .28; }
    .atlas__location { display: grid; grid-template-columns: auto minmax(100px, 160px); align-items: center; gap: 9px; min-height: 42px; padding: 6px 12px; border: 1px solid rgba(228,193,120,.58); border-radius: 999px; background: linear-gradient(135deg, rgba(54,47,31,.96), rgba(4,22,28,.94)); box-shadow: inset 0 0 0 1px rgba(255,240,189,.06), 0 0 24px rgba(228,193,120,.15); }
    .atlas__location small { color: var(--gold); font-size: .56rem; font-weight: 900; letter-spacing: .12em; }
    .atlas__location strong { overflow: hidden; color: #dce8e3; font: 700 .78rem/1.1 var(--serif); text-overflow: ellipsis; white-space: nowrap; }
    .atlas__viewport { position: relative; z-index: 2; height: min(720px, 72vh); min-height: 540px; overflow: auto; overscroll-behavior: contain; scrollbar-width: none; cursor: grab; touch-action: none; contain: layout paint style; background: radial-gradient(circle at 50% 45%, rgba(67,130,132,.1), transparent 34rem); }
    .atlas__viewport::-webkit-scrollbar { display: none; }
    .atlas__viewport.is-dragging { cursor: grabbing; user-select: none; }
    .atlas__canvas { position: relative; width: calc(2240px * var(--atlas-zoom, .8)); height: calc(1080px * var(--atlas-zoom, .8)); margin-inline: auto; }
    .atlas__world { position: absolute; inset: 0 auto auto 0; width: 2240px; height: 1080px; transform: scale(var(--atlas-zoom, .8)); transform-origin: left top; contain: layout paint style; isolation: isolate; background-image: radial-gradient(ellipse at 52% 54%, rgba(67,130,132,.13), transparent 52%), radial-gradient(circle, rgba(244,230,196,.72) 0 1px, transparent 1.5px); background-size: 100% 100%, 83px 83px; }
    .atlas__viewport.is-zooming .atlas__world { will-change: transform; }
    .sky-routes, .sky-route-terminals { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
    .sky-routes { z-index: 1; }
    .sky-route-terminals { z-index: 4; }
    .sky-routes path, .sky-route-terminals path { fill: none; stroke: rgba(228,193,120,.78); stroke-width: 3; stroke-dasharray: 4 14; stroke-linecap: round; animation: route-drift 20s linear infinite; }
    .sky-route-terminals path { stroke: rgba(255,225,157,.94); }
    .sky-routes path.is-hidden, .sky-route-terminals path.is-hidden { display: none; }
    .atlas__pegasus { position: absolute; z-index: 2; left: 1060px; top: 285px; width: 330px; height: auto; aspect-ratio: 520 / 293; object-fit: contain; opacity: .58; pointer-events: none; animation: pegasus-map 11s ease-in-out infinite alternate; }
    .kingdom-node { position: absolute; z-index: 3; left: var(--node-x); top: var(--node-y); width: 270px; height: 260px; contain: layout style; animation: kingdom-node-arrive .7s calc(var(--order) * 65ms) both; }
    .kingdom-node[hidden] { display: none; }
    .kingdom-node__island { position: absolute; inset: 0 0 auto; width: 100%; height: 175px; display: grid; place-items: center; padding: 0; border: 0; color: inherit; background: transparent; cursor: pointer; }
    .kingdom-node__island:focus-visible { outline: none; }
    .kingdom-node__island:focus-visible .kingdom-node__beacon { outline: 3px solid #fff3c9; outline-offset: 5px; }
    .kingdom-node__art { position: absolute; inset: 0; display: grid; place-items: center; transform: scale(var(--node-scale)); transform-origin: center bottom; will-change: transform; animation: kingdom-art-float 9s calc(var(--order) * -1.3s) ease-in-out infinite alternate; transition: transform .3s, opacity .3s; }
    .kingdom-node__art::before, .kingdom-node__art::after { content: ""; position: absolute; pointer-events: none; opacity: 0; }
    .kingdom-node__art::before { z-index: 3; inset: -18px -8px 8px; background: radial-gradient(circle at 12% 34%, #fff8d7 0 2px, transparent 3px), radial-gradient(circle at 26% 13%, #e4c178 0 2px, transparent 3.5px), radial-gradient(circle at 48% 4%, #fff8d7 0 1.5px, transparent 3px), radial-gradient(circle at 73% 17%, #fff0bd 0 2px, transparent 3.5px), radial-gradient(circle at 91% 40%, #e4c178 0 2px, transparent 3.5px), radial-gradient(circle at 78% 68%, #fff8d7 0 1.5px, transparent 3px), radial-gradient(circle at 18% 72%, #fff0bd 0 2px, transparent 3.5px); transform: scale(.72) rotate(-5deg); }
    .kingdom-node__art::after { z-index: 0; inset: 22px 24px 8px; border-radius: 50%; background: radial-gradient(ellipse, rgba(255,240,189,.48), rgba(228,193,120,.14) 46%, transparent 73%); transform: scale(.78); transition: opacity .28s ease, transform .35s ease; }
    .kingdom-node:hover .kingdom-node__art, .kingdom-node:focus-within .kingdom-node__art { transform: scale(calc(var(--node-scale) * 1.08)) translateY(-8px); opacity: .94; }
    .kingdom-node__art img { position: relative; z-index: 2; display: block; width: 230px; height: 175px; object-fit: contain; }
    .kingdom-node--main .kingdom-node__art img { width: 265px; }
    .kingdom-node:nth-of-type(3n+2) .kingdom-node__art img { transform: scaleX(-1); }
    .kingdom-node__halo { position: absolute; z-index: 1; width: 180px; height: 54px; border-radius: 50%; transform: translateY(48px) scaleY(.7); background: radial-gradient(ellipse, rgba(0,7,11,.9), rgba(15,47,49,.4) 48%, transparent 74%); box-shadow: 0 18px 32px rgba(0,0,0,.34); }
    .kingdom-node--private .kingdom-node__halo { background: radial-gradient(ellipse, rgba(0,7,11,.92), rgba(81,45,39,.38) 48%, transparent 74%); }
    .kingdom-node__beacon { position: absolute; z-index: 4; left: 50%; top: 28px; display: grid; place-items: center; width: 52px; height: 52px; transform: translateX(-50%); border: 1px solid rgba(228,193,120,.7); border-radius: 50%; color: var(--gold); background: rgba(4,22,28,.9); box-shadow: 0 0 0 8px rgba(228,193,120,.06), 0 0 28px rgba(228,193,120,.42); }
    .kingdom-node__beacon svg { width: 21px; height: 21px; }
    .kingdom-node__beacon i { position: absolute; inset: -9px; border: 1px solid rgba(138,199,180,.28); border-radius: inherit; animation: beacon-pulse 2.8s ease-out infinite; }
    .kingdom-node.is-active { z-index: 6; }
    .kingdom-node.is-active .kingdom-node__art { transform: scale(calc(var(--node-scale) * 1.08)) translateY(-8px); opacity: 1; }
    .kingdom-node.is-active.is-arrived .kingdom-node__art::before { animation: kingdom-sparkle .9s cubic-bezier(.16,.8,.28,1) both; }
    .kingdom-node.is-active .kingdom-node__art::after { opacity: 1; transform: scale(1.05); }
    .kingdom-node.is-active .kingdom-node__beacon { border: 2px solid #fff3c9; color: #fff3c9; background: #1b2a2c; box-shadow: 0 0 0 6px rgba(255,240,189,.18), 0 0 0 13px rgba(228,193,120,.12), 0 0 50px rgba(228,193,120,.96); }
    .kingdom-node.is-active .kingdom-node__label { border: 2px solid #e4c178; background: linear-gradient(145deg, #28453f, #071b20); box-shadow: 0 22px 52px rgba(0,0,0,.58), 0 0 0 5px rgba(228,193,120,.1), 0 0 38px rgba(228,193,120,.34); }
    .kingdom-node--private:not(.is-active) .kingdom-node__beacon { border-color: rgba(221,125,102,.72); color: #e9b690; box-shadow: 0 0 0 8px rgba(221,125,102,.06), 0 0 28px rgba(221,125,102,.35); }
    .kingdom-node__label { position: absolute; z-index: 5; left: 50%; bottom: 0; width: 255px; min-height: 96px; transform: translateX(-50%); display: grid; grid-template-columns: 30px 1fr auto; align-items: center; gap: 8px; padding: 13px 14px; border: 1px solid rgba(228,193,120,.24); border-radius: 4px 20px 4px 20px; background: linear-gradient(145deg, #113136, #04161c); box-shadow: 0 20px 38px rgba(0,0,0,.38); }
    .kingdom-node--private:not(.is-active) .kingdom-node__label { background: linear-gradient(145deg, #322a2b, #0c191e); }
    .kingdom-node__number { color: #7e9793; font-size: .58rem; font-weight: 900; letter-spacing: .1em; }
    .kingdom-node__category { color: var(--coral); font-size: .52rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    .kingdom-node h2 { margin: 4px 0 0; font: 600 1.22rem/1 var(--serif); letter-spacing: -.02em; }
    .kingdom-node__access { align-self: start; display: flex; align-items: center; gap: 4px; color: #a7d0c4; font-size: .5rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
    .kingdom-node--private .kingdom-node__access { color: #e7bd9c; }
    .kingdom-node__actions { grid-column: 2 / -1; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.08); }
    .kingdom-node__actions a { position: relative; display: flex; justify-content: space-between; gap: 8px; overflow: hidden; padding: 5px 6px; border-radius: 6px; color: #f4e6c9; font-size: .5rem; font-weight: 900; letter-spacing: .07em; text-decoration: none; text-transform: uppercase; }
    .kingdom-node__github { color: #9fb8b3 !important; }
    .kingdom-node__enter::before { content: ""; position: absolute; inset: 0 -35%; pointer-events: none; background: linear-gradient(105deg, transparent 38%, rgba(255,248,215,.72) 50%, transparent 62%); transform: translateX(-100%); }
    .kingdom-node.is-active .kingdom-node__enter { color: #fff8df; background: rgba(228,193,120,.12); }
    .kingdom-node.is-active.is-arrived .kingdom-node__enter::before { animation: enter-realm-shimmer 2.4s ease-in-out infinite; }
    .access-badge { display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 999px; color: #b7ddd1; background: rgba(87,148,130,.14); font-size: .66rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .access-badge--private { color: #e9c9a6; background: rgba(221,125,102,.12); }
    .badge-icon { width: 12px; height: 12px; }
    .atlas__progress { position: relative; z-index: 3; height: 3px; background: rgba(255,255,255,.06); }
    .atlas__progress span { display: block; width: 18%; height: 100%; transform: translateX(0); background: linear-gradient(90deg, var(--mint), var(--gold)); box-shadow: 0 0 16px rgba(228,193,120,.5); transition: width .2s ease-out, transform .2s ease-out; }
    .atlas__minimap { position: absolute; z-index: 7; right: 22px; bottom: 22px; width: 220px; height: 112px; padding: 8px; border: 1px solid rgba(228,193,120,.36); border-radius: 14px; background: rgba(3,18,23,.9); box-shadow: 0 18px 44px rgba(0,0,0,.42); cursor: crosshair; touch-action: none; }
    .atlas__minimap:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
    .atlas__minimap svg { display: block; width: 100%; height: 100%; }
    .atlas__minimap path { fill: none; stroke: rgba(228,193,120,.48); stroke-width: 10; stroke-linecap: round; }
    .atlas__minimap path.is-hidden, .atlas__minimap circle.is-hidden { display: none; }
    .atlas__minimap circle { fill: var(--gold); stroke: #102c31; stroke-width: 12; }
    .atlas__minimap circle[data-access="private"] { fill: var(--coral); }
    .atlas__minimap rect { fill: rgba(138,199,180,.12); stroke: #b9e0d5; stroke-width: 9; vector-effect: non-scaling-stroke; }
    .atlas__viewport:is(.is-interacting, .is-zooming) .kingdom-node__art, .atlas__viewport:is(.is-interacting, .is-zooming) .atlas__pegasus, .atlas__viewport:is(.is-interacting, .is-zooming) .sky-routes path, .atlas__viewport:is(.is-interacting, .is-zooming) .sky-route-terminals path, .atlas__viewport:is(.is-interacting, .is-zooming) .kingdom-node__beacon i, .atlas__viewport:is(.is-interacting, .is-zooming) .kingdom-node__enter::before { animation-play-state: paused; }
    .hero.is-offscreen .hero__kingdom, .hero.is-offscreen .hero__pegasus { animation-play-state: paused; }
    .realm-list[hidden], .atlas[hidden] { display: none; }
    .realm-list { position: relative; width: 100vw; margin-left: calc(50% - 50vw); padding: 18px max(20px, calc(50vw - 590px)) 28px; border-block: 1px solid rgba(228,193,120,.13); background: radial-gradient(circle at 85% 12%, rgba(58,111,115,.16), transparent 28rem), linear-gradient(180deg, rgba(4,18,25,.72), rgba(6,29,35,.94)); }
    .realm-list__bar { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 4px 0 18px; color: #849c99; font-size: .7rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
    .realm-list__bar strong { color: var(--gold); }
    .realm-kind-filter { border: 0; border-radius: 10px; padding: 9px 10px; color: #91aaa6; background: transparent; cursor: pointer; font-size: .64rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; white-space: nowrap; transition: color .2s, background .2s; }
    .realm-kind-filter[aria-pressed="true"] { color: #101b20; background: linear-gradient(135deg, #fff0bd, var(--gold)); box-shadow: 0 0 0 1px rgba(255,240,189,.72), 0 5px 16px rgba(228,193,120,.3); }
    .realm-list__rows { border-top: 1px solid rgba(228,193,120,.18); }
    .realm-row { display: grid; grid-template-columns: 42px 104px minmax(150px, .85fr) minmax(240px, 1.5fr) auto 132px; align-items: center; gap: 18px; min-height: 144px; border-bottom: 1px solid rgba(228,193,120,.14); animation: rise .55s calc(var(--order) * 45ms) both; transition: background .2s, transform .2s; }
    .realm-row[hidden] { display: none; }
    .realm-row:hover { background: linear-gradient(90deg, rgba(138,199,180,.07), transparent); transform: translateX(5px); }
    .realm-row--private:hover { background: linear-gradient(90deg, rgba(221,125,102,.07), transparent); }
    .realm-row__number { color: #6f8784; font: 700 .66rem/1 var(--sans); letter-spacing: .12em; }
    .realm-row__visual { position: relative; display: block; width: 104px; height: 104px; }
    .realm-row__kingdom { position: absolute; left: 50%; top: 28px; display: block; width: 100px; height: 76px; transform: translateX(-50%); object-fit: contain; filter: drop-shadow(0 12px 8px rgba(0,0,0,.62)); }
    .realm-row__visual--main .realm-row__kingdom { width: 112px; }
    .realm-row__icon { position: absolute; z-index: 2; top: 0; left: 50%; display: grid; place-items: center; width: 44px; height: 44px; transform: translateX(-50%); border: 1px solid rgba(228,193,120,.6); border-radius: 50%; color: var(--gold); background: rgba(6,25,31,.96); box-shadow: 0 0 0 6px rgba(228,193,120,.06), 0 10px 22px rgba(0,0,0,.36); }
    .realm-row--private .realm-row__icon { border-color: rgba(221,125,102,.52); color: #e9b690; }
    .realm-row__icon svg { width: 20px; height: 20px; }
    .realm-row__category { color: var(--coral); font-size: .6rem; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; }
    .realm-row h3 { margin: 7px 0 0; font: 600 1.45rem/1 var(--serif); letter-spacing: -.02em; }
    .realm-row > p { margin: 0; color: #a9bbb7; font-size: .78rem; line-height: 1.55; }
    .realm-row__actions { display: grid; gap: 7px; min-width: 132px; }
    .realm-row__link { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #f4e6c9; font-size: .62rem; font-weight: 800; letter-spacing: .07em; text-decoration: none; text-transform: uppercase; }
    .realm-row__link--github { padding-top: 7px; border-top: 1px solid rgba(255,255,255,.08); color: #8fa8a3; }
    .realm-row__link span:last-child { color: var(--gold); font-size: 1.05rem; transition: transform .2s; }
    .realm-row__link:hover span:last-child { transform: translate(3px,-3px); }
    .legend { display: flex; justify-content: space-between; gap: 24px; margin-top: 34px; padding: 22px 0; border-top: 1px solid var(--line); color: #8fa5a2; font-size: .73rem; line-height: 1.6; }
    .legend strong { color: #d6e3df; }
    .legend__mark { color: var(--gold); text-transform: uppercase; letter-spacing: .14em; }
    .footer { position: relative; z-index: 3; display: flex; align-items: center; justify-content: space-between; width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 30px 0 40px; border-top: 1px solid var(--line); color: #829895; font-size: .72rem; letter-spacing: .06em; text-transform: uppercase; }
    @keyframes reveal-art { from { opacity: 0; transform: scale(1.09); } to { opacity: 1; transform: scale(1.025); } }
    @keyframes rise { from { opacity: 0; transform: translateY(32px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes beacon-pulse { 0% { opacity: .7; transform: scale(.82); } 75%, 100% { opacity: 0; transform: scale(1.38); } }
    @keyframes route-drift { to { stroke-dashoffset: -180; } }
    @keyframes kingdom-node-arrive { from { opacity: 0; } to { opacity: 1; } }
    @keyframes kingdom-art-float { from { translate: 0 -5px; } to { translate: 0 9px; } }
    @keyframes kingdom-sparkle { 0% { opacity: 0; transform: scale(.72) rotate(-5deg); } 28% { opacity: 1; } 72% { opacity: .9; } 100% { opacity: 0; transform: scale(1.2) rotate(6deg); } }
    @keyframes enter-realm-shimmer { 0%, 52% { transform: translateX(-100%); } 82%, 100% { transform: translateX(100%); } }
    @keyframes pegasus-map { from { transform: translate3d(0, 8px, 0) rotate(-2deg); } to { transform: translate3d(28px, -13px, 0) rotate(1deg); } }
    @keyframes kingdom-float { from { transform: translate3d(0, -5px, 0); } to { transform: translate3d(-18px, 13px, 0); } }
    @keyframes pegasus-soar { from { transform: translate3d(0, 0, 0) rotate(-1deg); } to { transform: translate3d(-24px, -17px, 0) rotate(1deg); } }
    @media (max-width: 900px) {
      .hero { min-height: 100svh; }
      .hero__art { background-position: 62% center; }
      .hero__art::after { background: linear-gradient(90deg, rgba(3,16,22,.9), rgba(3,16,22,.18)), linear-gradient(180deg, rgba(4,18,25,.35), transparent 35%, #0a252d 100%); }
      .hero__kingdom--main { top: 32px; right: -18%; width: min(67vw, 590px); opacity: .94; }
      .hero__kingdom--observatory { top: 122px; right: 42%; width: min(28vw, 230px); }
      .hero__kingdom--outpost { top: 286px; right: 24%; width: min(21vw, 175px); }
      .hero__pegasus { right: -20%; bottom: 42px; width: min(84vw, 690px); }
      .catalogue__head { grid-template-columns: 1fr; align-items: start; }
      .catalogue__tools { justify-items: start; }
      .realm-row { grid-template-columns: 36px 44px minmax(140px, .8fr) minmax(210px, 1.3fr) 126px; }
      .realm-row .access-badge { display: none; }
      .atlas__viewport { height: min(680px, 72vh); }
    }
    @media (max-width: 620px) {
      .nav { width: min(100% - 28px, 1180px); padding-top: 18px; }
      .nav__status { font-size: 0; padding: 11px; }
      .hero { min-height: 100svh; }
      .hero__art { background-position: 67% center; }
      .hero__kingdom--main { top: 25px; right: -35%; width: 94vw; opacity: .78; }
      .hero__kingdom--observatory { top: 105px; right: 54%; width: 37vw; opacity: .8; }
      .hero__kingdom--outpost { top: 315px; right: 15%; width: 30vw; opacity: .76; }
      .hero__pegasus { top: 210px; right: -42%; bottom: auto; width: 94vw; z-index: 2; opacity: .72; }
      .hero__content { width: min(100% - 32px, 1180px); padding: 98px 0 130px; }
      .hero h1 { font-size: clamp(4.1rem, 22vw, 6rem); }
      .hero__lede { max-width: 92%; font-size: .98rem; }
      .hero__footer { align-items: flex-start; flex-direction: column; gap: 18px; }
      .hero__count { padding: 6px 8px; margin-left: -8px; border-radius: 999px; background: rgba(3, 16, 22, .48); backdrop-filter: blur(8px); }
      .catalogue { width: min(100% - 28px, 1180px); padding-top: 72px; }
      .catalogue__nav { margin-top: -48px; }
      .catalogue__return { padding: 10px 12px; font-size: .62rem; }
      .catalogue__head h2 { font-size: 3.3rem; }
      .catalogue__head h2, .catalogue__head p { white-space: normal; }
      .catalogue__tools { width: 100%; }
      .catalogue__commandbar { justify-content: flex-start; border-radius: 14px; }
      .view-toggle__button { justify-content: center; }
      .filter { flex: none; }
      .atlas__bar { width: min(100% - 28px, 1180px); }
      .atlas__hint { display: none; }
      .atlas__viewport { min-height: 520px; height: 66vh; }
      .atlas__viewport { touch-action: pan-x pan-y; cursor: auto; }
      .atlas__bar { align-items: stretch; flex-direction: column; gap: 12px; }
      .atlas__controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; width: 100%; }
      .atlas__node-controls { min-width: 0; }
      .atlas__zoom-controls { justify-content: flex-end; }
      .atlas__status { align-items: flex-start; flex-direction: column; gap: 7px; }
      .atlas__status::before { display: none; }
      .atlas__control { min-width: 38px; height: 38px; padding-inline: 11px; }
      .atlas__location { flex: 1; grid-template-columns: auto minmax(72px, 1fr); min-height: 38px; padding: 5px 9px; }
      .atlas__location strong { font-size: .68rem; }
      .atlas__minimap { right: 10px; bottom: 10px; width: 112px; height: 58px; padding: 5px; border-radius: 9px; }
      .realm-list { padding-inline: 14px; }
      .realm-list__bar { align-items: flex-start; flex-direction: column; gap: 12px; }
      .realm-kind-filter { flex: none; }
      .hero__kingdom, .hero__pegasus, .kingdom-node, .kingdom-node__art, .atlas__pegasus, .sky-routes path, .sky-route-terminals path, .kingdom-node__beacon i { animation: none; }
      .kingdom-node__art { will-change: auto; }
      .shell::before { display: none; }
      .brand__mark, .nav__status, .hero__count { backdrop-filter: none; }
      .realm-row { grid-template-columns: 34px 78px 1fr auto; gap: 12px; min-height: 132px; padding: 16px 2px; }
      .realm-row__visual { width: 78px; height: 88px; }
      .realm-row__kingdom { top: 26px; width: 78px; height: 62px; }
      .realm-row__visual--main .realm-row__kingdom { width: 86px; }
      .realm-row__icon { width: 40px; height: 40px; }
      .realm-row__identity { align-self: center; }
      .realm-row > p { grid-column: 3 / -1; }
      .realm-row__actions { grid-column: 3 / -1; grid-template-columns: 1fr 1fr; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.08); }
      .realm-row__link--github { padding-top: 0; border-top: 0; }
      .legend, .footer { align-items: flex-start; flex-direction: column; }
      .footer { width: min(100% - 28px, 1180px); }
      body.is-atlas-view .catalogue { width: 100%; padding: 0; }
      body.is-atlas-view .catalogue__nav { width: calc(100% - 28px); margin: 0 auto; padding: 10px 0; }
      body.is-atlas-view .catalogue__head { padding: 8px 14px max(8px, env(safe-area-inset-bottom)); }
      body.is-atlas-view .catalogue__commandbar { width: 100%; }
      body.is-atlas-view .atlas__bar { padding-block: 8px; }
      body.is-atlas-view .atlas__viewport { height: auto; min-height: 0; }
    }
    @media (max-width: 420px) {
      .atlas__controls { grid-template-columns: 1fr; }
      .atlas__node-controls, .atlas__zoom-controls { width: 100%; }
      .atlas__zoom-controls { justify-content: flex-end; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="hero" data-screen="landing">
      <div class="hero__art" aria-hidden="true"></div>
      <div class="hero__kingdom hero__kingdom--main" aria-hidden="true"><img src="/assets/garden-kingdom.webp" alt="" decoding="async" /></div>
      <div class="hero__kingdom hero__kingdom--observatory" aria-hidden="true"><img src="/assets/garden-kingdom-observatory.webp" alt="" decoding="async" /></div>
      <div class="hero__kingdom hero__kingdom--outpost" aria-hidden="true"><img src="/assets/garden-kingdom-outpost.webp" alt="" decoding="async" /></div>
      <div class="hero__pegasus" aria-hidden="true"><img src="/assets/garden-pegasus.webp" alt="" decoding="async" /></div>
      <nav class="nav" aria-label="Primary navigation">
        <a class="brand" href="/"><span class="brand__mark">${icon("spark")}</span><span>Garden of Zo</span></a>
        <a class="nav__status" href="#atlas">${escapeHtml(viewLabel)}</a>
      </nav>
      <div class="hero__content">
        <p class="eyebrow">A personal cloud realm</p>
        <h1>Garden <em>of Zo</em></h1>
        <p class="hero__lede">${escapeHtml(heroCopy)}</p>
        <div class="hero__footer">
          <a class="explore" href="#atlas" aria-controls="realms">Open the sky atlas <span aria-hidden="true">&rarr;</span></a>
          <span class="hero__count"><strong>${allApps.length}</strong> realms &nbsp; / &nbsp; ${publicCount} open &nbsp; / &nbsp; ${privateCount} owner-only</span>
        </div>
      </div>
    </header>
    <main class="catalogue" id="realms" data-screen="catalogue" hidden>
      <nav class="catalogue__nav" aria-label="Catalogue navigation">
        <a class="catalogue__return" href="/" data-close-catalogue><span aria-hidden="true">&larr;</span> Back to home</a>
        <a class="brand" href="/" data-close-catalogue><span class="brand__mark">${icon("spark")}</span><span>Garden of Zo</span></a>
      </nav>
      <div class="catalogue__head">
        <div class="catalogue__intro">
          <p class="eyebrow" data-view-eyebrow>The sky atlas</p>
          <h2>Choose the next horizon.</h2>
          <p data-view-description>Travel from node to node across your apps, workflows and agents. Every stop is a live destination in the Garden of Zo.</p>
        </div>
        <div class="catalogue__tools">
          <div class="catalogue__commandbar" aria-label="Catalogue view and filters">
            <div class="view-toggle" role="group" aria-label="Choose catalogue view">
              <button class="view-toggle__button" type="button" data-view="atlas" aria-pressed="true" aria-controls="atlas-view">${icon("compass")}Sky Atlas View</button>
              <button class="view-toggle__button" type="button" data-view="list" aria-pressed="false" aria-controls="list-view">${icon("list")}List View</button>
            </div>
            <span class="commandbar__divider" aria-hidden="true"></span>
            <div class="filters" role="group" aria-label="Filter realms">
              <button class="filter" type="button" data-filter="all" aria-pressed="true">All ${allApps.length}</button>
              <button class="filter" type="button" data-filter="public" aria-pressed="false">Open ${publicCount}</button>
              <button class="filter" type="button" data-filter="private" aria-pressed="false">Private ${privateCount}</button>
            </div>
            <span class="commandbar__divider" aria-hidden="true"></span>
            <div class="realm-kind-filters" role="group" aria-label="Filter realms by type">
              <button class="realm-kind-filter" type="button" data-kind-filter="all" aria-pressed="true">All types</button>
              <button class="realm-kind-filter" type="button" data-kind-filter="app" aria-pressed="false">Apps ${kindCounts.app}</button>
              <button class="realm-kind-filter" type="button" data-kind-filter="workflow" aria-pressed="false">Workflows ${kindCounts.workflow}</button>
              <button class="realm-kind-filter" type="button" data-kind-filter="agent" aria-pressed="false">Agents ${kindCounts.agent}</button>
            </div>
          </div>
        </div>
      </div>
      <section class="atlas" id="atlas-view" data-view-panel="atlas" aria-label="Sky atlas">
        <div class="atlas__bar">
          <span class="atlas__status"><span data-atlas-status>${String(allApps.length).padStart(2, "0")} kingdoms charted</span><span class="atlas__hint">Drag the sky &middot; scroll to roam &middot; select a kingdom to enter</span></span>
          <div class="atlas__controls">
            <div class="atlas__node-controls">
              <button class="atlas__control" type="button" data-atlas-previous aria-label="Previous kingdom">&larr;</button>
              <span class="atlas__location" aria-live="polite"><small data-atlas-current-index>01 / ${String(allApps.length).padStart(2, "0")}</small><strong data-atlas-current>${escapeHtml(allApps[0]?.route.title ?? "No kingdom")}</strong></span>
              <button class="atlas__control" type="button" data-atlas-next aria-label="Next kingdom">&rarr;</button>
            </div>
            <div class="atlas__zoom-controls">
              <button class="atlas__control" type="button" data-atlas-zoom-out aria-label="Zoom out">&minus;</button>
              <button class="atlas__control" type="button" data-atlas-reset aria-label="Fit the full sky atlas">Fit</button>
              <button class="atlas__control" type="button" data-atlas-zoom-in aria-label="Zoom in">&plus;</button>
            </div>
          </div>
        </div>
        <div class="atlas__viewport" data-atlas tabindex="0" aria-label="Pannable sky atlas. Drag, scroll, or use arrow keys to traverse the kingdom graph.">
          <div class="atlas__canvas" data-atlas-canvas>
            <div class="atlas__world" data-atlas-world>
              <svg class="sky-routes" viewBox="0 0 2240 1080" preserveAspectRatio="none" aria-hidden="true">${routes}</svg>
              <img class="atlas__pegasus" src="/assets/garden-pegasus-atlas.webp" alt="" aria-hidden="true" decoding="async" draggable="false" width="520" height="293" />
              ${nodes}
              <svg class="sky-route-terminals" viewBox="0 0 2240 1080" preserveAspectRatio="none" aria-hidden="true">${routeTerminals}</svg>
            </div>
          </div>
        </div>
        <div class="atlas__minimap" data-atlas-minimap role="button" tabindex="0" aria-label="Atlas overview. Select a position to move the map.">
          <svg viewBox="0 0 2240 1080" preserveAspectRatio="none" aria-hidden="true">
            ${minimapRoutes}
            ${minimapNodes}
            <rect data-atlas-minimap-window x="0" y="0" width="100" height="100" rx="18" />
          </svg>
        </div>
        <div class="atlas__progress" aria-hidden="true"><span data-atlas-progress></span></div>
      </section>
      <section class="realm-list" id="list-view" data-view-panel="list" aria-label="Realm list" hidden>
        <div class="realm-list__bar">
          <span><strong data-list-count>${allApps.length}</strong> destinations in view</span>
        </div>
        <div class="realm-list__rows">${listCards}</div>
      </section>
      <div class="legend">
        <span><strong>Open nodes</strong> can be visited by anyone. <strong>Owner nodes</strong> pass through Zo's private authentication boundary.</span>
        <span class="legend__mark">Built on Zo Computer</span>
      </div>
    </main>
    <footer class="footer" data-screen="catalogue" hidden><span>Garden of Zo</span><span>One server. Many worlds.</span></footer>
  </div>
  <script>
    const accessFilters = [...document.querySelectorAll('[data-filter]')];
    const kindFilters = [...document.querySelectorAll('[data-kind-filter]')];
    const viewButtons = [...document.querySelectorAll('[data-view]')];
    const viewPanels = [...document.querySelectorAll('[data-view-panel]')];
    const landingScreen = document.querySelector('[data-screen="landing"]');
    const catalogueScreen = document.querySelector('main[data-screen="catalogue"]');
    const catalogueFooter = document.querySelector('footer[data-screen="catalogue"]');
    const closeCatalogueLinks = [...document.querySelectorAll('[data-close-catalogue]')];
    const atlasCards = [...document.querySelectorAll('[data-atlas-card]')];
    const listCards = [...document.querySelectorAll('[data-list-card]')];
    const atlas = document.querySelector('[data-atlas]');
    const status = document.querySelector('[data-atlas-status]');
    const progress = document.querySelector('[data-atlas-progress]');
    const zoomOut = document.querySelector('[data-atlas-zoom-out]');
    const zoomIn = document.querySelector('[data-atlas-zoom-in]');
    const reset = document.querySelector('[data-atlas-reset]');
    const previousNode = document.querySelector('[data-atlas-previous]');
    const nextNode = document.querySelector('[data-atlas-next]');
    const currentNodeName = document.querySelector('[data-atlas-current]');
    const currentNodeIndex = document.querySelector('[data-atlas-current-index]');
    const minimap = document.querySelector('[data-atlas-minimap]');
    const minimapWindow = document.querySelector('[data-atlas-minimap-window]');
    const minimapNodes = [...document.querySelectorAll('[data-minimap-node]')];
    const minimapRoutes = [...document.querySelectorAll('[data-minimap-route]')];
    const world = document.querySelector('[data-atlas-world]');
    const routes = [...document.querySelectorAll('[data-sky-route]')];
    const routeTerminals = [...document.querySelectorAll('[data-sky-route-terminal]')];
    const listCount = document.querySelector('[data-list-count]');
    const viewEyebrow = document.querySelector('[data-view-eyebrow]');
    const viewDescription = document.querySelector('[data-view-description]');
    const hero = document.querySelector('.hero');
    const visibleNodes = () => atlasCards.filter((card) => !card.hidden);
    let accessFilter = 'all';
    let kindFilter = 'all';
    let zoom = innerWidth < 620 ? .64 : innerWidth < 1000 ? .72 : .82;
    const minimumZoom = () => innerWidth < 620 ? .58 : .48;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let zoomTarget = zoom;
    let cameraAnimation = null;
    let cameraSettling = false;
    let cameraStartLeft = 0;
    let cameraStartTop = 0;
    let cameraStartOffset = 0;
    let mapInitialised = false;
    let activeNode = null;
    const maximumZoom = () => innerWidth < 620 ? 2 : 2.4;
    const clampZoom = (value) => Math.max(minimumZoom(), Math.min(maximumZoom(), value));
    const canvasOffsetForZoom = (value) => Math.max(0, (atlas.clientWidth - 2240 * value) / 2);
    const clampCameraScroll = (value, contentSize, viewportSize) => Math.max(0, Math.min(Math.max(0, contentSize - viewportSize), value));
    const updateZoomControls = () => {
      zoomOut.disabled = zoomTarget <= minimumZoom();
      zoomIn.disabled = zoomTarget >= maximumZoom();
    };
    const cancelZoomAnimation = () => {
      if (!cameraAnimation) return;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(world).transform);
      const visualZoom = clampZoom(matrix.a);
      const visualOriginX = cameraStartOffset - cameraStartLeft + matrix.e;
      const visualLeft = clampCameraScroll(canvasOffsetForZoom(visualZoom) - visualOriginX, 2240 * visualZoom, atlas.clientWidth);
      const visualTop = clampCameraScroll(cameraStartTop - matrix.f, 1080 * visualZoom, atlas.clientHeight);
      cameraAnimation.cancel();
      cameraAnimation = null;
      zoom = visualZoom;
      atlas.style.setProperty('--atlas-zoom', String(zoom));
      atlas.scrollLeft = visualLeft;
      atlas.scrollTop = visualTop;
      atlas.classList.remove('is-zooming');
    };
    const setZoom = (nextZoom, focusX = atlas.clientWidth / 2, focusY = atlas.clientHeight / 2) => {
      cancelZoomAnimation();
      const oldZoom = zoom;
      const oldOffset = canvasOffsetForZoom(oldZoom);
      zoom = clampZoom(nextZoom);
      zoomTarget = zoom;
      const worldX = (atlas.scrollLeft + focusX - oldOffset) / oldZoom;
      const worldY = (atlas.scrollTop + focusY) / oldZoom;
      const nextOffset = canvasOffsetForZoom(zoom);
      atlas.style.setProperty('--atlas-zoom', String(zoom));
      atlas.scrollLeft = clampCameraScroll(worldX * zoom + nextOffset - focusX, 2240 * zoom, atlas.clientWidth);
      atlas.scrollTop = clampCameraScroll(worldY * zoom - focusY, 1080 * zoom, atlas.clientHeight);
      updateZoomControls();
      updateAtlas();
    };
    const animateCamera = (nextZoom, nextLeft, nextTop, duration, onArrival) => {
      const targetZoom = clampZoom(nextZoom);
      cancelZoomAnimation();
      const startZoom = zoom;
      const startLeft = atlas.scrollLeft;
      const startTop = atlas.scrollTop;
      const startOffset = canvasOffsetForZoom(startZoom);
      const targetOffset = canvasOffsetForZoom(targetZoom);
      const targetLeft = clampCameraScroll(nextLeft, 2240 * targetZoom, atlas.clientWidth);
      const targetTop = clampCameraScroll(nextTop, 1080 * targetZoom, atlas.clientHeight);
      if (reducedMotion || (Math.abs(targetZoom - startZoom) < .002 && Math.abs(targetLeft - startLeft) < 1 && Math.abs(targetTop - startTop) < 1)) {
        zoom = targetZoom;
        zoomTarget = targetZoom;
        atlas.style.setProperty('--atlas-zoom', String(zoom));
        cameraSettling = true;
        atlas.scrollLeft = targetLeft;
        atlas.scrollTop = targetTop;
        requestAnimationFrame(() => { cameraSettling = false; });
        updateZoomControls();
        updateAtlas();
        onArrival?.();
        return;
      }
      zoomTarget = targetZoom;
      cameraStartLeft = startLeft;
      cameraStartTop = startTop;
      cameraStartOffset = startOffset;
      updateZoomControls();
      atlas.classList.add('is-zooming');
      const translateX = targetOffset - targetLeft - (startOffset - startLeft);
      const translateY = startTop - targetTop;
      const animation = world.animate([
        { transform: 'translate3d(0,0,0) scale(' + startZoom + ')' },
        { transform: 'translate3d(' + translateX + 'px,' + translateY + 'px,0) scale(' + targetZoom + ')' }
      ], { duration, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
      cameraAnimation = animation;
      animation.finished.then(() => {
        if (cameraAnimation !== animation) return;
        animation.cancel();
        cameraAnimation = null;
        zoom = targetZoom;
        atlas.style.setProperty('--atlas-zoom', String(zoom));
        cameraSettling = true;
        atlas.scrollLeft = targetLeft;
        atlas.scrollTop = targetTop;
        requestAnimationFrame(() => { cameraSettling = false; });
        atlas.classList.remove('is-zooming');
        updateZoomControls();
        updateAtlas();
        onArrival?.();
      }).catch(() => {});
    };
    const animateZoom = (nextZoom, focusX = atlas.clientWidth / 2, focusY = atlas.clientHeight / 2) => {
      const targetZoom = clampZoom(nextZoom);
      cancelZoomAnimation();
      const startOffset = canvasOffsetForZoom(zoom);
      const targetOffset = canvasOffsetForZoom(targetZoom);
      const worldX = (atlas.scrollLeft + focusX - startOffset) / zoom;
      const worldY = (atlas.scrollTop + focusY) / zoom;
      const targetLeft = worldX * targetZoom + targetOffset - focusX;
      const targetTop = worldY * targetZoom - focusY;
      animateCamera(targetZoom, targetLeft, targetTop, 340 + Math.abs(targetZoom - zoom) * 220);
    };
    const centreNode = (node, behavior = 'smooth') => {
      if (!node) return;
      const x = node.offsetLeft * zoom + node.offsetWidth * zoom / 2 - atlas.clientWidth / 2;
      const y = node.offsetTop * zoom + node.offsetHeight * zoom / 2 - atlas.clientHeight / 2;
      atlas.scrollTo({ left: Math.max(0, x), top: Math.max(0, y), behavior });
    };
    const setActiveNode = (node, shouldCentre = true, behavior = 'smooth') => {
      const visible = visibleNodes();
      if (!node || node.hidden) node = visible[0] || null;
      const activeChanged = node !== activeNode;
      activeNode = node;
      atlasCards.forEach((card) => {
        const selected = card === activeNode;
        card.classList.toggle('is-active', selected);
        if (!selected || activeChanged) card.classList.remove('is-arrived');
        const selector = card.querySelector('[data-atlas-select]');
        selector?.setAttribute('aria-pressed', String(selected));
      });
      const visibleIndex = Math.max(0, visible.indexOf(activeNode));
      currentNodeName.textContent = activeNode?.dataset.nodeTitle || 'No kingdom';
      currentNodeIndex.textContent = activeNode
        ? String(visibleIndex + 1).padStart(2, '0') + ' / ' + String(visible.length).padStart(2, '0')
        : '00 / 00';
      previousNode.disabled = visible.length < 2;
      nextNode.disabled = visible.length < 2;
      if (shouldCentre && activeNode) centreNode(activeNode, behavior);
    };
    const focusNode = (node) => {
      if (!node || node.hidden) return;
      cancelZoomAnimation();
      node.classList.remove('is-arrived');
      setActiveNode(node, false);
      const focusZoom = innerWidth < 620 ? 1.05 : innerWidth < 1000 ? 1.2 : 1.38;
      const targetZoom = clampZoom(Math.max(zoom, focusZoom));
      if (reducedMotion) {
        setZoom(targetZoom);
        centreNode(node, 'auto');
        return;
      }
      const nodeCentreX = node.offsetLeft + node.offsetWidth / 2;
      const nodeCentreY = node.offsetTop + node.offsetHeight / 2;
      const targetOffset = canvasOffsetForZoom(targetZoom);
      const targetLeft = nodeCentreX * targetZoom + targetOffset - atlas.clientWidth / 2;
      const targetTop = nodeCentreY * targetZoom - atlas.clientHeight / 2;
      animateCamera(targetZoom, targetLeft, targetTop, 640, () => {
        if (activeNode === node) node.classList.add('is-arrived');
      });
    };
    const fitMap = (behavior = 'smooth') => {
      const visible = visibleNodes();
      if (!visible.length) return;
      cancelZoomAnimation();
      const padding = innerWidth < 620 ? 58 : 95;
      const left = Math.min(...visible.map((node) => node.offsetLeft));
      const top = Math.min(...visible.map((node) => node.offsetTop));
      const right = Math.max(...visible.map((node) => node.offsetLeft + node.offsetWidth));
      const bottom = Math.max(...visible.map((node) => node.offsetTop + node.offsetHeight));
      const contentWidth = right - left + padding * 2;
      const contentHeight = bottom - top + padding * 2;
      zoom = Math.max(minimumZoom(), Math.min(1.08, (atlas.clientWidth - 24) / contentWidth, (atlas.clientHeight - 24) / contentHeight));
      zoomTarget = zoom;
      atlas.style.setProperty('--atlas-zoom', String(zoom));
      updateZoomControls();
      const scaledWidth = (right - left) * zoom;
      const scaledHeight = (bottom - top) * zoom;
      atlas.scrollTo({
        left: Math.max(0, left * zoom - (atlas.clientWidth - scaledWidth) / 2),
        top: Math.max(0, top * zoom - (atlas.clientHeight - scaledHeight) / 2),
        behavior
      });
      updateAtlas();
    };
    const moveNode = (step) => {
      const visible = visibleNodes();
      if (!visible.length) return;
      const index = Math.max(0, visible.indexOf(activeNode));
      setActiveNode(visible[(index + step + visible.length) % visible.length]);
    };
    const navigateSpatially = (direction) => {
      const visible = visibleNodes();
      if (!visible.length) return;
      const origin = activeNode && !activeNode.hidden ? activeNode : visible[0];
      const originX = origin.offsetLeft + origin.offsetWidth / 2;
      const originY = origin.offsetTop + 54;
      const candidates = visible.filter((node) => {
        if (node === origin) return false;
        const dx = node.offsetLeft + node.offsetWidth / 2 - originX;
        const dy = node.offsetTop + 54 - originY;
        if (direction === 'left') return dx < -10;
        if (direction === 'right') return dx > 10;
        if (direction === 'up') return dy < -10;
        return dy > 10;
      });
      const target = candidates.sort((a, b) => {
        const score = (node) => {
          const dx = node.offsetLeft + node.offsetWidth / 2 - originX;
          const dy = node.offsetTop + 54 - originY;
          const primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
          const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
          return primary + secondary * 1.7;
        };
        return score(a) - score(b);
      })[0];
      if (target) setActiveNode(target);
    };
    const setView = (view, remember = true) => {
      const selected = view === 'list' ? 'list' : 'atlas';
      document.body.classList.toggle('is-atlas-view', selected === 'atlas');
      viewButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === selected)));
      viewPanels.forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== selected; });
      viewEyebrow.textContent = selected === 'list' ? 'The realm directory' : 'The sky atlas';
      viewDescription.textContent = selected === 'list'
        ? 'Scan every app, workflow and agent in one compact directory, then enter any realm directly.'
        : 'Travel from node to node across your apps, workflows and agents. Every stop is a live destination in the Garden of Zo.';
      if (remember) {
        try { localStorage.setItem('garden-of-zo-view', selected); } catch {}
        const nextHash = selected === 'list' ? '#list' : '#atlas';
        history.replaceState(null, '', location.pathname + location.search + nextHash);
      }
      if (selected === 'atlas') requestAnimationFrame(() => {
        document.querySelector('.atlas').classList.remove('is-offscreen');
        refreshRoute();
        if (!mapInitialised) {
          setActiveNode(visibleNodes()[0], false);
          fitMap('auto');
          if (innerWidth < 620) centreNode(activeNode, 'auto');
          mapInitialised = true;
        }
        updateAtlas();
      });
    };
    const refreshRoute = () => {
      [...routes, ...routeTerminals].forEach((route) => {
        const from = atlasCards[Number(route.dataset.from)];
        const to = atlasCards[Number(route.dataset.to)];
        route.classList.toggle('is-hidden', from.hidden || to.hidden);
      });
      minimapRoutes.forEach((route) => {
        const from = atlasCards[Number(route.dataset.from)];
        const to = atlasCards[Number(route.dataset.to)];
        route.classList.toggle('is-hidden', from.hidden || to.hidden);
      });
      minimapNodes.forEach((node) => {
        node.classList.toggle('is-hidden', atlasCards[Number(node.dataset.nodeIndex)].hidden);
      });
    };
    const updateAtlas = () => {
      const visible = visibleNodes();
      if (!visible.length) {
        status.textContent = '00 kingdoms charted · adjust filters to continue';
        progress.style.width = '0';
        progress.style.transform = 'translateX(0)';
        return;
      }
      status.textContent = String(visible.length).padStart(2, '0') + ' kingdoms charted · ' + Math.round(zoom * 100) + '% scale';
      const max = Math.max(1, atlas.scrollWidth - atlas.clientWidth);
      const viewportRatio = Math.min(1, atlas.clientWidth / atlas.scrollWidth);
      progress.style.width = Math.max(8, viewportRatio * 100) + '%';
      progress.style.transform = 'translateX(' + (atlas.scrollLeft / max * (100 / viewportRatio - 100)) + '%)';
      minimapWindow.setAttribute('x', String(atlas.scrollLeft / zoom));
      minimapWindow.setAttribute('y', String(atlas.scrollTop / zoom));
      minimapWindow.setAttribute('width', String(Math.min(2240, atlas.clientWidth / zoom)));
      minimapWindow.setAttribute('height', String(Math.min(1080, atlas.clientHeight / zoom)));
    };
    let atlasUpdateFrame = 0;
    let interactionTimer = 0;
    const scheduleAtlasUpdate = () => {
      if (atlasUpdateFrame) return;
      atlasUpdateFrame = requestAnimationFrame(() => {
        atlasUpdateFrame = 0;
        updateAtlas();
      });
    };
    const syncActiveToViewport = () => {
      const visible = visibleNodes();
      if (!visible.length) return;
      const centreX = (atlas.scrollLeft + atlas.clientWidth / 2) / zoom;
      const centreY = (atlas.scrollTop + atlas.clientHeight / 2) / zoom;
      const nearest = visible.sort((a, b) => {
        const distance = (node) => {
          const dx = node.offsetLeft + node.offsetWidth / 2 - centreX;
          const dy = node.offsetTop + 54 - centreY;
          return dx * dx + dy * dy;
        };
        return distance(a) - distance(b);
      })[0];
      setActiveNode(nearest, false);
    };
    const markInteracting = () => {
      atlas.classList.add('is-interacting');
      clearTimeout(interactionTimer);
      interactionTimer = setTimeout(() => {
        atlas.classList.remove('is-interacting');
        syncActiveToViewport();
      }, 140);
    };
    const applyFilters = () => {
      [...atlasCards, ...listCards].forEach((card) => {
        const accessMismatch = accessFilter !== 'all' && card.dataset.access !== accessFilter;
        const kindMismatch = kindFilter !== 'all' && card.dataset.kind !== kindFilter;
        card.hidden = accessMismatch || kindMismatch;
      });
      listCount.textContent = String(listCards.filter((card) => !card.hidden).length);
      requestAnimationFrame(() => {
        refreshRoute();
        setActiveNode(activeNode && !activeNode.hidden ? activeNode : visibleNodes()[0], false);
        fitMap();
        if (innerWidth < 620) centreNode(activeNode);
        updateAtlas();
      });
    };
    accessFilters.forEach((button) => button.addEventListener('click', () => {
      accessFilter = button.dataset.filter;
      accessFilters.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      applyFilters();
    }));
    kindFilters.forEach((button) => button.addEventListener('click', () => {
      kindFilter = button.dataset.kindFilter;
      kindFilters.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      applyFilters();
    }));
    viewButtons.forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
    zoomOut.addEventListener('click', () => animateZoom(zoomTarget - .16));
    zoomIn.addEventListener('click', () => animateZoom(zoomTarget + .16));
    reset.addEventListener('click', () => fitMap());
    previousNode.addEventListener('click', () => moveNode(-1));
    nextNode.addEventListener('click', () => moveNode(1));
    atlasCards.forEach((card) => card.querySelector('[data-atlas-select]')?.addEventListener('click', () => focusNode(card)));
    atlasCards.forEach((card) => card.addEventListener('focusin', () => setActiveNode(card, false)));
    atlas.addEventListener('scroll', () => {
      if (!cameraSettling) markInteracting();
      scheduleAtlasUpdate();
    }, { passive: true });
    atlas.addEventListener('wheel', (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        animateZoom(zoomTarget + (event.deltaY < 0 ? .12 : -.12), event.offsetX, event.offsetY);
        return;
      }
      const canMoveX = atlas.scrollWidth > atlas.clientWidth;
      const canMoveY = atlas.scrollHeight > atlas.clientHeight;
      if (!canMoveX && !canMoveY) return;
      event.preventDefault();
      markInteracting();
      atlas.scrollLeft += event.deltaX + (event.shiftKey ? event.deltaY : 0);
      atlas.scrollTop += event.shiftKey ? 0 : event.deltaY;
    }, { passive: false });
    atlas.addEventListener('keydown', (event) => {
      const direction = ({ ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' })[event.key];
      if (!direction) return;
      event.preventDefault();
      if (event.shiftKey) {
        const distance = 220;
        atlas.scrollBy({
          left: direction === 'left' ? -distance : direction === 'right' ? distance : 0,
          top: direction === 'up' ? -distance : direction === 'down' ? distance : 0,
          behavior: 'smooth'
        });
        return;
      }
      navigateSpatially(direction);
    });
    const moveFromMinimap = (event) => {
      const bounds = minimap.getBoundingClientRect();
      const worldX = (event.clientX - bounds.left) / bounds.width * 2240;
      const worldY = (event.clientY - bounds.top) / bounds.height * 1080;
      atlas.scrollTo({
        left: Math.max(0, worldX * zoom - atlas.clientWidth / 2),
        top: Math.max(0, worldY * zoom - atlas.clientHeight / 2),
        behavior: 'smooth'
      });
    };
    minimap.addEventListener('pointerdown', moveFromMinimap);
    minimap.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fitMap();
      }
    });
    let dragStartX = 0;
    let dragStartY = 0;
    let scrollStartX = 0;
    let scrollStartY = 0;
    let pendingDragX = 0;
    let pendingDragY = 0;
    let dragFrame = 0;
    atlas.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch') return;
      if (event.target.closest('a, button')) return;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      scrollStartX = atlas.scrollLeft;
      scrollStartY = atlas.scrollTop;
      atlas.classList.add('is-dragging');
      markInteracting();
      atlas.setPointerCapture(event.pointerId);
    });
    atlas.addEventListener('pointermove', (event) => {
      if (!atlas.classList.contains('is-dragging')) return;
      pendingDragX = event.clientX;
      pendingDragY = event.clientY;
      if (dragFrame) return;
      dragFrame = requestAnimationFrame(() => {
        dragFrame = 0;
        atlas.scrollLeft = scrollStartX - (pendingDragX - dragStartX);
        atlas.scrollTop = scrollStartY - (pendingDragY - dragStartY);
      });
    });
    const endDrag = () => atlas.classList.remove('is-dragging');
    atlas.addEventListener('pointerup', endDrag);
    atlas.addEventListener('pointercancel', endDrag);
    let resizeFrame = 0;
    addEventListener('resize', () => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        cancelZoomAnimation();
        refreshRoute();
        zoom = clampZoom(zoom);
        zoomTarget = zoom;
        atlas.style.setProperty('--atlas-zoom', String(zoom));
        updateZoomControls();
        updateAtlas();
      });
    });
    if ('IntersectionObserver' in window) {
      const visibilityObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => entry.target.classList.toggle('is-offscreen', !entry.isIntersecting));
      }, { rootMargin: '120px' });
      visibilityObserver.observe(hero);
    }
    let savedView = 'atlas';
    try { savedView = localStorage.getItem('garden-of-zo-view') || 'atlas'; } catch {}
    let catalogueInitialised = false;
    const syncScreen = () => {
      const showCatalogue = location.hash === '#atlas' || location.hash === '#list' || location.hash === '#realms';
      landingScreen.hidden = showCatalogue;
      catalogueScreen.hidden = !showCatalogue;
      catalogueFooter.hidden = !showCatalogue;
      document.body.classList.toggle('is-catalogue-open', showCatalogue);
      if (!showCatalogue) document.body.classList.remove('is-atlas-view');
      if (showCatalogue) {
        const requestedView = location.hash === '#atlas' ? 'atlas' : location.hash === '#list' ? 'list' : null;
        const activeView = requestedView || (catalogueInitialised
          ? viewButtons.find((button) => button.getAttribute('aria-pressed') === 'true')?.dataset.view || savedView
          : savedView);
        setZoom(zoom);
        setView(activeView, false);
        catalogueInitialised = true;
      }
      requestAnimationFrame(() => scrollTo({ top: 0, behavior: 'auto' }));
    };
    closeCatalogueLinks.forEach((link) => link.addEventListener('click', (event) => {
      event.preventDefault();
      history.replaceState(null, '', location.pathname + location.search);
      syncScreen();
    }));
    addEventListener('hashchange', syncScreen);
    syncScreen();
  </script>
</body>
</html>`;
}

function renderFavicon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#071721"/><path d="M10 33c9-1 14-6 19-16 2 7 1 12-2 17 9-5 17-4 27 1-11 1-18 5-23 12-5-8-11-12-21-14Z" fill="#e4c178"/><circle cx="37" cy="28" r="3" fill="#f8f2df"/></svg>`;
}

function contentLength(headers: Headers): number {
  const value = Number(headers.get("content-length") || "0");
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function createHandler(configFile: string) {
  const config = loadConfig(configFile);
  const catalog = loadCatalogConfigs(configFile);
  const realmArtFiles = new Map(catalog.flatMap((gateway) => gateway.routes.map((route) => {
    const file = `garden-realm-${route.atlas.art}.webp`;
    return [`/assets/${file}`, file] as const;
  })));
  const trafficEndpoint = process.env.USAGE_TRAFFIC_ENDPOINT || "http://127.0.0.1:8791/usage/api/application-traffic";
  let pendingTraffic = new Map<string, TrafficSample>();

  const mergeTraffic = (samples: Iterable<TrafficSample>) => {
    for (const incoming of samples) {
      const key = `${incoming.at}:${incoming.application}`;
      const sample = pendingTraffic.get(key) || { ...incoming, receivedBytes: 0, sentBytes: 0, requestCount: 0, errorCount: 0 };
      sample.receivedBytes += incoming.receivedBytes;
      sample.sentBytes += incoming.sentBytes;
      sample.requestCount += incoming.requestCount;
      sample.errorCount += incoming.errorCount;
      pendingTraffic.set(key, sample);
    }
  };

  const flushApplicationTraffic = async () => {
    if (!pendingTraffic.size) return;
    const batch = pendingTraffic;
    pendingTraffic = new Map();
    try {
      const response = await fetch(trafficEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ samples: [...batch.values()] })
      });
      if (!response.ok) throw new Error(`Usage collector returned ${response.status}`);
    } catch (error) {
      mergeTraffic(batch.values());
      console.warn(`Unable to record application traffic: ${error}`);
    }
  };

  const interval = setInterval(() => void flushApplicationTraffic(), 60_000);
  interval.unref();

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "zo-router",
        title: config.title,
        access: config.access,
        catalogSize: catalog.reduce((total, gateway) => total + gateway.routes.length, 0),
        routes: config.routes.map((route) => ({ prefix: route.prefix, label: route.label, targetOrigin: route.targetOrigin }))
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
      return new Response(Bun.file(join(dirname(configFile), "assets", assetFile)), {
        headers: { "content-type": "image/webp", "cache-control": "public, max-age=604800, immutable" }
      });
    }

    if (url.pathname === "/") {
      return new Response(renderIndex(config, catalog), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }

    const route = config.routes.find((item) => url.pathname === item.prefix || url.pathname.startsWith(`${item.prefix}/`));
    if (!route) return Response.json({ error: "not found" }, { status: 404 });

    const upstreamPath = route.stripPrefix ? url.pathname.slice(route.prefix.length) || "/" : url.pathname;
    const upstreamUrl = new URL(upstreamPath + url.search, route.targetOrigin);
    const headers = new Headers(request.headers);
    headers.delete("accept-encoding");
    headers.set("x-forwarded-host", url.host);
    headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
    headers.set("x-forwarded-prefix", route.prefix);

    try {
      const upstream = await fetch(new Request(upstreamUrl.toString(), {
        method: request.method,
        headers,
        body: request.body,
        duplex: "half",
        redirect: "manual"
      }));
      const at = Math.floor(Date.now() / 60_000) * 60_000;
      mergeTraffic([{
        at,
        application: route.label,
        receivedBytes: contentLength(request.headers),
        sentBytes: contentLength(upstream.headers),
        requestCount: 1,
        errorCount: upstream.status >= 400 ? 1 : 0
      }]);

      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.delete("content-encoding");
      responseHeaders.delete("content-length");
      const contentType = responseHeaders.get("content-type") ?? "";

      if (route.assetQuery && contentType.includes("text/html")) {
        const assetQuery = encodeURIComponent(route.assetQuery);
        const html = await upstream.text();
        const rewrittenHtml = html.replace(
          /(["'])\.\/((?:assets|libs)\/[^"'?]+)\1/g,
          (_match, quote, assetPath) => `${quote}./${assetPath}?v=${assetQuery}${quote}`
        ).replace(
          new RegExp(`(["'])${escapeRegularExpression(route.prefix)}/((?:assets|libs)/[^"'?]+)\\1`, "g"),
          (_match, quote, assetPath) => `${quote}${route.prefix}/${assetPath}?v=${assetQuery}${quote}`
        );
        responseHeaders.set("cache-control", "no-store");
        return new Response(rewrittenHtml, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
      }

      if (route.assetQuery && contentType.includes("javascript")) {
        const assetQuery = encodeURIComponent(route.assetQuery);
        const script = (await upstream.text()).replace(
          /(["'`])\.\/([^"'`?]+\.js)\1/g,
          (_match, quote, assetPath) => `${quote}./${assetPath}?v=${assetQuery}${quote}`
        );
        return new Response(script, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
      }

      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
    } catch (error) {
      console.error(`Unable to reach ${route.label}:`, error);
      return Response.json({ error: "upstream unavailable", application: route.label }, { status: 502 });
    }
  };
}

if (import.meta.main) {
  const configFile = process.env.ROUTES_FILE;
  if (!configFile) throw new Error("Missing ROUTES_FILE");
  const port = Number(process.env.PORT || "9000");
  Bun.serve({ port, fetch: createHandler(configFile) });
  console.log(`zo-router listening on http://127.0.0.1:${port}`);
}
