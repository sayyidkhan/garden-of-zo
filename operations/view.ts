import { readFileSync } from "node:fs";

export function renderInventory() {
  const style = readFileSync(new URL("./list.css", import.meta.url), "utf8");
  return `<div id="inventory">
    <style>${style}</style>
    <div class="inventory-status"><p id="updated" aria-live="polite">Loading your inventory…</p><button class="button" id="refresh">Refresh</button></div>
    <div id="notice" class="alert" hidden role="status"></div><div id="summary" hidden></div>
    <div class="inventory-layout">
      <aside class="inventory-sidebar"><p class="inventory-label">Explore your garden</p><nav class="tabs" id="tabs" aria-label="Inventory sections"></nav><p class="sidebar-note">One garden.<br>Every moving part.</p></aside>
      <div class="inventory-content">
        <div class="toolbar"><div><p class="inventory-label">Your collection</p><h3 id="section-title">Apps</h3></div><div class="search"><label class="search-field"><span class="sr-only">Search inventory</span><input id="search" type="search" placeholder="Search name, owner, location…"></label><label><span class="sr-only">Filter by state or type</span><select id="filter" aria-label="Filter by state or type"><option value="">All records</option></select></label><label id="owner-field" hidden><span class="sr-only">Filter by owner</span><select id="owner" aria-label="Filter by owner"><option value="">All owners</option></select></label><label><span class="sr-only">Sort records</span><select id="sort" aria-label="Sort records"></select></label></div></div>
        <p id="caption" aria-live="polite"></p>
        <div class="table-wrap"><table aria-label="Inventory records"><thead id="head"></thead><tbody id="rows"></tbody></table></div>
        <details class="coverage"><summary>Discovery coverage & evidence</summary><div id="coverage">Waiting for inventory.</div></details>
        <footer>Read-only · Refreshed every minute while List is open · Singapore time</footer>
      </div>
    </div>
    <dialog id="detail" aria-labelledby="detail-title"><div class="dialog-head"><div><p class="inventory-label">In your garden</p><h2 id="detail-title"></h2></div><button class="button" id="close" aria-label="Close details">Close</button></div><div id="detail-body"></div></dialog>
  </div>`;
}
