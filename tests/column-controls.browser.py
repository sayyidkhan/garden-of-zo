import asyncio
import json
import os
import subprocess
from pathlib import Path
from urllib.parse import quote, urlsplit, parse_qsl, urlencode

from playwright.async_api import async_playwright

async def main():
    root = Path(__file__).resolve().parents[1]
    fixture = None
    private = os.environ.get("GARDEN_PRIVATE_TEST_URL")
    public = os.environ.get("GARDEN_PUBLIC_TEST_URL")
    if not private:
        fixture = subprocess.Popen(["bun", "-e", '''
import { createHandler } from "./server.ts";
const servers = ["private", "public"].map(access => Bun.serve({
  hostname: "127.0.0.1", port: 0, fetch: createHandler(process.cwd() + "/../zo-router/" + access + ".routes.json")
}));
console.log(JSON.stringify(servers.map(s => "http://127.0.0.1:" + s.port)));
'''], cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        private, public = json.loads(fixture.stdout.readline())
    checks = []
    skipped = []
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True, args=["--no-sandbox"])
            page = await browser.new_page(viewport={"width": 1440, "height": 1000})
            errors = []
            requests = []
            page.on("request", lambda request: requests.append(request.url))
            page.on("pageerror", lambda error: errors.append(str(error)))
            async def open_column(key):
                direct = page.locator(f'[data-column-key="{key}"]:visible')
                if await direct.count():
                    await direct.click()
                else:
                    await page.locator("[data-columns-open]:visible").click()
                    await page.locator(f'#column-menu [data-field="{key}"]').click()
                await page.locator("#column-menu").wait_for(state="visible")
            async def choose_only(key, value):
                await open_column(key)
                await page.locator("#column-menu [data-none]").click()
                await page.locator("#column-menu").get_by_role("checkbox", name=value, exact=False).check()
                await page.locator("#column-menu [data-apply]").click()
            async def grouped_ids():
                return await page.locator("#rows").evaluate("""body => {
                    const groups = [];
                    for (const row of body.children) {
                        if (row.classList.contains("database-group")) groups.push([]);
                        if (row.dataset.databaseRow) groups.at(-1).push(row.dataset.databaseRow);
                    }
                    return groups;
                }""")
            async def ids():
                return await page.locator("#rows .database-name").evaluate_all("nodes => nodes.map(n => n.dataset.entity)")
            async def clear():
                if await page.locator("[data-columns-reset]:visible").count():
                    await page.locator("[data-columns-reset]:visible").click()

            await page.goto(private + "/#list?tab=databases")
            await page.wait_for_selector("#rows .database-name", timeout=60000)
            assert not await page.locator(".catalogue__filters").is_visible()
            assert not await page.locator(".directory-options:visible").count()
            assert await page.locator("#search").is_visible()
            assert await page.locator("#search").evaluate("e => e.closest('#list-view') !== null")
            inventory = await page.evaluate('fetch("/operations/api/inventory").then(r=>r.json())')
            by_id = {row["id"]: row for row in inventory["databases"]}
            initial = await ids()
            assert len(initial) == len(by_id)
            assert await page.locator("#head th").count() == 7
            assert await page.locator('#head [data-column-key="remarks"]').count() == 1
            assert await page.locator('#head [data-column-key="backup"]').count() == 0
            assert await page.locator('#head [data-column-key="purpose"]').count() == 1
            legacy = await browser.new_page()
            for saved, expected_columns in [
                ("engine,size,backup", ["name", "purpose", "size", "engine"]),
                ("backup", ["name", "purpose"]),
                ("backup,size,copies", ["name", "purpose", "size"]),
                ("path,engine,size", ["name", "purpose", "size", "engine"]),
                ("path", ["name", "purpose"]),
                ("type", ["name", "purpose", "component"]),
                ("component,type,engine", ["name", "purpose", "component", "engine"]),
                ("", ["name", "purpose"]),
                ("backedUpBy,lastBackup,backupCount", ["name", "purpose", "backupOverview"]),
                ("backupCount,engine,lastBackup", ["name", "purpose", "engine", "backupOverview"]),
            ]:
                await legacy.goto(private + "/#list?tab=databases&dbLayout=2&dbColumns=" + saved)
                await legacy.wait_for_selector("#rows .database-name", timeout=60000)
                assert await legacy.locator("#head [data-column-key]").evaluate_all("nodes => nodes.map(n => n.dataset.columnKey)") == expected_columns
                assert "dbLayout=6" in legacy.url
                await legacy.reload()
                await legacy.wait_for_selector("#rows .database-name", timeout=60000)
                assert await legacy.locator("#head [data-column-key]").evaluate_all("nodes => nodes.map(n => n.dataset.columnKey)") == expected_columns
            await legacy.close()
            checks.append("Old column layouts adopt recommended order while preserving visibility, including no optional columns")
            async def saved_columns(keys):
                state = dict(parse_qsl(urlsplit(page.url).fragment.partition("?")[2], keep_blank_values=True))
                state.update(dbColumns=",".join(keys), dbLayout="6")
                await page.goto(private + "/#list?" + urlencode(state))
                await page.wait_for_selector("#rows .database-name", timeout=60000)

            async def show_columns(keys):
                order = ["component", "size", "engine", "backupOverview", "remarks"]
                await saved_columns([key for key in order if key in keys or key == "size"])

            assert await page.locator("#database-columns-toggle, #database-column-choices").count() == 0
            await saved_columns([])
            assert await page.locator("#head th").count() == 2
            await page.reload()
            await page.wait_for_selector("#rows .database-name", timeout=60000)
            assert await page.locator("#head th").count() == 2
            await show_columns(["component", "engine", "backupOverview", "remarks"])
            assert await page.locator("#head th").count() == 7
            assert await page.locator('#head [data-column-key="component"]').get_attribute("aria-label") == "Sort and filter Used by"
            for row in by_id.values():
                expected_usage = row.get("component") or {"application": "App", "agent runtime": "Agent Runtime", "host runtime": "Host System", "development": "Development / Testing"}.get(row["category"], "Not confirmed")
                assert await page.locator('[data-database-row="' + row["id"] + '"] [data-field="component"]').inner_text() == expected_usage
            assert await page.locator('#head [data-column-key="wal"]').count() == 0
            assert await page.locator('#rows [data-field="size"] .database-wal-size').count() > 0
            await page.locator("[data-columns-open]:visible").click()
            assert await page.locator('#column-menu [data-field="verification"], #column-menu [data-field="nextStep"], #column-menu [data-field="backup"], #column-menu [data-field="type"]').count() == 0
            await page.keyboard.press("Escape")
            for width in [390, 1440]:
                await page.set_viewport_size({"width": width, "height": 1000})
                await saved_columns(["remarks", "size"])
                widths = await page.locator("#head th").evaluate_all("cells => cells.slice(0,2).map(c => c.getBoundingClientRect().width)")
                assert widths == ([0, 0] if width == 390 else [180, 200]), widths
                await page.reload()
                await page.wait_for_selector("#rows .database-name", timeout=60000)
                assert await page.locator("#head [data-column-key]").evaluate_all("nodes => nodes.map(n => n.dataset.columnKey)") == ["name", "purpose", "remarks", "size"]
                await show_columns(["remarks"])
            checks.append("Columns control is removed; existing saved visibility and ordering still load on desktop and phones")
            orin = [row for row in by_id.values() if row.get("owner") == "agent:orin"]
            assert len(orin) == 7
            notes = next(row for row in orin if row["name"] == "notepad.db")
            await choose_only("owner", "Orin Forgekeeper")
            expected = await ids()
            for width in [320, 390, 768, 1440]:
                await page.set_viewport_size({"width": width, "height": 1000})
                assert await page.locator("#rows .database-group").count() == 1
                assert await page.locator("#rows .database-record td").count() == len(orin) * 4
                if width <= 600:
                    assert not await page.locator("#head").is_visible()
                    assert await page.locator(".database-scroll").evaluate("e => e.scrollWidth <= e.clientWidth")
                    assert await page.locator("#rows .database-record").evaluate_all("""rows => rows.every(row => {
                        const cells = [...row.children];
                        return getComputedStyle(row).display === "grid" && cells.every((cell, i) => {
                            const box = cell.getBoundingClientRect();
                            return box.width > 0 && box.right <= innerWidth &&
                                (!i || box.top >= cells[i - 1].getBoundingClientRect().bottom - 1 ||
                                 (Math.abs(box.top - cells[i - 1].getBoundingClientRect().top) < 1 &&
                                  box.left >= cells[i - 1].getBoundingClientRect().right));
                        }) && cells.slice(2).every(cell =>
                            getComputedStyle(cell, "::before").content.includes(cell.dataset.label));
                    })""")
                else:
                    assert await page.locator("#rows .database-record").first.evaluate("e => getComputedStyle(e).display === 'table-row'")
                    header = await page.locator("#head th").first.bounding_box()
                    cell = await page.locator("#rows .database-record td").first.bounding_box()
                    assert abs(header["width"] - cell["width"]) < 2
                original_url = page.url
                first = page.locator("#rows .database-name").first
                await first.click()
                assert page.url == original_url
                assert not await page.locator("dialog:modal").count()
                assert await page.locator(".table-wrap").is_visible()
                wrap = page.locator(".database-scroll")
                left = (await first.bounding_box())["x"]
                purpose = page.locator('#rows .database-record td[data-field="purpose"]').first
                purpose_left = (await purpose.bounding_box())["x"]
                await wrap.evaluate("e => e.scrollLeft = 250")
                await page.wait_for_timeout(80)
                assert abs((await first.bounding_box())["x"] - left) < 2
                assert abs((await purpose.bounding_box())["x"] - purpose_left) < 2
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
                await wrap.evaluate("e => e.scrollLeft = 0")
                await page.screenshot(path=root / "_scratch" / f"spreadsheet-default-{width}.png", full_page=True)
                if width < 600:
                    await page.locator("#rows .database-name").last.scroll_into_view_if_needed()
                    await page.screenshot(path=root / "_scratch" / f"spreadsheet-bottom-{width}.png")
            await show_columns(["remarks", "component"])
            assert await ids() == expected
            record = page.locator('[data-database-row="' + notes["id"] + '"]')
            path_cell = record.locator(".database-actions")
            path_copy = path_cell.get_by_role("button", name="Copy source database path", exact=True)
            assert await path_copy.get_attribute("data-copy-path") == notes["path"]
            assert await path_copy.get_attribute("data-tooltip-path") == notes["path"]
            assert await path_copy.get_attribute("data-tooltip") == "Copy file path"
            assert await path_cell.locator("code").count() == 0
            assert await page.locator('#head [data-column-key="path"]').count() == 0
            assert notes["remarks"] == await record.locator(".database-remarks").inner_text()
            assert await record.locator(".database-remarks strong").inner_text() == "Created by Hermes framework."
            selected_url = page.url
            await page.reload()
            await page.wait_for_selector('#head [data-column-key="remarks"]', timeout=60000)
            assert await page.locator('#head [data-column-key="path"]').count() == 0
            assert page.url == selected_url
            assert await ids() == expected
            for width in [320, 390, 1440]:
                await page.set_viewport_size({"width": width, "height": 1000})
                await page.locator(".database-scroll").evaluate("e => e.scrollLeft = e.scrollWidth")
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
                assert await record.locator(".database-name").is_visible()
                row_copy_bounds = await record.locator("[data-copy-row]").bounding_box()
                path_copy_bounds = await record.locator("[data-copy-path]").bounding_box()
                assert abs(row_copy_bounds["y"] - path_copy_bounds["y"]) < 1
                assert path_copy_bounds["x"] >= row_copy_bounds["x"] + row_copy_bounds["width"]
                backup_bounds = await record.locator("[data-backup-details]").bounding_box()
                assert abs(backup_bounds["y"] - path_copy_bounds["y"]) < 1
                assert backup_bounds["x"] >= path_copy_bounds["x"] + path_copy_bounds["width"]
                cell_bounds = await record.locator("td").first.bounding_box()
                assert path_copy_bounds["x"] + path_copy_bounds["width"] <= cell_bounds["x"] + cell_bounds["width"]
                await page.screenshot(path=root / "_scratch" / f"spreadsheet-details-{width}.png", full_page=True)
            await page.locator(".database-scroll").evaluate("e => e.scrollLeft = 0")
            for query in [notes["displayName"], notes["name"]]:
                await page.locator("#search").fill(query)
                assert notes["id"] in await ids()
            await page.locator("#search").fill("")
            await show_columns([])
            await saved_columns(["backupOverview"])
            assert await ids() == expected
            assert await page.locator("#head [data-column-key]").evaluate_all("nodes => nodes.map(n => n.dataset.columnKey)") == ["name", "purpose", "backupOverview"]
            await show_columns(["engine"])
            await page.reload()
            await page.wait_for_selector('#head [data-column-key="engine"]', timeout=60000)
            assert await page.locator('[data-database-view]').count() == 0
            assert await ids() == expected
            await show_columns([])
            await show_columns(["remarks"])
            await clear()
            old_filter = json.dumps({"filters": {"name": ["notepad.db"]}}, separators=(",", ":"))
            await page.goto(private + "/#list?tab=databases&columns=" + quote(old_filter))
            await page.wait_for_selector("#rows .database-name", timeout=60000)
            assert set(await ids()) == {row["id"] for row in by_id.values() if row["name"] == "notepad.db"}
            await clear()
            await show_columns(["component"])
            dashboard = next(row for row in orin if row["name"] == "karma.sqlite")
            for width in [1440, 390]:
                await page.set_viewport_size({"width": width, "height": 1000})
                await choose_only("component", "Agent Dashboard")
                assert await ids() == [dashboard["id"]]
                component = page.locator('#rows [data-label="Used by"]')
                await component.locator("button").click()
                assert await page.locator("#detail-title").inner_text() == "orin-hermes-dashboard"
                await page.locator("#detail #close").click()
                await clear()
            await show_columns([])
            await page.set_viewport_size({"width": 1440, "height": 1000})
            checks.append("Spreadsheet columns, fixed names, no row navigation, exact remarks, copy metadata, saved choices and order, compact locked widths, search and filters work at 320–1440px")

            for width in [1440, 390]:
                await page.set_viewport_size({"width": width, "height": 844})
                await page.wait_for_timeout(150)
                await open_column("owner")
                await page.locator('#column-menu input[type="search"]').fill("orin")
                shown = page.locator("#column-menu [data-value-index]:visible")
                assert await shown.count() == 1
                expected = sum(int(value) for value in await shown.locator("small").all_text_contents())
                assert await page.locator("#column-menu [data-selection]").inner_text() == "1 of 1 shown selected"
                assert await page.locator("#column-menu [data-apply]").inner_text() == f"Show {expected} results"
                await page.locator("#column-menu [data-none]").click()
                assert await page.locator("#column-menu [data-apply]").inner_text() == "Show 0 results"
                await page.locator("#column-menu [data-all]").click()
                await page.locator("#column-menu [data-apply]").click()
                matching = await ids()
                assert len(matching) == expected
                assert await page.locator("#rows .database-owner").evaluate_all("nodes => nodes.every(n => n.textContent.toLowerCase().includes('orin'))")
                assert "orin" in (await page.locator('[data-column-remove="owner"]').inner_text()).lower()
                await page.reload()
                await page.wait_for_selector("#rows .database-name", timeout=60000)
                assert set(await ids()) == set(matching)
                await clear()
                await open_column("owner")
                search = page.locator('#column-menu input[type="search"]')
                await search.fill("orin")
                await search.fill("")
                assert await page.locator("#column-menu [data-apply]").inner_text() == f"Show {len(initial)} results"
                await search.fill("no-such-owner")
                assert await page.locator("#column-menu [data-apply]").inner_text() == "Show 0 results"
                await page.locator("#column-menu [data-cancel]").click()
                assert len(await ids()) == len(initial)
            await page.set_viewport_size({"width": 1440, "height": 1000})
            checks.append("Searching owners previews and applies both Orin matches only; shown selection, clearing search, no matches, Cancel and reload agree on desktop/mobile")

            copies = [copy for row in inventory["databases"] for copy in row.get("backupCopies", []) if copy.get("id")]
            assert not set(initial).intersection(copy["id"] for copy in copies if not by_id.get(copy["id"], {}).get("backupOnly"))
            backed = next(row for row in inventory["databases"] if row.get("backupCopies") and not row.get("backupOnly"))
            record = page.locator("#rows tr").filter(has=page.locator('[data-entity="' + backed["id"] + '"]'))
            await show_columns(["remarks"])
            assert await record.locator(".database-actions [data-copy-path]").get_attribute("data-copy-path") == backed["path"]
            assert await record.locator(".database-actions [data-copy-path] + [data-backup-details]").count() == 1
            assert await page.locator('[data-field="copies"], [data-column-key="copies"], [data-database-column="copies"]').count() == 0
            before_backup_url = page.url
            backup_trigger = record.locator("[data-backup-details]").last
            await backup_trigger.click()
            backup_dialog = page.locator("#backup-dialog")
            assert await backup_dialog.is_visible()
            for copy in backed["backupCopies"]:
                assert copy["path"] in await backup_dialog.inner_text()
                assert copy["association"] in await backup_dialog.inner_text()
                assert "Created by: " + copy["createdBy"] in await backup_dialog.inner_text()
            assert await backup_dialog.locator(".database-copy-list li").count() == len(backed["backupCopies"])
            await page.keyboard.press("Escape")
            assert await backup_trigger.evaluate("e => e === document.activeElement")
            assert page.url == before_backup_url
            await page.evaluate("Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async value => {window.copiedPath = value}}})")
            await record.get_by_role("button", name="Copy source database path", exact=True).click()
            assert await page.evaluate("window.copiedPath") == backed["path"]
            copy_row = record.locator("[data-copy-row]")
            await copy_row.click()
            copied = await page.evaluate("window.copiedPath")
            assert all(copy["path"] in copied and copy["association"] in copied for copy in backed["backupCopies"])
            assert "Observed:" in copied and "SGT" in copied
            assert "Backed up by: " + backed["backedUpBy"] in copied
            assert "Remarks: " + (backed.get("remarks") or "—") in copied
            assert "Local copies do not establish off-host protection" in copied
            await page.set_viewport_size({"width": 390, "height": 700})
            assert (await copy_row.bounding_box())["height"] >= 44
            assert (await backup_trigger.bounding_box())["height"] >= 44
            await backup_trigger.click()
            assert await backup_dialog.is_visible()
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            await page.locator("#close-backup").click()
            assert await backup_trigger.evaluate("e => e === document.activeElement")
            await page.evaluate("() => {navigator.clipboard.writeText = async () => {throw new Error('denied')}}")
            await copy_row.click()
            assert await page.locator("#copy-row-dialog").is_visible()
            assert await page.locator("#copy-row-text").input_value() == copied
            await page.keyboard.press("Escape")
            assert await copy_row.evaluate("e => e === document.activeElement")
            await page.evaluate("() => {navigator.clipboard.writeText = async value => {window.copiedPath = value}}")
            await page.set_viewport_size({"width": 1440, "height": 1000})
            retained = next((row for row in inventory["databases"] if row.get("backupOnly")), None)
            if retained:
                retained_row = page.locator('[data-database-row="' + retained["id"] + '"]')
                assert "source unconfirmed" in await retained_row.inner_text()
                assert "original source unconfirmed" in await retained_row.locator(".database-actions [data-copy-path]").get_attribute("aria-label")
                assert not await retained_row.get_by_role("button", name="Copy source database path", exact=True).count()
                assert await retained_row.locator("[data-backup-details]").count() == 1
                await retained_row.locator("[data-copy-row]").click()
                assert "Source path:" not in await page.evaluate("window.copiedPath")
            else:
                skipped.append("Retained-only backup copy checks: no such records in the live inventory")
            unknown = next(row for row in inventory["databases"] if not row.get("backupCopies"))
            unknown_row = page.locator('[data-database-row="' + unknown["id"] + '"]')
            assert await unknown_row.locator("[data-backup-details]").count() == 1
            await unknown_row.locator("[data-backup-details]").click()
            assert "does not confirm that backups are missing" in await page.locator("#backup-dialog").inner_text()
            await page.locator("#close-backup").click()
            await show_columns([])
            checks.append("Table preserves source/copy paths, creator/association/date evidence, unknown limits, copy actions and clipboard fallback")
            await open_column("backupCount")
            assert await page.locator("#column-menu-title").inner_text() == "Backup count"
            await page.keyboard.press("Escape")
            counts = sorted(set(len(row.get("backupCopies", [])) for row in by_id.values()))
            assert 0 in counts and max(counts) > 1
            for count in [0, max(counts)]:
                await choose_only("backupCount", f'{count} ' + ("copy" if count == 1 else "copies"))
                matching = await ids()
                assert matching and all(len(by_id[id].get("backupCopies", [])) == count for id in matching)
                await page.reload()
                await page.wait_for_selector("#rows .database-name", timeout=60000)
                assert set(await ids()) == set(matching)
                await clear()
            for direction in ["asc", "desc"]:
                await open_column("backupCount")
                await page.locator(f'#column-menu [data-sort="{direction}"]').click()
                assert await page.locator("#column-menu").is_visible()
                await page.locator("#column-menu [data-apply]").click()
                actual = [len(by_id[id].get("backupCopies", [])) for id in await ids()]
                groups = await grouped_ids()
                leaders = [len(by_id[group[0]].get("backupCopies", [])) for group in groups]
                assert leaders == sorted(leaders, reverse=direction == "desc")
                for group in groups:
                    actual = [len(by_id[id].get("backupCopies", [])) for id in group]
                    assert actual == sorted(actual, reverse=direction == "desc")
                assert "Backup count" in await page.locator("[data-columns-summary]").inner_text()
            await clear()
            await page.set_viewport_size({"width": 390, "height": 700})
            await choose_only("backupCount", "0 copies")
            await choose_only("category", "PAL")
            assert await ids()
            assert all(not by_id[id].get("backupCopies") and by_id[id]["ownership"]["category"] == "PAL" for id in await ids())
            assert "Backup count: 0 copies" in await page.locator("[data-columns-summary]").inner_text()
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            await clear()
            await page.set_viewport_size({"width": 1440, "height": 1000})
            assert await page.locator("#head th").count() == 3
            checks.append("Backup count filters include zero, persist on reload, intersect with ownership, sort numerically and open from backup header or mobile chooser")
            for direction in ["desc", "asc"]:
                await open_column("size")
                await page.locator(f'#column-menu [data-sort="{direction}"]').click()
                assert await page.locator("#column-menu").is_visible()
                await page.locator("#column-menu [data-apply]").click()
                values = [by_id[id]["bytes"] + by_id[id]["walBytes"] for id in await ids()]
                groups = await grouped_ids()
                leaders = [by_id[group[0]]["bytes"] + by_id[group[0]]["walBytes"] for group in groups]
                assert leaders == sorted(leaders, reverse=direction == "desc")
                for group in groups:
                    values = [by_id[id]["bytes"] + by_id[id]["walBytes"] for id in group]
                    assert values == sorted(values, reverse=direction == "desc")
                assert await page.locator('#head th[aria-sort="' + ("descending" if direction == "desc" else "ascending") + '"]').count() == 1
                assert await page.locator("#sort").input_value() == "column"
            await page.reload()
            await page.wait_for_selector("#rows .database-name", timeout=60000)
            assert await page.locator('#head th[aria-sort="ascending"]').count() == 1
            await open_column("name")
            await page.locator('#column-menu [data-sort="desc"]').click()
            await page.locator("#column-menu [data-apply]").click()
            assert await page.locator('#head th[aria-sort="ascending"]').count() == 0
            await clear()
            checks.append("Raw size sorting in both directions, header state and reload")

            await choose_only("category", "PAL")
            pal_ids = await ids()
            assert pal_ids and all(by_id[id]["ownership"]["category"] == "PAL" for id in pal_ids)
            await choose_only("subcategory", "AGENT")
            assert all(by_id[id]["ownership"]["subcategory"] == "AGENT" for id in await ids())
            await page.reload()
            await page.wait_for_selector("#rows .database-name", timeout=60000)
            assert all(by_id[id]["ownership"]["category"] == "PAL" and by_id[id]["ownership"]["subcategory"] == "AGENT" for id in await ids())
            await page.locator("#refresh").click()
            await page.wait_for_function('!document.querySelector("#refresh").disabled', timeout=60000)
            assert all(by_id[id]["ownership"]["subcategory"] == "AGENT" for id in await ids())
            await open_column("category")
            await page.locator('#column-menu input[type="search"]').fill("no-such-value")
            assert await page.locator("#column-menu [data-no-values]").is_visible()
            await page.keyboard.press("Escape")
            assert not await page.locator("#column-menu").is_visible()
            assert await page.locator('[data-columns-open]:visible').evaluate("e=>e===document.activeElement")
            await open_column("category")
            await page.locator("#column-menu [data-none]").click()
            await page.locator("#column-menu [data-cancel]").click()
            assert await ids()
            await open_column("category")
            await page.locator("#column-menu [data-none]").click()
            await page.locator("#column-menu [data-apply]").click()
            assert not await ids()
            assert "No matching records" in await page.locator("#rows").inner_text()
            await open_column("category")
            await page.locator("#column-menu [data-clear]").click()
            assert await ids()
            await clear()
            assert len(await ids()) == len(initial)
            checks.append("Compound filters, refresh/reload, searchable values, Escape focus, cancel, empty selection and clearing")

            for section, key in [("apps", "category"), ("agents", "runtime"), ("services", "status"), ("workflows", "lastRun"), ("issues", "severity")]:
                await page.locator(f'#tabs [data-tab="{section}"]').click()
                await open_column(key)
                checkboxes = page.locator('#column-menu input[type="checkbox"]')
                choices = await checkboxes.count()
                if choices:
                    await page.locator("#column-menu [data-none]").click()
                    await checkboxes.first.check()
                    await page.locator("#column-menu [data-apply]").click()
                    assert await page.locator("#rows tr").count() > 0
                    if choices > 1:
                        assert await page.locator("[data-columns-summary]").is_visible()
                    await clear()
                else:
                    await page.keyboard.press("Escape")
                checks.append(section + " has working field menus")
            await page.locator('#tabs [data-tab="databases"]').click()
            for width in [320, 390, 768, 1440]:
                await page.set_viewport_size({"width": width, "height": 844})
                await page.locator("[data-columns-open]:visible").wait_for()
                search_box, launcher_box, columns_box = await page.evaluate("""() => [
                    document.querySelector('#search'),
                    [...document.querySelectorAll('[data-columns-open]')].find(e => e.checkVisibility()),
                    document.querySelector('#database-groups-toggle')
                ].map(e => e.getBoundingClientRect().toJSON())""")
                assert abs(columns_box["y"] - launcher_box["y"]) < 2
                assert columns_box["x"] >= launcher_box["x"] + launcher_box["width"]
                assert columns_box["x"] + columns_box["width"] <= width
                if width <= 600:
                    assert launcher_box["y"] >= search_box["y"] + search_box["height"]
                else:
                    assert abs(search_box["y"] + search_box["height"] - launcher_box["y"] - launcher_box["height"]) < 2
                await page.locator("[data-columns-open]:visible").click()
                if width == 1440:
                    fields = page.locator("#column-menu [data-field]")
                    first = await fields.nth(0).bounding_box()
                    second = await fields.nth(1).bounding_box()
                    assert first["y"] == second["y"] and second["x"] > first["x"]
                    await page.screenshot(path=str(root / "_scratch/filter-fields-desktop.png"))
                await page.keyboard.press("Escape")
                await open_column("owner")
                bounds = await page.locator("#column-menu").bounding_box()
                assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= width + 1
                assert bounds["y"] >= 0 and bounds["y"] + bounds["height"] <= 845
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                if width in [390, 1440]:
                    await page.screenshot(path=str(root / f"_scratch/column-menu-{width}.png"))
                await page.keyboard.press("Escape")
            checks.append("Header menus and mobile field buttons fit 320/390/768/1440px")

            await clear()
            before_cancel = await ids()
            await open_column("owner")
            await page.locator('#column-menu [data-sort="desc"]').click()
            assert await page.locator('#column-menu [data-sort="desc"]').get_attribute("aria-pressed") == "true"
            await page.locator("#column-menu [data-cancel]").click()
            assert await ids() == before_cancel
            assert not await page.locator("[data-columns-summary]").is_visible()
            checks.append("Sort choices stay pending until applied; Cancel preserves rows and saved state")

            await page.set_viewport_size({"width": 390, "height": 844})
            await clear()
            assert await page.locator("[data-columns-open]:visible").count() == 1
            assert not await page.locator("[data-columns-toolbar] [data-column-key]").count()
            await page.locator("[data-columns-open]").click()
            assert await page.locator("#column-menu [data-field]").count() == 13
            assert await page.locator('#column-menu [data-field="backedUpBy"]').count() == 1
            assert await page.locator("#column-menu").evaluate("e => e.matches(':modal')")
            await page.screenshot(path=str(root / "_scratch/filter-fields-mobile.png"))
            await page.locator('#column-menu [data-field="category"]').click()
            assert await page.locator("#column-menu [data-close]").evaluate("e => e === document.activeElement")
            await page.locator("#column-menu").get_by_role("button", name="Only PAL", exact=True).click()
            preview = await page.locator("#column-menu [data-apply]").inner_text()
            expected = sum((row.get("ownership") or {}).get("category") == "PAL" for row in by_id.values())
            assert preview == f"Show {expected} results"
            await page.screenshot(path=str(root / "_scratch/filter-category-mobile.png"))
            await page.locator("#column-menu [data-apply]").click()
            assert len(await ids()) == expected
            chip = page.locator('[data-column-remove="category"]')
            assert "PAL" in await chip.inner_text()
            assert await page.locator("[data-columns-open]").evaluate("e => e === document.activeElement")
            await page.reload()
            await page.wait_for_selector('[data-column-remove="category"]')
            await page.locator('[data-column-remove="category"]').click()
            assert len(await ids()) == len(initial)
            await open_column("category")
            await page.locator('#column-menu input[type="search"]').fill("PAL")
            await page.locator("#column-menu [data-none]").click()
            visible = page.locator("#column-menu [data-value-index]:visible")
            assert await visible.count() == 1
            assert not await visible.get_by_role("checkbox").is_checked()
            assert await page.locator('#column-menu input[type="checkbox"]:checked').count() > 0
            await page.keyboard.press("Escape")
            assert not await page.locator("[data-columns-summary]").is_visible()
            await open_column("owner")
            for height in [500, 380]:
                await page.set_viewport_size({"width": 390, "height": height})
                await page.wait_for_timeout(100)
                footer = await page.locator("#column-menu [data-apply]").bounding_box()
                assert footer["y"] >= 0 and footer["y"] + footer["height"] <= height
                assert await page.locator("#column-menu").evaluate("e => e.scrollWidth <= e.clientWidth + 1")
            await page.keyboard.press("Escape")
            await page.set_viewport_size({"width": 390, "height": 844})
            await page.screenshot(path=str(root / "_scratch/filter-compact-mobile.png"))
            checks.append("Compact launcher, modal field chooser, Only shortcut, preview count, chip removal/reload, search-scoped selection, mobile focus and short viewports")

            await page.set_viewport_size({"width": 1440, "height": 1000})
            requests.clear()
            await page.goto(public + "/#list")
            await page.wait_for_selector('[data-columns-open]')
            assert not await page.locator(".catalogue__filters").is_visible()
            assert not await page.locator(".directory-options:visible").count()
            assert await page.locator("#search").is_visible()
            await choose_only("category", "GOZ")
            cards = page.locator("[data-list-card]:visible")
            assert await cards.count() > 0
            assert await cards.evaluate_all("cards => cards.every(c=>c.dataset.ownershipCategory==='GOZ')")
            await open_column("name")
            await page.locator('#column-menu [data-sort="desc"]').click()
            await page.locator("#column-menu [data-apply]").click()
            await page.reload()
            await page.wait_for_selector("[data-list-card]:visible")
            assert await cards.evaluate_all("cards => cards.every(c=>c.dataset.ownershipCategory==='GOZ')")
            assert await page.locator("#directory-sort").input_value() == "column"
            await clear()
            await open_column("name")
            await page.locator('#column-menu [data-sort="asc"]').click()
            await page.locator("#column-menu [data-apply]").click()
            await open_column("author")
            await page.keyboard.press("Escape")
            await page.locator('[data-directory-kind="agent"]').click()
            await open_column("access")
            await page.keyboard.press("Escape")
            assert not any("/operations/" in url for url in requests)
            response = await page.request.get(public + "/operations/api/inventory")
            assert response.status == 404
            checks.append("Public catalogue and Agents menus, filters and sorting persist without exposing inventory")
            assert not errors, errors
            await browser.close()
        print(json.dumps({"checks": checks, "skipped": skipped, "pageErrors": errors}, indent=2))
    finally:
        if fixture:
            fixture.terminate()
            fixture.wait(timeout=10)

asyncio.run(main())
