// ============ ChamikoBrief 数据类型 ============
// 由 scripts/prepare-brief.mjs 在构建期生成，页面与组件消费。
// 注意：这些结构只在构建期存在于服务端（node），不会整体下发到浏览器；
// 浏览器只会拿到当前文件夹的条目（作为 props 内联在 HTML 里）。

export type FileKind = "image" | "text" | "markdown" | "other";

/** 排序字段与方向（浏览器本地排序） */
export type SortBy = "name" | "date" | "size";
export type SortOrder = "asc" | "desc";

/** 视图模式 */
export type ViewMode = "grid" | "list";

/** 浏览页的类型筛选（directory 排在最后：文件夹单独一类，「其他」只留文件） */
export type FilterType = "all" | "image" | "text" | "other" | "directory";

/** 一个素材文件 */
export interface BriefFile {
  /** 含扩展名的文件名 */
  name: string;
  /** 字节数 */
  size: number;
  /**
   * 素材加入时间（ISO 字符串）。
   * 来源：materials-times.json（本机修改时间）→ 该文件的 git 提交时间 → 本机 mtime，
   * 解析逻辑见 scripts/material-times.mjs。展示与排序统一用它，不要再用文件系统 mtime。
   */
  time: string;
  /** 含点的小写扩展名，如 ".png"；无扩展名时为空串 */
  ext: string;
  /** 分类，决定卡片图标与可用的预览方式 */
  kind: FileKind;
  /** 站内静态直链（与 public 下的真实路径一致，也用于「分享链接」） */
  href: string;
  /** 卡片用缩略图 URL（400px，完整图不裁切）；仅图片且生成成功时有值 */
  thumb?: string;
  /** 列表行用缩略图 URL（200px，完整图不裁切）；仅图片且生成成功时有值 */
  thumbRow?: string;
  /** 卡片留白处的底图 URL（160×120、4:3、已模糊）；仅图片且生成成功时有值 */
  backdrop?: string;
}

/** 一个子文件夹（含 .cmklink 生成的快捷方式条目） */
export interface BriefFolder {
  name: string;
  /** 目录页面 URL，带结尾斜杠；快捷方式指向缺失目标时为空串 */
  href: string;
  /** 直接子项数量（文件 + 文件夹） */
  itemCount: number;
  /** 文件夹的时间（ISO 字符串，口径同 BriefFile.time） */
  time: string;
  /** 由 .cmklink 生成的快捷方式：指向别的目录，而不是本目录下的实体子目录 */
  shortcut?: true;
  /** 快捷方式目标：相对 public 的路径，已统一为正斜杠，如 "alice/demo-project" */
  target?: string;
  /** 快捷方式目标在站点里不存在：灰色不可点击的占位卡 */
  missing?: true;
  /**
   * 位于别名（软链接）页面内的引用条目：**可见但不可进入** ——
   * 引用不可嵌套（用户定的硬规则），由构建期在物化别名时打标。
   */
  locked?: true;
}

/** 一个目录（项目根或项目内子目录）的完整内容 */
export interface BriefDir {
  /** dirs 的键："role/project/相对子路径"；项目根为 "role/project/" */
  key: string;
  /** 真实角色文件夹名 */
  role: string;
  /** 真实项目文件夹名 */
  project: string;
  /** 相对项目根的路径，项目根为空串 */
  relPath: string;
  folders: BriefFolder[];
  files: BriefFile[];
  /** 构建期标记：这条记录是 .cmklink 物化出来的别名（软链接）目录，不下发给页面 */
  refAlias?: true;
}

/** 门禁条目（真实名，供构建期生成静态路由；明文清单不会进入客户端 bundle） */
export interface GateEntry {
  /** 真实文件夹名 */
  name: string;
}

export interface BriefTree {
  generatedAt: string;
  dirs: Record<string, BriefDir>;
  gates: {
    roles: GateEntry[];
    projects: Array<GateEntry & { role: string }>;
  };
}

/** 名称保险箱条目：k = 定位哈希，c = 混淆后的名称（算法见 scripts/prepare-brief.mjs） */
export interface VaultEntry {
  k: string;
  c: string;
}

export interface NameVault {
  roles: VaultEntry[];
  /** 角色真实名 -> 该角色下的项目条目 */
  projects: Record<string, VaultEntry[]>;
}

/** 浏览器与卡片统一使用的条目（文件夹 / 文件合一，便于一起搜索与排序） */
export interface BriefEntry {
  name: string;
  isFolder: boolean;
  size: number;
  /** 素材加入时间（ISO 字符串），展示与排序统一用它 */
  time: string;
  ext: string;
  kind: FileKind;
  /** 文件为静态直链；文件夹为其页面 URL */
  href: string;
  thumb?: string;
  thumbRow?: string;
  /** 卡片留白处的模糊底图；仅图片且生成成功时有值 */
  backdrop?: string;
  /** 仅文件夹：直接子项数量 */
  itemCount?: number;
  /** 由 .cmklink 生成的快捷方式（见 BriefFolder.shortcut） */
  shortcut?: true;
  /** 快捷方式目标（相对 public，已统一为正斜杠） */
  target?: string;
  /** 快捷方式目标不存在：灰卡、不可点击、不响应右键 */
  missing?: true;
  /** 别名页里的引用条目：可见但不可进入（引用不可嵌套） */
  locked?: true;
}
