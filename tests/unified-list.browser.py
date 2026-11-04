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
                        "STAKEFOLIO": ["PRODUCT", "DATA"]
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
            checks.append("One private List with direct destination links")
            stakefolio = page.locator("#rows .inventory-realm").filter(has=page.locator("[data-entity='app:stakefolio']"))
            assert await stakefolio.locator(".project-label").inner_text() == "STAKEFOLIO | PRODUCT"
            mapper = page.locator("#rows .inventory-realm").filter(has=page.locator("[data-entity='app:zo-relationship-mapper']"))
            assert await mapper.locator(".project-label").inner_text() == "GOZ | APP"
            assert "Proposed" not in await page.locator("#rows").inner_text()
            checks.append("Private app labels display confirmed ownership and roles")
            for section in ["agents", "services", "workflows", "databases", "issues", "apps"]:
                await page.locator("#tabs [data-tab='" + section + "']").click()
                assert await page.locator("#rows tr").count() > 0
            checks.append("All five inventory tabs and attention findings render")
            inventory = await (await page.request.get(private + "/operations/api/inventory")).json()
            catalogue_apps = await page.locator("#atlas-data").evaluate("e => JSON.parse(e.textContent).realms.filter(r => r.kind === 'app').map(r => 'app:' + r.id).sort()")
            assert sorted(row["id"] for row in inventory["apps"]) == catalogue_apps
            assert int(await page.locator("#tabs [data-tab='apps'] .tab-count").inner_text()) == len(catalogue_apps)
            checks.append("Private Apps count and entries match catalogue apps; aliases and the platform do not inflate totals")
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
            assert await page.locator("[data-realm-ownership]").inner_text() == "STAKEFOLIO | PRODUCT"
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
                await page.goto(base + "/#list")
                await page.wait_for_selector("#rows .entity" if is_private else "[data-list-card]:visible")
                category = page.get_by_role("combobox", name="Project category", exact=True)
                role = page.get_by_role("combobox", name="Project sub-category", exact=True)
                clear = page.get_by_role("button", name="Clear labels", exact=True)
                await category.fill("take")
                assert await page.get_by_role("option", name="STAKEFOLIO", exact=True).is_visible()
                assert await page.get_by_role("listbox", name="Project category options").get_by_role("option").count() == 1
                await category.press("Enter")
                await choose_label(role, "prod")
                labels = page.locator("#rows .project-label" if is_private else "[data-list-card]:visible .project-label")
                assert await labels.count() > 0
                assert set(await labels.all_text_contents()) == {"STAKEFOLIO | PRODUCT"}
                assert "category=STAKEFOLIO" in page.url and "role=PRODUCT" in page.url
                await category.fill("no-such-category")
                assert await page.get_by_role("status").filter(has_text="No matches").is_visible()
                assert "category=STAKEFOLIO" in page.url
                await category.press("Escape")
                assert await category.input_value() == "STAKEFOLIO"
                assert await category.get_attribute("aria-expanded") == "false"
                await page.get_by_role("button", name="Show project category options", exact=True).click()
                category_options = page.get_by_role("listbox", name="Project category options")
                assert await category_options.get_by_role("option").count() == 7
                await category_options.get_by_role("option", name="GOZ", exact=True).click()
                assert await category.input_value() == "GOZ"
                assert await role.input_value() == ""
                await category.fill("pal")
                await role.click()
                assert await category.input_value() == "GOZ"
                await role.press("Escape")
                await choose_label(category, "STAKEFOLIO")
                await role.press("ArrowDown")
                await role.press("ArrowDown")
                await role.press("Enter")
                assert await role.input_value() == "PRODUCT"
                await category.fill("uncommitted")
                await category.press("Tab")
                assert await category.input_value() == "STAKEFOLIO"
                assert "category=STAKEFOLIO" in page.url
                await page.reload()
                await page.wait_for_selector("#rows .project-label" if is_private else "[data-list-card]:visible")
                assert await category.input_value() == "STAKEFOLIO"
                assert await role.input_value() == "PRODUCT"
                assert set(await labels.all_text_contents()) == {"STAKEFOLIO | PRODUCT"}
                await role.click()
                await page.get_by_role("listbox", name="Project sub-category options").get_by_role("option", name="All roles", exact=True).click()
                assert await role.input_value() == ""
                assert await category.input_value() == "STAKEFOLIO"
                await choose_label(role, "PRODUCT")
                await page.locator("[data-view='atlas']").click()
                await page.wait_for_function("!!window.__skyAtlas")
                realms = await page.locator("#atlas-data").evaluate("e => JSON.parse(e.textContent).realms")
                expected = [r["id"] for r in realms if r["ownershipCategory"] == "STAKEFOLIO" and r["ownershipRole"] == "PRODUCT"]
                assert await page.evaluate("window.__skyAtlas.state().visible") == expected
                assert await page.locator("[data-realm-chooser] option").count() == len(expected)
                await page.locator("[data-view='list']").click()
                assert set(await labels.all_text_contents()) == {"STAKEFOLIO | PRODUCT"}
                await choose_label(category, "GR")
                assert await role.input_value() == ""
                await role.click()
                assert await page.get_by_role("listbox", name="Project sub-category options").get_by_role("option").all_text_contents() == ["All roles", "MAIL"]
                await role.press("Escape")
                assert set(await labels.all_text_contents()) == {"GR | MAIL"}
                await choose_label(category, "PERSONAL")
                assert await labels.count() == 0
                empty = page.locator("#rows .empty" if is_private else "[data-list-empty]")
                assert await empty.is_visible()
                await page.locator("[data-view='atlas']").click()
                assert await page.evaluate("window.__skyAtlas.state().visible") == []
                assert await page.locator("[data-atlas-empty]").is_visible()
                assert await page.locator("[data-realm-chooser]").is_disabled()
                await clear.click()
                assert await clear.is_disabled()
                assert await category.input_value() == "" and await role.input_value() == ""
                assert await page.evaluate("window.__skyAtlas.state().visible.length") == len(realms)
                assert "category=" not in page.url and "role=" not in page.url
                await choose_label(role, "AGENT")
                assert await page.evaluate("window.__skyAtlas.state().visible") == [r["id"] for r in realms if r["ownershipRole"] == "AGENT"]
                await choose_label(category, "GOZ")
                await page.locator("[data-filter='public']").click()
                await page.locator("[data-kind-filter='agent']").click()
                assert await page.evaluate("window.__skyAtlas.state().visible") == ["zo-expert"]
                await clear.click()
                assert await page.locator("[data-filter='public']").get_attribute("aria-pressed") == "true"
                assert await page.locator("[data-kind-filter='agent']").get_attribute("aria-pressed") == "true"
                await page.locator("[data-filter='all']").click()
                await page.locator("[data-kind-filter='all']").click()
                await choose_label(category, "GOZ")
                await choose_label(role, "APP")
                for width, height in [(320, 844), (390, 844), (844, 390), (1440, 844)]:
                    await page.set_viewport_size({"width": width, "height": height})
                    for mode in ["list", "atlas"]:
                        await page.locator(f"[data-view='{mode}']").click()
                        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                        await category.click()
                        dropdown = page.get_by_role("listbox", name="Project category options")
                        bounds = await dropdown.bounding_box()
                        assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= width
                        assert bounds["y"] >= 0 and bounds["y"] + bounds["height"] <= height
                        if width in [390, 1440] and mode == "list":
                            await page.screenshot(path=str(root / f"_scratch/searchable-labels-{'private' if is_private else 'public'}-{width}.png"))
                        await category.press("Escape")
                        for control in [category, role, clear]:
                            bounds = await control.bounding_box()
                            assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= width
                            assert bounds["y"] >= 0 and bounds["y"] + bounds["height"] <= height
                    if width == 1440:
                        await page.screenshot(path=str(root / ("_scratch/ownership-filters-private.png" if is_private else "_scratch/ownership-filters-public.png")))
                await clear.click()
                await page.locator("[data-view='list']").click()
                if is_private:
                    snapshot = await (await page.request.get(private + "/operations/api/inventory")).json()
                    await page.locator("#tabs [data-tab='services']").click()
                    await choose_label(category, "STAKEFOLIO")
                    await choose_label(role, "DATA")
                    assert await page.locator("#rows .project-label").count() > 0
                    assert set(await page.locator("#rows .project-label").all_text_contents()) == {"STAKEFOLIO | DATA"}
                    assert "stakefolio-ledger-data" in await page.locator("#rows").inner_text()
                    await choose_label(category, "PAL")
                    await choose_label(role, "AGENT")
                    await page.locator("#tabs [data-tab='agents']").click()
                    assert await page.locator("#rows .project-label").count() > 0
                    assert set(await page.locator("#rows .project-label").all_text_contents()) == {"PAL | AGENT"}
                    for tab, owner_category, owner_role in [("services", "GOZ", "INFRASTRUCTURE"), ("workflows", "PAL", "WORKFLOW")]:
                        await page.locator(f"#tabs [data-tab='{tab}']").click()
                        await choose_label(category, owner_category)
                        await choose_label(role, owner_role)
                        assert await page.locator("#rows .project-label").count() > 0
                        assert set(await page.locator("#rows .project-label").all_text_contents()) == {owner_category + " | " + owner_role}
                    await page.locator("#tabs [data-tab='databases']").click()
                    await choose_label(category, "PAL")
                    await choose_label(role, "AGENT")
                    entities = {row["id"]: row for key in ["apps", "agents", "services", "workflows"] for row in snapshot[key]}
                    expected = {row["id"] for row in snapshot["databases"] if (entities.get(row.get("owner"), {}).get("ownership") or {}).get("category") == "PAL" and (entities.get(row.get("owner"), {}).get("ownership") or {}).get("subcategory") == "AGENT"}
                    actual = await page.locator("#rows tr td:first-child [data-entity]").evaluate_all("nodes => nodes.map(node => node.dataset.entity)")
                    assert expected and set(actual) == expected
                    await page.locator("#tabs [data-tab='issues']").click()
                    assert await page.locator("#rows").inner_text()
                    await clear.click()
                checks.append(("Private" if is_private else "Public") + " label filters persist, combine, reset, handle empty results and fit List/Atlas on mobile")
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
                    await sort.select_option(value)
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
