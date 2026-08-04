// 裁剪: 删除 orchestration 兼容性证据脱敏
// （redactOrchestrationCompatibilitySecrets，orchestration 命令域，未迁移），
// RuntimeClientError.data 原样透传。
import type { RuntimeRpcFailure } from '../../shared/browser/runtime-rpc-envelope'

export type {
  RuntimeRpcFailure,
  RuntimeRpcResponse,
  RuntimeRpcSuccess
} from '../../shared/browser/runtime-rpc-envelope'

export class RuntimeClientError extends Error {
  readonly code: string
  // Why: optional structured recovery payload (e.g. did-you-mean suggestions,
  // valid-flag enumeration) surfaced into both the human and --json error output.
  readonly data?: unknown

  constructor(code: string, message: string, data?: unknown) {
    super(message)
    this.code = code
    this.data = data
  }
}

export class RuntimeRpcFailureError extends RuntimeClientError {
  readonly response: RuntimeRpcFailure

  constructor(response: RuntimeRpcFailure) {
    // Why: all client errors expose recovery through the same inherited channel.
    super(response.error.code, response.error.message, response.error.data)
    this.response = {
      ...response,
      error: {
        ...response.error,
        ...(response.error.data === undefined ? {} : { data: this.data })
      }
    }
  }
}
