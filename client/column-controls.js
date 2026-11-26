const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const valueOf = (column, row) => String(column.value(row) ?? "");
const valuesOf = (column, row) => column.values ? column.values(row).map(String) : [valueOf(column, row)];
const labelOf = (column, value) => value === "" ? "(Blank)" : column.format ? column.format(value) : value;

export function readColumnState(raw, columns) {
  try {
    const input = typeof raw === "string" ? JSON.parse(raw) : raw;
    const filters = {};
    for (const column of columns) {
      const values = input?.filters?.[column.key];
      if (Array.isArray(values) && values.length <= 2000 && values.every(value => typeof value === "string")) filters[column.key] = [...new Set(values)];
    }
    const sort = columns.some(column => column.key === input?.sort?.key) && ["asc", "desc"].includes(input?.sort?.direction) ? { key: input.sort.key, direction: input.sort.direction } : null;
    return { filters, sort };
  } catch { return { filters: {}, sort: null }; }
}

export function filterColumnRows(rows, columns, state, except) {
  return rows.filter(row => columns.every(column => column.key === except || !Object.hasOwn(state.filters, column.key) || valuesOf(column, row).some(value => state.filters[column.key].includes(value))));
}

export function sortColumnRows(rows, columns, state) {
  const column = columns.find(column => column.key === state.sort?.key);
  if (!column) return rows;
  const direction = state.sort.direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = column.sortValue ? column.sortValue(a) : column.value(a);
    const right = column.sortValue ? column.sortValue(b) : column.value(b);
    const missingLeft = left === null || left === undefined || left === "";
    const missingRight = right === null || right === undefined || right === "";
    if (missingLeft !== missingRight) return missingLeft ? 1 : -1;
    const comparison = missingLeft ? 0 : column.numeric ? Number(left) - Number(right) : collator.compare(String(left), String(right));
    return comparison * direction || collator.compare(String(a.id ?? a.name ?? ""), String(b.id ?? b.name ?? ""));
  });
}

export function createColumnControls({ rows, onChange }) {
  let context = "", columns = [], trigger, activeColumn;
  const states = new Map();
  const menu = document.createElement("dialog");
  menu.className = "column-menu";
  menu.id = "column-menu";
  menu.setAttribute("aria-labelledby", "column-menu-title");
  document.body.append(menu);
  const state = () => states.get(context);
  const close = (focus = false) => {
    if (menu.open) menu.close();
    document.querySelectorAll('[aria-controls="column-menu"][aria-expanded="true"]').forEach(button => button.setAttribute("aria-expanded", "false"));
    if (focus) (trigger?.isConnected ? trigger : document.querySelector("[data-columns-open]"))?.focus({ preventScroll: true });
  };
  function commit(sortChanged = false) {
    const key = activeColumn?.key;
    close();
    onChange({ sortChanged });
    const next = key && [...document.querySelectorAll("[data-column-key]")].find(button => button.dataset.columnKey === key && button.getClientRects().length);
    (next || document.querySelector("[data-columns-open]"))?.focus({ preventScroll: true });
  }
  function position() {
    if (!menu.open) return;

    const viewport = window.visualViewport;
    const top = viewport?.offsetTop || 0, left = viewport?.offsetLeft || 0;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
    const mobile = width <= 600;
    menu.style.width = Math.min(activeColumn ? 520 : 680, width - (mobile ? 16 : 48)) + "px";
    menu.style.maxHeight = Math.max(120, height - (mobile ? 16 : 48)) + "px";
    menu.style.left = left + (width - menu.offsetWidth) / 2 + "px";
    menu.style.top = top + (mobile ? height - menu.offsetHeight - 8 : (height - menu.offsetHeight) / 2) + "px";
  }
  function fieldSummary(column) {
    const values = state().filters[column.key];
    const selection = values ? values.length ? values.map(value => labelOf(column, value)).join(", ") : "No values selected" : "All values";
    const direction = state().sort?.key === column.key ? state().sort.direction : null;
    return selection + (direction ? " · " + (column.date ? direction === "asc" ? "Oldest first" : "Newest first" : column.numeric ? direction === "asc" ? "Smallest first" : "Largest first" : direction === "asc" ? "A to Z" : "Z to A") : "");
  }
  function openFields(button) {
    close();
    trigger = button;
    activeColumn = null;
    menu.innerHTML = '<div class="column-menu__heading"><div><h2 id="column-menu-title">Filter &amp; sort</h2><p>Choose a field. Combine filters to narrow your results.</p></div><button type="button" data-close aria-label="Close filters">×</button></div><div class="column-menu__fields">' +
      columns.map(column => '<button type="button" data-field="' + escape(column.key) + '" data-filtered="' + Object.hasOwn(state().filters, column.key) + '"><span><strong>' + escape(column.label) + '</strong><small>' + escape(fieldSummary(column)) + '</small></span><span aria-hidden="true">›</span></button>').join("") + '</div>';
    menu.querySelector("[data-close]").onclick = () => close(true);
    menu.querySelectorAll("[data-field]").forEach(field => { field.onclick = () => open({ dataset: { columnKey: field.dataset.field }, launcher: button }); });
    button.setAttribute("aria-expanded", "true");
    menu.showModal();
    position();
    menu.querySelector("[data-close]").focus({ preventScroll: true });
  }
  function open(button) {
    if (menu.open && trigger === button) return close(true);
    close();
    trigger = button.launcher || button;
    activeColumn = columns.find(column => column.key === button.dataset.columnKey);
    if (!activeColumn) return;
    const column = activeColumn, current = state();
    let draftSort = current.sort;
    const originalSort = JSON.stringify(current.sort);
    const candidates = filterColumnRows(rows(), columns, current, column.key);
    const counts = new Map();
    for (const row of candidates) {
      for (const value of new Set(valuesOf(column, row))) counts.set(value, (counts.get(value) || 0) + 1);
    }
    for (const value of current.filters[column.key] || []) if (!counts.has(value)) counts.set(value, 0);
    const values = [...counts.keys()].sort((a, b) => column.numeric ? Number(a) - Number(b) : collator.compare(a, b));
    const selected = new Set(current.filters[column.key] || values);
    const sortLabels = column.date ? ["Oldest first", "Newest first"] : column.numeric ? ["Smallest to largest", "Largest to smallest"] : ["Sort A to Z", "Sort Z to A"];
    menu.innerHTML = '<button type="button" class="column-menu__back" data-back>‹ All fields</button><div class="column-menu__heading"><h2 id="column-menu-title">' + escape(column.label) + '</h2><button type="button" data-close aria-label="Close column menu">×</button></div>' +
      (column.relatedKeys ? '<div class="column-menu__sort" role="group" aria-label="Backup filter field">' + column.relatedKeys.map(key => {
        const related = columns.find(item => item.key === key);
        return related ? '<button type="button" data-related-field="' + escape(key) + '" aria-pressed="' + (key === column.key) + '">' + escape(related.label) + '</button>' : "";
      }).join("") + '</div>' : '') +
      '<div class="column-menu__sort">' + ["asc", "desc"].map((direction, i) => '<button type="button" data-sort="' + direction + '" aria-pressed="' + (current.sort?.key === column.key && current.sort.direction === direction) + '">' + sortLabels[i] + '</button>').join("") +
      '<button type="button" data-unsort' + (current.sort?.key === column.key ? "" : " disabled") + '>Clear sorting</button></div>' +
      '<label class="column-menu__search">Search values<input type="search" aria-label="Search ' + escape(column.label) + ' values" autocomplete="off"></label>' +
      '<div class="column-menu__selection"><button type="button" data-all>Select all</button><button type="button" data-none>Select none</button><span data-selection aria-live="polite"></span></div>' +
      '<div class="column-menu__values" role="group" aria-label="' + escape(column.label) + ' values">' + values.map((value, index) => '<div class="column-menu__value" data-value-index="' + index + '"><label><input type="checkbox" value="' + escape(value) + '"' + (selected.has(value) ? " checked" : "") + '><span>' + escape(labelOf(column, value)) + '</span><small>' + counts.get(value) + '</small></label><button type="button" data-only="' + index + '" aria-label="Only ' + escape(labelOf(column, value)) + '">Only</button></div>').join("") + '<p data-no-values hidden>No matching values</p></div>' +
      '<div class="column-menu__footer"><button type="button" data-clear>Clear filter</button><button type="button" data-cancel>Cancel</button><button type="button" data-apply>Apply</button></div>';
    const shownValues = () => {
      const term = menu.querySelector('input[type="search"]').value.trim().toLowerCase();
      return values.filter(value => String(labelOf(column, value)).toLowerCase().includes(term));
    };
    const effectiveSelection = () => shownValues().filter(value => selected.has(value));
    const update = () => {
      menu.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = selected.has(input.value); });
      menu.querySelectorAll("[data-sort]").forEach(button => button.setAttribute("aria-pressed", String(draftSort?.key === column.key && draftSort.direction === button.dataset.sort)));
      menu.querySelector("[data-unsort]").disabled = draftSort?.key !== column.key;
      const shown = shownValues(), selection = effectiveSelection();
      menu.querySelector("[data-selection]").textContent = selection.length + " of " + shown.length + (shown.length < values.length ? " shown selected" : " selected");
      const draft = { ...current, filters: { ...current.filters, [column.key]: selection } };
      const count = filterColumnRows(rows(), columns, draft).length;
      menu.querySelector("[data-apply]").textContent = "Show " + count + (count === 1 ? " result" : " results");
    };
    menu.querySelectorAll("[data-only]").forEach(button => { button.onclick = () => {
      selected.clear();
      selected.add(values[Number(button.dataset.only)]);
      update();
    }; });
    menu.querySelectorAll("[data-related-field]").forEach(button => {
      button.onclick = () => open({ dataset: { columnKey: button.dataset.relatedField }, launcher: trigger });
    });
    menu.querySelector("[data-back]").onclick = () => openFields(trigger);
    update();
    menu.querySelectorAll('input[type="checkbox"]').forEach(input => input.addEventListener("change", () => {
      if (input.checked) selected.add(input.value); else selected.delete(input.value);
      update();
    }));
    menu.querySelector('input[type="search"]').addEventListener("input", event => {
      const term = event.target.value.trim().toLowerCase();
      let shown = 0;
      menu.querySelectorAll("[data-value-index]").forEach(label => {
        label.hidden = !String(labelOf(column, values[Number(label.dataset.valueIndex)])).toLowerCase().includes(term);
        if (!label.hidden) shown++;
      });
      menu.querySelector("[data-no-values]").hidden = shown > 0;
      menu.querySelector("[data-all]").textContent = term ? "Select shown" : "Select all";
      menu.querySelector("[data-none]").textContent = term ? "Clear shown" : "Select none";
      update();
    });
    menu.querySelector("[data-all]").onclick = () => {
      menu.querySelectorAll("[data-value-index]").forEach(item => {
        if (!item.hidden) selected.add(values[Number(item.dataset.valueIndex)]);
      });
      update();
    };
    menu.querySelector("[data-none]").onclick = () => {
      menu.querySelectorAll("[data-value-index]").forEach(item => {
        if (!item.hidden) selected.delete(values[Number(item.dataset.valueIndex)]);
      });
      update();
    };
    const applySelection = () => {
      const selection = effectiveSelection();
      if (values.every(value => selection.includes(value))) delete current.filters[column.key];
      else current.filters[column.key] = selection;
    };
    menu.querySelectorAll("[data-sort]").forEach(button => { button.onclick = () => {
      draftSort = { key: column.key, direction: button.dataset.sort };
      update();
    }; });
    menu.querySelector("[data-unsort]").onclick = () => { draftSort = null; update(); };
    menu.querySelector("[data-clear]").onclick = () => { delete current.filters[column.key]; commit(); };
    menu.querySelector("[data-apply]").onclick = () => {
      applySelection();
      current.sort = draftSort;
      commit(originalSort !== JSON.stringify(draftSort));
    };
    for (const selector of ["[data-close]", "[data-cancel]"]) menu.querySelector(selector).onclick = () => close(true);
    trigger.setAttribute("aria-expanded", "true");
    menu.showModal();
    position();
    menu.querySelector(innerWidth <= 600 ? "[data-close]" : 'input[type="search"]').focus({ preventScroll: true });
  }
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-column-key]");
    if (button) open(button);
    const launcher = event.target.closest("[data-columns-open]");
    if (launcher) openFields(launcher);
    const remove = event.target.closest("[data-column-remove]");
    if (remove) {
      if (remove.dataset.columnRemove === "$sort") state().sort = null;
      else delete state().filters[remove.dataset.columnRemove];
      activeColumn = null;
      commit(remove.dataset.columnRemove === "$sort");
      document.querySelector("[data-columns-open]")?.focus({ preventScroll: true });
    }
    const clear = event.target.closest("[data-columns-reset]");
    if (clear) {
      states.set(context, { filters: {}, sort: null });
      activeColumn = null;
      commit(true);
      document.querySelector("[data-columns-open]")?.focus({ preventScroll: true });
    }
  });
  document.addEventListener("pointerdown", event => {
    if (menu.open && !menu.contains(event.target) && !event.target.closest("[data-column-key]")) close();
  });
  menu.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
  });
  menu.addEventListener("cancel", event => { event.preventDefault(); close(true); });
  menu.addEventListener("click", event => {
    if (event.target !== menu) return;
    const rect = menu.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(true);
  });
  document.addEventListener("scroll", event => { if (menu.open && !menu.contains(event.target)) position(); }, true);
  addEventListener("resize", position);
  window.visualViewport?.addEventListener("resize", position);
  document.addEventListener("garden:viewchange", () => close());
  return {
    activate(key, definitions) {
      if (key !== context) close();
      context = key; columns = definitions;
      if (!states.has(context)) states.set(context, { filters: {}, sort: null });
    },
    restore(raw) { states.set(context, readColumnState(raw, columns)); },
    serialize() { return state().sort || Object.keys(state().filters).length ? JSON.stringify(state()) : ""; },
    get state() { return state(); },
    clearSort() { state().sort = null; },
    filter(data) { return filterColumnRows(data, columns, state()); },
    sort(data) { return sortColumnRows(data, columns, state()); },
    render(container, headers = false, keys) {
      const current = state();
      if (!headers) {
        const count = Object.keys(current.filters).length + Number(Boolean(current.sort));
        container.innerHTML = '<button type="button" class="column-trigger column-launcher" data-columns-open aria-haspopup="dialog" aria-controls="column-menu" aria-expanded="false"><span aria-hidden="true">☷</span><span>Filter &amp; sort</span>' + (count ? '<span class="column-launcher__count">' + count + '</span>' : '') + '</button>';
        return;
      }
      const buttons = (keys ? keys.map(key => columns.find(column => column.key === key)).filter(Boolean) : columns).map(column => {
        const related = column.relatedKeys || [column.key];
        const filtered = related.some(key => Object.hasOwn(current.filters, key));
        const sorted = related.includes(current.sort?.key) ? current.sort.direction : null;
        const button = '<button type="button" class="column-trigger" data-column-key="' + escape(column.key) + '" data-active="' + Boolean(filtered || sorted) + '" aria-label="Sort and filter ' + escape(column.label) + '" aria-haspopup="dialog" aria-controls="column-menu" aria-expanded="false"><span>' + escape(column.label) + '</span><span class="column-trigger__indicator" aria-hidden="true">' + (sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : "") + (filtered ? " ●" : "") + ' ▾</span></button>';
        return headers ? '<th scope="col" aria-sort="' + (sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none") + '">' + button + '</th>' : button;
      }).join("");
      container.innerHTML = headers ? "<tr>" + buttons + "</tr>" : buttons;
    },
    summary(container) {
      const active = columns.filter(column => Object.hasOwn(state().filters, column.key));
      container.hidden = !active.length && !state().sort;
      container.innerHTML = active.map(column => {
        const values = state().filters[column.key];
        const label = column.label + ": " + (values.length ? values.map(value => labelOf(column, value)).join(", ") : "None");
        return '<button type="button" class="column-chip" data-column-remove="' + escape(column.key) + '" aria-label="Remove filter ' + escape(label) + '"><span>' + escape(label) + '</span><span aria-hidden="true">×</span></button>';
      }).join("") + (state().sort ? '<button type="button" class="column-chip" data-column-remove="$sort" aria-label="Remove sorting"><span>' + escape(columns.find(column => column.key === state().sort.key).label) + (state().sort.direction === "asc" ? ' ↑' : ' ↓') + '</span><span aria-hidden="true">×</span></button>' : '') + '<button type="button" data-columns-reset>Clear filters &amp; sorting</button>';
    }
  };
}
