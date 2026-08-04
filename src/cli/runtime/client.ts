// 裁剪:
// - 远程配对 / WebSocket 回退整段删除（配对与 environment 相关 env 变量、
//   sendWebSocketRequest、environments、protocol-compat 版本协商）——
//   Nexus CLI 本地只走 unix socket / named pipe。
// - orchestration 信封 / contract 检查 / mutation recovery（orchestration 命令域）。
// - status/open/launch（core 命令域，未迁移）。
// - terminal.wait / orchestration.check 的 long-poll 客户端宽限（非 browser 命令域；
//   browser.wait 等仍可通过 call() 的 options.timeoutMs 显式放宽）。
// 本地元数据读取 → sendRequest → RuntimeRpcFailureError 主链原样保留。
import { getDefaultUserDataPath, readMetadata } from './metadata'
import { sendRequest } from './transport'
import { RuntimeRpcFailureError, type RuntimeRpcSuccess } from './types'

export class RuntimeClient {
  private readonly userDataPath: string
  private readonly requestTimeoutMs: number

  // Why: browser commands trigger first-time session init (agent-browser connect +
  // CDP proxy setup) which can take 15-30s. 60s accommodates cold start without
  // being so large that genuine hangs go unnoticed.
  constructor(userDataPath = getDefaultUserDataPath(), requestTimeoutMs = 60_000) {
    this.userDataPath = userDataPath
    this.requestTimeoutMs = requestTimeoutMs
  }

  async call<TResult>(
    method: string,
    params?: unknown,
    options?: { timeoutMs?: number }
  ): Promise<RuntimeRpcSuccess<TResult>> {
    const effectiveTimeoutMs = options?.timeoutMs ?? this.requestTimeoutMs
    const metadata = readMetadata(this.userDataPath)
    const response = await sendRequest<TResult>(metadata, method, params, effectiveTimeoutMs)
    if (response.ok === false) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  }
}
