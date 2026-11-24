import { randomUUID } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Task = { id: string; name: string; schedule: string; active: boolean };
type TaskList = { observedAt: string; automations: Task[] };

export class TaskSyncError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}

function quoted(value: string) {
  return value.slice(1, -1).replace(/\\(U[\da-fA-F]{8}|u[\da-fA-F]{4}|x[\da-fA-F]{2}|[\\'"nrtbfva])/g, (_, code) => {
    if (/^[Uux]/.test(code)) return String.fromCodePoint(parseInt(code.slice(1), 16));
    return ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", a: "\x07" } as Record<string, string>)[code] ?? code;
  });
}

export function parseTaskList(response: any): Task[] {
  if (response.error || response.result?.isError) throw new TaskSyncError("Zo could not provide the task list. Try again.");
  const content = response.result?.content;
  if (!Array.isArray(content)) throw new TaskSyncError("Zo returned an unreadable task list. Your saved list was kept.");
  const entries = JSON.parse(content.filter((item: any) => item.type === "text").map((item: any) => item.text).join("\n"));
  if (!Array.isArray(entries) || entries.length > 1000) throw new Error("Invalid task list");
  const tasks = entries.map((entry: unknown) => {
    if (typeof entry !== "string") throw new Error("Invalid task entry");
    const fields = new Map<string, string>();
    for (const match of entry.matchAll(/(?:^| )([a-z_]+)=('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|True|False|None)(?= |$)/g)) {
      if (fields.has(match[1])) throw new Error("Duplicate task field");
      fields.set(match[1], match[2]);
    }
    const id = fields.get("id"), name = fields.get("title"), schedule = fields.get("rrule"), active = fields.get("active");
    if (!id || !name || !schedule || !["True", "False"].includes(active || "")) throw new Error("Missing task fields");
    const task = { id: quoted(id), name: quoted(name), schedule: quoted(schedule).replace(/\\n/g, "\n"), active: active === "True" };
    if (!/^[\da-f-]{36}$/i.test(task.id) || !task.name || task.name.length > 500 || !task.schedule.includes("RRULE:")) throw new Error("Invalid task fields");
    return task;
  });
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new Error("Duplicate task IDs");
  return tasks;
}

async function saveTaskList(list: TaskList) {
  const temporary = join(import.meta.dir, ".automations-" + randomUUID() + ".local.json");
  try {
    await writeFile(temporary, JSON.stringify(list, null, 2) + "\n", { mode: 0o600 });
    await rename(temporary, join(import.meta.dir, "automations.local.json"));
  } finally { await unlink(temporary).catch(() => {}); }
}

export function createTaskListSync(options: {
  request?: typeof fetch; token?: () => string | undefined;
  save?: (list: TaskList) => Promise<void>; now?: () => number;
} = {}) {
  const request = options.request || fetch;
  const token = options.token || (() => process.env.ZO_CLIENT_IDENTITY_TOKEN);
  const save = options.save || saveTaskList;
  const now = options.now || Date.now;
  let pending: Promise<TaskList> | undefined;
  let lastAttempt = -Infinity;
  let lastResult: TaskList | undefined;
  return (): Promise<TaskList> => {
    if (pending) return pending;
    if (now() - lastAttempt < 30_000) {
      if (lastResult) return Promise.resolve(lastResult);
      return Promise.reject(new TaskSyncError("Please wait 30 seconds before trying again.", 429));
    }
    lastAttempt = now();
    lastResult = undefined;
    pending = (async () => {
      const secret = token();
      if (!secret) throw new TaskSyncError("Garden’s connection to Zo is unavailable. Your saved list was kept.");
      const response = await request("https://api.zo.computer/mcp", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(25_000),
        headers: { Authorization: /^Bearer /i.test(secret) ? secret : "Bearer " + secret,
          "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "garden-task-list", method: "tools/call", params: { name: "list_automations", arguments: {} } })
      });
      if (!response.ok) throw new TaskSyncError("Garden could not connect to Zo. Your saved list was kept. Try again.");
      const text = await response.text();
      if (text.length > 1_000_000) throw new Error("Task list too large");
      const payload = response.headers.get("content-type")?.includes("text/event-stream")
        ? text.split(/\r?\n/).filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6))).find(item => item.id === "garden-task-list")
        : JSON.parse(text);
      const list = { observedAt: new Date(now()).toISOString(), automations: parseTaskList(payload) };
      await save(list);
      lastResult = list;
      return list;
    })().catch(error => {
      if (error instanceof TaskSyncError) throw error;
      throw new TaskSyncError("The task list could not be updated. Your saved list was kept. Try again.");
    }).finally(() => { pending = undefined; });
    return pending;
  };
}
