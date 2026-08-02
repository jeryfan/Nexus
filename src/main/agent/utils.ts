import type { UserMessageDto } from '@shared/agent/types'

/** 提取 user 消息纯文本（content 可能是 string 或 parts 数组）。 */
export function extractUserText(content: UserMessageDto['content']): string {
  if (typeof content === 'string') return content
  return content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('')
}
