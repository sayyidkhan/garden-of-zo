import asyncio
import json
import os
import subprocess
from pathlib import Path

from playwright.async_api import async_playwright, expect


async def main():
    root = Path(__file__).resolve().parents[1]
    fixture = None
    private = os.environ.get("GARDEN_PRIVATE_TEST_URL")
    public = os.environ.get("GARDEN_PUBLIC_TEST_URL")
    if not private:
        fixture = subprocess.Popen(["bun", "-e", """
          import { createHandler } from "./server.ts";
          const servers = ["private", "public"].map(access => Bun.serve({
            hostname: "127.0.0.1", port: 0, fetch: createHandler(process.cwd() + "/../zo-router/" + access + ".routes.json")
          }));
          console.log(JSON.stringify(servers.map(s => "http://127.0.0.1:" + s.port)));
        """], cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        private, public = json.loads(fixture.stdout.readline())
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
            page = await browser.new_page(viewport={"width": 1440, "height": 1100})
            errors = []
            requests = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("request", lambda request: requests.append(request.url))
            response = await page.request.get(private + "/operations/api/inventory", timeout=60000)
            assert response.ok
            snapshot = await response.json()
            state = {"fail": False, "stale": False}

            async def inventory(route):
                if state["fail"]:
                    await route.fulfill(status=503, json={"error": "unavailable"})
                else:
                    await route.fulfill(json={**snapshot, "stale": state["stale"]})
            await page.route("**/operations/api/inventory*", inventory)
            await page.goto(private + "/")
            sections = ["apps", "agents", "services", "workflows", "databases"]
            for section in sections:
                await expect(page.locator(f'[data-home-count="{section}"]')).to_have_text(str(len(snapshot[section])))
                await page.locator(f'[data-home-section="{section}"]').click()
                await expect(page.locator("#section-title")).to_have_text(section.capitalize())
                await expect(page.locator("#caption")).to_contain_text(f'{len(snapshot[section])} of {len(snapshot[section])} records')
                await page.locator("[data-close-catalogue]").first.click()
            assert not any("/atlas-client.js" in url for url in requests)
            observed = await page.locator("[data-home-freshness]").inner_text()
            assert "SGT" in observed and "Last observed" in observed
            for width, height in [(320, 568), (390, 664), (390, 844), (768, 1024), (1366, 768), (1440, 750), (2048, 1063), (1280, 600)]:
                await page.set_viewport_size({"width": width, "height": height})
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                summary = await page.locator(".hero-summary").bounding_box()
                assert summary["y"] + summary["height"] <= height, (width, height, summary)
                for link in await page.locator("[data-home-section]").all():
                    box = await link.bounding_box()
                    assert box["x"] >= 0 and box["x"] + box["width"] <= width
                await page.screenshot(path=str(root / "_scratch" / f"landing-private-{width}-{height}.png"), full_page=True)
            await page.goto(private + "/?category=PAL&role=AGENT#list?tab=agents&q=orin")
            await expect(page.locator("#caption")).to_contain_text("1 of")
            await page.locator("[data-close-catalogue]").first.click()
            await page.locator('[data-home-section="apps"]').click()
            await expect(page.locator("#caption")).to_contain_text(f'{len(snapshot["apps"])} of {len(snapshot["apps"])} records')
            assert "category=" not in page.url
            state["stale"] = True
            await page.locator("#refresh").click()
            await expect(page.locator("[data-home-freshness]")).to_contain_text("Stale observation")
            state["fail"] = True
            await expect(page.locator("#refresh")).to_be_enabled()
            await page.locator("#refresh").click()
            await expect(page.locator("[data-home-freshness]")).to_contain_text("Refresh failed")
            for section in sections:
                await expect(page.locator(f'[data-home-count="{section}"]')).to_have_text(str(len(snapshot[section])))
            await page.goto(private + "/")
            await expect(page.locator("[data-home-freshness]")).to_contain_text("Inventory unavailable")
            for section in sections:
                await expect(page.locator(f'[data-home-count="{section}"]')).to_have_text("—")
            state.update(fail=False, stale=False)
            await page.evaluate('document.dispatchEvent(new Event("visibilitychange"))')
            await expect(page.locator('[data-home-count="agents"]')).to_have_text(str(len(snapshot["agents"])))
            requests.clear()
            await page.goto(public + "/")
            assert await page.locator("[data-home-count]").count() == 0
            realms = await page.locator("#atlas-data").evaluate("e => JSON.parse(e.textContent).realms")
            for section, kind in [("apps", "app"), ("agents", "agent")]:
                count = sum(r["kind"] == kind for r in realms)
                await expect(page.locator(f'[data-home-section="{section}"] strong')).to_have_text(str(count))
                await page.locator(f'[data-home-section="{section}"]').click()
                await expect(page.locator("[data-list-count]")).to_have_text(str(count))
                await page.locator("[data-close-catalogue]").first.click()
            assert not any("/operations/" in url for url in requests)
            assert (await page.request.get(public + "/operations/api/inventory")).status == 404
            assert not errors, errors
            print(json.dumps({"counts": {k: len(snapshot[k]) for k in sections}, "checks": "Landing/List counts, navigation, filters, responsive layout, freshness, stale and failed refreshes, recovery, public catalogue and privacy passed"}))
            await browser.close()
    finally:
        if fixture:
            fixture.terminate()
            fixture.wait(timeout=10)


asyncio.run(main())
