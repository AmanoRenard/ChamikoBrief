import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectBrowser } from "@/components/brief/project-browser";
import type { Crumb } from "@/components/breadcrumb";
import { getDir, getSubPathParams, resolveProject, resolveRole, toEntries } from "@/lib/brief-tree";
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
        ? `${params.path.join("/")} - ${project.name} - ${role.name}`
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

  const relPath = params.path.join("/");
  const dir = getDir(role.name, project.name, relPath);
  if (!dir) notFound();

  const base = `/${encodePathSegment(role.name)}/${encodePathSegment(project.name)}`;

  const crumbs: Crumb[] = [
    { label: role.name, href: `${base}/` },
    { label: project.name, href: `${base}/` },
    ...params.path.map((segment, index) => ({
      label: segment,
      href: `${base}/${params.path
        .slice(0, index + 1)
        .map(encodePathSegment)
        .join("/")}/`,
    })),
  ];

  return <ProjectBrowser entries={toEntries(dir)} crumbs={crumbs} />;
}
