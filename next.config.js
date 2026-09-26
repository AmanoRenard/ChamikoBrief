const isDev = process.env.NODE_ENV === "development";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 纯静态导出：产物落在 out/，全站零服务端。
  // ⚠️ dev 下**必须关掉** export：Next 在 `output: export` 时会拿"浏览器发来的、已百分号编码的
  // 路径"（形如 /<role>/<project>/%E5%8F%82…/）去比对 generateStaticParams()，
  // 而后者给出的是**原始中文**，两者对不上 → 含中文的目录一律报
  // `is missing param … in "generateStaticParams()"`（2026-09 用户报，dev 里进不去中文文件夹）。
  // 反向改（把 params 也改成编码值）不行：那样静态产物会导出成 `%E5%8F%82…` 这种字面目录名，
  // 部署后 decode 过来找不到文件。所以只在 dev 关掉校验 —— 构建仍然是 output: export。
  output: isDev ? undefined : "export",
  // 导出为 index.html，保证 Vercel 上 /yuka/ 这类路径干净可访问
  trailingSlash: true,
  images: {
    // 静态导出无法使用 Next 图片优化，缩略图由构建脚本预生成
    unoptimized: true,
  },
  reactStrictMode: true,
};

module.exports = nextConfig;
