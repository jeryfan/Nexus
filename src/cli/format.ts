// 裁剪:
// - 删除 computer/project/terminal/workspace/status 各域 formatter 聚合与
//   computer-use 错误恢复数据（非 browser 命令域，未迁移）。
// - printResult 的 --json 输出直接序列化 RPC 信封。
// - runtime_unavailable 提示改为启动 Nexus app（打开 app 的 CLI 命令未迁移）。
import type { RuntimeRpcFailure, RuntimeRpcSuccess } from './runtime-client'
import { RuntimeClientError, RuntimeRpcFailureError } from './runtime/types'

export {
  formatBrowserProfileList,
  formatScreenshot,
  formatSnapshot,
  formatTabList,
  formatTabListWithProfiles,
  formatTabProfileClone,
  formatTabProfileShow,
  formatTabShow
} from './browser-format'

type CliErrorContext = {
  commandPath?: readonly string[]
}

export function printResult<TResult>(
  response: RuntimeRpcSuccess<TResult>,
  json: boolean,
  formatter: (value: TResult) => string
): void {
  if (json) {
    console.log(JSON.stringify(response, null, 2))
    return
  }
  console.log(formatter(response.result))
}

export function formatCliError(error: unknown, _context: CliErrorContext = {}): string {
  const message = error instanceof Error ? error.message : String(error)
  if (error instanceof RuntimeClientError && error.code === 'runtime_unavailable') {
    return `${message}\nNexus is not running. Start the Nexus app first.`
  }
  if (error instanceof RuntimeClientError) {
    const nextSteps = nextStepsFromData(error.data)
    if (nextSteps.length > 0) {
      return formatMessageWithNextSteps(message, nextSteps)
    }
  }
  if (
    error instanceof RuntimeRpcFailureError &&
    error.response.error.code === 'runtime_unavailable'
  ) {
    return `${message}\nNexus is not running. Start the Nexus app first.`
  }
  if (error instanceof RuntimeRpcFailureError) {
    return formatMessageWithNextSteps(message, nextStepsFromData(error.response.error.data))
  }
  return message
}

export function reportCliError(error: unknown, json: boolean, context: CliErrorContext = {}): void {
  if (json) {
    if (error instanceof RuntimeRpcFailureError) {
      console.log(JSON.stringify(error.response, null, 2))
    } else {
      const response: RuntimeRpcFailure = {
        id: 'local',
        ok: false,
        error: {
          code: error instanceof RuntimeClientError ? error.code : 'runtime_error',
          message: error instanceof Error ? error.message : String(error),
          data: localCliErrorData(error, context)
        },
        _meta: {
          runtimeId: null
        }
      }
      console.log(JSON.stringify(response, null, 2))
    }
  } else {
    console.error(formatCliError(error, context))
  }
}

function formatMessageWithNextSteps(message: string, nextSteps: readonly string[]): string {
  if (nextSteps.length === 0) {
    return message
  }
  return `${message}\n${nextSteps.map((step) => `Next step: ${step}`).join('\n')}`
}

function nextStepsFromData(data: unknown): string[] {
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { nextSteps?: unknown }).nextSteps)
  ) {
    return (data as { nextSteps: unknown[] }).nextSteps.filter(
      (step): step is string => typeof step === 'string'
    )
  }
  return []
}

function localCliErrorData(error: unknown, _context: CliErrorContext): unknown {
  if (error instanceof RuntimeClientError && error.data !== undefined) {
    return error.data
  }
  return undefined
}
