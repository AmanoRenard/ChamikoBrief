import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GateFlow } from "@/components/brief/gate/gate-flow";
import vaultData from "@/generated/name-vault.json";
import { getRoleParams, resolveRole } from "@/lib/brief-tree";
import { encodePathSegment } from "@/lib/share-url";
import type { NameVault } from "@/types/brief";

const vault = vaultData as NameVault;

export function generateStaticParams() {
  return getRoleParams();
}

export function generateMetadata({ params }: { params: { role: string } }): Metadata {
  const entry = resolveRole(params.role);
  // 标题栏只显示角色名，不带品牌名（弱化品牌、强化角色）
  return { title: entry ? entry.name : "狐绘万象" };
}

/** 第二级门禁：直达时从第二步开始（带角色胶囊） */
export default function RoleGatePage({ params }: { params: { role: string } }) {
  const entry = resolveRole(params.role);
  if (!entry) notFound();

  return (
    <GateFlow
      heading="狐绘万象"
      initialStep="project"
      roleVault={vault.roles}
      projectVault={vault.projects[entry.name] || []}
      basePath={`/${encodePathSegment(entry.name)}`}
      contextName={entry.name}
      backHref="/"
      backLabel="返回"
    />
  );
}