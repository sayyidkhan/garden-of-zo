import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import discover


class DatabaseDiscoveryTests(unittest.TestCase):
    def test_miniflare_bookkeeping_is_excluded_without_hiding_application_databases(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            d1 = root / ".wrangler/state/v3/d1/miniflare-D1DatabaseObject"
            d1.mkdir(parents=True)
            paths = [d1 / "metadata.sqlite", d1 / ("a" * 64 + ".sqlite"), root / "metadata.sqlite"]
            for path in paths:
                connection = sqlite3.connect(path)
                connection.execute("CREATE TABLE example (id INTEGER)")
                connection.close()
            with patch.object(discover, "SCAN_ROOTS", [root]), patch.object(discover, "EVIDENCE", root / "absent.json"):
                databases, coverage = discover.database_inventory([])
            self.assertTrue(coverage["complete"])
            self.assertEqual({row["path"] for row in databases}, {str(path) for path in paths[1:]})
            self.assertTrue(all(path.exists() for path in paths))
