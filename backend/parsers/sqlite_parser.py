from __future__ import annotations
import os
import plistlib
import sqlite3
import tempfile
from typing import Any, Dict, List, Optional
from .base import DataSourceParser, NodeBuilder, looks_like_plist_bytes, looks_like_plist_string
from ..models import ParseResult, SourceMetadata


class SQLitePlistParser(DataSourceParser):
    """
    Scaffolding & scanner for SQLite databases (.sqlite, .db, .sqlite3) that contain
    embedded binary or XML plists in BLOB or TEXT columns.
    """

    parser_id = "sqlite"
    parser_name = "SQLite Embedded Plist Scanner (Scaffold)"
    description = "Scans SQLite tables/columns for embedded binary or XML plist blobs"
    supported_extensions = [".sqlite", ".sqlite3", ".db", ".sqlitedb"]
    status = "scaffold"

    SQLITE_HEADER = b"SQLite format 3\x00"

    def can_parse(self, data: bytes, filename: Optional[str] = None) -> bool:
        if data.startswith(self.SQLITE_HEADER):
            return True
        if filename and any(filename.lower().endswith(ext) for ext in self.supported_extensions):
            return True
        return False

    def parse_bytes(
        self,
        data: bytes,
        source_name: str = "database.sqlite",
        source_path: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> ParseResult:
        options = options or {}
        max_rows_per_table = int(options.get("maxRowsPerTable", 200))

        temp_path = None
        db_path = source_path
        if not db_path or not os.path.exists(db_path):
            fd, temp_path = tempfile.mkstemp(suffix=".sqlite")
            with os.fdopen(fd, "wb") as f:
                f.write(data)
            db_path = temp_path

        extracted: Dict[str, Any] = {}
        warnings: List[str] = []
        plist_hits = 0

        try:
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
            tables = [r[0] for r in cursor.fetchall()]

            for table in tables:
                table_entries: Dict[str, Any] = {}
                try:
                    cursor.execute(f'SELECT * FROM "{table}" LIMIT {max_rows_per_table}')
                    col_names = [desc[0] for desc in (cursor.description or [])]
                    rows = cursor.fetchall()
                    for row_idx, row in enumerate(rows):
                        row_dict: Dict[str, Any] = {}
                        for col_name, cell_val in zip(col_names, row):
                            if isinstance(cell_val, (bytes, bytearray)) and looks_like_plist_bytes(bytes(cell_val)):
                                try:
                                    row_dict[f"{col_name} (Decoded Plist)"] = plistlib.loads(bytes(cell_val))
                                    plist_hits += 1
                                except Exception:
                                    row_dict[col_name] = bytes(cell_val)
                            elif isinstance(cell_val, str) and looks_like_plist_string(cell_val):
                                try:
                                    row_dict[f"{col_name} (Decoded Plist)"] = plistlib.loads(cell_val.encode("utf-8"))
                                    plist_hits += 1
                                except Exception:
                                    row_dict[col_name] = cell_val
                            else:
                                row_dict[col_name] = cell_val
                        table_entries[f"row_{row_idx}"] = row_dict
                except Exception as exc:
                    warnings.append(f"Could not scan table '{table}': {exc}")
                extracted[table] = table_entries

            conn.close()
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass

        builder = NodeBuilder()
        root_node = builder.build(extracted, key=source_name, path="root")
        metadata = SourceMetadata(
            source_name=source_name,
            source_path=source_path,
            parser_id=self.parser_id,
            parser_name=self.parser_name,
            detected_format=f"SQLite3 Database ({plist_hits} embedded plists decoded)",
            file_size=len(data),
            total_nodes=builder.counter,
            is_keyed_archive=False,
            extra={"embeddedPlistsDecoded": plist_hits},
        )
        return ParseResult(metadata=metadata, root=root_node, warnings=warnings)
