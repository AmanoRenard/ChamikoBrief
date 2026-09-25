"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import type { SortBy, SortOrder } from "@/types/brief";

interface SortTabsProps {
  sortBy: SortBy;
  sortOrder: SortOrder;
  onChange: (sortBy: SortBy, sortOrder: SortOrder) => void;
}

/** 每个字段点进去时的默认方向：名称正序、最新上传、最大文件 */
const DEFAULT_ORDER: Record<SortBy, SortOrder> = { name: "asc", date: "desc", size: "desc" };

/** 标签文案自带方向：点未激活的切字段（用它默认方向），点已激活的翻转方向并换文案 */
const SORT_LABELS: Record<SortBy, Record<SortOrder, string>> = {
  name: { asc: "名称正序", desc: "名称倒序" },
  date: { desc: "最新上传", asc: "最早上传" },
  size: { desc: "最大文件", asc: "最小文件" },
};

const SORT_FIELDS: SortBy[] = ["name", "date", "size"];

export function SortTabs({ sortBy, sortOrder, onChange }: SortTabsProps) {
  return (
    <div className="-mx-2.5 flex items-center gap-0.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {SORT_FIELDS.map((field) => {
        const active = sortBy === field;
        const order = active ? sortOrder : DEFAULT_ORDER[field];
        return (
          <button
            key={field}
            type="button"
            onClick={() => onChange(field, active ? (order === "asc" ? "desc" : "asc") : DEFAULT_ORDER[field])}
            title={active ? "再点一次切换顺序" : "按此项排序"}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-[13px] whitespace-nowrap rounded-lg transition-colors cursor-pointer ${
              active
                ? "text-primary-lighter font-medium bg-primary/10"
                : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]"
            }`}
          >
            {SORT_LABELS[field][order]}
            {active && (order === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
          </button>
        );
      })}
    </div>
  );
}
