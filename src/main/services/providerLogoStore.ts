import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { application } from '@application'

function logoFileName(providerId: string): string {
  return `${createHash('sha256').update(providerId).digest('hex')}.webp`
}

function logoPath(providerId: string): string {
  return join(application.getPath('app.provider_logos'), logoFileName(providerId))
}

export function getProviderLogoSrc(providerId: string): string | undefined {
  const path = logoPath(providerId)
  if (!existsSync(path)) return undefined
  return `data:image/webp;base64,${readFileSync(path).toString('base64')}`
}

export function writeProviderLogo(providerId: string, bytes: Uint8Array): void {
  const directory = application.getPath('app.provider_logos')
  mkdirSync(directory, { recursive: true })

  const target = logoPath(providerId)
  const temporary = `${target}.tmp`
  writeFileSync(temporary, bytes)
  renameSync(temporary, target)
}

export function readProviderLogo(providerId: string): Buffer | undefined {
  const path = logoPath(providerId)
  return existsSync(path) ? readFileSync(path) : undefined
}

export function deleteProviderLogo(providerId: string): void {
  const path = logoPath(providerId)
  if (existsSync(path)) unlinkSync(path)
}
