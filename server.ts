type RouteConfig = {
  prefix: string;
  label: string;
  targetOrigin: string;
  stripPrefix?: boolean;
  assetQuery?: string;
};

type RouterConfig = {
  title: string;
  description?: string;
  routes: RouteConfig[];
};

type TrafficSample = {
  at: number;
  application: string;
  receivedBytes: number;
  sentBytes: number;
  requestCount: number;
  errorCount: number;
};

function normalizePrefix(value: string): string {
  const raw = value.trim();
  if (!raw || raw === "/") {
    throw new Error(`Invalid route prefix: ${value}`);
  }
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "");
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
const trafficEndpoint = process.env.USAGE_TRAFFIC_ENDPOINT || "http://127.0.0.1:8791/usage/api/application-traffic";
let pendingTraffic = new Map<string, TrafficSample>();

function contentLength(headers: Headers) {
  const value = Number(headers.get("content-length") || "0");
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function recordApplicationTraffic(route: RouteConfig, request: Request, upstream: Response) {
  const at = Math.floor(Date.now() / 60_000) * 60_000;
  const key = `${at}:${route.label}`;
  const sample = pendingTraffic.get(key) || {
    at,
    application: route.label,
    receivedBytes: 0,
    sentBytes: 0,
    requestCount: 0,
    errorCount: 0
  };
  sample.receivedBytes += contentLength(request.headers);
  sample.sentBytes += contentLength(upstream.headers);
  sample.requestCount += 1;
  sample.errorCount += upstream.status >= 400 ? 1 : 0;
  pendingTraffic.set(key, sample);
}

function mergeTraffic(samples: Iterable<TrafficSample>) {
  for (const incoming of samples) {
    const key = `${incoming.at}:${incoming.application}`;
    const sample = pendingTraffic.get(key) || { ...incoming, receivedBytes: 0, sentBytes: 0, requestCount: 0, errorCount: 0 };
    sample.receivedBytes += incoming.receivedBytes;
    sample.sentBytes += incoming.sentBytes;
    sample.requestCount += incoming.requestCount;
    sample.errorCount += incoming.errorCount;
    pendingTraffic.set(key, sample);
  }
}

async function flushApplicationTraffic() {
  if (!pendingTraffic.size) return;
  const batch = pendingTraffic;
  pendingTraffic = new Map();
  try {
    const response = await fetch(trafficEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ samples: [...batch.values()] })
    });
    if (!response.ok) throw new Error(`Usage collector returned ${response.status}`);
  } catch (error) {
    mergeTraffic(batch.values());
    console.warn(`Unable to record application traffic: ${error}`);
  }
}

setInterval(() => void flushApplicationTraffic(), 60_000);

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

    const upstreamPath = route.stripPrefix
      ? url.pathname.slice(route.prefix.length) || "/"
      : url.pathname;
    const upstreamUrl = new URL(upstreamPath + url.search, route.targetOrigin);
    const headers = new Headers(request.headers);
    // Bun transparently decodes upstream responses, so do not forward an encoding it cannot preserve.
    headers.delete("accept-encoding");
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

    const upstream = await fetch(proxied);
    recordApplicationTraffic(route, request, upstream);
    const responseHeaders = new Headers(upstream.headers);
    // Bun has already decoded the body returned by fetch, so these upstream headers are stale.
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");

    const contentType = responseHeaders.get("content-type") ?? "";

    if (route.assetQuery && contentType.includes("text/html")) {
      const assetQuery = encodeURIComponent(route.assetQuery);
      const html = await upstream.text();
      const rewrittenHtml = html.replace(
        /(["'])\.\/((?:assets|libs)\/[^"'?]+)\1/g,
        (_match, quote, assetPath) => `${quote}./${assetPath}?v=${assetQuery}${quote}`
      ).replace(
        new RegExp(`(["'])${escapeRegularExpression(route.prefix)}/((?:assets|libs)/[^"'?]+)\\1`, "g"),
        (_match, quote, assetPath) => `${quote}${route.prefix}/${assetPath}?v=${assetQuery}${quote}`
      );
      responseHeaders.set("cache-control", "no-store");

      return new Response(rewrittenHtml, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders
      });
    }

    if (route.assetQuery && contentType.includes("javascript")) {
      const assetQuery = encodeURIComponent(route.assetQuery);
      const script = await upstream.text();
      const rewrittenScript = script.replace(
        /(["'`])\.\/([^"'`?]+\.js)\1/g,
        (_match, quote, assetPath) => `${quote}./${assetPath}?v=${assetQuery}${quote}`
      );

      return new Response(rewrittenScript, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    });
  }
});

console.log(`zo-router listening on http://127.0.0.1:${port}`);
