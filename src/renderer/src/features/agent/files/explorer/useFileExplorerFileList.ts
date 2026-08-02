import { useEffect, useRef, useState } from 'react'
import { listFiles } from '../fsClient'

export type FileListState = {
  files: string[]
  loading: boolean
  loadError: string | null
}

/**
 * Name-filter data source (orca `useRuntimeFileListForWorktree`, adapted):
 * recursively lists root-relative file paths via `fsClient.listFiles`.
 * Local-only, so orca's operation-owner routing, nested-worktree exclusion,
 * and host-side cancel token are dropped.
 */
export function useFileExplorerFileList({
  enabled,
  rootPath
}: {
  enabled: boolean
  rootPath: string | null
}): FileListState {
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const lastRequestKeyRef = useRef('')

  const requestKey = rootPath ?? ''

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    if (!rootPath) {
      setFiles([])
      setLoadError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    const requestKeyChanged = lastRequestKeyRef.current !== requestKey
    if (requestKeyChanged) {
      setFiles([])
    }
    lastRequestKeyRef.current = requestKey
    setLoadError(null)
    setLoading(true)

    listFiles(rootPath)
      .then((result) => {
        if (!cancelled) {
          setFiles(result)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFiles([])
          setLoadError(error instanceof Error ? error.message : String(error))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled, rootPath, requestKey])

  return { files, loading, loadError }
}
