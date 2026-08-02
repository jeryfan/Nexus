import * as z from 'zod'

import { LogoKeySchema } from './logoKey'

/**
 * Renderer-facing provider-logo input.
 *
 * DataApi creation accepts only a preset logo key. Uploaded provider logos use
 * the dedicated entity-image IPC command so raw bytes stay out of DataApi.
 */
export const CreateLogoSchema = z.strictObject({ kind: z.literal('key'), key: LogoKeySchema })
export type CreateLogoInput = z.infer<typeof CreateLogoSchema>
