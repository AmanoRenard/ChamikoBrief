"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Download, X } from "lucide-react";
import type { BriefEntry } from "@/types/brief";
import { CopyLinkButton } from "@/components/brief/copy-link-button";
import { FILE_TYPE_COLORS } from "@/components/brief/entry-glyph";
import { MarkdownView } from "@/components/brief/markdown-view";
import { getFileTypeIcon } from "@/lib/file-utils";
import { downloadFile } from "@/lib/share-url";
import { useCopyFeedback } from "@/hooks/use-copy-feedback";
import { useOverlayPresence } from "@/hooks/use-overlay-presence";
import { useScrollLock } from "@/hooks/useScrollLock";

/* 弹层由三层独立的层组成，每层只动画自己的属性：
     1. blur   —— 只动画 backdrop 模糊半径，自身透明度恒为 1；
     2. scrim  —— 纯色遮罩，只动画 opacity；
     3. content—— 面板所在层，只动画 opacity，面板再做缩放弹簧。
   模糊层与遮罩层恒定 pointer-events: none，绝不可能挡住页面点击。 */
const BLUR_ON = "blur(24px)";
const BLUR_OFF = "blur(0px)";

interface TextPreviewProps {
  entry: BriefEntry | null;
  onClose: () => void;
}

export function TextPreview({ entry, onClose }: TextPreviewProps) {
  const { present, open } = useOverlayPresence(entry);
  /** 点空白关闭后让内容层停止接收点击，避免"关闭后的余波点击"落到下面的卡片墙 */
  const [dismissing, setDismissing] = useState(false);

  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const shown = present;
  /** 「复制内容」的反馈状态；换文件时复位 */
  const { copied, copy: copyContent } = useCopyFeedback(shown?.href ?? null);

  useScrollLock(!!shown);

  // 重新打开时恢复可交互
  useEffect(() => {
    if (entry) setDismissing(false);
  }, [entry]);

  useEffect(() => {
    // 关闭时**不要**清空：退场动画期间（OVERLAY_EXIT_MS ≈ 240ms）面板仍在渲染，
    // 清空会让正文在动画里瞬间消失。打开新文件时 loading 会先接管显示，
    // 因此也不会看到上一个文件的残留内容。
    if (!entry) return;

    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    fetch(entry.href, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        setContent(text);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled || err.name === "AbortError") return;
        console.error("文本加载失败", err);
        setFailed(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [entry]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const handleCopyContent = () => {
    void copyContent(content);
  };

  if (!shown) return null;

  // 类型徽标沿用卡片/列表的同一套配色，避免同一个文件在弹窗里换个颜色
  const badgeColor = FILE_TYPE_COLORS[getFileTypeIcon(shown.ext)] || FILE_TYPE_COLORS.file;

  return (
    <>
      {/* 1. 模糊层：只动画模糊半径，永不可点击 */}
      <motion.div
        aria-hidden
        initial={{ backdropFilter: BLUR_OFF, WebkitBackdropFilter: BLUR_OFF }}
        animate={{
          backdropFilter: open ? BLUR_ON : BLUR_OFF,
          WebkitBackdropFilter: open ? BLUR_ON : BLUR_OFF,
        }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="pointer-events-none fixed inset-0 z-[9996] transform-gpu"
      />

      {/* 2. 纯色遮罩：只动画 opacity，永不可点击 */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: 0.15 }}
        className="scrim pointer-events-none fixed inset-0 z-[9997]"
      />

      {/* 3. 内容层：点空白关闭；关闭瞬间停止接收点击。
          缩放动画放在这一层（无任何 filter），玻璃面板保持静态子节点 ——
          带 backdrop-filter 的元素自己做 transform 会逐帧重栅格化快照，收尾会抖动。 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: open ? 1 : 0, scale: open ? 1 : 0.94 }}
        transition={{
          opacity: { duration: 0.15 },
          // 临界阻尼（ζ≈0.98）：不回弹，收尾不抖
          scale: { type: "spring", stiffness: 300, damping: 34 },
        }}
        className={`fixed inset-0 z-[9998] flex items-center justify-center p-3 sm:p-6 ${
          dismissing ? "pointer-events-none" : ""
        }`}
        onClick={(event) => {
          event.stopPropagation();
          setDismissing(true);
          onClose();
        }}
      >
        <div
          className="glass-card w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 头部 */}
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-8 h-8 rounded-lg ${badgeColor} flex items-center justify-center flex-shrink-0`}>
                <span className="text-[11px] font-bold">
                  {(shown.ext.toUpperCase().replace(".", "") || "TXT").slice(0, 4)}
                </span>
              </div>
              <span className="text-sm font-medium text-slate-200 truncate select-text">{shown.name}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={handleCopyContent}
                title="复制内容"
                className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
              >
                {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} className="text-slate-400" />}
              </button>
              <CopyLinkButton
                entry={shown}
                iconSize={15}
                iconClassName="text-slate-400"
                className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
              />
              <button
                onClick={() => downloadFile(shown.href, shown.name)}
                title="下载"
                className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Download size={15} className="text-slate-400" />
              </button>
              <button
                onClick={onClose}
                title="关闭"
                className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={16} className="text-slate-400" />
              </button>
            </div>
          </div>

          {/* 内容：预留滚动条占位，内容变高时不会因滚动条出现而改变文本宽度 */}
          <div className="flex-1 min-h-0 overflow-auto px-5 py-4 [scrollbar-gutter:stable]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : failed ? (
              <p className="text-sm text-slate-500 py-10 text-center">内容加载失败，请直接下载查看。</p>
            ) : shown.kind === "markdown" ? (
              <MarkdownView content={content} />
            ) : (
              <pre className="text-sm text-slate-300 font-mono leading-relaxed whitespace-pre-wrap break-words select-text">
                {content}
              </pre>
            )}
          </div>

          {/* 底部 */}
          <div className="px-5 py-2.5 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-500">
            <span>{shown.kind === "markdown" ? "Markdown 文档" : "纯文本"}</span>
            <span>{content.length.toLocaleString()} 字符</span>
          </div>
        </div>
      </motion.div>
    </>
  );
}
