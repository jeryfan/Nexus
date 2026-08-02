import { stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

import { shell } from 'electron'

/** Artifact (agent-produced file) actions, with a workspace-containment guard. */
export class ArtifactService {
  /**
   * Open a produced file with the system default application. The target must
   * resolve inside the session's workspace — a renderer-supplied path could
   * otherwise point anywhere on disk (defends `..` escapes and absolute paths).
   */
  async open(sessionCwd: string, targetPath: string): Promise<void> {
    const root = resolve(sessionCwd)
    const resolved = resolve(root, targetPath)
    if (resolved !== root && !resolved.startsWith(root + sep)) {
      throw new Error(`Path escapes session workspace: ${targetPath}`)
    }
    await stat(resolved)
    const openError = await shell.openPath(resolved)
    if (openError) {
      throw new Error(`Failed to open ${resolved}: ${openError}`)
    }
  }
}
