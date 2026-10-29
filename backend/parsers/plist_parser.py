from __future__ import annotations
import base64
import binascii
import plistlib
from typing import Any, Dict, List, Optional
from .base import DataSourceParser, NodeBuilder
from .nskeyed_parser import NSKeyedArchiverParser
from ..models import ParseResult, SourceMetadata


class StandardPlistParser(DataSourceParser):
    """
    Primary parser for XML and Binary (.plist / .bplist) files and raw plist strings.
    Automatically detects Binary (bplist00) vs XML Plist and seamlessly attaches
    an unarchived object graph when NSKeyedArchiver structures are detected.
    """

    parser_id = "plist"
    parser_name = "Standard Plist Parser (XML & Binary)"
    description = "Parses XML and binary .plist files and raw plist strings/bytes"
    supported_extensions = [".plist", ".bplist", ".xml", ".strings"]
    status = "active"

    def __init__(self) -> None:
        self._nskeyed = NSKeyedArchiverParser()

    def can_parse(self, data: bytes, filename: Optional[str] = None) -> bool:
        if data.startswith(b"bplist00") or data.startswith(b"bplist01"):
            return True
        stripped = data.lstrip()
        if stripped.startswith(b"<?xml") or stripped.startswith(b"<plist") or stripped.startswith(b"<!DOCTYPE plist"):
            return True
        if filename and any(filename.lower().endswith(ext) for ext in self.supported_extensions):
            return True
        return False

    def parse_bytes(
        self,
        data: bytes,
        source_name: str = "Untitled.plist",
        source_path: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> ParseResult:
        is_binary = data.startswith(b"bplist")
        try:
            obj = plistlib.loads(data)
        except Exception as exc:
            raise ValueError(f"Failed to parse plist data ({source_name}): {exc}") from exc

        builder = NodeBuilder()
        root_node = builder.build(obj, key=source_name, path="root")

        is_keyed = self._nskeyed.is_keyed_archive_dict(obj)
        unarchived_root = None
        if is_keyed:
            unarchived_obj = self._nskeyed.unarchive_object_graph(obj)
            unarch_builder = NodeBuilder()
            unarchived_root = unarch_builder.build(
                unarchived_obj, key=f"{source_name} (Unarchived)", path="root"
            )

        if is_keyed:
            fmt = f"NSKeyedArchiver ({'Binary bplist00' if is_binary else 'XML Plist'})"
        elif is_binary:
            header = data[:8].decode("ascii", errors="replace")
            fmt = f"Binary Plist ({header})"
        else:
            fmt = "XML Plist"

        metadata = SourceMetadata(
            source_name=source_name,
            source_path=source_path,
            parser_id=self.parser_id,
            parser_name=self.parser_name,
            detected_format=fmt,
            file_size=len(data),
            total_nodes=builder.counter,
            is_keyed_archive=is_keyed,
        )
        return ParseResult(
            metadata=metadata,
            root=root_node,
            unarchived_root=unarchived_root,
            warnings=[],
        )

    def parse_raw_input(
        self, raw_text: str, input_encoding: str = "auto", source_name: str = "Raw Input"
    ) -> ParseResult:
        """
        Parse raw user input provided as an XML plist string, Base64-encoded plist,
        or Hex-encoded binary/XML plist.
        """
        cleaned = raw_text.strip()
        data_bytes: Optional[bytes] = None

        if input_encoding == "hex" or (
            input_encoding == "auto"
            and all(c in "0123456789abcdefABCDEF \t\r\n" for c in cleaned)
            and len(cleaned) >= 16
        ):
            hex_clean = "".join(cleaned.split())
            if len(hex_clean) % 2 == 0:
                try:
                    data_bytes = binascii.unhexlify(hex_clean)
                except Exception:
                    data_bytes = None

        if data_bytes is None and (
            input_encoding == "base64"
            or (
                input_encoding == "auto"
                and not cleaned.startswith("<")
                and len(cleaned) >= 12
            )
        ):
            try:
                decoded = base64.b64decode(cleaned, validate=False)
                if decoded.startswith(b"bplist") or b"<plist" in decoded[:512]:
                    data_bytes = decoded
            except Exception:
                pass

        if data_bytes is None:
            data_bytes = cleaned.encode("utf-8")

        return self.parse_bytes(data_bytes, source_name=source_name)
