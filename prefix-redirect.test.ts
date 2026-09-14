import { expect, test } from "bun:test";
import { join } from "node:path";
import { createHandler } from "./server";

test("redirects a bare stripped prefix so relative app assets stay under that prefix", async () => {
  const publicFile = join(import.meta.dir, "public.routes.json");
  const response = await createHandler(publicFile)(new Request("http://localhost/crow?from=phone"));
  expect(response.status).toBe(308);
  expect(response.headers.get("location")).toBe("/crow/?from=phone");
});
