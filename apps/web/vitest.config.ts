import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  // tsconfig 는 jsx: preserve(Next 몫)라, 테스트에선 React 17+ 자동 런타임으로 변환한다
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // 기본은 node. DOM이 필요한 UI 테스트만 파일 위 `@vitest-environment jsdom` 으로 바꾼다
    environment: 'node',
    // Seed 컴포넌트가 레시피 CSS 를 import 해서, Node 가 직접 읽지 않고 vite 로 넘긴다
    server: { deps: { inline: [/@seed-design\//] } },
  },
});
