import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

type Result = { verifiedDatabases: number; skipped: unknown[]; failures: unknown[] };
type State = { running: boolean; result?: Result; error?: string };

export async function runBackupUpdate(inventory: any): Promise<Result> {
  if (inventory.stale || !inventory.coverage?.databases?.complete) throw new Error("Incomplete inventory");
  const selected = { ...inventory, databases: inventory.databases.filter((row: any) =>
    ["application", "agent runtime"].includes(row.category) && row.engine === "SQLite" &&
    ["unknown", "old snapshot"].includes(row.backup?.status)) };
  const scratch = join(import.meta.dir, "../_scratch");
  await mkdir(scratch, { recursive: true });
  const folder = await mkdtemp(join(scratch, "backup-update-"));
  try {
    const input = join(folder, "inventory.json");
    await writeFile(input, JSON.stringify(selected), { mode: 0o600 });
    const process = Bun.spawn(["python3", join(import.meta.dir, "database_backups.py"), "--inventory", input, "--refresh-existing"],
      { stdout: "pipe", stderr: "ignore" });
    const timeout = setTimeout(() => process.kill(), 600_000);
    try {
      const [output, code] = await Promise.all([new Response(process.stdout).text(), process.exited]);
      if (![0, 1].includes(code)) throw new Error("Backup process failed");
      const result = JSON.parse(output);
      if (!Number.isInteger(result.verifiedDatabases) || !Array.isArray(result.skipped) || !Array.isArray(result.failures)) throw new Error("Invalid backup report");
      return { verifiedDatabases: result.verifiedDatabases, skipped: result.skipped, failures: result.failures };
    } finally { clearTimeout(timeout); }
  } finally { await rm(folder, { recursive: true, force: true }); }
}

export function createBackupUpdate(collect: () => Promise<any>, run = runBackupUpdate, now = Date.now) {
  let state: State = { running: false };
  let finishedAt = -Infinity;
  return {
    status: () => state,
    start: () => {
      if (state.running || now() - finishedAt < 60_000) return state;
      state = { running: true };
      void collect().then(run).then(result => { state = { running: false, result }; }).catch(() => {
        state = { running: false, error: "The backup check could not finish. Refresh Garden to see current evidence, then try again. Existing backups were kept." };
      }).finally(() => { finishedAt = now(); });
      return state;
    }
  };
}
