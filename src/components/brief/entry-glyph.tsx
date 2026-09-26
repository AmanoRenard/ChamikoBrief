"use client";

import { useEffect, useRef } from "react";
import {
  Archive,
  BookText,
  File as FileIcon,
  FileCode,
  FileImage,
  FilePen,
  FileSpreadsheet,
  FileText,
  Folder,
  Link,
  Link2Off,
  Presentation,
  TriangleAlert,
} from "lucide-react";
import type { BriefEntry } from "@/types/brief";
import { getFileTypeIcon } from "@/lib/file-utils";

/** 文件类型 -> 配色（卡片、列表、文本弹窗共用，保证同一类型到处一个颜色） */
export const FILE_TYPE_COLORS: Record<string, string> = {
  // markdown 用青色书本文档，与 .txt 的蓝色文件图标明显区分
  markdown: "text-teal-400 bg-teal-500/10",
  "file-text": "text-blue-400 bg-blue-500/10",
  // pdf 与 word 系也各自独立：pdf = 素页 + 红，word = 页面带笔 + 靛蓝
  "file-pdf": "text-red-400 bg-red-500/10",
  "file-word": "text-indigo-400 bg-indigo-500/10",
  "file-spreadsheet": "text-emerald-400 bg-emerald-500/10",
  presentation: "text-orange-400 bg-orange-500/10",
  "file-archive": "text-rose-400 bg-rose-500/10",
  "file-code": "text-cyan-400 bg-cyan-500/10",
  "file-image": "text-violet-400 bg-violet-500/10",
  file: "text-slate-400 bg-slate-500/10",
};

function iconFor(type: string, size: number) {
  switch (type) {
    case "markdown":
      return <BookText size={size} />;
    case "file-text":
      return <FileText size={size} />;
    case "file-pdf":
      // 素页：与 .txt 的"带文字行的页"形状不同，配红色一眼认出 PDF
      return <FileIcon size={size} />;
    case "file-word":
      // 页面带笔 = 可编辑文档
      return <FilePen size={size} />;
    case "file-spreadsheet":
      return <FileSpreadsheet size={size} />;
    case "presentation":
      return <Presentation size={size} />;
    case "file-archive":
      return <Archive size={size} />;
    case "file-code":
      return <FileCode size={size} />;
    case "file-image":
      return <FileImage size={size} />;
    default:
      return <FileIcon size={size} />;
  }
}

interface EntryGlyphProps {
  entry: BriefEntry;
  /** card：铺满卡片预览区；row：列表里的小图标 */
  variant: "card" | "row";
}

/** 卡片缩略图悬停放大：目标倍率与时长 */
const HOVER_ZOOM_SCALE = 1.04;
const HOVER_ZOOM_MS = 300;

/**
 * 卡片缩略图。悬停放大用 **rAF 逐帧写 transform**，不用 CSS transition。
 *
 * 为什么（2026-09，别改回 `transition-transform group-hover:scale-[1.04]`）：
 * CSS transition 会被 Chromium 提到合成层，动画期间按"起始栅格 + 拉伸"绘制，**动画结束**才按最终
 * 比例重新栅格化。预览框高度是小数（4:3 由卡片宽度算出，实测 170.39），底边落在半个像素上 ——
 * 那一行只有一部分被覆盖，而"动画中的拉伸栅格"和"结束后的精确栅格"对它的覆盖不一样，
 * 于是那条边会"消失又出现"，用户看到的就是"底部缩了一下"。
 * 逐帧在主线程重绘，每一帧都按当前倍率精确栅格化，边缘覆盖率**恒定**，不会再跳。
 * 代价：动画期间每帧重绘这张缩略图（悬停时只有一张在动，实测无压力）。
 */
function CardThumb({ entry }: { entry: BriefEntry }) {
  const ref = useRef<HTMLImageElement>(null);
  const rafRef = useRef<number | null>(null);
  const scaleRef = useRef(1);

  useEffect(() => {
    const img = ref.current;
    const group = img?.closest<HTMLElement>(".group");
    if (!img || !group) return;

    const animate = (to: number) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const from = scaleRef.current;
      if (Math.abs(to - from) < 0.0005) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        scaleRef.current = to;
        img.style.transform = `scale(${to})`;
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / HOVER_ZOOM_MS);
        const eased = 1 - (1 - t) ** 3;
        scaleRef.current = from + (to - from) * eased;
        img.style.transform = `scale(${scaleRef.current})`;
        rafRef.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      rafRef.current = requestAnimationFrame(step);
    };

    // 用卡片（group）的进出，和 CSS 的 group-hover 范围保持一致
    const enter = () => {
      if (group.getAttribute("aria-disabled") === "true") return;
      animate(HOVER_ZOOM_SCALE);
    };
    const leave = () => animate(1);
    group.addEventListener("mouseenter", enter);
    group.addEventListener("mouseleave", leave);
    return () => {
      group.removeEventListener("mouseenter", enter);
      group.removeEventListener("mouseleave", leave);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <img
      ref={ref}
      src={entry.thumb || entry.href}
      alt={entry.name}
      loading="lazy"
      decoding="async"
      draggable={false}
      className="relative h-full w-full object-contain"
      style={{ WebkitTouchCallout: "none" }}
    />
  );
}

/** 卡片的预览区内容 / 列表行的小图标，两种尺寸共用一套配色 */
export function EntryGlyph({ entry, variant }: EntryGlyphProps) {
  const isCard = variant === "card";

  if (entry.isFolder) {
    // 快捷方式（.cmklink）：文件夹图标右下角挂一个角标 —— 指向存在 = 靛蓝跳转箭头，
    // 目标不存在 = 玫瑰色警告（整卡灰掉，见 file-card / file-row）
    const badgeBox = isCard ? "h-5 w-5 rounded-md" : "h-4 w-4 rounded";
    return (
      <div
        className={`relative flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${
          isCard ? "w-14 h-14 rounded-2xl" : "w-10 h-10 rounded-xl flex-shrink-0"
        } ${entry.missing ? "bg-slate-500/10" : "bg-amber-500/10"}`}
      >
        <Folder size={isCard ? 26 : 20} className={entry.missing ? "text-slate-500" : "text-amber-400"} />
        {entry.shortcut ? (
          <span
            aria-hidden
            className={`absolute -bottom-1 -right-1 flex items-center justify-center border border-white/15 bg-surface-darker ${badgeBox} ${
              entry.missing ? "text-rose-300" : entry.locked ? "text-slate-400" : "text-slate-300"
            }`}
          >
            {entry.missing ? (
              <TriangleAlert size={isCard ? 12 : 10} />
            ) : entry.locked ? (
              // 断链：别名页里的引用不可再进入
              <Link2Off size={isCard ? 12 : 10} />
            ) : (
              <Link size={isCard ? 12 : 10} />
            )}
          </span>
        ) : null}
      </div>
    );
  }

  if (entry.kind === "image") {
    if (!isCard) {
      const src = entry.thumbRow || entry.thumb || entry.href;
      return (
        <img
          src={src}
          alt={entry.name}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="w-10 h-10 rounded-xl object-cover flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
          style={{ WebkitTouchCallout: "none" }}
        />
      );
    }

    // 卡片：完整图居中显示（长图/竖图都不裁切），留白处垫同一张图的模糊小图。
    // 模糊在构建期烘焙成 160×120 的小图，运行时零滤镜，一屏几十张也不掉帧。
    return (
      /* 模糊底图 + 缩略图的父容器：铺满预览框，缩略图悬停放大 4% 溢出的部分就地裁掉。
         两个要点：① 裁剪必须放在**没有 transform 的父层**上 —— 放在图片自己身上会跟着一起放大，
         等于没裁；② 光有 overflow-hidden 不够（图片被提成合成层时它会迟一帧生效），要配 clip-path。 */
      <div className="absolute inset-0 overflow-hidden [clip-path:inset(0)]">
        {entry.backdrop && (
          <img
            src={entry.backdrop}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover opacity-80"
          />
        )}
        {/* 悬停放大 4%（100% → 104%）由 CardThumb 逐帧完成，溢出的部分由父容器裁掉 */}
        <CardThumb entry={entry} />
      </div>
    );
  }

  const iconType = getFileTypeIcon(entry.ext);
  return (
    <div
      className={`${isCard ? "w-14 h-14 rounded-2xl" : "w-10 h-10 rounded-xl flex-shrink-0"} ${
        FILE_TYPE_COLORS[iconType] || FILE_TYPE_COLORS.file
      } flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}
    >
      {iconFor(iconType, isCard ? 26 : 20)}
    </div>
  );
}
