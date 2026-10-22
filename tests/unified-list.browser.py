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
                    assert await dialog.locator(".label-legend__categories dt").count() == 5
                    assert "Garden of Zo projects" in await dialog.inner_text()
                    assert "a label has not been assigned" in await dialog.inner_text()
                    assert "Proposed" not in await dialog.inner_text()
                    assert await dialog.evaluate("e => e.scrollWidth <= e.clientWidth")
                    bounds = await dialog.bounding_box()
                    assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= width
                    body = dialog.get_by_role("region", name="Label definitions")
                    assert await dialog.get_by_role("tab").count() == 0
                    expected_roles = {
                        "PAL": ["PRODUCT", "AGENT", "WORKFLOW", "PLATFORM", "GOVERNANCE", "DATA", "LEGACY"],
                        "GOZ": ["PLATFORM", "INFRASTRUCTURE", "APP", "MONITORING", "WEBSITE", "AGENT"],
                        "GITHUB": ["APP", "WEBSITE"], "GR": ["MAIL"], "PERSONAL": ["APP"]
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
            assert await page.locator("#rows a[href='/backlog']").count() == 1
            checks.append("One private List with direct destination links")
            stakefolio = page.locator("#rows .inventory-realm").filter(has=page.locator("[data-entity='app:stakefolio']"))
            assert await stakefolio.locator(".project-label").inner_text() == "PAL | PRODUCT"
            mapper = page.locator("#rows .inventory-realm").filter(has=page.locator("[data-entity='app:zo-relationship-mapper']"))
            assert await mapper.locator(".project-label").inner_text() == "GOZ | APP"
            assert "Proposed" not in await page.locator("#rows").inner_text()
            checks.append("Private app labels display confirmed ownership and roles")
            for section in ["agents", "services", "workflows", "databases", "issues", "apps"]:
                await page.locator("#tabs [data-tab='" + section + "']").click()
                assert await page.locator("#rows tr").count() > 0
            checks.append("All five inventory tabs and attention findings render")
            inventory = await (await page.request.get(private + "/operations/api/inventory")).json()
            await page.locator("#tabs [data-tab='databases']").click()
            await page.locator("#sort").select_option("size_desc")
            visible_ids = await page.locator("#rows tr td:first-child [data-entity]").evaluate_all("nodes => nodes.map(node => node.dataset.entity)")
            by_id = {row["id"]: row for row in inventory["databases"]}
            sizes = [by_id[record]["bytes"] + by_id[record]["walBytes"] for record in visible_ids]
            assert sizes == sorted(sizes, reverse=True)
            await page.locator("#sort").select_option("size_asc")
            visible_ids = await page.locator("#rows tr td:first-child [data-entity]").evaluate_all("nodes => nodes.map(node => node.dataset.entity)")
            sizes = [by_id[record]["bytes"] + by_id[record]["walBytes"] for record in visible_ids]
            assert sizes == sorted(sizes)
            checks.append("Database size sorts numerically in both directions")
            owned = next(row for row in inventory["databases"] if row["category"] == "application" and row.get("owner"))
            await page.locator("#filter").select_option("category:application")
            await page.locator("#owner").select_option(owned["owner"])
            expected = {row["id"] for row in inventory["databases"] if row["category"] == "application" and row.get("owner") == owned["owner"]}
            visible_ids = await page.locator("#rows tr td:first-child [data-entity]").evaluate_all("nodes => nodes.map(node => node.dataset.entity)")
            assert set(visible_ids) == expected
            assert "owner=" in page.url and "filter=category%3Aapplication" in page.url and "sort=size_asc" in page.url
            await page.reload()
            await page.wait_for_selector("#rows tr td:first-child [data-entity]", timeout=60000)
            assert await page.locator("#filter").input_value() == "category:application"
            assert await page.locator("#owner").input_value() == owned["owner"]
            assert await page.locator("#sort").input_value() == "size_asc"
            visible_ids = await page.locator("#rows tr td:first-child [data-entity]").evaluate_all("nodes => nodes.map(node => node.dataset.entity)")
            assert set(visible_ids) == expected
            await page.locator("#owner").select_option("")
            await page.locator("#filter").select_option("backup:unknown")
            visible_ids = await page.locator("#rows tr td:first-child [data-entity]").evaluate_all("nodes => nodes.map(node => node.dataset.entity)")
            assert visible_ids and all(by_id[record]["backup"]["status"] == "unknown" for record in visible_ids)
            checks.append("Category, owner and backup filters work and restore from the URL")
            await page.locator("#filter").select_option("")
            await page.locator("#sort").select_option("name_asc")
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
            assert await page.locator("[data-realm-ownership]").inner_text() == "PAL | PRODUCT"
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
                    assert await page.locator("#inventory .table-wrap").evaluate("e => e.scrollWidth <= e.clientWidth"), (width, section)
            checks.append("All inventory sections fit 320–1440px without horizontal tables")
            await page.set_viewport_size({"width": 390, "height": 844})
            await page.locator("#tabs [data-tab='databases']").click()
            assert await page.locator("#rows .entity").count() > 0
            await page.locator("#rows .entity").first.click()
            assert await page.locator("#detail").is_visible()
            await page.locator("#close").click()
            await page.screenshot(path=str(root / "_scratch/unified-list-mobile.png"))
            checks.append("Mobile List and database details fit the viewport")
            if public:
                requested.clear()
                await page.goto(public + "/#list")
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
            assert not errors, errors
            await browser.close()
            print(json.dumps({"checks": checks, "pageErrors": errors}, indent=2))
    finally:
        if fixture:
            fixture.terminate()
            fixture.wait(timeout=10)

asyncio.run(main())
