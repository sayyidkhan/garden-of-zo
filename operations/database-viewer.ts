import { lstat, open, realpath } from "node:fs/promises";
import { join } from "node:path";

type RecordRow = Record<string, any>;
const duckdbAvailable = Bun.spawnSync(["python3", "-c", "import importlib.util; raise SystemExit(0 if importlib.util.find_spec('duckdb') else 1)"]).exitCode === 0;
let active = 0;

export async function databaseViewerCapability(row: RecordRow) {
  if (row.backupOnly) return { available: false, reason: "Original source unconfirmed. Use backup details to inspect its location." };
  if (/(?:^|\/)(?:key[34]|cert[89]|cookies|login data|web data|credentials|secrets|tokens)(?:\.[^/]*)?$/i.test(row.path || ""))
    return { available: false, reason: "Credential and browser security stores cannot be viewed." };
  if (row.engine !== "SQLite" && row.engine !== "DuckDB") return { available: false, reason: "No viewer available for this database engine." };
  if (row.engine === "DuckDB" && !duckdbAvailable) return { available: false, reason: "The DuckDB engine is not installed." };
  try {
    if (!(await lstat(row.path)).isFile() || await realpath(row.path) !== row.path) throw new Error();
    const file = await open(row.path, "r");
    try {
      const magic = Buffer.alloc(16);
      await file.read(magic, 0, 16, 0);
      if (row.engine === "SQLite" ? magic.toString() !== "SQLite format 3\0" : magic.subarray(8, 12).toString() !== "DUCK") throw new Error();
    } finally { await file.close(); }
    return { available: true, reason: "View database records (read-only)" };
  } catch { return { available: false, reason: "Database file is missing, unreadable or no longer matches its engine." }; }
}

export class DatabaseViewError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function readDatabasePage(databases: RecordRow[], params: URLSearchParams) {
  const row = databases.find(item => item.id === params.get("id"));
  if (!row) throw new DatabaseViewError("Database is not in the current inventory.", 404);
  const capability = await databaseViewerCapability(row);
  if (!capability.available) throw new DatabaseViewError(capability.reason, 409);
  const offset = Number(params.get("offset") || "0");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) throw new DatabaseViewError("Invalid page.");
  const search = params.get("search") || "";
  let filters: any;
  try { filters = JSON.parse(params.get("filters") || "[]"); } catch { throw new DatabaseViewError("Invalid filters."); }
  let sort: any;
  try { sort = JSON.parse(params.get("sort") || "null"); } catch { throw new DatabaseViewError("Invalid sort."); }
  if (sort !== null && (!sort || Array.isArray(sort) || typeof sort.column !== "string" || sort.column.length > 512 || !["asc", "desc"].includes(sort.direction)))
    throw new DatabaseViewError("Invalid sort.");
  const distinct = params.get("distinct");
  const valueSearch = params.get("valueSearch") || "";
  if ((distinct !== null && distinct.length > 512) || valueSearch.length > 200) throw new DatabaseViewError("Invalid value search.");
  const operators = ["contains", "equals", "notEquals", "empty", "notEmpty", "in", "notIn"];
  const validValue = (filter: any) => {
    if (typeof filter.value !== "string") return false;
    if (!["in", "notIn"].includes(filter.operator)) return filter.value.length <= 200;
    if (filter.value.length > 16000) return false;
    try {
      const values = JSON.parse(filter.value);
      return Array.isArray(values) && values.length <= 500 && values.every(value => value === null || typeof value === "string" && value.length <= 2000);
    } catch { return false; }
  };
  if (search.length > 200 || !Array.isArray(filters) || filters.length > 8 || filters.some(filter =>
    !filter || typeof filter.column !== "string" || filter.column.length > 512 ||
    !operators.includes(filter.operator) || !validValue(filter)))
    throw new DatabaseViewError("Use up to 8 filters and 200 characters per search or value.");
  if (active >= 2) throw new DatabaseViewError("The viewer is busy. Try again shortly.", 429);
  active++;
  try {
    const child = Bun.spawn(["python3", join(import.meta.dir, "database_viewer.py")], {
      stdin: new Response(JSON.stringify({ path: row.path, engine: row.engine, table: params.get("table"), offset, search, filters, sort, distinct, valueSearch })),
      stdout: "pipe", stderr: "ignore"
    });
    const timer = setTimeout(() => child.kill(), 5000);
    try {
      const [output, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
      if (code !== 0) throw new DatabaseViewError("Could not read this database. It may be busy, encrypted or unavailable. Close the viewer and try again.", 409);
      const result = JSON.parse(output);
      if (result.error) throw new DatabaseViewError(result.error);
      return { ...result, engine: row.engine, readOnly: true };
    } finally { clearTimeout(timer); }
  } finally { active--; }
}
