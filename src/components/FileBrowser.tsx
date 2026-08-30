'use client';

import { useState, useCallback } from 'react';
import { Folder, File, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { useSkillStore } from '../store/skillStore';
import type { FileEntry } from '../types';

interface FileBrowserProps {
  files: FileEntry[];
  onFileSelect: (path: string) => void;
  /** Pre-loaded file contents keyed by path. When provided, these are used instead of fetching from backend. */
  fileContents?: Record<string, string>;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileTreeNodeProps {
  entry: FileEntry;
  depth: number;
  onFileSelect: (path: string) => void;
}

function FileTreeNode({ entry, depth, onFileSelect }: FileTreeNodeProps) {
  const store = useSkillStore();
  const [expanded, setExpanded] = useState(depth === 0);
  const [children, setChildren] = useState<FileEntry[] | undefined>(entry.children);
  const [loadingChildren, setLoadingChildren] = useState(false);

  const loadChildren = useCallback(async () => {
    if (!entry.isDir || children !== undefined) return;
    setLoadingChildren(true);
    try {
      const items = await store.browseSkillFiles(entry.path);
      setChildren(items);
    } catch (e) {
      setChildren([]);
      console.error('Failed to load directory children:', e);
    } finally {
      setLoadingChildren(false);
    }
  }, [entry.isDir, entry.path, children, store]);

  const handleClick = async () => {
    if (entry.isDir) {
      if (!expanded) {
        await loadChildren();
      }
      setExpanded((prev) => !prev);
    } else {
      onFileSelect(entry.path);
    }
  };

  const hasChildren = entry.isDir && (children === undefined || children.length > 0);

  return (
    <div>
      <button
        onClick={handleClick}
        className={`flex items-center gap-1.5 w-full px-2 py-1 rounded-md text-sm transition-colors hover:bg-trae-card-hover ${
          entry.isDir ? 'text-trae-text font-medium' : 'text-trae-text/80'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        aria-expanded={entry.isDir ? expanded : undefined}
      >
        {/* Expand arrow for directories */}
        {entry.isDir ? (
          <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
            {loadingChildren ? (
              <Loader2 className="w-3 h-3 text-trae-text-secondary animate-spin" />
            ) : hasChildren ? (
              expanded ? (
                <ChevronDown className="w-3 h-3 text-trae-text-secondary" />
              ) : (
                <ChevronRight className="w-3 h-3 text-trae-text-secondary" />
              )
            ) : null}
          </span>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        {/* Icon */}
        {entry.isDir ? (
          <Folder className="w-4 h-4 text-trae-accent/70 shrink-0" aria-hidden="true" />
        ) : (
          <File className="w-4 h-4 text-trae-text-secondary shrink-0" aria-hidden="true" />
        )}

        {/* Name */}
        <span className="truncate flex-1 text-left">{entry.name}</span>

        {/* Size */}
        {!entry.isDir && entry.size !== undefined && (
          <span className="text-[11px] text-trae-text-secondary shrink-0 ml-2">
            {formatSize(entry.size)}
          </span>
        )}
      </button>

      {/* Children */}
      {entry.isDir && expanded && children && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FileTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              onFileSelect={onFileSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileBrowser({ files, onFileSelect, fileContents }: FileBrowserProps) {
  const store = useSkillStore();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loadingContent, setLoadingContent] = useState(false);

  const handleFileSelect = async (path: string) => {
    setSelectedFile(path);
    setFileContent('');

    // Use pre-loaded content if available
    if (fileContents && fileContents[path] !== undefined) {
      setFileContent(fileContents[path]);
      onFileSelect(path);
      return;
    }

    setLoadingContent(true);
    try {
      const content = await store.readFileContent(path);
      setFileContent(content);
    } catch (e) {
      setFileContent(`读取文件失败: ${String(e)}`);
    } finally {
      setLoadingContent(false);
    }

    onFileSelect(path);
  };

  return (
    <div className="flex h-full gap-0 rounded-lg border border-trae-border overflow-hidden">
      {/* Tree panel */}
      <div className="w-64 shrink-0 bg-trae-sidebar border-r border-trae-border overflow-y-auto">
        <div className="px-3 py-2 border-b border-trae-border">
          <span className="text-xs text-trae-text-secondary font-medium">文件结构</span>
        </div>
        <div className="py-1">
          {files.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-trae-text-secondary">
              <p className="text-xs">无文件</p>
            </div>
          ) : (
            files.map((entry) => (
              <FileTreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                onFileSelect={handleFileSelect}
              />
            ))
          )}
        </div>
      </div>

      {/* Content panel */}
      <div className="flex-1 bg-trae-bg overflow-auto">
        {loadingContent ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 text-trae-accent animate-spin" />
            <span className="ml-2 text-sm text-trae-text-secondary">加载中...</span>
          </div>
        ) : selectedFile ? (
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <File className="w-3.5 h-3.5 text-trae-text-secondary" aria-hidden="true" />
              <span className="text-xs text-trae-text-secondary font-mono truncate">
                {selectedFile}
              </span>
            </div>
            <pre className="bg-trae-card/30 border border-trae-border rounded-lg p-4 text-xs text-trae-text/80 font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
              {fileContent || <span className="text-trae-text-secondary/50">空文件</span>}
            </pre>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-trae-text-secondary">
            <p className="text-sm">点击文件查看内容</p>
          </div>
        )}
      </div>
    </div>
  );
}
