from __future__ import annotations
import argparse
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import sys
import tempfile
import traceback
from typing import Any, Dict, Tuple
from urllib.parse import urlparse

# Ensure package imports work when invoked either as `python -m backend.main` or `python backend/main.py`
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.parsers import ParserRegistry
from backend.exporters import export_to_csv, export_to_text
from backend.samples import ensure_sample_files

registry = ParserRegistry()


def get_writable_samples_dir() -> str:
    """Return a writable directory for sample files (handles read-only macOS .app bundles)."""
    if getattr(sys, "frozen", False):
        return os.path.join(tempfile.gettempdir(), "plistviewer_samples")
    candidate = os.path.join(PROJECT_ROOT, "samples")
    try:
        os.makedirs(candidate, exist_ok=True)
        if os.access(candidate, os.W_OK):
            return candidate
    except OSError:
        pass
    return os.path.join(tempfile.gettempdir(), "plistviewer_samples")


SAMPLES_DIR = get_writable_samples_dir()


def handle_api_request(method: str, path: str, body: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    """Core framework-agnostic router used by both FastAPI and the stdlib HTTP server."""
    try:
        if method == "GET" and path == "/api/health":
            return 200, {
                "ok": True,
                "service": "PListViewer Python Backend",
                "pythonVersion": sys.version.split()[0],
                "parsers": registry.list_parsers(),
            }

        if method == "GET" and path == "/api/parsers":
            return 200, {"ok": True, "parsers": registry.list_parsers()}

        if method == "POST" and path == "/api/parse/file":
            file_path = body.get("filePath")
            parser_id = body.get("parserId", "auto")
            options = body.get("options") or {}
            if not file_path or not os.path.isfile(file_path):
                return 400, {"ok": False, "error": f"File not found: {file_path}"}
            result = registry.parse_file(file_path, parser_id=parser_id, options=options)
            return 200, {"ok": True, "result": result.to_dict()}

        if method == "POST" and path == "/api/parse/bytes":
            b64_data = body.get("base64Data", "")
            source_name = body.get("sourceName", "UploadedData.plist")
            source_path = body.get("sourcePath")
            parser_id = body.get("parserId", "auto")
            options = body.get("options") or {}
            raw_bytes = base64.b64decode(b64_data)
            result = registry.parse_bytes(
                raw_bytes,
                source_name=source_name,
                source_path=source_path,
                parser_id=parser_id,
                options=options,
            )
            return 200, {"ok": True, "result": result.to_dict()}

        if method == "POST" and path == "/api/parse/raw":
            raw_text = body.get("rawText", "")
            encoding = body.get("encoding", "auto")
            source_name = body.get("sourceName", "Raw Input")
            if not raw_text.strip():
                return 400, {"ok": False, "error": "Raw input cannot be empty."}
            result = registry.plist_parser.parse_raw_input(
                raw_text=raw_text, input_encoding=encoding, source_name=source_name
            )
            return 200, {"ok": True, "result": result.to_dict()}

        if method == "POST" and path == "/api/sample":
            sample_type = body.get("sampleType", "binary")
            sample_paths = ensure_sample_files(SAMPLES_DIR)
            chosen_path = sample_paths.get(sample_type, sample_paths["binary"])
            result = registry.parse_file(chosen_path, parser_id="auto")
            return 200, {"ok": True, "result": result.to_dict()}

        if method == "POST" and path == "/api/export":
            root_node = body.get("rootNode")
            metadata = body.get("metadata")
            fmt = str(body.get("format", "csv")).lower()
            output_path = body.get("outputPath")

            if not root_node:
                return 400, {"ok": False, "error": "Missing rootNode for export."}

            if fmt == "csv":
                content = export_to_csv(root_node, metadata)
            elif fmt in ("txt", "text"):
                content = export_to_text(root_node, metadata)
            else:
                return 400, {"ok": False, "error": f"Unsupported export format: {fmt}"}

            if output_path:
                with open(output_path, "w", encoding="utf-8", newline="") as f:
                    f.write(content)

            return 200, {
                "ok": True,
                "format": fmt,
                "outputPath": output_path,
                "content": content,
            }

        return 404, {"ok": False, "error": f"Endpoint not found: {method} {path}"}

    except Exception as exc:
        traceback.print_exc()
        return 500, {"ok": False, "error": str(exc)}


# Optional FastAPI app definition if FastAPI is installed in the environment
try:
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse

    app = FastAPI(title="PListViewer Backend API", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.api_route("/{full_path:path}", methods=["GET", "POST", "OPTIONS"])
    async def fastapi_catch_all(request: Request, full_path: str) -> JSONResponse:
        path = "/" + full_path
        body: Dict[str, Any] = {}
        if request.method == "POST":
            try:
                body = await request.json()
            except Exception:
                body = {}
        status_code, payload = handle_api_request(request.method, path, body)
        return JSONResponse(status_code=status_code, content=payload)

except ImportError:
    app = None


class StdlibAPIHandler(BaseHTTPRequestHandler):
    """Lightweight ThreadingHTTPServer handler with CORS support."""

    def _send_json(self, status_code: int, payload: Dict[str, Any]) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:
        self._send_json(200, {"ok": True})

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        status, payload = handle_api_request("GET", parsed.path, {})
        self._send_json(status, payload)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length) if length > 0 else b"{}"
        try:
            body = json.loads(raw_body.decode("utf-8"))
        except Exception:
            body = {}
        status, payload = handle_api_request("POST", parsed.path, body)
        self._send_json(status, payload)

    def log_message(self, format: str, *args: Any) -> None:
        # Keep console output clean unless debugging
        pass


def run_server(host: str = "127.0.0.1", port: int = 8765) -> None:
    ensure_sample_files(SAMPLES_DIR)
    try:
        import uvicorn

        if app is not None:
            print(f"[PListViewer Backend] Starting FastAPI/Uvicorn server on http://{host}:{port}", flush=True)
            uvicorn.run(app, host=host, port=port, log_level="warning")
            return
    except ImportError:
        pass

    server = ThreadingHTTPServer((host, port), StdlibAPIHandler)
    print(f"[PListViewer Backend] Starting HTTP server on http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PListViewer Python Backend Sidecar")
    parser.add_argument("--host", default="127.0.0.1", help="Host address to bind")
    parser.add_argument("--port", type=int, default=8765, help="Port number to bind")
    args = parser.parse_args()
    run_server(host=args.host, port=args.port)
