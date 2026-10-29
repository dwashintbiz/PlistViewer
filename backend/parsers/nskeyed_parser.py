from __future__ import annotations
import datetime
import plistlib
from typing import Any, Callable, Dict, List, Optional, Set
from .base import DataSourceParser, NodeBuilder
from ..models import ParseResult, SourceMetadata

# Apple Cocoa reference date: 2001-01-01 00:00:00 UTC
APPLE_EPOCH = datetime.datetime(2001, 1, 1, tzinfo=datetime.timezone.utc)


class NSKeyedArchiverParser(DataSourceParser):
    """
    Parser and unarchiver for Apple's NSKeyedArchiver plist format.
    Includes built-in resolution for standard Foundation classes (NSDictionary,
    NSArray, NSSet, NSString, NSData, NSDate, NSURL) and a pluggable class
    decoder registry for custom archived classes.
    """

    parser_id = "nskeyed"
    parser_name = "NSKeyedArchiver Unarchiver"
    description = "Unarchives UID-referenced object graphs from NSKeyedArchiver plists (scaffolding + Foundation decoders)"
    supported_extensions = [".plist", ".bplist", ".archive"]
    status = "active"

    def __init__(self) -> None:
        self._custom_decoders: Dict[str, Callable[[Dict[str, Any], List[Any]], Any]] = {}

    def register_class_decoder(
        self, class_name: str, decoder_fn: Callable[[Dict[str, Any], List[Any]], Any]
    ) -> None:
        """Scaffolding hook: register a custom class decoder for NSKeyedArchiver objects."""
        self._custom_decoders[class_name] = decoder_fn

    @staticmethod
    def is_keyed_archive_dict(obj: Any) -> bool:
        return (
            isinstance(obj, dict)
            and obj.get("$archiver") == "NSKeyedArchiver"
            and "$objects" in obj
            and "$top" in obj
        )

    def can_parse(self, data: bytes, filename: Optional[str] = None) -> bool:
        try:
            obj = plistlib.loads(data)
            return self.is_keyed_archive_dict(obj)
        except Exception:
            return False

    def unarchive_object_graph(self, archive: Dict[str, Any]) -> Any:
        """Resolve $top and $objects UID references into a human-readable Python dict."""
        objects = archive.get("$objects", [])
        top = archive.get("$top", {})
        if not isinstance(objects, list):
            return archive

        def resolve(item: Any, visited: Set[int]) -> Any:
            if isinstance(item, plistlib.UID):
                idx = int(item.data)
                if idx < 0 or idx >= len(objects):
                    return f"<Invalid UID({idx})>"
                if idx in visited:
                    return f"<CircularRef UID({idx})>"
                return resolve(objects[idx], visited | {idx})

            if item == "$null":
                return None

            if isinstance(item, dict):
                class_uid = item.get("$class")
                class_name = None
                if isinstance(class_uid, plistlib.UID) and 0 <= int(class_uid.data) < len(objects):
                    cls_obj = objects[int(class_uid.data)]
                    if isinstance(cls_obj, dict):
                        class_name = cls_obj.get("$classname")

                # Custom class decoder hook
                if class_name and class_name in self._custom_decoders:
                    return self._custom_decoders[class_name](item, objects)

                # Standard Foundation NSDictionary / NSMutableDictionary
                if "NS.keys" in item and "NS.objects" in item:
                    keys = [resolve(k, visited) for k in item.get("NS.keys", [])]
                    vals = [resolve(v, visited) for v in item.get("NS.objects", [])]
                    return {str(k): v for k, v in zip(keys, vals)}

                # Standard Foundation NSArray / NSMutableArray / NSSet
                if "NS.objects" in item and "NS.keys" not in item:
                    return [resolve(v, visited) for v in item.get("NS.objects", [])]

                # NSString / NSMutableString
                if "NS.string" in item:
                    return item["NS.string"]

                # NSData / NSMutableData
                if "NS.data" in item:
                    return item["NS.data"]

                # NSDate
                if "NS.time" in item and isinstance(item["NS.time"], (int, float)):
                    try:
                        return APPLE_EPOCH + datetime.timedelta(seconds=float(item["NS.time"]))
                    except Exception:
                        return item["NS.time"]

                # NSURL
                if "NS.relative" in item:
                    base = resolve(item.get("NS.base"), visited) if "NS.base" in item else None
                    rel = resolve(item.get("NS.relative"), visited)
                    return f"{base}/{rel}" if base else rel

                # Generic archived object dictionary
                resolved_dict: Dict[str, Any] = {}
                if class_name:
                    resolved_dict["$classname"] = class_name
                for k, v in item.items():
                    if k == "$class":
                        continue
                    resolved_dict[str(k)] = resolve(v, visited)
                return resolved_dict

            if isinstance(item, list):
                return [resolve(v, visited) for v in item]

            return item

        return resolve(top, set())

    def parse_bytes(
        self,
        data: bytes,
        source_name: str = "Untitled",
        source_path: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> ParseResult:
        is_binary = data.startswith(b"bplist")
        raw_obj = plistlib.loads(data)
        raw_builder = NodeBuilder()
        raw_root = raw_builder.build(raw_obj, key=source_name, path="root")

        unarchived_root = None
        warnings: List[str] = []
        is_keyed = self.is_keyed_archive_dict(raw_obj)
        if is_keyed:
            unarchived_obj = self.unarchive_object_graph(raw_obj)
            unarch_builder = NodeBuilder()
            unarchived_root = unarch_builder.build(
                unarchived_obj, key=f"{source_name} (Unarchived)", path="root"
            )
        else:
            warnings.append("Input plist does not contain an NSKeyedArchiver header; displaying standard plist tree.")

        fmt_label = (
            f"NSKeyedArchiver ({'Binary' if is_binary else 'XML'})"
            if is_keyed
            else f"{'Binary' if is_binary else 'XML'} Plist"
        )
        metadata = SourceMetadata(
            source_name=source_name,
            source_path=source_path,
            parser_id=self.parser_id,
            parser_name=self.parser_name,
            detected_format=fmt_label,
            file_size=len(data),
            total_nodes=raw_builder.counter,
            is_keyed_archive=is_keyed,
        )
        return ParseResult(
            metadata=metadata,
            root=raw_root,
            unarchived_root=unarchived_root,
            warnings=warnings,
        )
