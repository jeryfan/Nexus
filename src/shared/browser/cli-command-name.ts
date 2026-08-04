export function getCliCommandNameForPlatform(platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return 'nexus.cmd'
  }
  return 'nexus'
}
