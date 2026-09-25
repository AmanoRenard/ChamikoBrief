"use client";

import { memo, useRef } from "react";
import { Download } from "lucide-react";
import { motion } from "framer-motion";
import type { BriefEntry } from "@/types/brief";
import { formatDate, formatFileSize } from "@/lib/file-utils";
import { CopyLinkButton } from "@/components/brief/copy-link-button";
import { EntryGlyph } from "@/components/brief/entry-glyph";
import { HighlightedName } from "@/components/brief/highlighted-name";

interface FileRowProps {
  entry: BriefEntry;
  /** 当前搜索词，用于标题关键词高亮 */
  query: string;
  onOpenFolder: (entry: BriefEntry) => void;
  onPreview: (entry: BriefEntry) => void;
  onDownload: (entry: BriefEntry) => void;
  onContextMenu: (event: React.MouseEvent, entry: BriefEntry) => void;
}

function FileRowRaw({
  entry,
  query,
  onOpenFolder,
  onPreview,
  onDownload,
  onContextMenu,
}: FileRowProps) {
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);

  const wasDrag = (e: React.MouseEvent): boolean => {
    if (!mouseDownPos.current) return false;
    return (
      Math.abs(e.clientX - mouseDownPos.current.x) > 5 ||
      Math.abs(e.clientY - mouseDownPos.current.y) > 5
    );
  };

  /** 不可操作的条目：缺失目标（灰卡）与别名页里的引用（引用不可嵌套） */
  const disabled = Boolean(entry.missing || entry.locked);

  const handleActivate = (e: React.MouseEvent) => {
    if (disabled || wasDrag(e)) return;
    if (entry.isFolder) onOpenFolder(entry);
    else onPreview(entry);
  };

  return (
    /* 同 file-card：动画与 hover 在外层，玻璃表面在内层 */
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      // 同 file-card：降饱和走 animate，避免被 Tailwind 类与内联样式互相覆盖
      animate={{ opacity: disabled ? 0.7 : 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      whileHover={disabled ? undefined : { scale: 1.005 }}
      transition={{ duration: 0.2 }}
      className={`relative group select-none rounded-2xl transition-shadow duration-200 ${
        disabled ? "cursor-not-allowed" : "cursor-pointer hover:shadow-md hover:shadow-primary/5"
      }`}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
      aria-disabled={disabled ? true : undefined}
      onMouseDown={(e) => {
        mouseDownPos.current = { x: e.clientX, y: e.clientY };
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (disabled) return;
        onContextMenu(e, entry);
      }}
      onClick={handleActivate}
    >
      <div className="glass-card flex items-center gap-4 px-4 sm:px-5 py-3">
        <EntryGlyph entry={entry} variant="row" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate" title={entry.name}>
            <span className="select-text cursor-text" onClick={(e) => e.stopPropagation()}>
              <HighlightedName name={entry.name} query={query} />
            </span>
          </p>
          <p
            className={`text-xs mt-0.5 ${entry.missing ? "text-rose-400/80" : "text-slate-500"}`}
            title={entry.locked ? "引用内不能再进入引用" : entry.shortcut ? `引用 → ${entry.target}` : undefined}
          >
            {entry.isFolder
              ? entry.missing
                ? "目标不存在"
                : entry.locked
                  ? "引用 · 不可嵌套"
                  : entry.shortcut
                    ? `引用 · ${entry.itemCount ?? 0} 项`
                  : `${entry.itemCount ?? 0} 项`
              : `${entry.ext.toUpperCase().replace(".", "") || "文件"} 文件`}
          </p>
        </div>

        <div className="hidden sm:block w-24 text-right">
          <span className="text-sm text-slate-400">{entry.isFolder ? "" : formatFileSize(entry.size)}</span>
        </div>

        <div className="hidden md:block w-32 text-right">
          <span className="text-sm text-slate-500">{formatDate(entry.time)}</span>
        </div>

        {!entry.isFolder && (
          <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload(entry);
              }}
              title="下载"
              aria-label={`下载 ${entry.name}`}
              className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-slate-400 hover:text-white hover:border-white/[0.14] transition-colors cursor-pointer"
            >
              <Download size={14} />
            </button>
            <CopyLinkButton
              entry={entry}
              iconSize={14}
              className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-slate-400 hover:text-white hover:border-white/[0.14] transition-colors cursor-pointer"
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

export const FileRow = memo(FileRowRaw);
