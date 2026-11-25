import asyncio
import json
import os
import subprocess
from pathlib import Path
from urllib.parse import quote

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
            assert await page.locator("#head th").count() == 4
            assert await page.locator('#head [data-column-key="remarks"]').count() == 0
            assert await page.locator('#head [data-column-key="component"]').count() == 1
            orin = [row for row in by_id.values() if row.get("owner") == "agent:orin"]
            assert len(orin) == 7
            for width in [1440, 390]:
                await page.set_viewport_size({"width": width, "height": 1000})
                for row in orin:
                    record = page.locator("#rows tr").filter(has=page.locator('.database-name[data-entity="' + row["id"] + '"]'))
                    assert await record.locator(".database-name").inner_text() == row["displayName"]
                    assert await record.locator(".database-filename").inner_text() == row["name"]
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
                notes = next(row for row in orin if row["name"] == "notepad.db")
                for query in [notes["displayName"], notes["name"]]:
                    await page.locator("#search").fill(query)
                    assert notes["id"] in await ids()
                await page.locator("#search").fill("")
                await choose_only("name", notes["displayName"])
                assert await ids() == [notes["id"]]
                await page.reload()
                await page.wait_for_selector("#rows .database-name", timeout=60000)
                assert await ids() == [notes["id"]]
                await page.locator("#rows .database-name").click()
                details = page.locator("#detail.database-panel")
                assert await details.is_visible()
                assert notes["path"] in await details.inner_text()
                assert await page.locator("#rows .database-record.is-selected").count() == 1
                assert not await page.locator("#rows [data-db-toggle], #rows .database-detail-row").count()
                assert await page.locator("#detail-title").inner_text() == notes["displayName"]
                assert notes["name"] in await details.inner_text()
                await page.evaluate("Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async value => {window.copiedRow = value}}})")
                await details.locator("[data-copy-row]").click()
                copied = await page.evaluate("window.copiedRow")
                assert "Database: " + notes["displayName"] in copied
                assert "Filename: " + notes["name"] in copied
                await page.locator("#close").click()
                await clear()
            await choose_only("owner", "Orin Forgekeeper")
            assert await page.locator("#rows .database-group").count() == 1
            assert await page.locator("#rows .database-group-count").inner_text() == "7 databases"
            for width in [320, 390, 1440]:
                await page.set_viewport_size({"width": width, "height": 1000})
                assert await page.locator("#rows .database-detail-row").count() == 0
                assert await page.locator("#rows .database-record td").count() == 28
                assert await page.locator("#rows .database-purpose:visible").count() == 7
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
                await page.screenshot(path=root / "_scratch" / f"compact-databases-{width}.png", full_page=True)
                original_url = page.url
                table_width = await page.locator(".database-table").evaluate("e => e.getBoundingClientRect().width")
                first = page.locator("#rows .database-name").first
                await first.focus()
                await page.keyboard.press("Enter")
                panel = page.locator("#detail.database-panel")
                assert await panel.is_visible()
                assert await panel.evaluate("e => e.matches(':modal')")
                assert abs(await page.locator(".database-table").evaluate("e => e.getBoundingClientRect().width") - table_width) < 2
                assert await page.locator("#rows .database-record.is-selected").count() == 1
                assert await panel.evaluate("e => e.scrollWidth <= e.clientWidth + 1")
                if width < 600:
                    assert await panel.evaluate("e => Math.abs(e.getBoundingClientRect().width - innerWidth) < 2")
                else:
                    assert await panel.evaluate("e => e.getBoundingClientRect().width > 900 && Math.abs(e.getBoundingClientRect().left + e.getBoundingClientRect().width / 2 - innerWidth / 2) < 2")
                await page.screenshot(path=root / "_scratch" / f"database-panel-{width}.png")
                if width > 1000:
                    await page.locator("#close").click()
                    await page.locator("#rows .database-name").nth(1).click()
                    assert await page.locator("#detail-title").inner_text() == await page.locator("#rows .database-name").nth(1).inner_text()
                    await page.locator("#refresh").evaluate("e => e.click()")
                    await page.wait_for_function("!document.querySelector('#refresh').disabled", timeout=60000)
                    assert await panel.is_visible()
                selected_url = page.url
                await page.reload()
                await page.wait_for_selector("#detail.database-panel[open]", timeout=60000)
                assert page.url == selected_url
                await page.keyboard.press("Escape")
                assert not await panel.is_visible()
                await page.wait_for_function("!new URLSearchParams(location.hash.split('?')[1]).has('entity')")
                assert page.url == original_url, (page.url, original_url)
                assert await page.locator("#rows .database-record.is-selected").count() == 0
            await clear()
            await page.set_viewport_size({"width": 1440, "height": 1000})
            checks.append("Purpose stays visible; centred modal/full-screen details preserve table width, selection, refresh, reload and filters at 320–1440px")
            old_filter = json.dumps({"filters": {"name": ["notepad.db"]}}, separators=(",", ":"))
            await page.goto(private + "/#list?tab=databases&columns=" + quote(old_filter))
            await page.wait_for_selector("#rows .database-name", timeout=60000)
            assert set(await ids()) == {row["id"] for row in by_id.values() if row["name"] == "notepad.db"}
            await clear()
            checks.append("Orin purpose names preserve filenames, search, saved filters, details and copied rows on desktop/mobile")
            dashboard = next(row for row in orin if row["name"] == "karma.sqlite")
            assert dashboard["component"] == "Agent dashboard"
            assert dashboard["componentEntity"] == "service:orin-hermes-dashboard"
            assert all(row["component"] == "Agent runtime" for row in orin if row != dashboard)
            for width in [1440, 390]:
                await page.set_viewport_size({"width": width, "height": 1000})
                await choose_only("component", "Agent dashboard")
                assert await ids() == [dashboard["id"]]
                component = page.locator('#rows [data-label="Component"]')
                assert await component.inner_text() == "Agent dashboard"
                await component.locator("button").click()
                assert await page.locator("#detail-title").inner_text() == "orin-hermes-dashboard"
                await page.locator("#detail #close").click()
                await page.locator('#tabs [data-tab="databases"]').click()
                await clear()
            checks.append("Orin owner is unified; component filters and dashboard service links work on desktop/mobile")
            hermes_notes = [row for row in by_id.values() if row.get("remarks", "").startswith("Created by Hermes framework.")]
            assert hermes_notes
            for row in hermes_notes:
                note_row = page.locator("#rows tr").filter(has=page.locator('[data-entity="' + row["id"] + '"]'))
                assert await note_row.locator(".database-purpose").text_content() == row["remarks"].removeprefix("Created by Hermes framework.").strip()
            note = next(row for row in hermes_notes if row["path"].endswith("/orin/cron/notepad.db"))
            for width in [320, 390, 1440]:
                await page.set_viewport_size({"width": width, "height": 1000})
                note_row = page.locator("#rows .database-record").filter(has=page.locator('[data-entity="' + note["id"] + '"]'))
                await note_row.locator(".database-name").click()
                assert await page.locator("#detail .database-remarks").text_content() == note["remarks"]
                assert await page.locator("#detail .database-remarks strong").inner_text() == "Created by Hermes framework."
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
                await page.locator("#detail").screenshot(path=root / "_scratch" / f"database-remarks-{width}.png")
                await page.locator("#close").click()
            await page.set_viewport_size({"width": 1440, "height": 1000})
            await choose_only("remarks", note["remarks"])
            assert all(by_id[id].get("remarks") == note["remarks"] for id in await ids())
            await clear()
            checks.append("Hermes remarks show exact purposes, filter by note and fit desktop/mobile")

            for width in [1440, 390]:
                await page.set_viewport_size({"width": width, "height": 844})
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
            height = (await record.bounding_box())["height"]
            trigger = record.locator(".database-name")
            await trigger.click()
            dialog = page.locator("#detail.database-panel")
            record_details = dialog
            assert await dialog.is_visible()
            assert backed["path"] in await dialog.inner_text()
            assert backed["backupCopies"][0]["path"] in await dialog.inner_text()
            assert "Backed up by: " + backed["backedUpBy"] in await record_details.inner_text()
            assert "Backed up by: " + backed["backedUpBy"] in await dialog.inner_text()
            backup_text = await dialog.inner_text()
            assert all("Created by: " + copy["createdBy"] in backup_text for copy in backed["backupCopies"])
            assert await dialog.locator(".backup-copies li").count() == len(backed["backupCopies"])
            await page.evaluate("window.copiedPath = null; Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async value => {window.copiedPath = value}}})")
            await dialog.get_by_role("button", name="Copy source database path", exact=True).click()
            assert await page.evaluate("window.copiedPath") == backed["path"]
            assert await dialog.get_by_role("button", name="Copy source database path", exact=True).inner_text() == "Copied"
            await dialog.locator("[data-copy-row]").click()
            copied = await page.evaluate("window.copiedPath")
            assert backed["path"] in copied and backed["name"] in copied
            assert "Observed:" in copied and "SGT" in copied
            assert "Category:" in copied and "Sub-category:" in copied
            assert "Backed up by: " + backed["backedUpBy"] in copied
            assert "Remarks: " + (backed.get("remarks") or "—") in copied
            assert "Component: " + (backed.get("component") or "Not confirmed") in copied
            assert all("Created by: " + copy["createdBy"] in copied for copy in backed["backupCopies"])
            assert f'Backup copies: {len(backed["backupCopies"])}' in copied
            assert all(copy["path"] in copied and copy["association"] in copied for copy in backed["backupCopies"])
            assert "Local copies do not establish off-host protection" in copied

            for width in [320, 390, 768, 1440]:
                await page.set_viewport_size({"width": width, "height": 1000})
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
                assert await dialog.evaluate("e => e.scrollWidth <= e.clientWidth + 1")
                await dialog.screenshot(path=root / "_scratch" / f"backup-dialog-{width}.png")
            await page.keyboard.press("Escape")
            assert not await dialog.is_visible()
            assert await trigger.evaluate("e => e === document.activeElement")
            copy_row = record.locator("[data-copy-row]")
            await copy_row.click()
            assert await page.evaluate("window.copiedPath") == copied
            assert "Copied" == await copy_row.inner_text()
            assert not await page.locator("#detail").is_visible()
            await page.set_viewport_size({"width": 390, "height": 700})
            assert (await copy_row.bounding_box())["height"] >= 44
            await page.evaluate("() => {navigator.clipboard.writeText = async () => {throw new Error('denied')}}")
            await copy_row.click()
            fallback = page.locator("#copy-row-dialog")
            assert await fallback.is_visible()
            assert await page.locator("#copy-row-text").input_value() == copied
            assert await page.locator("#copy-row-text").evaluate("e => e.selectionEnd === e.value.length && e.selectionStart === 0")
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            await page.keyboard.press("Escape")
            assert await copy_row.evaluate("e => e === document.activeElement")
            await page.evaluate("() => {navigator.clipboard.writeText = async value => {window.copiedPath = value}}")
            await page.set_viewport_size({"width": 1440, "height": 1000})
            checks.append("Database row context copies full metadata on desktop/mobile; clipboard denial provides selected text and restores focus")

            retained = next(row for row in inventory["databases"] if row.get("backupOnly"))
            await page.locator('.database-name[data-entity="' + retained["id"] + '"]').click()
            assert "original database has not been confirmed" in await dialog.inner_text()
            assert not await dialog.get_by_role("button", name="Copy source database path", exact=True).count()
            assert await dialog.locator(".backup-copies li").count() == len(retained["backupCopies"])
            await dialog.locator("[data-copy-row]").click()
            retained_text = await page.evaluate("window.copiedPath")
            assert "original source unconfirmed" in retained_text
            assert "Source path:" not in retained_text

            await dialog.locator("#close").click()
            unknown = next(row for row in inventory["databases"] if not row.get("backupCopies"))
            await page.locator('.database-name[data-entity="' + unknown["id"] + '"]').click()
            assert "does not confirm that backups are missing" in await dialog.inner_text()
            await dialog.locator("[data-copy-row]").click()
            assert "No backup location recorded; this does not confirm backups are missing." in await page.evaluate("window.copiedPath")

            await page.keyboard.press("Escape")
            checks.append("Backup dialog preserves source/copy paths, retained/unknown evidence, compact rows, copy action, Escape focus and 320–1440px layouts")
            await open_column("backup")
            await page.locator('#column-menu [data-related-field="backupCount"]').click()
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
                assert await page.locator('#head [data-column-key="backup"]').evaluate("e => e.closest('th').getAttribute('aria-sort')") == ("ascending" if direction == "asc" else "descending")
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
            assert await page.locator("#head th").count() == 4
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
                search_box = await page.locator("#search").bounding_box()
                launcher_box = await page.locator("[data-columns-open]:visible").bounding_box()
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
            assert await page.locator("#column-menu [data-field]").count() == 11
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
        print(json.dumps({"checks": checks, "pageErrors": errors}, indent=2))
    finally:
        if fixture:
            fixture.terminate()
            fixture.wait(timeout=10)

asyncio.run(main())
