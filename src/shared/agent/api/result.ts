/**
 * Agent 数据面统一信封与错误类型（本地/云端共用）。
 *
 * 约定：
 * - `code = 0` 成功，`msg = 'ok'`；非零为错误码，`msg` 为可读错误信息
 * - 信封只存在于服务边界（AgentApiService 的返回值）；服务实现内部可用任意
 *   传输格式，由适配器在一处转换
 * - 需要异常流时使用 {@link unwrap}；需要显式处理错误码时直接判断 code
 */

export interface ApiResult<T> {
  code: number
  msg: string
  data: T
}

/** 统一错误码（与服务端 HTTP 语义一致：200 成功，其余按 HTTP 语义） */
export const ApiCode = {
  OK: 200,
  /** 未认证/凭证失效 */
  UNAUTHORIZED: 401,
  /** 无权限 */
  FORBIDDEN: 403,
  /** 资源不存在 */
  NOT_FOUND: 404,
  /** 状态冲突（如生成中执行了不允许的操作） */
  CONFLICT: 409,
  /** 输入校验失败 */
  VALIDATION: 422,
  /** 服务内部错误 */
  INTERNAL: 500
} as const

export class ApiError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }

  toResult<T = never>(): ApiResult<T> {
    return { code: this.code, msg: this.message, data: undefined as T }
  }

  static from(error: unknown, fallbackCode: number = ApiCode.INTERNAL): ApiError {
    if (error instanceof ApiError) return error
    return new ApiError(fallbackCode, error instanceof Error ? error.message : String(error))
  }
}

export function ok<T>(data: T): ApiResult<T> {
  return { code: ApiCode.OK, msg: 'ok', data }
}

export function err<T = never>(code: number, msg: string): ApiResult<T> {
  return { code, msg, data: undefined as T }
}

/** 信封 → 数据或抛 ApiError（异常流入口） */
export function unwrap<T>(result: ApiResult<T>): T {
  if (result.code !== ApiCode.OK) {
    throw new ApiError(result.code, result.msg)
  }
  return result.data
}
