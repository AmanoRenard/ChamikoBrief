"use client";

import { useEffect, useState } from "react";

/**
 * 弹层退场动画时长（毫秒）。必须 ≥ 各层 transition 的最长值，
 * 到点后无条件卸载，不再等动画的回调。
 */
export const OVERLAY_EXIT_MS = 240;

/**
 * 把外部传入的 entry 转成「可确定性卸载」的弹层状态。
 *
 * 为什么不用 AnimatePresence：它的退场完成回调在快速连开连关时可能不触发，
 * 导致遮挡层永久残留在页面上（表现为整页点不动）。这里改为：
 *   - 关闭时先把 open 置 false 触发动画；
 *   - 无论动画是否播完，OVERLAY_EXIT_MS 后一定卸载；
 *   - 期间若重新打开，定时器被清除，状态平滑切回打开。
 *
 * @returns present 用于渲染的快照（关闭后仍保留一小段时间），open 当前是否为打开态
 */
export function useOverlayPresence<T>(entry: T | null) {
  const [present, setPresent] = useState<T | null>(entry);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (entry) {
      setPresent(entry);
      setOpen(true);
      return;
    }

    setOpen(false);
    const timer = setTimeout(() => setPresent(null), OVERLAY_EXIT_MS);
    return () => clearTimeout(timer);
  }, [entry]);

  return { present, open };
}
