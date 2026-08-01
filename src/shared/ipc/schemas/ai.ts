import { ModelSchema, UniqueModelIdSchema } from '@shared/data/types/model'
import * as z from 'zod'

import { defineRoute } from '../define'

export const aiRequestSchemas = {
  'ai.provider.model.list': defineRoute({
    input: z.strictObject({
      providerId: z.string().min(1),
      throwOnError: z.boolean().optional()
    }),
    output: z.array(ModelSchema.partial())
  }),
  'ai.provider.model.check': defineRoute({
    input: z.strictObject({
      uniqueModelId: UniqueModelIdSchema,
      apiKeyOverride: z.string().optional(),
      timeout: z.number().positive().optional()
    }),
    output: z.object({ latency: z.number() })
  })
}

export type AiEventSchemas = Record<never, never>
