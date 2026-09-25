import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "狐绘万象",
  // 站点图标：文件在 public/icon.ico，静态导出后为 /icon.ico
  icons: {
    icon: "/icon.ico",
    shortcut: "/icon.ico",
  },
  // 不写 description：页面与链接预览里都不出现任何站点用途描述
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export const viewport: Viewport = {
  themeColor: "#0F0B1E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="dark">
        {children}
      </body>
    </html>
  );
}
