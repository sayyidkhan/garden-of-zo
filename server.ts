import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

export type Access = "public" | "private";
export type RealmKind = "app" | "workflow" | "agent";

export type RouteConfig = {
  prefix: string;
  label: string;
  title: string;
  description: string;
  category: string;
  kind: RealmKind;
  icon: string;
  targetOrigin: string;
  entryPath?: string;
  stripPrefix?: boolean;
  assetQuery?: string;
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
  }
  return parsed;
}

export function loadCatalogConfigs(configFile: string): RouterConfig[] {
  const root = dirname(configFile);
  return ["public.routes.json", "private.routes.json"].map((file) => loadConfig(join(root, file)));
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
  const nodePositions = [
    { x: 130, y: 390, art: "outpost", scale: .88 },
    { x: 470, y: 110, art: "observatory", scale: 1.08 },
    { x: 500, y: 690, art: "main", scale: .9 },
    { x: 850, y: 350, art: "main", scale: 1.18 },
    { x: 1110, y: 740, art: "outpost", scale: .96 },
    { x: 1370, y: 90, art: "observatory", scale: 1.02 },
    { x: 1510, y: 520, art: "main", scale: 1.06 },
    { x: 1880, y: 280, art: "outpost", scale: 1.12 }
  ];
  const graphLinks = [[0, 1], [0, 2], [1, 3], [2, 3], [2, 4], [3, 5], [3, 6], [4, 6], [5, 6], [5, 7], [6, 7]];
  const appEntries = allApps.map(({ gateway, route }, index) => {
    const restricted = gateway.access === "private";
    const sameGateway = gateway.access === current.access;
    const routeHref = `${route.prefix}${route.entryPath ?? ""}`;
    const href = sameGateway ? routeHref : `${gateway.gatewayUrl}${routeHref}`;
    const accessLabel = restricted ? "Owner access" : "Open access";
    const action = restricted ? "Unlock realm" : "Enter realm";

    return { gateway, route, index, restricted, href, accessLabel, action };
  });
  const nodes = appEntries.map(({ gateway, route, index, restricted, href, accessLabel, action }) => {
    const position = nodePositions[index];
    const artFile = position.art === "main" ? "garden-kingdom.webp" : `garden-kingdom-${position.art}.webp`;
    return `<article class="kingdom-node kingdom-node--${position.art} ${restricted ? "kingdom-node--private" : ""}" data-atlas-card data-sky-node data-node-index="${index}" data-node-title="${escapeHtml(route.title)}" data-access="${gateway.access}" style="--order:${index};--node-x:${position.x}px;--node-y:${position.y}px;--node-scale:${position.scale}">
      <a class="kingdom-node__island" href="${escapeHtml(href)}" aria-label="${action}: ${escapeHtml(route.title)}">
        <span class="kingdom-node__halo" aria-hidden="true"></span>
        <img src="/assets/${artFile}" alt="" aria-hidden="true" />
        <span class="kingdom-node__beacon" aria-hidden="true">${icon(route.icon)}<i></i></span>
      </a>
      <div class="kingdom-node__label">
        <span class="kingdom-node__number">${String(index + 1).padStart(2, "0")}</span>
        <div><span class="kingdom-node__category">${escapeHtml(route.category)}</span><h2>${escapeHtml(route.title)}</h2></div>
        <span class="kingdom-node__access">${restricted ? icon("lock", "badge-icon") : ""}${accessLabel}</span>
        <a href="${escapeHtml(href)}" aria-label="${action}: ${escapeHtml(route.title)}"><span>${action}</span><span aria-hidden="true">&nearr;</span></a>
      </div>
    </article>`;
  }).join("");
  const routes = graphLinks.map(([fromIndex, toIndex], index) => {
    const from = nodePositions[fromIndex];
    const to = nodePositions[toIndex];
    const x1 = from.x + 135;
    const y1 = from.y + 100;
    const x2 = to.x + 135;
    const y2 = to.y + 100;
    const curve = index % 2 === 0 ? -90 : 90;
    const midX = (x1 + x2) / 2;
    return `<path data-sky-route data-from="${fromIndex}" data-to="${toIndex}" d="M ${x1} ${y1} C ${midX} ${y1 + curve}, ${midX} ${y2 - curve}, ${x2} ${y2}" />`;
  }).join("");
  const listCards = appEntries.map(({ gateway, route, index, restricted, href, accessLabel, action }) => {
    return `<article class="realm-row ${restricted ? "realm-row--private" : ""}" data-list-card data-access="${gateway.access}" data-kind="${route.kind}" style="--order:${index}">
      <span class="realm-row__number">${String(index + 1).padStart(2, "0")}</span>
      <span class="realm-row__icon" aria-hidden="true">${icon(route.icon)}</span>
      <div class="realm-row__identity">
        <span class="realm-row__category">${escapeHtml(route.category)}</span>
        <h3>${escapeHtml(route.title)}</h3>
      </div>
      <p>${escapeHtml(route.description)}</p>
      <span class="access-badge ${restricted ? "access-badge--private" : ""}">
        ${restricted ? icon("lock", "badge-icon") : ""}${accessLabel}
      </span>
      <a class="realm-row__link" href="${escapeHtml(href)}" aria-label="${action}: ${escapeHtml(route.title)}">
        <span>${action}</span><span aria-hidden="true">&nearr;</span>
      </a>
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
    .shell::before { content: ""; position: fixed; inset: 0; pointer-events: none; opacity: .16; z-index: 10; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 140 140' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.34'/%3E%3C/svg%3E"); }
    .hero { position: relative; min-height: 760px; isolation: isolate; }
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
    .nav__status { display: flex; align-items: center; gap: 9px; padding: 9px 13px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; background: rgba(5,20,27,.46); backdrop-filter: blur(12px); color: #e7eee8; font-size: .76rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
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
    .catalogue { position: relative; z-index: 3; width: min(1180px, calc(100% - 40px)); margin: -42px auto 0; padding: 86px 0 110px; }
    .catalogue__head { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 32px; margin-bottom: 28px; }
    .catalogue__head h2 { margin: 0; max-width: 720px; font: 500 clamp(2.8rem, 6vw, 5.2rem)/.94 var(--serif); letter-spacing: -.035em; }
    .catalogue__head p { max-width: 570px; margin: 18px 0 0; color: var(--muted); line-height: 1.65; }
    .catalogue__tools { display: grid; justify-items: end; gap: 12px; }
    .view-toggle { display: flex; gap: 5px; padding: 5px; border: 1px solid rgba(228,193,120,.28); border-radius: 999px; background: rgba(3,18,23,.72); box-shadow: 0 14px 34px rgba(0,0,0,.18); }
    .view-toggle__button { display: inline-flex; align-items: center; gap: 8px; border: 0; border-radius: 999px; padding: 10px 14px; color: #94aaa6; background: transparent; cursor: pointer; font-size: .72rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; transition: color .2s, background .2s, box-shadow .2s; }
    .view-toggle__button svg { width: 16px; height: 16px; }
    .view-toggle__button[aria-pressed="true"] { color: #172328; background: var(--gold); box-shadow: 0 6px 18px rgba(228,193,120,.2); }
    .filters { display: flex; gap: 5px; padding: 5px; border: 1px solid var(--line); border-radius: 999px; background: rgba(3,18,23,.5); }
    .filter { border: 0; border-radius: 999px; padding: 10px 15px; color: #aebfbb; background: transparent; cursor: pointer; font-size: .77rem; font-weight: 800; letter-spacing: .04em; transition: color .2s, background .2s; }
    .filter[aria-pressed="true"] { color: #162027; background: var(--ink); }
    .atlas { position: relative; width: 100vw; margin-left: calc(50% - 50vw); border-block: 1px solid rgba(228,193,120,.13); background: radial-gradient(circle at 16% 18%, rgba(58,111,115,.18), transparent 24rem), radial-gradient(circle at 78% 64%, rgba(221,125,102,.09), transparent 28rem), linear-gradient(180deg, rgba(4,18,25,.64), rgba(6,29,35,.94)); overflow: hidden; }
    .atlas::before { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .3; background-image: radial-gradient(circle, rgba(244,230,196,.8) 0 1px, transparent 1.5px); background-size: 67px 67px; mask-image: linear-gradient(90deg, transparent, black 12%, black 88%, transparent); }
    .atlas__bar { position: relative; z-index: 3; display: flex; align-items: center; justify-content: space-between; gap: 20px; width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 20px 0; }
    .atlas__status { display: flex; align-items: center; gap: 12px; color: #d6e3df; font-size: .76rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    .atlas__status::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 18px rgba(228,193,120,.9); }
    .atlas__hint { color: #849c99; font-weight: 500; letter-spacing: .04em; }
    .atlas__controls { display: flex; gap: 8px; }
    .atlas__control { display: grid; place-items: center; min-width: 42px; height: 42px; padding: 0 13px; border: 1px solid rgba(228,193,120,.25); border-radius: 999px; color: var(--ink); background: rgba(6,25,31,.7); cursor: pointer; font-size: .72rem; font-weight: 900; letter-spacing: .04em; transition: transform .2s, border-color .2s, background .2s; }
    .atlas__control:hover:not(:disabled) { transform: translateY(-2px); border-color: rgba(228,193,120,.66); background: rgba(25,54,58,.9); }
    .atlas__control:disabled { cursor: default; opacity: .28; }
    .atlas__viewport { position: relative; z-index: 2; height: min(720px, 72vh); min-height: 540px; overflow: auto; overscroll-behavior: contain; scrollbar-width: none; cursor: grab; touch-action: none; background: radial-gradient(circle at 50% 45%, rgba(67,130,132,.1), transparent 34rem); }
    .atlas__viewport::-webkit-scrollbar { display: none; }
    .atlas__viewport.is-dragging { cursor: grabbing; user-select: none; }
    .atlas__canvas { position: relative; width: calc(2240px * var(--atlas-zoom, .8)); height: calc(1080px * var(--atlas-zoom, .8)); }
    .atlas__world { position: absolute; inset: 0 auto auto 0; width: 2240px; height: 1080px; transform: scale(var(--atlas-zoom, .8)); transform-origin: left top; background-image: radial-gradient(circle, rgba(244,230,196,.72) 0 1px, transparent 1.5px); background-size: 83px 83px; }
    .atlas__world::after { content: ""; position: absolute; z-index: 0; inset: 22% 8% 12%; pointer-events: none; border-radius: 50%; background: rgba(67,130,132,.08); filter: blur(90px); }
    .sky-routes { position: absolute; z-index: 1; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
    .sky-routes path { fill: none; stroke: rgba(228,193,120,.7); stroke-width: 3; stroke-dasharray: 4 14; stroke-linecap: round; filter: drop-shadow(0 0 8px rgba(228,193,120,.48)); animation: route-drift 16s linear infinite; }
    .sky-routes path.is-hidden { display: none; }
    .atlas__pegasus { position: absolute; z-index: 2; left: 1060px; top: 285px; width: 330px; opacity: .58; pointer-events: none; filter: drop-shadow(0 22px 12px rgba(0,0,0,.7)); animation: pegasus-map 9s ease-in-out infinite alternate; }
    .kingdom-node { position: absolute; z-index: 3; left: var(--node-x); top: var(--node-y); width: 270px; height: 260px; animation: kingdom-node-arrive .7s calc(var(--order) * 65ms) both, kingdom-node-float 7s calc(var(--order) * -1.3s) ease-in-out infinite alternate; }
    .kingdom-node[hidden] { display: none; }
    .kingdom-node__island { position: absolute; inset: 0 0 auto; height: 175px; display: grid; place-items: center; text-decoration: none; transform: scale(var(--node-scale)); transform-origin: center bottom; transition: transform .3s, filter .3s; }
    .kingdom-node:hover .kingdom-node__island, .kingdom-node:focus-within .kingdom-node__island { transform: scale(calc(var(--node-scale) * 1.08)) translateY(-8px); filter: brightness(1.12); }
    .kingdom-node__island img { position: relative; z-index: 2; display: block; width: 230px; height: 175px; object-fit: contain; filter: drop-shadow(0 28px 12px rgba(0,7,11,.92)); }
    .kingdom-node--main .kingdom-node__island img { width: 265px; }
    .kingdom-node:nth-of-type(3n+2) .kingdom-node__island img { transform: scaleX(-1); }
    .kingdom-node:nth-of-type(4n) .kingdom-node__island img { filter: sepia(.12) saturate(.82) drop-shadow(0 28px 12px rgba(0,7,11,.92)); }
    .kingdom-node--private .kingdom-node__island img { filter: saturate(.72) sepia(.22) hue-rotate(325deg) drop-shadow(0 28px 12px rgba(0,7,11,.94)); }
    .kingdom-node__halo { position: absolute; z-index: 1; width: 180px; height: 64px; border-radius: 50%; background: rgba(138,199,180,.14); filter: blur(22px); box-shadow: 0 0 70px rgba(138,199,180,.2); }
    .kingdom-node--private .kingdom-node__halo { background: rgba(221,125,102,.14); box-shadow: 0 0 70px rgba(221,125,102,.18); }
    .kingdom-node__beacon { position: absolute; z-index: 4; left: 50%; top: 28px; display: grid; place-items: center; width: 52px; height: 52px; transform: translateX(-50%); border: 1px solid rgba(228,193,120,.7); border-radius: 50%; color: var(--gold); background: rgba(4,22,28,.9); box-shadow: 0 0 0 8px rgba(228,193,120,.06), 0 0 28px rgba(228,193,120,.42); }
    .kingdom-node__beacon svg { width: 21px; height: 21px; }
    .kingdom-node__beacon i { position: absolute; inset: -9px; border: 1px solid rgba(138,199,180,.28); border-radius: inherit; animation: beacon-pulse 2.8s ease-out infinite; }
    .kingdom-node--private .kingdom-node__beacon { border-color: rgba(221,125,102,.72); color: #e9b690; box-shadow: 0 0 0 8px rgba(221,125,102,.06), 0 0 28px rgba(221,125,102,.35); }
    .kingdom-node__label { position: absolute; z-index: 5; left: 50%; bottom: 0; width: 255px; min-height: 96px; transform: translateX(-50%); display: grid; grid-template-columns: 30px 1fr auto; align-items: center; gap: 8px; padding: 13px 14px; border: 1px solid rgba(228,193,120,.24); border-radius: 4px 20px 4px 20px; background: linear-gradient(145deg, rgba(17,49,54,.96), rgba(4,22,28,.94)); box-shadow: 0 20px 38px rgba(0,0,0,.38); backdrop-filter: blur(14px); }
    .kingdom-node--private .kingdom-node__label { background: linear-gradient(145deg, rgba(50,42,43,.96), rgba(12,25,30,.95)); }
    .kingdom-node__number { color: #7e9793; font-size: .58rem; font-weight: 900; letter-spacing: .1em; }
    .kingdom-node__category { color: var(--coral); font-size: .52rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    .kingdom-node h2 { margin: 4px 0 0; font: 600 1.22rem/1 var(--serif); letter-spacing: -.02em; }
    .kingdom-node__access { align-self: start; display: flex; align-items: center; gap: 4px; color: #a7d0c4; font-size: .5rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; }
    .kingdom-node--private .kingdom-node__access { color: #e7bd9c; }
    .kingdom-node__label > a { grid-column: 2 / -1; display: flex; justify-content: space-between; padding-top: 9px; border-top: 1px solid rgba(255,255,255,.08); color: #f4e6c9; font-size: .56rem; font-weight: 900; letter-spacing: .08em; text-decoration: none; text-transform: uppercase; }
    .access-badge { display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 999px; color: #b7ddd1; background: rgba(87,148,130,.14); font-size: .66rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .access-badge--private { color: #e9c9a6; background: rgba(221,125,102,.12); }
    .badge-icon { width: 12px; height: 12px; }
    .atlas__progress { position: relative; z-index: 3; height: 3px; background: rgba(255,255,255,.06); }
    .atlas__progress span { display: block; width: 18%; height: 100%; transform: translateX(0); background: linear-gradient(90deg, var(--mint), var(--gold)); box-shadow: 0 0 16px rgba(228,193,120,.5); transition: width .2s ease-out, transform .2s ease-out; }
    .realm-list[hidden], .atlas[hidden] { display: none; }
    .realm-list { position: relative; width: 100vw; margin-left: calc(50% - 50vw); padding: 18px max(20px, calc(50vw - 590px)) 28px; border-block: 1px solid rgba(228,193,120,.13); background: radial-gradient(circle at 85% 12%, rgba(58,111,115,.16), transparent 28rem), linear-gradient(180deg, rgba(4,18,25,.72), rgba(6,29,35,.94)); }
    .realm-list__bar { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 4px 0 18px; color: #849c99; font-size: .7rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
    .realm-list__bar strong { color: var(--gold); }
    .realm-kind-filters { display: flex; gap: 5px; padding: 4px; border: 1px solid rgba(228,193,120,.18); border-radius: 999px; background: rgba(3,18,23,.54); }
    .realm-kind-filter { border: 0; border-radius: 999px; padding: 8px 12px; color: #91aaa6; background: transparent; cursor: pointer; font: inherit; letter-spacing: .08em; text-transform: uppercase; transition: color .2s, background .2s; }
    .realm-kind-filter[aria-pressed="true"] { color: #172328; background: var(--gold); }
    .realm-list__rows { border-top: 1px solid rgba(228,193,120,.18); }
    .realm-row { display: grid; grid-template-columns: 42px 48px minmax(150px, .85fr) minmax(240px, 1.5fr) auto 132px; align-items: center; gap: 18px; min-height: 116px; border-bottom: 1px solid rgba(228,193,120,.14); animation: rise .55s calc(var(--order) * 45ms) both; transition: background .2s, transform .2s; }
    .realm-row[hidden] { display: none; }
    .realm-row:hover { background: linear-gradient(90deg, rgba(138,199,180,.07), transparent); transform: translateX(5px); }
    .realm-row--private:hover { background: linear-gradient(90deg, rgba(221,125,102,.07), transparent); }
    .realm-row__number { color: #6f8784; font: 700 .66rem/1 var(--sans); letter-spacing: .12em; }
    .realm-row__icon { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid rgba(228,193,120,.42); border-radius: 50%; color: var(--gold); background: rgba(10,39,44,.84); box-shadow: 0 10px 22px rgba(0,0,0,.3); }
    .realm-row--private .realm-row__icon { border-color: rgba(221,125,102,.52); color: #e9b690; }
    .realm-row__icon svg { width: 20px; height: 20px; }
    .realm-row__category { color: var(--coral); font-size: .6rem; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; }
    .realm-row h3 { margin: 7px 0 0; font: 600 1.45rem/1 var(--serif); letter-spacing: -.02em; }
    .realm-row > p { margin: 0; color: #a9bbb7; font-size: .78rem; line-height: 1.55; }
    .realm-row__link { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #f4e6c9; font-size: .65rem; font-weight: 800; letter-spacing: .08em; text-decoration: none; text-transform: uppercase; }
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
    @keyframes kingdom-node-float { from { margin-top: -5px; } to { margin-top: 9px; } }
    @keyframes pegasus-map { from { transform: translate3d(0, 8px, 0) rotate(-2deg); } to { transform: translate3d(28px, -13px, 0) rotate(1deg); } }
    @keyframes kingdom-float { from { transform: translate3d(0, -5px, 0); } to { transform: translate3d(-18px, 13px, 0); } }
    @keyframes pegasus-soar { from { transform: translate3d(0, 0, 0) rotate(-1deg); } to { transform: translate3d(-24px, -17px, 0) rotate(1deg); } }
    @media (max-width: 900px) {
      .hero { min-height: 700px; }
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
      .hero { min-height: 650px; }
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
      .catalogue__head h2 { font-size: 3.3rem; }
      .catalogue__tools { width: 100%; }
      .view-toggle { width: 100%; }
      .view-toggle__button { flex: 1; justify-content: center; }
      .filters { width: 100%; overflow-x: auto; }
      .filter { flex: 1; }
      .atlas__bar { width: min(100% - 28px, 1180px); }
      .atlas__hint { display: none; }
      .atlas__viewport { min-height: 520px; height: 66vh; }
      .atlas__bar { align-items: flex-start; }
      .atlas__status { align-items: flex-start; flex-direction: column; gap: 7px; }
      .atlas__status::before { display: none; }
      .atlas__control { min-width: 38px; height: 38px; padding-inline: 11px; }
      .realm-list { padding-inline: 14px; }
      .realm-list__bar { align-items: flex-start; flex-direction: column; gap: 12px; }
      .realm-kind-filters { width: 100%; overflow-x: auto; }
      .realm-kind-filter { flex: 1; white-space: nowrap; }
      .realm-row { grid-template-columns: 34px 42px 1fr auto; gap: 12px; min-height: 112px; padding: 16px 2px; }
      .realm-row__identity { align-self: center; }
      .realm-row > p { grid-column: 3 / -1; }
      .realm-row__link { grid-column: 3 / -1; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.08); }
      .legend, .footer { align-items: flex-start; flex-direction: column; }
      .footer { width: min(100% - 28px, 1180px); }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="hero">
      <div class="hero__art" aria-hidden="true"></div>
      <div class="hero__kingdom hero__kingdom--main" aria-hidden="true"><img src="/assets/garden-kingdom.webp" alt="" /></div>
      <div class="hero__kingdom hero__kingdom--observatory" aria-hidden="true"><img src="/assets/garden-kingdom-observatory.webp" alt="" /></div>
      <div class="hero__kingdom hero__kingdom--outpost" aria-hidden="true"><img src="/assets/garden-kingdom-outpost.webp" alt="" /></div>
      <div class="hero__pegasus" aria-hidden="true"><img src="/assets/garden-pegasus.webp" alt="" /></div>
      <nav class="nav" aria-label="Primary navigation">
        <a class="brand" href="/"><span class="brand__mark">${icon("spark")}</span><span>Garden of Zo</span></a>
        <span class="nav__status">${escapeHtml(viewLabel)}</span>
      </nav>
      <div class="hero__content">
        <p class="eyebrow">A personal cloud realm</p>
        <h1>Garden <em>of Zo</em></h1>
        <p class="hero__lede">${escapeHtml(heroCopy)}</p>
        <div class="hero__footer">
          <a class="explore" href="#realms">Open the sky atlas <span aria-hidden="true">&darr;</span></a>
          <span class="hero__count"><strong>${allApps.length}</strong> realms &nbsp; / &nbsp; ${publicCount} open &nbsp; / &nbsp; ${privateCount} owner-only</span>
        </div>
      </div>
    </header>
    <main class="catalogue" id="realms">
      <div class="catalogue__head">
        <div>
          <p class="eyebrow" data-view-eyebrow>The sky atlas</p>
          <h2>Choose the next<br />horizon.</h2>
          <p data-view-description>Travel from node to node across your apps, workflows and agents. Every stop is a live destination in the Garden of Zo.</p>
        </div>
        <div class="catalogue__tools">
          <div class="view-toggle" role="group" aria-label="Choose catalogue view">
            <button class="view-toggle__button" type="button" data-view="atlas" aria-pressed="true" aria-controls="atlas-view">${icon("compass")}Sky atlas</button>
            <button class="view-toggle__button" type="button" data-view="list" aria-pressed="false" aria-controls="list-view">${icon("list")}List view</button>
          </div>
          <div class="filters" role="group" aria-label="Filter realms">
            <button class="filter" type="button" data-filter="all" aria-pressed="true">All ${allApps.length}</button>
            <button class="filter" type="button" data-filter="public" aria-pressed="false">Open ${publicCount}</button>
            <button class="filter" type="button" data-filter="private" aria-pressed="false">Private ${privateCount}</button>
          </div>
        </div>
      </div>
      <section class="atlas" id="atlas-view" data-view-panel="atlas" aria-label="Sky atlas">
        <div class="atlas__bar">
          <span class="atlas__status"><span data-atlas-status>${String(allApps.length).padStart(2, "0")} kingdoms charted</span><span class="atlas__hint">Drag the sky &middot; scroll to roam &middot; select a kingdom to enter</span></span>
          <div class="atlas__controls">
            <button class="atlas__control" type="button" data-atlas-zoom-out aria-label="Zoom out">&minus;</button>
            <button class="atlas__control" type="button" data-atlas-reset aria-label="Re-centre sky atlas">Centre</button>
            <button class="atlas__control" type="button" data-atlas-zoom-in aria-label="Zoom in">&plus;</button>
          </div>
        </div>
        <div class="atlas__viewport" data-atlas tabindex="0" aria-label="Pannable sky atlas. Drag, scroll, or use arrow keys to traverse the kingdom graph.">
          <div class="atlas__canvas" data-atlas-canvas>
            <div class="atlas__world" data-atlas-world>
              <svg class="sky-routes" viewBox="0 0 2240 1080" preserveAspectRatio="none" aria-hidden="true">${routes}</svg>
              <img class="atlas__pegasus" src="/assets/garden-pegasus.webp" alt="" aria-hidden="true" />
              ${nodes}
            </div>
          </div>
        </div>
        <div class="atlas__progress" aria-hidden="true"><span data-atlas-progress></span></div>
      </section>
      <section class="realm-list" id="list-view" data-view-panel="list" aria-label="Realm list" hidden>
        <div class="realm-list__bar">
          <span><strong data-list-count>${allApps.length}</strong> destinations in view</span>
          <div class="realm-kind-filters" role="group" aria-label="Filter list by realm type">
            <button class="realm-kind-filter" type="button" data-kind-filter="all" aria-pressed="true">All ${allApps.length}</button>
            <button class="realm-kind-filter" type="button" data-kind-filter="app" aria-pressed="false">Apps ${kindCounts.app}</button>
            <button class="realm-kind-filter" type="button" data-kind-filter="workflow" aria-pressed="false">Workflows ${kindCounts.workflow}</button>
            <button class="realm-kind-filter" type="button" data-kind-filter="agent" aria-pressed="false">Agents ${kindCounts.agent}</button>
          </div>
        </div>
        <div class="realm-list__rows">${listCards}</div>
      </section>
      <div class="legend">
        <span><strong>Open nodes</strong> can be visited by anyone. <strong>Owner nodes</strong> pass through Zo's private authentication boundary.</span>
        <span class="legend__mark">Built on Zo Computer</span>
      </div>
    </main>
    <footer class="footer"><span>Garden of Zo</span><span>One server. Many worlds.</span></footer>
  </div>
  <script>
    const accessFilters = [...document.querySelectorAll('[data-filter]')];
    const kindFilters = [...document.querySelectorAll('[data-kind-filter]')];
    const viewButtons = [...document.querySelectorAll('[data-view]')];
    const viewPanels = [...document.querySelectorAll('[data-view-panel]')];
    const atlasCards = [...document.querySelectorAll('[data-atlas-card]')];
    const listCards = [...document.querySelectorAll('[data-list-card]')];
    const atlas = document.querySelector('[data-atlas]');
    const status = document.querySelector('[data-atlas-status]');
    const progress = document.querySelector('[data-atlas-progress]');
    const zoomOut = document.querySelector('[data-atlas-zoom-out]');
    const zoomIn = document.querySelector('[data-atlas-zoom-in]');
    const reset = document.querySelector('[data-atlas-reset]');
    const world = document.querySelector('[data-atlas-world]');
    const routes = [...document.querySelectorAll('[data-sky-route]')];
    const listCount = document.querySelector('[data-list-count]');
    const viewEyebrow = document.querySelector('[data-view-eyebrow]');
    const viewDescription = document.querySelector('[data-view-description]');
    const visibleNodes = () => atlasCards.filter((card) => !card.hidden);
    let accessFilter = 'all';
    let kindFilter = 'all';
    let zoom = innerWidth < 620 ? .64 : innerWidth < 1000 ? .72 : .82;
    let mapInitialised = false;
    const setZoom = (nextZoom, focusX = atlas.clientWidth / 2, focusY = atlas.clientHeight / 2) => {
      const oldZoom = zoom;
      zoom = Math.max(.58, Math.min(1.08, nextZoom));
      const worldX = (atlas.scrollLeft + focusX) / oldZoom;
      const worldY = (atlas.scrollTop + focusY) / oldZoom;
      atlas.style.setProperty('--atlas-zoom', String(zoom));
      atlas.scrollLeft = worldX * zoom - focusX;
      atlas.scrollTop = worldY * zoom - focusY;
      zoomOut.disabled = zoom <= .58;
      zoomIn.disabled = zoom >= 1.08;
      updateAtlas();
    };
    const centreNode = (node, behavior = 'smooth') => {
      if (!node) return;
      const x = node.offsetLeft * zoom + node.offsetWidth * zoom / 2 - atlas.clientWidth / 2;
      const y = node.offsetTop * zoom + node.offsetHeight * zoom / 2 - atlas.clientHeight / 2;
      atlas.scrollTo({ left: Math.max(0, x), top: Math.max(0, y), behavior });
    };
    const centreMap = (behavior = 'smooth') => {
      const visible = visibleNodes();
      centreNode(visible[Math.floor((visible.length - 1) / 2)] || visible[0], behavior);
    };
    const setView = (view, remember = true) => {
      const selected = view === 'list' ? 'list' : 'atlas';
      viewButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === selected)));
      viewPanels.forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== selected; });
      viewEyebrow.textContent = selected === 'list' ? 'The realm directory' : 'The sky atlas';
      viewDescription.textContent = selected === 'list'
        ? 'Scan every app, workflow and agent in one compact directory, then enter any realm directly.'
        : 'Travel from node to node across your apps, workflows and agents. Every stop is a live destination in the Garden of Zo.';
      if (remember) {
        try { localStorage.setItem('garden-of-zo-view', selected); } catch {}
      }
      if (selected === 'atlas') requestAnimationFrame(() => {
        refreshRoute();
        if (!mapInitialised) { centreMap('auto'); mapInitialised = true; }
        updateAtlas();
      });
    };
    const refreshRoute = () => {
      routes.forEach((route) => {
        const from = atlasCards[Number(route.dataset.from)];
        const to = atlasCards[Number(route.dataset.to)];
        route.classList.toggle('is-hidden', from.hidden || to.hidden);
      });
    };
    const updateAtlas = () => {
      const visible = visibleNodes();
      if (!visible.length) return;
      status.textContent = String(visible.length).padStart(2, '0') + ' kingdoms charted · ' + Math.round(zoom * 100) + '% scale';
      const max = Math.max(1, atlas.scrollWidth - atlas.clientWidth);
      const viewportRatio = Math.min(1, atlas.clientWidth / atlas.scrollWidth);
      progress.style.width = Math.max(8, viewportRatio * 100) + '%';
      progress.style.transform = 'translateX(' + (atlas.scrollLeft / max * (100 / viewportRatio - 100)) + '%)';
    };
    const applyFilters = () => {
      atlasCards.forEach((card) => { card.hidden = accessFilter !== 'all' && card.dataset.access !== accessFilter; });
      listCards.forEach((card) => {
        const accessMismatch = accessFilter !== 'all' && card.dataset.access !== accessFilter;
        const kindMismatch = kindFilter !== 'all' && card.dataset.kind !== kindFilter;
        card.hidden = accessMismatch || kindMismatch;
      });
      listCount.textContent = String(listCards.filter((card) => !card.hidden).length);
      requestAnimationFrame(() => { refreshRoute(); centreMap(); updateAtlas(); });
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
    zoomOut.addEventListener('click', () => setZoom(zoom - .1));
    zoomIn.addEventListener('click', () => setZoom(zoom + .1));
    reset.addEventListener('click', () => centreMap());
    atlas.addEventListener('scroll', updateAtlas, { passive: true });
    atlas.addEventListener('wheel', (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        setZoom(zoom + (event.deltaY < 0 ? .08 : -.08), event.offsetX, event.offsetY);
        return;
      }
      const canMoveX = atlas.scrollWidth > atlas.clientWidth;
      const canMoveY = atlas.scrollHeight > atlas.clientHeight;
      if (!canMoveX && !canMoveY) return;
      event.preventDefault();
      atlas.scrollLeft += event.deltaX || event.deltaY;
      atlas.scrollTop += event.deltaX ? event.deltaY : 0;
    }, { passive: false });
    atlas.addEventListener('keydown', (event) => {
      const distance = event.shiftKey ? 260 : 90;
      if (event.key === 'ArrowLeft') { event.preventDefault(); atlas.scrollBy({ left: -distance, behavior: 'smooth' }); }
      if (event.key === 'ArrowRight') { event.preventDefault(); atlas.scrollBy({ left: distance, behavior: 'smooth' }); }
      if (event.key === 'ArrowUp') { event.preventDefault(); atlas.scrollBy({ top: -distance, behavior: 'smooth' }); }
      if (event.key === 'ArrowDown') { event.preventDefault(); atlas.scrollBy({ top: distance, behavior: 'smooth' }); }
    });
    let dragStartX = 0;
    let dragStartY = 0;
    let scrollStartX = 0;
    let scrollStartY = 0;
    atlas.addEventListener('pointerdown', (event) => {
      if (event.target.closest('a, button')) return;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      scrollStartX = atlas.scrollLeft;
      scrollStartY = atlas.scrollTop;
      atlas.classList.add('is-dragging');
      atlas.setPointerCapture(event.pointerId);
    });
    atlas.addEventListener('pointermove', (event) => {
      if (!atlas.classList.contains('is-dragging')) return;
      atlas.scrollLeft = scrollStartX - (event.clientX - dragStartX);
      atlas.scrollTop = scrollStartY - (event.clientY - dragStartY);
    });
    const endDrag = () => atlas.classList.remove('is-dragging');
    atlas.addEventListener('pointerup', endDrag);
    atlas.addEventListener('pointercancel', endDrag);
    addEventListener('resize', () => { refreshRoute(); updateAtlas(); });
    let savedView = 'atlas';
    try { savedView = localStorage.getItem('garden-of-zo-view') || 'atlas'; } catch {}
    setZoom(zoom);
    setView(savedView, false);
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
      "/assets/garden-pegasus.webp": "garden-pegasus.webp"
    };

    if (heroAssets[url.pathname]) {
      return new Response(Bun.file(join(dirname(configFile), "assets", heroAssets[url.pathname])), {
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
