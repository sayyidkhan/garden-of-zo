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
    <div class="directory-refine-actions"><div class="column-toolbar" data-columns-toolbar aria-label="Sort and filter record fields"></div><button type="button" class="button" id="database-columns-toggle" aria-expanded="false" aria-controls="database-column-choices" hidden>Columns</button></div></div>
    <div id="database-column-options" hidden><section id="database-column-choices" aria-label="Choose table columns" hidden>
      <div class="database-column-actions"><strong>Choose columns</strong><button class="button" type="button" id="database-columns-done">Done</button></div>
      <input id="database-column-search" type="search" placeholder="Find a column…" aria-label="Find a column">
      <p id="database-column-help">Tick to show. Drag the grip to reorder, or focus it and use ↑ ↓.</p>
      <ol id="database-column-list" aria-label="Table columns"></ol>
      <p id="database-column-empty" hidden>No matching columns.</p>
      <div class="database-column-footer"><button class="button" type="button" data-database-select="all">Show all</button><button class="button" type="button" data-database-select="none">Clear optional</button></div>
      <span id="database-column-status" class="sr-only" role="status"></span>
    </section></div>
    <div class="column-summary" data-columns-summary hidden role="status"></div>
    <p id="database-table-help" hidden>Database and purpose stay visible. Use Columns to choose and reorder the other fields. Phones show stacked records; wider screens show a table. Local copies do not establish off-host protection or full recovery.</p>
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
    <dialog id="backup-dialog" aria-labelledby="backup-title"><div class="dialog-head"><h2 id="backup-title">Backup details</h2><button type="button" class="button" id="close-backup">Close</button></div><div id="backup-body"></div></dialog>
    <dialog id="copy-row-dialog" aria-labelledby="copy-row-title"><div class="dialog-head"><h2 id="copy-row-title">Copy row</h2><button type="button" class="button" id="close-copy-row">Close</button></div><p id="copy-row-help">Clipboard access is blocked. Select and copy this text, then paste it into your chat.</p><textarea id="copy-row-text" readonly aria-label="Row context to copy" aria-describedby="copy-row-help"></textarea></dialog>
    <dialog id="detail" aria-labelledby="detail-title"><div class="dialog-head"><div><p class="inventory-label">In your garden</p><h2 id="detail-title"></h2></div><button class="button" id="close" aria-label="Close details">Close</button></div><div id="detail-body"></div></dialog>
  </div>`;
}
