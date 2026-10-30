#!/usr/bin/env python3
"""
Cross-platform PyInstaller build script for PListViewer's Python backend.
Compiles `backend/main.py` into a single standalone executable inside `backend/dist/`:
  - Windows : backend/dist/plist-backend.exe
  - macOS   : backend/dist/plist-backend
  - Linux   : backend/dist/plist-backend

When present, `electron/main.ts` automatically launches this standalone executable
so end-users do not need Python installed on their machine.
"""
from __future__ import annotations
import os
import shutil
import subprocess
import sys


def main() -> int:
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    entry_script = os.path.join(project_root, "backend", "main.py")
    dist_dir = os.path.join(project_root, "backend", "dist")
    build_dir = os.path.join(project_root, "backend", "build")
    spec_dir = os.path.join(project_root, "backend")

    if os.path.isdir(dist_dir):
        shutil.rmtree(dist_dir, ignore_errors=True)

    # Ensure PyInstaller is available
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        print("[build_backend] PyInstaller not found. Installing pyinstaller...", flush=True)
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--name",
        "plist-backend",
        "--distpath",
        dist_dir,
        "--workpath",
        build_dir,
        "--specpath",
        spec_dir,
        "--paths",
        project_root,
        "--hidden-import",
        "backend",
        "--hidden-import",
        "backend.models",
        "--hidden-import",
        "backend.samples",
        "--hidden-import",
        "backend.exporters",
        "--hidden-import",
        "backend.exporters.exporter",
        "--hidden-import",
        "backend.parsers",
        "--hidden-import",
        "backend.parsers.base",
        "--hidden-import",
        "backend.parsers.plist_parser",
        "--hidden-import",
        "backend.parsers.nskeyed_parser",
        "--hidden-import",
        "backend.parsers.sqlite_parser",
        "--hidden-import",
        "backend.parsers.blob_parser",
        entry_script,
    ]

    print(f"[build_backend] Building standalone backend executable for {sys.platform}...")
    subprocess.check_call(cmd, cwd=project_root)

    # Clean temporary PyInstaller work folder and .spec file
    if os.path.isdir(build_dir):
        shutil.rmtree(build_dir, ignore_errors=True)
    spec_file = os.path.join(spec_dir, "plist-backend.spec")
    if os.path.isfile(spec_file):
        os.remove(spec_file)

    exe_name = "plist-backend.exe" if sys.platform == "win32" else "plist-backend"
    output_exe = os.path.join(dist_dir, exe_name)
    if os.path.isfile(output_exe):
        if sys.platform != "win32":
            os.chmod(output_exe, 0o755)
        print(f"[build_backend] Success! Standalone backend binary created at: {output_exe}")
        return 0

    print("[build_backend] Error: Expected binary was not produced.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
