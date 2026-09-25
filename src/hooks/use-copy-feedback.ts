"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/share-url";

/** 复制成功后图标显示绿勾的时长 */
export const COPY_FEEDBACK_MS = 1500;

export interface CopyFeedback {
  /** 刚刚复制成功（用于把图标换成绿色勾） */
  copied: boolean;
  /** 复制文本：成功返回 true 并开始复位计时；失败返回 false（界面保持不变） */
  copy: (text: string) => Promise<boolean>;
}

/**
 * 「复制 → 图标变绿勾 → 自动复位」的统一状态机，供各复制入口复用。
 * 状态放在按钮自身而非父级，复制时不会引起卡片墙/列表整体重渲染。
 * 失败时静默（仅控制台留一行日志），不做任何可视化提示。
 *
 * @param resetKey 值变化即复位，用于灯箱左右切图、弹窗切换文件时清掉上一个勾
 */
export function useCopyFeedback(resetKey?: unknown): CopyFeedback {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 组件卸载时清理计时器
  useEffect(() => clearTimer, [clearTimer]);

  // 目标切换（切图/换文件）时立即复位
  useEffect(() => {
    clearTimer();
    setCopied(false);
  }, [resetKey, clearTimer]);

  const copy = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      clearTimer();

      if (!ok) {
        console.warn("复制失败：剪贴板不可用");
        setCopied(false);
        return false;
      }

      setCopied(true);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setCopied(false);
      }, COPY_FEEDBACK_MS);

      return true;
    },
    [clearTimer]
  );

  return { copied, copy };
}
