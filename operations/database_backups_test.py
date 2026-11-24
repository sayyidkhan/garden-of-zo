import importlib.util
import argparse
import hashlib
import io
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("database_backups", Path(__file__).with_name("database_backups.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DatabaseBackupsTest(unittest.TestCase):
    def test_repeated_runs_reuse_backup_and_explicit_refresh_creates_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "live.sqlite"
            with sqlite3.connect(source) as connection:
                connection.execute("CREATE TABLE example (id INTEGER)")
            inventory = root / "inventory.json"
            inventory.write_text(json.dumps({"coverage": {"databases": {"complete": True}},
                "databases": [{"path": str(source), "category": "application", "engine": "SQLite"}]}))
            args = argparse.Namespace(inventory=inventory, dry_run=False, refresh_existing=False)
            with patch.object(module, "BACKUPS", root / "backups"), \
                 patch.object(module, "EVIDENCE", root / "evidence.json"), \
                 patch.object(module, "SOURCE_ROOTS", (root,)), patch("sys.stdout", new_callable=io.StringIO):
                module.run(args)
                module.run(args)
                self.assertEqual(len(list((root / "backups").rglob("*.sqlite"))), 1)
                args.refresh_existing = True
                module.run(args)
                self.assertEqual(len(list((root / "backups").rglob("*.sqlite"))), 2)

    def test_native_manifest_reused_and_bound_to_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for profile, manifest in (("orin", "checksums.json"), ("runa", "SHA256SUMS")):
                source = root / "profiles" / profile / "state.db"
                folder = root / "backups" / profile / "20261118T120000Z"
                folder.mkdir(parents=True)
                copy = folder / "state.db"
                copy.write_bytes(b"native snapshot fixture")
                checksum = hashlib.sha256(copy.read_bytes()).hexdigest()
                (folder / manifest).write_text(json.dumps({"state.db": checksum}) if profile == "orin"
                                               else checksum + "  state.db\n")
                with patch.object(module, "HERMES", root):
                    entry = module.native_backup(source)
                    self.assertEqual(entry["path"], str(copy))
                    self.assertIsNotNone(module.verified_evidence(source, {str(source): entry}))
                    wrong_source = root / "profiles" / ("runa" if profile == "orin" else "orin") / "state.db"
                    self.assertIsNone(module.verified_evidence(wrong_source, {str(wrong_source): entry}))
                    copy.write_bytes(b"changed")
                    self.assertIsNone(module.native_backup(source))
                    self.assertIsNone(module.verified_evidence(source, {str(source): entry}))

    def test_native_backup_wins_even_on_refresh_and_dry_run_changes_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "profiles/orin/state.db"
            folder = root / "backups/orin/20261118T120000Z"
            folder.mkdir(parents=True)
            copy = folder / "state.db"
            copy.write_bytes(b"snapshot")
            (folder / "checksums.json").write_text(json.dumps({"state.db": module.digest(copy)}))
            inventory = root / "inventory.json"
            inventory.write_text(json.dumps({"coverage": {"databases": {"complete": True}},
                "databases": [{"path": str(source), "category": "agent runtime", "engine": "SQLite"}]}))
            args = argparse.Namespace(inventory=inventory, dry_run=True, refresh_existing=True)
            with patch.object(module, "HERMES", root), patch.object(module, "SOURCE_ROOTS", (root,)), \
                 patch.object(module, "BACKUPS", root / "garden"), \
                 patch.object(module, "EVIDENCE", root / "evidence.json"), \
                 patch.object(module, "backup_database") as create, patch("sys.stdout", new_callable=io.StringIO):
                module.run(args)
                self.assertFalse((root / "evidence.json").exists())
                args.dry_run = False
                module.run(args)
                self.assertEqual(json.loads((root / "evidence.json").read_text())[str(source)]["path"], str(copy))
                garden = root / "garden/copy.sqlite"
                garden.parent.mkdir()
                garden.write_bytes(b"Garden verified fixture")
                entry = {"path": str(garden), "lastAt": 1, "sha256": module.digest(garden),
                         "verification": module.VERIFICATION}
                (root / "evidence.json").write_text(json.dumps({str(source): entry}))
                module.run(args)
                self.assertEqual(json.loads((root / "evidence.json").read_text())[str(source)], entry)
                create.assert_not_called()

    def test_native_owned_database_never_falls_back_to_garden(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "profiles/orin/projects.db"
            folder = root / "backups/orin/current-projects"
            folder.mkdir(parents=True)
            copy = folder / "projects.db"
            copy.write_bytes(b"snapshot")
            manifest = folder / "checksums.json"
            manifest.write_text(json.dumps({"projects.db": module.digest(copy)}))
            inventory = root / "inventory.json"
            inventory.write_text(json.dumps({"coverage": {"databases": {"complete": True}},
                "databases": [{"path": str(source), "category": "agent runtime", "engine": "SQLite"}]}))
            args = argparse.Namespace(inventory=inventory, dry_run=True, refresh_existing=True)
            with patch.object(module, "HERMES", root), patch.object(module, "SOURCE_ROOTS", (root,)), \
                 patch.object(module, "EVIDENCE", root / "evidence.json"), \
                 patch.object(module, "backup_database") as create, patch("sys.stdout", new_callable=io.StringIO):
                self.assertEqual(module.native_backup(source)["path"], str(copy))
                module.run(args)
                for value in ('{}', '{"projects.db": "bad"}'):
                    manifest.write_text(value)
                    with self.assertRaises(SystemExit):
                        module.run(args)
                copy.unlink()
                with self.assertRaises(SystemExit):
                    module.run(args)
                create.assert_not_called()

    def test_karma_rolling_backup_is_discovered_and_never_created_by_garden(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            orin = root / "orin"
            source = orin / "workspace/karma.sqlite"
            folder = root / "backups/orin/current-karma"
            folder.mkdir(parents=True)
            copy = folder / "karma.sqlite"
            copy.write_bytes(b"native snapshot fixture")
            (folder / "checksums.json").write_text(json.dumps({"karma.sqlite": module.digest(copy)}))
            inventory = root / "inventory.json"
            inventory.write_text(json.dumps({"coverage": {"databases": {"complete": True}},
                "databases": [{"path": str(source), "category": "application", "engine": "SQLite"}]}))
            args = argparse.Namespace(inventory=inventory, dry_run=False, refresh_existing=True)
            with patch.object(module, "HERMES", root), patch.object(module, "ORIN", orin), \
                 patch.object(module, "SOURCE_ROOTS", (root,)), \
                 patch.object(module, "EVIDENCE", root / "evidence.json"), \
                 patch.object(module, "backup_database") as create, patch("sys.stdout", new_callable=io.StringIO):
                self.assertEqual(module.native_backup(source)["path"], str(copy))
                module.run(args)
                create.assert_not_called()
                copy.write_bytes(b"tampered")
                self.assertIsNone(module.native_backup(source))
                with self.assertRaises(SystemExit):
                    module.run(args)
                create.assert_not_called()

    def test_unverified_existing_copy_requires_review_instead_of_duplication(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "live.sqlite"
            inventory = root / "inventory.json"
            inventory.write_text(json.dumps({"coverage": {"databases": {"complete": True}},
                "databases": [{"path": str(source), "category": "application", "engine": "SQLite",
                               "backupCopies": [{"path": str(root / "old.sqlite")}]}]}))
            args = argparse.Namespace(inventory=inventory, dry_run=True, refresh_existing=False)
            with patch.object(module, "EVIDENCE", root / "evidence.json"), \
                 patch.object(module, "SOURCE_ROOTS", (root,)), patch.object(module, "backup_database") as create, \
                 patch("sys.stdout", new_callable=io.StringIO):
                with self.assertRaises(SystemExit):
                    module.run(args)
                create.assert_not_called()

    def test_wal_snapshot_restore_and_tamper_detection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "live.sqlite"
            connection = sqlite3.connect(source)
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("CREATE TABLE balances (score INTEGER)")
            connection.execute("INSERT INTO balances VALUES (12)")
            connection.commit()
            destination = root / "backups/copy.sqlite"
            entry = module.backup_database(source, destination)
            self.assertEqual(connection.execute("SELECT score FROM balances").fetchone(), (12,))
            with module.readonly(destination) as restored:
                self.assertEqual(restored.execute("SELECT score FROM balances").fetchone(), (12,))
            self.assertEqual(destination.stat().st_mode & 0o777, 0o600)
            with patch.object(module, "BACKUPS", root / "backups"):
                self.assertIsNotNone(module.verified_evidence(source, {str(source): entry}))
                with destination.open("ab") as stream:
                    stream.write(b"tampered")
                self.assertIsNone(module.verified_evidence(source, {str(source): entry}))
            connection.close()

    def test_missing_outside_root_and_symlink_evidence_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "live.sqlite"
            with sqlite3.connect(source) as connection:
                connection.execute("CREATE TABLE example (id INTEGER)")
            entry = module.backup_database(source, root / "copy.sqlite")
            with patch.object(module, "BACKUPS", root / "approved"):
                self.assertIsNone(module.verified_evidence(source, {str(source): entry}))
            with patch.object(module, "BACKUPS", root):
                link = root / "link.sqlite"
                link.symlink_to(root / "copy.sqlite")
                self.assertIsNone(module.verified_evidence(source, {str(source): {**entry, "path": str(link)}}))
                (root / "copy.sqlite").unlink()
                self.assertIsNone(module.verified_evidence(source, {str(source): entry}))

    def test_corruption_and_overwrite_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "corrupt.sqlite"
            source.write_bytes(b"not a SQLite database")
            with self.assertRaises(sqlite3.DatabaseError):
                module.backup_database(source, root / "copy.sqlite")
            with self.assertRaises(ValueError):
                module.backup_database(source, root / "copy.sqlite")


if __name__ == "__main__":
    unittest.main()
