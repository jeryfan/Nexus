// 裁剪:
// - WebSocket 传输与静态 web client（ws-transport / ws-fallback-port-store / webClientRoot /
//   DEFAULT_WS_PORT / wsPort / preferPinnedWsPort）；构造参数保留 enableWebSocket 以保持构造签名
//   兼容，Nexus 恒传 false，传 true 时仅告警并继续仅提供本地 socket
// - mobile/relay 配对域（DeviceRegistry / e2ee-keypair / MobileSocketWiring /
//   UnpairedDeviceAuthThrottle / RelayRevokeOutbox / pairing-endpoint / pairing offer 全套
//   方法与类型、MOBILE_RPC_METHOD_ALLOWLIST、injectDeviceScope、handleWebSocketMessage）
// - terminal-stream-protocol 二进制帧路由（binaryStreamHandlers / handleWebSocketBinaryMessage /
//   registerWebSocketDispatchAbort / abortWebSocketDispatches）
// 保留 unix/named-pipe 通道的完整安全边界：randomBytes token、socket chmod 0o600、
// 元数据 0o600、keepalive、long-poll 准入、孤儿 socket 清扫、元数据所有权监视。
// Why: the single security boundary for the bundled CLI — auth-token enforcement, metadata publication, transport orchestration.
import { randomBytes } from 'node:crypto'
import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type {
  RuntimeMetadata,
  RuntimeTransportMetadata
} from '../../shared/browser/runtime-bootstrap'
import type { NexusRuntimeService } from './NexusRuntimeService'
import { writeRuntimeMetadata } from './runtime-metadata'
import {
  RUNTIME_METADATA_OWNERSHIP_POLL_MS,
  watchRuntimeMetadataOwnership,
  type RuntimeMetadataOwnershipWatch
} from './runtime-metadata-ownership-watch'
import { RpcDispatcher } from './rpc/dispatcher'
import type { RpcRequest, RpcResponse } from './rpc/core'
import { errorResponse } from './rpc/errors'
import type { RpcMessageContext, RpcTransport } from './rpc/transport'
import { UnixSocketTransport } from './rpc/unix-socket-transport'

type NexusRuntimeRpcServerOptions = {
  runtime: NexusRuntimeService
  userDataPath: string
  pid?: number
  platform?: NodeJS.Platform
  enableWebSocket?: boolean
  // Why: test-only overrides for the two constants below; production must not pass these (defaults set by §3.1).
  keepaliveIntervalMs?: number
  longPollCap?: number
  // Why: test-only override for the ownership reclaim cadence.
  metadataOwnershipPollMs?: number
}

// Why: keepalive frames count as socket activity, resetting both idle timers so long-polls outlive the 30s/60s idle caps. See §3.1.
const KEEPALIVE_INTERVAL_MS = 10_000

// Why: cap long-polls at half the 32-slot connection budget so they can't starve short RPCs; overflow → runtime_busy. See §7 risk #2.
const LONG_POLL_CAP = 16

// Why: orchestration.ask blocks on a human/agent reply for minutes, an order of
// magnitude longer than terminal.wait or check --wait, so a fleet of asking
// workers would otherwise hold every slot and starve the mobile/web/CLI/relay
// clients sharing this runtime. Reserve half the budget for the other classes.
const ASK_LONG_POLL_SHARE = 0.5

// Why: 'ask' is metered separately from 'wait' — same keepalive/abort wiring, its own sub-cap.
type LongPollClass = 'ask' | 'wait'

// Why: single classifier for long-poll requests (handlers that block on an external event), shared by counter/abort/keepalive. See §3.1.
function longPollClassOf(request: RpcRequest): LongPollClass | null {
  if (request.method === 'terminal.wait') {
    return 'wait'
  }
  // Why: orchestration.ask blocks unconditionally (default 600 s) holding the
  // RPC open until a reply lands or the deadline passes, so it needs the same
  // keepalive as check --wait or the 30 s socket idle timer tears it down. It
  // also relies on the abort signal (only wired for long-polls) to release the
  // waiter when the asking client disconnects.
  if (request.method === 'orchestration.ask') {
    return 'ask'
  }
  if (request.method === 'orchestration.check') {
    const params = request.params as { wait?: unknown } | undefined
    return params?.wait === true ? 'wait' : null
  }
  return null
}

export class NexusRuntimeRpcServer {
  private readonly runtime: NexusRuntimeService
  private readonly dispatcher: RpcDispatcher
  private readonly userDataPath: string
  private readonly pid: number
  private readonly platform: NodeJS.Platform
  private readonly enableWebSocket: boolean
  private readonly authToken = randomBytes(24).toString('hex')
  private readonly keepaliveIntervalMs: number
  private readonly longPollCap: number
  private readonly metadataOwnershipPollMs: number
  private readonly askLongPollCap: number
  private activeTransports: RpcTransport[] = []
  private transports: RuntimeTransportMetadata[] = []
  private metadataOwnershipWatch: RuntimeMetadataOwnershipWatch | null = null
  // Why: separate from server.maxConnections — count only long-running dispatches, not short RPCs. See §3.1 + §7 risk #2.
  private activeLongPolls = 0
  // Why: subset of activeLongPolls held by orchestration.ask, fenced by askLongPollCap.
  private activeAskLongPolls = 0

  constructor({
    runtime,
    userDataPath,
    pid = process.pid,
    platform = process.platform,
    enableWebSocket = false,
    keepaliveIntervalMs = KEEPALIVE_INTERVAL_MS,
    longPollCap = LONG_POLL_CAP,
    metadataOwnershipPollMs = RUNTIME_METADATA_OWNERSHIP_POLL_MS
  }: NexusRuntimeRpcServerOptions) {
    this.runtime = runtime
    this.dispatcher = new RpcDispatcher({ runtime })
    this.userDataPath = userDataPath
    this.pid = pid
    this.platform = platform
    this.enableWebSocket = enableWebSocket
    this.keepaliveIntervalMs = keepaliveIntervalMs
    this.longPollCap = longPollCap
    this.metadataOwnershipPollMs = metadataOwnershipPollMs
    // Why: derived, not configurable — the reservation must hold for whatever cap a caller picks.
    this.askLongPollCap = Math.max(1, Math.floor(longPollCap * ASK_LONG_POLL_SHARE))
  }

  async start(): Promise<void> {
    if (this.activeTransports.length > 0) {
      return
    }

    // Why: SIGKILL/OOM skip stop(), orphaning `o-<pid>-*.sock` files; sweep them. Skipped on Windows: named pipes leave no filesystem entries.
    if (this.platform !== 'win32') {
      sweepOrphanedRuntimeSockets(this.userDataPath, this.pid)
    }

    const transportMeta = createRuntimeTransportMetadata(
      this.userDataPath,
      this.pid,
      this.platform,
      this.runtime.getRuntimeId()
    )

    const socketTransport = new UnixSocketTransport({
      endpoint: transportMeta.endpoint,
      kind: transportMeta.kind as 'unix' | 'named-pipe',
      keepaliveIntervalMs: this.keepaliveIntervalMs
    })

    // Why: the `.catch` guarantees reply() always fires so a throw can't strand the client or leak the AbortController.
    socketTransport.onMessage((msg, reply, context) => {
      void this.handleMessage(msg, context)
        .then((response) => {
          reply(JSON.stringify(response))
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          // Why: best-effort id recovery so the client can correlate the error frame to its pending request.
          let id = 'unknown'
          try {
            const parsed = JSON.parse(msg) as { id?: unknown }
            if (typeof parsed.id === 'string' && parsed.id.length > 0) {
              id = parsed.id
            }
          } catch {
            // ignore — fall through with id='unknown'
          }
          reply(JSON.stringify(this.buildError(id, 'internal_error', message)))
        })
    })

    await socketTransport.start()

    const activeTransports: RpcTransport[] = [socketTransport]
    const transportsMeta: RuntimeTransportMetadata[] = [transportMeta]

    // Why: Nexus keeps the enableWebSocket option for constructor-signature
    // compatibility, but the WebSocket/mobile/relay transport stack is not
    // migrated; the runtime serves the bundled CLI over the local socket only.
    if (this.enableWebSocket) {
      console.warn(
        '[runtime] WebSocket transport is not available in Nexus; serving the local socket only.'
      )
    }

    // Why: set in-memory transport state before writing metadata so the bootstrap file has the real endpoint/token pair.
    this.activeTransports = activeTransports
    this.transports = transportsMeta

    try {
      this.writeMetadata()
    } catch (error) {
      // Why: a runtime that can't publish metadata is invisible to the CLI — close transports rather than run undiscoverable.
      this.activeTransports = []
      this.transports = []
      await Promise.all(activeTransports.map((t) => t.stop().catch(() => {}))).catch(() => {})
      throw error
    }

    this.metadataOwnershipWatch = watchRuntimeMetadataOwnership({
      userDataPath: this.userDataPath,
      ownedPid: this.pid,
      ownedRuntimeId: this.runtime.getRuntimeId(),
      pollIntervalMs: this.metadataOwnershipPollMs,
      republish: () => {
        // Why: never advertise endpoints we already tore down.
        if (this.activeTransports.length === 0) {
          return
        }
        this.writeMetadata()
      },
      onReclaim: (previous) => {
        console.warn(
          `[runtime] Reclaimed nexus-runtime.json from a dead runtime (pid ${previous?.pid ?? 'none'}); republished pid ${this.pid}.`
        )
      }
    })
  }

  /** Why: test-only seam — runs one ownership check instead of waiting out the poll interval. */
  checkRuntimeMetadataOwnership(): void {
    this.metadataOwnershipWatch?.check()
  }

  async stop(): Promise<void> {
    const transports = this.activeTransports
    this.activeTransports = []
    this.transports = []
    this.metadataOwnershipWatch?.stop()
    this.metadataOwnershipWatch = null
    if (transports.length === 0) {
      return
    }
    await Promise.all(transports.map((t) => t.stop()))
    // Why: leave the metadata file on shutdown — shared userData may host another live runtime whose bootstrap file we'd erase.
  }

  // Why: Unix socket dispatch is one-shot and auths via the shared token from the 0o600 metadata file. See §3.1.
  private async handleMessage(
    rawMessage: string,
    context?: RpcMessageContext
  ): Promise<RpcResponse> {
    // Why: the transport sends an empty message when a client exceeds max size, then closes the connection.
    if (!rawMessage) {
      return this.buildError('unknown', 'request_too_large', 'RPC request exceeds the maximum size')
    }

    const parsed = this.parseAndAuth(rawMessage)
    if ('error' in parsed) {
      return parsed.error
    }
    const request = parsed.request

    // Why: long-poll admission fence; short RPCs bypass the counter. See §7 risk #2.
    const longPoll = longPollClassOf(request)
    const rejection = this.admitLongPoll(longPoll)
    if (rejection) {
      return this.buildError(request.id, 'runtime_busy', rejection)
    }
    if (longPoll) {
      // Why: arm keepalive only for long-polls; short RPCs never create the setInterval. See §3.1.
      context?.startKeepalive()
    }

    try {
      return await this.dispatcher.dispatch(request, {
        signal: longPoll ? context?.signal : undefined
      })
    } finally {
      this.releaseLongPoll(longPoll)
    }
  }

  // Why: one fence for both transports — the total cap protects short RPCs, the ask
  // sub-cap protects terminal.wait / check --wait from slow reply-blocked asks.
  // Returns the rejection message, or null once the slot is reserved.
  private admitLongPoll(longPoll: LongPollClass | null): string | null {
    if (!longPoll) {
      return null
    }
    if (this.activeLongPolls >= this.longPollCap) {
      return 'long-poll capacity reached; retry with backoff'
    }
    if (longPoll === 'ask' && this.activeAskLongPolls >= this.askLongPollCap) {
      return 'orchestration.ask capacity reached; retry with backoff'
    }
    this.activeLongPolls += 1
    if (longPoll === 'ask') {
      this.activeAskLongPolls += 1
    }
    return null
  }

  private releaseLongPoll(longPoll: LongPollClass | null): void {
    if (!longPoll) {
      return
    }
    this.activeLongPolls = Math.max(0, this.activeLongPolls - 1)
    if (longPoll === 'ask') {
      this.activeAskLongPolls = Math.max(0, this.activeAskLongPolls - 1)
    }
  }

  private parseAndAuth(rawMessage: string): { request: RpcRequest } | { error: RpcResponse } {
    let request: RpcRequest
    try {
      request = JSON.parse(rawMessage) as RpcRequest
    } catch {
      return { error: this.buildError('unknown', 'bad_request', 'Invalid JSON request') }
    }

    if (typeof request.id !== 'string' || request.id.length === 0) {
      return { error: this.buildError('unknown', 'bad_request', 'Missing request id') }
    }
    if (typeof request.method !== 'string' || request.method.length === 0) {
      return { error: this.buildError(request.id, 'bad_request', 'Missing RPC method') }
    }
    if (typeof request.authToken !== 'string' || request.authToken.length === 0) {
      return { error: this.buildError(request.id, 'unauthorized', 'Missing auth token') }
    }
    if (request.authToken !== this.authToken) {
      return { error: this.buildError(request.id, 'unauthorized', 'Invalid auth token') }
    }

    return { request }
  }

  private buildError(id: string, code: string, message: string): RpcResponse {
    return errorResponse(id, { runtimeId: this.runtime.getRuntimeId() }, code, message)
  }

  private writeMetadata(): void {
    const metadata: RuntimeMetadata = {
      runtimeId: this.runtime.getRuntimeId(),
      pid: this.pid,
      transports: this.transports,
      authToken: this.authToken,
      startedAt: this.runtime.getStartedAt()
    }
    writeRuntimeMetadata(this.userDataPath, metadata)
  }
}

/** Why: MUST stay in lockstep with createRuntimeTransportMetadata()'s `o-${pid}-${suffix}.sock` shape (unit-test enforced). */
export const RUNTIME_SOCKET_NAME_REGEX = /^o-(\d+)-[A-Za-z0-9_-]+\.sock$/

export function sweepOrphanedRuntimeSockets(userDataPath: string, ownPid: number): void {
  let entries: string[]
  try {
    entries = readdirSync(userDataPath)
  } catch {
    // Why: first-launch userData may not exist yet; nothing to sweep.
    return
  }
  for (const entry of entries) {
    const match = RUNTIME_SOCKET_NAME_REGEX.exec(entry)
    if (!match) {
      continue
    }
    const pid = Number(match[1])
    if (!Number.isFinite(pid)) {
      continue
    }
    // Why: never delete our own socket — a bug here would rmSync one we're about to bind.
    if (pid === ownPid) {
      continue
    }
    try {
      // Why: signal 0 is the POSIX liveness probe (sends nothing); ESRCH = dead pid, EPERM = foreign owner (left alone).
      process.kill(pid, 0)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        try {
          rmSync(join(userDataPath, entry), { force: true })
        } catch {
          // Why: best-effort sweep; a later start() or OS reboot cleans any socket we can't unlink.
        }
      }
    }
  }
}

export function createRuntimeTransportMetadata(
  userDataPath: string,
  pid: number,
  platform: NodeJS.Platform,
  runtimeId = 'runtime'
): RuntimeTransportMetadata {
  const endpointSuffix = runtimeId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 4) || 'rt'
  if (platform === 'win32') {
    return {
      kind: 'named-pipe',
      // Why: named pipes lack the chmod hardening of Unix sockets; a per-runtime suffix avoids a stable, guessable endpoint name.
      endpoint: `\\\\.\\pipe\\nexus-${pid}-${endpointSuffix}`
    }
  }
  return {
    kind: 'unix',
    endpoint: join(userDataPath, `o-${pid}-${endpointSuffix}.sock`)
  }
}
