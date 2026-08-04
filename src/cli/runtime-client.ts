// 裁剪: barrel 删除 app serve/launch 入口（open/serve
// 命令域，未迁移）。
// Why: the runtime client used to live here as a single file. It was split
// into ./runtime/{types,metadata,transport,client}.ts so each concern can be
// tested in isolation. This barrel preserves the original import surface so
// call sites (src/cli/index.ts, tests) remain unchanged.
export {
  RuntimeClient,
  RuntimeClientError,
  RuntimeRpcFailureError,
  getDefaultUserDataPath,
  type RuntimeRpcFailure,
  type RuntimeRpcResponse,
  type RuntimeRpcSuccess
} from './runtime/index'
