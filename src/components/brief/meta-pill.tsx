import type { ReactNode } from "react";

/**
 * 元信息胶囊：像素尺寸 / 文件大小 / 日期 / 第几张这些信息统一用它展示 ——
 * 以前是 "4330 × 4000 · 4.31 MB · 2 / 7" 这样用 · 拼成一长串，用户 2026-09 觉得太丑。
 *
 * 口径：**纯文字 + 半透明白底 + 圆角**，不加图标、不做描边式，
 * 也不用 backdrop-blur（约定 10：带 backdrop-filter 的元素做透明度动画会闪帧）。
 * 灯箱顶栏与网格卡片共用它，所以两处视觉永远一致，日后调样式只改这里。
 */
export function MetaPill({
  children,
  title,
  className = "",
}: {
  children: ReactNode;
  /** 悬停补充说明（如引用目标、不可嵌套的原因）；不传则不显示任何悬浮提示 */
  title?: string;
  /** 追加样式（如橙红提示色、截断兜底） */
  className?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center truncate whitespace-nowrap rounded-full bg-white/[0.04] px-2 py-[3px] text-[10px] leading-none text-slate-400 sm:text-[11px] ${className}`}
    >
      {children}
    </span>
  );
}
