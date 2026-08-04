/**
 * 本地专用文件列举（listQuickOpenFiles）：无 resolveAuthorizedPath/store、
 * SSH connectionId 与 WSL 路由（直接本地 spawn），也不接受嵌套 worktree
 * excludePaths（Nexus 路由无此入参）。
 */
import { sep } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import {
  buildRgArgsForQuickOpen,
  normalizeQuickOpenRgLine,
  shouldExcludeQuickOpenRelPath,
  shouldIncludeQuickOpenPath,
  type RgOutputMode
} from '@shared/fs/quick-open-filter'
import { isQuickOpenReaddirBudgetError } from '@shared/fs/quick-open-readdir-walk'
import { checkRgAvailable } from './rg-availability'
import { listFilesWithGit } from './list-files-git-fallback'

const RG_LIST_TIMEOUT_MS = 10_000

/** rg 缺失时给出平台级安装建议。 */
function buildInstallRgMessage(cause: unknown): string {
  const reason = cause instanceof Error ? cause.message : String(cause)
  const cmd =
    process.platform === 'darwin'
      ? 'brew install ripgrep'
      : 'install ripgrep (https://github.com/BurntSushi/ripgrep#installation)'
  return (
    `File listing scan too large (${reason}). ` +
    `Install ripgrep to enable fast, gitignore-aware listing: ${cmd}`
  )
}

export async function listLocalFiles(
  rootPath: string,
  signal?: AbortSignal,
  maxResults?: number
): Promise<string[]> {
  const excludePathPrefixes: readonly string[] = []

  // Why: checking rg availability upfront avoids a race condition where
  // spawn('rg') emits 'close' before 'error' on some platforms, causing
  // the handler to resolve with empty results before the git fallback
  // can run.
  const rgAvailable = await checkRgAvailable(rootPath)
  if (!rgAvailable) {
    try {
      return await listFilesWithGit(rootPath, excludePathPrefixes, signal, maxResults)
    } catch (err) {
      if (!isQuickOpenReaddirBudgetError(err)) {
        throw err
      }
      throw new Error(buildInstallRgMessage(err))
    }
  }

  const files = new Set<string>()
  const children: {
    child: ChildProcess
    isDone: () => boolean
    finish: () => void
  }[] = []

  const { primary, ignoredPass } = buildRgArgsForQuickOpen({
    // Why: rg evaluates root-relative exclude globs against cwd only when the
    // search target is cwd-relative.
    searchRoot: '.',
    excludePathPrefixes,
    // On Windows, rg outputs '\\'-separated paths; force '/'. Also force on
    // macOS/Linux for idempotence — it's a no-op there.
    forceSlashSeparator: sep === '\\'
  })

  const runRg = (args: string[]): Promise<void> => {
    return new Promise((resolve, reject) => {
      let buf = ''
      let done = false
      let parseablePathCount = 0

      const processLine = (rawLine: string): boolean => {
        const relPath = normalizeQuickOpenRgLine(rawLine, getRgOutputMode(rawLine, rootPath))
        if (relPath === null) {
          return false
        }
        parseablePathCount++
        if (!shouldIncludeQuickOpenPath(relPath)) {
          return false
        }
        if (shouldExcludeQuickOpenRelPath(relPath, excludePathPrefixes)) {
          return false
        }
        if (maxResults !== undefined && files.size >= maxResults) {
          return true
        }
        files.add(relPath)
        return maxResults !== undefined && files.size >= maxResults
      }

      const child = spawn('rg', args, {
        cwd: rootPath,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      const timer = setTimeout(() => {
        // Why: on timeout, the buffer is likely truncated mid-path. Discard
        // it so Quick Open never displays a malformed entry.
        buf = ''
        child.kill()
        finish(new Error('rg list timed out'))
      }, RG_LIST_TIMEOUT_MS)
      const handleStdoutData = (chunk: string): void => {
        buf += chunk
        let start = 0
        let newlineIdx = buf.indexOf('\n', start)
        while (newlineIdx !== -1) {
          if (processLine(buf.substring(start, newlineIdx))) {
            buf = ''
            finishAtLimit()
            return
          }
          start = newlineIdx + 1
          newlineIdx = buf.indexOf('\n', start)
        }
        buf = start < buf.length ? buf.substring(start) : ''
      }
      const handleStderrData = (): void => {
        /* drain */
      }
      const handleError = (): void => {
        // Why: treat spawn errors like an abnormal exit — discard residual
        // buffer so a truncated final byte sequence cannot leak as a path.
        buf = ''
        finish(new Error('rg failed to start'))
      }
      const handleClose = (code: number | null, signal: NodeJS.Signals | null): void => {
        if (signal) {
          // Why: a signal exit means timeout/OOM/external kill. Returning the
          // already-streamed prefix would recreate the false-empty bug this
          // path is meant to avoid.
          buf = ''
          finish(new Error(`rg killed by ${signal}`))
          return
        }
        if (buf && processLine(buf)) {
          buf = ''
          finishAtLimit()
          return
        }
        if (code === 0 || code === 1) {
          finish()
        } else if (code === 2 && parseablePathCount > 0) {
          // rg can return 2 for unreadable subdirectories while still listing
          // usable files from the rest of the root.
          finish()
        } else {
          finish(new Error(`rg exited with code ${code}`))
        }
      }
      const finish = (err?: Error): void => {
        if (done) {
          return
        }
        done = true
        clearTimeout(timer)
        // Why: child.kill() is advisory. If rg ignores it, detach our
        // closures so repeated Quick Open attempts do not retain old scans.
        child.stdout!.off('data', handleStdoutData)
        child.stderr!.off('data', handleStderrData)
        child.off('error', handleError)
        child.off('close', handleClose)
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      }

      children.push({ child, isDone: () => done, finish })

      child.stdout!.setEncoding('utf-8')
      child.stdout!.on('data', handleStdoutData)
      child.stderr!.on('data', handleStderrData)
      child.once('error', handleError)
      child.once('close', handleClose)
    })
  }

  const killSurvivors = (): void => {
    // Why: if one rg pass fails, Promise.all rejects immediately while the
    // sibling scan can keep walking a huge tree until timeout. Stop it so
    // repeated Quick Open attempts do not accumulate local rg processes.
    for (const entry of children) {
      if (entry.isDone()) {
        continue
      }
      entry.finish()
      if (entry.child.exitCode === null && entry.child.signalCode === null) {
        entry.child.kill()
      }
    }
  }

  function finishAtLimit(): void {
    for (const entry of children) {
      if (entry.isDone()) {
        continue
      }
      entry.finish()
      if (entry.child.exitCode === null && entry.child.signalCode === null) {
        entry.child.kill()
      }
    }
  }

  try {
    if (maxResults === undefined) {
      await Promise.all([runRg(primary), runRg(ignoredPass)])
    } else {
      // Why: ignored-file output can be much larger and faster than the primary
      // pass; let source files claim the bounded autocomplete budget first.
      await runRg(primary)
      if (files.size < maxResults) {
        await runRg(ignoredPass)
      }
    }
  } catch (err) {
    killSurvivors()
    throw err
  }
  return Array.from(files).slice(0, maxResults)
}

function getRgOutputMode(rawLine: string, rootPath: string): RgOutputMode {
  if (
    rawLine.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(rawLine) ||
    rawLine.startsWith('\\\\')
  ) {
    return { kind: 'absolute', rootPath }
  }
  return { kind: 'cwd-relative' }
}
