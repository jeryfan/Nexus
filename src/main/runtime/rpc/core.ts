// RpcContext.runtime 为 NexusRuntimeService（浏览器方法宿主）。
// 裁剪:
// - PairingRpcContext + RpcContext.pairing（mobile relay 配对域）
// - RpcContext.registerBinaryStreamHandler（terminal-stream-protocol，mobile 终端二进制帧域）
// - RpcContext/RpcRequest 的 orchestration* 与 legacyCoordinator* 字段
//   （orchestration 多 worker 编排域，依赖未迁移的 orchestration-compatibility-evidence）
// - RpcContext.clientId/pairedDeviceId/clientKind（mobile 设备身份域）
// Why: single boundary between raw RPC frames and the runtime service; keeps schema, handler, and result type on one object.
import { ZodError, type ZodType } from 'zod'
import type { NexusRuntimeService } from '../NexusRuntimeService'
import type { RuntimeCapability } from '../../../shared/browser/protocol-version'

export type RpcEnvelopeMeta = {
  runtimeId: string
}

export type RpcSuccess = {
  id: string
  ok: true
  result: unknown
  streaming?: true
  _meta: RpcEnvelopeMeta
}

export type RpcFailure = {
  id: string
  ok: false
  error: {
    code: string
    message: string
    data?: unknown
  }
  _meta: RpcEnvelopeMeta
}

export type RpcResponse = RpcSuccess | RpcFailure

export type RpcRequest = {
  id: string
  authToken: string
  method: string
  params?: unknown
}

export type RpcContext = {
  runtime: NexusRuntimeService
  // Why: lets long-poll handlers release immediately on client disconnect instead of running down timeoutMs. See design doc §3.1.
  signal?: AbortSignal
  // Why: per-WebSocket key so the server reaps a closing socket's subscriptions without touching sibling sockets sharing the deviceToken.
  connectionId?: string
  // Why: shared-control multiplexes many logical streams over one socket; the frame id lets handlers register cleanup per logical stream.
  requestId?: string
  // Why: negotiation is bound to the authenticated socket, never asserted by a destructive request.
  clientCapabilities?: readonly RuntimeCapability[]
  // Why: screencast frames ride the binary channel; undefined on the Unix/socket path.
  sendBinary?: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
}

export type RpcHandler<TParams> = (params: TParams, ctx: RpcContext) => Promise<unknown> | unknown

// Why: RpcMethod erases the param type; centralizing the cast in defineMethod sidesteps RpcHandler's contravariance.
export type RpcMethod = {
  readonly name: string
  readonly params: ZodType | null
  readonly handler: (params: unknown, ctx: RpcContext) => Promise<unknown> | unknown
}

type DefineMethodSpec<TSchema extends ZodType | null> = {
  name: string
  params: TSchema
  handler: RpcHandler<TSchema extends ZodType ? TSchema['_output'] : void>
}

export function defineMethod<TSchema extends ZodType | null>(
  spec: DefineMethodSpec<TSchema>
): RpcMethod {
  return {
    name: spec.name,
    params: spec.params,
    handler: spec.handler as RpcMethod['handler']
  }
}

export type RpcStreamingHandler<TParams> = (
  params: TParams,
  ctx: RpcContext,
  emit: (result: unknown) => void
) => Promise<void>

// Why: the `stream` flag lets the dispatcher route these to the emit-based path instead of the one-shot Promise path.
export type RpcStreamingMethod = {
  readonly name: string
  readonly params: ZodType | null
  readonly stream: true
  readonly handler: (
    params: unknown,
    ctx: RpcContext,
    emit: (result: unknown) => void
  ) => Promise<void>
}

type DefineStreamingMethodSpec<TSchema extends ZodType | null> = {
  name: string
  params: TSchema
  handler: RpcStreamingHandler<TSchema extends ZodType ? TSchema['_output'] : void>
}

export function defineStreamingMethod<TSchema extends ZodType | null>(
  spec: DefineStreamingMethodSpec<TSchema>
): RpcStreamingMethod {
  return {
    name: spec.name,
    params: spec.params,
    stream: true,
    handler: spec.handler as RpcStreamingMethod['handler']
  }
}

export type RpcAnyMethod = RpcMethod | RpcStreamingMethod

export function isStreamingMethod(method: RpcAnyMethod): method is RpcStreamingMethod {
  return 'stream' in method && method.stream === true
}

export type RpcRegistry = ReadonlyMap<string, RpcAnyMethod>

export function buildRegistry(methods: readonly RpcAnyMethod[]): RpcRegistry {
  const registry = new Map<string, RpcAnyMethod>()
  for (const method of methods) {
    if (registry.has(method.name)) {
      throw new Error(`duplicate_rpc_method:${method.name}`)
    }
    registry.set(method.name, method)
  }
  return registry
}

export class InvalidArgumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidArgumentError'
  }
}

// Why: CLI surfaces one string; take the first issue's message, which each schema authors as the user-facing phrasing.
export function formatZodError(error: ZodError): string {
  const first = error.issues[0]
  return first?.message ?? 'invalid_argument'
}

export { ZodError }
