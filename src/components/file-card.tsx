"use client";

import { memo, useRef } from "react";
import { Download } from "lucide-react";
import { motion } from "framer-motion";
import type { BriefEntry } from "@/types/brief";
import { formatDate, formatFileSize, getDisplayName } from "@/lib/file-utils";
import { CopyLinkButton } from "@/components/brief/copy-link-button";
import { EntryGlyph } from "@/components/brief/entry-glyph";
import { HighlightedName } from "@/components/brief/highlighted-name";

interface FileCardProps {
  entry: BriefEntry;
  /** 当前搜索词，用于标题关键词高亮 */
  query: string;
  onOpenFolder: (entry: BriefEntry) => void;
  onPreview: (entry: BriefEntry) => void;
  onDownload: (entry: BriefEntry) => void;
  onContextMenu: (event: React.MouseEvent, entry: BriefEntry) => void;
}

function FileCardRaw({
  entry,
  query,
  onOpenFolder,
  onPreview,
  onDownload,
  onContextMenu,
}: FileCardProps) {
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);
  /** 标题不显示扩展名（悬停提示与信息弹窗里仍是完整文件名），详见 getDisplayName */
  const displayName = getDisplayName(entry.name, entry.isFolder);

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
    /* 动画与 hover 缩放放在外层（framer-motion 统一接管 transform/opacity），
       玻璃表面放在内层，避免 backdrop-filter 元素自身被动画。 */
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      // 降饱和：透明度必须走 animate（framer-motion 的内联 opacity 会覆盖 Tailwind 的 opacity-70 类）
      animate={{ opacity: disabled ? 0.7 : 1, y: 0 }}
      whileHover={disabled ? undefined : { scale: 1.02, y: -2 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`relative group select-none rounded-2xl transition-shadow duration-200 ${
        disabled ? "cursor-not-allowed" : "cursor-pointer hover:shadow-lg hover:shadow-primary/5"
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
      <div className="glass-card overflow-hidden">
        {/* 悬停操作：下载 / 分享链接（触屏设备常显） */}
        {!entry.isFolder && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload(entry);
              }}
              title="下载"
              aria-label={`下载 ${entry.name}`}
              className="w-7 h-7 rounded-lg bg-black/55 border border-white/10 flex items-center justify-center text-slate-200 hover:text-white hover:bg-black/70 transition-colors cursor-pointer"
            >
              <Download size={13} />
            </button>
            <CopyLinkButton
              entry={entry}
              iconSize={13}
              className="w-7 h-7 rounded-lg bg-black/55 border border-white/10 flex items-center justify-center text-slate-200 hover:text-white hover:bg-black/70 transition-colors cursor-pointer"
            />
          </div>
        )}

        {/* 预览区：4:3，完整图（不裁切）叠在模糊底图上 */}
        <div className="relative aspect-[4/3] bg-white/[0.02] flex items-center justify-center overflow-hidden">
          <EntryGlyph entry={entry} variant="card" />
        </div>

        {/* 信息区：标题固定预留两行，保证网格底部对齐 */}
        <div className="p-2 sm:p-2.5">
          <p
            className="text-xs sm:text-[13px] font-medium leading-snug text-slate-200 line-clamp-2 min-h-[2.75em] transition-colors group-hover:text-slate-50"
            title={entry.name}
          >
            <span className="select-text cursor-text" onClick={(e) => e.stopPropagation()}>
              <HighlightedName name={displayName} query={query} />
            </span>
          </p>
          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] sm:text-[11px] text-slate-500">
            <span
              className={`truncate ${entry.missing ? "text-rose-400/80" : ""}`}
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
                : `${entry.ext.replace(".", "").toUpperCase() || "文件"} · ${formatFileSize(entry.size)}`}
            </span>
            <span className="whitespace-nowrap">{formatDate(entry.time)}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export const FileCard = memo(FileCardRaw);
