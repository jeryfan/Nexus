// 裁剪:
// - orchestration 编排域（orchestration-mutation-executor / orchestration-contract-fence /
//   orchestration-legacy-compatibility、migrationFence、ctx 中的 orchestration*/legacyCoordinator* 注入）
// - emulator 域（emulator-probe 探针）
// - feature-interactions 域（recordRuntimeFeatureInteraction 埋点）
import {
  buildRegistry,
  formatZodError,
  isStreamingMethod,
  type RpcAnyMethod,
  type RpcEnvelopeMeta,
  type RpcRegistry,
  type RpcRequest,
  type RpcResponse
} from './core'

import { errorResponse, successResponse } from './errors'
import { ALL_RPC_METHODS } from './methods'
import type { NexusRuntimeService } from '../NexusRuntimeService'
import type { RpcDispatchStreamingOptions } from './dispatcher-stream-options'
import { invalidArgumentResponse, mapDispatcherError } from './dispatcher-error-response'

export type DispatcherOptions = { runtime: NexusRuntimeService; methods?: readonly RpcAnyMethod[] }

export class RpcDispatcher {
  private readonly runtime: NexusRuntimeService
  private readonly registry: RpcRegistry

  constructor({ runtime, methods = ALL_RPC_METHODS }: DispatcherOptions) {
    this.runtime = runtime
    this.registry = buildRegistry(methods)
  }

  async dispatch(request: RpcRequest, options?: { signal?: AbortSignal }): Promise<RpcResponse> {
    const meta = this.meta()
    const method = this.registry.get(request.method)
    if (!method) {
      return errorResponse(
        request.id,
        meta,
        'method_not_found',
        `Unknown method: ${request.method}`
      )
    }

    const parsedParams = this.parseParams(request, method, meta)
    if (parsedParams.error) {
      return parsedParams.error
    }

    if (isStreamingMethod(method)) {
      return errorResponse(
        request.id,
        meta,
        'method_not_supported',
        `Method ${request.method} requires a streaming transport`
      )
    }

    try {
      const result = await method.handler(parsedParams.value, {
        runtime: this.runtime,
        signal: options?.signal,
        requestId: request.id
      })
      return successResponse(request.id, meta, result)
    } catch (error) {
      return mapDispatcherError(request, meta, error)
    }
  }

  // Why: streaming dispatch sends multiple responses through the reply callback
  // instead of returning a single Promise. This enables terminal.subscribe and
  // other subscription-style methods that push data over time.
  async dispatchStreaming(
    request: RpcRequest,
    reply: (response: string) => void,
    options?: RpcDispatchStreamingOptions
  ): Promise<void> {
    const meta = this.meta()
    const method = this.registry.get(request.method)
    if (!method) {
      reply(
        JSON.stringify(
          errorResponse(request.id, meta, 'method_not_found', `Unknown method: ${request.method}`)
        )
      )
      return
    }

    const parsedParams = this.parseParams(request, method, meta)
    if (parsedParams.error) {
      reply(JSON.stringify(parsedParams.error))
      return
    }

    if (!isStreamingMethod(method)) {
      try {
        const result = await method.handler(parsedParams.value, {
          runtime: this.runtime,
          signal: options?.signal,
          requestId: request.id,
          connectionId: options?.connectionId,
          clientCapabilities: options?.clientCapabilities,
          sendBinary: options?.sendBinary
        })
        reply(JSON.stringify(successResponse(request.id, meta, result)))
      } catch (error) {
        reply(JSON.stringify(mapDispatcherError(request, meta, error)))
      }
      return
    }

    const emit = (result: unknown): void => {
      const response = successResponse(request.id, meta, result)
      response.streaming = true
      reply(JSON.stringify(response))
    }

    try {
      await method.handler(
        parsedParams.value,
        {
          runtime: this.runtime,
          signal: options?.signal,
          requestId: request.id,
          connectionId: options?.connectionId,
          clientCapabilities: options?.clientCapabilities,
          sendBinary: options?.sendBinary
        },
        emit
      )
    } catch (error) {
      reply(JSON.stringify(mapDispatcherError(request, meta, error)))
    }
  }

  private parseParams(
    request: RpcRequest,
    method: RpcAnyMethod,
    meta: RpcEnvelopeMeta
  ): { value: unknown; error?: undefined } | { value?: undefined; error: RpcResponse } {
    if (method.params === null) {
      return { value: undefined }
    }
    const rawParams = request.params ?? {}
    const result = method.params.safeParse(rawParams)
    if (!result.success) {
      return {
        error: invalidArgumentResponse(request, meta, formatZodError(result.error))
      }
    }
    return { value: result.data }
  }

  private meta(): RpcEnvelopeMeta {
    return { runtimeId: this.runtime.getRuntimeId() }
  }
}
