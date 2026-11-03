import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // 개발용 PGlite(src/server/db.ts)는 wasm·확장 파일을 패키지 경로에서 읽으므로 번들하지 않는다
  serverExternalPackages: ['@electric-sql/pglite', 'pglite-prisma-adapter'],
};

export default nextConfig;
