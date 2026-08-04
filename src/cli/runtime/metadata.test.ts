import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getRuntimeMetadataPath } from '../../shared/browser/runtime-bootstrap'
import { getDefaultUserDataPath } from './metadata'
import { RuntimeClientError } from './types'

// Why: getDefaultUserDataPath 的 platform/homeDir 已参数化，其余输入
// （NEXUS_USER_DATA_PATH / APPDATA / XDG_CONFIG_HOME）在函数内读 process.env，
// 测试通过保存-清空-恢复 process.env 与 mkdtempSync 构造的目录树注入全部场景，
// 无需改动被测函数（保持原语义）。

const ENV_KEYS = ['NEXUS_USER_DATA_PATH', 'APPDATA', 'XDG_CONFIG_HOME'] as const

let savedEnv: Record<(typeof ENV_KEYS)[number], string | undefined>
let tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-metadata-test-'))
  tempDirs.push(dir)
  return dir
}

function writeRuntimeMetadata(userDataDir: string): void {
  mkdirSync(userDataDir, { recursive: true })
  writeFileSync(getRuntimeMetadataPath(userDataDir), '{}', 'utf8')
}

beforeEach(() => {
  savedEnv = {} as typeof savedEnv
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
  tempDirs = []
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('getDefaultUserDataPath platform defaults', () => {
  it('darwin resolves to ~/Library/Application Support/nexus-scaffold when it has metadata', () => {
    const home = makeTempDir()
    const primary = join(home, 'Library', 'Application Support', 'nexus-scaffold')
    writeRuntimeMetadata(primary)
    expect(getDefaultUserDataPath('darwin', home)).toBe(primary)
  })

  it('win32 resolves to %APPDATA%/nexus-scaffold when it has metadata', () => {
    const home = makeTempDir()
    const appData = makeTempDir()
    process.env.APPDATA = appData
    const primary = join(appData, 'nexus-scaffold')
    writeRuntimeMetadata(primary)
    expect(getDefaultUserDataPath('win32', home)).toBe(primary)
  })

  it('win32 without APPDATA throws runtime_unavailable', () => {
    const home = makeTempDir()
    let caught: unknown
    try {
      getDefaultUserDataPath('win32', home)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(RuntimeClientError)
    expect((caught as RuntimeClientError).code).toBe('runtime_unavailable')
  })

  it('linux resolves to $XDG_CONFIG_HOME/nexus-scaffold when it has metadata', () => {
    const home = makeTempDir()
    const xdg = makeTempDir()
    process.env.XDG_CONFIG_HOME = xdg
    const primary = join(xdg, 'nexus-scaffold')
    writeRuntimeMetadata(primary)
    expect(getDefaultUserDataPath('linux', home)).toBe(primary)
  })

  it('linux without XDG_CONFIG_HOME resolves to ~/.config/nexus-scaffold', () => {
    const home = makeTempDir()
    const primary = join(home, '.config', 'nexus-scaffold')
    writeRuntimeMetadata(primary)
    expect(getDefaultUserDataPath('linux', home)).toBe(primary)
  })
})

describe('getDefaultUserDataPath dev-directory fallback', () => {
  it('darwin falls back to the nexus directory when the primary has no metadata', () => {
    const home = makeTempDir()
    expect(getDefaultUserDataPath('darwin', home)).toBe(
      join(home, 'Library', 'Application Support', 'nexus')
    )
  })

  it('win32 falls back to %APPDATA%/nexus when the primary has no metadata', () => {
    const home = makeTempDir()
    const appData = makeTempDir()
    process.env.APPDATA = appData
    expect(getDefaultUserDataPath('win32', home)).toBe(join(appData, 'nexus'))
  })

  it('linux falls back to the nexus directory when the primary has no metadata', () => {
    const home = makeTempDir()
    expect(getDefaultUserDataPath('linux', home)).toBe(join(home, '.config', 'nexus'))
  })

  it('prefers the primary directory when both primary and fallback have metadata', () => {
    const home = makeTempDir()
    const primary = join(home, 'Library', 'Application Support', 'nexus-scaffold')
    const fallback = join(home, 'Library', 'Application Support', 'nexus')
    writeRuntimeMetadata(primary)
    writeRuntimeMetadata(fallback)
    expect(getDefaultUserDataPath('darwin', home)).toBe(primary)
  })
})

describe('getDefaultUserDataPath NEXUS_USER_DATA_PATH override', () => {
  it('wins over platform defaults even when the primary has metadata', () => {
    const home = makeTempDir()
    const override = makeTempDir()
    writeRuntimeMetadata(join(home, 'Library', 'Application Support', 'nexus-scaffold'))
    process.env.NEXUS_USER_DATA_PATH = override
    expect(getDefaultUserDataPath('darwin', home)).toBe(override)
  })

  it('wins over APPDATA resolution on win32 (no APPDATA needed)', () => {
    const home = makeTempDir()
    const override = makeTempDir()
    process.env.NEXUS_USER_DATA_PATH = override
    // APPDATA intentionally unset: the override must short-circuit before the
    // win32 APPDATA requirement is evaluated.
    expect(getDefaultUserDataPath('win32', home)).toBe(override)
  })
})
