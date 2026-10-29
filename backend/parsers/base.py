from __future__ import annotations
from abc import ABC, abstractmethod
import base64
import datetime
import plistlib
from typing import Any, Dict, List, Optional, Tuple
from ..models import PlistNode, ParseResult


def format_hex_dump(data: bytes, max_bytes: int = 4096) -> str:
    """Format bytes into a classic 16-byte per line Hex + ASCII dump."""
    sliced = data[:max_bytes]
    lines: List[str] = []
    for offset in range(0, len(sliced), 16):
        chunk = sliced[offset : offset + 16]
        hex_part = " ".join(f"{b:02X}" for b in chunk)
        ascii_part = "".join(chr(b) if 32 <= b <= 126 else "." for b in chunk)
        lines.append(f"{offset:08X}  {hex_part:<47}  |{ascii_part}|")
    if len(data) > max_bytes:
        lines.append(f"... ({len(data) - max_bytes:,} more bytes truncated in preview)")
    return "\n".join(lines)


def extract_ascii_preview(data: bytes, max_len: int = 512) -> str:
    """Decode printable ASCII/UTF-8 text from raw bytes for quick inspection."""
    try:
        return data[:max_len].decode("utf-8")
    except UnicodeDecodeError:
        return "".join(chr(b) if 32 <= b <= 126 or b in (9, 10, 13) else "." for b in data[:max_len])


def looks_like_plist_bytes(data: bytes) -> bool:
    """Check whether raw bytes look like an embedded binary or XML plist."""
    if not data or len(data) < 8:
        return False
    if data.startswith(b"bplist00") or data.startswith(b"bplist01"):
        return True
    stripped = data.lstrip()
    if stripped.startswith(b"<?xml") and b"<plist" in stripped[:512]:
        return True
    if stripped.startswith(b"<plist") or stripped.startswith(b"<!DOCTYPE plist"):
        return True
    return False


def looks_like_plist_string(text: str) -> bool:
    """Check whether a string contains an embedded XML plist."""
    if not text or len(text) < 16:
        return False
    stripped = text.lstrip()
    return (
        (stripped.startswith("<?xml") and "<plist" in stripped[:512])
        or stripped.startswith("<plist")
        or stripped.startswith("<!DOCTYPE plist")
    )


class NodeBuilder:
    """Builds a normalized PlistNode tree from Python plist objects."""

    def __init__(self) -> None:
        self.counter = 0

    def build(self, obj: Any, key: str = "root", path: str = "root") -> PlistNode:
        self.counter += 1
        node_id = f"node_{self.counter}"

        if isinstance(obj, dict):
            children: List[PlistNode] = []
            for k, v in obj.items():
                str_k = str(k)
                child_path = f"{path}.{str_k}" if path != "root" else str_k
                children.append(self.build(v, key=str_k, path=child_path))
            return PlistNode(
                id=node_id,
                key=key,
                path=path,
                type="dict",
                value=None,
                display_value=f"Dictionary ({len(children)} {'item' if len(children) == 1 else 'items'})",
                size=len(children),
                children=children,
            )

        if isinstance(obj, (list, tuple)):
            children = []
            for idx, item in enumerate(obj):
                child_key = f"[{idx}]"
                child_path = f"{path}[{idx}]"
                children.append(self.build(item, key=child_key, path=child_path))
            return PlistNode(
                id=node_id,
                key=key,
                path=path,
                type="array",
                value=None,
                display_value=f"Array ({len(children)} {'item' if len(children) == 1 else 'items'})",
                size=len(children),
                children=children,
            )

        if isinstance(obj, bool):
            return PlistNode(
                id=node_id,
                key=key,
                path=path,
                type="boolean",
                value=obj,
                display_value="true" if obj else "false",
                size=1,
            )

        if isinstance(obj, int):
            return PlistNode(
                id=node_id,
                key=key,
                path=path,
                type="integer",
                value=obj,
                display_value=str(obj),
                size=obj.bit_length() // 8 + 1,
                hex_preview=f"0x{obj:X}" if obj >= 0 else f"-0x{-obj:X}",
            )

        if isinstance(obj, float):
            return PlistNode(
                id=node_id,
                key=key,
                path=path,
                type="real",
                value=obj,
                display_value=str(obj),
                size=8,
            )

        if isinstance(obj, datetime.datetime):
            iso_str = obj.isoformat()
            return PlistNode(
                id=node_id,
                key=key,
                path=path,
                type="date",
                value=iso_str,
                display_value=iso_str,
                size=len(iso_str),
            )

        if isinstance(obj, plistlib.UID):
            uid_val = int(obj.data)
            return PlistNode(
                id=node_id,
                key=key,
                path=path,
                type="uid",
                value=uid_val,
                display_value=f"UID({uid_val})",
                size=4,
                hex_preview=f"0x{uid_val:X}",
            )

        if isinstance(obj, (bytes, bytearray)):
            raw_bytes = bytes(obj)
            b64 = base64.b64encode(raw_bytes).decode("ascii")
            short_hex = " ".join(f"{b:02X}" for b in raw_bytes[:24])
            if len(raw_bytes) > 24:
                short_hex += " ..."
            return PlistNode(
                id=node_id,
                key=key,
                path=path,
                type="data",
                value=b64,
                display_value=f"<{len(raw_bytes):,} bytes> {short_hex}",
                size=len(raw_bytes),
                hex_preview=format_hex_dump(raw_bytes),
                base64_value=b64,
                ascii_preview=extract_ascii_preview(raw_bytes),
                has_embedded_plist=looks_like_plist_bytes(raw_bytes),
            )

        if isinstance(obj, str):
            raw_utf8 = obj.encode("utf-8", errors="replace")
            preview = obj if len(obj) <= 120 else obj[:117] + "..."
            return PlistNode(
                id=node_id,
                key=key,
                path=path,
                type="string",
                value=obj,
                display_value=preview,
                size=len(raw_utf8),
                hex_preview=format_hex_dump(raw_utf8, max_bytes=2048),
                base64_value=base64.b64encode(raw_utf8).decode("ascii"),
                has_embedded_plist=looks_like_plist_string(obj),
            )

        if obj is None:
            return PlistNode(
                id=node_id,
                key=key,
                path=path,
                type="null",
                value=None,
                display_value="null",
                size=0,
            )

        # Fallback for any custom object
        text = repr(obj)
        return PlistNode(
            id=node_id,
            key=key,
            path=path,
            type="string",
            value=text,
            display_value=text,
            size=len(text),
        )


class DataSourceParser(ABC):
    """
    Abstract base class for all PListViewer data source parsers.
    Provides a uniform interface for standalone .plist files as well as
    scaffolding for NSKeyedArchiver, SQLite databases, raw binary blobs, etc.
    """

    parser_id: str = "base"
    parser_name: str = "Base Parser"
    description: str = "Abstract data source parser"
    supported_extensions: List[str] = []
    status: str = "active"  # 'active' or 'scaffold'

    @abstractmethod
    def can_parse(self, data: bytes, filename: Optional[str] = None) -> bool:
        """Return True if this parser can handle the given raw bytes or filename."""
        raise NotImplementedError

    @abstractmethod
    def parse_bytes(
        self,
        data: bytes,
        source_name: str = "Untitled",
        source_path: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> ParseResult:
        """Parse raw bytes and return a structured ParseResult."""
        raise NotImplementedError

    def parse_file(
        self, file_path: str, options: Optional[Dict[str, Any]] = None
    ) -> ParseResult:
        import os

        with open(file_path, "rb") as f:
            raw = f.read()
        return self.parse_bytes(
            raw,
            source_name=os.path.basename(file_path),
            source_path=file_path,
            options=options,
        )

    def info(self) -> Dict[str, Any]:
        return {
            "id": self.parser_id,
            "name": self.parser_name,
            "description": self.description,
            "supportedExtensions": self.supported_extensions,
            "status": self.status,
        }
