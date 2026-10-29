from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Any, List, Optional, Dict


@dataclass
class PlistNode:
    id: str
    key: str
    path: str
    type: str  # 'dict', 'array', 'string', 'integer', 'real', 'boolean', 'date', 'data', 'uid', 'null'
    value: Any
    display_value: str
    size: int = 0
    hex_preview: Optional[str] = None
    base64_value: Optional[str] = None
    ascii_preview: Optional[str] = None
    has_embedded_plist: bool = False
    children: List[PlistNode] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "key": self.key,
            "path": self.path,
            "type": self.type,
            "value": self.value,
            "displayValue": self.display_value,
            "size": self.size,
            "hexPreview": self.hex_preview,
            "base64Value": self.base64_value,
            "asciiPreview": self.ascii_preview,
            "hasEmbeddedPlist": self.has_embedded_plist,
            "children": [c.to_dict() for c in self.children],
        }


@dataclass
class SourceMetadata:
    source_name: str
    source_path: Optional[str]
    parser_id: str
    parser_name: str
    detected_format: str  # e.g., 'Binary Plist (bplist00)', 'XML Plist', 'NSKeyedArchiver (Binary)', 'SQLite Embedded', 'Raw Blob'
    file_size: int
    total_nodes: int
    is_keyed_archive: bool = False
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "sourceName": self.source_name,
            "sourcePath": self.source_path,
            "parserId": self.parser_id,
            "parserName": self.parser_name,
            "detectedFormat": self.detected_format,
            "fileSize": self.file_size,
            "totalNodes": self.total_nodes,
            "isKeyedArchive": self.is_keyed_archive,
            "extra": self.extra,
        }


@dataclass
class ParseResult:
    metadata: SourceMetadata
    root: PlistNode
    unarchived_root: Optional[PlistNode] = None
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "metadata": self.metadata.to_dict(),
            "root": self.root.to_dict(),
            "unarchivedRoot": self.unarchived_root.to_dict() if self.unarchived_root else None,
            "warnings": self.warnings,
        }
