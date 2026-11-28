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
      <div class="directory-options" hidden>${renderInventoryFilters()}</div>
    </div>
    <div class="directory-refine">${renderInventorySearch()}
    <div class="directory-refine-actions"><div class="column-toolbar" data-columns-toolbar aria-label="Sort and filter record fields"></div><div id="database-group-controls" aria-label="Database groups" hidden><button type="button" class="database-group-link" id="database-groups-toggle" data-database-groups-action="collapse">Collapse all</button></div></div></div>
    <div class="column-summary" data-columns-summary hidden role="status"></div>
    <div class="table-wrap"><table aria-label="Inventory records"><thead id="head"></thead><tbody id="rows"></tbody></table></div>
    <div id="notice" class="alert" hidden role="status"></div>
    <p data-task-feedback role="status" aria-live="polite"></p>
    <p id="evidence-caption"></p>
    <dialog id="inventory-info-dialog" aria-labelledby="inventory-info-title">
      <div class="dialog-head"><div><p class="inventory-label">About this inventory</p><h2 id="inventory-info-title">Sources & coverage</h2></div><button class="button" id="close-inventory-info" aria-label="Close inventory info">Close</button></div>
      <div class="inventory-freshness"><p id="updated" aria-live="polite">Loading your inventory…</p><p>Updates every minute while Home or List is open. Refresh checks again now.</p></div>
      <p class="coverage-note">Garden reads these sources without changing your tasks, services or database contents. Each source has its own limits; a running process does not confirm application health.</p>
      <div id="coverage" class="coverage">Waiting for inventory.</div>
    </dialog>
    <p id="copy-feedback" class="copy-feedback" role="status" aria-live="polite"></p>
    <p data-backup-feedback role="status" aria-live="polite"></p>
    <dialog id="backup-dialog" aria-labelledby="backup-title"><div class="dialog-head"><h2 id="backup-title">Backup details</h2><button type="button" class="button" id="close-backup">Close</button></div><div id="backup-body"></div></dialog>
    <dialog id="database-view-dialog" aria-labelledby="database-view-title">
      <div class="dialog-head"><div><h2 id="database-view-title">Database records</h2><p class="inventory-label">Read-only</p><dl id="database-view-context" aria-label="Database ownership"></dl></div><button type="button" class="button database-toolbar-icon" id="close-database-view" aria-label="Close database viewer" title="Close database viewer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
      <form id="database-view-search-form" class="database-view-toolbar" role="search">
        <label class="database-table-field" for="database-view-table"><span class="sr-only">Table</span><select id="database-view-table" aria-label="Database table" data-search-placeholder="Search tables…" disabled></select></label>
        <label class="database-search-field" for="database-view-search"><span class="sr-only">Search records</span><input type="search" id="database-view-search" placeholder="Search across all columns…" maxlength="200" autocomplete="off" disabled></label>
        <button type="submit" class="button database-toolbar-icon" id="database-view-search-button" aria-label="Search records" title="Search records" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button>
        <button type="button" class="button database-toolbar-icon" id="database-view-clear" aria-label="Clear all" title="Clear all" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 4-6 6a2 2 0 0 0 0 3l6 6h5l7-7a2 2 0 0 0 0-3l-5-5a2 2 0 0 0-3 0Z"/><path d="m7 7 10 10M9 19h12"/></svg></button>
      </form>
      <div id="database-view-active-filters" aria-label="Active column filters" hidden></div>
      <div id="database-view-grid" tabindex="0" role="region" aria-label="Scrollable database records"></div>
      <div class="database-view-pages"><div class="database-view-results"><p id="database-view-status" role="status" aria-live="polite"></p><span id="database-view-summary"></span></div><p class="database-view-note">Read-only · Long values are shortened. Results may shift as data changes.</p><span id="database-view-page"></span><button type="button" class="button" id="database-view-prev" disabled>Previous</button><button type="button" class="button" id="database-view-next" disabled>Next</button></div>
    </dialog>
    <dialog id="database-filter-dialog" aria-labelledby="database-filter-title">
      <form id="database-view-filters">
        <header class="database-filter-header"><h2 id="database-filter-title">Column</h2></header>
        <div class="database-filter-body"><label class="database-sort-field" for="database-view-sort"><span>Sort</span><select id="database-view-sort"><option value="default">Default</option><option value="asc">Ascending ↑</option><option value="desc">Descending ↓</option></select></label><section class="database-values" aria-label="Filter by values"><label for="database-value-search"><input id="database-value-search" aria-label="Search values" type="search" placeholder="Search all values…" maxlength="200" autocomplete="off"></label><div class="database-value-actions"><button type="button" class="button" id="database-values-all" aria-label="Select all values">All</button><button type="button" class="button" id="database-values-none" aria-label="Select no values">None</button><p id="database-values-status" role="status"></p></div><div id="database-values-list"></div><button type="button" class="button" id="database-values-more" hidden>Load more values</button></section><details id="database-filter-conditions"><summary>Condition filters</summary><div id="database-view-filter-rows"></div><button type="button" class="button" id="database-view-add-filter">+ Add condition</button><p id="database-filter-limit" role="status" hidden>Maximum of 8 conditions reached.</p></details></div>
        <footer class="database-filter-actions"><button type="button" class="button" id="database-view-reset-filters" title="Clear this column’s filters">Clear</button><button type="button" class="button" id="database-view-cancel-filters" autofocus>Cancel</button><button type="submit" class="button database-filter-apply">Apply</button></footer>
      </form>
    </dialog>
    <dialog id="copy-row-dialog" aria-labelledby="copy-row-title"><div class="dialog-head"><h2 id="copy-row-title">Copy row</h2><button type="button" class="button" id="close-copy-row">Close</button></div><p id="copy-row-help">Clipboard access is blocked. Select and copy this text, then paste it into your chat.</p><textarea id="copy-row-text" readonly aria-label="Row context to copy" aria-describedby="copy-row-help"></textarea></dialog>
    <dialog id="detail" aria-labelledby="detail-title"><div class="dialog-head"><div><p class="inventory-label">In your garden</p><h2 id="detail-title"></h2></div><button class="button" id="close" aria-label="Close details">Close</button></div><div id="detail-body"></div></dialog>
  </div>`;
}
