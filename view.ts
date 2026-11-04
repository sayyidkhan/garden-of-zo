import type { RouterConfig } from "./config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderInventory, renderInventorySearch } from "./operations/view";
import { categoryRoles, ownershipLabel, ownershipCategories, ownershipRoles, type ProjectOwnership } from "./project-labels";

const shellVersion = createHash("sha256").update(readFileSync(new URL("./client/shell.js", import.meta.url))).digest("hex").slice(0, 12);
const atlasVersion = createHash("sha256").update(readFileSync(new URL("./client/atlas.ts", import.meta.url))).digest("hex").slice(0, 12);
const inventoryVersion = createHash("sha256").update(readFileSync(new URL("./operations/client.js", import.meta.url))).digest("hex").slice(0, 12);

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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] as string);
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
  const allApps = catalog.flatMap((gateway) => gateway.routes.filter((route) => route.listed !== false).map((route) => ({ gateway, route })));
  const publicCount = allApps.filter(({ gateway }) => gateway.access === "public").length;
  const privateCount = allApps.length - publicCount;
  const kindCounts = {
    app: allApps.filter(({ route }) => route.kind === "app").length,
    agent: allApps.filter(({ route }) => route.kind === "agent").length
  };
  const atlasWidth = Math.max(3600, ...allApps.map(({ route }) => route.atlas.x + 360));
  const atlasHeight = Math.max(2500, ...allApps.map(({ route }) => route.atlas.y + 420));
  const appEntries = allApps.map(({ gateway, route }, index) => {
    const restricted = gateway.access === "private";
    const sameGateway = gateway.access === current.access;
    const routeHref = `${route.prefix}${route.entryPath ?? ""}`;
    const href = sameGateway ? routeHref : `${gateway.gatewayUrl}${routeHref}`;
    const displayUrl = `${gateway.gatewayUrl}${routeHref}`;
    const accessLabel = restricted ? "Owner access" : "Public access";
    const action = "Enter realm";

    return { gateway, route, index, restricted, href, displayUrl, accessLabel, action };
  });
  const entryById = new Map(appEntries.map((entry) => [entry.route.label, entry]));
  const graphLinks = appEntries.flatMap((from) => (from.route.atlas.links ?? []).map((link) => {
    const to = entryById.get(link.to)!;
    return { from, to, geometry: atlasRouteGeometry(from.route.atlas, to.route.atlas, link.bend) };
  }));
  const minimapRoutes = graphLinks.map(({ from, to, geometry }) => `<path data-minimap-route data-from="${from.index}" data-to="${to.index}" d="${geometry.path}" />`).join("");
  const minimapNodes = appEntries.map(({ gateway, route, index }) => {
    const position = route.atlas;
    return `<circle data-minimap-node data-node-index="${index}" data-access="${gateway.access}" data-kind="${route.kind}" cx="${position.x}" cy="${position.y}" r="26" />`;
  }).join("");
  const listCards = appEntries.map(({ gateway, route, index, restricted, href, displayUrl, accessLabel, action }) => {
    const author = gateway.authors[route.authorId];
    const artFile = `garden-realm-${route.atlas.art}.webp`;
    return `<article class="realm-row ${restricted ? "realm-row--private" : ""}" data-list-card data-realm-id="${escapeHtml(route.label)}" data-access="${gateway.access}" data-kind="${route.kind}" data-ownership-category="${route.ownership.category}" data-ownership-role="${route.ownership.subcategory}" data-author="${escapeHtml(route.authorId)}" style="--order:${index}">
      <span class="realm-row__number">${String(index + 1).padStart(2, "0")}</span>
      <span class="realm-row__visual realm-row__visual--${route.atlas.art}" aria-hidden="true">
        <img class="realm-row__kingdom" src="/assets/${artFile}" alt="" loading="lazy" decoding="async" />
        <span class="realm-row__icon">${icon(route.icon)}</span>
      </span>
      <div class="realm-row__identity">
        <span class="realm-row__category">${escapeHtml(route.category)}</span>
        <h3>${escapeHtml(route.title)}</h3>
        <span class="project-label">${escapeHtml(ownershipLabel(route.ownership))}</span>
        <a class="realm-row__author" href="${escapeHtml(author.profileUrl)}" target="_blank" rel="noreferrer">By ${escapeHtml(author.name)} <span>${escapeHtml(author.handle)}</span></a>
      </div>
      <div class="realm-row__details">
        <p>${escapeHtml(route.description)}</p>
        <a class="realm-row__url" href="${escapeHtml(href)}" title="Open ${escapeHtml(displayUrl)}">${escapeHtml(displayUrl)}</a>
      </div>
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

  const viewLabel = "Open sky atlas";
  const atlasData = {
    width: atlasWidth, height: atlasHeight,
    realms: appEntries.map(({ gateway, route, index, href, displayUrl, accessLabel }) => ({
      id: route.label, index, title: route.title, description: route.description,
      category: route.category, ownershipCategory: route.ownership.category, ownershipRole: route.ownership.subcategory, ownershipLabel: ownershipLabel(route.ownership), kind: route.kind, access: gateway.access, accessLabel,
      href, displayUrl, oversightUrl: catalog.find(g => g.access === "private")!.gatewayUrl + "/#list?entity=" + encodeURIComponent((route.kind === "agent" ? "agent:" : "app:") + route.label), repositoryUrl: route.repositoryUrl, author: gateway.authors[route.authorId],
      x: route.atlas.x, y: route.atlas.y, scale: route.atlas.scale,
      art: `/assets/garden-realm-${route.atlas.art}.webp`
    })),
    links: graphLinks.map(({ from, to, geometry }) => ({ from: from.route.label, to: to.route.label, path: geometry.path }))
  };
  const heroCopy = "A constellation of tools, agents and experiments growing on one personal cloud computer.";
  const privateHome = current.access === "private";
  const homeSections = privateHome ? ["apps", "agents", "services", "workflows", "databases"] : ["apps", "agents"];
  const homeSummary = `<section class="hero-summary${privateHome ? "" : " hero-summary--catalogue"}" aria-label="${privateHome ? "Private inventory" : "Catalogue destinations"}">
    <p class="hero-summary__label">${privateHome ? "Your private garden" : "Explore the catalogue"}</p>
    <nav class="hero-summary__grid" aria-label="Browse Garden records">
      ${homeSections.map(section => `<a class="hero-summary__item" data-home-section="${section}" href="/#list?${privateHome ? "tab=" + section : "kind=" + (section === "apps" ? "app" : "agent")}"><strong ${privateHome ? 'data-home-count="' + section + '"' : ""}>${privateHome ? "…" : section === "apps" ? kindCounts.app : kindCounts.agent}</strong><span>${section[0].toUpperCase() + section.slice(1)}</span></a>`).join("")}
    </nav>
    ${privateHome ? "" : `<p class="hero-summary__note">${allApps.length} catalogue destinations · ${publicCount} public · ${privateCount} owner-only</p>`}
    ${privateHome ? '<p class="hero-summary__freshness" data-home-freshness role="status">Loading inventory…</p>' : ""}
  </section>`;

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
    .hero { position: relative; display: flex; flex-direction: column; min-height: 100svh; isolation: isolate; }
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
    .nav__label--compact { display: none; }
    .hero__content { position: relative; z-index: 3; width: min(1180px, calc(100% - 40px)); margin: auto; padding: clamp(16px, 3svh, 40px) 0 24px; }
    .hero .eyebrow { margin-bottom: 16px; }
    .eyebrow { margin: 0 0 22px; color: #f1d9a2; font-size: .76rem; font-weight: 800; letter-spacing: .2em; text-transform: uppercase; }
    .hero h1 { max-width: 720px; margin: 0; font: 600 clamp(4rem, min(9vw, 10svh), 7.6rem)/.86 var(--serif); letter-spacing: -.055em; text-wrap: balance; text-shadow: 0 8px 50px rgba(0,0,0,.4); }
    .hero h1 em { display: block; color: #f2d59b; font-weight: 400; }
    .hero__lede { max-width: 560px; margin: 20px 0 0; color: #e4ebe5; font: 400 1.05rem/1.5 var(--sans); text-shadow: 0 2px 20px #06151d; }
    .hero__footer { display: flex; align-items: center; gap: 26px; margin-top: 20px; }
    .explore { display: inline-flex; align-items: center; gap: 12px; padding: 14px 19px; border-radius: 999px; color: #142026; background: var(--ink); font-size: .82rem; font-weight: 800; letter-spacing: .04em; text-decoration: none; transition: transform .25s ease, background .25s ease; }
    .explore:hover { transform: translateY(-3px); background: #fffaf0; }
    .hero__count { color: #d9e3dd; font: 500 .78rem/1.4 var(--sans); letter-spacing: .08em; text-transform: uppercase; }
    .hero__count strong { color: var(--gold); }
    .hero-summary { width: min(100%, 600px); margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--line); text-shadow: 0 2px 12px var(--night); }
    .hero-summary--catalogue { width: min(100%, 400px); }
    .hero-summary__label { margin: 0 0 14px; color: var(--muted); font-size: .65rem; font-weight: 500; letter-spacing: .16em; text-transform: uppercase; }
    .hero-summary__grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }
    .hero-summary--catalogue .hero-summary__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .hero-summary__item { position: relative; display: grid; min-width: 0; gap: 6px; padding: 0 16px 6px; border-left: 1px solid var(--line); text-decoration: none; transition: background .2s; }
    .hero-summary__item:first-child { padding-left: 0; border-left: 0; }
    .hero-summary__item::after { content: "↗"; position: absolute; right: 12px; top: 4px; color: var(--mint); font-size: .8rem; opacity: .65; transition: color .2s, transform .2s; }
    .hero-summary__item:hover { background: rgba(244,216,155,.04); }
    .hero-summary__item:hover::after { color: var(--gold); transform: translate(2px, -2px); opacity: 1; }
    .hero-summary__item:focus-visible { outline: 2px solid var(--gold); outline-offset: 4px; }
    .hero-summary__item strong { color: #f2d59b; font: 400 2.6rem/.95 var(--serif); font-variant-numeric: lining-nums tabular-nums; letter-spacing: -.035em; }
    .hero-summary__item span { color: #e4ebe5; font-size: .72rem; line-height: 1.5; }
    .hero-summary__note, .hero-summary__freshness { margin: 12px 0 0; color: var(--muted); font-size: .68rem; line-height: 1.6; }
    .hero-summary__freshness[data-state="error"], .hero-summary__freshness[data-state="stale"] { color: var(--gold); }
    .hero[hidden], .catalogue[hidden], .footer[hidden] { display: none; }
    .catalogue { position: relative; z-index: 3; width: min(1180px, calc(100% - 40px)); min-height: 100svh; margin: 0 auto; padding: 28px 0 24px; }
    .catalogue__nav { display: flex; align-items: center; justify-content: space-between; padding-bottom: 22px; border-bottom: 1px solid rgba(255,255,255,.14); }
    .catalogue__return { display: inline-flex; align-items: center; gap: 9px; padding: 10px 14px; border: 1px solid rgba(228,193,120,.28); border-radius: 999px; color: #d5e1dc; background: rgba(3,18,23,.48); font-size: .7rem; font-weight: 800; letter-spacing: .08em; text-decoration: none; text-transform: uppercase; transition: transform .2s, border-color .2s; }
    .catalogue__return:hover { transform: translateY(-2px); border-color: rgba(228,193,120,.65); }
    .catalogue__head { display: grid; grid-template-columns: 1fr; align-items: start; gap: 24px; margin-bottom: 28px; }
    .catalogue__nav + .catalogue__head { margin-top: 54px; }
    .catalogue__head h2 { margin: 0; max-width: none; font: 500 clamp(2.8rem, 6vw, 5.2rem)/.94 var(--serif); letter-spacing: -.035em; white-space: nowrap; }
    .catalogue__head p { max-width: none; margin: 18px 0 0; color: var(--muted); line-height: 1.65; white-space: nowrap; }
    .catalogue__tools { display: grid; gap: 16px; min-width: 0; width: 100%; }
    .catalogue__navigation { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
    .catalogue__help { display: flex; align-items: center; gap: 16px; }
    .catalogue__filters { display: grid; grid-template-columns: 1.2fr 1.15fr .85fr 1fr; align-items: end; gap: 20px; padding: 18px 20px; border: 1px solid var(--line); border-radius: 14px; background: rgba(5,23,29,.62); }
    .filter-field, .ownership-field { display: grid; gap: 9px; min-width: 0; }
    .filter-field__title, .ownership-filters label { color: #a2b9b2; font: 600 10px var(--sans); letter-spacing: .1em; text-transform: uppercase; }
    .ownership-filters { display: contents; }
    .ownership-filters select { width: 100%; min-width: 0; min-height: 40px; appearance: none; border: 1px solid #34504f; border-radius: 8px; padding: 9px 32px 9px 12px; color: #e1eae5; background: #0c252c url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%239db7af' stroke-width='1.5' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") right 11px center / 14px no-repeat; font: 500 12px var(--sans); cursor: pointer; color-scheme: dark; transition: border-color .2s, background-color .2s; }
    .ownership-filters select:hover { border-color: #7a9b8d; }
    .ownership-filters select:has(option:checked:not([value=""])) { border-color: #8ac7b470; background-color: #163a3c; color: #c5e8dc; }
    .label-combobox { position: relative; min-width: 0; }
    .label-combobox input { box-sizing: border-box; width: 100%; min-width: 0; min-height: 40px; padding: 9px 36px 9px 12px; border: 1px solid #34504f; border-radius: 8px; color: #e1eae5; background: #0c252c; font: 500 12px var(--sans); text-overflow: ellipsis; transition: border-color .2s, background-color .2s; }
    .label-combobox input::placeholder { color: #d3dfd9; opacity: 1; }
    .label-combobox input:hover { border-color: #7a9b8d; }
    .label-combobox input:focus { border-color: #8ac7b4; outline: 2px solid #8ac7b430; outline-offset: 1px; }
    .label-combobox[data-selected="true"] input { border-color: #8ac7b470; background: #163a3c; color: #c5e8dc; }
    .label-combobox__toggle { position: absolute; inset: 1px 1px 1px auto; width: 34px; padding: 0; border: 0; border-radius: 0 7px 7px 0; color: #9db7af; background: transparent; cursor: pointer; }
    .label-combobox__toggle::after { content: ""; display: block; width: 6px; height: 6px; margin: -3px auto 0; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); }
    .label-combobox__toggle[aria-expanded="true"]::after { margin-top: 3px; transform: rotate(225deg); }
    .label-combobox__options { position: fixed; z-index: 1000; box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain; padding: 5px; border: 1px solid #42615b; border-radius: 10px; background: #102c33; box-shadow: 0 12px 32px #0007; scrollbar-width: thin; scrollbar-color: #537169 #102c33; color: #e1eae5; font: 500 12px/1.5 var(--sans); }
    .label-combobox__options[hidden] { display: none; }
    .label-combobox__options [role="option"] { position: relative; padding: 9px 26px 9px 9px; border-radius: 5px; cursor: pointer; overflow-wrap: anywhere; }
    .label-combobox__options [role="option"]:hover, .label-combobox__options [data-active="true"] { color: #f2f4e9; background: #294b4d; }
    .label-combobox__options [aria-selected="true"]::after { content: "✓"; position: absolute; right: 9px; color: var(--mint); }
    .label-combobox__empty { padding: 12px 9px; color: #a2b9b2; }
    .clear-labels { padding: 8px 0; border: 0; color: var(--mint); background: transparent; font: 500 11px var(--sans); cursor: pointer; white-space: nowrap; }
    .clear-labels:disabled { color: #829991; opacity: .65; cursor: default; }
    .catalogue__tools :is(select, button):focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
    .realm-list__empty { color: var(--muted); padding: 36px 0; text-align: center; font-size: 14px; }
    .label-legend-button { display: inline-flex; flex: none; align-items: center; gap: 7px; border: 0; border-radius: 6px; padding: 8px 0 8px 8px; background: transparent; color: #b7c5c2; font: 500 12px var(--sans); cursor: pointer; white-space: nowrap; }
    .label-legend-button svg { width: 15px; height: 15px; color: var(--gold); }
    .label-legend-button:hover { color: var(--gold); }
    .label-legend-button:focus-visible, .label-legend:focus-visible { outline: 2px solid var(--gold); outline-offset: 4px; }
    .label-legend { box-sizing: border-box; width: min(780px, calc(100% - 40px)); max-height: calc(100svh - 64px); padding: 0; overflow: hidden; border: 1px solid #3d524e; border-radius: 16px; background: #0c2026; color: var(--ink); box-shadow: 0 32px 120px #000a; }
    .label-legend[open] { display: flex; flex-direction: column; }
    .label-legend::backdrop { background: rgba(2,12,18,.78); backdrop-filter: blur(6px); }
    .label-legend__head { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 18px; padding: 22px 26px 12px; }
    .label-legend__head h2 { margin: 0; font: 500 28px/1.2 var(--serif); letter-spacing: -.02em; }
    .label-legend__head button { display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: #a4b8b2; cursor: pointer; }
    .label-legend__head button:hover { color: var(--ink); background: #1d3339; }
    .label-legend__head button svg { width: 20px; height: 20px; }
    .label-legend button:focus-visible, .label-legend [tabindex="0"]:focus-visible { outline: 2px solid var(--gold); outline-offset: -3px; }
    .label-legend form { margin: 0; }
    .label-legend__intro { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 16px; margin: 0 26px 20px; }
    .label-legend p { margin: 0; color: #b7ccc5; font: 400 13px/1.6 var(--sans); }
    .label-legend__sample { display: inline-flex; align-items: center; flex: none; gap: 10px; padding: 7px 10px; border: 1px solid #405a51; border-radius: 6px; color: #c5d9cf; font: 600 11px/1.4 var(--sans); letter-spacing: .04em; }
    .label-legend__sample span { color: #637d74; }
    .label-legend__body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-color: #537169 #0c2026; scrollbar-width: thin; padding: 0 26px 8px; border-top: 1px solid #2c4143; }
    .label-legend dl { display: grid; margin: 0; font: 400 13px/1.5 var(--sans); }
    .label-legend__category { padding: 20px 0; border-bottom: 1px solid #2c4143; }
    .label-legend__category:last-child { border-bottom: 0; }
    .label-legend dl > div { min-width: 0; }
    .label-legend dt { color: var(--ink); font: 600 11px/1.5 var(--sans); letter-spacing: .04em; }
    .label-legend dd { margin: 5px 0 0; color: #b7ccc5; overflow-wrap: anywhere; }
    .label-legend dl.label-legend__categories > div { display: grid; grid-template-columns: 112px minmax(0, 1fr); align-items: center; gap: 20px; }
    .label-legend__categories dt { justify-self: start; min-width: 92px; padding: 5px 10px; border-radius: 5px; background: #29362c; color: #e4c178; font-size: 11px; }
    .label-legend__category:nth-child(2) .label-legend__categories dt { color: #8dd3bf; background: #163e37; }
    .label-legend__category:nth-child(3) .label-legend__categories dt { color: #b8bcea; background: #2b2e46; }
    .label-legend__category:nth-child(4) .label-legend__categories dt { color: #e8ad98; background: #3d302d; }
    .label-legend__category:nth-child(5) .label-legend__categories dt { color: #aacde8; background: #23384a; }
    .label-legend__category:nth-child(6) .label-legend__categories dt { color: #dbb5dc; background: #3a2c40; }
    .label-legend__categories dd { margin: 0; }
    .label-legend dl.label-legend__roles { gap: 10px; margin: 16px 0 0 16px; padding-left: 20px; border-left: 1px solid #38504e; }
    .label-legend__roles > div { display: grid; grid-template-columns: 132px minmax(0, 1fr); column-gap: 16px; }
    .label-legend__roles dt { padding-top: 2px; color: #c4d2cc; font-size: 10px; }
    .label-legend__roles dd { margin: 0; color: #93aaa2; font-size: 12px; }
    .label-legend__foot { flex: none; padding: 14px 26px 18px; border-top: 1px solid #2c4143; background: #0a1c22; }
    .label-legend__status { display: flex; flex-wrap: wrap; gap: 6px 24px; }
    .label-legend__status p { color: #93aaa1; font-size: 11px; }
    .label-legend__status strong { color: #d8bd80; font-weight: 500; }
    .label-legend__status p:last-child strong { color: #bfd0c8; }
    .label-legend p.label-legend__note { margin-top: 8px; color: #819c92; font-size: 10px; }
    @media (max-width: 580px) {
      .label-legend { width: calc(100% - 24px); max-height: calc(100svh - 32px); border-radius: 12px; }
      .label-legend__head { padding: 16px 18px 8px; }
      .label-legend__head h2 { font-size: 25px; }
      .label-legend__intro { align-items: flex-start; flex-direction: column; gap: 10px; margin: 0 18px 12px; }
      .label-legend__intro p { font-size: 12px; }
      .label-legend__body { padding: 0 18px 6px; }
      .label-legend__category { padding-block: 16px; }
      .label-legend dl.label-legend__categories > div { grid-template-columns: 86px minmax(0, 1fr); gap: 12px; }
      .label-legend__categories dt { min-width: 80px; padding-inline: 7px; font-size: 10px; }
      .label-legend dd { font-size: 12px; }
      .label-legend dl.label-legend__roles { margin: 14px 0 0 8px; padding-left: 14px; gap: 12px; }
      .label-legend__roles > div { grid-template-columns: 1fr; gap: 3px; }
      .label-legend__foot { padding: 12px 18px 14px; }
    }
    @media (max-height: 500px) {
      .label-legend { max-height: calc(100svh - 16px); }
      .label-legend__head { padding-block: 8px 4px; }
      .label-legend__intro { margin-bottom: 6px; flex-direction: row; align-items: center; }
      .label-legend__intro p { font-size: 11px; }
      .label-legend__foot { padding-block: 8px; }
      .label-legend p.label-legend__note { margin-top: 4px; }
    }
    .view-toggle { display: inline-flex; flex: none; gap: 3px; padding: 4px; border: 1px solid var(--line); border-radius: 10px; background: rgba(3,18,23,.55); }
    .filters, .realm-kind-filters { display: flex; gap: 2px; min-width: 0; min-height: 40px; padding: 3px; border-radius: 8px; background: #071c23; }
    .view-toggle__button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 34px; border: 0; border-radius: 6px; padding: 8px 14px; color: #a2b9b2; background: transparent; cursor: pointer; font-size: 12px; font-weight: 600; white-space: nowrap; transition: color .2s, background .2s; }
    .view-toggle__button svg { width: 16px; height: 16px; }
    .view-toggle__button[aria-pressed="true"] { color: #172825; background: #e4cf9d; }
    .filter, .realm-kind-filter { display: inline-flex; flex: 1; align-items: center; justify-content: center; gap: 5px; min-width: 0; border: 0; border-radius: 6px; padding: 7px 8px; color: #a2b9b2; background: transparent; cursor: pointer; font: 500 12px var(--sans); white-space: nowrap; transition: color .2s, background .2s; }
    .filter:hover, .realm-kind-filter:hover, .view-toggle__button:hover { color: var(--ink); background: #203e40; }
    .filter[aria-pressed="true"], .realm-kind-filter[aria-pressed="true"] { color: #d3ebe1; background: #284c49; box-shadow: inset 0 0 0 1px #8ac7b438; }
    .filter__count { color: #88a59b; font-size: 10px; font-variant-numeric: tabular-nums; }
    :is(.filter, .realm-kind-filter)[aria-pressed="true"] .filter__count { color: #b6d3c7; }
    body.is-atlas-view { overflow: hidden; }
    body.is-atlas-view .shell { height: 100svh; min-height: 0; overflow: hidden; }
    body.is-atlas-view .catalogue { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; grid-template-columns: minmax(0, 1fr); width: 100%; height: 100svh; min-height: 0; margin: 0; padding: 0; overflow: hidden; }
    body.is-atlas-view .catalogue[hidden] { display: none; }
    body.is-atlas-view .catalogue__nav { width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 14px 0; }
    body.is-atlas-view .catalogue__nav + .catalogue__head { margin-top: 0; }
    body.is-atlas-view .catalogue__head { display: block; grid-row: 3; width: 100%; min-width: 0; margin: 0; padding: 9px max(20px, calc((100vw - 1180px) / 2)) max(9px, env(safe-area-inset-bottom)); border-top: 1px solid rgba(228,193,120,.13); background: linear-gradient(180deg, rgba(3,18,23,.9), rgba(3,18,23,.98)); box-shadow: 0 -16px 42px rgba(0,0,0,.24); overflow: hidden; }
    body.is-atlas-view .catalogue__intro { display: none; }
    body.is-atlas-view .catalogue__tools { gap: 8px; width: min(1180px, 100%); margin: auto; }
    body.is-atlas-view .catalogue__filters { padding: 10px 14px; gap: 16px; }
    body.is-atlas-view :is(.filter-field, .ownership-field) { gap: 6px; }
    body.is-atlas-view .atlas { display: grid; grid-row: 2; grid-template-rows: auto minmax(0, 1fr) 3px; grid-template-columns: minmax(0, 1fr); width: 100%; max-width: 100vw; min-height: 0; margin: 0; }
    body.is-atlas-view .atlas__bar { padding-block: 10px; }
    body.is-atlas-view .atlas__viewport { height: auto; min-height: 0; }
    body.is-atlas-view .footer { display: none; }
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
    .atlas__viewport { position: relative; z-index: 2; height: min(720px, 72vh); min-height: 540px; overflow: clip; overscroll-behavior: contain; cursor: grab; touch-action: none; user-select: none; contain: layout paint style; background: radial-gradient(circle at 50% 45%, rgba(67,130,132,.1), transparent 34rem); }
    .atlas__viewport::-webkit-scrollbar { display: none; }
    .atlas__viewport canvas { display: block; width: 100%; height: 100%; touch-action: none; }
    .atlas__viewport:focus { outline: none; }
    .atlas__viewport:focus-visible { outline: 1px solid var(--gold); outline-offset: -2px; }
    .atlas__loading { position: absolute; inset: 45% 20px auto; text-align: center; color: #c9d9d0; font: 16px var(--serif); pointer-events: none; }
    .atlas__loading[hidden], .realm-panel[hidden] { display: none; }
    .atlas__location { position: relative; }
    .atlas__location select { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: pointer; }
    .atlas__location:focus-within { outline: 2px solid var(--gold); outline-offset: 2px; }
    .realm-panel { position: absolute; z-index: 8; top: 86px; right: 22px; width: 374px; overflow: hidden; border: 1px solid rgba(228,193,120,.48); border-radius: 20px; background: linear-gradient(145deg, rgba(23,57,59,.98), rgba(5,22,29,.98)); box-shadow: 0 28px 70px rgba(0,8,13,.62), inset 0 1px rgba(255,241,203,.08); color: #d0ded5; animation: realm-panel-in .28s cubic-bezier(.2,.8,.2,1); }
    .realm-panel::before { content: ""; position: absolute; inset: 0 0 auto; height: 2px; background: linear-gradient(90deg, transparent, var(--gold) 22%, #fff1bd 50%, var(--gold) 78%, transparent); opacity: .82; }
    .realm-panel__close { position: absolute; z-index: 2; top: 14px; right: 14px; display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid rgba(226,239,231,.28); border-radius: 50%; background: rgba(4,22,29,.72); color: #f7ecd3; font-size: 21px; line-height: 1; cursor: pointer; transition: background .2s, transform .2s, border-color .2s; }
    .realm-panel__close:hover { transform: rotate(90deg); border-color: var(--gold); background: #12363a; }
    .realm-panel__top { display: grid; grid-template-columns: 122px minmax(0, 1fr); gap: 17px; align-items: center; min-height: 148px; padding: 21px 49px 17px 20px; background: radial-gradient(circle at 16% 10%, rgba(228,193,120,.18), transparent 9rem), linear-gradient(90deg, rgba(3,17,23,.5), transparent); }
    .realm-panel__visual { position: relative; display: grid; place-items: center; width: 122px; height: 108px; margin: 0; overflow: hidden; border: 1px solid rgba(228,193,120,.35); border-radius: 14px; background: radial-gradient(circle at 50% 26%, rgba(228,193,120,.22), transparent 48%), linear-gradient(145deg, #102e34, #061c24); box-shadow: inset 0 0 0 1px rgba(255,241,203,.05), 0 12px 26px rgba(0,8,13,.26); }
    .realm-panel__visual::after { content: ""; position: absolute; right: -31px; bottom: -36px; width: 94px; height: 94px; border: 1px solid rgba(228,193,120,.2); border-radius: 50%; }
    .realm-panel__art { position: relative; z-index: 1; display: block; width: 132px; height: 102px; object-fit: contain; filter: drop-shadow(0 12px 6px rgba(0,6,10,.62)); }
    .realm-panel__eyebrow { display: block; margin-bottom: 8px; color: #f1d296; font-size: 9px; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; }
    .realm-panel__category { display: block; color: #a6c9bf; font-size: 9px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .realm-panel h2 { margin: 5px 0 7px; color: #fff2d0; font: 600 clamp(1.65rem, 3vw, 2rem)/.95 var(--serif); letter-spacing: -.025em; text-wrap: balance; }
    .realm-panel__access { display: inline-flex; align-items: center; gap: 6px; color: #9ed4c2; font-size: 9px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    .realm-panel__access::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: currentColor; box-shadow: 0 0 10px currentColor; }
    .realm-panel[data-access="private"] .realm-panel__access { color: #e5a98e; }
    .realm-panel__body { padding: 17px 20px 19px; border-top: 1px solid rgba(228,193,120,.13); }
    .realm-panel p { margin: 0; color: #c4d4cd; font-size: 13px; line-height: 1.65; }
    .realm-panel__url { display: block; margin-top: 12px; overflow: hidden; color: #93c7ba; font: 700 10px/1.4 var(--sans); letter-spacing: .01em; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
    .realm-panel__url::before { content: "URL  "; color: #718e87; font-size: 8px; letter-spacing: .13em; }
    .realm-panel__url:hover { color: #fff0bd; }
    .realm-panel__byline { display: flex; align-items: center; gap: 8px; margin: 15px 0 0; color: #7f9a92; font-size: 9px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    .realm-panel__byline::before { content: ""; width: 18px; height: 1px; background: rgba(228,193,120,.58); }
    .realm-panel__byline a { color: #d9e8df; font-size: 10px; font-weight: 700; letter-spacing: 0; text-decoration: none; text-transform: none; }
    .realm-panel__byline a:hover { color: #fff0bd; }
    .realm-panel__actions { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 9px; margin-top: 18px; }
    .realm-panel__actions a { display: inline-flex; align-items: center; justify-content: center; min-height: 43px; border: 1px solid rgba(228,193,120,.3); border-radius: 11px; color: #d9e5de; font-size: 11px; font-weight: 800; letter-spacing: .02em; text-decoration: none; transition: transform .2s, background .2s, border-color .2s; }
    .realm-panel__actions a:first-child { padding: 0 15px; border-color: #fff0bd; background: linear-gradient(135deg, #fff0bd, #dfb966); color: #102228; box-shadow: 0 8px 20px rgba(228,193,120,.22); }
    .realm-panel__actions a:last-child { width: 43px; color: #c7d8d0; background: rgba(8,32,38,.7); font-size: 0; }
    .realm-panel__actions a:last-child::before { content: "↗"; font-size: 16px; }
    .realm-panel__actions a:hover { transform: translateY(-2px); border-color: var(--gold); background: #1b4648; }
    .realm-panel__actions a:first-child:hover { background: #fff5d3; }
    .realm-panel__footer { display: flex; align-items: center; justify-content: space-between; margin-top: 13px; }
    .realm-panel__locate { border: 0; background: transparent; padding: 6px 0; color: #9bb9af; cursor: pointer; font-size: 10px; font-weight: 800; letter-spacing: .05em; }
    .realm-panel__locate:hover { color: #fff0bd; }
    .realm-panel__footer span { color: #6f8c85; font-size: 8px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .atlas__viewport.is-dragging { cursor: grabbing; user-select: none; }
    .access-badge { display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 999px; color: #b7ddd1; background: rgba(87,148,130,.14); font-size: .66rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .access-badge--private { color: #e9c9a6; background: rgba(221,125,102,.12); }
    .badge-icon { width: 12px; height: 12px; }
    .project-label { display: block; width: fit-content; max-width: 100%; margin: 7px 0; padding: 4px 8px; border: 1px solid rgba(228,193,120,.32); border-radius: 7px; color: #f1d296; background: rgba(228,193,120,.07); font: 700 10px/1.5 var(--sans); letter-spacing: .025em; overflow-wrap: anywhere; }
    .atlas__progress { position: relative; z-index: 3; height: 3px; background: rgba(255,255,255,.06); }
    .atlas__progress span { display: block; width: 18%; height: 100%; transform: translateX(0); background: linear-gradient(90deg, var(--mint), var(--gold)); box-shadow: 0 0 16px rgba(228,193,120,.5); transition: width .2s ease-out, transform .2s ease-out; }
    .atlas__minimap { position: absolute; z-index: 7; right: 22px; bottom: 22px; width: 190px; height: 154px; padding: 24px 10px 10px; border: 1px solid rgba(228,193,120,.36); border-radius: 14px; background: rgba(3,18,23,.94); box-shadow: 0 18px 44px rgba(0,0,0,.42); cursor: crosshair; touch-action: none; }
    .atlas__minimap::before { content: "WORLD MAP"; position: absolute; top: 9px; left: 12px; color: #a1b8ad; font-size: 8px; font-weight: 800; letter-spacing: .18em; }
    .atlas__minimap circle.is-active { fill: #fff5cf; stroke: #fff5cf; }
    .atlas__minimap:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
    .atlas__minimap svg { display: block; width: 100%; height: 100%; }
    .atlas__minimap path { fill: none; stroke: rgba(228,193,120,.48); stroke-width: 10; stroke-linecap: round; }
    .atlas__minimap path.is-hidden, .atlas__minimap circle.is-hidden { display: none; }
    .atlas__minimap circle { fill: var(--gold); stroke: #102c31; stroke-width: 12; }
    .atlas__minimap circle[data-access="private"] { fill: var(--coral); }
    .atlas__minimap-chart { position: relative; width: 100%; height: 100%; overflow: hidden; }
    .atlas__minimap-window { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
    .atlas__help { position: absolute; z-index: 7; bottom: 16px; left: 16px; max-width: min(300px, calc(100% - 155px)); color: #b8cec6; font-size: .7rem; line-height: 1.6; }
    .atlas__help summary { width: max-content; padding: 8px 12px; border: 1px solid rgba(228,193,120,.3); border-radius: 12px; background: #071e25; cursor: pointer; }
    .atlas__help p { margin: 6px 0 0; padding: 12px; border-radius: 12px; background: #071e25; }
    .atlas__viewport:is(.is-interacting, .is-zooming) .kingdom-node__art, .atlas__viewport:is(.is-interacting, .is-zooming) .atlas__pegasus, .atlas__viewport:is(.is-interacting, .is-zooming) .sky-routes path, .atlas__viewport:is(.is-interacting, .is-zooming) .sky-route-terminals path, .atlas__viewport:is(.is-interacting, .is-zooming) .kingdom-node__beacon i, .atlas__viewport:is(.is-interacting, .is-zooming) .kingdom-node__enter::before { animation-play-state: paused; }
    .hero.is-offscreen .hero__kingdom, .hero.is-offscreen .hero__pegasus { animation-play-state: paused; }
    .realm-list[hidden], .atlas[hidden] { display: none; }
    .realm-list { position: relative; width: 100vw; margin-left: calc(50% - 50vw); padding: 18px max(20px, calc(50vw - 590px)) 28px; border-block: 1px solid rgba(228,193,120,.13); background: radial-gradient(circle at 85% 12%, rgba(58,111,115,.16), transparent 28rem), linear-gradient(180deg, rgba(4,18,25,.72), rgba(6,29,35,.94)); }
    .realm-list__bar { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 4px 0 18px; color: #849c99; font-size: .7rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
    .realm-list__bar strong { color: var(--gold); }
    .directory-search { display: grid; grid-column: 1 / -1; gap: 9px; min-width: 0; }
    .directory-search label, .inventory-filter-field label { color: #a2b9b2; font: 600 10px var(--sans); letter-spacing: .1em; text-transform: uppercase; }
    .directory-search__input { position: relative; }
    .directory-search__input svg { position: absolute; left: 13px; top: 12px; width: 18px; height: 18px; color: #8da79f; pointer-events: none; }
    .directory-search input { width: 100%; min-width: 0; height: 42px; padding: 9px 14px 9px 40px; border: 1px solid #34504f; border-radius: 8px; background: #0c252c; color: #e1eae5; font: 500 12px var(--sans); }
    .directory-search input::placeholder { color: #8da79f; opacity: 1; }
    .directory-search input:focus { border-color: #8ac7b4; outline: 2px solid #8ac7b430; outline-offset: 1px; }
    body.is-atlas-view .directory-search { display: none; }
    body:not(.is-atlas-view) .filter-kind-field { display: none; }
    body:not(.is-atlas-view) .catalogue__filters { grid-template-columns: 1.4fr 1fr 1fr; }
    .directory-tabs { display: flex; gap: 6px; overflow-x: auto; min-width: 0; padding: 0 0 12px; margin: 0 0 20px; border-bottom: 1px solid var(--line); scrollbar-width: thin; }
    .directory-tabs button { display: inline-flex; flex: none; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid transparent; border-radius: 8px; color: #a7bcb6; background: transparent; font: 500 12px/16px var(--sans); cursor: pointer; white-space: nowrap; min-height: 40px; }
    .directory-tabs button[aria-pressed="true"] { color: #f2d59b; border-color: rgba(228,193,120,.28); background: rgba(228,193,120,.09); }
    .directory-tabs button:hover { background: rgba(138,199,180,.07); }
    .directory-tabs svg { width: 16px; height: 16px; }
    .directory-tabs .tab-count { padding: 1px 6px; border-radius: 4px; color: #9fb7ae; background: rgba(138,199,180,.08); font-size: 10px; font-variant-numeric: tabular-nums; }
    .directory-results { display: flex; justify-content: space-between; align-items: end; gap: 20px; min-width: 0; margin-bottom: 18px; }
    .directory-title { margin: 0; font: 500 28px/1.2 var(--serif); color: var(--ink); }
    .directory-count { margin: 8px 0 0; color: #94aea5; font: 400 12px/1.5 var(--sans); }
    .directory-count strong { color: var(--gold); font-weight: 600; }
    .directory-options { display: flex; align-items: end; gap: 12px; min-width: 0; max-width: 70%; }
    .inventory-filter-field { display: grid; gap: 9px; min-width: 0; width: 170px; }
    .inventory-filter-field[hidden] { display: none !important; }
    .inventory-filter-field select { width: 100%; min-width: 0; height: 40px; border: 1px solid #34504f; border-radius: 8px; padding: 9px 30px 9px 12px; color: #e1eae5; background: #0c252c; font: 500 12px var(--sans); color-scheme: dark; cursor: pointer; text-overflow: ellipsis; }
    .directory-tabs button:focus-visible, .directory-options select:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
    .realm-row__observation { margin-top: 8px; color: #94aea5; font: 400 10px/1.5 var(--sans); }
    .realm-row__observation .badge { margin-right: 8px; }
    @media (max-width: 760px) {
      .directory-results { flex-direction: column; align-items: stretch; gap: 16px; }
      .directory-options { max-width: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .inventory-filter-field { width: 100%; }
      .directory-options:has(.inventory-owner-field:not([hidden])) .inventory-owner-field { grid-column: 1 / -1; }
      .directory-tabs { margin-bottom: 16px; }
    }
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
    .realm-row__details { min-width: 0; }
    .realm-row__details p { margin: 0; color: #a9bbb7; font-size: .78rem; line-height: 1.55; }
    .realm-row__url { display: block; margin-top: 9px; overflow: hidden; color: #8fc2b5; font: 700 .63rem/1.35 var(--sans); letter-spacing: .015em; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
    .realm-row__url::before { content: "URL  "; color: #728b86; font-size: .54rem; letter-spacing: .12em; }
    .realm-row__url:hover { color: #fff0bd; }
    .realm-row__actions { display: grid; gap: 7px; min-width: 132px; }
    .realm-row__link { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #f4e6c9; font-size: .62rem; font-weight: 800; letter-spacing: .07em; text-decoration: none; text-transform: uppercase; }
    .realm-row__link--github { padding-top: 7px; border-top: 1px solid rgba(255,255,255,.08); color: #8fa8a3; }
    .realm-row__author { display: inline-flex; gap: 5px; margin-top: 4px; color: #9fb8b3; font-size: .68rem; font-weight: 700; text-decoration: none; white-space: nowrap; }
    .realm-row__author span { color: #6f8986; font-weight: 600; }
    .realm-row__author:hover { color: var(--gold); }
    .realm-row__link span:last-child { color: var(--gold); font-size: 1.05rem; transition: transform .2s; }
    .realm-row__link:hover span:last-child { transform: translate(3px,-3px); }
    .footer { position: relative; z-index: 3; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 28px; width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 20px 0 24px; border-top: 1px solid var(--line); color: #8fa5a2; font-size: 11px; line-height: 1.6; }
    .footer__identity { display: grid; gap: 2px; }
    .footer__identity strong { color: #d6e3df; font-size: 12px; font-weight: 600; }
    .footer__identity span { color: #718b85; }
    .footer__access { margin: 0; text-align: center; }
    .footer__access strong { color: #b8cbc4; font-weight: 600; }
    .footer__credit { color: var(--gold); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
    @media (max-width: 900px) {
      .footer { grid-template-columns: 1fr auto; gap: 12px 20px; }
      .footer__access { grid-row: 2; grid-column: 1 / -1; text-align: left; }
    }
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
    @keyframes realm-panel-in { from { opacity: 0; transform: translate3d(12px, 8px, 0) scale(.985); } to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } }
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
      .catalogue__navigation, .catalogue__filters { width: 100%; }
      .catalogue__filters { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
      .realm-row { grid-template-columns: 28px 64px minmax(0, .85fr) minmax(0, 1.2fr) 126px; gap: 14px; }
      .realm-row__actions { min-width: 0; }
      .realm-row__identity { min-width: 0; overflow-wrap: anywhere; }
      .realm-row__author { white-space: normal; flex-wrap: wrap; }
      .realm-row .access-badge { display: none; }
      .atlas__viewport { height: min(680px, 72vh); }
    }
    @media (max-width: 620px) {
      .nav { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; width: min(100% - 28px, 1180px); padding-top: 18px; }
      .nav .brand { gap: 8px; font-size: 1rem; white-space: nowrap; }
      .nav .brand__mark { width: 32px; height: 32px; flex-shrink: 0; }
      .nav__status { justify-content: center; min-width: 44px; min-height: 44px; padding: 9px; font-size: .64rem; white-space: nowrap; }
      .nav__status::before, .nav__label--full { display: none; }
      .nav__label--compact { display: inline; }
      .hero { min-height: 100svh; }
      .hero__art { background-position: 67% center; }
      .hero__kingdom--main { top: 25px; right: -35%; width: 94vw; opacity: .78; }
      .hero__kingdom--observatory { top: 105px; right: 54%; width: 37vw; opacity: .8; }
      .hero__kingdom--outpost { top: 315px; right: 15%; width: 30vw; opacity: .76; }
      .hero__pegasus { top: 210px; right: -42%; bottom: auto; width: 94vw; z-index: 2; opacity: .72; }
      .hero__content { width: min(100% - 32px, 1180px); }
      .hero h1 { font-size: clamp(3.5rem, min(19vw, 9svh), 5rem); }
      .hero-summary__grid { grid-template-columns: repeat(6, minmax(0, 1fr)); row-gap: 14px; }
      .hero-summary__item { grid-column: span 2; padding-inline: 12px; }
      .hero-summary__item:nth-child(n+4) { grid-column: span 3; }
      .hero-summary__item:nth-child(4) { padding-left: 0; border-left: 0; }
      .hero-summary--catalogue .hero-summary__item { grid-column: auto; }
      .hero-summary__item strong { font-size: 2rem; }
      .hero-summary__item::after { right: 8px; top: 2px; }
      .hero__lede { max-width: 92%; font-size: .98rem; }
      .hero__footer { align-items: flex-start; flex-direction: column; gap: 18px; }
      .hero__count { padding: 6px 8px; margin-left: -8px; border-radius: 999px; background: rgba(3, 16, 22, .48); backdrop-filter: blur(8px); }
      .catalogue { width: min(100% - 28px, 1180px); padding-top: 72px; }
      .catalogue__nav { margin-top: -48px; }
      .catalogue__return { padding: 10px 12px; font-size: .62rem; }
      .catalogue__return { white-space: nowrap; }
      .catalogue__nav .brand > span:last-child { display: none; }
      .catalogue__head h2 { font-size: 3.3rem; }
      .catalogue__head h2, .catalogue__head p { white-space: normal; }
      .catalogue__tools { width: 100%; }
      .catalogue__tools { gap: 12px; }
      .catalogue__navigation { flex-wrap: wrap; gap: 8px; }
      .catalogue__help { gap: 12px; margin-left: auto; }
      .catalogue__filters { padding: 14px 12px; gap: 14px 12px; }
      body:not(.is-atlas-view) .catalogue__filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      body:not(.is-atlas-view) .catalogue__filters > .filter-field:not(.filter-kind-field) { grid-column: 1 / -1; }
      .view-toggle__button { min-height: 36px; padding: 8px 10px; font-size: 11px; }
      .filter, .realm-kind-filter { min-height: 38px; gap: 0; padding: 7px 4px; font-size: 11px; }
      .filter__count { display: none; }
      .filter-field__title, .ownership-filters label { font-size: 9px; }
      .label-legend-button { gap: 5px; font-size: 11px; }
      body.is-atlas-view .catalogue__head { padding-inline: 14px; }
      body.is-atlas-view .catalogue__filters { padding: 10px; gap: 10px; }
      .atlas__bar { width: min(100% - 28px, 1180px); }
      .atlas__hint { display: none; }
      .atlas__viewport { min-height: 520px; height: 66vh; }
      .atlas__viewport { touch-action: none; }
      .atlas__bar { align-items: stretch; flex-direction: column; gap: 12px; }
      .atlas__controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; width: 100%; }
      .atlas__node-controls { min-width: 0; }
      .atlas__zoom-controls { justify-content: flex-end; }
      .atlas__status { align-items: flex-start; flex-direction: column; gap: 7px; }
      .atlas__status::before { display: none; }
      .atlas__control { min-width: 38px; height: 38px; padding-inline: 11px; }
      .atlas__location { flex: 1; grid-template-columns: auto minmax(72px, 1fr); min-height: 38px; padding: 5px 9px; }
      .atlas__location strong { font-size: .68rem; }
      .atlas__minimap { right: 10px; bottom: 10px; width: 120px; height: 96px; padding: 20px 7px 7px; border-radius: 9px; }
      .realm-list { padding-inline: 14px; }
      .realm-list__bar { align-items: flex-start; flex-direction: column; gap: 12px; }
      .hero__kingdom, .hero__pegasus, .kingdom-node, .kingdom-node__art, .atlas__pegasus, .sky-routes path, .sky-route-terminals path, .kingdom-node__beacon i { animation: none; }
      .kingdom-node__art { will-change: auto; }
      .shell::before { display: none; }
      .brand__mark, .nav__status, .hero__count { backdrop-filter: none; }
      .realm-row { grid-template-columns: 24px 64px minmax(0, 1fr); gap: 12px; min-height: 132px; padding: 16px 2px; }
      .realm-row__visual { width: 78px; height: 88px; }
      .realm-row__kingdom { top: 26px; width: 78px; height: 62px; }
      .realm-row__visual--main .realm-row__kingdom { width: 86px; }
      .realm-row__icon { width: 40px; height: 40px; }
      .realm-row__identity { align-self: center; min-width: 0; overflow-wrap: anywhere; }
      .realm-row__identity .project-label { max-width: 100%; font-size: 9px; white-space: normal; }
      .realm-row__author { flex-wrap: wrap; white-space: normal; }
      .realm-row__details { grid-column: 2 / -1; }
      .realm-row__actions { grid-column: 2 / -1; grid-template-columns: 1fr 1fr; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.08); }
      .realm-row__link--github { padding-top: 0; border-top: 0; }
      .footer { width: min(100% - 28px, 1180px); padding: 16px 0 20px; gap: 10px 14px; }
      body.is-atlas-view .catalogue { width: 100%; padding: 0; }
      body.is-atlas-view .catalogue__nav { width: calc(100% - 28px); margin: 0 auto; padding: 10px 0; }
      body.is-atlas-view .catalogue__head { padding: 8px 14px max(8px, env(safe-area-inset-bottom)); }
      body.is-atlas-view .atlas__bar { padding-block: 8px; }
      body.is-atlas-view .atlas__viewport { height: auto; min-height: 0; }
    }
    @media (max-width: 420px) {
      .atlas__controls { grid-template-columns: 1fr; }
      .atlas__node-controls, .atlas__zoom-controls { width: 100%; }
      .atlas__zoom-controls { justify-content: flex-end; }
    }
    @media (max-height: 500px) and (min-width: 621px) {
      body.is-atlas-view .catalogue__filters { grid-template-columns: 1.2fr 1.15fr .85fr 1fr; gap: 12px; padding: 8px 12px; }
      body.is-atlas-view .filter__count { display: none; }
      body.is-atlas-view :is(.filter, .realm-kind-filter) { padding-inline: 5px; font-size: 11px; }
      body.is-atlas-view .filter-field__title, body.is-atlas-view .ownership-filters label { font-size: 9px; }
      body.is-atlas-view .atlas__hint { display: none; }
    }
    @media (max-height: 700px) {
      .hero .nav { padding-top: 14px; padding-bottom: 14px; }
      .hero__content { padding-top: 16px; }
      .hero .eyebrow { margin-bottom: 12px; }
      .hero h1 { font-size: clamp(2.5rem, min(8vw, 9svh), 4rem); }
      .hero h1 em { display: inline; }
      .hero__lede { margin-top: 14px; }
      .hero__footer, .hero-summary { margin-top: 16px; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
    }
    @media (max-width: 619px) {
      body.is-atlas-view .atlas__status { display: none; }
      body.is-atlas-view .atlas__bar { padding: 8px 0; }
      body.is-atlas-view .atlas__controls { gap: 6px; }
      .realm-panel { top: auto; bottom: 10px; right: 10px; left: 10px; width: auto; border-radius: 17px; }
      .realm-panel__top { grid-template-columns: 91px minmax(0, 1fr); gap: 13px; min-height: 118px; padding: 15px 44px 14px 15px; }
      .realm-panel__visual { width: 91px; height: 83px; border-radius: 12px; }
      .realm-panel__art { width: 102px; height: 79px; }
      .realm-panel h2 { font-size: 1.65rem; }
      .realm-panel__body { padding: 13px 15px 15px; }
      .realm-panel p { font-size: 12px; line-height: 1.48; }
      .realm-panel__byline { margin-top: 10px; }
      .realm-panel__actions { margin-top: 13px; }
      .realm-panel__footer { margin-top: 8px; }
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
        <a class="nav__status" href="${escapeHtml(catalog.find(g => g.access === "private")!.gatewayUrl)}/#list" aria-label="List · Owner access"><span class="nav__label--full">List · Owner access</span><span class="nav__label--compact" aria-hidden="true">List</span></a>
        <a class="nav__status" href="#atlas" aria-label="${escapeHtml(viewLabel)}"><span class="nav__label--full">${escapeHtml(viewLabel)}</span><span class="nav__label--compact" aria-hidden="true">Atlas</span></a>
      </nav>
      <div class="hero__content">
        <p class="eyebrow">A personal cloud realm</p>
        <h1>Garden <em>of Zo</em></h1>
        <p class="hero__lede">${escapeHtml(heroCopy)}</p>
        <div class="hero__footer">
          <a class="explore" href="#atlas" aria-controls="realms">Open the sky atlas <span aria-hidden="true">&rarr;</span></a>
        </div>
        ${homeSummary}
      </div>
    </header>
    <main class="catalogue" id="realms" data-screen="catalogue" hidden>
      <nav class="catalogue__nav" aria-label="Catalogue navigation">
        <a class="catalogue__return" href="/" data-close-catalogue><span aria-hidden="true">&larr;</span> Back to home</a>
        ${current.access === "public" ? `<a class="catalogue__return" href="${escapeHtml(catalog.find(g => g.access === "private")!.gatewayUrl)}/#list">List · Owner access</a>` : ""}
        <a class="brand" href="/" data-close-catalogue><span class="brand__mark">${icon("spark")}</span><span>Garden of Zo</span></a>
      </nav>
      <div class="catalogue__head">
        <div class="catalogue__intro">
          <p class="eyebrow" data-view-eyebrow>The sky atlas</p>
          <h2 data-view-title>Choose the next horizon.</h2>
          <p data-view-description>Travel from node to node across your apps and agents. Every stop is a live destination in the Garden of Zo.</p>
        </div>
        <div class="catalogue__tools">
          <div class="catalogue__navigation">
            <div class="view-toggle" role="group" aria-label="Choose catalogue view">
              <button class="view-toggle__button" type="button" data-view="atlas" aria-pressed="true" aria-controls="atlas-view">${icon("compass")}Sky Atlas</button>
              <button class="view-toggle__button" type="button" data-view="list" aria-pressed="false" aria-controls="list-view">${icon("list")}List</button>
            </div>
            <div class="catalogue__help">
              <button class="clear-labels" type="button" data-clear-ownership disabled>Clear labels</button>
              <button class="label-legend-button" type="button" data-open-label-legend aria-haspopup="dialog" aria-controls="label-legend">${icon("list")}Label legend</button>
            </div>
          </div>
          <div class="catalogue__filters" role="group" aria-label="Catalogue filters">
            ${renderInventorySearch()}
            <div class="filter-field">
              <span class="filter-field__title">Access</span>
              <div class="filters" role="group" aria-label="Filter realms">
                <button class="filter" type="button" data-filter="all" aria-pressed="true">All <span class="filter__count">${allApps.length}</span></button>
                <button class="filter" type="button" data-filter="public" aria-pressed="false">Public <span class="filter__count">${publicCount}</span></button>
                <button class="filter" type="button" data-filter="private" aria-pressed="false">Private <span class="filter__count">${privateCount}</span></button>
              </div>
            </div>
            <div class="filter-field filter-kind-field">
              <span class="filter-field__title">Type</span>
              <div class="realm-kind-filters" role="group" aria-label="Filter realms by type">
                <button class="realm-kind-filter" type="button" data-kind-filter="all" aria-pressed="true">All types</button>
                <button class="realm-kind-filter" type="button" data-kind-filter="app" aria-pressed="false">Apps <span class="filter__count">${kindCounts.app}</span></button>
                <button class="realm-kind-filter" type="button" data-kind-filter="agent" aria-pressed="false">Agents <span class="filter__count">${kindCounts.agent}</span></button>
              </div>
            </div>
            <div class="ownership-filters" role="group" aria-label="Filter by project label">
              <div class="ownership-field"><label for="ownership-category">Category</label><select id="ownership-category" data-ownership-category aria-label="Project category"><option value="">All categories</option>${Object.keys(ownershipCategories).map(category => `<option value="${category}">${category}</option>`).join("")}</select></div>
              <div class="ownership-field"><label for="ownership-role">Sub-category</label><select id="ownership-role" data-ownership-role aria-label="Project sub-category"><option value="">All roles</option>${Object.keys(ownershipRoles).map(role => `<option value="${role}">${role}</option>`).join("")}</select></div>
            </div>
          </div>
        </div>
      </div>
      <section class="atlas" id="atlas-view" data-view-panel="atlas" aria-label="Sky atlas">
        <div class="atlas__bar">
          <span class="atlas__status"><span data-atlas-status>${String(allApps.length).padStart(2, "0")} kingdoms charted</span><span class="atlas__hint">Drag to move &middot; scroll to zoom</span></span>
          <div class="atlas__controls">
            <div class="atlas__node-controls">
              <button class="atlas__control" type="button" data-atlas-previous aria-label="Previous kingdom">&larr;</button>
              <span class="atlas__location" aria-live="polite"><small data-atlas-current-index>01 / ${String(allApps.length).padStart(2, "0")}</small><strong data-atlas-current>${escapeHtml(allApps[0]?.route.title ?? "No kingdom")}</strong><select data-realm-chooser aria-label="Choose a kingdom"></select></span>
              <button class="atlas__control" type="button" data-atlas-next aria-label="Next kingdom">&rarr;</button>
            </div>
            <div class="atlas__zoom-controls">
              <button class="atlas__control" type="button" data-atlas-zoom-out aria-label="Zoom out">&minus;</button>
              <button class="atlas__control" type="button" data-atlas-reset aria-label="Fit the full sky atlas">Overview</button>
              <button class="atlas__control" type="button" data-atlas-explore aria-label="Return to exploration scale">Explore</button>
              <button class="atlas__control" type="button" data-atlas-zoom-in aria-label="Zoom in">&plus;</button>
            </div>
          </div>
        </div>
        <div class="atlas__viewport" data-atlas tabindex="0" aria-label="Interactive sky atlas" aria-describedby="atlas-controls-help">
          <p class="atlas__loading" data-atlas-loading role="status">Charting the sky…</p>
          <p class="atlas__loading" data-atlas-empty hidden>No kingdoms match. Adjust the filters below.</p>
        </div>
        <aside class="realm-panel" data-realm-panel aria-label="Selected kingdom" hidden>
          <button type="button" class="realm-panel__close" data-panel-close aria-label="Close kingdom details">×</button>
          <div class="realm-panel__top">
            <figure class="realm-panel__visual"><img class="realm-panel__art" data-realm-art alt="" /></figure>
            <div>
              <span class="realm-panel__eyebrow">Realm dossier</span>
              <span class="realm-panel__category" data-realm-category></span>
              <h2 data-realm-title></h2>
              <span class="realm-panel__access" data-realm-access></span>
            </div>
          </div>
          <div class="realm-panel__body">
            <span class="project-label" data-realm-ownership></span>
            <p data-realm-description></p>
            <a class="realm-panel__url" data-realm-url></a>
            <div class="realm-panel__byline"><span>Keeper</span><a data-realm-author target="_blank" rel="noreferrer"></a></div>
            <div class="realm-panel__actions"><a data-realm-enter>Enter realm <span aria-hidden="true">↗</span></a><a data-realm-source target="_blank" rel="noreferrer" aria-label="View source on GitHub">GitHub ↗</a></div>
            <div class="realm-panel__footer"><button type="button" class="realm-panel__locate" data-realm-locate>Locate on map</button><a data-realm-oversight>View in List · Owner access</a></div>
          </div>
        </aside>
        <details class="atlas__help"><summary>Map controls</summary><p id="atlas-controls-help">Drag to explore. Scroll or pinch to zoom. Select a kingdom for details. Hold WASD or arrow keys to travel; Shift moves faster. Drag the world map to travel farther. Press 0 for Overview, Escape to stop.</p></details>
        <div class="atlas__minimap" data-atlas-minimap role="button" tabindex="0" aria-label="Atlas overview. Click or drag to travel. Press Enter for overview.">
          <div class="atlas__minimap-chart"><svg viewBox="0 0 ${atlasWidth} ${atlasHeight}" preserveAspectRatio="none" aria-hidden="true">
            ${minimapRoutes}
            ${minimapNodes}
          </svg><canvas class="atlas__minimap-window" data-atlas-minimap-window width="380" height="240" aria-hidden="true"></canvas></div>
        </div>
        <div class="atlas__progress" aria-hidden="true"></div>
      </section>
      <section class="realm-list" id="list-view" data-view-panel="list" aria-label="Garden list" hidden>
        ${current.access === "private" ? renderInventory(listCards.replaceAll("data-list-card ", "")) : ""}
        <div ${current.access === "private" ? "hidden" : ""}>
        <nav class="directory-tabs" aria-label="Directory sections">
          <button type="button" data-directory-kind="all" aria-pressed="true">All destinations <span class="tab-count">${allApps.length}</span></button>
          <button type="button" data-directory-kind="app" aria-pressed="false">Apps <span class="tab-count">${kindCounts.app}</span></button>
          <button type="button" data-directory-kind="agent" aria-pressed="false">Agents <span class="tab-count">${kindCounts.agent}</span></button>
        </nav>
        <div class="directory-results">
          <div><h3 class="directory-title" data-directory-title>All destinations</h3><p class="directory-count" aria-live="polite"><strong data-list-count>${allApps.length}</strong> of <span data-list-total>${allApps.length}</span> records</p></div>
          <div class="directory-options"><div class="inventory-filter-field"><label for="directory-sort">Sort by</label><select id="directory-sort"><option value="default">Garden order</option><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option></select></div></div>
        </div>
        <div class="realm-list__rows">${current.access === "private" ? "" : listCards}</div>
        ${current.access === "public" ? '<div class="realm-list__empty" data-list-empty hidden role="status">No destinations match. Adjust your filters.</div>' : ""}
        </div>
      </section>
    </main>
    <dialog class="label-legend" id="label-legend" aria-labelledby="label-legend-title" aria-describedby="label-legend-description">
      <div class="label-legend__head">
        <h2 id="label-legend-title">Label legend</h2>
        <form method="dialog"><button aria-label="Close" autofocus><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></form>
      </div>
      <div class="label-legend__intro">
        <p id="label-legend-description">Category is the owner. Sub-category is the role.</p>
        <span class="label-legend__sample" aria-label="PAL | AGENT means a Kingdom of PAL agent">PAL <span aria-hidden="true">|</span> AGENT</span>
      </div>
      <div class="label-legend__body" tabindex="0" role="region" aria-label="Label definitions">
        ${Object.entries(ownershipCategories).map(([category, meaning]) => `<section class="label-legend__category" data-legend-category="${category}" aria-label="${category}">
          <dl class="label-legend__categories"><div><dt>${escapeHtml(category)}</dt><dd>${escapeHtml(meaning)}</dd></div></dl>
          <dl class="label-legend__roles" aria-label="${category} roles">${categoryRoles(category as ProjectOwnership["category"]).map(role => `<div><dt>${escapeHtml(role)}</dt><dd>${escapeHtml(ownershipRoles[role])}</dd></div>`).join("")}</dl>
        </section>`).join("")}
      </div>
      <div class="label-legend__foot">
        <div class="label-legend__status" aria-label="Ownership status">
          <p><strong>Pending</strong> · a label has not been assigned.</p>
        </div>
        <p class="label-legend__note">“Ownership pending” appears on unlabelled entries. Labels do not change Public/Private access or display categories.</p>
      </div>
    </dialog>
    <footer class="footer" data-screen="catalogue" hidden>
      <div class="footer__identity"><strong>Garden of Zo</strong><span>One server. Many worlds.</span></div>
      <p class="footer__access"><strong>Public realms</strong> are accessible to everyone. <strong>Owner realms</strong> require Zo sign-in.</p>
      <span class="footer__credit">Built on Zo Computer</span>
    </footer>
  </div>
  <script type="application/json" id="atlas-data">${JSON.stringify(atlasData).replace(/</g, '\\u003c')}</script>
  <script type="application/json" id="ownership-filter-data">${JSON.stringify(Object.fromEntries(Object.keys(ownershipCategories).map(category => [category, categoryRoles(category as ProjectOwnership["category"])])))}</script>
  <script type="module" src="/garden-client.js?v=${shellVersion}" data-atlas-client="/atlas-client.js?v=${atlasVersion}"></script>
  ${current.access === "private" ? `<script type="module" src="/operations/client.js?v=${inventoryVersion}"></script>` : ""}
</body>
</html>`;
}

export function renderFavicon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#071721"/><path d="M10 33c9-1 14-6 19-16 2 7 1 12-2 17 9-5 17-4 27 1-11 1-18 5-23 12-5-8-11-12-21-14Z" fill="#e4c178"/><circle cx="37" cy="28" r="3" fill="#f8f2df"/></svg>`;
}
