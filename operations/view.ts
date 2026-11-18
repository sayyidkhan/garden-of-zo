import { readFileSync } from "node:fs";

export function renderInventorySearch() {
  return `<div class="directory-search"><label for="search">Search</label><div class="directory-search__input"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="search" type="search" placeholder="Search your garden…" autocomplete="off"></div></div>`;
}

export function renderInventoryFilters() {
  return `<div class="inventory-filter-field inventory-owner-field" id="owner-field" hidden><label for="owner">Owner</label><select id="owner" aria-label="Filter by owner"><option value="">All owners</option></select></div>
    <div class="inventory-filter-field"><label for="filter">Records</label><select id="filter" aria-label="Filter by state or type"><option value="">All records</option></select></div>
    <div class="inventory-filter-field"><label for="sort">Sort by</label><select id="sort" aria-label="Sort records"></select></div>`;
}

export function renderInventory(cards = "") {
  const style = readFileSync(new URL("./list.css", import.meta.url), "utf8");
  return `<div id="inventory">
    <style>${style}</style>
    <template id="directory-card-templates">${cards}</template>
    <div id="summary" hidden></div>
    <nav class="directory-tabs tabs" id="tabs" aria-label="Inventory sections"></nav>
    <div class="directory-results">
      <div class="inventory-result-heading"><div><h3 class="directory-title" id="section-title">Apps</h3><p class="directory-count" id="caption" aria-live="polite"></p></div><div class="inventory-actions"><span class="badge" id="inventory-stale" role="status" hidden>Older data</span><button class="button inventory-info-button" id="inventory-info" aria-haspopup="dialog" aria-controls="inventory-info-dialog">Inventory info</button><button class="button" id="refresh">Refresh</button></div></div>
      <div class="directory-options">${renderInventoryFilters()}</div>
    </div>
    <div class="table-wrap"><table aria-label="Inventory records"><thead id="head"></thead><tbody id="rows"></tbody></table></div>
    <div id="notice" class="alert" hidden role="status"></div>
    <p id="evidence-caption"></p>
    <dialog id="inventory-info-dialog" aria-labelledby="inventory-info-title">
      <div class="dialog-head"><div><p class="inventory-label">About this inventory</p><h2 id="inventory-info-title">Sources & coverage</h2></div><button class="button" id="close-inventory-info" aria-label="Close inventory info">Close</button></div>
      <div class="inventory-freshness"><p id="updated" aria-live="polite">Loading your inventory…</p><p>Updates every minute while Home or List is open. Refresh checks again now.</p></div>
      <p class="coverage-note">Garden only reads these sources. It does not change services or data. Each source has its own limits; a running process does not confirm application health.</p>
      <div id="coverage" class="coverage">Waiting for inventory.</div>
    </dialog>
    <dialog id="detail" aria-labelledby="detail-title"><div class="dialog-head"><div><p class="inventory-label">In your garden</p><h2 id="detail-title"></h2></div><button class="button" id="close" aria-label="Close details">Close</button></div><div id="detail-body"></div></dialog>
  </div>`;
}
