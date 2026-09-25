/**
 * 素材时间清单（materials-times.json）
 *
 * 为什么要这份清单：
 *   git 只保存文件内容，不保存文件修改时间（mtime）。仓库被 clone 到别的机器（例如 Vercel 构建机）
 *   之后，所有文件的 mtime 都会变成「检出那一刻」，于是卡片上的日期与「最新上传」排序会全部相同。
 *   所以把「素材首次入库时本机的修改时间」记进这份随仓库提交的清单里，本地与线上就永远一致。
 *
 * 解析链（优先级从高到低）：
 *   1. 清单里的记录（文件内容用 size 校验：大小没变就一直沿用，避免 fresh clone 后把 mtime 覆盖成检出时间）
 *   2. 该文件在 git 里的最近一次提交时间（一次 git log 批量取回，网页端直接上传的素材也能落到「提交时间」）
 *   3. 本机 mtime（还没提交的新文件）
 *
 * 清单键：相对 public 的路径（正斜杠），例如 "alice/demo-project/参考图_01.png"。
 * 磁盘上的 public/__brief 等构建产物不参与，避免每次构建都产生假 diff。
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const TIMES_FILE_NAME = "materials-times.json";

/** git log 最多回溯多少个提交（本仓库规模很小，给足余量的同时还留了性能上限） */
const GIT_HISTORY_LIMIT = 2000;

function isHidden(name) {
  return name.startsWith(".");
}

function toKey(prefix, name) {
  return prefix ? `${prefix}/${name}` : name;
}

/** 读取清单；文件缺失、损坏时按空清单处理（不会让构建失败） */
function readRegistry(root) {
  const file = path.join(root, TIMES_FILE_NAME);
  if (!fs.existsSync(file)) return {};

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.warn(`[material-times] ${TIMES_FILE_NAME} 解析失败，将重建：${err.message}`);
    return {};
  }
}

/** 一次 git log 取回 public 下每个路径的最近提交时间（新→旧，首次出现即最新） */
function readGitTimes(root) {
  const map = new Map();

  try {
    const output = execFileSync(
      "git",
      // core.quotePath=false：否则中文/特殊字符路径会被转义成 \345 形式，无法与真实路径匹配
      ["-c", "core.quotePath=false", "log", `--max-count=${GIT_HISTORY_LIMIT}`, "--pretty=format:%cI", "--name-only", "--", "public"],
      { cwd: root, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }
    );

    let commitTime = null;
    for (const rawLine of output.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^\d{4}-\d{2}-\d{2}T/.test(line)) {
        commitTime = line;
        continue;
      }
      if (commitTime && !map.has(line)) map.set(line, commitTime);
    }
  } catch (err) {
    console.warn(`[material-times] 读不到 git 历史（${err.message.split("\n")[0]}），缺失的条目将退回本机 mtime`);
  }

  return map;
}

/** 遍历 public 下的素材（文件 + 文件夹），跳过隐藏项与站点保留名 */
function walkMaterials(publicDir, skipRootNames) {
  const found = [];

  const walk = (absDir, prefix, isRoot) => {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch (err) {
      console.warn(`[material-times] 无法读取目录 ${absDir}：${err.message}`);
      return;
    }

    for (const entry of entries) {
      if (isHidden(entry.name)) continue;
      if (isRoot && skipRootNames.has(entry.name)) continue;

      const abs = path.join(absDir, entry.name);
      const key = toKey(prefix, entry.name);
      let stat;
      try {
        stat = fs.statSync(abs);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        found.push({ key, isDir: true, mtimeMs: stat.mtimeMs, size: 0 });
        walk(abs, key, false);
      } else if (stat.isFile()) {
        found.push({ key, isDir: false, mtimeMs: stat.mtimeMs, size: stat.size });
      }
    }
  };

  walk(publicDir, "", true);
  return found;
}

function serialize(registry) {
  const sorted = {};
  for (const key of Object.keys(registry).sort()) sorted[key] = registry[key];
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

/**
 * 解析全部素材的时间，必要时把新增/变更/删除写回 materials-times.json。
 *
 * @param {{ root: string, publicDir: string, skipRootNames: Set<string> }} options
 * @returns {{ times: Map<string, string>, added: number, updated: number, removed: number, wrote: boolean }}
 */
export function resolveMaterialTimes({ root, publicDir, skipRootNames }) {
  const file = path.join(root, TIMES_FILE_NAME);
  const previous = readRegistry(root);
  const before = serialize(previous);
  const gitTimes = readGitTimes(root);
  const materials = walkMaterials(publicDir, skipRootNames);

  const next = {};
  const times = new Map();
  let added = 0;
  let updated = 0;

  for (const item of materials) {
    const record = previous[item.key];
    const diskTime = new Date(item.mtimeMs).toISOString();
    let time;

    if (!record || typeof record.t !== "string") {
      // 新素材：优先用「它在 git 里的提交时间」，没有（还没提交）才用本机 mtime
      time = gitTimes.get(`public/${item.key}`) || diskTime;
      added++;
    } else if (!item.isDir && typeof record.s === "number" && record.s !== item.size) {
      // 同名文件被换成了别的内容：以本机 mtime 为准
      time = diskTime;
      updated++;
    } else {
      time = record.t;
    }

    times.set(item.key, time);
    next[item.key] = item.isDir ? { t: time } : { t: time, s: item.size };
  }

  const removed = Object.keys(previous).filter((key) => !times.has(key)).length;
  const after = serialize(next);
  let wrote = false;

  if (after !== before) {
    fs.writeFileSync(file, after, "utf-8");
    wrote = true;
  }

  return { times, added, updated, removed, wrote };
}
