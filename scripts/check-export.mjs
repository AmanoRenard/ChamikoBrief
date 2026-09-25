#!/usr/bin/env node
/**
 * 构建后自检：确认 out/ 真的是本次构建产出的。
 *
 * 触发场景：导出阶段失败但流程看起来"成功"（报错被日志过滤掉、退出码被管道吞掉），
 * 此时 out/ 里是上一次的旧产物，直接预览或部署就会误判成"改了没效果"。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_INDEX = path.join(ROOT, "out", "index.html");
const BUILD_ID = path.join(ROOT, ".next", "BUILD_ID");

if (!fs.existsSync(OUT_INDEX)) {
  console.error("[check-export] 没有找到 out/index.html，导出没有产出任何页面。");
  process.exit(1);
}

const outTime = fs.statSync(OUT_INDEX).mtimeMs;
const buildTime = fs.existsSync(BUILD_ID) ? fs.statSync(BUILD_ID).mtimeMs : 0;

if (outTime < buildTime) {
  console.error("[check-export] out/ 里的产物比本次构建更旧，说明导出阶段没有真正写入。");
  console.error("  常见原因：删除 out/ 时被环境拦下（例如 IDE 的 safe-delete 报 Some operations were aborted）。");
  console.error("  处理：先 `npm run clean` 再重新 `npm run build`。");
  process.exit(1);
}

console.log(`[check-export] 导出产物已更新：out/index.html ${new Date(outTime).toLocaleString()}`);
