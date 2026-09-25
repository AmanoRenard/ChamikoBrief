#!/usr/bin/env node
/**
 * ChamikoBrief 构建期预处理脚本
 *
 * 职责（在 next dev / next build 之前自动运行）：
 *  1. 解析素材时间并维护 materials-times.json（清单 → git 提交时间 → 本机 mtime，详见 material-times.mjs）
 *  2. 扫描 public/<角色>/<项目>/ 下的全部素材，生成目录树元数据 src/generated/brief-tree.json
 *  3. 用 sharp 为图片生成三档 webp 变体到 public/__brief/thumbs/（按 源路径+mtime+size+变体 哈希，命中即跳过）
 *     card 400px（卡片完整图）/ row 200px（列表行）/ backdrop 160×120 模糊（卡片留白处的底图）
 *  4. 计算每个角色 / 项目的全小写别名（供门禁的宽松大小写匹配生成别名页）
 *  5. 清理已不再被引用的历史缩略图
 *
 * 参数：--times-only 只更新素材时间清单，不跑 sharp、不产出构建产物（供 .githooks/pre-commit 调用）。
 *
 * 容错：public 不存在、空素材、损坏图片、不支持缩略图的格式都不会让构建失败。
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { resolveMaterialTimes } from "./material-times.mjs";

/** 只更新素材时间清单（pre-commit 钩子用），不跑 sharp、不产出构建产物 */
const TIMES_ONLY = process.argv.includes("--times-only");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const THUMB_DIR = path.join(PUBLIC_DIR, "__brief", "thumbs");
const OUT_FILE = path.join(ROOT, "src", "generated", "brief-tree.json");
const VAULT_FILE = path.join(ROOT, "src", "generated", "name-vault.json");

/**
 * 与站点自身资源冲突的保留名：既不参与素材扫描，也不会被写进素材时间清单。
 * 注意 icon.ico / apple-icon.png 这类站点图标也算，否则会被当成素材记进 materials-times.json。
 */
const RESERVED_ROOT_NAMES = new Set([
  "__brief", "_next", "robots.txt", "favicon.ico", "icon.ico", "apple-icon.png",
  "404.html", "index.html",
]);

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif", ".tif", ".tiff", ".svg"]);
const THUMBABLE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif", ".tif", ".tiff"]);
const MARKDOWN_EXT = new Set([".md", ".markdown", ".mdown"]);
const TEXT_EXT = new Set([
  ".txt", ".json", ".xml", ".csv", ".log", ".yaml", ".yml", ".ini", ".cfg", ".env", ".toml",
  ".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".scss", ".less", ".py", ".java", ".c", ".cpp",
  ".h", ".hpp", ".rs", ".go", ".rb", ".php", ".sql", ".sh", ".bat", ".ps1", ".vue", ".svelte", ".astro",
]);

/**
 * 缩略图变体：
 *  - card / row：按宽度等比缩小，得到「完整图」（不裁切）
 *  - backdrop：4:3 裁剪 + 高斯模糊的小图，垫在完整图下面填满留白。
 *    模糊在构建期烘焙掉，避免一屏几十张卡片同时跑 CSS filter 拖慢滚动。
 */
const THUMB_VARIANTS = {
  card: { fit: "inside", width: 400, height: undefined, blur: 0, quality: 78 },
  row: { fit: "inside", width: 200, height: undefined, blur: 0, quality: 78 },
  backdrop: { fit: "cover", width: 160, height: 120, blur: 16, quality: 55 },
};
/** 超大图片跳过缩略图，避免构建时间失控（直接引用原图） */
const MAX_THUMB_SOURCE_BYTES = 60 * 1024 * 1024;
const THUMB_CONCURRENCY = 4;

// ============ 路径与 URL 工具 ============

/** 只对会破坏 URL 语义的字符做百分号编码，中文等字符保持可读（浏览器会自动处理） */
const UNSAFE_CHARS = /[#?%&+<>\s"`{}|\\^[\]]/g;

/**
 * 快捷方式文件（.cmklink）：内容为若干「相对 public 的目标目录」，用 `|` 或换行分隔。
 * 文件本身不出现在浏览页，只在页面里生成指向目标的「快捷方式文件夹」条目。
 */
const SHORTCUT_EXT = ".cmklink";

/**
 * 归一化 .cmklink 里的一个目标路径：
 * 反斜杠统一成正斜杠（Windows 写法也能用）、去掉前导 `./` `/` `public/`、折叠连续斜杠、去掉尾部斜杠。
 */
function normalizeShortcutTarget(raw) {
  return raw
    .trim()
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/^\/+/, "")
    .replace(/^public\//i, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");
}

/** 把 .cmklink 内容切成目标列表（`|` 与换行都算分隔、去空、同文件内去重，顺序保持书写顺序） */
function parseShortcutTargets(content) {
  const seen = new Set();
  const targets = [];
  for (const part of content.split(/[|\r\n]+/)) {
    const target = normalizeShortcutTarget(part);
    if (!target || seen.has(target)) continue;
    seen.add(target);
    targets.push(target);
  }
  return targets;
}

function encodeSegment(segment) {
  return segment.replace(UNSAFE_CHARS, (ch) => encodeURIComponent(ch));
}

/** 由路径片段拼出站内静态 URL（素材直链 / 目录页 URL 共用同一规则） */
function toHref(segments, { trailingSlash = false } = {}) {
  const encoded = segments.map(encodeSegment).join("/");
  return "/" + encoded + (trailingSlash ? "/" : "");
}

function extOf(name) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot).toLowerCase();
}

function classify(ext) {
  if (MARKDOWN_EXT.has(ext)) return "markdown";
  if (IMAGE_EXT.has(ext)) return "image";
  if (TEXT_EXT.has(ext)) return "text";
  return "other";
}

function isHidden(name) {
  return name.startsWith(".");
}

function sha1(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

// ============ 缩略图任务收集与执行 ============

const thumbTasks = []; // { file, sourcePath, variant, fileName, cachePath }
const usedThumbs = new Set();

/**
 * 待解析的快捷方式（.cmklink）：扫描阶段只登记，等整棵树扫完再解析目标 ——
 * 目标可能位于任何别的目录（跨项目 / 跨角色），也可能还没被扫到。
 */
const pendingShortcuts = []; // { dirKey, targets, source, time }

function queueThumb(file, sourcePath, variant) {
  const stat = file.__stat;
  const key = `${path.relative(ROOT, sourcePath).replace(/\\/g, "/")}|${stat.mtimeMs}|${stat.size}|${variant}`;
  const fileName = `${sha1(key)}.webp`;
  usedThumbs.add(fileName);
  thumbTasks.push({ file, sourcePath, variant, fileName, cachePath: path.join(THUMB_DIR, fileName) });
}

async function runThumbTasks() {
  let generated = 0;
  let cached = 0;
  let backdrops = 0;

  const queue = [...thumbTasks];
  const workers = Array.from({ length: THUMB_CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      const variant = THUMB_VARIANTS[task.variant];
      const url = `/__brief/thumbs/${task.fileName}`;

      if (fs.existsSync(task.cachePath)) {
        cached++;
      } else {
        console.log(`[prepare-brief] sharp ${task.file.href} -> ${task.variant}`);
        let pipeline = sharp(task.sourcePath, { failOn: "none", limitInputPixels: false });
        pipeline =
          variant.fit === "cover"
            ? pipeline.resize(variant.width, variant.height, { fit: "cover" })
            : pipeline.resize(variant.width, undefined, { fit: "inside", withoutEnlargement: true });
        if (variant.blur > 0) pipeline = pipeline.blur(variant.blur);
        fs.writeFileSync(task.cachePath, await pipeline.webp({ quality: variant.quality }).toBuffer());
        generated++;
      }

      if (task.variant === "card") task.file.thumb = url;
      else if (task.variant === "row") task.file.thumbRow = url;
      else {
        task.file.backdrop = url;
        backdrops++;
      }
    }
  });

  await Promise.all(workers);
  return { generated, cached, backdrops };
}

// ============ 素材时间 ============

/**
 * public 相对路径 -> ISO 时间。由 resolveMaterialTimes() 在 main 开头填充；
 * 目录树里的每个文件与文件夹都用它，保证本地开发与 Vercel 构建显示、排序一致。
 */
let materialTimes = new Map();

function resolveTime(key, fallbackDate) {
  return materialTimes.get(key) ?? fallbackDate.toISOString();
}

// ============ 目录扫描 ============

function readEntries(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.warn(`[prepare-brief] 无法读取目录 ${dir}：${err.message}`);
    return [];
  }
}

/** 递归扫描一个目录，把结果写入 dirs[key]；返回该目录的直接子项数量 */
function scanDir({ absDir, segments, role, project, relPath, dirs }) {
  const folders = [];
  const files = [];
  /** 本目录在 dirs 里的键（项目根带尾斜杠）—— 快捷方式要按「所在目录」收口，先算好 */
  const dirKey = relPath ? `${role}/${project}/${relPath}` : `${role}/${project}/`;

  for (const entry of readEntries(absDir)) {
    if (isHidden(entry.name)) continue;

    const abs = path.join(absDir, entry.name);
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch (err) {
      console.warn(`[prepare-brief] 跳过无法访问的条目 ${abs}：${err.message}`);
      continue;
    }

    if (stat.isDirectory()) {
      const childSegments = [...segments, entry.name];
      const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
      const childKey = `${role}/${project}/${childRel}`;
      const childAbs = abs;
      const childDir = {
        key: childKey,
        role,
        project,
        relPath: childRel,
        folders: [],
        files: [],
      };
      dirs[childKey] = childDir;
      const itemCount = scanDir({
        absDir: childAbs,
        segments: childSegments,
        role,
        project,
        relPath: childRel,
        dirs,
      });

      folders.push({
        name: entry.name,
        href: toHref(childSegments, { trailingSlash: true }),
        itemCount,
        time: resolveTime(childSegments.join("/"), stat.mtime),
      });
      continue;
    }

    if (!stat.isFile()) continue;

    const ext = extOf(entry.name);
    const sourceKey = [...segments, entry.name].join("/");

    // 快捷方式（.cmklink）：文件本体不进列表，只登记目标，等全树扫完再解析
    if (ext === SHORTCUT_EXT) {
      let content = "";
      try {
        content = fs.readFileSync(abs, "utf-8");
      } catch (err) {
        console.warn(`[prepare-brief] 无法读取快捷方式 ${sourceKey}：${err.message}`);
        continue;
      }
      const targets = parseShortcutTargets(content);
      if (targets.length === 0) {
        console.warn(`[prepare-brief] 快捷方式内容为空，未生成条目：${sourceKey}`);
        continue;
      }
      pendingShortcuts.push({
        dirKey,
        dirSegments: [...segments],
        targets,
        source: sourceKey,
        time: resolveTime(sourceKey, stat.mtime),
      });
      continue;
    }

    const file = {
      name: entry.name,
      size: stat.size,
      time: resolveTime([...segments, entry.name].join("/"), stat.mtime),
      ext,
      kind: classify(ext),
      href: toHref([...segments, entry.name]),
      __stat: stat,
    };

    if (THUMBABLE_EXT.has(ext)) {
      if (stat.size <= MAX_THUMB_SOURCE_BYTES) {
        queueThumb(file, abs, "card");
        queueThumb(file, abs, "row");
        queueThumb(file, abs, "backdrop");
      } else {
        console.warn(`[prepare-brief] 图片超过 ${Math.round(MAX_THUMB_SOURCE_BYTES / 1024 / 1024)}MB，跳过缩略图：${file.href}`);
      }
    }

    files.push(file);
  }

  folders.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  files.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));

  dirs[dirKey] = { key: dirKey, role, project, relPath, folders, files };
  return folders.length + files.length;
}

// ============ 快捷方式解析（第二阶段） ============

/**
 * 解析全部 .cmklink，并把它物化成「软链接式」的**别名目录子树**：
 * 目标目录（含其全部真实子目录）会以等价的目录结构登记到引用所在路径下，于是
 * 路由、面包屑与页面都表现为「这个目录真实存在于这里」，而不是跳到目标的真实页面。
 *
 * 细节口径：
 *  · 别名子树里的**文件夹 href 一律指向别名路径**（继续停留在这条路径上）；
 *  · 别名子树里的**文件保持真实素材 URL** —— 文件不是页面，必须有实体资源可给浏览器；
 *  · 目标目录里若还嵌着别处生成的引用条目，只指回「那条引用自己的别名路径」，不再展开（防环、防爆炸）；
 *  · 别名键与同目录下已有的真实目录撞名时：保留真实目录，引用退回目标真实路径并告警；
 *  · 目标不存在 / 非法（含 `..`）→ 灰色占位条目 + 控制台告警，方便发现写错的路径。
 */
function resolveShortcuts(dirs) {
  const stats = { total: 0, resolved: 0, missing: 0, aliasDirs: 0 };
  if (pendingShortcuts.length === 0) return stats;

  const lowerIndex = new Map();
  for (const [key, dir] of Object.entries(dirs)) {
    const lower = key.toLowerCase();
    if (!lowerIndex.has(lower)) lowerIndex.set(lower, dir);
  }
  const findDir = (target) =>
    dirs[`${target}/`] ||
    dirs[target] ||
    lowerIndex.get(`${target}/`.toLowerCase()) ||
    lowerIndex.get(target.toLowerCase()) ||
    null;

  /** 目标目录已知但条目数要等所有引用插完再回填 */
  const backfill = [];
  /** 同一个目录里已经出现过的目标：多个 .cmklink 指向同一处时只保留一张卡 */
  const seenTargetsByDir = new Map();
  /** 待物化的别名（第二阶段统一执行，保证别名副本能看到所有引用条目） */
  const aliasJobs = [];
  /** 已登记待生成的别名路径：用于识别"把别名路径写成引用目标"的写法 */
  const plannedAliasKeys = new Set();

  /**
   * 把 sourceDir 整棵子树克隆成别名，登记在 aliasSegments 这条路径下。
   * 返回别名目录；键冲突（同位置已有真实目录）时返回 null。
   */
  const materialize = (sourceDir, aliasSegments) => {
    const aliasKey = aliasSegments.join("/");
    if (dirs[aliasKey]) {
      console.warn(
        `[prepare-brief] WARN 引用别名与已有目录同名，已退回目标真实路径：/${aliasKey}（目标 ${sourceDir.key}）`
      );
      return null;
    }

    const folders = sourceDir.folders.map((folder) => ({
      ...folder,
      // 别名里的引用条目：**可见但不可进入**（引用不可嵌套 —— 用户定的硬规则）。
      // href 一律清空：既保证产物确定性（不依赖引用条目的处理顺序），也避免任何旁路跳转
      ...(folder.shortcut ? { locked: true, href: "" } : {}),
      // 真实子目录改指别名路径（停留在别名路径上）
      ...(folder.shortcut ? {} : { href: toHref([...aliasSegments, folder.name], { trailingSlash: true }) }),
    }));

    // 文件对象直接复用：href / 缩略图都是真实资源，只是换个页面路径展示
    // refAlias 标记供解析阶段识别「别名目录」，用来拒绝"引用指向引用"
    dirs[aliasKey] = {
      key: aliasKey,
      role: aliasSegments[0],
      project: aliasSegments[1],
      relPath: aliasSegments.slice(2).join("/"),
      refAlias: true,
      folders,
      files: sourceDir.files,
    };
    stats.aliasDirs++;

    for (const folder of sourceDir.folders) {
      if (folder.shortcut) continue;
      const childKey = `${sourceDir.key.replace(/\/$/, "")}/${folder.name}`;
      const childDir = dirs[childKey];
      if (!childDir) continue;
      materialize(childDir, [...aliasSegments, folder.name]);
    }
    return dirs[aliasKey];
  };

  for (const task of pendingShortcuts) {
    const dir = dirs[task.dirKey];
    if (!dir) continue;

    const seen = seenTargetsByDir.get(task.dirKey) ?? new Set();
    seenTargetsByDir.set(task.dirKey, seen);

    const entries = [];
    for (const target of task.targets) {
      if (seen.has(target)) continue;
      seen.add(target);
      stats.total++;
      const segments = target.split("/");
      const name = segments[segments.length - 1] || task.source;
      const illegal = segments.some((segment) => segment === "..");
      if (illegal) {
        console.warn(`[prepare-brief] WARN 引用目标非法（不允许越出素材根）：${target}（来自 ${task.source}）`);
      }

      const rawHit = illegal ? null : findDir(target);
      // 命中别名目录 = 「引用指向引用」：按目标非法处理，杜绝别名的别名无限套娃。
      // 注意两阶段顺序：别名要到第二阶段才生成，所以这里主要靠 plannedAliasKeys 识别
      // （rawHit.refAlias 是第二道保险，防止将来调整顺序后失效）。
      const hitPointsToAlias = Boolean(
        (rawHit && rawHit.refAlias) || plannedAliasKeys.has(target) || plannedAliasKeys.has(`${target}/`)
      );
      if (hitPointsToAlias) {
        console.warn(
          `[prepare-brief] WARN 引用不能指向引用（目标是别名目录），已按目标非法处理：${target}（来自 ${task.source}）`
        );
      }
      const hit = hitPointsToAlias ? null : rawHit;
      if (hit) {
        const entry = {
          name,
          href: "", // 第二阶段物化别名后再回填
          itemCount: 0,
          time: task.time,
          shortcut: true,
          target,
        };
        // 先只登记，等**所有**引用条目都就位再物化：这样目标目录里"别处生成的引用"
        // 也能在别名副本里被正确标记为 locked（否则会因处理顺序漏标）
        const aliasSegments = [...task.dirSegments, name];
        aliasJobs.push({ entry, targetDir: hit, aliasSegments, realSegments: segments });
        plannedAliasKeys.add(aliasSegments.join("/"));
        backfill.push({ entry, dir: hit });
        stats.resolved++;
        entries.push(entry);
      } else {
        // 越界与「指向引用」上面已经单独告警过，这里只报真正的"目录不存在"
        if (!illegal && !hitPointsToAlias) {
          console.warn(`[prepare-brief] WARN 引用目标不存在：${target}（来自 ${task.source}）`);
        }
        stats.missing++;
        entries.push({
          name,
          href: "",
          itemCount: 0,
          time: task.time,
          shortcut: true,
          target,
          missing: true,
        });
      }
    }

    if (entries.length > 0) {
      dir.folders.push(...entries);
      dir.folders.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
    }
  }

  // 第二阶段：所有引用条目就位后统一物化别名，再回填 href
  for (const job of aliasJobs) {
    const aliasDir = materialize(job.targetDir, job.aliasSegments);
    // 正常情况指向别名路径（像真实子目录）；撞名降级时退回目标真实路径
    job.entry.href = aliasDir
      ? toHref(job.aliasSegments, { trailingSlash: true })
      : toHref(job.realSegments, { trailingSlash: true });
  }

  for (const { entry, dir } of backfill) {
    entry.itemCount = dir.folders.length + dir.files.length;
  }

  return stats;
}

// ============ 门禁名称保险箱（name vault） ============
//
// 静态站没有服务端，又要做到「输入不区分大小写、且页面上不出现明文名称清单」，
// 于是把每个角色/项目名做一次可逆混淆：
//   lookup = fnv1a(`${SALT}|lk|${name.toLowerCase()}`)   // 供客户端按输入定位条目
//   密文   = utf8(name) XOR keystream(fnv1a(`${SALT}|ks|${name.toLowerCase()}`))
// 客户端用用户输入算出同一个 lookup 找到条目，再用输入派生的 keystream 解密出真实名；
// 输入不对 → 解出的是随机字节 → UTF-8 严格解码失败 → 判定为「名称不正确」。
//
// 注意：这是「隐私混淆」而不是加密（密钥即名称本身）。它的作用是页面上不出现明文清单、
// 也不能靠直接偷看源码拿到项目名；能猜出完整名称的人本来就能拿到素材（软门禁）。
//
// 同一份算法同时存在于 src/lib/name-vault.ts（客户端解析），两边改动必须同步。

const VAULT_SALT = "chamiko-brief-v1";

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function keystream(seed, length) {
  const bytes = Buffer.alloc(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i++) {
    if (i % 4 === 0) {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      state = (t ^ (t >>> 14)) >>> 0;
    }
    bytes[i] = (state >>> ((i % 4) * 8)) & 0xff;
  }
  return bytes;
}

/** 把名称打包成 { k, c } 两个字段（k = 定位用的短哈希，c = 混淆后的名称） */
function buildVaultEntry(name) {
  const key = name.toLowerCase();
  const plain = Buffer.from(name, "utf8");
  const ks = keystream(fnv1a(`${VAULT_SALT}|ks|${key}`), plain.length);
  const cipher = Buffer.alloc(plain.length);
  for (let i = 0; i < plain.length; i++) cipher[i] = plain[i] ^ ks[i];

  return {
    k: fnv1a(`${VAULT_SALT}|lk|${key}`).toString(16),
    c: cipher.toString("base64"),
  };
}

/** 自检：确保客户端算法能与构建期算法对上 */
function verifyVaultEntry(name, entry) {
  const plain = Buffer.from(name, "utf8");
  const ks = keystream(fnv1a(`${VAULT_SALT}|ks|${name.toLowerCase()}`), plain.length);
  const cipher = Buffer.from(entry.c, "base64");
  const restored = Buffer.alloc(cipher.length);
  for (let i = 0; i < cipher.length; i++) restored[i] = cipher[i] ^ ks[i];
  if (restored.toString("utf8") !== name) {
    throw new Error(`[prepare-brief] 名称保险箱自检失败：${name}`);
  }
  return entry;
}

/** 大小写折叠冲突检测：同层级出现折叠到同一小写名的文件夹时给出告警（保持确定性） */
function warnCaseCollisions(names) {
  const groups = new Map();
  for (const name of [...names].sort()) {
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(name);
  }
  for (const [key, group] of groups) {
    if (group.length > 1) {
      console.warn(
        `[prepare-brief] WARN 大小写冲突：${group.join(" / ")} 折叠为 "${key}"，` +
        `门禁输入不区分大小写时会落到 "${group[0]}"；精确输入仍优先进入自己那个文件夹`
      );
    }
  }
}

// ============ 主流程 ============

async function main() {
  const startedAt = Date.now();

  // 素材时间：清单 → git 提交时间 → 本机 mtime（必要时写回 materials-times.json）
  const timeResult = resolveMaterialTimes({
    root: ROOT,
    publicDir: PUBLIC_DIR,
    skipRootNames: RESERVED_ROOT_NAMES,
  });
  materialTimes = timeResult.times;

  if (TIMES_ONLY) {
    console.log(
      `[prepare-brief] 仅更新素材时间：新增 ${timeResult.added}、变更 ${timeResult.updated}、移除 ${timeResult.removed}；` +
      `${timeResult.wrote ? "materials-times.json 已更新" : "清单无变化"}`
    );
    return;
  }

  fs.mkdirSync(THUMB_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

  const dirs = {};
  const roles = [];
  /** role -> 该项目下的项目文件夹名列表（保持扫描顺序） */
  const projectsByRole = new Map();
  let projectCount = 0;

  const roleDirs = readEntries(PUBLIC_DIR)
    .filter((entry) => entry.isDirectory() && !isHidden(entry.name) && !RESERVED_ROOT_NAMES.has(entry.name))
    .map((entry) => entry.name)
    .sort();

  for (const role of roleDirs) {
    const projectNames = readEntries(path.join(PUBLIC_DIR, role))
      .filter((entry) => entry.isDirectory() && !isHidden(entry.name))
      .map((entry) => entry.name)
      .sort();

    if (projectNames.length === 0) {
      console.warn(`[prepare-brief] 角色 "${role}" 下没有项目文件夹，已跳过`);
      continue;
    }

    roles.push(role);
    projectsByRole.set(role, projectNames);
    for (const project of projectNames) {
      projectCount++;
      scanDir({
        absDir: path.join(PUBLIC_DIR, role, project),
        segments: [role, project],
        role,
        project,
        relPath: "",
        dirs,
      });
    }
  }

  // 第二阶段：整棵树扫完后解析快捷方式目标（目标可能在别的项目/角色下）
  const shortcutStats = resolveShortcuts(dirs);

  const { generated, cached, backdrops } = await runThumbTasks();

  // 清理历史缩略图（素材删除或改名后不再被引用）
  let removedThumbs = 0;
  for (const name of readEntries(THUMB_DIR)) {
    if (!name.isFile() || !name.name.endsWith(".webp")) continue;
    if (usedThumbs.has(name.name)) continue;
    fs.unlinkSync(path.join(THUMB_DIR, name.name));
    removedThumbs++;
  }

  // 去掉仅构建期需要的临时字段
  for (const dir of Object.values(dirs)) {
    for (const file of dir.files) delete file.__stat;
  }

  warnCaseCollisions(roles);

  const projectGates = [];
  const vault = { roles: [], projects: {} };

  vault.roles = roles.map((name) => verifyVaultEntry(name, buildVaultEntry(name)));
  for (const [role, names] of projectsByRole) {
    warnCaseCollisions(names);
    for (const name of names) projectGates.push({ role, name });
    vault.projects[role] = names.map((name) => verifyVaultEntry(name, buildVaultEntry(name)));
  }

  const tree = {
    generatedAt: new Date().toISOString(),
    dirs,
    gates: {
      roles: roles.map((name) => ({ name })),
      projects: projectGates,
    },
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(tree, null, 2), "utf-8");
  fs.writeFileSync(VAULT_FILE, JSON.stringify(vault, null, 2), "utf-8");

  const fileCount = Object.values(dirs).reduce((sum, dir) => sum + dir.files.length, 0);
  console.log(
    `[prepare-brief] 完成：${roles.length} 个角色 / ${projectCount} 个项目 / ${Object.keys(dirs).length} 个目录 / ${fileCount} 个文件；` +
    `缩略图变体 新生成 ${generated}、命中缓存 ${cached}（其中模糊底图 ${backdrops} 张）、清理 ${removedThumbs}；` +
    `引用 ${shortcutStats.resolved} 处（目标缺失 ${shortcutStats.missing}、别名目录 ${shortcutStats.aliasDirs} 个）；` +
    `素材时间 新增 ${timeResult.added}、变更 ${timeResult.updated}、移除 ${timeResult.removed}；` +
    `名称保险箱 ${vault.roles.length + projectCount} 条；耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`
  );
}

main().catch((err) => {
  console.error("[prepare-brief] 失败：", err);
  process.exit(1);
});
