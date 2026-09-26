"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronLeft, CircleAlert, Loader2 } from "lucide-react";
import type { VaultEntry } from "@/types/brief";
import { resolveVaultName } from "@/lib/name-vault";
import { encodePathSegment } from "@/lib/share-url";
import { GateBurst } from "@/components/brief/gate/gate-burst";

type Step = "role" | "project";

export interface GateFlowProps {
  /** 站名，固定「狐绘万象」 */
  heading: string;
  /** 起始步骤：/ 从 role 开始；/[role] 直达时为 project */
  initialStep: Step;
  /** 角色保险箱（构建期混淆，无明文） */
  roleVault: VaultEntry[];
  /** 项目保险箱（仅第二步需要） */
  projectVault?: VaultEntry[];
  /** 第二步的基路径："/<角色段>" */
  basePath?: string;
  /** 直达第二步时胶囊显示的角色名 */
  contextName?: string;
  /** 直达第二步时的返回链接 */
  backHref?: string;
  backLabel?: string;
}

/** 每一步的文案与报错（结构沿用约定 28：不出现任何明文名称） */
const STEP_COPY: Record<
  Step,
  {
    label: string;
    placeholder: string;
    submit: string;
    empty: string;
    /** 完整报错文案（≥640px 用） */
    notFound: string;
    /** 窄屏报错文案（<640px 用）：完整文案在 320px 这类极窄屏会折成两行、把卡片撑高 */
    notFoundShort: string;
  }
> = {
  role: {
    label: "角色名称",
    placeholder: "输入你的角色名",
    submit: "进入",
    empty: "请先写下角色之名。",
    // ⚠️ 报错文案受提示槽限制：完整版要在 ≥640px、短版要在 320px 上都只占一行，
    // 否则第二行会把提示槽撑高、整张卡片跟着变高（2026-09 用户报）。改文案先按这两个宽度试。
    notFound: "该角色尚未收录，请检查名称或新增角色。",
    notFoundShort: "该角色未收录，请检查名称。",
  },
  project: {
    label: "项目名称",
    placeholder: "输入项目名",
    submit: "打开项目",
    empty: "请再报上项目之名。",
    notFound: "该角色暂无此项目，请创建或核对名称。",
    notFoundShort: "暂无此项目，请核对名称。",
  },
};

export function GateFlow({
  heading,
  initialStep,
  roleVault,
  projectVault,
  basePath = "",
  contextName,
  backHref,
  backLabel,
}: GateFlowProps) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);

  const step = initialStep;
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** 当前报错的类别：驱动图标与动效强度（empty 轻、notFound 重） */
  const [errorKind, setErrorKind] = useState<"empty" | "notFound">("empty");
  const [shakeKey, setShakeKey] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  /** 终局特效的爆发中心：鼠标点击处；键盘回车等无坐标时回退按钮中心，再回退视口中心 */
  const [burstOrigin, setBurstOrigin] = useState({ x: 0, y: 0 });
  const clickPoint = useRef<{ x: number; y: number } | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step, shakeKey]);

  useEffect(() => {
    const stash = timers.current;
    return () => stash.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const schedule = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const fail = (message: string) => {
    setBusy(false);
    setShakeKey((key) => key + 1);
    setErrorKind("notFound");
    setError(message);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const copy = STEP_COPY[step];
    if (!value.trim()) {
      setShakeKey((key) => key + 1);
      setErrorKind("empty");
      setError(copy.empty);
      return;
    }

    setBusy(true);
    setError("");

    const resolved = resolveVaultName(step === "role" ? roleVault : projectVault ?? [], value);
    if (!resolved) {
      fail(copy.notFound);
      return;
    }

    if (step === "role") {
      // 第一步成功：勾选描画 + 边框流光，然后前往 /<角色>/ 的第二步
      // （项目保险箱按角色放在那一页，根页不能带所有角色的清单 —— 约定 28 的红线）
      setConfirmed(true);
      schedule(() => router.push(`/${encodePathSegment(resolved)}/`), reduced ? 60 : 1000);
      return;
    }

    if (reduced) {
      router.push(`${basePath}/${encodePathSegment(resolved)}/`);
      return;
    }
    const rect = submitRef.current?.getBoundingClientRect();
    setBurstOrigin(
      clickPoint.current ??
        (rect
          ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          : { x: window.innerWidth / 2, y: window.innerHeight / 2 })
    );
    setCelebrating(true);
    schedule(() => router.push(`${basePath}/${encodePathSegment(resolved)}/`), 760);
  };

  const copy = STEP_COPY[step];
  /** 二级页提示带上角色名（名字来自访客所在 URL，原徽标同样显示；约定 28 仍管住根页不出现任何名字） */
  const placeholder =
    step === "project" && contextName ? `输入 ${contextName} 的项目名` : copy.placeholder;

  return (
    <main className="relative flex min-h-screen select-none flex-col items-center justify-center px-4 py-14">  {/* 站名：模糊渐显 → 定版（reduced-motion 直接显示） */}
      <motion.h1
        initial={reduced ? false : { opacity: 0, y: 12, filter: "blur(16px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        className="mb-8 pl-[0.18em] text-center text-3xl font-semibold tracking-[0.18em] text-slate-100 sm:text-4xl"
      >
        {heading}
      </motion.h1>

      <motion.div
        initial={reduced ? false : { opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.22 }}
        className="relative w-full max-w-[420px]"
      >
        {/* 步骤进度：两段胶囊，当前层级点亮 */}
        <div className="mb-4 flex items-center justify-center gap-2" aria-hidden>
          {(["role", "project"] as const).map((s) => (
            <motion.span
              key={s}
              animate={{ scaleX: step === s ? 1.15 : 1, opacity: step === s ? 1 : 0.3 }}
              transition={{ duration: 0.3 }}
              className={`h-1.5 w-7 rounded-full ${
                step === s ? "bg-gradient-to-r from-primary to-primary-cyan" : "bg-white/15"
              }`}
            />
          ))}
        </div>

        <div className="rounded-2xl p-px bg-gradient-to-b from-white/[0.12] via-white/[0.06] to-transparent shadow-2xl shadow-black/40">
          <div className="relative isolate rounded-[15px] px-6 py-8 sm:px-8 before:absolute before:inset-0 before:-z-10 before:rounded-[15px] before:bg-surface-darker/80 before:backdrop-blur-xl">
            {/* 报错红晕：报错瞬间卡片泛起一次极淡红光后消散（只动 opacity，key 绑 shakeKey 触发重放；
                用 radial-gradient 而非 blur 光斑 —— 约定 19 的色带教训） */}
            {error && errorKind === "notFound" && !reduced ? (
              <motion.span
                key={shakeKey}
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="pointer-events-none absolute inset-0 rounded-[15px] [background:radial-gradient(ellipse_at_center,rgba(239,68,68,0.10),transparent_70%)]"
              />
            ) : null}
            {/* 二级页不再有顶部行（返回挪到提交按钮下方、角色名进 placeholder），卡片高度与一级一致 */}
            <form onSubmit={handleSubmit}>
                  {/* 标签与输入框包一层 group：聚焦时标签随主色点亮、报错时转淡红。
                      标签仍在抖动容器外 —— 报错时只有输入框抖、标签不动（约定 27）。
                      pl-[17px] = 输入框的 16px 内边距 + 1px 边框：标签与框内文字左对齐（此前贴着卡片边缘） */}
                  <div className="group/field">
                    <label
                      htmlFor="gate-input"
                      className={`mb-2.5 block pl-[17px] text-[13px] font-medium transition-colors ${
                        error
                          ? "text-red-400/80 group-focus-within/field:text-red-300"
                          : "text-slate-400 group-focus-within/field:text-primary-light"
                      }`}
                    >
                      {copy.label}
                    </label>

                  <motion.div
                    key={shakeKey}
                    animate={
                      shakeKey > 0 && !reduced
                        ? {
                            x: [0, -9, 9, -6, 6, -2, 0],
                            rotate: [0, -0.4, 0.4, -0.3, 0.3, 0],
                          }
                        : undefined
                    }
                    transition={{ duration: 0.42, ease: "easeInOut" }}
                    className="relative overflow-hidden rounded-xl"
                  >
                    {confirmed && !reduced ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 left-0 w-1/2 animate-gate-shimmer bg-gradient-to-r from-transparent via-primary-lighter/60 to-transparent"
                      />
                    ) : null}
                    <input
                      id="gate-input"
                      ref={inputRef}
                      value={value}
                      onChange={(event) => {
                        setValue(event.target.value);
                        // 重新输入即撤掉旧批注，避免过时报错一直挂在屏上
                        if (error) setError("");
                      }}
                      placeholder={placeholder}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      disabled={busy}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? "gate-error" : undefined}
                      className={`relative h-12 w-full select-text rounded-xl border bg-white/[0.04] px-4 text-[15px] text-slate-100 outline-none transition-all placeholder:text-slate-600 focus:bg-white/[0.06] disabled:opacity-60 ${
                        error
                          ? "border-red-500/50 focus:border-red-500/60 focus:shadow-[0_0_0_4px_rgba(239,68,68,0.12)]"
                          : "border-white/[0.08] focus:border-primary/50 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.14)]"
                      }`}
                    />
                  </motion.div>
                  </div>

                  {/* 提示槽：固定 20px 一行高、上下各留 8px 呼吸，槽内垂直居中 ——
                      静默与报错时卡片高度都不变。前提是报错文案在最窄屏也只占一行（见 STEP_COPY）。 */}
                  <div className="mt-2 flex min-h-[20px] items-center">
                    <AnimatePresence>
                      {error ? (
                        <motion.p
                          role="alert"
                          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ type: "spring", stiffness: 380, damping: 26 }}
                          className="flex items-center gap-2 text-xs text-red-400"
                        >
                          <motion.span
                            aria-hidden
                            initial={reduced ? false : { scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 500, damping: 22, delay: 0.06 }}
                            /* flex 不能少：图标是 inline 的 svg，放在普通 span 里会按**基线**对齐，
                               中心比文字高约 2px（2026-09 用户报）。让它成为 flex item 才会真正居中。 */
                            className="flex shrink-0"
                          >
                            <CircleAlert size={14} />
                          </motion.span>
                          {/* 报错文案分两档：窄屏（<640px）用短版，否则第二行会把提示槽撑高 ——
                              提示槽只预留了一行（见 STEP_COPY 的字数约束） */}
                          <span id="gate-error">
                            <span className="sm:hidden">
                              {errorKind === "notFound" ? copy.notFoundShort : error}
                            </span>
                            <span className="hidden sm:inline">{error}</span>
                          </span>
                        </motion.p>
                      ) : null}
                    </AnimatePresence>

                    <AnimatePresence>
                    {confirmed ? (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2 text-xs text-emerald-400"
                      >
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <motion.path
                            d="M4 12.5 9.5 18 20 6.5"
                            initial={reduced ? false : { pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                          />
                        </svg>
                        身份已确认
                      </motion.p>
                    ) : null}
                    </AnimatePresence>
                  </div>

                  {/* 返回与提交同一行：返回只占左侧一小格（图标方块，二级才有），提交占其余宽度 */}
                  <div className="mt-3 flex items-stretch gap-3">
                    {backHref && step === "project" ? (
                      <a
                        href={backHref}
                        aria-label={backLabel || "返回"}
                        title={backLabel || "返回"}
                        className="flex h-12 w-14 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary-lighter transition-colors hover:bg-primary/20 hover:text-white"
                      >
                        <ChevronLeft size={18} />
                      </a>
                    ) : null}
                    <motion.div
                      layout
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                      className="min-w-0 flex-1"
                    >
                      <button
                        ref={submitRef}
                        type="submit"
                        disabled={busy}
                        onPointerDown={(event) => {
                          // pointer 事件同时覆盖鼠标与触屏；键盘回车提交不触发，走 rect 回退
                          clickPoint.current = { x: event.clientX, y: event.clientY };
                        }}
                        className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary via-primary-light to-primary-cyan text-sm font-medium text-white shadow-lg shadow-primary/25 transition-all hover:brightness-110 hover:shadow-primary/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                    {busy ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        正在{copy.submit}
                      </>
                    ) : (
                      <>
                        {copy.submit}
                        <ArrowRight size={16} />
                      </>
                    )}
                      </button>
                    </motion.div>
                  </div>
            </form>
          </div>
        </div>
      </motion.div>

      {/* 终局「开门」光波：第二步提交成功后铺开，随后跳转项目页 */}
      <AnimatePresence>{celebrating ? <GateBurst origin={burstOrigin} /> : null}</AnimatePresence>
    </main>
  );
}