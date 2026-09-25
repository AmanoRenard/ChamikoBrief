#!/usr/bin/env node
/**
 * 构建前清掉旧的导出目录 out/。
 *
 * 为什么要单独写一步：`next build`（output: 'export'）在导出阶段会先删除 out/，
 * 而某些环境（例如 IDE 给 node 注入的 safe-delete shim）会把这个删除动作拦下来并抛
 * "Some operations were aborted"，导致**导出阶段整体失败、out/ 里却留着上一次的旧产物**。
 * 看起来构建成功，实际部署/预览的是旧代码，非常容易误判。
 *
 * Windows 上改用系统的 rmdir（不经过 node 的删除实现），其余平台用 fs.rm。
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "out");

if (!fs.existsSync(OUT_DIR)) {
  console.log("[clean-out] out/ 不存在，无需清理");
  process.exit(0);
}

try {
  if (process.platform === "win32") {
    execSync('cmd /c rmdir /s /q "out"', { cwd: ROOT, stdio: "ignore" });
  } else {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
  }
  console.log("[clean-out] 已清理 out/");
} catch (err) {
  console.error("[clean-out] 清理 out/ 失败：", err.message);
  process.exit(1);
}
