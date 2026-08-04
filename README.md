# zo-router

Small Bun-based reverse proxy for Zo service consolidation.

- private gateway uses `private.routes.json`
- public gateway uses `public.routes.json`
- backend apps should be started with matching `APP_BASE_PATH` values

Current route plan:
- private: `/backlog` -> `http://127.0.0.1:3000`
- public: `/mapper` -> `http://127.0.0.1:8000`
- public: `/expert` -> `http://127.0.0.1:8001`
- public: `/pocketbase` -> `http://127.0.0.1:8090` (prefix stripped)
- public: `/zotube` -> `http://127.0.0.1:8788` (prefix stripped)
- public: `/moments` -> `http://127.0.0.1:8790` (prefix stripped)

Set `stripPrefix` only for upstreams that must receive root-relative paths.
Set `assetQuery` only when static assets need a versioned URL after a cache correction.
