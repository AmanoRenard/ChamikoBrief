"use client";

import { motion, useReducedMotion } from "framer-motion";

/** 终局粒子：12 颗按圆周均分，模块期计算（SSR/客户端一致） */
const PARTICLES = Array.from({ length: 12 }, (_, index) => {
  const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
  const distance = 90 + (index % 3) * 34;
  return {
    x: Math.round(Math.cos(angle) * distance),
    y: Math.round(Math.sin(angle) * distance),
    delay: Math.round((index % 4) * 40) / 1000,
    size: index % 3 === 0 ? 2.5 : 1.5,
  };
});

/** 终局「开门」时刻：两圈光波 + 一圈光晕 + 12 颗粒子向外扩散（第二步提交成功后铺开） */
export function GateBurst({ origin }: { origin: { x: number; y: number } }) {
  const reduced = useReducedMotion();
  if (reduced) return null;

  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none fixed inset-0 z-50"
    >
      {/* 爆发中心搬到点击点。translate 类只放在非 motion 元素上 ——
          framer-motion 会接管 motion 元素的 transform，同元素叠加 Tailwind translate 会被覆盖 */}
      <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: origin.x, top: origin.y }}>
        <div className="relative flex h-96 w-96 items-center justify-center">
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="absolute h-24 w-24 rounded-full bg-primary/25 blur-2xl"
          />
          {[0, 1].map((ring) => (
            <motion.span
              key={ring}
              initial={{ scale: 0.35, opacity: 0.85 }}
              animate={{ scale: 3.1 + ring * 1.2, opacity: 0 }}
              transition={{ duration: 0.9 + ring * 0.15, ease: "easeOut", delay: ring * 0.12 }}
              className="absolute h-44 w-44 rounded-full border-2 border-primary-lighter/70"
            />
          ))}
          {PARTICLES.map((particle, index) => (
            <motion.span
              key={index}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: particle.x, y: particle.y, opacity: 0, scale: 0.4 }}
              transition={{ duration: 0.85, ease: "easeOut", delay: particle.delay }}
              className="absolute rounded-full bg-primary-lighter"
              style={{
                width: particle.size,
                height: particle.size,
                boxShadow: "0 0 9px 2px rgba(167,139,250,0.6)",
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
