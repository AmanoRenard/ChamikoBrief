// 目录树读取与解析（仅在构建期 / 服务端组件中使用）。
// 注意：这里会 import 构建产物 JSON，禁止在任何 "use client" 组件里引用，否则整棵树会被打进客户端 bundle。

import treeData from "@/generated/brief-tree.json";
import type { BriefDir, BriefEntry, BriefTree, GateEntry } from "@/types/brief";

const tree = treeData as BriefTree;

export function getTree(): BriefTree {
  return tree;
}

/** [role] 的静态参数 */
export function getRoleParams(): Array<{ role: string }> {
  return tree.gates.roles.map((entry) => ({ role: entry.name }));
}

/** [role]/[project] 的静态参数 */
export function getProjectParams(): Array<{ role: string; project: string }> {
  return tree.gates.projects.map((entry) => ({ role: entry.role, project: entry.name }));
}

/** [role]/[project]/[...path] 的静态参数：项目内每个子目录 */
export function getSubPathParams(): Array<{ role: string; project: string; path: string[] }> {
  return Object.values(tree.dirs)
    .filter((dir) => dir.relPath !== "")
    .map((dir) => ({
      role: dir.role,
      project: dir.project,
      path: dir.relPath.split("/"),
    }));
}

/**
 * URL 参数统一解码后再查树。
 * Next 传进来的动态参数在中文等场景下是**百分号编码**的（如 "%E5%8F%82…"），
 * 而树里的 key 是原始中文 —— 不解码会一律 notFound（2026-09 用户报"中文文件夹进不去"）。
 * 对已经是明文的值（静态导出时 Next 直接用 generateStaticParams 的原始值）是幂等的。
 */
export function decodePathParam(value: string): string {
  if (!value.includes("%")) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value; // 非法 % 序列：原样返回，交给后续的找不到逻辑
  }
}

/** 角色名解析：精确优先，其次大小写不敏感（手输 URL 大小写不严格时更宽容） */
export function resolveRole(param: string): GateEntry | null {
  const name = decodePathParam(param);
  const exact = tree.gates.roles.find((entry) => entry.name === name);
  if (exact) return exact;
  const lower = name.toLowerCase();
  return tree.gates.roles.find((entry) => entry.name.toLowerCase() === lower) || null;
}

/** 项目名解析：精确优先，其次大小写不敏感 */
export function resolveProject(roleName: string, param: string): (GateEntry & { role: string }) | null {
  const name = decodePathParam(param);
  const list = tree.gates.projects.filter((entry) => entry.role === roleName);
  const exact = list.find((entry) => entry.name === name);
  if (exact) return exact;
  const lower = name.toLowerCase();
  return list.find((entry) => entry.name.toLowerCase() === lower) || null;
}

/** 取某个目录的内容；relPath 为空串表示项目根 */
export function getDir(role: string, project: string, relPath = ""): BriefDir | null {
  // 逐段解码：整串解码会把 "%2F"（若真出现）也还原成 "/"，层级就乱了
  const decoded = relPath
    ? relPath
        .split("/")
        .map(decodePathParam)
        .join("/")
    : "";
  const key = decoded ? `${role}/${project}/${decoded}` : `${role}/${project}/`;
  return tree.dirs[key] || null;
}

/** 把目录数据转成浏览器组件使用的统一条目数组（文件夹在前，各自由数据层排好序） */
export function toEntries(dir: BriefDir): BriefEntry[] {
  const folders: BriefEntry[] = dir.folders.map((folder) => ({
    name: folder.name,
    isFolder: true,
    size: 0,
    time: folder.time,
    ext: "",
    kind: "other",
    href: folder.href,
    itemCount: folder.itemCount,
    shortcut: folder.shortcut,
    target: folder.target,
    missing: folder.missing,
    locked: folder.locked,
  }));

  const files: BriefEntry[] = dir.files.map((file) => ({
    name: file.name,
    isFolder: false,
    size: file.size,
    time: file.time,
    ext: file.ext,
    kind: file.kind,
    href: file.href,
    thumb: file.thumb,
    thumbRow: file.thumbRow,
    backdrop: file.backdrop,
  }));

  return [...folders, ...files];
}
