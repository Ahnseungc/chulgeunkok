import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // 워크스페이스 TS 패키지는 빌드 없이 소스를 그대로 쓴다
  transpilePackages: ['@chulgeunkok/db', '@chulgeunkok/app-bridge'],
  // 개발용 PGlite(packages/db/src/client.ts)는 wasm·확장 파일을 패키지 경로에서 읽으므로 번들하지 않는다.
  // Next는 앱에서 resolve 되는 패키지만 외부로 빼므로 apps/web devDependencies에도 둔다
  serverExternalPackages: ['@electric-sql/pglite', 'pglite-prisma-adapter', '@prisma/client'],
};

export default nextConfig;
