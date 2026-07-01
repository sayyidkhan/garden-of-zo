---
name: zo-dual-gateway
description: |
  Maintain a dual-gateway reverse proxy setup on Zo Computer: one private gateway for internal tools and one public gateway for public apps. Use this skill when adding, updating, or debugging routed services like /backlog or /mapper, or when converting a direct Zo service into a backend process behind a gateway.
compatibility: Created for Zo Computer
metadata:
  author: sayyidkhan.zo.computer
  category: Infrastructure
  display-name: Zo Dual Gateway
  tags: zo, gateway, reverse-proxy, private, public, routing
---
# zo-dual-gateway

Maintain the Zo reverse-proxy setup with:

- one **private** HTTP gateway
- one **public** HTTP gateway
- backend apps running as **process** services on localhost

## Current Setup

Router project:

- `Github/zo-router`

Mapping files:

- `Github/zo-router/private.routes.json`
- `Github/zo-router/public.routes.json`

Router code:

- `Github/zo-router/server.ts`

Current route map:

- private: `/backlog` -> `http://127.0.0.1:3000`
- public: `/mapper` -> `http://127.0.0.1:8000`

Current service labels:

- private gateway: `private-apps`
- public gateway: `public-apps`
- private backend: `zo-backlog`
- public backend: `zo-relationship-mapper`

## Architecture Rule

Do **not** mix private and public apps behind the same Zo HTTP service.

Use:

- private gateway for internal/admin tools
- public gateway for public-facing apps

Keep heavyweight or fragile apps separate if they are likely to break behind a path proxy.

## How Routing Is Maintained

Two layers must match:

1. Router mapping file:
   - outer path prefix -> inner localhost origin
2. Backend service env:
   - `APP_BASE_PATH` must match the routed prefix

Example:

- router file says `/backlog` -> `http://127.0.0.1:3000`
- backend service runs with `PORT=3000` and `APP_BASE_PATH=/backlog`

## Add A New Routed App

### 1. Make the app prefix-aware

The app should support:

- `APP_BASE_PATH=/your-prefix`
- a fixed local `PORT`

If it is a frontend app, its assets and API calls must respect the base path.

### 2. Run it as a backend process service

Use a Zo **process** service, not HTTP, for the backend lane.

Pattern:

```text
label: your-app
mode: process
env:
  PORT=<local-port>
  APP_BASE_PATH=/your-prefix
```

### 3. Add the route to the correct JSON file

Private app:

- edit `Github/zo-router/private.routes.json`

Public app:

- edit `Github/zo-router/public.routes.json`

Route object shape:

```json
{
  "prefix": "/your-prefix",
  "label": "your-app",
  "targetOrigin": "http://127.0.0.1:<local-port>"
}
```

### 4. Restart the correct gateway

If you changed:

- `private.routes.json` -> restart `private-apps`
- `public.routes.json` -> restart `public-apps`

### 5. Verify end-to-end

Check both:

- backend lane directly on localhost
- gateway-routed path

Examples:

```bash
curl http://127.0.0.1:3000/backlog/health
curl http://127.0.0.1:9100/backlog/health

curl http://127.0.0.1:8000/mapper/api/health
curl http://127.0.0.1:9101/mapper/api/health
```

## Update An Existing Routed App

When changing a prefix:

1. update the app's `APP_BASE_PATH`
2. update the router JSON mapping
3. restart the backend process service
4. restart the corresponding gateway

Do not change only one side.

## Remove A Routed App

1. remove the route from the JSON file
2. restart the corresponding gateway
3. delete or repurpose the backend process service

## Debug Checklist

If a routed app fails:

1. check the backend process service is running
2. verify the backend listens on the expected local port
3. verify `APP_BASE_PATH` matches the router prefix exactly
4. verify the route exists in the right JSON file
5. restart the backend service
6. restart the gateway service

Common failure patterns:

- app still assumes `/` instead of `/prefix`
- frontend assets still point to `/assets/...`
- API calls still point to `/api/...` instead of `/prefix/api/...`
- service registered as HTTP instead of process
- route added to the wrong gateway file

## Files To Read First

When working on this setup, inspect:

- `Github/zo-router/server.ts`
- `Github/zo-router/private.routes.json`
- `Github/zo-router/public.routes.json`
- the target app README and env example

## Current App Notes

`zo-backlog`:

- private lane
- local port `3000`
- base path `/backlog`

`zo-relationship-mapper`:

- public lane
- local port `8000`
- base path `/mapper`
