import configparser
import glob
import json
import os
import re
import socket
import sqlite3
import time
import xmlrpc.client
from pathlib import Path
from urllib.parse import quote

ROOT = Path("/home/workspace")
SUPERVISOR = Path("/etc/zo/supervisord-user.conf")
SKIP = {"Trash", ".Trash", ".git", "node_modules", ".venv", "venv", "__pycache__", ".cache", "cache", "caches", ".npm", ".bun"}
SCAN_ROOTS = [ROOT, Path("/root/.openclaw"), Path("/root/.hermes"), Path("/root/.codex"), Path("/home/.z")]
issues = []


def read_json(path, default):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return default


def service_inventory():
    config = configparser.ConfigParser(interpolation=None)
    if not config.read(SUPERVISOR):
        raise RuntimeError("Supervisor configuration unavailable")
    live = {}
    try:
        address = config["inet_http_server"]["port"]
        username = config["inet_http_server"].get("username", "")
        password = config["inet_http_server"].get("password", "")
        auth = f"{quote(username, safe='')}:{quote(password, safe='')}@" if username else ""
        socket.setdefaulttimeout(4)
        proxy = xmlrpc.client.ServerProxy(f"http://{auth}{address}/RPC2")
        live = {row["name"]: row for row in proxy.supervisor.getAllProcessInfo()}
    except Exception:
        issues.append("Supervisor process status unavailable; service state is unknown.")
    metadata = {s["name"]: s for s in read_json("/__substrate/runtime_config.json", {}).get("services", [])}
    services = []
    for section in config.sections():
        if not section.startswith("program:"):
            continue
        name = section.removeprefix("program:")
        if name.startswith("frpc-"):
            continue
        setting = config[section]
        state = live.get(name, {})
        meta = metadata.get(name, {})
        ports = set()
        for key, value in meta.get("env_vars", {}).items():
            if (key == "PORT" or key.endswith("_PORT")) and str(value).isdigit():
                ports.add(int(value))
        command = setting.get("command", "")
        for value in re.findall(r"(?:--port[= ]|--http=127\.0\.0\.1:|http\.server\s+)(\d+)", command):
            ports.add(int(value))
        if meta.get("port"):
            ports.add(int(meta["port"]))
        services.append({
            "id": "service:" + name, "name": name,
            "workdir": setting.get("directory", meta.get("workdir", "")),
            "status": state.get("statename", "UNKNOWN").lower(),
            "pid": state.get("pid") or None,
            "startedAt": state.get("start") or None,
            "enabled": setting.getboolean("autostart", fallback=True),
            "ports": sorted(p for p in ports if p > 0),
            "source": str(SUPERVISOR),
        })
    return services


def database_inventory(services):
    databases = []
    seen = set()
    deadline = time.monotonic() + 18
    errors = []
    complete = True
    def onerror(error):
        errors.append(str(error.filename))
    for root in SCAN_ROOTS:
        if not root.exists():
            continue
        for directory, dirs, files in os.walk(root, followlinks=False, onerror=onerror):
            dirs[:] = [d for d in dirs if d not in SKIP and not os.path.islink(os.path.join(directory, d))]
            if time.monotonic() > deadline:
                complete = False
                break
            for name in files:
                if not name.endswith((".db", ".sqlite", ".sqlite3", ".duckdb")):
                    continue
                path = Path(directory) / name
                try:
                    if path.is_symlink():
                        continue
                    real = str(path.resolve())
                    if real in seen:
                        continue
                    seen.add(real)
                    with path.open("rb") as file:
                        magic = file.read(16)
                    engine = "SQLite" if magic == b"SQLite format 3\x00" else "DuckDB" if magic[8:12] == b"DUCK" else None
                    if not engine:
                        continue
                    stat = path.stat()
                    parts = set(path.parts)
                    category = "application"
                    if any("backup" in p or "archive" in p for p in parts):
                        category = "backup"
                    elif parts & {"_tmp", "_scratch", "_debug", "tests", "test", ".wrangler", "worktree"}:
                        category = "development"
                    elif real.startswith("/root/.codex/") or real.startswith("/home/.z/"):
                        category = "host runtime"
                    elif real.startswith(("/root/.openclaw/", "/root/.hermes/")):
                        category = "agent runtime"
                    owners = [s for s in services if s["workdir"] and real.startswith(os.path.realpath(s["workdir"]).rstrip("/") + "/")]
                    owner = max(owners, key=lambda s: len(s["workdir"])) if owners else None
                    wal = Path(str(path) + "-wal")
                    wal_bytes = wal.stat().st_size if wal.exists() else 0
                    databases.append({
                        "id": "database:" + real, "name": name, "path": real,
                        "engine": engine, "category": category, "bytes": stat.st_size,
                        "walBytes": wal_bytes, "modifiedAt": stat.st_mtime,
                        "owner": owner["id"] if owner else None,
                        "ownershipEvidence": "service working directory" if owner else "unmapped",
                        "backup": {"status": "unknown", "lastAt": None},
                    })
                except OSError:
                    errors.append(str(path))
        if not complete:
            break
    if not complete:
        issues.append("Database scan reached its time limit; inventory is partial.")
    if errors:
        issues.append(f"Database scan could not read {len(errors)} paths.")
    for db in databases:
        if db["path"] in ["/root/.hermes/profiles/runa/state.db", "/root/.hermes/profiles/runa/projects.db"]:
            candidates = sorted(glob.glob("/root/.hermes/backups/runa/20??????T??????Z/" + db["name"]))
            if candidates:
                latest = Path(candidates[-1])
                manifest = latest.parent / "SHA256SUMS"
                if manifest.exists() and db["name"] in manifest.read_text():
                    db["backup"] = {"status": "snapshot found", "lastAt": latest.stat().st_mtime,
                                    "path": str(latest), "verification": "checksum manifest present; restore not tested by oversight"}
    return databases, {"roots": [str(p) for p in SCAN_ROOTS], "complete": complete and not errors,
                       "excludedDirectories": sorted(SKIP), "unreadablePaths": len(errors)}


def youtube_evidence():
    path = ROOT / "Start/pal/pal-workflow-youtuberesearch/outputs/youtube-research.sqlite"
    try:
        connection = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=1)
        try:
            row = connection.execute("SELECT MAX(created_at), COUNT(*) FROM summaries").fetchone()
            return {"lastAt": row[0], "records": row[1], "status": "saved output" if row[0] else "no saved outputs",
                    "source": str(path), "limitation": "Saved successes only; failed or deleted runs are not recorded here."}
        finally:
            connection.close()
    except (OSError, sqlite3.Error):
        return {"status": "unknown", "lastAt": None}


def main():
    services = service_inventory()
    databases, coverage = database_inventory(services)
    print(json.dumps({"services": services, "databases": databases, "coverage": coverage,
                      "issues": issues, "youtubeEvidence": youtube_evidence()}))


if __name__ == "__main__":
    main()
