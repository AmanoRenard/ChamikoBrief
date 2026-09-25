// 文件类型判定与展示格式化工具（纯静态站只需要"读"相关的部分）

export const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif", ".tif", ".tiff",
]);

export const TEXT_EXTENSIONS = new Set([
  ".txt", ".json", ".xml", ".csv", ".log", ".yaml", ".yml",
  ".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".scss", ".less",
  ".py", ".java", ".c", ".cpp", ".h", ".hpp", ".rs", ".go", ".rb",
  ".php", ".sql", ".sh", ".bat", ".ps1", ".ini", ".cfg", ".env",
  ".vue", ".svelte", ".astro", ".toml",
]);

export const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdown"]);

/**
 * 浏览器自带渲染能力的格式：目前只有 pdf。
 * Chrome / Edge / Firefox 内部都装了阅读器，只要不强制下载，点开就是在浏览器里翻页
 * —— 「像把文档拖进浏览器」说的就是这个能力，跟网站无关。
 */
export const NATIVE_PREVIEW_EXTENSIONS = new Set([".pdf"]);

/**
 * 浏览器没有解码器（docx 其实是 zip + XML），交给微软在线预览器渲染的 Office 格式。
 * 只放确定支持的几类；odt / rtf 等支持不稳，不放进来（宁可只给下载，也不给点了会报错的预览）。
 */
export const OFFICE_VIEWER_EXTENSIONS = new Set([
  ".doc", ".docx", ".xls", ".xlsx", ".xlsm", ".ppt", ".pptx",
]);

/**
 * 浏览器无法内预览、应当直接下载的格式：`vercel.json` 会对这些扩展名声明
 * `Content-Disposition: attachment`，让「分享链接」被点开时直接下载而不是预览。
 * **改动这里必须同步改 vercel.json（两处名单要一致）**。
 */
export const FORCE_DOWNLOAD_EXTENSIONS = new Set([
  ".psd", ".psb", ".ai", ".clip", ".sai", ".kra", ".sketch", ".fig", ".blend",
  ".zip", ".rar", ".7z", ".tar", ".gz",
  ".ttf", ".otf", ".woff", ".woff2", ".ase", ".abr",
  // 快捷方式本体不出现在页面里，但直链仍可访问：让浏览器下载而不是把内容渲染出来
  ".cmklink",
]);

/** 含点的小写扩展名，如 ".png"；无扩展名返回空串 */
export function getFileExt(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex <= 0) return "";
  return filename.slice(dotIndex).toLowerCase();
}

export function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(getFileExt(filename));
}

export function isMarkdownFile(filename: string): boolean {
  return MARKDOWN_EXTENSIONS.has(getFileExt(filename));
}

export function isTextFile(filename: string): boolean {
  return TEXT_EXTENSIONS.has(getFileExt(filename)) || isMarkdownFile(filename);
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + units[i];
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");

  if (y === now.getFullYear()) {
    return `${m}-${d} ${h}:${min}`;
  }
  return `${y}-${m}-${d}`;
}

/** 浏览器能否自己渲染（决定预览是"直接打开原文件"还是"交给微软预览器"） */
export function canPreviewNatively(ext: string): boolean {
  return NATIVE_PREVIEW_EXTENSIONS.has(ext);
}

/** 是否需要交给微软在线预览器渲染 */
export function canPreviewViaOfficeViewer(ext: string): boolean {
  return OFFICE_VIEWER_EXTENSIONS.has(ext);
}

/**
 * 「文档」分类的口径：文本 ∪ Markdown ∪ Office 三件套 ∪ pdf。
 * 浏览页分类标签「文档」据此筛选与计数 —— psd / clip / ai / zip 等素材与压缩包不算文档。
 * 只做展示层归组，不改构建期 kind（kind 仍负责预览路由）。
 */
const DOCUMENT_EXTENSIONS = new Set<string>([
  ...TEXT_EXTENSIONS,
  ...MARKDOWN_EXTENSIONS,
  ...NATIVE_PREVIEW_EXTENSIONS,
  ...OFFICE_VIEWER_EXTENSIONS,
]);

/** 是否属于「文档」分类（浏览页分类标签据此归组） */
export function isDocumentFile(ext: string): boolean {
  return DOCUMENT_EXTENSIONS.has(ext);
}

/** 绝对时间，供文件信息弹窗展示：`2026-09-24 13:28`；无法解析时返回 `—` */
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** 后缀 → 图标类型标识（卡片 / 列表 / 文件信息弹窗共用同一套，保证一个类型到处一个样式） */
const FILE_TYPE_ICON_MAP: Record<string, string> = {
  // 文档类三兄弟各自一套图标 + 配色，避免在卡片上分不出来：
  //   pdf → 素页（红）· word 系 → 页面带笔（靛蓝）· 纯文本 → 带文字行的页（蓝）
  ".pdf": "file-pdf",
  ".doc": "file-word",
  ".docx": "file-word",
  ".rtf": "file-word",
  ".odt": "file-word",
  ".txt": "file-text",
  // Markdown 单独一套图标/配色，避免与 .txt 在卡片上分不出来
  ".md": "markdown",
  ".markdown": "markdown",
  ".mdown": "markdown",
  ".xls": "file-spreadsheet",
  ".xlsx": "file-spreadsheet",
  ".xlsm": "file-spreadsheet",
  ".ods": "file-spreadsheet",
  ".csv": "file-spreadsheet",
  ".ppt": "presentation",
  ".pptx": "presentation",
  ".odp": "presentation",
  ".zip": "file-archive",
  ".rar": "file-archive",
  ".7z": "file-archive",
  ".tar": "file-archive",
  ".gz": "file-archive",
  ".psd": "file-image",
  ".psb": "file-image",
  ".clip": "file-image",
  ".ai": "file-image",
  ".sai": "file-image",
  ".kra": "file-image",
  ".sketch": "file-image",
  ".fig": "file-image",
  ".blend": "file-image",
  ".js": "file-code",
  ".ts": "file-code",
  ".jsx": "file-code",
  ".tsx": "file-code",
  ".html": "file-code",
  ".css": "file-code",
  ".json": "file-code",
  ".py": "file-code",
  ".java": "file-code",
};

/**
 * 所有"认得出来"的扩展名 = 图标表 + 各类能力名单。
 * 注意：**图片类型不在图标表里**（它们的"图标"就是缩略图本身），
 * 所以判断"这个后缀认不认得"不能只查图标表 —— 之前漏掉图片后缀就是这么来的。
 */
const KNOWN_EXTENSIONS = new Set<string>([
  ...Object.keys(FILE_TYPE_ICON_MAP),
  ...IMAGE_EXTENSIONS,
  ...TEXT_EXTENSIONS,
  ...MARKDOWN_EXTENSIONS,
  ...NATIVE_PREVIEW_EXTENSIONS,
  ...OFFICE_VIEWER_EXTENSIONS,
  ...FORCE_DOWNLOAD_EXTENSIONS,
]);

/** 扩展名是否属于已知文件类型（卡片标题据此决定要不要隐藏后缀） */
export function isKnownFileType(ext: string): boolean {
  return KNOWN_EXTENSIONS.has(ext);
}

/**
 * 卡片标题用的显示名：**已知文件类型一律去掉扩展名**。
 *
 * 两个原因：
 *  1. 扩展名在卡片标题下面那行已经写了（`DOCX · 926.15 KB` / `PNG · 201.46 KB`），标题里重复；
 *  2. 中文标题末尾跟一个拉丁后缀（`.docx`）时，浏览器不允许拆开这个"词"、也不允许 `.`
 *     落在行首，只能把它整个挪到第二行，第一行于是留下 2~3 个字的豁口。
 *     去掉后缀后标题接近纯中文 —— 中文之间随处可断，换行会像 B站 那样每行填满、不留空。
 *
 * 文件夹与认不出的后缀原样返回；完整文件名仍然通过 title 悬停提示与文件信息弹窗可见。
 */
export function getDisplayName(name: string, isFolder: boolean): string {
  if (isFolder) return name;
  const ext = getFileExt(name);
  if (!ext || !isKnownFileType(ext)) return name;
  return name.slice(0, name.length - ext.length);
}

/** 返回图标类型标识，由卡片自行映射到具体图标组件 */
export function getFileTypeIcon(ext: string): string {
  return FILE_TYPE_ICON_MAP[ext] || "file";
}
