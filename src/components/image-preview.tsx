"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import type { BriefEntry } from "@/types/brief";
import { formatFileSize } from "@/lib/file-utils";
import { CopyLinkButton } from "@/components/brief/copy-link-button";
import { downloadFile } from "@/lib/share-url";
import { useOverlayPresence } from "@/hooks/use-overlay-presence";
import { useScrollLock } from "@/hooks/useScrollLock";

/* 与文本弹窗同一套三层结构：
     1. blur   —— 只动画 backdrop 模糊半径；
     2. scrim  —— 纯色遮罩，只动画 opacity；
     3. content—— 顶栏与图片，只动画 opacity。
   模糊层与遮罩层恒定 pointer-events: none，内容层在关闭瞬间停止接收点击。 */
const BLUR_ON = "blur(24px)";
const BLUR_OFF = "blur(0px)";

interface ImagePreviewProps {
  entry: BriefEntry | null;
  /** 同一文件夹内的全部图片，用于左右切换 */
  imageEntries: BriefEntry[];
  onClose: () => void;
  onNavigate: (entry: BriefEntry) => void;
}

export function ImagePreview({
  entry,
  imageEntries,
  onClose,
  onNavigate,
}: ImagePreviewProps) {
  const { present, open } = useOverlayPresence(entry);
  const [dismissing, setDismissing] = useState(false);
  const touchStartX = useRef<number | null>(null);
  /** 当前已解码完成的图片 href；用它代替布尔值，关闭时不会被重置 */
  const [readyHref, setReadyHref] = useState<string | null>(null);
  /** 上一张已就绪的图，切换时垫在底下，避免出现空白帧 */
  const [underlayHref, setUnderlayHref] = useState<string | null>(null);

  const shown = present;
  const href = entry?.href ?? null;
  const currentIndex = entry ? imageEntries.findIndex((item) => item.href === entry.href) : -1;
  const total = imageEntries.length;
  const imageReady = !!shown && readyHref === shown.href;

  useScrollLock(!!shown);

  useEffect(() => {
    if (entry) setDismissing(false);
  }, [entry]);

  // 只在真正换图（entry 非空且 href 变化）时重置；关闭时不重置，
  // 否则退出动画进行到一半会看到图片先消失。
  useEffect(() => {
    if (!href) return;
    setUnderlayHref((prev) => (prev === href ? prev : null));
    setReadyHref((prev) => (prev === href ? prev : null));
  }, [href]);

  const step = useCallback(
    (delta: number) => {
      if (!entry || currentIndex < 0 || total < 2) return;
      const next = imageEntries[(currentIndex + delta + total) % total];
      setUnderlayHref(entry.href);
      onNavigate(next);
    },
    [entry, currentIndex, total, imageEntries, onNavigate],
  );

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, step]);

  if (!shown) return null;

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

      {/* 3. 内容层：点空白关闭；关闭瞬间停止接收点击 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: 0.15 }}
        className={`fixed inset-0 z-[9998] flex flex-col transform-gpu ${
          dismissing ? "pointer-events-none" : ""
        }`}
        onClick={(event) => {
          event.stopPropagation();
          setDismissing(true);
          onClose();
        }}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return;
          const delta = e.changedTouches[0].clientX - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(delta) > 60) step(delta > 0 ? -1 : 1);
        }}
      >
        {/* 顶栏 */}
        <div
          className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-gradient-to-b from-black/60 to-transparent"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100 truncate select-text">{shown.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {formatFileSize(shown.size)}
              {total > 1 && currentIndex >= 0 ? ` · ${currentIndex + 1} / ${total}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => downloadFile(shown.href, shown.name)}
              title="下载原图"
              className="w-9 h-9 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/[0.12] transition-colors cursor-pointer"
            >
              <Download size={16} />
            </button>
            <CopyLinkButton
              entry={shown}
              iconSize={16}
              className="w-9 h-9 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/[0.12] transition-colors cursor-pointer"
            />
            <button
              onClick={onClose}
              title="关闭"
              className="w-9 h-9 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/[0.12] transition-colors cursor-pointer"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* 图像区 */}
        <div className="relative flex-1 min-h-0 overflow-hidden flex items-center justify-center px-3 sm:px-14 pb-6">
          {!imageReady && underlayHref && (
            <img
              src={underlayHref}
              alt=""
              aria-hidden
              draggable={false}
              className="absolute max-h-full max-w-full object-contain rounded-lg shadow-2xl opacity-40 select-none"
            />
          )}
          {!imageReady && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-9 h-9 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          )}
          <img
            key={shown.href}
            src={shown.href}
            alt={shown.name}
            onLoad={() => setReadyHref(shown.href)}
            onClick={(e) => e.stopPropagation()}
            draggable={false}
            className={`max-h-full max-w-full object-contain rounded-lg shadow-2xl select-none transition-opacity duration-200 ${
              imageReady ? "opacity-100" : "opacity-0"
            }`}
          />

          {total > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                title="上一张"
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-slate-200 hover:bg-black/70 transition-colors cursor-pointer"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                title="下一张"
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-slate-200 hover:bg-black/70 transition-colors cursor-pointer"
              >
                <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}
