"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import type { BriefEntry } from "@/types/brief";
import { formatFileSize } from "@/lib/file-utils";
import { CopyLinkButton } from "@/components/brief/copy-link-button";
import { downloadFile } from "@/lib/share-url";
import { useImageZoom } from "@/hooks/use-image-zoom";
import { useImageSize } from "@/hooks/use-image-size";
import { MetaPill } from "@/components/brief/meta-pill";
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
  /** 触屏上刚滑动过（切图）：浏览器有时还会补一个 click，别把它当成"单击放大" */
  const touchMovedRef = useRef(false);
  /** 当前已解码完成的图片 href；用它代替布尔值，关闭时不会被重置 */
  const [readyHref, setReadyHref] = useState<string | null>(null);
  /** 上一张已就绪的图，切换时垫在底下，避免出现空白帧 */
  const [underlayHref, setUnderlayHref] = useState<string | null>(null);

  const shown = present;
  const href = entry?.href ?? null;
  const currentIndex = entry ? imageEntries.findIndex((item) => item.href === entry.href) : -1;
  const total = imageEntries.length;
  const imageReady = !!shown && readyHref === shown.href;
  /** 图片像素尺寸（顶栏信息里显示，如 2400 × 1600） */
  const imageSize = useImageSize(shown?.href ?? null);

  /** 滚轮锚点缩放 / 按住拖动 / 双击切换 / 倍率药丸，手感对齐 Windows 照片（见 use-image-zoom.ts） */
  const {
    viewportRef,
    imageRef,
    style: zoomStyle,
    zoomed,
    percent,
    pillVisible,
    dragging,
    zoomIn,
    zoomOut,
    reset: resetZoom,
    consumeClickIfDragged,
  } = useImageZoom({ open, href });

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
          // 拖动结束后的那一下 click 要吞掉，否则"拖完松手"会被当成点空白、把灯箱关掉
          if (consumeClickIfDragged()) return;
          setDismissing(true);
          onClose();
        }}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
          touchMovedRef.current = false;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return;
          const delta = e.changedTouches[0].clientX - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(delta) > 60) {
            touchMovedRef.current = true;
            step(delta > 0 ? -1 : 1);
          }
        }}
      >
        {/* 顶栏 */}
        <div
          className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-gradient-to-b from-black/60 to-transparent"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100 truncate select-text">{shown.name}</p>
            {/* 元信息用胶囊分组：像素尺寸 / 文件大小。
                原来还有"第 N / M 张"，2026-09 用户觉得多余去掉了 —— 翻页条已经能感知多张。 */}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {imageSize && <MetaPill>{`${imageSize.width} × ${imageSize.height}`}</MetaPill>}
              <MetaPill>{formatFileSize(shown.size)}</MetaPill>
            </div>
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

        {/* 图像区。⚠️ 上下内边距**必须对称**（py-3）：图片在这里面居中，而"盖住窗口"要求的是以窗口
            中心为准；上下不对称时两者差半个差值，放大到"刚好超出窗口"那一刻会瞬移那点距离
            （2026-09 用户报："底部瞬移到页面底部"）。横向同理，px 已是左右对称的。 */}
        <div
          ref={viewportRef}
          className="relative flex-1 min-h-0 overflow-hidden flex items-center justify-center px-3 sm:px-14 py-3"
        >
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
          <motion.img
            key={shown.href}
            ref={imageRef}
            src={shown.href}
            alt={shown.name}
            onLoad={() => setReadyHref(shown.href)}
            onClick={(e) => {
              e.stopPropagation();
              // 触屏刚滑动过（切图）：浏览器补的那一下 click 不当成"单击放大"
              if (touchMovedRef.current) {
                touchMovedRef.current = false;
                return;
              }
              zoomIn(); // 只在"适应大小"时生效
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              zoomOut(); // 只在放大时生效；刚单击放大过的瞬间会忽略
            }}
            draggable={false}
            style={zoomStyle}
            className={`max-h-full max-w-full object-contain rounded-lg shadow-2xl select-none transition-opacity duration-200 ${
              imageReady ? "opacity-100" : "opacity-0"
            } ${zoomed ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"}`}
          />

          {/* 倍率药丸：偏离适应大小时浮现、停手 1.2 秒自动淡出（数字是真实像素比例，100% = 1:1）；
              点一下平滑回到适应大小。
              居中交给外层普通元素（framer 会接管 motion 元素的 transform，Tailwind 的
              -translate-x-1/2 会被覆盖）；药丸本身不用 backdrop-blur —— 带 backdrop-filter
              的元素做 opacity 动画会闪帧（约定 10）。 */}
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
            <AnimatePresence>
              {pillVisible ? (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  onClick={(event) => {
                    event.stopPropagation();
                    resetZoom(true);
                  }}
                  aria-label={`当前缩放 ${percent}%（真实像素比例），点击复位到适应大小`}
                  className="pointer-events-auto flex cursor-pointer items-center rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:bg-black/85"
                >
                  {percent}%
                </motion.button>
              ) : null}
            </AnimatePresence>
          </div>

          {/* 左右翻页条（对齐 Windows 照片查看器，2026-09 用户要求）：整条竖向深色半透明矩形 +
              居中白色箭头，鼠标靠近（即悬停在这一条上）才淡入、离开淡出，**整条任意位置点击都翻页**。
              触屏没有 hover，用 (hover:none) 媒体查询给一条常显的淡底，避免手机上完全看不到入口。
              这一整条同时是"非缩放区"：use-image-zoom 里按 data-paging-band 命中后滚轮与拖动都不管。
              不要用 backdrop-blur（约定 10：带 backdrop-filter 的元素做透明度动画会闪帧）。 */}
          {total > 1 && (
            <>
              <button
                type="button"
                data-paging-band="left"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                aria-label="上一张"
                className="absolute inset-y-0 left-0 z-20 flex w-11 cursor-pointer items-center justify-center bg-black/65 text-white opacity-0 transition-opacity duration-200 hover:opacity-100 sm:w-14 [@media(hover:none)]:opacity-60"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                data-paging-band="right"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                aria-label="下一张"
                className="absolute inset-y-0 right-0 z-20 flex w-11 cursor-pointer items-center justify-center bg-black/65 text-white opacity-0 transition-opacity duration-200 hover:opacity-100 sm:w-14 [@media(hover:none)]:opacity-60"
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}
