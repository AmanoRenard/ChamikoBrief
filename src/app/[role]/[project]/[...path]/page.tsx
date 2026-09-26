import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectBrowser } from "@/components/brief/project-browser";
import type { Crumb } from "@/components/breadcrumb";
import { decodePathParam, getDir, getSubPathParams, resolveProject, resolveRole, toEntries } from "@/lib/brief-tree";
import { encodePathSegment } from "@/lib/share-url";

export function generateStaticParams() {
  return getSubPathParams();
}

export function generateMetadata({
  params,
}: {
  params: { role: string; project: string; path: string[] };
}): Metadata {
  const role = resolveRole(params.role);
  const project = role ? resolveProject(role.name, params.project) : null;
  return {
    title:
      role && project
        // 参数可能是百分号编码的（中文目录），标题要显示明文。
        // 层级用「子目录 - 项目（角色）」：只有一个破折号，角色名进全角括号（2026-09 用户要）
        ? `${params.path.map(decodePathParam).join("/")} - ${project.name}（${role.name}）`
        : "狐绘万象",
  };
}

/** 子目录浏览页：项目内的任意层级文件夹 */
export default function SubDirectoryPage({
  params,
}: {
  params: { role: string; project: string; path: string[] };
}) {
  const role = resolveRole(params.role);
  if (!role) notFound();

  const project = resolveProject(role.name, params.project);
  if (!project) notFound();

  // 参数可能是百分号编码的（中文目录）：先统一解码成明文，后面查目录、拼面包屑与链接都用它
  const segments = params.path.map(decodePathParam);
  const relPath = segments.join("/");
  const dir = getDir(role.name, project.name, relPath);
  if (!dir) notFound();

  const base = `/${encodePathSegment(role.name)}/${encodePathSegment(project.name)}`;

  const crumbs: Crumb[] = [
    { label: role.name, href: `${base}/` },
    { label: project.name, href: `${base}/` },
    // 用解码后的明文做 label 与链接：拿编码值去 encodePathSegment 会把 "%" 再编成 "%25"（双重编码）
    ...segments.map((segment, index) => ({
      label: segment,
      href: `${base}/${segments
        .slice(0, index + 1)
        .map(encodePathSegment)
        .join("/")}/`,
    })),
  ];

  return <ProjectBrowser entries={toEntries(dir)} crumbs={crumbs} />;
}
