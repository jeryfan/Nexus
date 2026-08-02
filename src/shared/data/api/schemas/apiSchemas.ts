/**
 * Schema Index - Composes all domain schemas into unified ApiSchemas
 *
 * This file has ONE responsibility: compose domain schemas into ApiSchemas.
 *
 * Import conventions (see api/README.md for details):
 * - Infrastructure types: import directly from their module (types / paths / errors)
 * - Domain DTOs: import directly from the model/provider schema files
 *
 * @example
 * ```typescript
 * // Infrastructure types via direct module import
 * import type { ApiSchemas, DataRequest } from '@shared/data/api/types'
 *
 * // Domain DTOs directly from schema files
 * import type { CreateModelDto } from '@shared/data/api/schemas/models'
 * import type { CreateProviderDto } from '@shared/data/api/schemas/providers'
 * ```
 */

import type { AssertValidSchemas } from '../types'
import type { ModelSchemas } from './models'
import type { ProviderSchemas } from './providers'

/**
 * Merged API Schemas - single source of truth for all API endpoints
 *
 * All domain schemas are composed here using intersection types.
 * AssertValidSchemas provides compile-time validation:
 * - Invalid HTTP methods become `never` type
 * - Missing `response` field causes type errors
 *
 * When adding a new domain:
 * 1. Create the schema file
 * 2. Import and add to intersection below
 */
export type ApiSchemas = AssertValidSchemas<ModelSchemas & ProviderSchemas>
