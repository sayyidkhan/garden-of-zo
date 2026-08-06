# Garden of Zo router

Small Bun-based reverse proxy and shared app catalogue for Zo service consolidation.

- private gateway uses `private.routes.json`
- public gateway uses `public.routes.json`
- backend apps should be started with matching `APP_BASE_PATH` values
- both gateway homepages render the complete catalogue from both manifests
- private app links always resolve through the authenticated private Zo service
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

Each route also carries the catalogue metadata `title`, `description`, `category`, and `icon`. Run `bun test` after changing either manifest.
Use optional `entryPath` when a catalogue card should open below the route root, such as PocketBase's `/_/` admin shell.
