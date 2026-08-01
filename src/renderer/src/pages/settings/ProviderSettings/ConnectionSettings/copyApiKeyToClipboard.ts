import { loggerService } from '@logger'
import { toast } from '@renderer/services/toast'

const logger = loggerService.withContext('copyApiKeyToClipboard')

export async function copyApiKeyToClipboard(apiKey: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(apiKey)
    toast.success('已复制')
  } catch (error) {
    logger.warn('Failed to copy API key to clipboard', error as Error)
    toast.error('复制失败')
  }
}

