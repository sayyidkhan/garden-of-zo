import argparse
import fcntl
import hashlib
import json
import os
import sqlite3
import tempfile
import time
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

EVIDENCE = Path(__file__).with_name("backups.local.json")
BACKUPS = Path("/home/workspace/Data/database-backups")
LEDGER = Path("/home/workspace/Start/pal/pal-projects/stakefolio/stakefolio-ledger")
HERMES = Path("/root/.hermes")
ORIN = Path("/home/workspace/Start/pal/pal-agent-orin")
SOURCE_ROOTS = (Path("/home/workspace"), HERMES)
VERIFICATION = "SHA-256 checked; isolated SQLite restore integrity and table counts checked; database only, not attachments or credentials"
NATIVE_VERIFICATION = "SHA-256 checked against app backup manifest; restore not tested by Garden; database only, not attachments or credentials"


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def readonly(path):
    return sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=5)


def counts(connection):
    names = [r[0] for r in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    return {name: connection.execute('SELECT COUNT(*) FROM "' + name.replace('"', '""') + '"').fetchone()[0]
            for name in names}


def backup_database(source, destination):
    if source.is_symlink() or not source.is_file():
        raise ValueError("Source must be an existing regular database")
    if destination.exists():
        raise ValueError("Refusing to overwrite a snapshot")
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    deadline = time.monotonic() + 60
    def progress(*args):
        if time.monotonic() > deadline:
            raise TimeoutError("Database backup timed out")
    with closing(readonly(source)) as src, closing(sqlite3.connect(destination)) as dst:
        src.backup(dst, pages=256, progress=progress)
        if dst.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("Snapshot integrity check failed")
        expected = counts(dst)
    destination.chmod(0o600)
    with tempfile.TemporaryDirectory(prefix="restore-", dir=destination.parent) as temporary:
        restored = Path(temporary) / "restored.sqlite"
        with closing(readonly(destination)) as src, closing(sqlite3.connect(restored)) as dst:
            src.backup(dst, pages=256, progress=progress)
            if dst.execute("PRAGMA integrity_check").fetchall() != [("ok",)] or counts(dst) != expected:
                raise ValueError("Restore verification failed")
    return {"path": str(destination), "lastAt": time.time(), "sha256": digest(destination),
            "verification": VERIFICATION}


def native_backup_root(source):
    for profile in ("orin", "runa"):
        sources = [HERMES / "profiles" / profile / name for name in ("state.db", "projects.db")]
        if profile == "orin":
            sources.append(ORIN / "workspace/karma.sqlite")
        if source in sources:
            return HERMES / "backups" / profile
    return None


def native_backup(source):
    root = native_backup_root(source)
    if root is None or not root.is_dir():
        return None
    folders = sorted(root.glob("20*T*Z"), reverse=True)
    if source == ORIN / "workspace/karma.sqlite":
        folders = [root / "current-karma"]
    elif source == HERMES / "profiles/orin/projects.db":
        folders = [root / "current-projects", *folders]
    for folder in folders:
        path = folder / source.name
        try:
            if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
                continue
            manifest = folder / "checksums.json"
            if manifest.is_file():
                expected = json.loads(manifest.read_text())[source.name]
            else:
                lines = (folder / "SHA256SUMS").read_text().splitlines()
                matches = [parts[0] for line in lines if len(parts := line.split()) == 2
                           and parts[1].lstrip("*") == source.name]
                if len(matches) != 1:
                    continue
                expected = matches[0]
            if digest(path) != expected:
                continue
            return {"path": str(path), "lastAt": path.stat().st_mtime, "sha256": expected,
                    "verification": NATIVE_VERIFICATION}
        except (OSError, KeyError, TypeError, ValueError):
            continue
    return None


def verified_evidence(source, entries):
    entry = entries.get(str(source))
    if not isinstance(entry, dict):
        return None
    try:
        path = Path(entry["path"])
        verification = entry.get("verification")
        if verification == NATIVE_VERIFICATION:
            native_root = native_backup_root(source)
            if native_root is None or path.name != source.name:
                return None
            approved = (native_root.resolve(),)
        elif verification == VERIFICATION:
            approved = (BACKUPS.resolve(), (LEDGER / "backups").resolve())
        else:
            return None
        if path.is_symlink() or not any(path.resolve().is_relative_to(root) for root in approved):
            return None
        age = time.time() - entry["lastAt"]
        if age < -60 or digest(path) != entry["sha256"]:
            return None
        return {"status": "snapshot found", "lastAt": entry["lastAt"],
                "path": str(path), "verification": verification}
    except (OSError, KeyError, TypeError, ValueError):
        return None


def main():
    parser = argparse.ArgumentParser(description="Create private database-only snapshots and test isolated SQLite restores. No pruning, service changes or off-host upload.")
    parser.add_argument("--inventory", required=True, type=Path, help="Private Garden inventory JSON; only application and agent-runtime SQLite files are selected")
    parser.add_argument("--dry-run", action="store_true", help="Report decisions without creating backups or changing evidence")
    parser.add_argument("--refresh-existing", action="store_true", help="Explicitly create fresh Garden snapshots; verified app-managed backups are still reused")
    args = parser.parse_args()
    os.umask(0o077)
    if args.dry_run:
        run(args)
    else:
        with EVIDENCE.with_suffix(".lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            run(args)


def run(args):
    snapshot = json.loads(args.inventory.read_text())
    if not snapshot.get("coverage", {}).get("databases", {}).get("complete") or snapshot.get("stale"):
        raise ValueError("A complete fresh inventory is required")
    entries = json.loads(EVIDENCE.read_text()) if EVIDENCE.exists() else {}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    failures = []
    skipped = []
    planned = []
    completed = 0
    for row in snapshot["databases"]:
        if row["category"] not in ("application", "agent runtime") or row["engine"] != "SQLite":
            continue
        source = Path(row["path"])
        if "pnpm-store" in source.parts:
            continue
        if not any(source.is_relative_to(root) for root in SOURCE_ROOTS):
            raise ValueError("Source is outside approved inventory roots")
        native = native_backup(source)
        existing = verified_evidence(source, entries)
        if native:
            if not existing:
                entries[str(source)] = native
            skipped.append({"source": str(source), "reason": "app-managed backup", "path": native["path"]})
            continue
        if native_backup_root(source) is not None:
            failures.append({"source": str(source), "error": "App manages this database backup; use its backup procedure and check verification"})
            continue
        if existing and (not args.refresh_existing or existing["verification"] == NATIVE_VERIFICATION):
            skipped.append({"source": str(source), "reason": "verified existing backup", "path": existing["path"]})
            continue
        if not args.refresh_existing and (row.get("backupCopies") or row.get("backup", {}).get("path")):
            failures.append({"source": str(source), "error": "Existing backup needs verification; no extra copy created"})
            continue
        key = hashlib.sha256(str(source).encode()).hexdigest()[:16]
        root = LEDGER / "backups/garden-databases" if source.is_relative_to(LEDGER) else BACKUPS
        destination = root / stamp / key / source.name
        if args.dry_run:
            planned.append(str(source))
            continue
        try:
            entries[str(source)] = backup_database(source, destination)
            completed += 1
        except Exception as error:
            failures.append({"source": str(source), "error": type(error).__name__})
    if not args.dry_run:
        temporary = EVIDENCE.with_suffix(".tmp")
        temporary.write_text(json.dumps(entries, indent=2) + "\n")
        temporary.chmod(0o600)
        temporary.replace(EVIDENCE)
    print(json.dumps({"verifiedDatabases": completed, "skipped": skipped, "planned": planned,
                      "failures": failures, "dryRun": args.dry_run, "offHost": False}))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
