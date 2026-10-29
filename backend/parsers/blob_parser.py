from __future__ import annotations
import plistlib
import re
from typing import Any, Dict, List, Optional
from .base import DataSourceParser, NodeBuilder
from ..models import ParseResult, SourceMetadata


class RawBlobPlistCarver(DataSourceParser):
    """
    Scaffolding & signature carver for raw binary blobs, logs, or arbitrary containers
    that may contain embedded XML (<plist>...</plist>) or Binary (bplist00) structures.
    """

    parser_id = "blob_carver"
    parser_name = "Raw Binary/Log Plist Carver (Scaffold)"
    description = "Scans raw binary blobs or text logs for embedded XML or binary plist headers"
    supported_extensions = [".bin", ".dat", ".raw", ".log", ".txt"]
    status = "scaffold"

    XML_PLIST_PATTERN = re.compile(rb"<plist\b[^>]*>.*?</plist>", re.DOTALL | re.IGNORECASE)

    def can_parse(self, data: bytes, filename: Optional[str] = None) -> bool:
        if b"bplist00" in data or b"<plist" in data:
            return True
        if filename and any(filename.lower().endswith(ext) for ext in self.supported_extensions):
            return True
        return False

    def parse_bytes(
        self,
        data: bytes,
        source_name: str = "raw_blob.bin",
        source_path: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> ParseResult:
        carved_items: Dict[str, Any] = {}
        warnings: List[str] = []

        # 1. Carve XML <plist>...</plist> segments
        for idx, match in enumerate(self.XML_PLIST_PATTERN.finditer(data)):
            offset = match.start()
            snippet = match.group(0)
            xml_bytes = b'<?xml version="1.0" encoding="UTF-8"?>\n' + snippet
            try:
                carved_items[f"XML_Plist_at_0x{offset:08X}"] = plistlib.loads(xml_bytes)
            except Exception as exc:
                warnings.append(f"Found XML plist tag at 0x{offset:08X} but failed to parse: {exc}")

        # 2. Scan for bplist00 headers
        search_pos = 0
        while True:
            pos = data.find(b"bplist00", search_pos)
            if pos == -1:
                break
            candidate = data[pos:]
            try:
                carved_items[f"Binary_Plist_at_0x{pos:08X}"] = plistlib.loads(candidate)
            except Exception:
                # Keep raw header info if embedded bplist has trailing bytes
                carved_items[f"Binary_Header_at_0x{pos:08X}"] = {
                    "offset": f"0x{pos:08X}",
                    "note": "bplist00 signature detected; requires exact trailer length calculation for carving",
                    "sampleBytes": candidate[:64],
                }
            search_pos = pos + 8

        if not carved_items:
            carved_items["raw_payload"] = data
            warnings.append("No embedded XML or binary plist headers detected in blob; showing raw bytes.")

        builder = NodeBuilder()
        root_node = builder.build(carved_items, key=source_name, path="root")
        metadata = SourceMetadata(
            source_name=source_name,
            source_path=source_path,
            parser_id=self.parser_id,
            parser_name=self.parser_name,
            detected_format=f"Carved Blob ({len(carved_items)} item(s))",
            file_size=len(data),
            total_nodes=builder.counter,
            is_keyed_archive=False,
        )
        return ParseResult(metadata=metadata, root=root_node, warnings=warnings)
