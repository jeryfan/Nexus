// 裁剪: fitPanes / focusActivePane / fitAndFocusPanes（依赖 PaneManager
// 终端分屏体系，Nexus 无终端 pane 管理器）；仅保留浏览器面板用到的 userAgent 判断与路径转义。

export function isWindowsUserAgent(
  userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent
): boolean {
  return userAgent.includes('Windows')
}

export function isMacUserAgent(
  userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent
): boolean {
  return userAgent.includes('Mac')
}

export function isLinuxUserAgent(
  userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent
): boolean {
  return !isMacUserAgent(userAgent) && !isWindowsUserAgent(userAgent) && userAgent.includes('Linux')
}

// Why: escape rules are a property of the *target* shell receiving the path,
// not the client OS. A Windows client dropping onto a Linux SSH worktree must
// produce POSIX-quoted output; passing a userAgent string here coupled escape
// rules to the client and silently misquoted cross-platform SSH drops.
export function shellEscapePath(path: string, targetShell: 'posix' | 'windows'): string {
  if (targetShell === 'windows') {
    return /^[a-zA-Z0-9_./@:\\-]+$/.test(path) ? path : `"${path}"`
  }

  if (/^[a-zA-Z0-9_./@:-]+$/.test(path)) {
    return path
  }

  return `'${path.replace(/'/g, "'\\''")}'`
}
