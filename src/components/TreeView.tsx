import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Reset root expansion when root changes
  useEffect(() => {
    const next = new Set<string>([root.id]);
    for (const c of root.children) {
      next.add(c.id);
    }
    setExpandedIds(next);
  }, [root.id]);

  const isFiltering = searchQuery.trim().length > 0 || typeFilter !== 'all';

  // Compute flat list of currently visible nodes in tree order for ArrowUp/ArrowDown navigation
  const visibleNodes = useMemo(() => {
    const list: PlistNode[] = [];
    const walk = (node: PlistNode) => {
      if (isFiltering && !nodeMatchesFilter(node, searchQuery, typeFilter)) {
        return;
      }
      list.push(node);
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = isFiltering || expandedIds.has(node.id);
      if (hasChildren && isExpanded) {
        for (const child of node.children) {
          walk(child);
        }
      }
    };
    walk(root);
    return list;
  }, [root, expandedIds, isFiltering, searchQuery, typeFilter]);

  useEffect(() => {
    if (!selectedNodeId) return;
    const rowEl = rowRefs.current.get(selectedNodeId);
    if (rowEl) {
      rowEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedNodeId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
      return;
    }
    if (visibleNodes.length === 0) {
      return;
    }

    e.preventDefault();
    const currentIndex = visibleNodes.findIndex((n) => n.id === selectedNodeId);
    let nextIndex = 0;
    if (currentIndex === -1) {
      nextIndex = 0;
    } else if (e.key === 'ArrowDown') {
      nextIndex = Math.min(currentIndex + 1, visibleNodes.length - 1);
    } else if (e.key === 'ArrowUp') {
      nextIndex = Math.max(currentIndex - 1, 0);
    }

    const targetNode = visibleNodes[nextIndex];
    if (targetNode && targetNode.id !== selectedNodeId) {
      onSelectNode(targetNode);
    }
  };

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
          ref={(el) => {
            if (el) {
              rowRefs.current.set(node.id, el);
            } else {
              rowRefs.current.delete(node.id);
            }
          }}
          className={`tree-row ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${depth * 18 + 8}px` }}
          onClick={() => {
            containerRef.current?.focus({ preventScroll: true });
            onSelectNode(node);
          }}
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
      <div
        ref={containerRef}
        className="tree-container"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {treeContent}
      </div>
    </div>
  );
};
