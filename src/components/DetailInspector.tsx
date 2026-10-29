import React, { useState } from 'react';
import { PlistNode } from '../types';

interface DetailInspectorProps {
  node: PlistNode | null;
  onSelectChildNode: (node: PlistNode) => void;
  onParseEmbeddedPlist: (node: PlistNode) => void;
}

type InspectorTab = 'formatted' | 'hex' | 'raw';

export const DetailInspector: React.FC<DetailInspectorProps> = ({
  node,
  onSelectChildNode,
  onParseEmbeddedPlist,
}) => {
  const [activeTab, setActiveTab] = useState<InspectorTab>('formatted');
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  if (!node) {
    return (
      <div className="inspector-pane empty-inspector">
        <div className="pane-header">
          <span className="pane-title">Value Inspector Window</span>
        </div>
        <div className="inspector-placeholder">
          <p>Click any row or node in the Tree or Grid view to inspect its value in detail.</p>
        </div>
      </div>
    );
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedLabel(label);
    setTimeout(() => setCopiedLabel(null), 1600);
  };

  const formattedValueText =
    node.value !== null && node.value !== undefined
      ? typeof node.value === 'object'
        ? JSON.stringify(node.value, null, 2)
        : String(node.value)
      : node.displayValue;

  return (
    <div className="inspector-pane">
      <div className="pane-header">
        <span className="pane-title">Value Inspector Window</span>
        <div className="pane-actions">
          {copiedLabel && <span className="copy-toast">Copied {copiedLabel}!</span>}
          <button
            className="btn-mini"
            onClick={() => copyToClipboard(node.path, 'Path')}
            title="Copy full key path"
          >
            Copy Path
          </button>
          <button
            className="btn-mini"
            onClick={() => copyToClipboard(formattedValueText, 'Value')}
            title="Copy node value"
          >
            Copy Value
          </button>
        </div>
      </div>

      {/* Summary Metadata Card */}
      <div className="inspector-summary">
        <div className="summary-row">
          <span className="summary-label">Key:</span>
          <span className="summary-val mono">{node.key}</span>
          <span className={`type-badge type-${node.type}`}>{node.type}</span>
          <span className="summary-size">
            {node.type === 'dict' || node.type === 'array'
              ? `${node.size} child items`
              : `${node.size.toLocaleString()} bytes`}
          </span>
        </div>
        <div className="summary-row">
          <span className="summary-label">Path:</span>
          <span className="summary-val mono path-val">{node.path}</span>
        </div>

        {node.hasEmbeddedPlist && (
          <div className="embedded-callout">
            <span>
              This <strong>{node.type}</strong> value contains an embedded Plist payload!
            </span>
            <button
              className="btn-primary btn-small"
              onClick={() => onParseEmbeddedPlist(node)}
            >
              Inspect Embedded Plist →
            </button>
          </div>
        )}
      </div>

      {/* Inspector Tabs */}
      <div className="inspector-tabs">
        <button
          className={`tab-btn ${activeTab === 'formatted' ? 'active' : ''}`}
          onClick={() => setActiveTab('formatted')}
        >
          Formatted Value
        </button>
        <button
          className={`tab-btn ${activeTab === 'hex' ? 'active' : ''}`}
          onClick={() => setActiveTab('hex')}
        >
          Hex + ASCII Dump
        </button>
        <button
          className={`tab-btn ${activeTab === 'raw' ? 'active' : ''}`}
          onClick={() => setActiveTab('raw')}
        >
          Base64 / JSON Node
        </button>
      </div>

      {/* Tab Content */}
      <div className="inspector-body">
        {activeTab === 'formatted' && (
          <div className="inspector-section">
            {(node.type === 'dict' || node.type === 'array') && node.children.length > 0 ? (
              <div>
                <div className="sub-heading">
                  Container Members ({node.children.length} direct children — click to jump):
                </div>
                <table className="data-grid compact-grid">
                  <thead>
                    <tr>
                      <th>Key / Index</th>
                      <th>Type</th>
                      <th>Value Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {node.children.map((child) => (
                      <tr key={child.id} onClick={() => onSelectChildNode(child)}>
                        <td className="col-key">{child.key}</td>
                        <td>
                          <span className={`type-badge type-${child.type}`}>
                            {child.type}
                          </span>
                        </td>
                        <td className="col-value">{child.displayValue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div>
                <div className="sub-heading">Decoded Value:</div>
                <pre className="code-viewer">{formattedValueText}</pre>

                {node.type === 'data' && node.asciiPreview && (
                  <>
                    <div className="sub-heading" style={{ marginTop: 12 }}>
                      Printable ASCII / UTF-8 Text Preview:
                    </div>
                    <pre className="code-viewer">{node.asciiPreview}</pre>
                  </>
                )}

                {node.type === 'integer' && node.hexPreview && (
                  <div className="sub-heading" style={{ marginTop: 12 }}>
                    Hexadecimal Representation: <code className="mono">{node.hexPreview}</code>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'hex' && (
          <div className="inspector-section">
            <div className="sub-heading">Hexadecimal &amp; ASCII View (16 bytes/row):</div>
            <pre className="code-viewer hex-dump">
              {node.hexPreview ||
                'No binary/byte stream associated with this container or primitive.'}
            </pre>
          </div>
        )}

        {activeTab === 'raw' && (
          <div className="inspector-section">
            {node.base64Value && (
              <>
                <div className="sub-heading">
                  Base64 Encoded Bytes
                  <button
                    className="btn-mini"
                    style={{ marginLeft: 8 }}
                    onClick={() => copyToClipboard(node.base64Value || '', 'Base64')}
                  >
                    Copy Base64
                  </button>
                </div>
                <pre className="code-viewer wrap-text">{node.base64Value}</pre>
              </>
            )}
            <div className="sub-heading" style={{ marginTop: 12 }}>
              Serialized Node Structure (JSON):
            </div>
            <pre className="code-viewer">
              {JSON.stringify(
                {
                  key: node.key,
                  path: node.path,
                  type: node.type,
                  size: node.size,
                  value: node.value,
                  childCount: node.children.length,
                },
                null,
                2
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
