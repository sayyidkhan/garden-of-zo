# Garden of Zo router

Small Bun-based reverse proxy and shared app catalogue for Zo service consolidation.

- private gateway uses `private.routes.json`
- public gateway uses `public.routes.json`
- backend apps should be started with matching `APP_BASE_PATH` values
- both gateway homepages render the complete catalogue from both manifests
- the landing realm and catalogue are separate full-screen states; `#atlas` opens the catalogue and browser Back returns to the landing screen
- the Atlas renders its world through PixiJS 8 and pixi-viewport 6 in one WebGL canvas; client source lives in `client/atlas.ts`, bundled by Bun and served locally at `/atlas-client.js` (no runtime CDN dependency)
- the existing `/#atlas` route keeps the floating-kingdom artwork, teal/gold palette, authors, realm destinations, access boundaries and List View; there is no separate `/map` page
- route manifests supply canonical world coordinates, artwork and links; the browser receives only catalogue metadata, never backend target addresses
- camera input uses direct drag, pointer-anchored wheel zoom, touch drag/pinch and a short release glide; WASD/arrows move continuously, Shift moves faster, `0` opens Overview and Escape stops travel
- `client/camera-motion.ts` corrects pixi-viewport 6.0.3's double-decay glide calculation and applies time-based, pointer-anchored wheel smoothing; direction reversals discard pending zoom, and press/Escape/keyboard/blur cancel it. Glide is capped at 240 screen pixels and verified at 30/60/120/144 Hz.
- decorative artwork is excluded from pointer hit-testing; the mini-map's moving outline uses a small canvas to avoid layout work while panning and zooming
- the starting regional view is centred on Zo Drive at 72% desktop / 64% mobile scale; Overview fits the world, Explore returns to the selected kingdom at that reading scale, and the mini-map supports click/drag travel
- labels render at a stable screen size with collision suppression and reduced detail when zoomed out; offscreen islands are culled, idle frames skip rendering, and hidden Atlas tabs stop their ticker
- clicking a kingdom opens a fixed details panel without moving or zooming the camera; only Locate, the kingdom chooser, previous/next and Explore initiate travel; only Enter realm opens the destination
- access/type filters preserve camera position; List View and the native kingdom chooser retain keyboard access to every destination
- reduced motion disables camera transitions and release glide; graphics initialisation/context failure explains how to use List View
- private links continue through the authenticated private gateway; source and author links remain public
- dependencies are pinned in `package.json` and `bun.lock`; install with `bun install --frozen-lockfile` before starting the gateway
- catalogue hero art is layered from `assets/garden-sky-v2.webp`, `assets/garden-kingdom.webp`, and `assets/garden-pegasus.webp`

Current route plan:
- private: `/backlog` -> `http://127.0.0.1:3000`
- private: `/usage` -> `http://127.0.0.1:8791` (focused host-usage dashboard)
- public: `/mapper` -> `http://127.0.0.1:8000`
- public: `/expert` -> `http://127.0.0.1:8001`
- public: `/pocketbase` -> `http://127.0.0.1:8090` (prefix stripped)
- public: `/zotube` -> `http://127.0.0.1:8788` (prefix stripped)
- public: `/moments` -> `http://127.0.0.1:8790` (prefix stripped)

Set `stripPrefix` only for upstreams that must receive root-relative paths.
Set `assetQuery` only when static assets need a versioned URL after a cache correction.

Each route also carries the catalogue metadata `title`, `description`, `category`, `kind`, `icon`, `authorId`, `repositoryUrl`, and `atlas`. `kind` is one of `app`, `workflow`, or `agent` and powers the shared Atlas/List type filter. `authorId` must resolve to a profile in `authors.json`. `repositoryUrl` must be a public GitHub repository and powers the source action in both views. Run `bun test` after changing a manifest or the author registry.
Use optional `entryPath` when a catalogue card should open below the route root, such as PocketBase's `/_/` admin shell.

For interaction regression checks, open a fresh `/#atlas` page with `agent-browser`, then run `agent-browser eval --stdin < tests/atlas-interaction.browser.js`. Run at desktop and mobile viewport sizes, reloading between runs. This checks continuous zoom, camera interruption, stable status text, kingdom selection, overview, mini-map, filters and view switching. The script changes only the test browser's view; it does not enter destinations or write application data.

Run `bun tests/atlas-camera.browser.ts` for a temporary local preview and browser checks using real mouse, wheel, keyboard and touch events at desktop/mobile sizes. It also runs the existing interaction checks, measures layout work during continuous panning and saves screenshots under `_scratch/`. Set `ATLAS_TEST_URL` to check a running gateway instead. This requires `agent-browser` on PATH.

## Add a realm

Add the route to `public.routes.json` or `private.routes.json`; there is no separate Atlas list in `server.ts`.

Add a contributor once to `authors.json`, then reference that stable key from every realm they own:

```json
"authorId": "contributor-handle"
```

```json
"atlas": {
  "x": 1200,
  "y": 500,
  "art": "my-realm",
  "scale": 1,
  "links": [
    { "to": "existing-route-label", "bend": 40 }
  ]
}
```

- `x` and `y` are the beacon centre on an Atlas canvas of at least `3600 × 2500`; the canvas expands automatically for farther placements. Leave at least 380px horizontally or 460px vertically between neighbours to accommodate artwork and expanded labels.
- `art` is a lowercase asset ID. It resolves to `assets/garden-realm-<art>.webp`, so a new realm can add its own kingdom without changing renderer code.
- `links` uses stable route `label` values, never array indexes. Omit it for a leaf node.
- `bend` is optional. `0` is direct; positive and negative values curve on opposite sides of the straight route.
- Manifest loading rejects duplicate labels, missing link targets, self-links, and duplicate edges.
