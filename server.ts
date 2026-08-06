import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

export type Access = "public" | "private";

export type RouteConfig = {
  prefix: string;
  label: string;
  title: string;
  description: string;
  category: string;
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
  const cards = allApps.map(({ gateway, route }, index) => {
    const restricted = gateway.access === "private";
    const sameGateway = gateway.access === current.access;
    const routeHref = `${route.prefix}${route.entryPath ?? ""}`;
    const href = sameGateway ? routeHref : `${gateway.gatewayUrl}${routeHref}`;
    const accessLabel = restricted ? "Owner access" : "Open access";
    const action = restricted ? "Unlock realm" : "Enter realm";

    return `<article class="realm-card ${restricted ? "realm-card--private" : ""}" data-app-card data-access="${gateway.access}" style="--order:${index}">
      <div class="realm-card__top">
        <span class="realm-icon">${icon(route.icon)}</span>
        <span class="access-badge ${restricted ? "access-badge--private" : ""}">
          ${restricted ? icon("lock", "badge-icon") : ""}${accessLabel}
        </span>
      </div>
      <div class="realm-card__body">
        <p class="realm-card__category">${escapeHtml(route.category)}</p>
        <h2>${escapeHtml(route.title)}</h2>
        <p>${escapeHtml(route.description)}</p>
      </div>
      <a class="realm-card__link" href="${escapeHtml(href)}" aria-label="${action}: ${escapeHtml(route.title)}">
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
    .catalogue { position: relative; z-index: 3; width: min(1180px, calc(100% - 40px)); margin: -42px auto 0; padding: 86px 0 120px; }
    .catalogue__head { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 32px; margin-bottom: 38px; }
    .catalogue__head h2 { margin: 0; max-width: 720px; font: 500 clamp(2.8rem, 6vw, 5.2rem)/.94 var(--serif); letter-spacing: -.035em; }
    .catalogue__head p { max-width: 570px; margin: 18px 0 0; color: var(--muted); line-height: 1.65; }
    .filters { display: flex; gap: 5px; padding: 5px; border: 1px solid var(--line); border-radius: 999px; background: rgba(3,18,23,.5); }
    .filter { border: 0; border-radius: 999px; padding: 10px 15px; color: #aebfbb; background: transparent; cursor: pointer; font-size: .77rem; font-weight: 800; letter-spacing: .04em; transition: color .2s, background .2s; }
    .filter[aria-pressed="true"] { color: #162027; background: var(--ink); }
    .realms { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; }
    .realm-card { grid-column: span 4; position: relative; min-height: 360px; display: flex; flex-direction: column; padding: 25px; border: 1px solid var(--line); border-radius: 4px 38px 4px 38px; background: linear-gradient(150deg, rgba(20,51,56,.94), rgba(6,27,33,.82)); box-shadow: 0 28px 80px rgba(0,0,0,.16); overflow: hidden; animation: rise .7s calc(var(--order) * 70ms) both; transition: transform .35s cubic-bezier(.2,.8,.2,1), border-color .35s, box-shadow .35s; }
    .realm-card::before { content: ""; position: absolute; inset: 0; opacity: .36; background: radial-gradient(circle at 95% 0%, rgba(228,193,120,.34), transparent 37%); pointer-events: none; }
    .realm-card::after { content: ""; position: absolute; width: 150px; height: 80px; right: -24px; bottom: -22px; border-radius: 50%; opacity: .18; filter: blur(2px); background: radial-gradient(ellipse, #a7ceca 0 16%, transparent 67%); }
    .realm-card:hover { transform: translateY(-8px); border-color: rgba(228,193,120,.54); box-shadow: 0 32px 90px rgba(0,0,0,.3); }
    .realm-card--private { background: linear-gradient(150deg, rgba(41,43,51,.94), rgba(16,28,34,.88)); }
    .realm-card[hidden] { display: none; }
    .realm-card__top, .realm-card__body, .realm-card__link { position: relative; z-index: 1; }
    .realm-card__top { display: flex; justify-content: space-between; align-items: flex-start; }
    .realm-icon { display: grid; place-items: center; width: 54px; height: 54px; border: 1px solid rgba(228,193,120,.36); border-radius: 50%; color: var(--gold); background: rgba(5,22,27,.44); }
    .icon { width: 25px; height: 25px; }
    .access-badge { display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 999px; color: #b7ddd1; background: rgba(87,148,130,.14); font-size: .66rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .access-badge--private { color: #e9c9a6; background: rgba(221,125,102,.12); }
    .badge-icon { width: 12px; height: 12px; }
    .realm-card__body { margin-top: 42px; }
    .realm-card__category { margin: 0 0 9px !important; color: var(--coral) !important; font-size: .68rem !important; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
    .realm-card h2 { margin: 0; font: 600 2.15rem/1 var(--serif); letter-spacing: -.025em; }
    .realm-card__body > p:last-child { margin: 17px 0 0; color: #b8c8c5; font-size: .9rem; line-height: 1.62; }
    .realm-card__link { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 22px; border-top: 1px solid rgba(255,255,255,.1); color: #f4e6c9; font-size: .75rem; font-weight: 800; letter-spacing: .08em; text-decoration: none; text-transform: uppercase; }
    .realm-card__link span:last-child { font-size: 1.2rem; transition: transform .2s; }
    .realm-card__link:hover span:last-child { transform: translate(3px,-3px); }
    .legend { display: flex; justify-content: space-between; gap: 24px; margin-top: 34px; padding: 22px 0; border-top: 1px solid var(--line); color: #8fa5a2; font-size: .73rem; line-height: 1.6; }
    .legend strong { color: #d6e3df; }
    .legend__mark { color: var(--gold); text-transform: uppercase; letter-spacing: .14em; }
    .footer { position: relative; z-index: 3; display: flex; align-items: center; justify-content: space-between; width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 30px 0 40px; border-top: 1px solid var(--line); color: #829895; font-size: .72rem; letter-spacing: .06em; text-transform: uppercase; }
    @keyframes reveal-art { from { opacity: 0; transform: scale(1.09); } to { opacity: 1; transform: scale(1.025); } }
    @keyframes rise { from { opacity: 0; transform: translateY(32px); } to { opacity: 1; transform: translateY(0); } }
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
      .filters { justify-self: start; }
      .realm-card { grid-column: span 6; }
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
      .filters { width: 100%; overflow-x: auto; }
      .filter { flex: 1; }
      .realm-card { grid-column: 1 / -1; min-height: 330px; }
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
          <a class="explore" href="#realms">Explore the kingdoms <span aria-hidden="true">&darr;</span></a>
          <span class="hero__count"><strong>${allApps.length}</strong> realms &nbsp; / &nbsp; ${publicCount} open &nbsp; / &nbsp; ${privateCount} owner-only</span>
        </div>
      </div>
    </header>
    <main class="catalogue" id="realms">
      <div class="catalogue__head">
        <div>
          <p class="eyebrow">The realm atlas</p>
          <h2>Every creation,<br />one horizon.</h2>
          <p>Explore the applications and agents running across this Zo. Private realms remain protected by owner authentication.</p>
        </div>
        <div class="filters" role="group" aria-label="Filter realms">
          <button class="filter" type="button" data-filter="all" aria-pressed="true">All ${allApps.length}</button>
          <button class="filter" type="button" data-filter="public" aria-pressed="false">Open ${publicCount}</button>
          <button class="filter" type="button" data-filter="private" aria-pressed="false">Private ${privateCount}</button>
        </div>
      </div>
      <section class="realms" aria-label="Application catalogue">${cards}</section>
      <div class="legend">
        <span><strong>Open realms</strong> can be visited by anyone. <strong>Owner realms</strong> pass through Zo's private authentication boundary.</span>
        <span class="legend__mark">Built on Zo Computer</span>
      </div>
    </main>
    <footer class="footer"><span>Garden of Zo</span><span>One server. Many worlds.</span></footer>
  </div>
  <script>
    const filters = [...document.querySelectorAll('[data-filter]')];
    const cards = [...document.querySelectorAll('[data-app-card]')];
    filters.forEach((button) => button.addEventListener('click', () => {
      const filter = button.dataset.filter;
      filters.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      cards.forEach((card) => { card.hidden = filter !== 'all' && card.dataset.access !== filter; });
    }));
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
