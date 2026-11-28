import datetime
import decimal
import json
import os
import sqlite3
import sys
import time
from urllib.parse import quote

PAGE_SIZE = 50


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def cell(value):
    if isinstance(value, bytes):
        return "[Binary: " + str(len(value)) + " bytes]"
    if isinstance(value, (datetime.date, datetime.time, decimal.Decimal)):
        value = str(value)
    if value is not None and not isinstance(value, (str, int, float, bool)):
        value = str(value)
    if isinstance(value, float) and not __import__("math").isfinite(value):
        value = str(value)
    return value[:2000] + "… [truncated]" if isinstance(value, str) and len(value) > 2000 else value


def read_page(request):
    path = request["path"]
    if os.path.realpath(path) != path or not os.path.isfile(path):
        raise ValueError("Unavailable file")
    if request["engine"] == "SQLite":
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (384 * 1024 * 1024, 384 * 1024 * 1024))
        connection = sqlite3.connect("file:" + quote(path, safe="/") + "?mode=ro", uri=True, timeout=0.25)
        connection.execute("PRAGMA query_only=ON")
        connection.execute("PRAGMA trusted_schema=OFF")
        connection.setlimit(sqlite3.SQLITE_LIMIT_LENGTH, 1024 * 1024)
        deadline = time.monotonic() + 3
        connection.set_progress_handler(lambda: int(time.monotonic() > deadline), 1000)
        tables = [row[0] for row in connection.execute(
            "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' "
            "AND upper(ltrim(sql)) NOT LIKE 'CREATE VIRTUAL%' ORDER BY name LIMIT 501")]
        qualified = lambda table: identifier(table)
    else:
        import duckdb
        connection = duckdb.connect(path, read_only=True, config={
            "enable_external_access": "false", "autoinstall_known_extensions": "false",
            "autoload_known_extensions": "false", "threads": "1", "memory_limit": "128MB"
        })
        table_names = connection.execute(
            "SELECT table_schema, table_name FROM information_schema.tables "
            "WHERE table_type='BASE TABLE' ORDER BY table_schema, table_name LIMIT 501").fetchall()
        table_map = {schema + "." + name: (schema, name) for schema, name in table_names}
        tables = list(table_map)
        qualified = lambda table: ".".join(identifier(part) for part in table_map[table])
    try:
        table = request.get("table")
        if table is None:
            return {"tables": tables[:500], "tablesLimited": len(tables) > 500}
        if table not in tables[:500]:
            return {"error": "Choose a table from this database."}
        source = qualified(table)
        cursor = connection.execute("SELECT * FROM " + source + " LIMIT 0")
        columns = [entry[0] for entry in cursor.description]
        if len(columns) > 100:
            return {"error": "This table has more than 100 columns and cannot be previewed."}
        distinct = request.get("distinct")
        if distinct is not None:
            if distinct not in columns:
                return {"error": "Choose a value column from this table."}
            field = identifier(distinct)
            if request["engine"] == "SQLite":
                if connection.execute("SELECT 1 FROM " + source + " WHERE typeof(" + field + ") = 'blob' LIMIT 1").fetchone():
                    return {"error": "Binary columns use condition filters instead of value checkboxes."}
            text = "CAST(" + field + " AS TEXT)"
            if connection.execute("SELECT 1 FROM " + source + " WHERE length(" + text + ") > 2000 LIMIT 1").fetchone():
                return {"error": "Values longer than 2,000 characters use condition filters instead of value checkboxes."}
            search_value = request.get("valueSearch", "")
            where = " WHERE instr(lower(" + text + "), lower(?)) > 0" if search_value else ""
            args = [search_value] if search_value else []
            result = connection.execute("SELECT DISTINCT " + text + " AS value FROM " + source + where + " ORDER BY value IS NOT NULL, value LIMIT 201 OFFSET ?", args + [request["offset"]]).fetchall()
            return {"values": [row[0] for row in result[:200]], "hasMore": len(result) > 200}
        clauses, values = [], []
        search = request.get("search", "")
        contains = lambda column: "instr(lower(CAST(" + identifier(column) + " AS TEXT)), lower(?)) > 0"
        if search:
            clauses.append("(" + " OR ".join(contains(column) for column in columns) + ")")
            values.extend([search] * len(columns))
        for rule in request.get("filters", []):
            column, operator, value = rule["column"], rule["operator"], rule["value"]
            if column not in columns:
                return {"error": "Choose a filter column from this table."}
            field = identifier(column)
            text = "lower(CAST(" + field + " AS TEXT))"
            if operator in ("in", "notIn"):
                selected = json.loads(value)
                strings = [item for item in selected if item is not None]
                parts = []
                if None in selected:
                    parts.append(field + " IS NULL")
                if strings:
                    parts.append("CAST(" + field + " AS TEXT) IN (" + ",".join("?" for _ in strings) + ")")
                    values.extend(strings)
                match = "(" + field + " IS NOT NULL AND " + parts.pop() + ")" if strings else "0=1"
                if parts:
                    match = "(" + " OR ".join(parts + [match]) + ")"
                clauses.append(("NOT (" + match + ")") if operator == "notIn" else match)
            elif operator == "contains":
                clauses.append(contains(column))
                values.append(value)
            elif operator in ("equals", "notEquals"):
                clauses.append(text + (" = " if operator == "equals" else " <> ") + "lower(?)")
                values.append(value)
            elif operator in ("empty", "notEmpty"):
                empty = "(" + field + " IS NULL OR CAST(" + field + " AS TEXT) = '')"
                clauses.append(("NOT " if operator == "notEmpty" else "") + empty)
            else:
                return {"error": "Unsupported filter."}
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        order = ""
        sort = request.get("sort")
        if sort is not None:
            if not isinstance(sort, dict) or sort.get("column") not in columns or sort.get("direction") not in ("asc", "desc"):
                return {"error": "Choose a sort column and direction from this table."}
            field = identifier(sort["column"])
            order = " ORDER BY " + field + " IS NULL ASC, " + field + (" ASC" if sort["direction"] == "asc" else " DESC")
        cursor = connection.execute("SELECT * FROM " + source + where + order + " LIMIT 51 OFFSET ?", values + [request["offset"]])
        rows = []
        size = 0
        for _ in range(PAGE_SIZE + 1):
            row = cursor.fetchone()
            if row is None:
                break
            values = [cell(value) for value in row]
            size += len(json.dumps(values))
            if size > 2 * 1024 * 1024:
                return {"error": "This page is too large to preview. Choose another table."}
            rows.append(values)
        return {"table": table, "columns": columns, "rows": rows[:PAGE_SIZE],
                "offset": request["offset"], "pageSize": PAGE_SIZE, "hasMore": len(rows) > PAGE_SIZE}
    finally:
        connection.close()


if __name__ == "__main__":
    print(json.dumps(read_page(json.load(sys.stdin)), allow_nan=False))
