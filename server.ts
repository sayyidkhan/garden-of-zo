type RouteConfig = {
  prefix: string;
  label: string;
  targetOrigin: string;
};

type RouterConfig = {
  title: string;
  description?: string;
  routes: RouteConfig[];
};

function normalizePrefix(value: string): string {
  const raw = value.trim();
  if (!raw || raw === "/") {
    throw new Error(`Invalid route prefix: ${value}`);
  }
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "");
}

function loadConfig(): RouterConfig {
  const file = process.env.ROUTES_FILE;
  if (!file) {
    throw new Error("Missing ROUTES_FILE");
  }
  const parsed = JSON.parse(require("node:fs").readFileSync(file, "utf8")) as RouterConfig;
  if (!parsed.routes?.length) {
    throw new Error(`No routes defined in ${file}`);
  }
  parsed.routes = parsed.routes.map((route) => ({
    ...route,
    prefix: normalizePrefix(route.prefix),
    targetOrigin: route.targetOrigin.replace(/\/+$/, "")
  }));
  return parsed;
}

const config = loadConfig();
const port = Number(process.env.PORT || "9000");

function matchRoute(pathname: string): RouteConfig | undefined {
  return config.routes.find((route) => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`));
}

function renderIndex(): string {
  const items = config.routes
    .map((route) => `<li><a href="${route.prefix}">${route.label}</a><span> ${route.prefix}</span></li>`)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${config.title}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #0b1020; color: #e8eef9; }
      main { max-width: 760px; margin: 0 auto; padding: 40px 20px; }
      h1 { margin: 0 0 10px; font-size: 2.4rem; }
      p { color: #9fb0ca; }
      ul { list-style: none; padding: 0; display: grid; gap: 12px; }
      li { padding: 14px 16px; background: #121a2c; border: 1px solid #26324d; border-radius: 14px; }
      a { color: #7dd3fc; text-decoration: none; font-weight: 700; }
      span { color: #9fb0ca; }
      code { color: #c4b5fd; }
    </style>
  </head>
  <body>
    <main>
      <h1>${config.title}</h1>
      <p>${config.description ?? ""}</p>
      <p><code>/health</code> returns route metadata.</p>
      <ul>${items}</ul>
    </main>
  </body>
</html>`;
}

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "zo-router",
        title: config.title,
        routes: config.routes.map((route) => ({ prefix: route.prefix, label: route.label, targetOrigin: route.targetOrigin }))
      });
    }

    if (url.pathname === "/") {
      return new Response(renderIndex(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    const route = matchRoute(url.pathname);
    if (!route) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }

    const upstreamUrl = new URL(url.pathname + url.search, route.targetOrigin);
    const headers = new Headers(request.headers);
    headers.set("x-forwarded-host", url.host);
    headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
    headers.set("x-forwarded-prefix", route.prefix);

    const proxied = new Request(upstreamUrl.toString(), {
      method: request.method,
      headers,
      body: request.body,
      duplex: "half",
      redirect: "manual"
    });

    return fetch(proxied);
  }
});

console.log(`zo-router listening on http://127.0.0.1:${port}`);
