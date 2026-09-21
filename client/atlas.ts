import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { Viewport, Decelerate } from 'pixi-viewport';
import { AtlasGlide, AtlasWheel } from './camera-motion';

type Realm = { id: string; index: number; title: string; description: string; category: string; kind: string; access: string; accessLabel: string; href: string; repositoryUrl: string; author: { name: string; profileUrl: string }; x: number; y: number; scale: number; art: string };
type MapData = { width: number; height: number; realms: Realm[]; links: { from: string; to: string; path: string }[] };
const data: MapData = JSON.parse(document.querySelector('#atlas-data')!.textContent!);
const get = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const host = get('[data-atlas]');
const panel = get('[data-realm-panel]');
const chooser = get<HTMLSelectElement>('[data-realm-chooser]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const miniCanvas = get<HTMLCanvasElement>('[data-atlas-minimap-window]');
const miniContext = miniCanvas.getContext('2d');
let access = 'all', kind = 'all', view = 'atlas';
let selected = data.realms.find(r => r.id === 'zo-drive') || data.realms[0];
let app: Application, viewport: Viewport;
let initialising: Promise<void> | undefined;
let dirty = true, active = false, ready = false;
let lastCamera = '';
const keys = new Set<string>();
const visuals = new Map<string, { body: Container; label: Container; ring: Graphics; title: Text; subtitle: Text }>();
const links = new Map<MapData['links'][number], Graphics>();
const visible = () => data.realms.filter(r => (access === 'all' || r.access === access) && (kind === 'all' || r.kind === kind));
const readingScale = () => innerWidth < 620 ? .64 : .72;
const maxScale = () => innerWidth < 620 ? 2 : 2.4;
const minScale = () => Math.min(.24, (viewport?.screenWidth ?? host.clientWidth) / data.width);
const stop = () => {
  keys.clear();
  if (!viewport) return;
  viewport.input.clear();
  viewport.plugins.get('drag')?.resume();
  viewport.pinch();
  host.classList.remove('is-dragging');
  viewport.plugins.remove('animate');
  viewport.plugins.get<AtlasWheel>('wheel')?.reset();
  viewport.plugins.get<Decelerate>('decelerate')?.reset();
};
const travel = (x: number, y: number, scale = viewport.scale.x) => {
  stop();
  scale = Math.max(minScale(), Math.min(maxScale(), scale));
  if (reduced.matches) viewport.setZoom(scale).moveCenter(x, y);
  else viewport.animate({ position: { x, y }, scale, time: 280, ease: 'easeOutCubic', removeOnInterrupt: true });
  dirty = true;
};
const overview = () => {
  if (!ready || !visible().length) return;
  const realms = visible();
  const left = Math.min(...realms.map(r => r.x)) - 240, right = Math.max(...realms.map(r => r.x)) + 240;
  const top = Math.min(...realms.map(r => r.y)) - 200, bottom = Math.max(...realms.map(r => r.y)) + 220;
  travel((left + right) / 2, (top + bottom) / 2, Math.min(host.clientWidth / (right - left), host.clientHeight / (bottom - top)) * .94);
};
const select = (realm: Realm | undefined, showPanel = true) => {
  if (!realm) { panel.hidden = true; return; }
  selected = realm;
  chooser.value = realm.id;
  get('[data-atlas-current]').textContent = realm.title;
  get('[data-atlas-current-index]').textContent = String(visible().indexOf(realm) + 1).padStart(2, '0') + ' / ' + String(visible().length).padStart(2, '0');
  get('[data-realm-title]').textContent = realm.title;
  get('[data-realm-category]').textContent = realm.category;
  get('[data-realm-description]').textContent = realm.description;
  get('[data-realm-access]').textContent = realm.accessLabel;
  const author = get<HTMLAnchorElement>('[data-realm-author]');
  author.textContent = 'By ' + realm.author.name; author.href = realm.author.profileUrl;
  get<HTMLAnchorElement>('[data-realm-enter]').href = realm.href;
  get<HTMLAnchorElement>('[data-realm-source]').href = realm.repositoryUrl;
  get<HTMLImageElement>('[data-realm-art]').src = realm.art;
  panel.dataset.access = realm.access;
  panel.hidden = !showPanel;
  for (const [id, visual] of visuals) {
    visual.ring.visible = id === realm.id;
    visual.title.style.fill = id === realm.id ? '#fff2bf' : '#e2e9df';
  }
  for (const [link, line] of links) line.alpha = link.from === realm.id || link.to === realm.id ? .6 : .18;
  all('[data-minimap-node]').forEach(node => node.classList.toggle('is-active', Number(node.dataset.nodeIndex) === realm.index));
  dirty = true;
};
function filters() {
  const realms = visible(), ids = new Set(realms.map(r => r.id));
  all('[data-list-card]').forEach(card => { card.hidden = (access !== 'all' && card.dataset.access !== access) || (kind !== 'all' && card.dataset.kind !== kind); });
  get('[data-list-count]').textContent = String(realms.length);
  chooser.replaceChildren(...realms.map(realm => new Option(realm.title, realm.id)));
  chooser.disabled = !realms.length;
  for (const [id, visual] of visuals) { visual.body.visible = ids.has(id); visual.label.visible = ids.has(id); }
  for (const [link, line] of links) line.visible = ids.has(link.from) && ids.has(link.to);
  all('[data-minimap-node]').forEach(node => node.classList.toggle('is-hidden', !ids.has(data.realms[Number(node.dataset.nodeIndex)].id)));
  all('[data-minimap-route]').forEach(node => node.classList.toggle('is-hidden', !ids.has(data.realms[Number(node.dataset.from)].id) || !ids.has(data.realms[Number(node.dataset.to)].id)));
  get('[data-atlas-empty]').hidden = realms.length > 0;
  for (const selector of ['[data-atlas-previous]', '[data-atlas-next]']) get<HTMLButtonElement>(selector).disabled = realms.length < 2;
  if (selected && ids.has(selected.id)) chooser.value = selected.id;
  else select(realms[0], false);
  dirty = true;
  updateHud();
}
function updateHud() {
  if (!viewport) return;
  const count = visible().length;
  const status = count ? `${String(count).padStart(2, '0')} kingdoms · ${Math.round(viewport.scale.x * 100)}%` : 'No kingdoms · adjust filters';
  if (get('[data-atlas-status]').textContent !== status) get('[data-atlas-status]').textContent = status;
  get<HTMLButtonElement>('[data-atlas-zoom-out]').disabled = viewport.scale.x <= minScale() + .001;
  get<HTMLButtonElement>('[data-atlas-zoom-in]').disabled = viewport.scale.x >= maxScale() - .001;
  const w = Math.min(data.width, viewport.worldScreenWidth), h = Math.min(data.height, viewport.worldScreenHeight);
  if (miniContext) {
    const sx = miniCanvas.width / data.width, sy = miniCanvas.height / data.height;
    const x = Math.max(0, Math.min(data.width - w, viewport.left)) * sx;
    const y = Math.max(0, Math.min(data.height - h, viewport.top)) * sy;
    miniContext.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
    miniContext.fillStyle = 'rgba(138,199,180,.12)';
    miniContext.strokeStyle = '#b9e0d5'; miniContext.lineWidth = 3;
    miniContext.fillRect(x, y, w * sx, h * sy);
    miniContext.strokeRect(x, y, w * sx, h * sy);
  }
}
async function initialise() {
  app = new Application();
  await app.init({ preference: 'webgl', width: host.clientWidth, height: host.clientHeight, resolution: Math.min(devicePixelRatio || 1, 1.5), autoDensity: true, antialias: false, backgroundAlpha: 0, powerPreference: 'high-performance', autoStart: false });
  app.ticker.remove(app.render, app);
  app.canvas.setAttribute('aria-label', 'Interactive sky map. Drag to explore, scroll or pinch to zoom. Use Choose a kingdom for keyboard access.');
  host.prepend(app.canvas);
  viewport = new Viewport({ screenWidth: host.clientWidth, screenHeight: host.clientHeight, worldWidth: data.width, worldHeight: data.height, events: app.renderer.events, noTicker: true, passiveWheel: false, threshold: 3, allowPreserveDragOutside: true });
  app.stage.addChild(viewport);
  viewport.interactiveChildren = false;
  viewport.drag({ wheel: false }).pinch();
  viewport.plugins.add('wheel', new AtlasWheel(viewport, () => ({ min: minScale(), max: maxScale() }), () => reduced.matches));
  if (!reduced.matches) viewport.plugins.add('decelerate', new AtlasGlide(viewport));
  viewport.clampZoom({ minScale: minScale(), maxScale: maxScale() }).clamp({ direction: 'all', underflow: 'center' });
  const terrain = new Container();
  const paths = new Container();
  const islands = new Container();
  const labels = new Container();
  labels.eventMode = 'none';
  viewport.addChild(terrain, paths, islands);
  app.stage.addChild(labels);
  const stars = new Graphics();
  for (let x = 40; x < data.width; x += 109) for (let y = 40; y < data.height; y += 127) stars.circle(x + Math.sin(y) * 22, y + Math.cos(x) * 22, 1.2);
  stars.fill({ color: 0x91bdb6, alpha: .2 }); terrain.addChild(stars);
  for (const [x, y, title] of [[780, 130, 'The Discovery Isles'], [1810, 740, 'The Commons'], [2860, 150, 'The Watchtower'], [1580, 1830, 'The Frontier']] as const) {
    const text = new Text({ text: title, style: { fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 30, fill: '#789c94', letterSpacing: 3 } });
    text.anchor.set(.5); text.position.set(x, y); text.alpha = .55; terrain.addChild(text);
  }
  for (const link of data.links) {
    const n = link.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const line = new Graphics().moveTo(n[0], n[1]).bezierCurveTo(n[2], n[3], n[4], n[5], n[6], n[7]).stroke({ color: 0xcdbb7e, width: 1.5 });
    paths.addChild(line); links.set(link, line);
  }
  await document.fonts.ready;
  const textures = new Map<string, Texture>();
  await Promise.all([...new Set(data.realms.map(r => r.art))].map(async url => { textures.set(url, await Assets.load<Texture>(url)); }));
  for (const realm of data.realms) {
    const body = new Container(); body.position.set(realm.x, realm.y);
    const shadow = new Graphics().ellipse(0, 78, 80, 20).fill({ color: 0x02161a, alpha: .4 });
    const ring = new Graphics().ellipse(0, 64, 90, 18).stroke({ color: 0xf3d590, width: 2, alpha: .8 });
    const sprite = new Sprite(textures.get(realm.art)); sprite.anchor.set(.5); sprite.width = 230 * realm.scale; sprite.height = 175 * realm.scale;
    const marker = new Graphics().circle(0, 0, 10).fill(0x0d292f).stroke({ color: realm.access === 'private' ? 0xdfa58a : 0xf0d59e, width: 2 }).circle(0, 0, 3).fill(realm.access === 'private' ? 0xdfa58a : 0xf0d59e);
    body.addChild(shadow, ring, sprite, marker); islands.addChild(body);
    const label = new Container();
    const title = new Text({ text: realm.title, resolution: 2, style: { fontFamily: 'Georgia', fontSize: 17, fontWeight: '600', fill: '#e2e9df', dropShadow: { color: '#03151b', alpha: .9, blur: 4, distance: 1 } } }); title.anchor.set(.5, 0);
    const subtitle = new Text({ text: realm.access === 'private' ? '◇ OWNER ACCESS' : realm.category.toUpperCase(), resolution: 2, style: { fontFamily: 'Arial', fontSize: 9, letterSpacing: 1.2, fill: realm.access === 'private' ? '#ddb29a' : '#8fb3a8' } }); subtitle.anchor.set(.5, 0); subtitle.y = 25;
    label.addChild(title, subtitle); labels.addChild(label);
    visuals.set(realm.id, { body, ring, label, title, subtitle });
  }
  const pegasus = new Sprite(await Assets.load('/assets/garden-pegasus-atlas.webp'));
  pegasus.anchor.set(.5); pegasus.position.set(2050, 1300); pegasus.width = 280; pegasus.height = 158; pegasus.alpha = .22; terrain.addChild(pegasus);
  viewport.on('clicked', ({ screen }: { screen: { x: number; y: number } }) => {
    const candidates = visible().map(realm => {
      const point = viewport.toScreen(realm.x, realm.y);
      const dx = screen.x - point.x, dy = screen.y - point.y;
      const width = Math.max(42, 115 * realm.scale * viewport.scale.x);
      const height = Math.max(38, 88 * realm.scale * viewport.scale.x);
      const label = visuals.get(realm.id)!;
      const labelHit = label.label.visible && Math.abs(screen.x - label.label.x) <= label.title.width / 2 + 8 && screen.y >= label.label.y - 8 && screen.y <= label.label.y + 42;
      return { realm, hit: (Math.abs(dx) <= width && Math.abs(dy) <= height) || labelHit, distance: dx * dx + dy * dy };
    }).filter(c => c.hit).sort((a, b) => a.distance - b.distance);
    select(candidates[0]?.realm);
  });
  app.canvas.addEventListener('pointerdown', () => { host.focus({ preventScroll: true }); viewport.plugins.remove('animate'); });
  app.canvas.addEventListener('wheel', () => { viewport.plugins.remove('animate'); }, { passive: true });
  app.canvas.addEventListener('contextmenu', event => event.preventDefault());
  app.canvas.addEventListener('pointercancel', stop);
  app.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); showFallback(); });
  viewport.on('drag-start', () => host.classList.add('is-dragging'));
  viewport.on('drag-end', () => host.classList.remove('is-dragging'));
  const resize = () => {
    if (!active || !host.clientWidth || !host.clientHeight) return;
    stop(); const centre = viewport.center;
    app.renderer.resize(host.clientWidth, host.clientHeight);
    viewport.resize(host.clientWidth, host.clientHeight);
    viewport.clampZoom({ minScale: minScale(), maxScale: maxScale() });
    viewport.moveCenter(centre); dirty = true;
  };
  new ResizeObserver(resize).observe(host);
  app.ticker.add(ticker => {
    if (!active || document.hidden) return;
    const dt = Math.min(ticker.elapsedMS, 50);
    const dx = Number(keys.has('right')) - Number(keys.has('left')), dy = Number(keys.has('down')) - Number(keys.has('up'));
    if (dx || dy) {
      const speed = (keys.has('fast') ? 1.1 : .6) * dt / Math.hypot(dx, dy);
      viewport.x -= dx * speed; viewport.y -= dy * speed;
    }
    viewport.update(ticker.elapsedMS);
    const camera = `${viewport.x},${viewport.y},${viewport.scale.x}`;
    if (camera === lastCamera && !dirty) return;
    lastCamera = camera;
    const occupied: { x: number; y: number; width: number; height: number }[] = [];
    const realms = visible().sort((a, b) => Number(b === selected) - Number(a === selected));
    for (const realm of realms) {
      const visual = visuals.get(realm.id)!;
      const point = viewport.toScreen(realm.x, realm.y);
      const inFrame = point.x > -240 && point.x < viewport.screenWidth + 240 && point.y > -200 && point.y < viewport.screenHeight + 200;
      visual.body.renderable = inFrame;
      visual.label.position.set(point.x, point.y + Math.max(22, 95 * realm.scale * viewport.scale.x));
      const bounds = { x: visual.label.x - visual.title.width / 2 - 10, y: visual.label.y, width: visual.title.width + 20, height: 40 };
      const collision = occupied.some(b => bounds.x < b.x + b.width && bounds.x + bounds.width > b.x && bounds.y < b.y + b.height && bounds.y + bounds.height > b.y);
      visual.label.visible = inFrame && !collision;
      visual.subtitle.visible = viewport.scale.x >= .55;
      if (visual.label.visible) occupied.push(bounds);
    }
    app.render(); dirty = false;
    updateHud();
  });
  ready = true;
  host.dataset.renderer = 'webgl';
  host.dataset.ready = 'true';
  get('[data-atlas-loading]').hidden = true;
  viewport.setZoom(readingScale()); viewport.moveCenter(selected.x, selected.y);
  filters(); select(selected, false);
  if (active && !document.hidden) app.ticker.start();
  (window as any).__skyAtlas = { viewport, app, select: (id: string) => select(data.realms.find(r => r.id === id)), state: () => ({ x: viewport.x, y: viewport.y, scale: viewport.scale.x, selected: selected?.id, visible: visible().map(r => r.id), panel: !panel.hidden, renderer: host.dataset.renderer }) };
}
function showFallback() {
  app?.ticker.stop(); ready = false;
  get('[data-atlas-loading]').hidden = false;
  get('[data-atlas-loading]').textContent = 'The map could not start on this device. Your kingdoms are available in List View.';
  host.dataset.renderer = 'unavailable';
}
function syncScreen() {
  const catalogue = ['#atlas', '#list', '#realms'].includes(location.hash);
  get('[data-screen="landing"]').hidden = catalogue;
  get('main[data-screen="catalogue"]').hidden = !catalogue;
  get('footer[data-screen="catalogue"]').hidden = !catalogue;
  if (location.hash === '#realms') { try { view = localStorage.getItem('garden-of-zo-view') || 'atlas'; } catch {} }
  else view = location.hash === '#list' ? 'list' : 'atlas';
  active = catalogue && view === 'atlas';
  document.body.classList.toggle('is-catalogue-open', catalogue);
  document.body.classList.toggle('is-atlas-view', active);
  get('.hero').classList.toggle('is-offscreen', catalogue);
  all('[data-view-panel]').forEach(el => { el.hidden = el.dataset.viewPanel !== view; });
  all('[data-view]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.view === view)));
  get('[data-view-eyebrow]').textContent = view === 'list' ? 'The realm directory' : 'The sky atlas';
  get('[data-view-description]').textContent = view === 'list' ? 'Every app, workflow and agent in one directory.' : 'Explore the floating kingdoms. Choose a landmark to discover its realm.';
  if (active) {
    if (!initialising) initialising = initialise().catch(error => { console.error('Sky Atlas initialisation failed', error); showFallback(); });
    else if (ready && !document.hidden) app.ticker.start();
  } else { stop(); app?.ticker.stop(); }
  scrollTo({ top: 0, behavior: 'instant' });
}
all('[data-view]').forEach(button => button.addEventListener('click', () => {
  view = button.dataset.view!;
  try { localStorage.setItem('garden-of-zo-view', view); } catch {}
  history.replaceState(null, '', location.pathname + location.search + '#' + view); syncScreen();
}));
all('[data-close-catalogue]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); history.replaceState(null, '', location.pathname + location.search); syncScreen(); }));
all('[data-filter]').forEach(button => button.addEventListener('click', () => { access = button.dataset.filter!; all('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); filters(); }));
all('[data-kind-filter]').forEach(button => button.addEventListener('click', () => { kind = button.dataset.kindFilter!; all('[data-kind-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); filters(); }));
get('[data-panel-close]').addEventListener('click', () => { panel.hidden = true; host.focus(); });
get('[data-realm-locate]').addEventListener('click', () => { if (ready && selected) travel(selected.x, selected.y); });
chooser.addEventListener('change', () => { select(data.realms.find(r => r.id === chooser.value)); if (ready) travel(selected.x, selected.y); });
get('[data-atlas-reset]').addEventListener('click', overview);
get('[data-atlas-explore]').addEventListener('click', () => { if (ready && selected) travel(selected.x, selected.y, readingScale()); });
for (const [selector, factor] of [['[data-atlas-zoom-in]', 1.25], ['[data-atlas-zoom-out]', .8]] as const) get(selector).addEventListener('click', () => { if (ready) travel(viewport.center.x, viewport.center.y, viewport.scale.x * factor); });
for (const [selector, step] of [['[data-atlas-previous]', -1], ['[data-atlas-next]', 1]] as const) get(selector).addEventListener('click', () => {
  const realms = visible(); if (!ready || !realms.length) return;
  select(realms[(realms.indexOf(selected) + step + realms.length) % realms.length]); travel(selected.x, selected.y);
});
const direction = (key: string) => ({ ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down' })[key] || ({ a: 'left', d: 'right', w: 'up', s: 'down' })[key.toLowerCase()];
host.addEventListener('keydown', event => {
  if (!ready || event.ctrlKey || event.metaKey || event.altKey) return;
  const dir = direction(event.key);
  if (dir) { event.preventDefault(); viewport.plugins.remove('animate'); viewport.plugins.get<AtlasWheel>('wheel')?.reset(); viewport.plugins.get<Decelerate>('decelerate')?.reset(); keys.add(dir); if (event.shiftKey) keys.add('fast'); }
  else if (event.key === '0') { event.preventDefault(); overview(); }
  else if (['+', '=', '-'].includes(event.key)) { event.preventDefault(); travel(viewport.center.x, viewport.center.y, viewport.scale.x * (event.key === '-' ? .8 : 1.25)); }
  else if (event.key === 'Enter') select(selected);
});
addEventListener('keydown', event => { if (event.key === 'Escape') { stop(); panel.hidden = true; } });
addEventListener('keyup', event => { keys.delete(direction(event.key)); if (event.key === 'Shift') keys.delete('fast'); });
addEventListener('blur', stop);
host.addEventListener('focusout', stop);
document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); app?.ticker.stop(); } else if (active && ready) app.ticker.start(); });
reduced.addEventListener('change', () => { if (!ready) return; stop(); viewport.plugins.remove('decelerate'); if (!reduced.matches) viewport.plugins.add('decelerate', new AtlasGlide(viewport), viewport.plugins.list.length - 2); });
const mini = get('[data-atlas-minimap]');
let miniPointer: number | undefined;
function moveMini(event: PointerEvent, animate = false) {
  if (!ready) return;
  const bounds = mini.querySelector('svg')!.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (event.clientX - bounds.x) / bounds.width)) * data.width;
  const y = Math.max(0, Math.min(1, (event.clientY - bounds.y) / bounds.height)) * data.height;
  if (animate) travel(x, y, Math.max(viewport.scale.x, readingScale()));
  else { stop(); viewport.moveCenter(x, y); dirty = true; }
}
mini.addEventListener('pointerdown', event => { if (event.button !== 0) return; event.preventDefault(); miniPointer = event.pointerId; mini.setPointerCapture(event.pointerId); moveMini(event, true); });
mini.addEventListener('pointermove', event => { if (miniPointer === event.pointerId) moveMini(event); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) mini.addEventListener(type, () => { miniPointer = undefined; });
mini.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); overview(); } });
addEventListener('hashchange', syncScreen);
filters(); syncScreen();
