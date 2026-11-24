import { expect, test } from "bun:test";
import { filterColumnRows, readColumnState, sortColumnRows } from "./client/column-controls.js";
import { createHandler } from "./server";
import { join } from "node:path";

const columns = [
  { key: "name", label: "Name", value: (row: any) => row.name },
  { key: "category", label: "Category", value: (row: any) => row.category },
  { key: "size", label: "Size", value: (row: any) => row.size, numeric: true }
];
const rows = [
  { id: "a", name: "state 10", category: "PAL", size: 2048 },
  { id: "b", name: "state 2", category: "GOZ", size: 0 },
  { id: "c", name: "state 2", category: "PAL", size: 10240 },
  { id: "d", name: "", category: "PAL", size: null }
];

test("column filters intersect, support blank and no selections, and expose other column facets", () => {
  const state = readColumnState({ filters: { category: ["PAL"], name: ["state 2"] } }, columns);
  expect(filterColumnRows(rows, columns, state).map(row => row.id)).toEqual(["c"]);
  expect(filterColumnRows(rows, columns, state, "name").map(row => row.id)).toEqual(["a", "c", "d"]);
  expect(filterColumnRows(rows, columns, readColumnState({ filters: { name: [""] } }, columns)).map(row => row.id)).toEqual(["d"]);
  expect(filterColumnRows(rows, columns, readColumnState({ filters: { category: [] } }, columns))).toEqual([]);
  expect(filterColumnRows(rows, columns, readColumnState(null, columns))).toEqual(rows);
});

test("numeric sorts compare raw numbers, keep zero valid and unknown values last in both directions", () => {
  for (const [direction, expected] of [["asc", ["b", "a", "c", "d"]], ["desc", ["c", "a", "b", "d"]]] as const) {
    expect(sortColumnRows(rows, columns, readColumnState({ sort: { key: "size", direction } }, columns)).map(row => row.id)).toEqual(expected);
  }
  expect(rows.map(row => row.id)).toEqual(["a", "b", "c", "d"]);
});

test("text sorting is natural and deterministic and date sort values keep unknown dates last", () => {
  expect(sortColumnRows(rows, columns, readColumnState({ sort: { key: "name", direction: "asc" } }, columns)).map(row => row.id)).toEqual(["b", "c", "a", "d"]);
  const dates = [{ key: "date", value: (row: any) => row.name, sortValue: (row: any) => row.size, numeric: true }];
  expect(sortColumnRows(rows, dates, readColumnState({ sort: { key: "date", direction: "desc" } }, dates)).map(row => row.id)).toEqual(["c", "a", "b", "d"]);
});

test("URL column state validates fields and types, deduplicates and round trips exact values", () => {
  expect(readColumnState("invalid json", columns)).toEqual({ filters: {}, sort: null });
  expect(readColumnState(JSON.stringify({ filters: { category: ["PAL", "PAL"], size: [100], unknown: ["x"] }, sort: { key: "unknown", direction: "asc" } }), columns)).toEqual({ filters: { category: ["PAL"] }, sort: null });
  const state = readColumnState({ filters: { name: ['<script>"&', ""] }, sort: { key: "size", direction: "desc" } }, columns);
  expect(readColumnState(JSON.stringify(state), columns)).toEqual(state);
  expect(readColumnState({ sort: { key: "name", direction: "invalid" } }, columns).sort).toBeNull();
});

test("shared column client is versioned and served publicly without exposing inventory", async () => {
  const handler = createHandler(join(import.meta.dir, "../zo-router/public.routes.json"));
  const page = await (await handler(new Request("http://localhost/"))).text();
  expect(page).toMatch(/data-column-client="\/garden-client.js\?module=columns&amp;v=[a-f0-9]{12}"/);
  const client = await handler(new Request("http://localhost/garden-client.js?module=columns"));
  expect(client.status).toBe(200);
  const code = await client.text();
  expect(code).toContain("createColumnControls");
  expect(code).not.toContain("/operations/api/inventory");
  expect((await handler(new Request("http://localhost/operations/api/inventory?module=columns"))).status).toBe(404);
});
