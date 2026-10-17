# Garden of Zo platform

The GOZ platform app: Garden homepage, Atlas, catalogue and read-only private inventory. Repository: `sayyidkhan/garden-of-zo`; folder: `Start/garden-of-zo/zo-platform`. Routing and connection infrastructure live in sibling `../zo-router` and repository `sayyidkhan/zo-router`.

## Run and maintain

Managed process service `zo-platform` (`svc_YIhvL4JC_vw`) runs `bun server.ts` with `ROUTES_DIR=/home/workspace/Start/garden-of-zo/zo-router`. One app serves two fixed loopback listeners: 8834 for public Garden, 8835 for private Garden. Configure ports with `PLATFORM_PUBLIC_PORT` and `PLATFORM_PRIVATE_PORT`. Do not register an external endpoint for these ports. Gateway visibility and Zo sign-in remain the access boundary.

Install graphics dependencies with `bun install --frozen-lockfile`. Run `bun test` after changes. Restart only `zo-platform` for UI, inventory, authors or catalogue metadata changes. No gateway restart is required for these changes. See `docs/migration.md` for deployment, protected behaviour, recovery and verification.

Both existing gateway roots continue to serve `/`, `/#atlas` and `/#list`. Existing app paths bypass this process. Public Garden never serves operational inventory or its client; public/private mode is fixed by listener configuration, never selected using client headers or Host.

## Source ownership

The workspace project ownership legend and category/sub-category mapping are maintained in [Project labels](docs/project-labels.md). This reference includes pending decisions and folder aliases; it does not yet implement labels in Garden's interface.

For classification, label reviews and ownership metadata updates, use the [Garden Project Labels skill](skills/garden-project-labels/SKILL.md), maintained in this repository and linked from workspace `Skills/garden-project-labels`. The legend remains the canonical mapping.

| File or folder | Responsibility |
|---|---|
| `server.ts` | Public/private Garden request handlers and loopback listeners |
| `config.ts` | Read router manifests and merge platform metadata; validate catalogue |
| `catalogue.json` | Descriptions, authors, repository links, display categories, realm artwork/positions/connections and entry links, keyed by access and route label |
| `authors.json` | Contributor profiles referenced by catalogue author IDs |
| `view.ts` | Homepage, Atlas/List shell and favicon |
| `client/shell.js` | Immediate navigation and public List filters; lazy Atlas import |
| `client/atlas.ts`, `camera-motion.ts`, `atlas-connections.ts` | PixiJS canvas, camera and decorative connections |
| `assets/` | Garden artwork |
| `operations/` | Private read-only host/service/agent/workflow/database discovery and unified List |

The platform reads current `public.routes.json` and `private.routes.json` through `ROUTES_DIR`, but imports no router runtime code. It never changes forwarding configuration. Add routing entries in the router and matching presentation entries in local `catalogue.json` for new destinations. Metadata cannot override target origins or access levels. Hidden transport routes remain excluded from both Atlas and app inventory.

## Protected interface behaviour

The landing realm and catalogue are separate full-screen states. `#atlas` opens the canvas, browser Back returns home, and `#list` opens the existing List. Preserve the teal/gold artwork, contributor/source links, private-link authentication and accessibility. Atlas and the public List contain apps/agents only; the private List also has services, workflows, databases and attention findings.

The PixiJS 8/pixi-viewport 6 renderer is bundled locally on demand, with no runtime CDN. Keep stable-sized labels, collision suppression, offscreen culling, lazy loading and stopped hidden tickers. Preserve pointer-anchored wheel zoom, touch drag/pinch, keyboard travel, cancellation and capped release glide. Camera motion tests cover frame-rate independence. Realm selection opens details without camera travel; explicit Locate/Overview/Explore controls move it. Decorative connection dots describe declared links rather than observed traffic. Preserve reduced-motion behaviour and the accessible List fallback.

Catalogue positions and graph links live in `catalogue.json`. Keep at least 380 horizontal or 460 vertical units between neighbouring nodes. Artwork IDs map to `assets/garden-realm-<id>.webp`. Links use stable route labels; validation rejects duplicate labels, missing/self targets and duplicate edges. `kind` is `app` or `agent`. Preserve Orin's explicit profile link and Runa's default.

## Private inventory

`operations/view.ts` and `list.css` render the unified private List. Preserve search, tabs, filters, numeric size sorting, selected entity/dependencies and URL state. Legacy `/operations[/]#entity=...` redirects into `/#list` while retaining selection. Public `/operations/*` must return 404.

Inventory reads supervisor state, route manifests, PAL registry/workflows and scoped SQLite/DuckDB file metadata. It excludes secrets, raw environment/commands, conversations and database rows. Host Codex databases are host runtime. The documented YouTube last-success aggregate is the only workflow-store query. Preserve scan bounds, error reporting, stale observation times and last-good cache handling. Process state, HTTP response, declared configuration and verified application health are different facts.

`operations/automations.local.json` is a private gitignored Zo schedule snapshot; page refresh does not refresh this source. Local Runa backup evidence is not proof of off-host protection or a tested restore. Inventory does not restart services, run workflows or change permissions.

## Browser verification

Run `python3.12 tests/unified-list.browser.py` for private List state, navigation, responsive layouts and public privacy. Set `GARDEN_PRIVATE_TEST_URL=http://127.0.0.1:9100` and `GARDEN_PUBLIC_TEST_URL=http://127.0.0.1:9101` for the deployed gateways. Run `bun tests/atlas-camera.browser.ts` for desktop/mobile Atlas interaction; `ATLAS_TEST_URL` can point to a deployed Atlas URL. Browser output/screenshots belong under `_scratch/`.

These local checks do not replace verification through Zo's external authenticated edge. Public homepages remain public and private homepages require owner sign-in. See the migration document for the recorded acceptance checks.
