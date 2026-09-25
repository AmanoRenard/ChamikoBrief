"use client";

import { Check, ExternalLink } from "lucide-react";
import type { BriefEntry } from "@/types/brief";
import { useCopyFeedback } from "@/hooks/use-copy-feedback";
import { buildShareUrl } from "@/lib/share-url";

interface CopyLinkButtonProps {
  entry: BriefEntry;
  /** 按钮外观完全由调用方决定（各入口尺寸/配色不同） */
  className?: string;
  /** 图标尺寸，默认 15 */
  iconSize?: number;
  /** 未复制时的图标颜色类（按钮自身未设文字色时使用） */
  iconClassName?: string;
  /** 需要带文字的按钮（如文件信息弹窗）时传入，复制成功后文字变「已复制」 */
  label?: string;
}

/**
 * 「分享链接」按钮：点击即把直链复制到剪贴板，分享图标就地变成绿色勾，约 1.5 秒后复原。
 * 内部已完成 stopPropagation，放在整卡可点击区域内不会误触发打开/进入。
 */
export function CopyLinkButton({
  entry,
  className,
  iconSize = 15,
  iconClassName,
  label,
}: CopyLinkButtonProps) {
  // entry 变化（灯箱切图、弹窗换文件）时自动复位
  const { copied, copy } = useCopyFeedback(entry.href);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void copy(buildShareUrl(entry.href));
      }}
      title={copied ? "已复制链接" : label ?? "分享链接"}
      // 带文字标签时，无障碍名要与可见文字一致（否则读屏/语音控制里叫不出「分享链接」）
      aria-label={label ? `${label}：${entry.name}` : `分享 ${entry.name} 的链接`}
      className={className}
    >
      {copied ? (
        <Check size={iconSize} className="text-emerald-400" />
      ) : (
        <ExternalLink size={iconSize} className={iconClassName} />
      )}
      {label && <span>{copied ? "已复制" : label}</span>}
    </button>
  );
}
