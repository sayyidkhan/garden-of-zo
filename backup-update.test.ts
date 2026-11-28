import { expect, test } from "bun:test";
import { createBackupUpdate, runBackupUpdate } from "./operations/backup-update";
import { createOperationsHandler } from "./operations/handler";
import { loadConfig } from "./config";

test("backup updates coalesce, retain partial results and limit repeat work", async () => {
  let calls = 0, clock = 0, finish: (value: any) => void = () => {};
  const report = { verifiedDatabases: 2, skipped: [], failures: [{ source: "app", error: "Use app procedure" }] };
  const job = createBackupUpdate(async () => ({}), async () => { calls++; return new Promise(resolve => { finish = resolve; }); }, () => clock);
  expect(job.start().running).toBe(true);
  job.start();
  await Bun.sleep(1);
  expect(calls).toBe(1);
  finish(report);
  await Bun.sleep(1);
  expect(job.status()).toEqual({ running: false, result: report });
  job.start();
  expect(job.status().running).toBe(false);
  clock = 60001;
  expect(job.start().running).toBe(true);
  await Bun.sleep(1);
  finish(report);
});

test("incomplete inventory stops before backups and background errors stay private", async () => {
  await expect(runBackupUpdate({ stale: true })).rejects.toThrow("Incomplete inventory");
  await expect(runBackupUpdate({ coverage: { databases: { complete: false } } })).rejects.toThrow("Incomplete inventory");
  const job = createBackupUpdate(async () => { throw new Error("secret internal error"); });
  job.start();
  await Bun.sleep(1);
  expect(job.status().error).toContain("Existing backups were kept");
  expect(JSON.stringify(job.status())).not.toContain("secret");
});

test("backup actions deny public, cross-site, missing action and unsupported methods without starting work", async () => {
  let calls = 0;
  const job = { status: () => ({ running: false }), start: () => { calls++; return { running: true }; } };
  for (const access of ["private", "public"]) {
    const config = loadConfig(import.meta.dir + "/../zo-router/" + access + ".routes.json");
    const handler = createOperationsHandler(config, [], false, undefined, job);
    const request = (method: string, headers = {}) => handler(new Request("http://localhost/operations/api/backups/update", { method, headers }));
    if (access === "public") {
      expect((await request("POST", { "X-Garden-Action": "update-backups" })).status).toBe(404);
      expect((await request("GET")).status).toBe(404);
      continue;
    }
    expect((await request("GET")).status).toBe(200);
    expect(calls).toBe(0);
    expect((await request("POST")).status).toBe(403);
    for (const headers of [{ origin: "https://evil.invalid" }, { "sec-fetch-site": "same-site" }, { "sec-fetch-site": "cross-site" }]) {
      expect((await request("POST", { ...headers, "X-Garden-Action": "update-backups" })).status).toBe(403);
    }
    expect((await request("DELETE")).status).toBe(405);
    expect(calls).toBe(0);
    const response = await request("POST", { "X-Garden-Action": "update-backups", origin: config.gatewayUrl });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(calls).toBe(1);
  }
});
