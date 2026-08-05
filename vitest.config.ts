import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Why: renderer 测试（features/browser 等）经 @renderer / @shared 别名引用源码，
  // 与 electron.vite.config.ts / tsconfig 的别名保持一致。@nexus/* 同样直指
  // workspace 包源码（桌面端不消费 dist，见 AGENTS.md 源码消费约定）。
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared'),
      '@nexus/provider-registry/node': resolve('packages/provider-registry/src/registry-loader'),
      '@nexus/provider-registry': resolve('packages/provider-registry/src'),
      '@nexus/ui/icons': resolve('packages/ui/src/components/icons'),
      '@nexus/ui': resolve('packages/ui/src')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Why: builtinPackageSync.test.ts 是 node:test 风格套件（describe/it 来自 node:test，
    // 经 `npx tsx --test` 运行），属 agent builtins 工作流；被 vitest 收集会报
    // "No test suite found" 并使 `pnpm test` 退出码 1，故从 vitest 排除。
    exclude: ['src/main/agent/builtinPackageSync.test.ts', '**/node_modules/**', '**/dist/**'],
    // Glue for Nexus: jest-dom 匹配器统一在 setup 注册（见 vitest.setup.ts 注释）。
    setupFiles: ['vitest.setup.ts'],
    hookTimeout: 60_000,
    testTimeout: 30_000,
    pool: 'forks'
  }
})
