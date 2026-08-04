export function installBrowserWindowCloseGuard(): void {
  const ignoreWindowClose = (): void => {}
  try {
    Object.defineProperty(window, 'close', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: ignoreWindowClose
    })
  } catch {
    try {
      window.close = ignoreWindowClose
    } catch {
      // best effort: 兜底赋值也失败时放弃守卫
    }
  }
}
