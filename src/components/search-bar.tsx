"use client";

import { Search, X } from "lucide-react";

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
}

/** 当前文件夹内的文件名搜索（分类与排序已拆到独立的标签组件） */
export function SearchBar({ query, onQueryChange }: SearchBarProps) {
  return (
    <div className="relative w-full sm:w-[260px]">
      <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
      <input
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="搜索当前文件夹"
        className="w-full h-9 pl-9 pr-8 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-slate-200 placeholder:text-slate-500 outline-none transition-all focus:border-primary/40 focus:bg-white/[0.05] [&::-webkit-search-cancel-button]:hidden"
      />
      {query && (
        <button
          type="button"
          onClick={() => onQueryChange("")}
          title="清空搜索"
          aria-label="清空搜索"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
