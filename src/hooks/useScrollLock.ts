"use client";

import { useLayoutEffect } from "react";

/**
 * Locks body scroll while previews are open.
 *
 * `scrollbar-gutter: stable` on `<html>` (set in globals.css) reserves
 * the scrollbar space permanently, so toggling `overflow: hidden` never
 * changes the layout width.
 *
 * 用引用计数而不是"记住上一个值"：多个弹层同时存在、或快速连开连关时，
 * 旧写法可能把 `hidden` 当成"上一个值"存下来，最后一次清理就把滚动永久锁死。
 */
let lockCount = 0;

export function useScrollLock(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;

    lockCount += 1;
    document.documentElement.style.overflow = "hidden";

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.documentElement.style.overflow = "";
      }
    };
  }, [active]);
}
