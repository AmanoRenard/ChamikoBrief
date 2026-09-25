import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectBrowser } from "@/components/brief/project-browser";
import { getDir, getProjectParams, resolveProject, resolveRole, toEntries } from "@/lib/brief-tree";
import { encodePathSegment } from "@/lib/share-url";

export function generateStaticParams() {
  return getProjectParams();
}

export function generateMetadata({
  params,
}: {
  params: { role: string; project: string };
}): Metadata {
  const role = resolveRole(params.role);
  const project = role ? resolveProject(role.name, params.project) : null;
  return {
    title: role && project ? `${project.name} - ${role.name}` : "狐绘万象",
  };
}

/** 项目根浏览页：以该文件夹为根 */
export default function ProjectPage({ params }: { params: { role: string; project: string } }) {
  const role = resolveRole(params.role);
  if (!role) notFound();

  const project = resolveProject(role.name, params.project);
  if (!project) notFound();

  const dir = getDir(role.name, project.name);
  if (!dir) notFound();

  const base = `/${encodePathSegment(role.name)}/${encodePathSegment(project.name)}`;

  return (
    <ProjectBrowser
      entries={toEntries(dir)}
      crumbs={[
        // 角色名在这层没有有意义的跳转目标（上级是项目名门禁页），做成不可点
        { label: role.name, href: null },
        { label: project.name, href: `${base}/` },
      ]}
    />
  );
}
