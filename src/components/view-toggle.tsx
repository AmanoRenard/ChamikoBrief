"use client";

import { LayoutGrid, List } from "lucide-react";

interface ViewToggleProps {
  viewMode: "grid" | "list";
  onChange: (mode: "grid" | "list") => void;
  loaded?: boolean;
}

export function ViewToggle({ viewMode, onChange, loaded = true }: ViewToggleProps) {
  const isActive = (mode: "grid" | "list") =>
    loaded && viewMode === mode
      ? "bg-primary/20 text-primary-light"
      : "text-slate-500 hover:text-slate-300";

  return (
    <div className="flex items-center bg-white/[0.03] border border-white/[0.06] rounded-xl p-1">
      <button
        onClick={() => onChange("grid")}
        className={`p-1.5 rounded-lg transition-all ${isActive("grid")}`}
        title="网格视图"
      >
        <LayoutGrid size={16} />
      </button>
      <button
        onClick={() => onChange("list")}
        className={`p-1.5 rounded-lg transition-all ${isActive("list")}`}
        title="列表视图"
      >
        <List size={16} />
      </button>
    </div>
  );
}
