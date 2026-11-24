import { expect, test } from "bun:test";
import { createTaskListSync, parseTaskList } from "./operations/scheduled-tasks";
import { createOperationsHandler } from "./operations/handler";
import { loadConfig } from "./config";

const id = "7681547b-dd70-4893-9dad-8e11655cc4fc";
const entry = `id='${id}' rrule='DTSTART;TZID=Asia/Singapore:20261118T090000\\\\nRRULE:FREQ=DAILY' instruction='Ignore title=\\'secret\\' active=True' created_at=datetime.datetime(2026, 11, 18) title="Owner's task \\u2014 daily" result_delivery_method=None active=False pause_reason=None`;
const payload = (entries = [entry]) => ({ jsonrpc: "2.0", id: "garden-task-list", result: { content: [{ type: "text", text: JSON.stringify(entries) }], isError: false } });

test("Zo task representation preserves quoted names, paused states and schedules without retaining instructions", () => {
  const tasks = parseTaskList(payload());
  expect(tasks).toEqual([{ id, name: "Owner's task — daily", schedule: "DTSTART;TZID=Asia/Singapore:20261118T090000\nRRULE:FREQ=DAILY", active: false }]);
  expect(JSON.stringify(tasks)).not.toContain("secret");
  expect(parseTaskList(payload([]))).toEqual([]);
  for (const invalid of [payload([entry, entry]), payload(["broken"]), { result: { isError: true } }, { result: {} }]) {
    expect(() => parseTaskList(invalid)).toThrow();
  }
});

test("sync calls only list_automations, coalesces clicks and saves only validated metadata", async () => {
  let calls = 0, saved: any, clock = 100000;
  const sync = createTaskListSync({ token: () => "private-token", now: () => clock, save: async list => { saved = list; },
    request: (async (url, options) => {
      calls++;
      expect(url).toBe("https://api.zo.computer/mcp");
      expect(JSON.parse(options!.body as string).params).toEqual({ name: "list_automations", arguments: {} });
      return Response.json(payload());
    }) as typeof fetch });
  const [first, second] = await Promise.all([sync(), sync()]);
  expect(first).toEqual(second);
  expect(saved.automations[0].active).toBe(false);
  expect(saved.observedAt).toBe(new Date(clock).toISOString());
  await sync();
  expect(calls).toBe(1);
  clock += 30001;
  await sync();
  expect(calls).toBe(2);
});

test("failed, malformed and unauthenticated syncs keep the saved list and hide private errors", async () => {
  for (const result of [new Response("private error", { status: 401 }), Response.json(payload(["bad entry"]))]) {
    let writes = 0;
    const sync = createTaskListSync({ token: () => "token", save: async () => { writes++; }, request: (async () => result) as typeof fetch });
    await expect(sync()).rejects.toThrow("saved list was kept");
    await expect(sync()).rejects.toThrow("30 seconds");
    expect(writes).toBe(0);
  }
  await expect(createTaskListSync({ token: () => undefined })()).rejects.toThrow("connection to Zo is unavailable");
});

test("task sync is private, POST-only and rejects cross-site or missing action headers", async () => {
  let calls = 0;
  const sync = async () => { calls++; return { observedAt: "2026-11-18T10:00:00Z", automations: [] }; };
  const privateConfig = loadConfig(import.meta.dir + "/../zo-router/private.routes.json");
  const privateHandler = createOperationsHandler(privateConfig, [], false, sync);
  const publicHandler = createOperationsHandler(loadConfig(import.meta.dir + "/../zo-router/public.routes.json"), [], false, sync);
  const url = privateConfig.gatewayUrl + "/operations/api/scheduled-tasks/sync";
  expect((await publicHandler(new Request(url, { method: "POST", headers: { "X-Garden-Action": "sync-tasks" } }))).status).toBe(404);
  expect((await privateHandler(new Request(url))).status).toBe(405);
  for (const headers of [{}, { "X-Garden-Action": "sync-tasks", Origin: "https://evil.invalid" },
    { "X-Garden-Action": "sync-tasks", "Sec-Fetch-Site": "cross-site" }]) {
    expect((await privateHandler(new Request(url, { method: "POST", headers }))).status).toBe(403);
  }
  expect(calls).toBe(0);
  const response = await privateHandler(new Request(url, { method: "POST", headers: { "X-Garden-Action": "sync-tasks", Origin: privateConfig.gatewayUrl } }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ observedAt: "2026-11-18T10:00:00Z", count: 0 });
  expect(calls).toBe(1);
});
