"use client";

import { useEffect, useState } from "react";

/** 图片的像素尺寸（自然宽高） */
export interface ImageSize {
  width: number;
  height: number;
}

/**
 * 已探测过的尺寸缓存：灯箱、文件信息弹窗、右键菜单都要用它，
 * 同一张图只真正解码一次（`Image` 的 onload 会拿到 naturalWidth/Height）。
 */
const sizeCache = new Map<string, ImageSize>();

/** 同步读缓存里的尺寸（拿不到就返回 null，用于不需要等异步的地方） */
export function getCachedImageSize(href: string | null | undefined): ImageSize | null {
  if (!href) return null;
  return sizeCache.get(href) ?? null;
}

/**
 * 读图片的像素尺寸（如 2400 × 1600）。用一张离屏 `Image` 探测，带进程内缓存：
 * 已经有缓存就直接返回，没有则加载后更新一次。href 为空（文件夹 / 未打开）时恒为 null。
 */
export function useImageSize(href: string | null | undefined): ImageSize | null {
  const [size, setSize] = useState<ImageSize | null>(() => getCachedImageSize(href));

  useEffect(() => {
    if (!href) {
      setSize(null);
      return;
    }
    const cached = sizeCache.get(href);
    if (cached) {
      setSize(cached);
      return;
    }
    let alive = true;
    const probe = new Image();
    probe.decoding = "async";
    probe.onload = () => {
      if (!probe.naturalWidth || !probe.naturalHeight) return;
      const next = { width: probe.naturalWidth, height: probe.naturalHeight };
      sizeCache.set(href, next);
      if (alive) setSize(next);
    };
    probe.src = href;
    return () => {
      alive = false;
      probe.onload = null;
    };
  }, [href]);

  return size;
}
