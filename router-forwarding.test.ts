import { expect, test } from "bun:test";
import { join } from "node:path";
import { createHandler } from "./server";

test("proxies routes with the configured gateway origin", async () => {
  const originalFetch = globalThis.fetch;
  let upstream: Request | undefined;
  globalThis.fetch = async (input) => {
    upstream = new Request(input);
    return new Response("ok");
  };
  try {
    const handler = createHandler(join(import.meta.dir, "public.routes.json"));
    const response = await handler(new Request("http://ts12.zocomputer.io:10783/crow/explore.html"));
    expect(response.status).toBe(200);
    expect(upstream?.url).toBe("http://127.0.0.1:8806/explore.html");
    expect(upstream?.headers.get("x-forwarded-host")).toBe("public-apps-sayyidkhan.zocomputer.io");
    expect(upstream?.headers.get("x-forwarded-proto")).toBe("https");
    expect(upstream?.headers.get("x-forwarded-prefix")).toBe("/crow");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
