// 裁剪:
// - pairing / clientId / pairedDeviceId / clientKind（mobile 设备配对域）
// - registerBinaryStreamHandler（terminal-stream-protocol，mobile 终端二进制帧域）
import type { RuntimeCapability } from '../../../shared/browser/protocol-version'

export type RpcDispatchStreamingOptions = {
  connectionId?: string
  signal?: AbortSignal
  clientCapabilities?: readonly RuntimeCapability[]
  sendBinary?: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
}
