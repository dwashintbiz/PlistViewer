import React, { useEffect, useRef, useState } from 'react';
import {
  arrayBufferToBase64,
  fetchParsers,
  generateExportContent,
  loadSamplePlist,
  parseBytesBase64,
  parseFilePath,
  parseRawText,
} from './api';
import { DetailInspector } from './components/DetailInspector';
import { GridView } from './components/GridView';
import { RawInputModal } from './components/RawInputModal';
import { TreeView } from './components/TreeView';
import { ParseResult, ParserInfo, PlistNode, ViewMode } from './types';

export const App: React.FC = () => {
  const [parsers, setParsers] = useState<ParserInfo[]>([]);
  const [selectedParserId, setSelectedParserId] = useState<string>('auto');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [historyStack, setHistoryStack] = useState<ParseResult[]>([]);
  const [selectedNode, setSelectedNode] = useState<PlistNode | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [showUnarchived, setShowUnarchived] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isRawModalOpen, setIsRawModalOpen] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Initializing backend...');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const list = await fetchParsers();
        setParsers(list);
        const sample = await loadSamplePlist('binary');
        applyNewResult(sample, false);
        setStatusMessage(
          `Loaded ${sample.metadata.sourceName} (${sample.metadata.detectedFormat})`
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorBanner(
          `Could not connect to Python backend sidecar: ${msg}. Make sure backend/main.py is running.`
        );
        setStatusMessage('Backend offline');
      }
    };
    init();
  }, []);

  const applyNewResult = (result: ParseResult, pushCurrentToHistory = false) => {
    setErrorBanner(null);
    if (pushCurrentToHistory && parseResult) {
      setHistoryStack((prev) => [...prev, parseResult]);
    } else if (!pushCurrentToHistory) {
      setHistoryStack([]);
    }
    setParseResult(result);
    const activeRoot =
      result.metadata.isKeyedArchive && result.unarchivedRoot && showUnarchived
        ? result.unarchivedRoot
        : result.root;
    setSelectedNode(activeRoot.children[0] || activeRoot);
  };

  const handlePopHistory = () => {
    if (historyStack.length === 0) return;
    const previous = historyStack[historyStack.length - 1];
    setHistoryStack((prev) => prev.slice(0, -1));
    setParseResult(previous);
    setSelectedNode(previous.root);
    setStatusMessage(`Returned to ${previous.metadata.sourceName}`);
  };

  const handleOpenFileClick = async () => {
    setErrorBanner(null);
    if (window.plistApi?.openFileDialog) {
      const chosenPath = await window.plistApi.openFileDialog();
      if (!chosenPath) return;
      try {
        setStatusMessage(`Parsing ${chosenPath}...`);
        const res = await parseFilePath(chosenPath, selectedParserId);
        applyNewResult(res, false);
        setStatusMessage(`Loaded ${res.metadata.sourceName} (${res.metadata.detectedFormat})`);
      } catch (err: unknown) {
        setErrorBanner(err instanceof Error ? err.message : String(err));
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleBrowserFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setStatusMessage(`Reading ${file.name}...`);
      const buffer = await file.arrayBuffer();
      const b64 = arrayBufferToBase64(buffer);
      const res = await parseBytesBase64(b64, file.name, selectedParserId);
      applyNewResult(res, false);
      setStatusMessage(`Loaded ${res.metadata.sourceName} (${res.metadata.detectedFormat})`);
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      e.target.value = '';
    }
  };

  const handleDropFile = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    try {
      setStatusMessage(`Parsing dropped file ${file.name}...`);
      const buffer = await file.arrayBuffer();
      const b64 = arrayBufferToBase64(buffer);
      const res = await parseBytesBase64(b64, file.name, selectedParserId);
      applyNewResult(res, false);
      setStatusMessage(`Loaded ${res.metadata.sourceName} (${res.metadata.detectedFormat})`);
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLoadSample = async (sampleType: 'binary' | 'xml' | 'nskeyed') => {
    try {
      setErrorBanner(null);
      setStatusMessage(`Loading ${sampleType} sample...`);
      const res = await loadSamplePlist(sampleType);
      applyNewResult(res, false);
      setStatusMessage(`Loaded ${res.metadata.sourceName} (${res.metadata.detectedFormat})`);
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRawSubmit = async (
    rawText: string,
    encoding: 'auto' | 'xml' | 'hex' | 'base64',
    sourceName: string
  ) => {
    try {
      setErrorBanner(null);
      const res = await parseRawText(rawText, encoding, sourceName);
      applyNewResult(res, false);
      setIsRawModalOpen(false);
      setStatusMessage(`Parsed ${res.metadata.sourceName} (${res.metadata.detectedFormat})`);
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  };

  const handleParseEmbeddedPlist = async (node: PlistNode) => {
    try {
      setErrorBanner(null);
      const nestedName = `${node.key} (Embedded)`;
      if (node.type === 'data' && node.base64Value) {
        const res = await parseBytesBase64(node.base64Value, nestedName, 'auto');
        applyNewResult(res, true);
        setStatusMessage(`Drilled down into embedded plist '${node.path}'`);
      } else if (node.type === 'string' && typeof node.value === 'string') {
        const res = await parseRawText(node.value, 'xml', nestedName);
        applyNewResult(res, true);
        setStatusMessage(`Drilled down into embedded XML plist '${node.path}'`);
      }
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  };

  const handleExport = async (format: 'csv' | 'txt') => {
    if (!parseResult) return;
    try {
      setErrorBanner(null);
      const activeRoot =
        parseResult.metadata.isKeyedArchive && parseResult.unarchivedRoot && showUnarchived
          ? parseResult.unarchivedRoot
          : parseResult.root;

      const content = await generateExportContent(activeRoot, parseResult.metadata, format);
      const baseName = parseResult.metadata.sourceName.replace(/\.[^.]+$/, '');
      const defaultFileName = `${baseName}_export.${format}`;

      if (window.plistApi?.saveExportDialog) {
        const saved = await window.plistApi.saveExportDialog({
          defaultName: defaultFileName,
          format,
          content,
        });
        if (saved.saved && saved.filePath) {
          setStatusMessage(`Saved ${format.toUpperCase()} export to ${saved.filePath}`);
        }
      } else {
        const blob = new Blob([content], {
          type: format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultFileName;
        a.click();
        URL.revokeObjectURL(url);
        setStatusMessage(`Downloaded ${defaultFileName}`);
      }
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  };

  const activeRoot: PlistNode | null = parseResult
    ? parseResult.metadata.isKeyedArchive && parseResult.unarchivedRoot && showUnarchived
      ? parseResult.unarchivedRoot
      : parseResult.root
    : null;

  return (
    <div
      className="app-shell"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDropFile}
    >
      {/* Hidden browser file input fallback */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleBrowserFileSelected}
      />

      {/* Top Toolbar */}
      <header className="top-toolbar">
        <div className="brand-block">
          <span className="brand-icon">⌘</span>
          <div>
            <div className="brand-title">PListViewer</div>
            <div className="brand-subtitle">Binary &amp; XML Plist Forensic Inspector</div>
          </div>
        </div>

        <div className="toolbar-group">
          <button className="btn-primary" onClick={handleOpenFileClick}>
            📂 Open File...
          </button>
          <button className="btn-secondary" onClick={() => setIsRawModalOpen(true)}>
            📋 Paste String / Hex
          </button>

          <div className="sample-buttons">
            <span className="toolbar-label">Samples:</span>
            <button
              className="btn-mini"
              onClick={() => handleLoadSample('binary')}
              title="Load sample Binary Plist (bplist00)"
            >
              Binary
            </button>
            <button
              className="btn-mini"
              onClick={() => handleLoadSample('xml')}
              title="Load sample XML Plist"
            >
              XML
            </button>
            <button
              className="btn-mini"
              onClick={() => handleLoadSample('nskeyed')}
              title="Load sample NSKeyedArchiver Plist"
            >
              NSKeyedArchiver
            </button>
          </div>
        </div>

        {/* Parser Engine Selector (including Scaffolding engines) */}
        <div className="toolbar-group">
          <label className="toolbar-label">
            Parser:
            <select
              className="select-input"
              value={selectedParserId}
              onChange={(e) => setSelectedParserId(e.target.value)}
              title="Select parser engine or auto-detect"
            >
              <option value="auto">Auto-Detect Format</option>
              {parsers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.status === 'scaffold' ? '[Scaffold]' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* View Mode Selector */}
        <div className="toolbar-group view-toggle">
          <button
            className={`toggle-btn ${viewMode === 'split' ? 'active' : ''}`}
            onClick={() => setViewMode('split')}
          >
            Split
          </button>
          <button
            className={`toggle-btn ${viewMode === 'tree' ? 'active' : ''}`}
            onClick={() => setViewMode('tree')}
          >
            Tree
          </button>
          <button
            className={`toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            Grid
          </button>
        </div>

        {/* Export Actions */}
        <div className="toolbar-group">
          <button
            className="btn-secondary"
            disabled={!parseResult}
            onClick={() => handleExport('csv')}
            title="Save flattened key-value rows to CSV"
          >
            ⬇ Save CSV
          </button>
          <button
            className="btn-secondary"
            disabled={!parseResult}
            onClick={() => handleExport('txt')}
            title="Save formatted tree report to TXT"
          >
            ⬇ Save TXT
          </button>
        </div>
      </header>

      {/* Filter & Metadata Sub-bar */}
      <div className="sub-toolbar">
        {historyStack.length > 0 && (
          <button className="btn-primary btn-small" onClick={handlePopHistory}>
            ← Back to Parent Plist ({historyStack[historyStack.length - 1].metadata.sourceName})
          </button>
        )}

        <input
          type="search"
          className="search-input"
          placeholder="Search keys, paths, values, or ASCII strings..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <select
          className="select-input"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All Data Types</option>
          <option value="dict">dict</option>
          <option value="array">array</option>
          <option value="string">string</option>
          <option value="data">data (binary)</option>
          <option value="integer">integer</option>
          <option value="real">real (float)</option>
          <option value="boolean">boolean</option>
          <option value="date">date</option>
          <option value="uid">uid</option>
        </select>

        {parseResult?.metadata.isKeyedArchive && parseResult.unarchivedRoot && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showUnarchived}
              onChange={(e) => {
                const next = e.target.checked;
                setShowUnarchived(next);
                setSelectedNode(
                  next && parseResult.unarchivedRoot
                    ? parseResult.unarchivedRoot
                    : parseResult.root
                );
              }}
            />
            Unarchive NSKeyedArchiver ($objects UIDs)
          </label>
        )}

        {parseResult && (
          <div className="metadata-pills">
            <span className="meta-pill">
              <strong>File:</strong> {parseResult.metadata.sourceName}
            </span>
            <span className="meta-pill format-pill">
              {parseResult.metadata.detectedFormat}
            </span>
            <span className="meta-pill">
              {parseResult.metadata.fileSize.toLocaleString()} bytes
            </span>
            <span className="meta-pill">
              {parseResult.metadata.totalNodes.toLocaleString()} nodes
            </span>
          </div>
        )}
      </div>

      {errorBanner && (
        <div className="error-banner">
          <span>⚠ {errorBanner}</span>
          <button className="btn-mini" onClick={() => setErrorBanner(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Main Workspace Split Area */}
      <main className="workspace-grid">
        <div className={`explorer-column mode-${viewMode}`}>
          {activeRoot ? (
            <>
              {(viewMode === 'tree' || viewMode === 'split') && (
                <TreeView
                  root={activeRoot}
                  selectedNodeId={selectedNode?.id || null}
                  onSelectNode={(n) => setSelectedNode(n)}
                  searchQuery={searchQuery}
                  typeFilter={typeFilter}
                />
              )}
              {(viewMode === 'grid' || viewMode === 'split') && (
                <GridView
                  root={activeRoot}
                  selectedNodeId={selectedNode?.id || null}
                  onSelectNode={(n) => setSelectedNode(n)}
                  searchQuery={searchQuery}
                  typeFilter={typeFilter}
                />
              )}
            </>
          ) : (
            <div className="empty-state">
              <p>Drop a .plist, .bplist, .sqlite, or binary file here, or click Open File.</p>
            </div>
          )}
        </div>

        {/* Right-hand Value View Window */}
        <DetailInspector
          node={selectedNode}
          onSelectChildNode={(child) => setSelectedNode(child)}
          onParseEmbeddedPlist={handleParseEmbeddedPlist}
        />
      </main>

      {/* Status Footer */}
      <footer className="status-footer">
        <span>{statusMessage}</span>
        <span>Drag &amp; drop any file anywhere to inspect • Cross-Platform Electron + Python</span>
      </footer>

      <RawInputModal
        isOpen={isRawModalOpen}
        onClose={() => setIsRawModalOpen(false)}
        onSubmit={handleRawSubmit}
      />
    </div>
  );
};
