import React, { useMemo, useState } from 'react';
import { PlistNode } from '../types';

interface GridViewProps {
  root: PlistNode;
  selectedNodeId: string | null;
  onSelectNode: (node: PlistNode) => void;
  searchQuery: string;
  typeFilter: string;
}

type SortField = 'path' | 'key' | 'type' | 'displayValue' | 'size';
type SortDirection = 'asc' | 'desc';

function flattenTree(node: PlistNode, acc: PlistNode[] = []): PlistNode[] {
  acc.push(node);
  for (const child of node.children) {
    flattenTree(child, acc);
  }
  return acc;
}

export const GridView: React.FC<GridViewProps> = ({
  root,
  selectedNodeId,
  onSelectNode,
  searchQuery,
  typeFilter,
}) => {
  const [sortField, setSortField] = useState<SortField>('path');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  const allNodes = useMemo(() => flattenTree(root, []), [root]);

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = allNodes.filter((n) => {
      if (typeFilter !== 'all' && n.type !== typeFilter) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        n.key.toLowerCase().includes(q) ||
        n.path.toLowerCase().includes(q) ||
        n.displayValue.toLowerCase().includes(q) ||
        (n.asciiPreview ? n.asciiPreview.toLowerCase().includes(q) : false)
      );
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'size') {
        cmp = a.size - b.size;
      } else {
        cmp = String(a[sortField]).localeCompare(String(b[sortField]), undefined, {
          numeric: true,
        });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [allNodes, searchQuery, typeFilter, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <div className="pane-section grid-pane">
      <div className="pane-header">
        <span className="pane-title">
          Data Grid View ({filteredAndSorted.length.toLocaleString()} rows)
        </span>
      </div>
      <div className="grid-table-wrapper">
        <table className="data-grid">
          <thead>
            <tr>
              <th onClick={() => handleSort('key')}>Key{sortIndicator('key')}</th>
              <th onClick={() => handleSort('type')}>Type{sortIndicator('type')}</th>
              <th onClick={() => handleSort('displayValue')}>
                Value Preview{sortIndicator('displayValue')}
              </th>
              <th onClick={() => handleSort('size')}>Size{sortIndicator('size')}</th>
              <th onClick={() => handleSort('path')}>Full Key Path{sortIndicator('path')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((node) => {
              const isSelected = node.id === selectedNodeId;
              return (
                <tr
                  key={node.id}
                  className={isSelected ? 'selected' : ''}
                  onClick={() => onSelectNode(node)}
                >
                  <td className="col-key">
                    {node.key}
                    {node.hasEmbeddedPlist && (
                      <span className="embedded-badge" style={{ marginLeft: 6 }}>
                        nested
                      </span>
                    )}
                  </td>
                  <td className="col-type">
                    <span className={`type-badge type-${node.type}`}>{node.type}</span>
                  </td>
                  <td className="col-value">{node.displayValue}</td>
                  <td className="col-size">
                    {node.type === 'dict' || node.type === 'array'
                      ? `${node.size} items`
                      : `${node.size.toLocaleString()} B`}
                  </td>
                  <td className="col-path">{node.path}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
