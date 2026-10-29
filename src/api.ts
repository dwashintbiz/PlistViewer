import { ParseResult, ParserInfo, PlistNode, SourceMetadata } from './types';

let cachedBaseUrl: string | null = null;

export async function getBackendBaseUrl(): Promise<string> {
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }
  if (window.plistApi?.getBackendUrl) {
    try {
      cachedBaseUrl = await window.plistApi.getBackendUrl();
      return cachedBaseUrl;
    } catch {
      // Fallback to default local port
    }
  }
  cachedBaseUrl = 'http://127.0.0.1:8765';
  return cachedBaseUrl;
}

export async function fetchParsers(): Promise<ParserInfo[]> {
  const baseUrl = await getBackendBaseUrl();
  const res = await fetch(`${baseUrl}/api/parsers`);
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'Failed to fetch parsers');
  }
  return data.parsers;
}

export async function parseFilePath(filePath: string, parserId = 'auto'): Promise<ParseResult> {
  const baseUrl = await getBackendBaseUrl();
  const res = await fetch(`${baseUrl}/api/parse/file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, parserId }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'Failed to parse file');
  }
  return data.result;
}

export async function parseBytesBase64(
  base64Data: string,
  sourceName: string,
  parserId = 'auto',
  sourcePath?: string
): Promise<ParseResult> {
  const baseUrl = await getBackendBaseUrl();
  const res = await fetch(`${baseUrl}/api/parse/bytes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Data, sourceName, sourcePath, parserId }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'Failed to parse byte payload');
  }
  return data.result;
}

export async function parseRawText(
  rawText: string,
  encoding: 'auto' | 'xml' | 'hex' | 'base64' = 'auto',
  sourceName = 'Pasted Input'
): Promise<ParseResult> {
  const baseUrl = await getBackendBaseUrl();
  const res = await fetch(`${baseUrl}/api/parse/raw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText, encoding, sourceName }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'Failed to parse raw input');
  }
  return data.result;
}

export async function loadSamplePlist(
  sampleType: 'binary' | 'xml' | 'nskeyed'
): Promise<ParseResult> {
  const baseUrl = await getBackendBaseUrl();
  const res = await fetch(`${baseUrl}/api/sample`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sampleType }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'Failed to load sample plist');
  }
  return data.result;
}

export async function generateExportContent(
  rootNode: PlistNode,
  metadata: SourceMetadata,
  format: 'csv' | 'txt'
): Promise<string> {
  const baseUrl = await getBackendBaseUrl();
  const res = await fetch(`${baseUrl}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rootNode, metadata, format }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'Failed to generate export');
  }
  return data.content;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
