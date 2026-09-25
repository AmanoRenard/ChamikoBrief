import type { Metadata } from "next";
import { GateFlow } from "@/components/brief/gate/gate-flow";
import vaultData from "@/generated/name-vault.json";
import type { NameVault } from "@/types/brief";

export const metadata: Metadata = {
  title: "狐绘万象",
};

const vault = vaultData as NameVault;

/** 第一级门禁：只提示输入角色名，不展示任何列表 */
export default function RootGatePage() {
  return <GateFlow heading="狐绘万象" initialStep="role" roleVault={vault.roles} />;
}