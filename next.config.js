/** @type {import('next').NextConfig} */
const nextConfig = {
  // 纯静态导出：产物落在 out/，全站零服务端
  output: "export",
  // 导出为 index.html，保证 Vercel 上 /yuka/ 这类路径干净可访问
  trailingSlash: true,
  images: {
    // 静态导出无法使用 Next 图片优化，缩略图由构建脚本预生成
    unoptimized: true,
  },
  reactStrictMode: true,
};

module.exports = nextConfig;
