import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  eslintConfigPrettier,
  // The model-service implementation is migrated from the legacy Nexus
  // codebase. Keep its source intact and lint it with the rules used by that
  // codebase, while Nexus-owned integration files continue to use the strict
  // defaults above.
  {
    files: [
      'src/main/**/*.{ts,tsx,js,jsx,mts,cts}',
      'src/shared/**/*.{ts,tsx,js,jsx,mts,cts}',
      'src/renderer/src/**/*.{ts,tsx,js,jsx,mts,cts}',
      'packages/**/*.{ts,tsx,js,jsx,mts,cts}'
    ],
    ignores: [
      'src/main/index.ts',
      'src/main/ipc/nativeCommandMenu.ts',
      'src/main/services/providerLogoStore.ts',
      'src/renderer/src/components/ui/**',
      'src/renderer/src/components/shell.tsx',
      'src/renderer/src/components/account-menu.tsx',
      'src/renderer/src/components/search-dialog.tsx',
      'src/renderer/src/components/window-controls.tsx',
      'src/renderer/src/lib/**',
      'src/renderer/src/stores/**',
      'src/renderer/src/views/**',
      'src/renderer/src/App.tsx',
      'src/renderer/src/main.tsx'
    ],
    plugins: {
      '@eslint-react/naming-convention': {
        rules: {
          'context-name': {
            meta: { schema: [] },
            create: () => ({})
          }
        }
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off'
    },
    rules: {
      'prettier/prettier': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-case-declarations': 'off',
      'no-control-regex': 'off',
      'react/prop-types': 'off',
      'react/no-children-prop': 'off',
      'react/no-unescaped-entities': 'off',
      'react/display-name': 'off',
      'react-refresh/only-export-components': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/unsupported-syntax': 'off',
      'react-hooks/config': 'off',
      'react-hooks/gating': 'off'
    }
  },
  {
    files: ['src/renderer/src/components/ui/**/*.tsx'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      'react-refresh/only-export-components': 'off'
    }
  }
)
