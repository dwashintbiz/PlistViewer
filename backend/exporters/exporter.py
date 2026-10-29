from __future__ import annotations
import csv
import io
from typing import Any, Dict, List, Optional


def flatten_node_dict(node: Dict[str, Any], depth: int = 0) -> List[Dict[str, Any]]:
    """Flatten a serialized PlistNode dictionary into tabular rows."""
    rows: List[Dict[str, Any]] = [
        {
            "path": node.get("path", ""),
            "key": node.get("key", ""),
            "type": node.get("type", ""),
            "displayValue": node.get("displayValue", ""),
            "rawValue": (
                str(node.get("value"))
                if node.get("value") is not None
                else node.get("displayValue", "")
            ),
            "size": node.get("size", 0),
            "depth": depth,
        }
    ]
    for child in node.get("children", []) or []:
        rows.extend(flatten_node_dict(child, depth + 1))
    return rows


def export_to_csv(root_node: Dict[str, Any], metadata: Optional[Dict[str, Any]] = None) -> str:
    """Export a PlistNode tree to CSV format."""
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["Path", "Key", "Type", "Display Value", "Raw / Full Value", "Size (Bytes/Items)", "Depth"])
    for row in flatten_node_dict(root_node):
        writer.writerow(
            [
                row["path"],
                row["key"],
                row["type"],
                row["displayValue"],
                row["rawValue"],
                row["size"],
                row["depth"],
            ]
        )
    return output.getvalue()


def export_to_text(root_node: Dict[str, Any], metadata: Optional[Dict[str, Any]] = None) -> str:
    """Export a PlistNode tree to a formatted human-readable text report."""
    lines: List[str] = []
    lines.append("=" * 80)
    lines.append("PLISTVIEWER EXPORT REPORT")
    lines.append("=" * 80)
    if metadata:
        lines.append(f"Source Name     : {metadata.get('sourceName', 'Unknown')}")
        if metadata.get("sourcePath"):
            lines.append(f"Source Path     : {metadata.get('sourcePath')}")
        lines.append(f"Detected Format : {metadata.get('detectedFormat', 'Unknown')}")
        lines.append(f"Parser Used     : {metadata.get('parserName', 'Unknown')}")
        lines.append(f"File Size       : {metadata.get('fileSize', 0):,} bytes")
        lines.append(f"Total Nodes     : {metadata.get('totalNodes', 0):,}")
        lines.append("-" * 80)

    def render_tree(node: Dict[str, Any], indent: int = 0) -> None:
        prefix = "  " * indent
        key = node.get("key", "")
        ntype = node.get("type", "")
        disp = node.get("displayValue", "")
        val = node.get("value")

        if ntype in ("dict", "array"):
            lines.append(f"{prefix}[{ntype.upper()}] {key} — {disp}")
        elif ntype == "data":
            lines.append(f"{prefix}[DATA] {key} ({node.get('size', 0)} bytes): {disp}")
            if node.get("asciiPreview"):
                preview_line = str(node["asciiPreview"]).replace("\n", " ")[:100]
                lines.append(f"{prefix}       ASCII: {preview_line}")
        else:
            full_val = val if val is not None else disp
            lines.append(f"{prefix}[{ntype.upper()}] {key} = {full_val}")

        for child in node.get("children", []) or []:
            render_tree(child, indent + 1)

    render_tree(root_node)
    lines.append("=" * 80)
    return "\n".join(lines) + "\n"
