/**
 * Sole entry point for loading pi-coding-agent in the main process.
 *
 * pi is pure ESM while the main bundle is CJS, so it must be loaded through a
 * native dynamic `import()`. Rollup keeps `import()` native for external
 * modules (`output.dynamicImportInCjs` defaults to true), and pi is external
 * because it lives in `dependencies` (see `externalModules` in
 * electron.vite.config.ts). Type consumers should use `import type` from the
 * package directly — types are erased and cost nothing at runtime.
 */

export type PiCodingAgentModule = typeof import('@earendil-works/pi-coding-agent')

let pending: Promise<PiCodingAgentModule> | undefined

/** Load (once) and return the pi-coding-agent module. */
export function loadPi(): Promise<PiCodingAgentModule> {
  pending ??= import('@earendil-works/pi-coding-agent')
  return pending
}
