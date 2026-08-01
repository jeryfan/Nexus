/**
 * API Response Schemas for model listing
 * Used exclusively by listModels.ts
 *
 * All object schemas use z.looseObject() to tolerate unknown fields
 * from providers — prevents parse failures when APIs add new fields.
 */
import * as z from 'zod'

// === OpenAI-compatible (also used by OpenRouter etc.) ===

export const OpenAIModelsResponseSchema = z.object({
  data: z.array(
    z.looseObject({
      id: z.string(),
      name: z.string().optional(),
      object: z.string().optional().default('model'),
      created: z.number().optional(),
      owned_by: z.string().optional()
    })
  ),
  object: z.string().optional()
})

// === Ollama ===

export const OllamaTagsResponseSchema = z.object({
  models: z.array(
    z.looseObject({
      name: z.string(),
      model: z.string().optional(),
      modified_at: z.string().optional(),
      size: z.number().optional(),
      digest: z.string().optional(),
      details: z
        .looseObject({
          parent_model: z.string().optional(),
          format: z.string().optional(),
          family: z.string().optional(),
          families: z
            .array(z.string())
            .nullable()
            .optional()
            .transform((v) => v ?? undefined),
          parameter_size: z.string().optional(),
          quantization_level: z.string().optional()
        })
        .optional()
    })
  )
})

// === Gemini ===

export const GeminiModelsResponseSchema = z.object({
  models: z.array(
    z.looseObject({
      name: z.string(),
      displayName: z.string().optional(),
      description: z.string().optional(),
      version: z.string().optional(),
      baseModelId: z.string().optional(),
      inputTokenLimit: z.number().optional(),
      outputTokenLimit: z.number().optional(),
      supportedGenerationMethods: z.array(z.string()).optional()
    })
  ),
  nextPageToken: z.string().optional()
})

// === NewAPI (extends OpenAI with endpoint types) ===

export const NewApiModelsResponseSchema = z.object({
  data: z.array(
    z.looseObject({
      id: z.string(),
      object: z.string().optional().default('model'),
      created: z.number().optional(),
      owned_by: z.string().optional(),
      supported_endpoint_types: z
        .array(z.string())
        .nullable()
        .optional()
        .transform((v) => v ?? undefined)
    })
  ),
  object: z.string().optional()
})

// === Anthropic (/v1/models) ===

export const AnthropicModelsResponseSchema = z.object({
  data: z.array(
    z.looseObject({
      id: z.string(),
      display_name: z.string().optional(),
      created_at: z.string().optional()
    })
  ),
  has_more: z.boolean().optional()
})
