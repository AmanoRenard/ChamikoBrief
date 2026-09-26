import { FolderX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-4 text-center">
      {/* ⚠️ 光斑必须用 radial-gradient，不要用 `filter: blur()` 的大圆：Chrome 只对 CSS 渐变自带抖动，
          blur 的输出没有抖动，在 8-bit 屏上会量化成肉眼可见的同心色带（约定 19 的老坑，
          用户 2026-09 在 404 页又踩到："背景渐变分层像等高线"）。 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {/* 球心要落在视口中心：文案块是 `justify-center` 垂直居中的，球也必须按**中心**定位。
            曾经写 `top-1/3`（球"顶边"在 1/3 处）→ 球心偏下 60px 左右，和文案中心对不上（用户 2026-09 报）。 */}
        <div
          className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2"
          style={{ background: "radial-gradient(closest-side, rgba(139,92,246,0.12), transparent 72%)" }}
        />
      </div>

      <div className="relative flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-5">
          <FolderX size={28} className="text-slate-500" />
        </div>
        <h1 className="text-lg font-semibold text-slate-200">找不到这个地址</h1>
        <p className="mt-2 text-sm text-slate-500">链接可能已失效，或名称不完全一致。</p>
        <a
          href="/"
          className="mt-7 inline-flex items-center h-10 px-5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-200 transition-all hover:bg-white/[0.08] hover:border-white/[0.14]"
        >
          回到入口
        </a>
      </div>
    </main>
  );
}
