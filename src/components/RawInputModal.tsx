import React, { useState } from 'react';

interface RawInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    rawText: string,
    encoding: 'auto' | 'xml' | 'hex' | 'base64',
    sourceName: string
  ) => void;
}

const SAMPLE_XML_SNIPPET = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>DeviceName</key>
  <string>MacBookPro-Analyst-01</string>
  <key>BootCount</key>
  <integer>42</integer>
  <key>FirewallEnabled</key>
  <true/>
  <key>TokenBytes</key>
  <data>deadbeefcafebabe0123456789abcdef</data>
</dict>
</plist>`;

export const RawInputModal: React.FC<RawInputModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [rawText, setRawText] = useState(SAMPLE_XML_SNIPPET);
  const [encoding, setEncoding] = useState<'auto' | 'xml' | 'hex' | 'base64'>('auto');
  const [sourceName, setSourceName] = useState('Pasted_Plist_Snippet.plist');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim()) return;
    onSubmit(rawText, encoding, sourceName || 'Pasted_Input.plist');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Parse Pasted Plist String, Hex Dump, or Base64 Blob</h3>
          <button className="btn-mini" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-row">
            <label>
              Label / Name:
              <input
                type="text"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                className="text-input"
              />
            </label>
            <label>
              Input Encoding:
              <select
                value={encoding}
                onChange={(e) =>
                  setEncoding(e.target.value as 'auto' | 'xml' | 'hex' | 'base64')
                }
                className="select-input"
              >
                <option value="auto">Auto-Detect (XML / Hex / Base64)</option>
                <option value="xml">XML Plist String</option>
                <option value="hex">Hexadecimal Bytes (bplist00 or XML)</option>
                <option value="base64">Base64 Encoded Plist</option>
              </select>
            </label>
          </div>
          <textarea
            className="raw-textarea"
            rows={12}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste XML <plist>...</plist>, Base64-encoded bplist00, or Hex bytes here..."
          />
          <div className="modal-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setRawText(SAMPLE_XML_SNIPPET)}
            >
              Reset Sample XML
            </button>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Parse &amp; Display
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
