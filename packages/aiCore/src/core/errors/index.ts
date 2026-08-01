export class AiCoreError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly context?: Record<string, unknown>,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'AiCoreError'
  }
}

export class ModelResolutionError extends AiCoreError {
  constructor(modelId: string, providerId: string, cause?: Error) {
    super(
      'MODEL_RESOLUTION_FAILED',
      `Failed to resolve model: ${modelId}`,
      { modelId, providerId },
      cause
    )
    this.name = 'ModelResolutionError'
  }
}
