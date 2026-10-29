import React, { useState, useMemo } from 'react';
import { PlistNode, PlistNodeType } from '../types';

interface TreeViewProps {
  root: PlistNode;
  selectedNodeId: string | null;
  onSelectNode: (node: PlistNode) => void;
  searchQuery: string;
  typeFilter: string;
}

function nodeMatchesFilter(node: PlistNode, query: string, typeFilter: string): boolean {
  const q = query.trim().toLowerCase();
  const matchesType = typeFilter === 'all' || node.type === typeFilter;
  const matchesText =
    !q ||
    node.key.toLowerCase().includes(q) ||
    node.path.toLowerCase().includes(q) ||
    node.displayValue.toLowerCase().includes(q) ||
    (node.asciiPreview ? node.asciiPreview.toLowerCase().includes(q) : false);

  if (matchesType && matchesText) {
    return true;
  }
  return node.children.some((child) => nodeMatchesFilter(child, query, typeFilter));
}

function collectAllExpandableIds(node: PlistNode, acc: Set<string> = new Set()): Set<string> {
  if (node.children && node.children.length > 0) {
    acc.add(node.id);
    for (const c of node.children) {
      collectAllExpandableIds(c, acc);
    }
  }
  return acc;
}

export const TreeView: React.FC<TreeViewProps> = ({
  root,
  selectedNodeId,
  onSelectNode,
  searchQuery,
  typeFilter,
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>([root.id]);
    for (const c of root.children) {
      initial.add(c.id);
    }
    return initial;
  });

  // Reset root expansion when root changes
  React.useEffect(() => {
    const next = new Set<string>([root.id]);
    for (const c of root.children) {
      next.add(c.id);
    }
    setExpandedIds(next);
  }, [root.id]);

  const isFiltering = searchQuery.trim().length > 0 || typeFilter !== 'all';

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(collectAllExpandableIds(root));
  };

  const collapseAll = () => {
    setExpandedIds(new Set([root.id]));
  };

  const renderNode = (node: PlistNode, depth: number): React.ReactNode => {
    if (isFiltering && !nodeMatchesFilter(node, searchQuery, typeFilter)) {
      return null;
    }

    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = isFiltering || expandedIds.has(node.id);
    const isSelected = selectedNodeId === node.id;

    return (
      <div key={node.id} className="tree-node-wrapper">
        <div
          className={`tree-row ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${depth * 18 + 8}px` }}
          onClick={() => onSelectNode(node)}
        >
          <span
            className={`tree-caret ${hasChildren ? 'clickable' : 'empty'}`}
            onClick={(e) => (hasChildren ? toggleExpand(node.id, e) : undefined)}
          >
            {hasChildren ? (isExpanded ? '▾' : '▸') : '•'}
          </span>

          <span className="tree-key" title={node.path}>
            {node.key}
          </span>

          <span className={`type-badge type-${node.type as PlistNodeType}`}>
            {node.type}
          </span>

          {node.hasEmbeddedPlist && (
            <span className="embedded-badge" title="Contains embedded Plist data!">
              nested plist
            </span>
          )}

          <span className="tree-value" title={node.displayValue}>
            {node.displayValue}
          </span>
        </div>

        {hasChildren && isExpanded && (
          <div className="tree-children">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const treeContent = useMemo(
    () => renderNode(root, 0),
    [root, selectedNodeId, expandedIds, searchQuery, typeFilter]
  );

  return (
    <div className="pane-section tree-pane">
      <div className="pane-header">
        <span className="pane-title">Hierarchy Tree View</span>
        <div className="pane-actions">
          <button className="btn-mini" onClick={expandAll} title="Expand all nodes">
            Expand All
          </button>
          <button className="btn-mini" onClick={collapseAll} title="Collapse to root">
            Collapse All
          </button>
        </div>
      </div>
      <div className="tree-container">{treeContent}</div>
    </div>
  );
};
