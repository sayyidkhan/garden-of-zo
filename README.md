# Garden of Zo router

Small Bun-based reverse proxy and shared app catalogue for Zo service consolidation.

- private gateway uses `private.routes.json`
- public gateway uses `public.routes.json`
- backend apps should be started with matching `APP_BASE_PATH` values
- both gateway homepages render the complete catalogue from both manifests
- the landing realm and catalogue are separate full-screen states; `#atlas` opens the catalogue and browser Back returns to the landing screen
- the catalogue toggles between a pannable two-dimensional Sky Atlas graph and a compact list view, with the preference stored in the browser
- Sky Atlas View is a full-viewport workspace with one unified, horizontally scrollable view-and-filter command bar docked below the map; List View uses `#list`
- the Atlas uses lightweight artwork variants, compositor-only motion, native mobile panning, and animation-frame-throttled interaction
- every realm uses its own lightweight transparent kingdom asset in both Atlas and List views
- Atlas placement and graph links live in each route's manifest entry; routes, beacon terminals, kingdom artwork and the mini-map all derive from the same canonical coordinates
- Atlas navigation includes a fitted overview, active-kingdom stepping, continuous focal zoom, a viewport mini-map, and spatial arrow/WASD movement
- selecting kingdom artwork uses a Web Animations compositor camera to zoom and centre the map without navigating; the selected kingdom sparkles and starts its `Enter realm` shimmer only after the camera arrives, desktop focus reaches 138%, manual zoom reaches 240% on desktop and 200% on mobile, and viewport resizing preserves the current zoom while only the card's `Enter realm` action opens the destination
- private app links always resolve through the authenticated private Zo service, while each realm's public GitHub repository remains directly visible
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

Each route also carries the catalogue metadata `title`, `description`, `category`, `kind`, `icon`, `repositoryUrl`, and `atlas`. `kind` is one of `app`, `workflow`, or `agent` and powers the shared Atlas/List type filter. `repositoryUrl` must be a public GitHub repository and powers the source action in both views. Run `bun test` after changing either manifest.
Use optional `entryPath` when a catalogue card should open below the route root, such as PocketBase's `/_/` admin shell.

## Add a realm

Add the route to `public.routes.json` or `private.routes.json`; there is no separate Atlas list in `server.ts`.

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

- `x` and `y` are the beacon centre on the `2240 × 1080` Atlas canvas.
- `art` is a lowercase asset ID. It resolves to `assets/garden-realm-<art>.webp`, so a new realm can add its own kingdom without changing renderer code.
- `links` uses stable route `label` values, never array indexes. Omit it for a leaf node.
- `bend` is optional. `0` is direct; positive and negative values curve on opposite sides of the straight route.
- Manifest loading rejects duplicate labels, missing link targets, self-links, and duplicate edges.
