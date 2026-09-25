import { FolderX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-primary/10 blur-[130px]" />
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
