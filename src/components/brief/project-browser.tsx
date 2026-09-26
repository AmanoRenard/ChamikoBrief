"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FolderOpen, SearchX } from "lucide-react";
import type { BriefEntry, FilterType, SortBy, SortOrder, ViewMode } from "@/types/brief";
import { isDocumentFile } from "@/lib/file-utils";
import { Breadcrumb, type Crumb } from "@/components/breadcrumb";
import { CategoryTabs } from "@/components/brief/category-tabs";
import { SortTabs } from "@/components/brief/sort-tabs";
import { ContextMenu, getEntryContextMenuItems, type ContextMenuItem } from "@/components/context-menu";
import { FileCard } from "@/components/file-card";
import { FileInfoDialog } from "@/components/brief/file-info-dialog";
import { FileRow } from "@/components/file-row";
import { ImagePreview } from "@/components/image-preview";
import { SearchBar } from "@/components/search-bar";
import { TextPreview } from "@/components/text-preview";
import { ViewToggle } from "@/components/view-toggle";
import { buildShareUrl, copyText, downloadFile } from "@/lib/share-url";

const VIEW_KEY = "chamiko-brief-view-mode";
const SORT_BY_KEY = "chamiko-brief-sort-by";
const SORT_ORDER_KEY = "chamiko-brief-sort-order";

export interface ProjectBrowserProps {
  /** 当前文件夹的条目（构建期内联，无需请求） */
  entries: BriefEntry[];
  /** 面包屑：角色 / 项目 / 子目录… */
  crumbs: Crumb[];
}

function compareEntries(a: BriefEntry, b: BriefEntry, sortBy: SortBy): number {
  const compareName = (x: BriefEntry, y: BriefEntry) =>
    x.name.localeCompare(y.name, "zh-Hans-CN", { numeric: true });

  if (sortBy === "size") {
    const diff = a.size - b.size;
    return diff !== 0 ? diff : compareName(a, b);
  }
  if (sortBy === "date") {
    // 用素材时间（materials-times.json 口径），不是文件系统 mtime
    const diff = new Date(a.time).getTime() - new Date(b.time).getTime();
    return diff !== 0 ? diff : compareName(a, b);
  }
  return compareName(a, b);
}

function triggerDownload(entry: BriefEntry) {
  downloadFile(entry.href, entry.name);
}

export function ProjectBrowser({ entries, crumbs }: ProjectBrowserProps) {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [imagePreview, setImagePreview] = useState<BriefEntry | null>(null);
  const [textPreview, setTextPreview] = useState<BriefEntry | null>(null);
  const [infoEntry, setInfoEntry] = useState<BriefEntry | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; entry: BriefEntry } | null>(null);

  // 读取上次的视图与排序偏好
  useEffect(() => {
    const storedView = localStorage.getItem(VIEW_KEY);
    if (storedView === "grid" || storedView === "list") setViewMode(storedView);
    const storedSortBy = localStorage.getItem(SORT_BY_KEY);
    if (storedSortBy === "name" || storedSortBy === "date" || storedSortBy === "size") setSortBy(storedSortBy);
    const storedOrder = localStorage.getItem(SORT_ORDER_KEY);
    if (storedOrder === "asc" || storedOrder === "desc") setSortOrder(storedOrder);
    setPrefsLoaded(true);
  }, []);

  useEffect(() => {
    if (prefsLoaded) localStorage.setItem(VIEW_KEY, viewMode);
  }, [viewMode, prefsLoaded]);
  useEffect(() => {
    if (prefsLoaded) localStorage.setItem(SORT_BY_KEY, sortBy);
  }, [sortBy, prefsLoaded]);
  useEffect(() => {
    if (prefsLoaded) localStorage.setItem(SORT_ORDER_KEY, sortOrder);
  }, [sortOrder, prefsLoaded]);

  const visibleEntries = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const matched = entries.filter((entry) => {
      if (keyword && !entry.name.toLowerCase().includes(keyword)) return false;
      if (filterType === "all") return true;
      if (filterType === "directory") return entry.isFolder;
      // 其余分类只看文件（文件夹已归「目录」一类）
      if (entry.isFolder) return false;
      if (filterType === "image") return entry.kind === "image";
      // 「文档」= 文本 ∪ Markdown ∪ Office ∪ pdf（口径见 file-utils 的 isDocumentFile）
      if (filterType === "text") return isDocumentFile(entry.ext);
      // 「其他」= 既不是图片也不是文档的文件（psd / clip / zip / 压缩包等）
      return entry.kind !== "image" && !isDocumentFile(entry.ext);
    });

    const direction = sortOrder === "asc" ? 1 : -1;
    const sortGroup = (group: BriefEntry[]) =>
      [...group].sort((a, b) => compareEntries(a, b, sortBy) * direction);

    return [
      ...sortGroup(matched.filter((entry) => entry.isFolder)),
      ...sortGroup(matched.filter((entry) => !entry.isFolder)),
    ];
  }, [entries, query, filterType, sortBy, sortOrder]);

  const imageEntries = useMemo(
    () => visibleEntries.filter((entry) => !entry.isFolder && entry.kind === "image"),
    [visibleEntries]
  );

  /** 分类数量按整个文件夹算（不受搜索词影响），切分类前就能看到里面有什么 */
  const categoryCounts = useMemo(() => {
    const counts: Record<FilterType, number> = { all: entries.length, image: 0, text: 0, other: 0, directory: 0 };
    for (const entry of entries) {
      if (entry.isFolder) counts.directory++;
      else if (entry.kind === "image") counts.image++;
      else if (isDocumentFile(entry.ext)) counts.text++;
      else counts.other++;
    }
    return counts;
  }, [entries]);

  const handleSortChange = useCallback((by: SortBy, order: SortOrder) => {
    setSortBy(by);
    setSortOrder(order);
  }, []);

  /** 仅右键菜单使用（该入口按设计不做反馈）：成功静默，失败只留一行日志 */
  const copyEntryLink = useCallback(async (entry: BriefEntry) => {
    const ok = await copyText(buildShareUrl(entry.href));
    if (!ok) console.warn("复制失败：剪贴板不可用");
    return ok;
  }, []);

  /**
   * 卡片与列表行的点击都走这里。
   * 图片 / 文本 / Markdown 打开站内预览；其余格式（psd / zip / pdf…）打开文件信息弹窗，
   * 让用户至少能拿到分享链接与下载入口，而不是点了没反应。
   */
  const handlePreview = useCallback((entry: BriefEntry) => {
    if (entry.isFolder) return;
    if (entry.kind === "image") {
      setImagePreview(entry);
      return;
    }
    if (entry.kind === "text" || entry.kind === "markdown") {
      setTextPreview(entry);
      return;
    }
    setInfoEntry(entry);
  }, []);

  const handleContextMenu = useCallback((event: React.MouseEvent, entry: BriefEntry) => {
    event.preventDefault();
    // 占位卡（目标缺失）与锁定引用（引用不可嵌套）：没有任何可执行操作，不弹菜单
    if (entry.missing || entry.locked) return;
    setMenu({ x: event.clientX, y: event.clientY, entry });
  }, []);

  const menuItems: ContextMenuItem[] = menu
    ? getEntryContextMenuItems(menu.entry, {
        onOpen: () => router.push(menu.entry.href),
        onPreview: () => handlePreview(menu.entry),
        onDownload: () => triggerDownload(menu.entry),
        onCopyLink: () => copyEntryLink(menu.entry),
        onShowInfo: () => setInfoEntry(menu.entry),
      })
    : [];

  /** 列表 key：缺失的快捷方式 href 为空串，用目标路径兜底避免 key 相撞 */
  const entryKey = (entry: BriefEntry) =>
    `${entry.isFolder ? "d" : "f"}-${entry.href || entry.target || entry.name}`;

  const sharedProps = {
    query,
    onOpenFolder: (entry: BriefEntry) => {
      // 目标缺失没有可跳转的目录页；锁定引用（别名页里的引用）按规则不可再进入 —— 两者都点了不动
      if (entry.missing || entry.locked || !entry.href) return;
      router.push(entry.href);
    },
    onPreview: handlePreview,
    onDownload: triggerDownload,
    onContextMenu: handleContextMenu,
  };

  const isSearching = query.trim().length > 0 || filterType !== "all";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-surface-dark/95 backdrop-blur-xl border-b border-white/[0.06]">
        {/* 面包屑带：比下面两行**更深一层**（顶栏底色上叠黑），做出"标题带"的层次（2026-09 用户要）。
            ⚠️ 底色必须挂在这一层**通栏容器**上（它的宽度 = header 整宽 = 视口宽，不受 max-w 限制），
            并且**从 header 最顶端开始**（上方不留白）。
            早先把底色加在内容行上、靠负边距外扩，宽屏时只撑到 1680px 的内容容器、上方还留着
            6px 没填 —— 用户 2026-09 报"没铺满一整行、上面还有留白"。内容仍由内层 max-w + px 对齐。
            ⚠️ 上下内边距必须**对称**（`py-2`）：曾经只有 `pt-3`，胶囊上方有 12px、下方是 0，
            用户 2026-09 报"上面空隙大、下面空隙小"；补齐成对称的 12px 后又说顶栏偏高，
            所以两侧各压到 8px。 */}
        <div className="bg-black/25">
          <div className="max-w-[1680px] mx-auto px-3 sm:px-6 lg:px-8 py-2 flex items-center gap-x-3 gap-y-2 flex-wrap">
            <Breadcrumb items={crumbs} />
            <div className="ml-auto flex items-center gap-2">
              {/* 手机端（<640px）不显示搜索框：它小屏是 w-full，会把面包屑挤到第二行
                  （2026-09 用户报"被挤到第二行特别丑"，且他几乎用不到搜索）。桌面端照旧。 */}
              <div className="hidden sm:block">
                <SearchBar query={query} onQueryChange={setQuery} />
              </div>
              {/* 桌面端：视图切换留在右上角（与搜索框同排） */}
              <div className="hidden sm:block">
                <ViewToggle viewMode={viewMode} onChange={setViewMode} loaded={prefsLoaded} />
              </div>
            </div>
          </div>
        </div>

        {/* 分类与排序：pt-2 让「面包屑带底 → 分类」仍是 8px，与「分类 → 排序」的 space-y-2 一致；
            pb-3 顶替原来外层容器的下内边距（内容位置与改动前完全一致） */}
        <div className="max-w-[1680px] mx-auto px-3 sm:px-6 lg:px-8 pt-2 pb-3">
          <div className="space-y-2">
            <CategoryTabs value={filterType} counts={categoryCounts} onChange={setFilterType} />
            {/* 手机端：视图切换搬到排序这一行的右端（搜索框已隐藏，右上角留着它会挤面包屑）。
                SortTabs 内部是 overflow-x-auto，必须套一层 min-w-0 才能在同排正常滚动；
                ViewToggle 是受控组件，两处渲染共享父级的 viewMode，不会各说各话。 */}
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <SortTabs sortBy={sortBy} sortOrder={sortOrder} onChange={handleSortChange} />
              </div>
              <div className="shrink-0 sm:hidden">
                <ViewToggle viewMode={viewMode} onChange={setViewMode} loaded={prefsLoaded} />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1680px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {visibleEntries.length === 0 ? (
          <div className="min-h-[320px] flex flex-col items-center justify-center select-none">
            <div className="w-20 h-20 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center mb-4">
              {isSearching ? (
                <SearchX size={34} className="text-slate-600" />
              ) : (
                <FolderOpen size={34} className="text-slate-600" />
              )}
            </div>
            {/* 只留一行主文案：空目录与无匹配都去掉下面那行说明小字（2026-09 用户要）；
                颜色用原来那行小字的 slate-600（比 slate-400 暗一档），免得单独一行太跳 */}
            <p className="text-slate-600 font-medium">{isSearching ? "没有匹配的文件" : "这个文件夹是空的"}</p>
          </div>
        ) : viewMode === "grid" ? (
          <motion.div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-3 lg:gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {visibleEntries.map((entry) => (
              <FileCard key={entryKey(entry)} entry={entry} {...sharedProps} />
            ))}
          </motion.div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {visibleEntries.map((entry) => (
                <FileRow key={entryKey(entry)} entry={entry} {...sharedProps} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          entry={menu.entry}
          onClose={() => setMenu(null)}
        />
      )}

      <ImagePreview
        entry={imagePreview}
        imageEntries={imageEntries}
        onClose={() => setImagePreview(null)}
        onNavigate={setImagePreview}
      />
      <TextPreview entry={textPreview} onClose={() => setTextPreview(null)} />
      <FileInfoDialog
        entry={infoEntry}
        onClose={() => setInfoEntry(null)}
        onPreview={handlePreview}
      />
    </div>
  );
}
