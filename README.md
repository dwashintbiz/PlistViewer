# PListViewer

A cross-platform **Electron + React + TypeScript** front-end paired with a **Python** back-end sidecar for reading, organizing, inspecting, and exporting XML and Binary `.plist` data (with built-in scaffolding and decoders for `NSKeyedArchiver`, SQLite databases containing embedded plists, and raw binary/log blobs).

---

## Features

1. **Multi-Format Plist Ingestion**:
   - **Standalone `.plist` & `.bplist` Files**: Parses both XML and Binary (`bplist00`) property lists.
   - **Raw String / Hex / Base64 Input**: Paste raw XML plist strings, hexadecimal dumps, or Base64 payloads directly into the UI.
   - **Embedded Plist Drill-Down**: Automatically detects when a `<data>` (binary) or `<string>` value contains a nested binary or XML plist and provides a one-click **"Inspect Embedded Plist →"** button with breadcrumb navigation back to the parent plist.
2. **Extensible Parser Scaffolding (`backend/parsers/`)**:
   - `StandardPlistParser` (`plist_parser.py`) — XML & Binary `.plist` files and raw strings/bytes.
   - `NSKeyedArchiverParser` (`nskeyed_parser.py`) — Resolves `$top`, `$objects`, and `plistlib.UID` references into human-readable object graphs and provides `register_class_decoder()` for custom Objective-C/Swift classes.
   - `SQLitePlistParser` (`sqlite_parser.py`) — Scans SQLite `.sqlite`/`.db` tables and automatically decodes BLOB/TEXT columns containing binary or XML plists.
   - `RawBlobPlistCarver` (`blob_parser.py`) — Scans raw binary files or logs for embedded `bplist00` signatures and `<plist>...</plist>` blocks.
3. **Interactive Explorer + Value Inspector Window**:
   - **Tree View**: Hierarchical collapsible tree with data type badges, search filtering, and expand/collapse controls.
   - **Data Grid View**: Sortable tabular grid (`Key`, `Type`, `Value Preview`, `Size`, `Full Key Path`).
   - **Split Mode**: Displays both the Tree View and Data Grid View simultaneously alongside the right-hand **Value Inspector Window**.
   - **Value Inspector Window**: Clicking any node or row displays its full metadata, formatted value, children summary table (for containers), **16-byte Hex + ASCII dump** (for binary data and strings), and Base64/JSON representations.
4. **Export / Save**:
   - **Save CSV (`.csv`)**: Exports the flattened key-path hierarchy (`Path, Key, Type, Display Value, Raw Value, Size, Depth`).
   - **Save Text Report (`.txt`)**: Exports a formatted, indented human-readable report of the plist hierarchy.

---

## Quick Start (Windows, macOS, Linux)

### 1. Prerequisites
- **Python 3.10+** (works out-of-the-box with Python's standard library; optional `fastapi` and `uvicorn` acceleration via `backend/requirements.txt`)
- **Node.js 18+** and **npm**

### 2. Install Frontend Dependencies
```bash
npm install
```

*(Optional)* Install FastAPI + Uvicorn for the Python backend:
```bash
python -m pip install -r backend/requirements.txt
```

### 3. Run Backend Unit Tests
```bash
python backend/tests/test_backend.py -v
```

### 4. Build & Launch Electron App
```bash
npm start
```
`npm start` compiles the React + Vite frontend (`dist/`) and Electron TypeScript main/preload scripts (`dist-electron/`), then launches the Electron desktop window, which automatically spawns and manages the Python backend sidecar (`backend/main.py`).

### 5. Web / Vite Development Mode
You can also run the Python backend and Vite dev server in two terminals:
```bash
# Terminal 1: Start Python Backend Sidecar on http://127.0.0.1:8765
python backend/main.py --port 8765

# Terminal 2: Start Vite React Dev Server on http://localhost:5173
npm run dev:vite
```
