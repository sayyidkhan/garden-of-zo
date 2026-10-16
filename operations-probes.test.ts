import { expect, test } from "bun:test";
import { probeHttp } from "./operations/inventory";

test("unsupported HEAD falls back to GET without a false outage", async () => {
  for (const unsupported of [404, 405, 501]) {
    const methods: string[] = [];
    const request = (async (_url: string, options: any) => {
      methods.push(options.method);
      return new Response(null, { status: options.method === "HEAD" ? unsupported : 200 });
    }) as typeof fetch;
    expect(await probeHttp("http://127.0.0.1/example", request)).toBe(200);
    expect(methods).toEqual(["HEAD", "GET"]);
  }
});

test("actual server failures and auth requirements remain distinguishable", async () => {
  for (const code of [401, 403, 503]) {
    expect(await probeHttp("http://127.0.0.1/example", (async () => new Response(null, { status: code })) as typeof fetch)).toBe(code);
  }
});
