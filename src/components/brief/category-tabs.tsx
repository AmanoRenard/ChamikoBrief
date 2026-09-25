"use client";

import type { FilterType } from "@/types/brief";

interface CategoryTabsProps {
  value: FilterType;
  /** 各分类在当前文件夹里的条目数（不受搜索词影响） */
  counts: Record<FilterType, number>;
  onChange: (value: FilterType) => void;
}

const CATEGORY_OPTIONS: Array<{ value: FilterType; label: string }> = [
  { value: "all", label: "全部" },
  { value: "image", label: "图片" },
  { value: "text", label: "文档" },
  { value: "other", label: "其他" },
  // 目录单独一类，放在最后 —— 「其他」从此只装文件，不再混进文件夹
  { value: "directory", label: "目录" },
];

/** B站式分类标签：文字 + 数量，激活项主色文字与 2px 下划线，窄屏横向可滚 */
export function CategoryTabs({ value, counts, onChange }: CategoryTabsProps) {
  return (
    <div className="-mx-2.5 flex items-center gap-0.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {CATEGORY_OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`relative flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap rounded-lg transition-colors cursor-pointer ${
              active ? "text-primary-lighter" : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]"
            }`}
          >
            {option.label}
            <span className={`text-[11px] tabular-nums ${active ? "text-primary-lighter/70" : "text-slate-600"}`}>
              {counts[option.value]}
            </span>
            {active && (
              <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-gradient-to-r from-primary to-primary-light" />
            )}
          </button>
        );
      })}
    </div>
  );
}
