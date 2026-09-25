"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Download, Eye, X } from "lucide-react";
import type { BriefEntry } from "@/types/brief";
import { CopyLinkButton } from "@/components/brief/copy-link-button";
import { FILE_TYPE_COLORS } from "@/components/brief/entry-glyph";
import {
  canPreviewNatively,
  canPreviewViaOfficeViewer,
  formatDateTime,
  formatFileSize,
  getFileTypeIcon,
} from "@/lib/file-utils";
import { buildOfficePreviewUrl, canUseOfficeViewer, downloadFile } from "@/lib/share-url";
import { useOverlayPresence } from "@/hooks/use-overlay-presence";
import { useScrollLock } from "@/hooks/useScrollLock";

/* 与其它弹层同一套三层结构：模糊层只动画半径、遮罩层只动画 opacity、
   内容层承担 opacity + scale（该层无任何 filter，玻璃面板是它的静态子节点）。
   详见 PROJECT_CONTEXT 约定 20 / 21 / 22。 */
const BLUR_ON = "blur(24px)";
const BLUR_OFF = "blur(0px)";

/** 底部操作按钮的统一外观（三个按钮等宽平分） */
const ACTION_CLASS =
  "flex-1 h-9 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center gap-1.5 text-xs text-slate-200 hover:bg-white/[0.12] hover:text-white transition-colors cursor-pointer whitespace-nowrap px-2";

interface FileInfoDialogProps {
  entry: BriefEntry | null;
  onClose: () => void;
  /** 站内可预览的类型（图片 / 文本 / Markdown）交回浏览页打开原有预览 */
  onPreview: (entry: BriefEntry) => void;
}

function isSitePreviewable(entry: BriefEntry): boolean {
  return entry.kind === "image" || entry.kind === "text" || entry.kind === "markdown";
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-white/[0.04] last:border-b-0">
      <span className="text-xs text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-xs text-slate-300 text-right break-all select-text">{value}</span>
    </div>
  );
}

/**
 * 文件信息弹窗：给「站内没法预览」的素材（psd / zip / pdf…）一个落点，
 * 顺带在所有文件的右键菜单里提供入口。底部按可预览性给出：
 * 站内预览或浏览器内预览（有则显示）· 分享链接（点一下即复制）· 下载文件。
 */
export function FileInfoDialog({ entry, onClose, onPreview }: FileInfoDialogProps) {
  const { present, open } = useOverlayPresence(entry);
  /** 点空白关闭后让内容层停止接收点击，避免"关闭后的余波点击"落到下面的卡片墙 */
  const [dismissing, setDismissing] = useState(false);

  const shown = present;

  useScrollLock(!!shown);

  // 重新打开时恢复可交互
  useEffect(() => {
    if (entry) setDismissing(false);
  }, [entry]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDismissing(true);
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const dismiss = () => {
    setDismissing(true);
    onClose();
  };

  if (!shown) return null;

  const badgeColor = FILE_TYPE_COLORS[getFileTypeIcon(shown.ext)] || FILE_TYPE_COLORS.file;
  const extLabel = shown.ext.replace(".", "").toUpperCase();
  const typeText = shown.isFolder
    ? shown.missing
      ? "引用 · 目标不存在"
      : shown.locked
        ? "引用 · 不可嵌套"
        : shown.shortcut
          ? `引用 · ${shown.itemCount ?? 0} 项`
          : `文件夹 · ${shown.itemCount ?? 0} 项`
    : `${extLabel || "未知"} 文件`;
  const canSitePreview = isSitePreviewable(shown);
  // pdf：浏览器自带阅读器；Office 三件套：交给微软在线预览器（本地预览时该按钮不出现）
  const canNativePreview = !shown.isFolder && canPreviewNatively(shown.ext);
  const canOfficePreview =
    !shown.isFolder && canPreviewViaOfficeViewer(shown.ext) && canUseOfficeViewer();

  /** 「预览」按钮：站内预览 / 浏览器自带阅读器 / 微软在线预览，三者皆无则不显示 */
  const preview = canSitePreview
    ? {
        icon: <Eye size={15} />,
        title: "站内预览",
        run: () => {
          dismiss();
          onPreview(shown);
        },
      }
    : canNativePreview
      ? {
          icon: <Eye size={15} />,
          title: "用浏览器自带阅读器打开",
          run: () => window.open(shown.href, "_blank", "noopener"),
        }
      : canOfficePreview
        ? {
            icon: <Eye size={15} />,
            title: "用微软在线预览打开（需部署到线上）",
            run: () => window.open(buildOfficePreviewUrl(shown.href), "_blank", "noopener"),
          }
        : null;

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

      {/* 3. 内容层 */}
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
          dismiss();
        }}
      >
        <div
          className="glass-card w-full max-w-[460px] overflow-hidden"
          onClick={(event) => event.stopPropagation()}
        >
          {/* 头部：类型徽标 + 文件名 */}
          <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-white/[0.06]">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl ${badgeColor} flex items-center justify-center flex-shrink-0`}
              >
                <span className="text-[10px] font-bold">{extLabel.slice(0, 4) || "—"}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-100 break-all select-text">
                  {shown.name}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">文件信息</p>
              </div>
            </div>
            <button
              type="button"
              onClick={dismiss}
              title="关闭"
              aria-label="关闭"
              className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          {/* 信息 */}
          <div className="px-4 sm:px-5 py-2">
            <InfoRow label="类型" value={typeText} />
            <InfoRow label="大小" value={shown.isFolder ? "—" : formatFileSize(shown.size)} />
            <InfoRow label="加入时间" value={formatDateTime(shown.time)} />
          </div>

          {/* 操作 */}
          <div className="flex items-center gap-2 px-4 sm:px-5 py-3.5 border-t border-white/[0.06]">
            {preview && (
              <button type="button" title={preview.title} onClick={preview.run} className={ACTION_CLASS}>
                {preview.icon} 预览
              </button>
            )}
            <CopyLinkButton
              entry={shown}
              iconSize={15}
              label="分享链接"
              className={ACTION_CLASS}
            />
            {!shown.isFolder && (
              <button
                type="button"
                onClick={() => downloadFile(shown.href, shown.name)}
                className={ACTION_CLASS}
              >
                <Download size={15} /> 下载文件
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}
