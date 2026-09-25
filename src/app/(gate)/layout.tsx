import type { ReactNode } from "react";
import { GateBackdrop } from "@/components/brief/gate/gate-backdrop";

/**
 * 门禁路由组共享布局：两级门禁（/ 与 /[role]）都挂在这一层，
 * 常驻背景组件在两页之间跳转时**不会重挂载**，制造"同一个世界"的连续感。URL 不变。
 */
export default function GateLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <GateBackdrop />
      <div className="relative">{children}</div>
    </div>
  );
}
