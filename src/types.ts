export type PlistNodeType =
  | 'dict'
  | 'array'
  | 'string'
  | 'integer'
  | 'real'
  | 'boolean'
  | 'date'
  | 'data'
  | 'uid'
  | 'null';

export interface PlistNode {
  id: string;
  key: string;
  path: string;
  type: PlistNodeType;
  value: unknown;
  displayValue: string;
  size: number;
  hexPreview?: string | null;
  base64Value?: string | null;
  asciiPreview?: string | null;
  hasEmbeddedPlist?: boolean;
  children: PlistNode[];
}

export interface SourceMetadata {
  sourceName: string;
  sourcePath?: string | null;
  parserId: string;
  parserName: string;
  detectedFormat: string;
  fileSize: number;
  totalNodes: number;
  isKeyedArchive: boolean;
  extra?: Record<string, unknown>;
}

export interface ParseResult {
  metadata: SourceMetadata;
  root: PlistNode;
  unarchivedRoot?: PlistNode | null;
  warnings: string[];
}

export interface ParserInfo {
  id: string;
  name: string;
  description: string;
  supportedExtensions: string[];
  status: 'active' | 'scaffold';
}

export type ViewMode = 'split' | 'tree' | 'grid';

declare global {
  interface Window {
    plistApi?: {
      getBackendUrl: () => Promise<string>;
      openFileDialog: () => Promise<string | null>;
      saveExportDialog: (payload: {
        defaultName: string;
        format: 'csv' | 'txt';
        content: string;
      }) => Promise<{ saved: boolean; filePath: string | null }>;
    };
  }
}
