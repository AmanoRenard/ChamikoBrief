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

/** 角色名解析：精确优先，其次大小写不敏感（手输 URL 大小写不严格时更宽容） */
export function resolveRole(param: string): GateEntry | null {
  const exact = tree.gates.roles.find((entry) => entry.name === param);
  if (exact) return exact;
  const lower = param.toLowerCase();
  return tree.gates.roles.find((entry) => entry.name.toLowerCase() === lower) || null;
}

/** 项目名解析：精确优先，其次大小写不敏感 */
export function resolveProject(roleName: string, param: string): (GateEntry & { role: string }) | null {
  const list = tree.gates.projects.filter((entry) => entry.role === roleName);
  const exact = list.find((entry) => entry.name === param);
  if (exact) return exact;
  const lower = param.toLowerCase();
  return list.find((entry) => entry.name.toLowerCase() === lower) || null;
}

/** 取某个目录的内容；relPath 为空串表示项目根 */
export function getDir(role: string, project: string, relPath = ""): BriefDir | null {
  const key = relPath ? `${role}/${project}/${relPath}` : `${role}/${project}/`;
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
