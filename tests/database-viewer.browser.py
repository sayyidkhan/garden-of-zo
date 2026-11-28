import asyncio
import json
import subprocess
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    root = Path(__file__).resolve().parents[1]
    fixture = subprocess.Popen(["bun", "-e", """
import { createHandler } from "./server";
const server = Bun.serve({hostname:"127.0.0.1",port:0,fetch:createHandler(process.cwd()+"/../zo-router/private.routes.json")});
console.log("http://127.0.0.1:"+server.port);
"""], cwd=root, stdout=subprocess.PIPE, text=True)
    url = fixture.stdout.readline().strip()
    checks = 0
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
            page = await browser.new_page(viewport={"width": 1440, "height": 1000})
            async def reveal_conditions():
                details = page.locator("#database-filter-conditions")
                if not await details.get_attribute("open") == "":
                    await details.locator("summary").click()

            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            async def inventory(route):
                response = await route.fetch()
                data = await response.json()
                data["services"].append({"id": "service:viewer-owner", "name": "Fixture Owner", "project": "Fixture & Project"})
                base = {"name": "sample.sqlite", "path": "/fixture/sample.sqlite", "engine": "SQLite",
                        "bytes": 4096, "walBytes": 0, "owner": None, "category": "application", "backupCopies": []}
                data["databases"] = [
                    {**base, "id": "fixture", "viewerKey": "0123456789abcdef01234567", "displayName": "Sample records", "owner": "service:viewer-owner", "ownership": {"category": "PAL", "subcategory": "AGENT", "status": "confirmed"}, "viewer": {"available": True, "reason": "View database records (read-only)"}},
                    {**base, "id": "unsupported", "viewerKey": "fedcba9876543210fedcba98", "name": "unsupported.db", "viewer": {"available": False, "reason": "No viewer available for this database engine."}}
                ]
                await route.fulfill(json=data)
            async def records(route):
                from urllib.parse import urlparse, parse_qs
                params = parse_qs(urlparse(route.request.url).query)
                if "table" not in params:
                    data = {"tables": ["sample", "audit_log", "project_events"]}
                elif "distinct" in params:
                    values = [None, "", "Case", "case", "<script>window.injected=true</script>", "value-259"]
                    search = params.get("valueSearch", [""])[0].lower()
                    data = {"values": [v for v in values if not search or v and search in v.lower()], "hasMore": False}
                else:
                    offset = int(params.get("offset", ["0"])[0])
                    search = params.get("search", [""])[0]
                    filters = json.loads(params.get("filters", ["[]"])[0])
                    rows = [] if search == "missing" else [[offset + 1, "<script>window.injected=true</script>", None]]
                    data = {"columns": ["id", "value", "empty"], "rows": rows,
                            "hasMore": offset == 0 and not filters}
                await route.fulfill(json=data)
            await page.route("**/operations/api/inventory*", inventory)
            await page.route("**/operations/api/database-viewer?*", records)
            for width in [1440, 390]:
                await page.set_viewport_size({"width": width, "height": 900})
                await page.goto(url + "/#list?tab=databases")
                await page.locator('[data-view-database="fixture"]').wait_for()
                eye = page.locator('[data-view-database="fixture"]')
                assert await eye.evaluate("(el) => el.nextElementSibling.hasAttribute('data-copy-row')")
                checks += 1
                await page.locator('[data-view-database="unsupported"]').click(force=True)
                assert not await page.locator("#database-view-dialog").is_visible()
                assert await page.locator('[data-view-database="unsupported"]').get_attribute("aria-disabled") == "true"
                checks += 1
                await eye.click()
                await page.locator('#database-view-table option[value="sample"]').wait_for(state="attached")
                table_input = page.get_by_role("combobox", name="Database table", exact=True)
                table_options = page.locator("#database-view-table-options")
                await table_input.fill("AuDiT")
                assert await table_options.get_by_role("option").count() == 1
                await table_options.get_by_role("option", name="audit_log", exact=True).click()
                assert await page.locator("#database-view-table").input_value() == "audit_log"
                assert await table_input.input_value() == "audit_log"
                saved_url = page.url
                assert "db=0123456789abcdef01234567" in saved_url
                assert "table=audit_log" in saved_url
                assert "/fixture/" not in saved_url and len(saved_url) < 300
                await page.reload()
                await page.locator("#database-view-grid td").first.wait_for()
                assert await page.locator("#database-view-dialog").is_visible()
                assert await table_input.input_value() == "audit_log"
                assert page.url == saved_url
                checks += 1

                await table_input.fill("no such table")
                assert await table_options.get_by_role("status").inner_text() == "No matches"
                await table_input.press("Escape")
                assert await page.locator("#database-view-dialog").is_visible()
                assert await table_input.input_value() == "audit_log"
                await page.get_by_role("button", name="Show database table options").click()
                assert await table_options.get_by_role("option").count() == 3
                assert await table_options.evaluate("(el) => { const r=el.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight }")
                await table_input.press("Escape")
                await table_input.fill("project")
                await table_input.press("Tab")
                assert await table_input.input_value() == "audit_log"
                await table_input.fill("SAMP")
                await table_input.press("Enter")
                assert await page.locator("#database-view-table").input_value() == "sample"
                assert not await table_options.is_visible()
                checks += 1
                await page.locator("#database-view-grid td").first.wait_for()
                context = await page.locator("#database-view-context").inner_text()
                for value in ["Project", "Fixture & Project", "Database", "sample.sqlite", "Owner", "Fixture Owner", "Category", "PAL", "Sub-category", "AGENT"]:
                    assert value in context, context
                assert await page.locator("#database-view-title").inner_text() == "Sample records — Records"
                assert await page.locator("#close-database-view").is_visible()
                assert await page.locator("#database-view-context").evaluate("(el) => el.scrollWidth <= el.clientWidth")
                checks += 1

                assert await page.locator("#database-view-grid td").nth(1).inner_text() == "<script>window.injected=true</script>"
                assert not await page.evaluate("Boolean(window.injected)")
                assert await page.locator(".database-null").inner_text() == "NULL"
                checks += 1
                await page.locator("#database-view-next").click()
                await page.wait_for_function("document.querySelector('#database-view-status').textContent.includes('51')")
                assert await page.locator("#database-view-next").is_disabled()
                await page.locator("#database-view-prev").click()
                await page.wait_for_function("document.querySelector('#database-view-status').textContent.includes('Records 1')")
                checks += 1
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                assert await page.locator("#database-view-dialog").evaluate("(el) => el.getBoundingClientRect().width <= innerWidth")
                assert await page.locator("#database-view-dialog").evaluate("(el) => { const r=el.getBoundingClientRect(); return r.x === 0 && r.y === 0 && Math.abs(r.width-innerWidth)<2 && Math.abs(r.height-innerHeight)<2 }")
                checks += 1
                for control, label in [("search-button", "Search records"), ("clear", "Clear all")]:
                    button = page.locator("#database-view-" + control)
                    assert await button.get_attribute("aria-label") == label
                    assert await button.get_attribute("title") == label
                    assert await button.locator("svg").count() == 1
                    assert await button.evaluate("el => { const r=el.getBoundingClientRect(); return r.width>=44 && r.height>=44 && r.right<=innerWidth }")
                assert await page.locator("#database-view-filter-toggle").count() == 0
                assert await page.locator("[data-viewer-column]").count() == 3
                assert await page.locator("#database-view-search-button").evaluate("el => Math.abs(el.getBoundingClientRect().top-document.querySelector(\u0027#database-view-clear\u0027).getBoundingClientRect().top)<2")
                await page.locator("#database-view-search").fill("needle")
                await page.locator("#database-view-search-button").click()
                await page.wait_for_function("document.querySelector('#database-view-status').textContent.includes('Matching records 1')")
                await page.locator("#database-view-next").click()
                await page.wait_for_function("document.querySelector('#database-view-status').textContent.includes('51')")
                assert await page.locator("#database-view-page").inner_text() == "Page 2"
                checks += 1
                column = page.locator('[data-viewer-column="value"]')
                await column.click()
                filter_dialog = page.locator("#database-filter-dialog")
                assert await filter_dialog.is_visible()
                assert await page.locator("#database-filter-title").inner_text() == "value"
                assert not await page.locator("#database-filter-conditions").evaluate("el => el.open")
                if width > 600:
                    assert await filter_dialog.evaluate("el => { const r=el.getBoundingClientRect(); return r.width<=340 && r.height<500 }")
                await page.screenshot(path=str(root / "_scratch" / ("database-menu-compact-" + str(width) + ".png")))
                assert await page.locator('[aria-label="Filter column"]').count() == 0
                assert await filter_dialog.evaluate("el => { const r=el.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight }")
                assert await page.locator("#database-view-grid").evaluate("el => el.getBoundingClientRect().height > 300")
                await page.locator("#database-view-sort").select_option("asc")
                await reveal_conditions()
                await page.locator('[aria-label="Filter value"]').fill("discard this")
                await page.locator("#database-view-cancel-filters").click()
                assert not await filter_dialog.is_visible()
                assert await column.evaluate("el => el === document.activeElement")
                assert await page.locator("#database-view-active-filters").is_hidden()
                await column.click()
                assert await page.locator('[aria-label="Filter value"]').input_value() == ""
                assert await page.locator("#database-view-sort").input_value() == "default"
                await reveal_conditions()
                await page.locator('[aria-label="Filter value"]').fill("script")
                await page.screenshot(path=str(root / "_scratch" / ("database-filter-single-" + str(width) + ".png")))
                await page.locator('#database-view-filters button[type="submit"]').click()
                await page.wait_for_function("document.querySelector('[data-viewer-column=value]')?.classList.contains('is-filtered')")
                assert await page.locator("#database-view-next").is_disabled()
                assert "Matching records 1" in await page.locator("#database-view-status").inner_text()
                assert not await filter_dialog.is_visible()
                assert "value contains" in await page.locator("#database-view-active-filters").inner_text()
                assert await column.evaluate("el => el === document.activeElement")
                await page.locator('[data-viewer-column="empty"]').click()
                await reveal_conditions()
                await page.locator('[aria-label="Filter condition"]').select_option("empty")
                assert await page.locator('[aria-label="Filter value"]').is_disabled()
                async with page.expect_request(lambda req: "database-viewer?" in req.url) as request_info:
                    await page.locator('#database-view-filters button[type="submit"]').click()
                from urllib.parse import urlparse, parse_qs
                applied = json.loads(parse_qs(urlparse((await request_info.value).url).query)["filters"][0])
                assert applied == [{"column":"value","operator":"contains","value":"script"}, {"column":"empty","operator":"empty","value":""}], applied
                await page.wait_for_function("document.querySelectorAll('.database-column-filter.is-filtered').length === 2")
                await column.click()
                assert await page.locator('[aria-label="Filter value"]').input_value() == "script"
                await page.locator("#database-view-reset-filters").click()
                assert await page.locator(".database-filter-row").count() == 0
                await page.keyboard.press("Escape")
                assert not await filter_dialog.is_visible()
                assert await page.locator("#database-view-dialog").is_visible()
                assert await column.get_attribute("aria-label") == "Filter column: value (1 active)"
                await column.click()
                for _ in range(6):
                    await reveal_conditions()
                    await page.locator("#database-view-add-filter").click()
                assert await page.locator("#database-view-add-filter").is_disabled()
                assert await page.locator("#database-filter-limit").is_visible()
                await page.screenshot(path=str(root / "_scratch" / ("database-filter-" + str(width) + ".png")))
                await page.set_viewport_size({"width": 320, "height": 568})
                assert await filter_dialog.evaluate("el => { const r=el.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight }")
                assert await page.locator(".database-filter-body").evaluate("el => el.scrollHeight > el.clientHeight")
                await page.locator(".database-filter-apply").focus()
                await page.keyboard.press("Tab")
                assert await filter_dialog.evaluate("el => el.contains(document.activeElement)")
                assert await page.locator(".database-filter-actions").evaluate("el => { const r=el.getBoundingClientRect(); return r.top>=0 && r.bottom<=innerHeight }")
                await page.set_viewport_size({"width": width, "height": 900})
                await page.locator("#database-view-cancel-filters").click()
                await column.click()
                await page.locator("#database-view-reset-filters").click()
                await page.locator('#database-view-filters button[type="submit"]').click()
                await page.wait_for_function("document.querySelectorAll('.database-column-filter.is-filtered').length === 1")
                assert await page.locator('[data-viewer-column="empty"]').get_attribute("aria-label") == "Filter column: empty (1 active)"
                assert "value contains" not in await page.locator("#database-view-active-filters").inner_text()
                await page.locator("[data-remove-viewer-filter]").click()
                await page.wait_for_function("document.querySelectorAll('.database-column-filter.is-filtered').length === 0")
                assert await page.locator("#database-view-active-filters").is_hidden()
                checks += 1
                await column.click()
                choices = page.locator("#database-values-list input")
                await choices.first.wait_for()
                assert await choices.count() == 6
                assert await choices.nth(0).is_checked()
                await page.locator("#database-values-none").click()
                await choices.nth(2).check()
                await choices.nth(5).check()
                await page.locator("#database-value-search").fill("Case")
                await page.wait_for_function("document.querySelectorAll('#database-values-list input').length === 2")
                assert await choices.nth(0).is_checked()
                assert not await choices.nth(1).is_checked()
                async with page.expect_request(lambda req: "filters=" in req.url and "distinct=" not in req.url) as request_info:
                    await page.locator('#database-view-filters button[type="submit"]').click()
                picked = json.loads(parse_qs(urlparse((await request_info.value).url).query)["filters"][0])
                assert picked == [{"column": "value", "operator": "in", "value": json.dumps(["Case", "value-259"], separators=(",", ":"))}], picked
                await page.wait_for_function("document.querySelector('[data-viewer-column=value]')?.classList.contains('is-filtered')")
                await column.click()
                await choices.first.wait_for()
                assert await choices.nth(2).is_checked() and await choices.nth(5).is_checked()
                assert not await choices.nth(0).is_checked()
                await page.locator("#database-values-all").click()
                await page.locator("#database-view-cancel-filters").click()
                await column.click()
                await choices.first.wait_for()
                assert not await choices.nth(0).is_checked()
                await page.screenshot(path=str(root / "_scratch" / ("database-values-" + str(width) + ".png")))
                await page.locator("#database-view-reset-filters").click()
                await page.locator('#database-view-filters button[type="submit"]').click()
                await page.wait_for_function("document.querySelectorAll('.database-column-filter.is-filtered').length === 0")
                checks += 1
                id_column = page.locator('[data-viewer-column="id"]')
                for direction, aria_sort in [("asc", "ascending"), ("desc", "descending"), ("default", "none")]:
                    await id_column.click()
                    await page.locator("#database-view-sort").select_option(direction)
                    async with page.expect_request(lambda req: "database-viewer?" in req.url) as request_info:
                        await page.locator('#database-view-filters button[type="submit"]').click()
                    params = parse_qs(urlparse((await request_info.value).url).query)
                    assert json.loads(params["sort"][0]) == (None if direction == "default" else {"column":"id","direction":direction})
                    assert json.loads(params["filters"][0]) == []
                    assert params["offset"] == ["0"]
                    await page.wait_for_function("document.querySelector('[data-viewer-column=id]')?.closest('th').getAttribute('aria-sort') === '" + aria_sort + "'")
                    assert await page.locator("[data-clear-viewer-sort]").count() == (0 if direction == "default" else 1)
                    if direction == "asc":
                        await page.screenshot(path=str(root / "_scratch" / ("database-sort-" + str(width) + ".png")))
                        async with page.expect_request(lambda req: "database-viewer?" in req.url) as page_request:
                            await page.locator("#database-view-next").click()
                        params = parse_qs(urlparse((await page_request.value).url).query)
                        assert params["offset"] == ["50"]
                        assert json.loads(params["sort"][0]) == {"column":"id","direction":"asc"}
                        await page.wait_for_function("document.querySelector('#database-view-page').textContent === 'Page 2'")
                await id_column.click()
                await page.locator("#database-view-sort").select_option("desc")
                await page.locator('#database-view-filters button[type="submit"]').click()
                await page.wait_for_function("document.querySelector('[data-viewer-column=id]')?.closest('th').getAttribute('aria-sort') === 'descending'")
                await column.click()
                await reveal_conditions()
                await page.locator('[aria-label="Filter value"]').fill("script")
                async with page.expect_request(lambda req: "database-viewer?" in req.url) as request_info:
                    await page.locator('#database-view-filters button[type="submit"]').click()
                params = parse_qs(urlparse((await request_info.value).url).query)
                assert json.loads(params["sort"][0]) == {"column":"id","direction":"desc"}
                assert json.loads(params["filters"][0]) == [{"column":"value","operator":"contains","value":"script"}]
                await page.locator("[data-remove-viewer-filter]").click()
                await page.wait_for_function("document.querySelectorAll('[data-remove-viewer-filter]').length === 0")
                await page.locator("[data-clear-viewer-sort]").click()
                await page.wait_for_function("document.querySelector('[data-viewer-column=id]')?.closest('th').getAttribute('aria-sort') === 'none'")
                await id_column.click()
                await page.locator("#database-view-sort").select_option("asc")
                await page.locator('#database-view-filters button[type="submit"]').click()
                await page.locator("#database-view-clear").click()
                await page.wait_for_function("document.querySelector('[data-viewer-column=id]')?.closest('th').getAttribute('aria-sort') === 'none'")
                assert await page.locator("#database-view-active-filters").is_hidden()
                checks += 1
                await page.locator("#database-view-search").fill("missing")
                await page.locator("#database-view-search-button").click()
                await page.wait_for_function("document.querySelector('#database-view-status').textContent.includes('No matching records')")
                await page.locator("#database-view-clear").click()
                await page.wait_for_function("document.querySelector('#database-view-status').textContent.startsWith('Records 1')")
                assert await page.locator("#database-view-search").input_value() == ""
                assert not await page.locator("#database-view-filters").is_visible()
                checks += 1

                await page.screenshot(path=str(root / "_scratch" / ("database-viewer-" + str(width) + ".png")))
                await page.keyboard.press("Escape")
                assert not await page.locator("#database-view-dialog").is_visible()
                await page.wait_for_function("document.activeElement?.dataset.viewDatabase === 'fixture'")
                await page.wait_for_function("document.querySelector('#database-view-grid').textContent === ''")
                checks += 1
                assert await page.locator("#database-view-context").inner_text() == ""
                assert "db=" not in page.url and "table=" not in page.url
                await page.reload()
                await eye.wait_for()
                assert not await page.locator("#database-view-dialog").is_visible()
                checks += 1
                await page.goto(saved_url.replace("table=audit_log", "table=removed_table"))
                await page.locator("#database-view-grid td").first.wait_for()
                assert await table_input.input_value() == "sample"
                assert "table=sample" in page.url
                await page.locator("#close-database-view").click()
                await page.wait_for_function("!location.hash.includes('db=')")
                checks += 1
                for key in ["fedcba9876543210fedcba98", "unknown"]:
                    await page.goto(url + "/#list?tab=databases&db=" + key)
                    await page.wait_for_function("!location.hash.includes('db=')")
                    assert not await page.locator("#database-view-dialog").is_visible()
                checks += 1

            assert not errors, errors
            await browser.close()
    finally:
        fixture.terminate()
        fixture.wait(timeout=10)
    print(str(checks) + " database viewer browser checks passed; no page errors")

asyncio.run(main())
