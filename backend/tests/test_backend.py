from __future__ import annotations
import base64
import os
import plistlib
import sqlite3
import tempfile
import sys
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.main import handle_api_request
from backend.samples import ensure_sample_files


class TestPlistBackend(unittest.TestCase):
    def setUp(self) -> None:
        self.samples_dir = os.path.join(PROJECT_ROOT, "samples")
        self.sample_paths = ensure_sample_files(self.samples_dir)

    def test_health_endpoint(self) -> None:
        status, resp = handle_api_request("GET", "/api/health", {})
        self.assertEqual(status, 200)
        self.assertTrue(resp["ok"])
        self.assertGreaterEqual(len(resp["parsers"]), 4)

    def test_parse_binary_and_xml_plist(self) -> None:
        for kind in ("binary", "xml"):
            status, resp = handle_api_request(
                "POST",
                "/api/parse/file",
                {"filePath": self.sample_paths[kind], "parserId": "auto"},
            )
            self.assertEqual(status, 200)
            self.assertTrue(resp["ok"])
            result = resp["result"]
            self.assertEqual(result["root"]["type"], "dict")
            self.assertGreater(len(result["root"]["children"]), 5)

    def test_parse_nskeyed_archive(self) -> None:
        status, resp = handle_api_request(
            "POST",
            "/api/parse/file",
            {"filePath": self.sample_paths["nskeyed"], "parserId": "auto"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(resp["ok"])
        result = resp["result"]
        self.assertTrue(result["metadata"]["isKeyedArchive"])
        self.assertIsNotNone(result["unarchivedRoot"])

    def test_parse_raw_xml_and_hex(self) -> None:
        raw_bplist = plistlib.dumps({"KeyA": "ValA", "Count": 99}, fmt=plistlib.FMT_BINARY)
        hex_str = raw_bplist.hex()
        status, resp = handle_api_request(
            "POST",
            "/api/parse/raw",
            {"rawText": hex_str, "encoding": "hex", "sourceName": "HexTest.plist"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(resp["ok"])
        self.assertEqual(resp["result"]["root"]["type"], "dict")

    def test_sqlite_scanner_scaffold(self) -> None:
        fd, temp_db = tempfile.mkstemp(suffix=".sqlite")
        os.close(fd)
        try:
            conn = sqlite3.connect(temp_db)
            conn.execute("CREATE TABLE records (id INTEGER PRIMARY KEY, config_blob BLOB)")
            bplist = plistlib.dumps({"SQLiteEmbeddedKey": "Success", "Code": 7}, fmt=plistlib.FMT_BINARY)
            conn.execute("INSERT INTO records (config_blob) VALUES (?)", (bplist,))
            conn.commit()
            conn.close()

            status, resp = handle_api_request(
                "POST",
                "/api/parse/file",
                {"filePath": temp_db, "parserId": "auto"},
            )
            self.assertEqual(status, 200)
            self.assertTrue(resp["ok"])
            self.assertEqual(resp["result"]["metadata"]["parserId"], "sqlite")
            self.assertEqual(resp["result"]["metadata"]["extra"]["embeddedPlistsDecoded"], 1)
        finally:
            if os.path.exists(temp_db):
                os.remove(temp_db)

    def test_blob_carver_scaffold(self) -> None:
        xml_plist = plistlib.dumps({"CarvedKey": "CarvedValue"}, fmt=plistlib.FMT_XML)
        blob = b"RANDOM_HEADER_BYTES_1234567890" + xml_plist + b"TRAILING_LOG_BYTES"
        b64 = base64.b64encode(blob).decode("ascii")
        status, resp = handle_api_request(
            "POST",
            "/api/parse/bytes",
            {"base64Data": b64, "sourceName": "capture.bin", "parserId": "blob_carver"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(resp["ok"])
        self.assertEqual(resp["result"]["metadata"]["parserId"], "blob_carver")

    def test_export_csv_and_txt(self) -> None:
        _, parse_resp = handle_api_request(
            "POST",
            "/api/parse/file",
            {"filePath": self.sample_paths["binary"], "parserId": "auto"},
        )
        root_node = parse_resp["result"]["root"]
        metadata = parse_resp["result"]["metadata"]

        status_csv, csv_resp = handle_api_request(
            "POST",
            "/api/export",
            {"rootNode": root_node, "metadata": metadata, "format": "csv"},
        )
        self.assertEqual(status_csv, 200)
        self.assertIn("CFBundleIdentifier", csv_resp["content"])

        status_txt, txt_resp = handle_api_request(
            "POST",
            "/api/export",
            {"rootNode": root_node, "metadata": metadata, "format": "txt"},
        )
        self.assertEqual(status_txt, 200)
        self.assertIn("PLISTVIEWER EXPORT REPORT", txt_resp["content"])


if __name__ == "__main__":
    unittest.main()
