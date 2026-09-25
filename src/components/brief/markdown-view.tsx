"use client";

import { useEffect, useState } from "react";

/** Markdown 排版渲染：marked 解析 + DOMPurify 净化（都在客户端按需加载） */
export function MarkdownView({ content }: { content: string }) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      const [markedModule, purifyModule] = await Promise.all([import("marked"), import("dompurify")]);
      const parser = new markedModule.Marked({ gfm: true, breaks: true });
      const raw = await parser.parse(content);
      const clean = purifyModule.default.sanitize(raw);
      if (!cancelled) setHtml(clean);
    };

    render().catch((err) => {
      console.error("Markdown 渲染失败", err);
    });

    return () => {
      cancelled = true;
    };
  }, [content]);

  return <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
