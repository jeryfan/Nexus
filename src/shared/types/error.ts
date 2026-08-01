import type { Serializable } from './serializable'

/**
 * Serialized error for storage and rendering.
 *
 * Known dynamic properties (accessed via index signature):
 * - `providerId?: string` — Provider ID surfaced in error detail views.
 */
export interface SerializedError {
  name: string | null
  message: string | null
  stack: string | null
  [key: string]: Serializable
}
