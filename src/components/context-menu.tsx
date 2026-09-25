"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";
import { Download, ExternalLink, Eye, Info } from "lucide-react";
import type { BriefEntry } from "@/types/brief";

export interface ContextMenuItem {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
  header?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 40 - 20);

  return (
    <AnimatePresence>
      {/* 外层只做 opacity / scale 动画，内层静态承载模糊与底色 */}
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="fixed z-[9998] min-w-[180px] rounded-xl shadow-2xl"
        style={{ left: adjustedX, top: adjustedY }}
      >
        <div
          aria-hidden
          className="absolute inset-0 rounded-xl bg-[#0f0f23]/95 backdrop-blur-xl border border-white/[0.08]"
        />
        <div className="relative py-1.5">
          {items.map((item, idx) => (
            <div key={idx}>
              {item.divider && <div className="my-1 border-t border-white/[0.06]" />}
              {item.header ? (
                <div className="flex items-center gap-3 px-3.5 py-2 text-xs font-medium text-slate-500 cursor-default">
                  {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                  <span>{item.label}</span>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    item.onClick();
                    onClose();
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2 text-sm transition-colors cursor-pointer ${
                    item.danger
                      ? "text-red-400 hover:bg-red-500/10"
                      : "text-slate-300 hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/** 条目右键菜单：打开/预览、下载、分享链接、文件信息 */
export function getEntryContextMenuItems(
  entry: BriefEntry,
  callbacks: {
    onOpen: () => void;
    onPreview: () => void;
    onDownload: () => void;
    onCopyLink: () => void;
    onShowInfo: () => void;
  }
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];

  if (entry.isFolder) {
    // 目标不存在的占位卡、以及别名页里锁定的引用：都没有可执行操作
    if (entry.missing || entry.locked) return items;
    items.push({ icon: <Eye size={15} />, label: "打开", onClick: callbacks.onOpen });
    return items;
  }

  if (entry.kind === "image" || entry.kind === "text" || entry.kind === "markdown") {
    items.push({ icon: <Eye size={15} />, label: "预览", onClick: callbacks.onPreview });
  }
  items.push({ icon: <Download size={15} />, label: "下载", onClick: callbacks.onDownload });
  items.push({ icon: <ExternalLink size={15} />, label: "分享链接", onClick: callbacks.onCopyLink });
  items.push({
    divider: true,
    icon: <Info size={15} />,
    label: "文件信息",
    onClick: callbacks.onShowInfo,
  });

  return items;
}
