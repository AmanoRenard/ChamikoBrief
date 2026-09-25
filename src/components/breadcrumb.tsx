import { ChevronRight, Home } from "lucide-react";

export interface Crumb {
  label: string;
  /**
   * 目录页 URL。
   * 传 null 表示「这一级没有有意义的跳转目标」（例如项目根页上的角色名）：
   * 保留可点的观感，但点下去不跳转、不刷新。
   */
  href: string | null;
}

/** 面包屑：角色 / 项目 / 子目录…，纯链接（无需客户端 JS） */
/** 可跳转层级的样式（悬停高亮、指针变手型） */
const LINK_CLASS =
  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-all max-w-[220px]";

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    /* -ml-2.5：抵消首个胶囊的 10px 内边距，让面包屑文字与下方分类/排序标签的左边缘对齐 */
    <nav className="-ml-2.5 flex items-center gap-1.5 flex-wrap min-w-0">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const withHome = index === 0;
        return (
          <div key={`${index}-${item.label}`} className="flex items-center gap-1.5 min-w-0">
            {index > 0 && <ChevronRight size={12} className="text-slate-600 flex-shrink-0" />}
            {isLast ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-primary/20 text-primary-light max-w-[220px]">
                {withHome && <Home size={14} className="flex-shrink-0" />}
                <span className="truncate">{item.label}</span>
              </span>
            ) : item.href === null ? (
              /* 无可跳转目标的一级：保持可点的观感，但点击不做任何事（避免原地重新加载一次） */
              <span className={`${LINK_CLASS} cursor-pointer`}>
                {withHome && <Home size={14} className="flex-shrink-0" />}
                <span className="truncate">{item.label}</span>
              </span>
            ) : (
              <a href={item.href} className={LINK_CLASS}>
                {withHome && <Home size={14} className="flex-shrink-0" />}
                <span className="truncate">{item.label}</span>
              </a>
            )}
          </div>
        );
      })}
    </nav>
  );
}
