# Garden platform separation

Completed 16 October 2026. This document records the current deployment; it supersedes the previous combined router/dashboard arrangement.

## Ownership and deployment

| Component | Folder | Repository | Label |
|---|---|---|---|
| Routing and transport | `../zo-router` | `sayyidkhan/zo-router` | GOZ · INFRASTRUCTURE |
| Garden UI and inventory | This checkout (`zo-platform`) | `sayyidkhan/garden-of-zo` | GOZ · PLATFORM |

The platform checkout was cloned from the router's existing Git history, then populated from its current working files so earlier uncommitted UI and inventory work was retained. Checkouts have independent Git directories. The router's former `garden` remote is removed; the platform's `origin` points to the existing Garden repository. This migration does not require renaming either GitHub repository.

Managed process service `zo-platform` (`svc_YIhvL4JC_vw`) runs `bun server.ts` with `ROUTES_DIR=/home/workspace/Start/garden-of-zo/zo-router`, public listener 127.0.0.1:8834 and private listener 127.0.0.1:8835. It has no external endpoint. Access is fixed by listener configuration, not request headers or hostname. One service owns both views of the same app.

Existing `private-apps` (`svc_FIZ9pNEsu6A`, 9100) and `public-apps` (`svc_mfrjPZmXcqc`, 9101) keep their URLs, modes, visibility and authentication. They forward only `/`, Garden scripts, favicon/artwork and private `/operations/*` to the appropriate platform listener. Gateway `/health` stays local. There is no catch-all platform fallback. Public `/operations/*` is denied before forwarding, including when callers forge private headers.

## Preserved behaviour

- Both gateway homepages remain `/`; `/#atlas`, `/#list`, saved list state and legacy Operations links still work.
- Garden artwork, camera motion, realm links, accessible catalogue and private unified inventory retain their existing behaviour.
- Existing app routes go directly from router to app. Orin/Runa profiles, Hermes transport tokens/origin/path restrictions, Kasm streaming/polling/clipboard, media byte ranges and app traffic accounting stay in the router.
- The platform has no routing or service-management authority. Inventory remains read-only, with unchanged privacy restrictions, stale-observation handling and automation snapshot semantics.
- `catalogue.json`, `authors.json`, artwork and UI code belong to the platform. Route manifests remain the canonical forwarding configuration. The platform joins presentation metadata onto route labels; the router never reads or validates presentation data.
- Platform source has no runtime imports of router code. It reads the route JSON files through `ROUTES_DIR`. Router startup does not require the platform checkout, its authors, its metadata or its dependencies.

## Maintenance

For UI, descriptions, labels, Atlas placement or inventory changes, edit this checkout and restart only `zo-platform`. Add routing entries in the relevant router manifest and presentation entries in `catalogue.json` for new destinations, then restart the affected gateway and platform. Keep visibility unchanged unless explicitly requested.

The existing project classification discussion remains separate from this extraction; no bulk relabelling or pending ownership choices are applied here.

## Recovery

If Garden fails, existing application paths and gateway `/health` remain available. A failed platform request returns 503 with no backend details. Check the platform's direct loopback health endpoints and its managed-service logs, then restart only `zo-platform` after fixing its files. Do not restart agent gateways to repair Garden.

Pre-extraction router code, package definition/lockfile, README, AGENTS and both original manifests are under router `_scratch/platform-migration-20261016/`. Original presentation/inventory files and tests are retained under its `moved/` directory; copied tests use `.bak` suffixes. The platform also retains inherited router files under `_scratch/router-extraction/`. These are private local rollback material, not source to publish.

To restore the former combined deployment, restore the router's saved server, package/lockfile, manifests and moved UI/inventory assets (renaming test `.bak` files if required), reinstall its frozen dependencies and restart the two existing gateway services. Preserve any newer route changes when restoring manifests. Pause `zo-platform` only after the restored homepages work. No phone unlinking, OpenClaw changes, public/private toggles or service URL changes are required.

## Verification

Router tests cover independent app forwarding during a platform outage, missing/malformed presentation data, fixed listener selection, stripped client credentials, public inventory denial, unknown-path denial, Hermes transport and Kasm behaviour. Platform tests cover catalogue rendering, private boundaries, freshness, HTTP probes and camera motion. Browser checks cover the unified List, filters/dependencies, legacy links, mobile layouts and Atlas interaction. Live checks verify both homepages, Zo private sign-in, public inventory denial and existing routed dashboards/apps.

Acceptance on 16 October 2026:

- Router: 19 tests passed; platform: 25 tests passed. Atlas desktop/mobile: 109 browser checks passed. Unified List: 13 browser checks passed, with no page exceptions.
- Live platform pause: both Garden roots returned 503; both gateway health endpoints, Orin, Runa, Usage and OpenZo returned 200. Public inventory remained 404. The platform was resumed successfully.
- Gateway process IDs stayed 19877 (private) and 19992 (public) across the platform restart; platform PID changed from 19764 to 21937. A fresh inventory reports all three running and maps Garden to its own service.
- Public external homepage returned 200; anonymous private homepage returned 302 to Zo sign-in. External public inventory returned 404, including with a forged private-access header.
- Comparing the original and extracted manifests confirms every forwarding/transport setting is unchanged. Only presentation fields moved to the platform catalogue. Both worktrees pass `git diff --check`.
- Source changes are maintained in independent checkouts and committed to their respective repositories. Private snapshots and rollback files remain gitignored.
