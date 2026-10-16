const get = selector => document.querySelector(selector);
const all = selector => [...document.querySelectorAll(selector)];
let atlasLoading;

function syncListFilters() {
  const access = get('[data-filter][aria-pressed="true"]')?.dataset.filter || 'all';
  const kind = get('[data-kind-filter][aria-pressed="true"]')?.dataset.kindFilter || 'all';
  const cards = all('[data-list-card]');
  let count = 0;
  for (const card of cards) {
    card.hidden = (access !== 'all' && card.dataset.access !== access) || (kind !== 'all' && card.dataset.kind !== kind);
    if (!card.hidden) count++;
  }
  get('[data-list-count]').textContent = String(count);
}

function syncScreen() {
  const legacy = new URLSearchParams(location.search);
  if (legacy.has('garden-list') || location.hash.startsWith('#entity=')) {
    legacy.delete('garden-list');
    const selection = location.hash.startsWith('#entity=') ? '?' + location.hash.slice(1) : '';
    history.replaceState(null, '', location.pathname + (legacy.size ? '?' + legacy : '') + '#list' + selection);
  }
  const route = location.hash.split('?')[0];
  const catalogue = ['#atlas', '#list', '#realms'].includes(route);
  let view;
  if (route === '#realms') {
    try { view = localStorage.getItem('garden-of-zo-view') || 'atlas'; } catch { view = 'atlas'; }
  } else view = route === '#list' ? 'list' : 'atlas';
  const active = catalogue && view === 'atlas';
  get('[data-screen="landing"]').hidden = catalogue;
  get('main[data-screen="catalogue"]').hidden = !catalogue;
  get('footer[data-screen="catalogue"]').hidden = !catalogue;
  document.body.classList.toggle('is-catalogue-open', catalogue);
  document.body.classList.toggle('is-atlas-view', active);
  get('.hero').classList.toggle('is-offscreen', catalogue);
  all('[data-view-panel]').forEach(el => { el.hidden = el.dataset.viewPanel !== view; });
  all('[data-view]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.view === view)));
  const inventory = !!get('#inventory');
  get('[data-view-eyebrow]').textContent = view === 'list' ? (inventory ? 'Your Garden' : 'The realm directory') : 'The sky atlas';
  get('[data-view-title]').textContent = view === 'list' && inventory ? 'Everything in one place.' : 'Choose the next horizon.';
  get('[data-view-description]').textContent = view === 'list' ? (inventory ? 'Apps, agents, services, workflows and databases.' : 'Every app and agent in one directory.') : 'Explore the floating kingdoms. Choose a landmark to discover its realm.';
  if (active && !atlasLoading) {
    atlasLoading = import('/atlas-client.js?v=unified-list-2').then(detach).catch(error => {
      console.error('Sky Atlas could not load', error);
      get('[data-atlas-loading]').textContent = 'The map could not load. Your kingdoms are available in List View.';
      atlasLoading = undefined;
    });
  }
  document.dispatchEvent(new Event('garden:viewchange'));
  scrollTo({ top: 0, behavior: 'instant' });
}

function changeView(event) {
  const view = event.currentTarget.dataset.view;
  try { localStorage.setItem('garden-of-zo-view', view); } catch {}
  history.replaceState(null, '', location.pathname + location.search + '#' + view);
  syncScreen();
}

function closeCatalogue(event) {
  event.preventDefault();
  history.replaceState(null, '', location.pathname + location.search);
  syncScreen();
}

function changeFilter(event) {
  const button = event.currentTarget;
  const selector = button.hasAttribute('data-filter') ? '[data-filter]' : '[data-kind-filter]';
  all(selector).forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  syncListFilters();
}

function detach() {
  removeEventListener('hashchange', syncScreen);
  all('[data-view]').forEach(button => button.removeEventListener('click', changeView));
  all('[data-close-catalogue]').forEach(link => link.removeEventListener('click', closeCatalogue));
  all('[data-filter], [data-kind-filter]').forEach(button => button.removeEventListener('click', changeFilter));
}

all('[data-view]').forEach(button => button.addEventListener('click', changeView));
all('[data-close-catalogue]').forEach(link => link.addEventListener('click', closeCatalogue));
all('[data-filter], [data-kind-filter]').forEach(button => button.addEventListener('click', changeFilter));
addEventListener('hashchange', syncScreen);
syncListFilters();
syncScreen();
