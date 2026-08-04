import { resolve } from 'path'
import { builtinModules } from 'module'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

const shared = resolve('src/shared')
const externalModules = ['electron', ...builtinModules, ...Object.keys(pkg.dependencies)]
const isExternal = (id: string): boolean =>
  id.startsWith('node:') || externalModules.some((name) => id === name || id.startsWith(`${name}/`))

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: isExternal,
        input: {
          index: resolve('src/main/index.ts'),
          // Why: sandboxed webview preloads cannot load Rollup helper chunks.
          'browser-window-close-preload': resolve('src/preload/browser-window-close.ts')
        },
        // Why: Rolldown's SSR default is ESM, but sandboxed webview preloads must be CJS.
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    },
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@application': resolve('src/main/core/application/Application'),
        '@data': resolve('src/main/data'),
        '@logger': resolve('src/main/core/logger/LoggerService'),
        '@shared': shared,
        '@nexus/ai-core/provider': resolve('packages/aiCore/src/core/providers'),
        '@nexus/ai-core': resolve('packages/aiCore/src'),
        '@nexus/ai-sdk-provider': resolve('packages/ai-sdk-provider/src'),
        '@nexus/provider-registry/node': resolve('packages/provider-registry/src/registry-loader'),
        '@nexus/provider-registry': resolve('packages/provider-registry/src')
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        // Why: 与 main 一致外置 electron/内置模块/运行时依赖。缺省时 rolldown 会把
        // node_modules/electron（启动器包）打进产物，preload 加载时按 out/preload/ 下
        // 不存在的 path.txt 解析二进制并抛 "Electron failed to install correctly"，
        // 导致 window.api 整体缺失（CLI requestTabCreate 无人应答）。
        external: isExternal,
        input: {
          index: resolve('src/preload/index.ts')
        },
        // Why: 显式钉死 preload 产物为 ESM .mjs。因果链：显式 input 模式 → vite 8 SSR
        // 构建默认 ESM → .mjs 产物 → src/main/index.ts 按 `../preload/index.mjs` 引用。
        // 勿删上方 input 块或改此 output：失去 input 会退回 electron-vite lib 模式，
        // 产物变成 CJS .js，主进程引用路径断链。
        output: {
          format: 'es',
          entryFileNames: '[name].mjs'
        }
      }
    },
    resolve: { alias: { '@shared': shared } }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@data': resolve('src/renderer/src/data'),
        '@logger': resolve('src/renderer/src/services/LoggerService'),
        '@shared': shared,
        '@nexus/ui/icons': resolve('packages/ui/src/components/icons'),
        '@nexus/ui': resolve('packages/ui/src'),
        '@nexus/provider-registry/node': resolve('packages/provider-registry/src/registry-loader'),
        '@nexus/provider-registry': resolve('packages/provider-registry/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
