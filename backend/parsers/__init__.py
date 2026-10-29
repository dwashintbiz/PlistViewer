from __future__ import annotations
import os
from typing import Any, Dict, List, Optional
from .base import DataSourceParser
from .plist_parser import StandardPlistParser
from .nskeyed_parser import NSKeyedArchiverParser
from .sqlite_parser import SQLitePlistParser
from .blob_parser import RawBlobPlistCarver
from ..models import ParseResult


class ParserRegistry:
    """
    Central registry for all data source parsers.
    Supports automatic format detection as well as explicit parser selection.
    New data sources (e.g., custom archives, LevelDB, PCAP payloads) can be added
    by registering a DataSourceParser subclass.
    """

    def __init__(self) -> None:
        self._parsers: Dict[str, DataSourceParser] = {}
        self.plist_parser = StandardPlistParser()
        self.register(self.plist_parser)
        self.register(NSKeyedArchiverParser())
        self.register(SQLitePlistParser())
        self.register(RawBlobPlistCarver())

    def register(self, parser: DataSourceParser) -> None:
        self._parsers[parser.parser_id] = parser

    def list_parsers(self) -> List[Dict[str, Any]]:
        return [p.info() for p in self._parsers.values()]

    def get_parser(self, parser_id: str) -> Optional[DataSourceParser]:
        return self._parsers.get(parser_id)

    def detect_parser(self, data: bytes, filename: Optional[str] = None) -> DataSourceParser:
        # 1. Check SQLite magic bytes first
        sqlite_parser = self._parsers.get("sqlite")
        if sqlite_parser and data.startswith(SQLitePlistParser.SQLITE_HEADER):
            return sqlite_parser

        # 2. Check standard Binary or XML plist
        if self.plist_parser.can_parse(data, filename):
            return self.plist_parser

        # 3. Check other registered parsers
        for parser in self._parsers.values():
            if parser.parser_id in ("plist",):
                continue
            if parser.can_parse(data, filename):
                return parser

        # 4. Fallback to blob carver if standard plist fails
        return self._parsers.get("blob_carver", self.plist_parser)

    def parse_file(
        self,
        file_path: str,
        parser_id: str = "auto",
        options: Optional[Dict[str, Any]] = None,
    ) -> ParseResult:
        with open(file_path, "rb") as f:
            data = f.read()
        filename = os.path.basename(file_path)
        return self.parse_bytes(
            data,
            source_name=filename,
            source_path=file_path,
            parser_id=parser_id,
            options=options,
        )

    def parse_bytes(
        self,
        data: bytes,
        source_name: str = "Untitled",
        source_path: Optional[str] = None,
        parser_id: str = "auto",
        options: Optional[Dict[str, Any]] = None,
    ) -> ParseResult:
        if parser_id and parser_id != "auto":
            chosen = self.get_parser(parser_id)
            if not chosen:
                raise ValueError(f"Unknown parser_id: {parser_id}")
            return chosen.parse_bytes(
                data, source_name=source_name, source_path=source_path, options=options
            )

        detected = self.detect_parser(data, source_name)
        try:
            return detected.parse_bytes(
                data, source_name=source_name, source_path=source_path, options=options
            )
        except Exception:
            # If standard plist failed on a file with .plist extension that is actually a raw log/blob, try carver
            carver = self.get_parser("blob_carver")
            if carver and detected.parser_id != "blob_carver":
                return carver.parse_bytes(
                    data, source_name=source_name, source_path=source_path, options=options
                )
            raise
