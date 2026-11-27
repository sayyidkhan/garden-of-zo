import asyncio
import json
import os
import subprocess
from pathlib import Path

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
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
            page = await browser.new_page(viewport={"width": 1440, "height": 1000})
            errors = []
            requested = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("request", lambda request: requested.append(request.url))
            async def open_column(key):
                direct = page.locator(f'[data-column-key="{key}"]:visible')
                if await direct.count():
                    await direct.click()
                else:
                    await page.locator("[data-columns-open]:visible").click()
                    await page.locator(f'#column-menu [data-field="{key}"]').click()
                await page.locator("#column-menu").wait_for(state="visible")

            async def grouped_ids():
                return await page.locator("#rows").evaluate("""body => {
                    const groups = [];
                    for (const row of body.children) {
                        if (row.classList.contains("database-group")) groups.push([]);
                        if (row.dataset.databaseRow) groups.at(-1).push(row.dataset.databaseRow);
                    }
                    return groups;
                }""")
            async def column_choice(key, value):
                await open_column(key)
                await page.locator("#column-menu [data-none]").click()
                await page.locator("#column-menu").get_by_role("checkbox", name=value, exact=False).check()
                await page.locator("#column-menu [data-apply]").click()

            async def column_sort(key, direction):
                await open_column(key)
                await page.locator(f'#column-menu [data-sort="{direction}"]').click()
                await page.locator("#column-menu [data-apply]").click()

            async def choose_label(control, value):
                await control.fill(value)
                await control.press("Enter")

            await page.route("**/garden-client.js?v=unified-list-2", lambda route: route.fulfill(
                status=200, content_type="text/javascript",
                body="throw new Error('Cached pre-legend script was reused')"))
            async def check_label_legend():
                original_viewport = page.viewport_size
                original_url = page.url
                for width in [320, 390, 1440]:
                    await page.set_viewport_size({"width": width, "height": 844})
                    trigger = page.get_by_role("button", name="Label legend", exact=True)
                    await trigger.click()
                    dialog = page.get_by_role("dialog", name="Label legend", exact=True)
                    assert await dialog.is_visible()
                    assert await dialog.locator(".label-legend__categories dt").count() == 6
                    assert "Garden of Zo projects" in await dialog.inner_text()
                    assert "a label has not been assigned" in await dialog.inner_text()
                    assert "Proposed" not in await dialog.inner_text()
                    assert await dialog.evaluate("e => e.scrollWidth <= e.clientWidth")
                    bounds = await dialog.bounding_box()
                    assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= width
                    body = dialog.get_by_role("region", name="Label definitions")
                    assert await dialog.get_by_role("tab").count() == 0
                    expected_roles = {
                        "PAL": ["PRODUCT", "AGENT", "WORKFLOW", "SKILL", "PLATFORM", "GOVERNANCE", "LEGACY"],
                        "GOZ": ["PLATFORM", "INFRASTRUCTURE", "APP", "MONITORING", "WEBSITE", "AGENT"],
                        "GITHUB": ["APP", "WEBSITE"], "GR": ["MAIL"], "PERSONAL": ["APP"],
                        "STAKEFOLIO": ["PRODUCT", "GOVERNANCE"]
                    }
                    for category, roles in expected_roles.items():
                        group = dialog.locator(f'[data-legend-category="{category}"]')
                        assert await group.locator(".label-legend__roles dt").all_text_contents() == roles
                        assert await group.locator(".label-legend__roles").evaluate("e => e.getBoundingClientRect().top > e.previousElementSibling.getBoundingClientRect().bottom")
                    await body.evaluate("e => e.scrollTop = e.scrollHeight")
                    assert await body.evaluate("e => e.scrollWidth <= e.clientWidth")
                    assert await dialog.locator(".label-legend__note").evaluate("e => e.getBoundingClientRect().bottom <= innerHeight")
                    assert await dialog.get_by_role("button", name="Close", exact=True).evaluate("e => { const r=e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }")
                    await body.focus()
                    await page.keyboard.press("Home")
                    await page.keyboard.press("Escape")
                    assert not await dialog.is_visible()
                    assert await trigger.evaluate("e => e === document.activeElement")
                    await page.keyboard.press("Enter")
                    assert await dialog.is_visible()
                    await dialog.get_by_role("button", name="Close", exact=True).click()
                    assert not await dialog.is_visible()
                    assert page.url == original_url
                await page.set_viewport_size(original_viewport)

            await page.goto(private + "/#list")
            await page.wait_for_selector("#rows .entity", timeout=60000)
            await check_label_legend()
            checks.append("Private List legend explains all labels, fits mobile and supports keyboard close")
            assert not any("/atlas-client.js" in url for url in requested)
            checks.append("List opens without downloading the Atlas renderer")
            assert await page.locator("#inventory").is_visible()
            assert not await page.locator("#atlas-view").is_visible()
            assert await page.locator("#list-view [data-list-card]").count() == 0
            assert await page.locator("#rows a.realm-row__link--enter[href='/backlog']").count() == 1
            for width in [320, 390, 768, 1024, 1440]:
                await page.set_viewport_size({"width": width, "height": 900})
                assert await page.locator("#refresh").evaluate("e => !!e.closest('.directory-results')")
                assert not await page.locator("#updated").is_visible()
                assert await page.locator(".inventory-status").count() == 0
                trigger = page.get_by_role("button", name="Inventory info", exact=True)
                await trigger.click()
                info = page.get_by_role("dialog", name="Sources & coverage", exact=True)
                assert await info.is_visible()
                assert await info.locator("#updated").is_visible()
                assert await info.locator(".coverage-source").count() == 7
                assert "Folders checked" in await info.inner_text()
                assert "without changing your tasks, services or database contents" in await info.inner_text()
                assert await info.get_by_role("button", name="Update task list", exact=True).count() == 1
                assert await info.evaluate("e => e.scrollWidth <= e.clientWidth")
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                await page.keyboard.press("Escape")
                assert not await info.is_visible()
                assert await trigger.evaluate("e => e === document.activeElement")
                if width == 1440:
                    await trigger.press("Enter")
                    await info.get_by_role("button", name="Close inventory info").click()
                    assert not await info.is_visible()
            await page.set_viewport_size({"width": 1440, "height": 1000})
            checks.append("Header Refresh and Inventory info fit desktop/tablet/mobile; source dialog preserves timestamps, readable evidence and keyboard focus")
            checks.append("One private List with direct destination links")
            stakefolio = page.locator("#rows .inventory-realm").filter(has=page.locator("[data-entity='app:stakefolio']"))
            assert await stakefolio.locator(".project-label").inner_text() == "STAKEFOLIO | GOVERNANCE"
            mapper = page.locator("#rows .inventory-realm").filter(has=page.locator("[data-entity='app:zo-relationship-mapper']"))
            assert await mapper.locator(".project-label").inner_text() == "GOZ | APP"
            assert "Proposed" not in await page.locator("#rows").inner_text()
            checks.append("Private app labels display confirmed ownership and roles")
            for section in ["agents", "services", "workflows", "databases", "issues", "apps"]:
                await page.locator("#tabs [data-tab='" + section + "']").click()
                assert await page.locator("#rows tr").count() > 0
            checks.append("All five inventory tabs and attention findings render")
            inventory = await (await page.request.get(private + "/operations/api/inventory")).json()
            await page.locator("#tabs [data-tab='issues']").click()
            finding = page.locator(".finding").filter(has_text="unconfirmed backup status")
            warning_fixture = json.loads(json.dumps(inventory))
            affected = [row for row in warning_fixture["databases"] if row["category"] in ["application", "agent runtime"]][:3]
            expected_backup_ids = {row["id"] for row in affected}
            for row in affected:
                row["backup"] = {"status": "unknown", "lastAt": None}
            warning_fixture["issues"] = [{
                "severity": "warning", "message": str(len(affected)) + " database files have unconfirmed backup status.",
                "affected": list(expected_backup_ids),
                "reason": "Garden has no recognised evidence. This does not prove their backups are missing.",
                "nextStep": "Check the saved copies and whether they can be restored."
            }]
            async def backup_fixture(route):
                await route.fulfill(json=warning_fixture)
            await page.route("**/operations/api/inventory*", backup_fixture)
            await page.locator("#refresh").click()
            await page.wait_for_function("!document.querySelector('#refresh').disabled", timeout=60000)
            assert await finding.count() == 1
            assert "does not prove their backups are missing" in await finding.inner_text()
            assert not await page.locator("#notice").is_visible()
            assert await finding.locator(".finding-next ol li").count() == 3
            assert await finding.locator(".finding-meaning").is_visible()
            assert await finding.locator(".finding-show").is_visible()
            assert not await finding.locator(".finding-hide").is_visible()
            await finding.locator(".finding-breakdown > summary").click()
            assert await finding.locator(".finding-hide").is_visible()
            assert not await finding.locator(".finding-show").is_visible()
            for summary in await finding.locator(".finding-project > summary").all():
                await summary.click()
            actual_backup_ids = await finding.locator("li [data-entity]").evaluate_all("nodes => nodes.map(n => n.dataset.entity)")
            assert set(actual_backup_ids) == expected_backup_ids
            assert len(actual_backup_ids) == len(expected_backup_ids)
            legacy = finding.locator(".finding-project").filter(has_text="PAL OpenClaw (retained files)")
            legacy_ids = {row["id"] for row in inventory["databases"] if row["id"] in expected_backup_ids and row.get("projectName") == "PAL OpenClaw (retained files)"}
            assert await legacy.count() == (1 if legacy_ids else 0)
            if legacy_ids:
                assert await legacy.locator(".finding-project-label").inner_text() == "PAL | LEGACY"
            assert await finding.locator("h4").count() == 1
            assert await finding.locator(".finding-stats").inner_text()
            assert await finding.evaluate("e => e.getBoundingClientRect().width / e.closest('table').getBoundingClientRect().width > .95")
            expanded = await finding.locator("details[open]").count()
            await page.locator("#refresh").click()
            await page.wait_for_function("!document.querySelector('#refresh').disabled", timeout=60000)
            assert await finding.locator("details[open]").count() == expanded
            assert not any(row["owner"] == "service:tailscale" for row in inventory["databases"] if row["category"] == "agent runtime")
            for width in [320, 390, 1440]:
                await page.set_viewport_size({"width": width, "height": 900})
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                assert await page.locator("#inventory .table-wrap").evaluate("e => e.scrollWidth <= e.clientWidth")
                meaning = await finding.locator(".finding-meaning").bounding_box()
                next_steps = await finding.locator(".finding-next").bounding_box()
                if width > 760:
                    assert abs(meaning["y"] - next_steps["y"]) < 2
                    assert next_steps["x"] > meaning["x"] + meaning["width"]
                else:
                    assert next_steps["y"] >= meaning["y"] + meaning["height"]
            for summary in await finding.locator(".finding-project > summary").all():
                await summary.click()
            await finding.screenshot(path=str(root / "_scratch/backup-warning-breakdown.png"))
            await page.set_viewport_size({"width": 390, "height": 844})
            await finding.screenshot(path=str(root / "_scratch/backup-warning-mobile.png"))
            await finding.locator(".finding-breakdown > summary").focus()
            await page.keyboard.press("Enter")
            assert not await finding.locator(".finding-breakdown").evaluate("e => e.open")
            await page.keyboard.press("Enter")
            assert await finding.locator(".finding-breakdown").evaluate("e => e.open")
            await page.set_viewport_size({"width": 1440, "height": 1000})
            await finding.locator(".finding-project > summary").first.click()
            database_link = finding.locator(".finding-project[open] li [data-entity]").first
            expected_id = await database_link.get_attribute("data-entity")
            await database_link.click()
            assert await page.locator(".database-scroll").is_visible()
            assert await page.locator('[data-database-row="' + expected_id + '"]').count() == 1
            assert not await page.locator("dialog:modal").count()
            await page.locator("#tabs [data-tab='apps']").click()
            checks.append("Full-width warning cards show project labels and counts, preserve expansion on refresh, support keyboard/mobile and link to database details")
            await page.unroute("**/operations/api/inventory*", backup_fixture)
            await page.locator("#refresh").click()
            await page.wait_for_function("!document.querySelector('#refresh').disabled", timeout=60000)

            catalogue_apps = await page.locator("#atlas-data").evaluate("e => JSON.parse(e.textContent).realms.filter(r => r.kind === 'app').map(r => 'app:' + r.id).sort()")
            assert sorted(row["id"] for row in inventory["apps"]) == catalogue_apps
            assert int(await page.locator("#tabs [data-tab='apps'] .tab-count").inner_text()) == len(catalogue_apps)
            checks.append("Private Apps count and entries match catalogue apps; aliases and the platform do not inflate totals")
            await page.locator("#tabs [data-tab='databases']").click()
            for width in [1440, 390, 320]:
                await page.set_viewport_size({"width": width, "height": 900})
                await page.locator("[data-database-group-toggle]").first.wait_for()
                total = await page.locator(".database-record").count()
                assert await page.locator(".directory-refine-actions #database-group-controls").count() == 1
                boxes = await page.locator(".directory-refine-actions").evaluate("e => [...e.children].filter(n => !n.hidden).map(n => n.getBoundingClientRect().toJSON())")
                assert max(b["top"] for b in boxes) < min(b["bottom"] for b in boxes)
                assert max(b["right"] for b in boxes) <= width
                caption = await page.locator("#caption").inner_text()
                toggle = page.locator("[data-database-group-toggle]").first
                summary = await page.locator(".database-group-summary").first.inner_text()
                key = await toggle.evaluate("e => e.closest('[data-database-group]').dataset.databaseGroup")
                await toggle.focus()
                await toggle.press("Enter")
                assert await toggle.get_attribute("aria-expanded") == "false"
                hidden = await page.locator(".database-record[hidden]").count()
                assert 0 < hidden <= total
                assert await page.locator(".database-record[hidden]:visible").count() == 0
                assert await page.locator("#caption").inner_text() == caption
                assert await page.locator(".database-group-summary").first.inner_text() == summary
                assert await toggle.evaluate("e => document.activeElement === e")
                await column_sort("size", "asc")
                same_group = page.locator("[data-database-group]").filter(has=page.locator("[data-database-group-toggle][aria-expanded=false]"))
                assert key in await same_group.evaluate_all("nodes => nodes.map(e => e.dataset.databaseGroup)")
                if await page.locator("#database-groups-toggle").get_attribute("data-database-groups-action") == "expand":
                    await page.locator("#database-groups-toggle").click()
                await page.locator("#database-groups-toggle").click()
                assert await page.locator(".database-record:visible").count() == 0
                assert await page.locator(".database-group:visible").count() > 0
                assert await page.locator("#database-groups-toggle").is_enabled()
                await page.locator("#database-groups-toggle").click()
                assert await page.locator(".database-record:visible").count() == total
                assert await page.locator("#database-groups-toggle").inner_text() == "Collapse all"
                if await page.locator("#database-groups-toggle").get_attribute("data-database-groups-action") == "expand":
                    await page.locator("#database-groups-toggle").click()
                await page.locator("#database-groups-toggle").click()
                await page.locator("#search").fill("orin")
                assert await page.locator(".database-record:visible").count() == 0
                await page.locator("#database-groups-toggle").click()
                assert await page.locator(".database-record:visible").count() > 0
                await page.locator("#search").fill("")
                await page.locator("#database-groups-toggle").click()
                assert await page.locator(".database-record:visible").count() == total
                assert await page.locator("#inventory").evaluate("e => e.getBoundingClientRect().right <= innerWidth + 1")
            await page.set_viewport_size({"width": 1440, "height": 1000})
            checks.append("Database groups collapse by keyboard, preserve totals and state while sorting/filtering, and expand individually or together on desktop and phones")
            await column_sort("size", "desc")
            visible_ids = await page.locator("#rows tr td:first-child [data-entity]").evaluate_all("nodes => nodes.map(node => node.dataset.entity)")
            by_id = {row["id"]: row for row in inventory["databases"]}
            sizes = [by_id[record]["bytes"] + by_id[record]["walBytes"] for record in visible_ids]
            for group in await grouped_ids():
                sizes = [by_id[id]["bytes"] + by_id[id]["walBytes"] for id in group]
                assert sizes == sorted(sizes, reverse=True)
            await column_sort("size", "asc")
            visible_ids = await page.locator("#rows tr td:first-child [data-entity]").evaluate_all("nodes => nodes.map(node => node.dataset.entity)")
            sizes = [by_id[record]["bytes"] + by_id[record]["walBytes"] for record in visible_ids]
            for group in await grouped_ids():
                sizes = [by_id[id]["bytes"] + by_id[id]["walBytes"] for id in group]
                assert sizes == sorted(sizes)
            checks.append("Database size sorts numerically in both directions")
            owned = next(row for row in inventory["databases"] if row["category"] == "application" and row.get("owner"))
            await page.goto(private + "/#list?tab=databases&filter=category%3Aapplication&owner=" + owned["owner"] + "&sort=size_asc")
            await page.wait_for_selector('[data-column-remove="owner"]:visible')
            await page.wait_for_selector("#rows .database-name", timeout=60000)
            expected = {row["id"] for row in inventory["databases"] if row["category"] == "application" and row.get("owner") == owned["owner"]}
            visible_ids = await page.locator("#rows .database-name").evaluate_all("nodes => nodes.map(node => node.dataset.entity)")
            assert set(visible_ids) == expected
            await page.reload()
            await page.wait_for_selector("#rows .database-name", timeout=60000)
            visible_ids = await page.locator("#rows .database-name").evaluate_all("nodes => nodes.map(node => node.dataset.entity)")
            assert set(visible_ids) == expected
            assert await page.locator('[data-column-remove="component"]:visible').count() == 1
            assert await page.locator('[data-column-remove="owner"]:visible').count() == 1
            assert not await page.locator(".directory-options:visible").count()
            await page.locator("[data-columns-reset]:visible").click()
            assert await page.locator("#rows .database-name").count() == len(inventory["databases"])
            checks.append("Old database links migrate usage, owner and numeric sorting into visible field menus, survive reload and clear together")
            await page.locator("#tabs [data-tab='services']").click()
            await page.locator("#search").fill("runa")
            assert await page.locator("#rows .entity").count() > 0
            assert "q=runa" in page.url
            await page.reload()
            await page.wait_for_selector("#rows .entity", timeout=60000)
            assert await page.locator("#search").input_value() == "runa"
            assert await page.locator("#tabs [data-tab='services']").get_attribute("aria-pressed") == "true"
            await page.locator("#tabs [data-tab='agents']").click()
            assert await page.locator("#search").input_value() == "runa"
            checks.append("Shared search and selected tab survive reload")
            await page.locator("#search").fill("")
            runa = page.locator("#rows .inventory-realm").filter(has=page.locator("[data-entity='agent:runa']"))
            assert await runa.locator(".project-label").inner_text() == "PAL | AGENT"
            await page.locator("#rows [data-entity='agent:runa']").first.click()
            assert await page.locator("#detail").is_visible()
            assert await page.locator("#detail-body .related [data-entity]").count() > 0
            await page.locator("#detail-body .related [data-entity]").first.click()
            assert "entity=service" in page.url
            await page.locator("#close").click()
            await page.wait_for_function("!location.hash.includes('entity=')")
            checks.append("Entity details, dependency navigation and close state")
            orin = next(row for row in inventory["agents"] if row["id"] == "agent:orin")
            dashboard = next(row for row in inventory["databases"] if row.get("componentEntity") == "service:orin-hermes-dashboard")
            database_columns = json.dumps({"filters": {"owner": [orin["name"]]}, "sort": {"key": "size", "direction": "desc"}}, separators=(",", ":"))
            from urllib.parse import urlencode
            database_hash = "#list?" + urlencode({"tab": "databases", "q": "orin", "columns": database_columns, "dbColumns": "component,size", "dbLayout": "6"})
            for width, close_method in [(1440, "button"), (390, "escape")]:
                await page.set_viewport_size({"width": width, "height": 1000})
                await page.goto(private + "/" + database_hash)
                await page.wait_for_selector("#rows .database-name", timeout=60000)
                original_url = page.url
                original_rows = await page.locator("#rows .database-name").all_text_contents()
                dashboard_row = page.locator("#rows tr").filter(has=page.locator('[data-entity="' + dashboard["id"] + '"]'))
                assert await page.locator("#database-columns-toggle").count() == 0
                original_url = page.url
                component = dashboard_row.get_by_role("button", name="Agent Dashboard", exact=True)
                await component.click()
                await page.wait_for_selector("#detail[open]")
                assert await page.locator("#tabs [data-tab='databases']").get_attribute("aria-pressed") == "true"
                assert await page.locator("#section-title").inner_text() == "Databases"
                assert await page.locator("#rows .database-name").all_text_contents() == original_rows
                assert await page.locator("#detail-title").inner_text() == "orin-hermes-dashboard"
                assert "tab=databases" in page.url
                await page.reload()
                await page.wait_for_selector("#detail[open]", timeout=60000)
                assert await page.locator("#section-title").inner_text() == "Databases"
                related = page.locator("#detail-body .related [data-entity]").first
                await related.click()
                assert await page.locator("#section-title").inner_text() == "Databases"
                if await page.locator("#detail").is_visible():
                    if close_method == "button":
                        await page.locator("#close").click()
                    else:
                        await page.keyboard.press("Escape")
                else:
                    assert await page.locator(".database-scroll").is_visible()
                    assert await page.locator("#head [data-column-key='path']").count() == 0
                    assert await page.locator("#rows .database-actions [data-copy-path]").count() > 0
                    await page.goto(original_url)
                    await page.wait_for_selector("#rows .database-name", timeout=60000)
                await page.wait_for_function("!location.hash.includes('entity=')")
                assert page.url == original_url
                assert await page.locator("#search").input_value() == "orin"
                assert await page.locator("#rows .database-name").all_text_contents() == original_rows
                await component.click()
                await page.keyboard.press("Escape")
                await page.wait_for_function("!location.hash.includes('entity=')")
                assert await component.evaluate("e => e === document.activeElement")
                assert page.url == original_url
            await page.set_viewport_size({"width": 1440, "height": 1000})
            checks.append("Dashboard and related entity dialogs preserve database tab, owner filter, search, sorting and rows across close, Escape and reload on desktop/mobile")

            await page.goto(private + "/operations/#entity=agent%3Aruna")
            await page.wait_for_selector("#detail[open]", timeout=60000)
            assert "/#list?" in page.url and "entity=agent%3Aruna" in page.url
            assert "Runa" in await page.locator("#detail-title").inner_text()
            await page.locator("#close").click()
            checks.append("Legacy Operations links retain entity selection")
            await page.goto(private + "/operations")
            await page.wait_for_selector("#rows .entity", timeout=60000)
            assert page.url.endswith("/#list")
            checks.append("Bare Operations redirects into List")
            await page.locator("[data-view='atlas']").click()
            await page.wait_for_selector("[data-atlas] canvas", timeout=30000)
            await check_label_legend()
            checks.append("Private Atlas legend remains available after renderer loading")
            assert any("/atlas-client.js" in url for url in requested)
            assert await page.locator("#atlas-view").is_visible()
            assert not await page.locator("#inventory").is_visible()
            await page.locator("[data-realm-chooser]").select_option("stakefolio")
            assert await page.locator("[data-realm-ownership]").inner_text() == "STAKEFOLIO | GOVERNANCE"
            await page.locator("[data-view='list']").click()
            assert await page.locator("#inventory").is_visible()
            checks.append("Atlas and List switch within the same Garden page")
            await page.screenshot(path=str(root / "_scratch/unified-list-desktop.png"))
            await page.set_viewport_size({"width": 390, "height": 844})
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            await page.locator("#rows .inventory-realm").first.scroll_into_view_if_needed()
            await page.screenshot(path=str(root / "_scratch/unified-list-apps-mobile.png"))
            for width in [320, 390, 768, 1024, 1440]:
                await page.set_viewport_size({"width": width, "height": 900})
                for section in ["apps", "agents", "services", "workflows", "databases", "issues"]:
                    await page.locator("#tabs [data-tab='" + section + "']").click()
                    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (width, section)
                    assert await page.locator(".catalogue__intro").is_visible(), (width, section)
                    assert await page.locator("[data-view-title]").inner_text() == "Choose the next horizon."
                    assert await page.locator("[data-view-description]").inner_text() == "Find your next destination in the Garden of Zo."
                    if section != "databases" or width <= 600:
                        assert await page.locator("#inventory .table-wrap").evaluate("e => e.scrollWidth <= e.clientWidth"), (width, section)
            checks.append("All sections fit 320–1440px; mobile database records need no horizontal scrolling")
            await page.set_viewport_size({"width": 390, "height": 844})
            await page.locator("#tabs [data-tab='databases']").click()
            assert await page.locator("#rows .database-name").count() > 0
            await page.locator("#rows .database-name").first.click()
            assert await page.locator(".database-scroll").is_visible()
            assert not await page.locator("#rows .database-detail-row").count()
            assert not await page.locator("#detail").is_visible()
            await page.screenshot(path=str(root / "_scratch/unified-list-mobile.png"))
            checks.append("Mobile database clicks keep the table visible")
            if public:
                requested.clear()
                await page.goto(public + "/#list")
                assert int(await page.locator("[data-kind-filter='app'] .filter__count").inner_text()) == len(catalogue_apps)
                checks.append("Public and private Apps counts agree")
                await page.wait_for_selector("[data-list-card]")
                await check_label_legend()
                checks.append("Public List legend uses the same definitions and responsive dialog")
                assert await page.locator("[data-list-card] .project-label").count() == await page.locator("[data-list-card]").count()
                assert "Proposed" not in await page.locator("#list-view").inner_text()
                assert await page.locator("#inventory").count() == 0
                assert not any("/operations/" in url for url in requested)
                for path in ["/operations", "/operations/client.js", "/operations/api/inventory"]:
                    assert (await page.request.get(public + path)).status == 404
                checks.append("Public catalogue never loads operational data")
                await page.locator("[data-view='atlas']").click()
                await page.wait_for_selector("[data-atlas] canvas", timeout=30000)
                await check_label_legend()
                checks.append("Public Atlas legend supports pointer and keyboard access")
                await page.locator("[data-realm-chooser]").select_option("zo-relationship-mapper")
                assert await page.locator("[data-realm-ownership]").inner_text() == "GOZ | APP"
                checks.append("Both Atlas detail panels display ownership labels")
            for base in [private, public]:
                if not base:
                    continue
                is_private = base == private
                await page.set_viewport_size({"width": 1440, "height": 1000})
                await page.goto(base + "/?category=STAKEFOLIO&role=PRODUCT#list")
                await page.wait_for_selector("#rows .entity" if is_private else "[data-list-card]:visible")
                labels = page.locator("#rows .project-label" if is_private else "[data-list-card]:visible .project-label")
                assert set(await labels.all_text_contents()) == {"STAKEFOLIO | PRODUCT"}
                assert not await page.locator(".catalogue__filters").is_visible()
                assert not await page.locator(".directory-options:visible").count()
                assert await page.locator("#search").is_visible()
                await page.locator("[data-columns-reset]:visible").click()
                await column_choice("category", "GOZ")
                await column_choice("subcategory", "APP")
                assert set(await labels.all_text_contents()) == {"GOZ | APP"}
                await page.reload()
                await page.wait_for_selector("#rows .entity" if is_private else "[data-list-card]:visible")
                assert set(await labels.all_text_contents()) == {"GOZ | APP"}
                await page.locator("[data-view='atlas']").click()
                await page.wait_for_function("!!window.__skyAtlas")
                assert await page.locator(".catalogue__filters").is_visible()
                category = page.get_by_role("combobox", name="Project category", exact=True)
                role = page.get_by_role("combobox", name="Project sub-category", exact=True)
                await choose_label(category, "PAL")
                await choose_label(role, "AGENT")
                realms = await page.locator("#atlas-data").evaluate("e => JSON.parse(e.textContent).realms")
                expected = [r["id"] for r in realms if r["ownershipCategory"] == "PAL" and r["ownershipRole"] == "AGENT"]
                assert await page.evaluate("window.__skyAtlas.state().visible") == expected
                await page.locator("[data-view='list']").click()
                assert set(await labels.all_text_contents()) == {"PAL | AGENT"}
                await page.locator("[data-columns-reset]:visible").click()
                for width in [320, 390, 768, 1440]:
                    await page.set_viewport_size({"width": width, "height": 1000})
                    assert not await page.locator(".catalogue__filters").is_visible()
                    assert await page.locator('[data-columns-open]:visible').count() == 1
                    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                if is_private:
                    for tab, category_value, role_value in [("services", "STAKEFOLIO", "GOVERNANCE"), ("workflows", "PAL", "WORKFLOW"), ("databases", "PAL", "AGENT")]:
                        await page.locator(f"#tabs [data-tab='{tab}']").click()
                        await column_choice("category", category_value)
                        await column_choice("subcategory", role_value)
                        assert await page.locator("#rows tr:not(:has(.empty))").count() > 0
                        await page.locator("[data-columns-reset]:visible").click()
                checks.append(("Private" if is_private else "Public") + " lower filter area preserves labels, URLs, reload, Atlas and mobile layouts")
            layout_signatures = {}
            for base in [private, public]:
                if not base:
                    continue
                is_private = base == private
                await page.goto(base + "/#list")
                await page.wait_for_selector("#rows .entity" if is_private else "[data-list-card]:visible")
                search = page.get_by_role("searchbox", name="Search", exact=True)
                if not is_private:
                    await page.locator("[data-directory-kind='app']").click()
                await search.fill("batam")
                cards = page.locator("#rows .realm-row" if is_private else "[data-list-card]:visible")
                assert await cards.count() == 1
                assert "Batam 100" in await cards.first.inner_text()
                count = page.locator("#caption" if is_private else ".directory-count").first
                assert "1 of 17 records" in await count.inner_text()
                await page.reload()
                await page.wait_for_selector("#rows .entity" if is_private else "[data-list-card]:visible")
                assert await search.input_value() == "batam"
                assert await cards.count() == 1
                await search.fill("nothing-matches-this-search")
                assert await page.locator("#rows .empty" if is_private else "[data-list-empty]").is_visible()
                await search.fill("")
                sort = page.locator("#sort" if is_private else "#directory-sort")
                for value in ["name_desc", "name_asc"]:
                    await column_sort("name", "desc" if value == "name_desc" else "asc")
                    titles = await cards.locator("h3").all_text_contents()
                    expected = await cards.locator("h3").evaluate_all("nodes => nodes.map(n => n.textContent).sort(new Intl.Collator('en', {numeric:true,sensitivity:'base'}).compare)")
                    assert titles == (list(reversed(expected)) if value == "name_desc" else expected)
                for width in [320, 390, 768, 1024, 1440]:
                    await page.set_viewport_size({"width": width, "height": 1000})
                    await page.evaluate("scrollTo(0, 0); document.fonts.ready")
                    await page.mouse.move(0, 0)
                    await cards.evaluate_all("nodes => nodes.forEach(n => n.getAnimations().forEach(a => a.finish()))")
                    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (base, width)
                    assert await cards.first.evaluate("e => e.scrollWidth <= e.clientWidth"), (base, width)
                    signature = await page.locator("#search").evaluate("e => { const r=e.getBoundingClientRect(),s=getComputedStyle(e),root=document.querySelector('#inventory') || document.querySelector('#list-view'),results=root.querySelector('.directory-results').getBoundingClientRect(),card=root.querySelector('.realm-row:not([hidden])').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,font:s.font,border:s.borderRadius,background:s.backgroundColor,resultsX:results.x,resultsY:results.y,cardX:card.x,cardY:card.y};}")
                    if is_private:
                        layout_signatures[width] = signature
                    else:
                        assert signature == layout_signatures[width], (width, signature, layout_signatures[width])
                    if width in [390, 1440]:
                        await page.screenshot(path=str(root / f"_scratch/shared-directory-{'private' if is_private else 'public'}-{width}.png"))
                if is_private:
                    await page.locator("#tabs [data-tab='agents']").click()
                    await search.fill("runa")
                    assert await page.locator("#rows .realm-row").count() == 1
                    await page.locator("#rows .realm-row__link--detail").click()
                    assert await page.locator("#detail").is_visible()
                    await page.locator("#close").click()
                    await search.fill("")
                else:
                    await page.locator("[data-view='atlas']").click()
                    await page.wait_for_selector("[data-atlas] canvas", timeout=30000)
                    await page.locator("[data-view='list']").click()
                    await search.fill("batam")
                    assert await cards.count() == 1
                checks.append(("Private" if is_private else "Public") + " shared directory search, counts, sorting, rows, details and responsive alignment verified")
            assert not errors, errors
            await browser.close()
            print(json.dumps({"checks": checks, "pageErrors": errors}, indent=2))
    finally:
        if fixture:
            fixture.terminate()
            fixture.wait(timeout=10)

asyncio.run(main())
