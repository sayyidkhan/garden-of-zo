const get = selector => document.querySelector(selector);
const all = selector => [...document.querySelectorAll(selector)];
let atlasLoading;
const categorySelect = get('[data-ownership-category]');
const roleSelect = get('[data-ownership-role]');
const categoryRoles = JSON.parse(get('#ownership-filter-data').textContent);
const allRoles = [...roleSelect.options].map(option => option.value).filter(Boolean);

function searchableSelect(select) {
  const wrapper = document.createElement('div');
  wrapper.className = 'label-combobox';
  const input = document.createElement('input');
  input.id = select.id + '-search';
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = select.options[0].text;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-label', select.getAttribute('aria-label'));
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'label-combobox__toggle';
  toggle.setAttribute('aria-label', 'Show ' + select.getAttribute('aria-label').toLowerCase() + ' options');
  toggle.setAttribute('aria-haspopup', 'listbox');
  toggle.setAttribute('aria-expanded', 'false');
  const list = document.createElement('div');
  list.id = select.id + '-options';
  list.className = 'label-combobox__options';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', select.getAttribute('aria-label') + ' options');
  list.hidden = true;
  for (const element of [input, toggle]) element.setAttribute('aria-controls', list.id);
  wrapper.append(input, toggle);
  select.after(wrapper);
  select.hidden = true;
  select.parentElement.querySelector('label').htmlFor = input.id;
  document.body.append(list);
  let options = [];
  let active = -1;

  function sync() {
    input.value = select.value ? select.selectedOptions[0].text : '';
    wrapper.dataset.selected = String(Boolean(select.value));
  }

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    sync();
  }

  function position() {
    const box = wrapper.getBoundingClientRect();
    const height = window.visualViewport?.height || innerHeight;
    const below = height - box.bottom - 12;
    const above = box.top - 12;
    const upwards = below < 160 && above > below;
    const available = Math.max(0, upwards ? above : below);
    list.style.width = box.width + 'px';
    list.style.left = box.left + 'px';
    list.style.maxHeight = Math.min(280, available) + 'px';
    list.style.top = upwards ? 'auto' : box.bottom + 6 + 'px';
    list.style.bottom = upwards ? innerHeight - box.top + 6 + 'px' : 'auto';
  }

  function highlight(index) {
    active = index;
    [...list.querySelectorAll('[role="option"]')].forEach((item, i) => {
      item.dataset.active = String(i === active);
      if (i === active) {
        input.setAttribute('aria-activedescendant', item.id);
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function open(query = '') {
    const term = query.trim().toLowerCase();
    options = [...select.options].filter(option => option.text.toLowerCase().includes(term));
    list.replaceChildren(...options.map((option, index) => {
      const item = document.createElement('div');
      item.id = list.id + '-' + index;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.value === select.value));
      item.dataset.index = index;
      item.textContent = option.text;
      return item;
    }));
    input.removeAttribute('aria-activedescendant');
    if (!options.length) {
      const empty = document.createElement('div');
      empty.className = 'label-combobox__empty';
      empty.setAttribute('role', 'status');
      empty.textContent = 'No matches';
      list.append(empty);
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-expanded', 'true');
    position();
    highlight(options.length ? Math.max(0, options.findIndex(option => option.value === select.value)) : -1);
  }

  function choose(index) {
    if (!options[index]) return;
    select.value = options[index].value;
    close();
    select.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus({ preventScroll: true });
    input.select();
  }

  input.addEventListener('focus', () => input.select());
  input.addEventListener('click', () => {
    if (list.hidden) { open(); input.select(); }
  });
  input.addEventListener('input', () => open(input.value));
  input.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      if (list.hidden) open();
      else if (options.length) highlight((active + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
    } else if (event.key === 'Enter' && !list.hidden) {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape' && !list.hidden) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') close();
  });
  toggle.addEventListener('pointerdown', event => event.preventDefault());
  toggle.addEventListener('click', () => {
    if (list.hidden) { input.focus({ preventScroll: true }); open(); input.select(); }
    else close();
  });
  list.addEventListener('pointerdown', event => event.preventDefault());
  list.addEventListener('click', event => {
    const item = event.target.closest('[role="option"]');
    if (item) choose(Number(item.dataset.index));
  });
  wrapper.addEventListener('focusout', event => {
    if (!wrapper.contains(event.relatedTarget)) close();
  });
  document.addEventListener('pointerdown', event => {
    if (!wrapper.contains(event.target) && !list.contains(event.target)) close();
  });
  document.addEventListener('scroll', event => {
    if (!list.hidden && !list.contains(event.target)) position();
  }, true);
  addEventListener('resize', () => { if (!list.hidden) position(); });
  window.visualViewport?.addEventListener('resize', () => { if (!list.hidden) position(); });
  document.addEventListener('garden:viewchange', close);
  sync();
  return { sync: close };
}

const ownershipComboboxes = [categorySelect, roleSelect].map(searchableSelect);

function syncOwnershipFilters(fromLocation = false) {
  const url = new URL(location.href);
  if (fromLocation) categorySelect.value = url.searchParams.get('category') || '';
  const role = fromLocation ? url.searchParams.get('role') || '' : roleSelect.value;
  const roles = categoryRoles[categorySelect.value] || allRoles;
  roleSelect.replaceChildren(new Option('All roles', ''), ...roles.map(value => new Option(value, value)));
  roleSelect.value = roles.includes(role) ? role : '';
  ownershipComboboxes.forEach(combobox => combobox.sync());
  get('[data-clear-ownership]').disabled = !categorySelect.value && !roleSelect.value;
  for (const [key, value] of [['category', categorySelect.value], ['role', roleSelect.value]]) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  syncListFilters();
  document.dispatchEvent(new Event('garden:ownershipchange'));
}

categorySelect.addEventListener('change', () => syncOwnershipFilters());
roleSelect.addEventListener('change', () => syncOwnershipFilters());
get('[data-clear-ownership]').addEventListener('click', () => {
  categorySelect.value = '';
  roleSelect.value = '';
  syncOwnershipFilters();
});
addEventListener('popstate', () => syncOwnershipFilters(true));
all('[data-home-section]').forEach(link => link.addEventListener('click', event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  get('[data-clear-ownership]').click();
  get('[data-filter="all"]').click();
  get('#search').value = '';
}));

get('[data-open-label-legend]').addEventListener('click', () => {
  get('#label-legend').showModal();
  get('.label-legend__body').scrollTop = 0;
});

function syncListFilters() {
  const access = get('[data-filter][aria-pressed="true"]')?.dataset.filter || 'all';
  const kind = get('[data-kind-filter][aria-pressed="true"]')?.dataset.kindFilter || 'all';
  const cards = all('[data-list-card]');
  const query = get('#search').value.trim().toLowerCase();
  const order = get('#directory-sort')?.value || 'default';
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  cards.sort((a, b) => order === 'default' ? Number(a.style.getPropertyValue('--order')) - Number(b.style.getPropertyValue('--order')) :
    collator.compare(a.querySelector('h3').textContent, b.querySelector('h3').textContent) * (order === 'name_desc' ? -1 : 1));
  for (const card of cards) card.parentElement.append(card);
  all('[data-directory-kind]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.directoryKind === kind)));
  const title = get('[data-directory-title]');
  if (title) title.textContent = kind === 'app' ? 'Apps' : kind === 'agent' ? 'Agents' : 'All destinations';
  const total = get('[data-list-total]');
  if (total) total.textContent = String(cards.filter(card => kind === 'all' || card.dataset.kind === kind).length);
  let count = 0;
  for (const card of cards) {
    card.hidden = (access !== 'all' && card.dataset.access !== access) || (kind !== 'all' && card.dataset.kind !== kind) ||
      (categorySelect.value && card.dataset.ownershipCategory !== categorySelect.value) ||
      (roleSelect.value && card.dataset.ownershipRole !== roleSelect.value) || (query && !card.textContent.toLowerCase().includes(query));
    if (!card.hidden) count++;
  }
  get('[data-list-count]').textContent = String(count);
  if (get('[data-list-empty]')) get('[data-list-empty]').hidden = count > 0;
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
  get('[data-view-eyebrow]').textContent = view === 'list' ? 'The realm directory' : 'The sky atlas';
  get('[data-view-title]').textContent = 'Choose the next horizon.';
  get('[data-view-description]').textContent = view === 'list' ? 'Find your next destination in the Garden of Zo.' : 'Explore the floating kingdoms. Choose a landmark to discover its realm.';
  if (active && !atlasLoading) {
    atlasLoading = import(get('[data-atlas-client]').dataset.atlasClient).then(detach).catch(error => {
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
  document.dispatchEvent(new Event('garden:cataloguefilterchange'));
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
all('[data-directory-kind]').forEach(button => button.addEventListener('click', () => {
  get('[data-kind-filter="' + button.dataset.directoryKind + '"]').click();
}));
document.addEventListener('garden:cataloguefilterchange', syncListFilters);
if (!get('#inventory')) {
  const restoreDirectory = () => {
    if (location.hash.split('?')[0] !== '#list') return;
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    get('#search').value = params.get('q') || '';
    const kind = params.get('kind') || 'all';
    all('[data-kind-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.kindFilter === kind)));
    const sort = get('#directory-sort');
    sort.value = params.get('sort') || 'default';
    if (!sort.selectedOptions.length) sort.value = 'default';
    syncListFilters();
  };
  const saveDirectory = () => {
    if (location.hash.split('?')[0] !== '#list') return;
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const query = get('#search').value;
    const order = get('#directory-sort').value;
    const kind = get('[data-kind-filter][aria-pressed="true"]').dataset.kindFilter;
    for (const [key, value] of [['q', query], ['sort', order === 'default' ? '' : order], ['kind', kind === 'all' ? '' : kind]]) {
      if (value) params.set(key, value); else params.delete(key);
    }
    history.replaceState(null, '', location.pathname + location.search + '#list' + (params.size ? '?' + params : ''));
    syncListFilters();
  };
  get('#search').addEventListener('input', saveDirectory);
  get('#directory-sort').addEventListener('change', saveDirectory);
  document.addEventListener('garden:cataloguefilterchange', saveDirectory);
  addEventListener('hashchange', restoreDirectory);
  addEventListener('popstate', restoreDirectory);
  restoreDirectory();
}
syncOwnershipFilters(true);
syncScreen();
