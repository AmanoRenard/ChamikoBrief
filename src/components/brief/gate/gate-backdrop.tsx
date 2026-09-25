"use client";

import { useMemo } from "react";

/**
 * 门禁页的程序化背景：噪点、细网格、渐变光斑、漂移光点，全部代码生成，零图片素材。
 *
 * 分层与动画约定（PROJECT_CONTEXT 20/21/22）：
 *  - 光斑层只动 transform/opacity，元素自身不带 backdrop-filter；
 *  - 网格与噪点为静态层，不参与动画（feTurbulence 逐帧重绘极贵）；
 *  - 全部 pointer-events-none，绝不挡输入。
 */

/** 固定种子的线性同余伪随机：SSR 与客户端渲染出同一批光点，避免 hydration 不匹配 */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

type Star = {
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
  opacity: number;
};

/** 18 颗漂移光点：位置/延迟/周期在构建时确定 */
const STARS: Star[] = (() => {
  const rand = seeded(20260925);
  return Array.from({ length: 18 }, () => ({
    left: Math.round(rand() * 960) / 10,
    top: Math.round(rand() * 900) / 10,
    size: rand() > 0.72 ? 3 : 2,
    delay: Math.round(rand() * 90) / 10,
    duration: 9 + Math.round(rand() * 70) / 10,
    opacity: Math.round((0.2 + rand() * 0.5) * 100) / 100,
  }));
})();

export function GateBackdrop() {
  const stars = useMemo(() => STARS, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden bg-surface-dark"
    >
      {/* 1. 三块渐变光斑：靛蓝 / 青 / 紫，极慢漂移呼吸。
          刻意用 radial-gradient 而不是 filter:blur —— Chrome 对 CSS 渐变自带抖动，
          对 blur() 的输出没有：大半径模糊在 8-bit 屏上量化成肉眼可见的同心色带
          （"背景分层明显"的根源）。动画仍只动 transform/opacity（约定 20）。 */}
      <div
        className="absolute -top-52 left-1/2 h-[640px] w-[640px] -translate-x-1/2 animate-gate-glow-a motion-reduce:animate-none"
        style={{ background: "radial-gradient(closest-side, rgba(99,102,241,0.28), transparent 72%)" }}
      />
      <div
        className="absolute top-1/4 -left-44 h-[520px] w-[520px] animate-gate-glow-b motion-reduce:animate-none"
        style={{ background: "radial-gradient(closest-side, rgba(6,182,212,0.15), transparent 72%)" }}
      />
      <div
        className="absolute -bottom-56 right-[-14%] h-[580px] w-[580px] animate-gate-glow-c motion-reduce:animate-none"
        style={{ background: "radial-gradient(closest-side, rgba(139,92,246,0.18), transparent 72%)" }}
      />

      {/* 2. 细网格：linear-gradient 画线，椭圆径向遮罩向边缘淡出 */}
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(148,163,184,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.055)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_72%_62%_at_50%_44%,black,transparent)]" />

      {/* 3. 噪点：SVG feTurbulence，静态一次性渲染，overlay 混入。
          除了质感，它还兼任"抗色带抖动"：细噪点把渐变残余的 8-bit 台阶打碎；
          去饱和（saturate 0）避免彩噪在暗底上产生色偏。 */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.06] mix-blend-overlay">
        <filter id="gate-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#gate-noise)" />
      </svg>

      {/* 4. 漂移光点 */}
      {stars.map((star, index) => (
        <span
          key={index}
          className="absolute rounded-full bg-slate-200 animate-gate-star motion-reduce:animate-none"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.duration}s`,
            boxShadow: "0 0 7px 1px rgba(165,180,252,0.55)",
          }}
        />
      ))}
    </div>
  );
}
