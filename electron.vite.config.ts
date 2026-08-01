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
    build: { rollupOptions: { external: isExternal } },
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
  preload: { resolve: { alias: { '@shared': shared } } },
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
