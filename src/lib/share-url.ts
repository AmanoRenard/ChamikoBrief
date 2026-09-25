// 前端（浏览器）通用小工具：直链拼接、复制到剪贴板、路径片段编码。
// 这里不导入任何构建产物，保证不会把目录树打进客户端 bundle。

/**
 * 只对会破坏 URL 语义的字符做百分号编码，中文等字符保持可读。
 * 与 scripts/prepare-brief.mjs 里的编码规则保持一致（两边都要改）。
 */
const UNSAFE_CHARS = /[#?%&+<>\s"`{}|\\^[\]]/g;

export function encodePathSegment(segment: string): string {
  return segment.replace(UNSAFE_CHARS, (ch) => encodeURIComponent(ch));
}

/** 由路径片段拼出站内路径（不做结尾斜杠处理） */
export function joinPath(...segments: string[]): string {
  return "/" + segments.filter(Boolean).map(encodePathSegment).join("/");
}

/** 把站内路径转成可直接发给他人的绝对直链 */
export function buildShareUrl(href: string): string {
  if (typeof window === "undefined") return href;
  return window.location.origin + href;
}

/** 微软 Office 在线预览器（Edge 内置的"Office 查看器"用的就是这套服务） */
const OFFICE_VIEWER_ENDPOINT = "https://view.officeapps.live.com/op/view.aspx?src=";

/**
 * 把站内路径包成微软在线预览器的地址，用于浏览器没有解码器的 Office 格式（docx / xlsx / pptx）。
 * 注意：是**微软的服务器**来抓取这个地址并转成网页，所以文件必须公网可达 —— 见 canUseOfficeViewer()。
 */
export function buildOfficePreviewUrl(href: string): string {
  return OFFICE_VIEWER_ENDPOINT + encodeURIComponent(buildShareUrl(href));
}

/** 本机地址（localhost / 回环 / IP 字面量 / .local）：微软服务器抓不到 */
function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
  );
}

/**
 * 微软在线预览器当前是否可用：它要求"公网能访问到本站"。
 * 本地开发/静态预览时返回 false —— 此时不展示该按钮，避免点开看到"无法预览此文件"。
 */
export function canUseOfficeViewer(): boolean {
  if (typeof window === "undefined") return false;
  return !isLocalHostname(window.location.hostname);
}

/** 触发浏览器下载（同源 + download 属性，图片/文本都会直接保存而不是新开标签页） */
export function downloadFile(href: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

/** 复制文本；剪贴板 API 不可用（非 HTTPS、旧浏览器）时降级为 execCommand */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error("剪贴板 API 复制失败，改用降级方案", err);
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch (err) {
    console.error("复制失败", err);
    return false;
  }
}
