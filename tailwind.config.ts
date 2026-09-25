import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#6366F1",
          light: "#8B5CF6",
          lighter: "#A78BFA",
          cyan: "#06B6D4",
        },
        surface: {
          dark: "#0F0B1E",
          darker: "#1A1530",
          light: "#F8FAFC",
          lighter: "#FFFFFF",
        },
      },
      fontFamily: {
        sans: ["PingFang SC", "Microsoft YaHei", "sans-serif"],
      },
      animation: {
        "float": "float 3s ease-in-out infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "slide-up": "slideUp 0.3s ease-out",
        "fade-in": "fadeIn 0.3s ease-out",
        "gate-glow-a": "gateGlowA 15s ease-in-out infinite",
        "gate-glow-b": "gateGlowB 19s ease-in-out infinite",
        "gate-glow-c": "gateGlowC 17s ease-in-out infinite",
        "gate-star": "gateStar 11s ease-in-out infinite",
        "gate-shimmer": "gateShimmer 1s ease-in-out",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        glow: {
          "0%": { boxShadow: "0 0 5px rgba(99, 102, 241, 0.5)" },
          "100%": { boxShadow: "0 0 20px rgba(99, 102, 241, 0.8), 0 0 40px rgba(139, 92, 246, 0.4)" },
        },
        slideUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        // 门禁背景：三块光斑各自极慢地漂移呼吸（只动 transform/opacity，合成器友好）。
        // 呼吸幅度刻意收小：幅度越大，光斑边缘的明暗"等高线"涨缩越明显。
        gateGlowA: {
          "0%, 100%": { transform: "translate(-50%, 0) scale(1)", opacity: "0.85" },
          "50%": { transform: "translate(-50%, 5%) scale(1.08)", opacity: "1" },
        },
        gateGlowB: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)", opacity: "0.8" },
          "50%": { transform: "translate(9%, -7%) scale(1.1)", opacity: "0.95" },
        },
        gateGlowC: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)", opacity: "0.85" },
          "50%": { transform: "translate(-8%, -6%) scale(1.1)", opacity: "1" },
        },
        // 漂移光点：轻微上浮 + 明暗呼吸
        gateStar: {
          "0%, 100%": { transform: "translateY(0) translateX(0)", opacity: "0.2" },
          "50%": { transform: "translateY(-16px) translateX(6px)", opacity: "0.9" },
        },
        // 确认时的边框流光：一条斜向高光扫过输入框
        gateShimmer: {
          "0%": { transform: "translateX(-140%) skewX(-16deg)" },
          "100%": { transform: "translateX(260%) skewX(-16deg)" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
