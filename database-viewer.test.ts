import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm, readFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { databaseViewerCapability, readDatabasePage } from "./operations/database-viewer";
import { createHandler } from "./server";

test("viewer reads WAL records, paginates and validates table names without writing", async () => {
  const root = await mkdtemp(join(import.meta.dir, "_scratch/viewer-test-"));
  const path = join(root, "fixture.sqlite");
  const db = new Database(path);
  try {
    db.exec('PRAGMA journal_mode=WAL; CREATE TABLE "quoted""table" (id INTEGER PRIMARY KEY, value TEXT, empty TEXT, file BLOB);');
    const insert = db.prepare('INSERT INTO "quoted""table" VALUES (?, ?, NULL, ?)');
    for (let i = 0; i < 53; i++) insert.run(i, i === 0 ? "<script>unsafe</script>" : "x".repeat(2100), Buffer.from([1, 2]));
    const row = { id: "fixture", path, engine: "SQLite" };
    const records = [row];
    const before = await readFile(path);
    const walBefore = await readFile(path + "-wal");
    expect((await databaseViewerCapability(row)).available).toBe(true);
    const tables = await readDatabasePage(records, new URLSearchParams({ id: row.id }));
    expect(tables.tables).toEqual(['quoted"table']);
    const page = await readDatabasePage(records, new URLSearchParams({ id: row.id, table: tables.tables[0] }));
    expect(page.rows.length).toBe(50);
    expect((await readDatabasePage(records, new URLSearchParams({ id: row.id, table: tables.tables[0], sort: JSON.stringify({ column: "id", direction: "desc" }) }))).rows[0][0]).toBe(52);
    expect(page.rows[0]).toEqual([0, "<script>unsafe</script>", null, "[Binary: 2 bytes]"]);
    expect(page.hasMore).toBe(true);
    expect(page.rows[1][1].length).toBeLessThan(2050);
    const last = await readDatabasePage(records, new URLSearchParams({ id: row.id, table: tables.tables[0], offset: "50" }));
    expect(last.rows.length).toBe(3);
    expect(last.hasMore).toBe(false);
    await expect(readDatabasePage(records, new URLSearchParams({ id: row.id, table: 'quoted"; DROP TABLE x;--' }))).rejects.toThrow("Choose a table");
    await expect(readDatabasePage(records, new URLSearchParams({ id: row.id, offset: "-1" }))).rejects.toThrow("Invalid page");
    await expect(readDatabasePage(records, new URLSearchParams({ id: "/etc/passwd" }))).rejects.toThrow("current inventory");
    expect(await readFile(path)).toEqual(before);
    expect(await readFile(path + "-wal")).toEqual(walBefore);
    await symlink(path, join(root, "link.sqlite"));
    expect((await databaseViewerCapability({ ...row, path: join(root, "link.sqlite") })).available).toBe(false);
    for (const denied of [{ ...row, backupOnly: true }, { ...row, engine: "Unknown" }, { ...row, path: join(root, "missing.sqlite") }, { ...row, path: join(root, "key4.db") }]) {
      expect((await databaseViewerCapability(denied)).available).toBe(false);
    }
  } finally { db.close(); await rm(root, { recursive: true, force: true }); }
});

test("DuckDB viewer uses the installed engine in read-only mode", async () => {
  const root = await mkdtemp(join(import.meta.dir, "_scratch/viewer-duck-"));
  const path = join(root, "fixture.duckdb");
  try {
    const result = Bun.spawnSync(["python3", "-c", "import duckdb,sys; c=duckdb.connect(sys.argv[1]); c.execute('create table sample as select 42 as answer'); c.close()", path]);
    expect(result.exitCode).toBe(0);
    const before = await readFile(path);
    const row = { id: "duck", path, engine: "DuckDB" };
    expect((await databaseViewerCapability(row)).available).toBe(true);
    const tables = await readDatabasePage([row], new URLSearchParams({ id: row.id }));
    expect(tables.tables).toEqual(["main.sample"]);
    expect((await readDatabasePage([row], new URLSearchParams({ id: row.id, table: "main.sample" }))).rows).toEqual([[42]]);
    expect(await readFile(path)).toEqual(before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("public viewer stays inaccessible and private writes and cross-site reads are blocked", async () => {
  const routeRoot = join(import.meta.dir, "../zo-router");
  const publicHandler = createHandler(join(routeRoot, "public.routes.json"));
  const privateHandler = createHandler(join(routeRoot, "private.routes.json"));
  const url = "http://localhost/operations/api/database-viewer?id=anything";
  expect((await publicHandler(new Request(url, { headers: { host: "private-apps-sayyidkhan.zo.computer" } }))).status).toBe(404);
  expect((await privateHandler(new Request(url, { method: "POST" }))).status).toBe(405);
  expect((await privateHandler(new Request(url, { headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
});

test("both engines search the whole table and combine validated literal column filters without writing", async () => {
  for (const engine of ["SQLite", "DuckDB"]) {
    const root = await mkdtemp(join(import.meta.dir, "_scratch/viewer-search-"));
    const path = join(root, engine === "SQLite" ? "search.sqlite" : "search.duckdb");
    try {
      const setup = Bun.spawnSync(["python3", "-c", `
import sqlite3, sys
if sys.argv[2] == "SQLite":
 c = sqlite3.connect(sys.argv[1])
else:
 import duckdb
 c = duckdb.connect(sys.argv[1])
c.execute('CREATE TABLE sample (id INTEGER, name TEXT, category TEXT, optional TEXT)')
c.executemany('INSERT INTO sample VALUES (?, ?, ?, ?)', [(i, 'Needle' if i >= 60 else 'ordinary', 'even' if i % 2 == 0 else 'odd', None if i % 2 == 0 else '') for i in range(130)])
c.execute('INSERT INTO sample VALUES (130, ?, ?, ?)', ["%_quote' OR 1=1 --", "special", "present"])
c.execute('ALTER TABLE sample ADD COLUMN "rank""key" INTEGER')
c.execute('UPDATE sample SET "rank""key" = id')
c.commit()
c.close()
`, path, engine]);
      expect(setup.exitCode).toBe(0);
      const before = await readFile(path);
      const table = engine === "SQLite" ? "sample" : "main.sample";
      const query = (extra = {}) => readDatabasePage([{ id: "search", path, engine }], new URLSearchParams({ id: "search", table, ...extra }));
      const first = await query({ search: "NEEDLE" });
      expect(first.rows.length).toBe(50);
      expect(first.rows[0][0]).toBe(60);
      expect(first.hasMore).toBe(true);
      const last = await query({ search: "NEEDLE", offset: "50" });
      expect(last.rows.length).toBe(20);
      expect(last.rows[0][0]).toBe(110);
      const combined = await query({ search: "needle", filters: JSON.stringify([
        { column: "category", operator: "equals", value: "EVEN" },
        { column: "optional", operator: "empty", value: "" }
      ]) });
      expect(combined.rows.length).toBe(35);
      expect(combined.rows.every((row: any[]) => row[0] >= 60 && row[0] % 2 === 0)).toBe(true);
      expect((await query({ search: "%_quote' OR 1=1 --" })).rows.length).toBe(1);
      expect((await query({ filters: JSON.stringify([{ column: "optional", operator: "notEmpty", value: "" }]) })).rows.length).toBe(1);
      expect((await query({ filters: JSON.stringify([{ column: "category", operator: "notEquals", value: "even" }]) })).rows.length).toBe(50);
      expect((await query({ filters: JSON.stringify([{ column: "id", operator: "equals", value: "129" }]) })).rows[0][0]).toBe(129);
      expect((await query({ search: "not found" })).rows).toEqual([]);
      await expect(query({ filters: JSON.stringify([{ column: 'id"; DROP TABLE sample;--', operator: "equals", value: "1" }]) })).rejects.toThrow("Choose a filter column");
      await expect(query({ filters: JSON.stringify([{ column: "id", operator: "sql", value: "1" }]) })).rejects.toThrow("Use up to");
      await expect(query({ filters: "{}" })).rejects.toThrow("Use up to");
      await expect(query({ filters: "[" })).rejects.toThrow("Invalid filters");
      await expect(query({ search: "x".repeat(201) })).rejects.toThrow("Use up to");
      await expect(query({ filters: JSON.stringify(Array(9).fill({ column: "id", operator: "equals", value: "1" })) })).rejects.toThrow("Use up to");
      const sorted = (column: string, direction: string, extra = {}) => query({ sort: JSON.stringify({ column, direction }), ...extra });
      const ascending = await sorted("id", "asc");
      expect(ascending.rows.map((row: any[]) => row[0])).toEqual(Array.from({ length: 50 }, (_, i) => i));
      expect((await sorted('rank"key', "desc")).rows[0][0]).toBe(130);
      const descending = await sorted("id", "desc");
      expect(descending.rows.map((row: any[]) => row[0])).toEqual(Array.from({ length: 50 }, (_, i) => 130 - i));
      const secondPage = await sorted("id", "desc", { offset: "50" });
      expect(secondPage.rows[0][0]).toBe(80);
      expect(secondPage.rows[49][0]).toBe(31);
      const sortedFiltered = await sorted("id", "desc", { search: "needle", filters: JSON.stringify([{ column: "category", operator: "equals", value: "even" }]) });
      expect(sortedFiltered.rows.map((row: any[]) => row[0])).toEqual(Array.from({ length: 35 }, (_, i) => 128 - 2 * i));
      expect((await sorted("name", "desc")).rows.every((row: any[]) => row[1] === "ordinary")).toBe(true);
      for (const direction of ["asc", "desc"]) {
        expect((await sorted("optional", direction, { offset: "100" })).rows.every((row: any[]) => row[3] === null)).toBe(true);
      }
      expect((await query({ sort: "null" })).rows).toEqual((await query()).rows);
      await expect(sorted('id"; DROP TABLE sample;--', "asc")).rejects.toThrow("Choose a sort column");
      await expect(sorted("id", "desc; DROP TABLE sample")).rejects.toThrow("Invalid sort");
      for (const sort of ["[", "{}", "[]", '"id"', '{"column":1,"direction":"asc"}']) {
        await expect(query({ sort })).rejects.toThrow("Invalid sort");
      }
      expect(await readFile(path)).toEqual(before);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("distinct values span the whole table, paginate, search and filter exact choices on both engines", async () => {
  for (const engine of ["SQLite", "DuckDB"]) {
    const root = await mkdtemp(join(import.meta.dir, "_scratch/viewer-values-"));
    const path = join(root, engine === "SQLite" ? "values.sqlite" : "values.duckdb");
    try {
      const setup = Bun.spawnSync(["python3", "-c", `
import sqlite3, sys
if sys.argv[2] == 'SQLite':
 c = sqlite3.connect(sys.argv[1])
else:
 import duckdb
 c = duckdb.connect(sys.argv[1])
c.execute('CREATE TABLE sample (id INTEGER, value TEXT)')
c.executemany('INSERT INTO sample VALUES (?, ?)', [(i, 'value-%03d' % i) for i in range(260)] + [(260, None), (261, ''), (262, 'Case'), (263, 'case'), (264, "quote' OR 1=1 --"), (265, 'value-259')])
c.commit()
c.close()
`, path, engine]);
      expect(setup.exitCode).toBe(0);
      const before = await readFile(path);
      const query = (extra = {}) => readDatabasePage([{ id: "values", path, engine }], new URLSearchParams({ id: "values", table: engine === "SQLite" ? "sample" : "main.sample", ...extra }));
      const first = await query({ distinct: "value" });
      expect(first.values.length).toBe(200);
      expect(first.values[0]).toBe(null);
      expect(first.values[1]).toBe("");
      expect(first.hasMore).toBe(true);
      const next = await query({ distinct: "value", offset: "200" });
      expect(next.values.length).toBe(65);
      expect(next.hasMore).toBe(false);
      expect(new Set([...first.values, ...next.values]).size).toBe(265);
      expect((await query({ distinct: "value", valueSearch: "VALUE-259" })).values).toEqual(["value-259"]);
      const filtered = (operator: string, values: any[], extra = {}) => query({ filters: JSON.stringify([{ column: "value", operator, value: JSON.stringify(values) }]), ...extra });
      expect((await filtered("in", ["value-259"])).rows.map((row: any[]) => row[0])).toEqual([259, 265]);
      expect((await filtered("in", [null, "", "Case"])).rows.map((row: any[]) => row[0])).toEqual([260, 261, 262]);
      expect((await filtered("notIn", ["case"], { search: "case" })).rows.map((row: any[]) => row[0])).toEqual([262]);
      expect((await filtered("in", ["quote' OR 1=1 --"])).rows.length).toBe(1);
      expect((await filtered("in", [])).rows).toEqual([]);
      expect((await filtered("notIn", [])).rows.length).toBe(50);
      expect((await filtered("notIn", [null, ""], { search: "Case" })).rows.length).toBe(2);
      await expect(query({ distinct: 'value"; DROP TABLE sample;--' })).rejects.toThrow("Choose a value column");
      await expect(filtered("in", [1])).rejects.toThrow("Use up to");
      await expect(filtered("in", Array(501).fill("x"))).rejects.toThrow("Use up to");
      expect(await readFile(path)).toEqual(before);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});
