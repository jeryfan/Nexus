/**
 * Provider configuration schema definitions
 * Defines the structure for provider connections and API configurations
 */

import * as z from 'zod'

import { MetadataSchema, ProviderIdSchema, VersionSchema } from './common'
import { ENDPOINT_TYPE, type EndpointType, objectValues } from './enums'
import { ReasoningWireProfileSchema } from './reasoningWire'

export const EndpointTypeSchema = z.enum(objectValues(ENDPOINT_TYPE))
const endpointTypeValues: readonly string[] = objectValues(ENDPOINT_TYPE)

// ═══════════════════════════════════════════════════════════════════════════════
// API Features
// ═══════════════════════════════════════════════════════════════════════════════

/** API feature flags controlling request construction at the SDK level */
export const ApiFeaturesSchema = z.object({
  // --- Request format flags ---

  /** Whether the provider supports array-formatted content in messages */
  arrayContent: z.boolean().default(true),
  /** Whether the provider supports stream_options for usage data */
  streamOptions: z.boolean().default(true),

  // --- Provider-specific parameter flags ---

  /** Whether the provider supports the 'developer' role (OpenAI-specific) */
  developerRole: z.boolean().default(false),
  /** Whether the provider supports service tier selection (OpenAI/Groq-specific) */
  serviceTier: z.boolean().default(false),
  /** Whether the provider supports verbosity settings (OpenAI-specific) */
  verbosity: z.boolean().default(false)
})

// ═══════════════════════════════════════════════════════════════════════════════
// Provider Reasoning Format
//
// Describes HOW a provider's API expects reasoning parameters to be formatted.
// This is a provider-level concern — model-level reasoning capabilities
// (effort levels, token limits) are in model.ts ReasoningSupportSchema.
// ═══════════════════════════════════════════════════════════════════════════════

const reasoningFormat = <T extends string>(type: T) =>
  z.object({
    type: z.literal(type),
    /** Endpoint-wide wire behavior, interpreted only in Main. */
    wire: ReasoningWireProfileSchema.optional()
  })

/** Provider reasoning format — discriminated union by format type. */
export const ProviderReasoningFormatSchema = z.discriminatedUnion('type', [
  reasoningFormat('openai-chat'),
  reasoningFormat('openai-responses'),
  reasoningFormat('anthropic'),
  reasoningFormat('gemini'),
  reasoningFormat('ollama'),
  reasoningFormat('none')
])

/** The discriminator values of {@link ProviderReasoningFormatSchema} — the ONE
 *  source of the format-type list (shared re-derives its zod enum from this). */
export type ReasoningFormatType = z.infer<typeof ProviderReasoningFormatSchema>['type']
export const REASONING_FORMAT_TYPES = ProviderReasoningFormatSchema.options.map(
  (option) => option.shape.type.value
) as [ReasoningFormatType, ...ReasoningFormatType[]]

// ═══════════════════════════════════════════════════════════════════════════════
// Provider Config
// ═══════════════════════════════════════════════════════════════════════════════

export const ProviderWebsiteSchema = z.object({
  website: z.object({
    official: z.url().optional(),
    docs: z.url().optional(),
    apiKey: z.url().optional(),
    models: z.url().optional()
  })
})

/** Per-endpoint-type configuration in registry */
export const RegistryEndpointConfigSchema = z.object({
  /** Base URL for this endpoint type's API */
  baseUrl: z.url().optional(),
  /** URLs for fetching available models via this endpoint type */
  modelsApiUrls: z
    .object({
      /** Default models listing endpoint */
      default: z.url().optional(),
      /** Embedding models listing endpoint (if separate from default) */
      embedding: z.url().optional(),
      /** Image models listing endpoint (if separate from default) */
      image: z.url().optional(),
      /** Reranker models listing endpoint (if separate from default) */
      reranker: z.url().optional()
    })
    .optional(),
  /** How this endpoint type expects reasoning parameters to be formatted */
  reasoningFormat: ProviderReasoningFormatSchema.optional(),
  /**
   * AI SDK adapter family that handles this endpoint. Aligns with the IDs
   * registered in `appProviderIds`. Resolvers should prefer this over
   * heuristic id/baseUrl inference when present.
   */
  adapterFamily: z.string().optional()
})

export const ProviderConfigSchema = z
  .object({
    /** Unique provider identifier */
    id: ProviderIdSchema,
    presetProviderId: ProviderIdSchema.optional(),
    /** Display name */
    name: z.string(),
    /** Provider description */
    description: z.string().optional(),
    /** Per-endpoint-type configuration (partial record — not all endpoint types need to be present) */
    endpointConfigs: z
      .record(
        z.string().refine((k): k is EndpointType => endpointTypeValues.includes(k), {
          message: `Invalid endpoint type key, must be one of: ${objectValues(ENDPOINT_TYPE).join(', ')}`
        }),
        RegistryEndpointConfigSchema
      )
      .optional(),
    /** Default endpoint type for chat requests — null for providers not bound by this (e.g. AWS, Vertex) */
    defaultChatEndpoint: EndpointTypeSchema.nullable().default(null),
    /**
     * Where this provider's model list comes from. `'registry'` means it cannot
     * be enumerated over an API (login-based subscription providers); the shipped
     * registry catalog is returned by the model-list chokepoint instead. Defaults
     * to `'api'` (the provider exposes a `/models` endpoint).
     */
    modelListSource: z.enum(['api', 'registry']).default('api'),
    /**
     * The provider serves requests without any credential — a local server
     * (ollama / lmstudio / gpustack / ovms) reachable over a baseUrl with no API
     * key. Drives the "no API key required" guards for model synchronization
     * and connection checks. A local provider still
     * needs its baseUrl input. Defaults false.
     */
    authOptional: z.boolean().default(false),
    /** API feature flags controlling request construction */
    apiFeatures: ApiFeaturesSchema.optional(),
    /** Additional metadata including website URLs */
    metadata: MetadataSchema.and(ProviderWebsiteSchema)
  })
  .refine(
    (data) => {
      if (data.endpointConfigs && data.defaultChatEndpoint) {
        return data.defaultChatEndpoint in data.endpointConfigs
      }
      return true
    },
    {
      message: 'defaultChatEndpoint must exist as a key in endpointConfigs'
    }
  )

export const ProviderListSchema = z.object({
  version: VersionSchema,
  providers: z.array(ProviderConfigSchema)
})

export { ENDPOINT_TYPE } from './enums'
export type ApiFeatures = z.infer<typeof ApiFeaturesSchema>
export type ProviderReasoningFormat = z.infer<typeof ProviderReasoningFormatSchema>
export type RegistryEndpointConfig = z.infer<typeof RegistryEndpointConfigSchema>
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>
export type ProviderList = z.infer<typeof ProviderListSchema>

