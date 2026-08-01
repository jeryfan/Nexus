/**
 * API Handlers Index
 *
 * Combines all domain-specific handlers into a unified apiHandlers object.
 * TypeScript will error if any endpoint from ApiSchemas is missing.
 *
 * Handler files are organized by the retained model-service domains:
 * - models.ts - Model API handlers
 * - providers.ts - Provider API handlers
 */

import type { ApiImplementation } from '@shared/data/api/types'

import { modelHandlers } from './models'
import { providerHandlers } from './providers'

/**
 * Complete API handlers implementation
 * Must implement every path+method combination from ApiSchemas
 *
 * Handlers are spread from individual domain modules for maintainability.
 * TypeScript ensures exhaustive coverage - missing handlers cause compile errors.
 */
export const apiHandlers: ApiImplementation = {
  ...modelHandlers,
  ...providerHandlers
}
