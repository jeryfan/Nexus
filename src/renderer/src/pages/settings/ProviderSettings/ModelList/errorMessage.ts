import {
  ErrorCode,
  isDataApiError,
  isSerializedDataApiError,
  toDataApiError
} from '@shared/data/api/errors'

const MODEL_REFERENCED_BY_HISTORICAL_DATA_REASON = 'model is still referenced by historical data'

interface ModelOperationErrorMessages {
  fallback: string
  modelReferencedByHistoricalData: string
}

function getInvalidOperationReason(details: unknown): string | undefined {
  if (typeof details !== 'object' || details === null || !('reason' in details)) {
    return undefined
  }
  return typeof details.reason === 'string' ? details.reason : undefined
}

export function getModelOperationErrorMessage(
  error: unknown,
  messages: ModelOperationErrorMessages
): string {
  if (isDataApiError(error) || isSerializedDataApiError(error)) {
    const dataError = toDataApiError(error)
    if (
      dataError.code === ErrorCode.INVALID_OPERATION &&
      getInvalidOperationReason(dataError.details) === MODEL_REFERENCED_BY_HISTORICAL_DATA_REASON
    ) {
      return messages.modelReferencedByHistoricalData
    }

    if (
      dataError.code === ErrorCode.INVALID_OPERATION ||
      dataError.code === ErrorCode.CONFLICT ||
      dataError.code === ErrorCode.NOT_FOUND
    ) {
      return dataError.message
    }
  }

  return messages.fallback
}
