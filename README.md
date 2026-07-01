# zo-router

Small Bun-based reverse proxy for Zo service consolidation.

- private gateway uses `private.routes.json`
- public gateway uses `public.routes.json`
- backend apps should be started with matching `APP_BASE_PATH` values

Current route plan:
- private: `/backlog` -> `http://127.0.0.1:3000`
- public: `/mapper` -> `http://127.0.0.1:8000`
