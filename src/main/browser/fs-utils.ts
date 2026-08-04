// 裁剪: 仅保留 copyFileWithWindowsRetry 及其直接依赖（runFileOperationWithWindowsRetry/sleepSync）。
// 其余 writeFileAtomically* / guarded 操作依赖未迁移的 ../win32-utils 与 shared/node-file-content-equality。
import { copyFileSync } from 'node:fs'

// Why: on Windows, file replacement and backup-copy operations can fail with
// EPERM/EACCES/EBUSY if another process (antivirus, Claude CLI, Codex CLI)
// holds the target file open. A short retry avoids transient failures without
// masking real permission errors. Total backoff (~750ms) covers typical AV
// scan windows seen in issue #1507.
export function copyFileWithWindowsRetry(source: string, target: string): void {
  runFileOperationWithWindowsRetry(() => copyFileSync(source, target))
}

function runFileOperationWithWindowsRetry(operation: () => void): void {
  const maxAttempts = process.platform === 'win32' ? 6 : 1
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      operation()
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (attempt < maxAttempts && (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY')) {
        sleepSync(attempt * 50)
        continue
      }
      throw error
    }
  }
}

// Why: writeFileAtomically is a sync API called from sync paths, so the retry
// backoff must park the thread instead of burning CPU in a Date.now() loop.
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4))
function sleepSync(ms: number): void {
  Atomics.wait(sleepBuffer, 0, 0, ms)
}
