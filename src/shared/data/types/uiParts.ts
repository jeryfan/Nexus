/**
 * Custom DataUIPart schemas for Nexus.
 *
 * These extend AI SDK's UIMessage.parts with application-specific
 * part types that have no built-in equivalent.
 *
 * AI SDK built-in parts used directly:
 * - TextUIPart (main_text → text)
 * - ReasoningUIPart (thinking → reasoning)
 * - ToolUIPart (tool → tool-{name})
 * - FileUIPart (image/file → file)
 *
 * Custom DataUIParts (no AI SDK equivalent):
 * - data-error (error blocks)
 * - data-translation (translation blocks)
 * - data-video (video blocks)
 * - data-compact (compact/summary blocks)
 * - data-knowledge-scope (knowledge bases available to this user turn)
 * - data-code (code blocks)
 */

import { type FileType, FileTypeSchema } from '@shared/types/file'
import * as z from 'zod'

import type { SerializedError } from '../../types/error'
import type { NexusMessagePart } from './message'

// ============================================================================
// Custom DataUIPart data shapes
// ============================================================================

/** Error data — replaces ErrorBlock. May carry the full serialized error payload. */
export type ErrorPartData = Partial<SerializedError> & {
  name?: string | null
  message?: string | null
  stack?: string | null
  code?: string
}

/** Translation data — replaces TranslationBlock */
export interface TranslationPartData {
  content: string
  targetLanguage: string
  sourceLanguage?: string
  sourceBlockId?: string
}

/** Video data — replaces VideoBlock */
export interface VideoPartData {
  url?: string
  filePath?: string
}

/** Compact/summary data — replaces CompactBlock */
export interface CompactPartData {
  content: string
  compactedContent: string
}

/** Knowledge scope captured on a user message. Hidden from both the transcript and the model. */
export interface KnowledgeScopePartData {
  baseIds: string[]
}

/** Code data — replaces CodeBlock */
export interface CodePartData {
  content: string
  language: string
}

// ============================================================================
// Nexus DataUIPart type map (for useChat dataPartSchemas)
// ============================================================================

/**
 * All custom DataUIPart types for Nexus.
 * Used with `useChat({ dataPartSchemas })` to enable type-safe custom parts.
 */
export type NexusDataPartTypes = {
  error: ErrorPartData
  translation: TranslationPartData
  video: VideoPartData
  compact: CompactPartData
  'knowledge-scope': KnowledgeScopePartData
  code: CodePartData
}

// ============================================================================
// Nexus per-part providerMetadata.nexus shapes
// ============================================================================

/** Nexus metadata on a TextUIPart. */
export interface NexusTextMeta {
  /** Content references (citations, mentions). */
  references?: unknown[]
  /** Composer inline token display snapshot — on user TextUIPart by convention. */
  composer?: ComposerMessageSnapshot
}

/** Nexus metadata on a ReasoningUIPart. */
export interface NexusReasoningMeta {
  /** Thinking duration in ms. */
  thinkingMs?: number
  /** Thinking start timestamp in epoch ms. */
  startedAt?: number
}

/** Nexus metadata on a ToolUIPart / DynamicToolUIPart. */
export interface NexusToolMeta {
  /** Approval bridge transport. */
  transport?: string
  /** Tool name (used by approval bridge before the part has been finalized). */
  toolName?: string
  /** MCP / builtin tool identity. Matches `ToolType` consumed by `toolResponse.ts`. */
  tool?: {
    serverId?: string
    serverName?: string
    type?: 'mcp' | 'builtin' | 'provider'
  }
}

/** A single actionable step in an AI error diagnosis. */
export interface DiagnosisStep {
  text: string
}

/** AI-generated diagnosis of a chat error. Persisted on a data-error part so it survives popup close / reload. */
export interface DiagnosisResult {
  summary: string
  category: string
  explanation: string
  steps: DiagnosisStep[]
}

/** Nexus metadata on a data-error DataUIPart. */
export interface NexusErrorMeta {
  /** Persisted AI error diagnosis, rehydrated into the error-detail popup after close / reload. */
  diagnosis?: DiagnosisResult
}

/** Nexus metadata on a FileUIPart. */
export interface NexusFileMeta {
  /**
   * FileEntryId for internal files (v1→v2 migrator preserves this from
   * `OldFileBlock.file.id` / `OldImageBlock.file.id`). External (user-path)
   * files have no fileEntryId. Consumed by `ChatMigrator` to backfill
   * `chat_message_file_ref` rows after migration.
   */
  fileEntryId?: string
  /** Composer file token association identity. Not a path, filename, or file storage id. */
  fileTokenSourceId?: string
  /** Safe composer-only source marker used to restore sent-message token previews. */
  composerFileKind?: 'pasted-text'
}

/**
 * Conditional mapping from a part's `type` literal to its nexus-meta shape.
 * Parts without a registered shape have no nexus meta — represented as `Record<string, never>`.
 */
export type NexusMetaForPartType<T extends string> = T extends 'text'
  ? NexusTextMeta
  : T extends 'reasoning'
    ? NexusReasoningMeta
    : T extends `tool-${string}` | 'dynamic-tool'
      ? NexusToolMeta
      : T extends 'file'
        ? NexusFileMeta
        : T extends 'data-error'
          ? NexusErrorMeta
          : Record<string, never>

/**
 * @deprecated Use `NexusTextMeta` / `NexusReasoningMeta` / `NexusToolMeta` / `NexusFileMeta`
 * directly, or `NexusMetaForPartType<P['type']>` in generic positions. Retained for one PR
 * cycle to keep external imports compiling.
 */
export type NexusProviderMetadata = NexusTextMeta &
  NexusReasoningMeta &
  NexusToolMeta &
  NexusFileMeta

// ============================================================================
// Zod schemas — runtime validation at the read boundary
// ============================================================================

const ComposerMessageFileTokenPayloadSchema: z.ZodType<ComposerMessageFileTokenPayload> = z.object({
  type: FileTypeSchema.optional(),
  ext: z.string().optional(),
  name: z.string().optional(),
  // Serialized key — mirrors the `origin_name` file-part payload key. Do not rename.
  origin_name: z.string().optional(),
  size: z.number().optional()
})

const ComposerMessageTokenSchema: z.ZodType<ComposerMessageToken> = z.object({
  id: z.string(),
  kind: z.enum(['skill', 'file', 'folder', 'command', 'knowledge', 'reference', 'quote']),
  label: z.string(),
  icon: z.string().optional(),
  description: z.string().optional(),
  index: z.number(),
  textOffset: z.number(),
  promptText: z.string().optional(),
  payload: ComposerMessageFileTokenPayloadSchema.optional()
})

const ComposerMessageSnapshotSchema: z.ZodType<ComposerMessageSnapshot> = z.object({
  version: z.literal(1),
  tokens: z.array(ComposerMessageTokenSchema)
})

export const NexusTextMetaSchema: z.ZodType<NexusTextMeta> = z.object({
  references: z.array(z.unknown()).optional(),
  composer: ComposerMessageSnapshotSchema.optional()
})

export const NexusReasoningMetaSchema: z.ZodType<NexusReasoningMeta> = z.object({
  thinkingMs: z.number().optional(),
  startedAt: z.number().optional()
})

export const NexusToolMetaSchema: z.ZodType<NexusToolMeta> = z.object({
  transport: z.string().optional(),
  toolName: z.string().optional(),
  tool: z
    .object({
      serverId: z.string().optional(),
      serverName: z.string().optional(),
      type: z.enum(['mcp', 'builtin', 'provider']).optional()
    })
    .optional()
})

export const NexusFileMetaSchema: z.ZodType<NexusFileMeta> = z.object({
  fileEntryId: z.string().optional(),
  fileTokenSourceId: z.string().optional(),
  composerFileKind: z.literal('pasted-text').optional()
})

const DiagnosisStepSchema: z.ZodType<DiagnosisStep> = z.object({
  text: z.string()
})

const DiagnosisResultSchema: z.ZodType<DiagnosisResult> = z.object({
  summary: z.string(),
  category: z.string(),
  explanation: z.string(),
  steps: z.array(DiagnosisStepSchema)
})

export const NexusErrorMetaSchema: z.ZodType<NexusErrorMeta> = z.object({
  diagnosis: DiagnosisResultSchema.optional()
})

export const KnowledgeScopePartDataSchema: z.ZodType<KnowledgeScopePartData> = z.strictObject({
  baseIds: z.array(z.string().min(1))
})

// Table-driven dispatch — part `type` → schema. First match wins.
const SCHEMA_BY_PART_TYPE: ReadonlyArray<readonly [(t: string) => boolean, z.ZodTypeAny]> = [
  [(t) => t === 'text', NexusTextMetaSchema],
  [(t) => t === 'reasoning', NexusReasoningMetaSchema],
  [(t) => t === 'dynamic-tool' || t.startsWith('tool-'), NexusToolMetaSchema],
  [(t) => t === 'file', NexusFileMetaSchema],
  [(t) => t === 'data-error', NexusErrorMetaSchema]
]

function schemaForPartType(type: string): z.ZodTypeAny | null {
  for (const [match, schema] of SCHEMA_BY_PART_TYPE) {
    if (match(type)) return schema
  }
  return null
}

const KNOWLEDGE_SCOPE_PART_TYPE = 'data-knowledge-scope'

/** Replace the aggregate knowledge scope part while preserving every content part. */
export function withKnowledgeScopePart(
  parts: NexusMessagePart[],
  baseIds: readonly string[]
): NexusMessagePart[] {
  const contentParts = parts.filter((part) => part.type !== KNOWLEDGE_SCOPE_PART_TYPE)
  const uniqueBaseIds = Array.from(new Set(baseIds.filter(Boolean)))
  if (uniqueBaseIds.length === 0) return contentParts

  return [
    ...contentParts,
    {
      type: KNOWLEDGE_SCOPE_PART_TYPE,
      data: { baseIds: uniqueBaseIds }
    } as NexusMessagePart
  ]
}

/** Read the last valid aggregate scope. Missing or malformed parts yield `undefined`. */
export function getKnowledgeBaseIdsFromParts(
  parts: readonly NexusMessagePart[]
): string[] | undefined {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (part.type !== KNOWLEDGE_SCOPE_PART_TYPE || !('data' in part)) continue

    const result = KnowledgeScopePartDataSchema.safeParse(part.data)
    if (result.success) return Array.from(new Set(result.data.baseIds))
  }
  return undefined
}

// ============================================================================
// Accessors — single read/write boundary for providerMetadata.nexus
// ============================================================================

export type ComposerMessageTokenKind =
  'skill' | 'file' | 'folder' | 'command' | 'knowledge' | 'reference' | 'quote'

export interface ComposerMessageFileTokenPayload {
  type?: FileType
  ext?: string
  name?: string
  /** Serialized key — mirrors the `origin_name` file-part payload key. */
  origin_name?: string
  size?: number
}

export type ComposerMessageTokenPayload = ComposerMessageFileTokenPayload

export interface ComposerMessageToken {
  id: string
  kind: ComposerMessageTokenKind
  label: string
  icon?: string
  description?: string
  index: number
  textOffset: number
  promptText?: string
  payload?: ComposerMessageTokenPayload
}

export interface ComposerMessageSnapshot {
  version: 1
  tokens: ComposerMessageToken[]
}

/**
 * Read nexus meta with runtime validation. Returns `undefined` for missing,
 * malformed, or part types without a registered schema. Never throws — this
 * is a leaf util in `packages/shared`, so callers that need to surface
 * validation failures should `safeParse` the appropriate `Nexus*MetaSchema`
 * directly with their own logger.
 */
export function readNexusMeta<P extends NexusMessagePart>(
  part: P
): NexusMetaForPartType<P['type']> | undefined {
  const raw = (part as { providerMetadata?: Record<string, unknown> }).providerMetadata?.nexus
  if (!raw || typeof raw !== 'object') return undefined
  const schema = schemaForPartType(part.type)
  if (!schema) return undefined
  const result = schema.safeParse(raw)
  if (!result.success) return undefined
  return result.data as NexusMetaForPartType<P['type']>
}

/**
 * Patch nexus meta with compile-time part-scoping. Writing a field that
 * doesn't belong to the part's meta shape fails to compile — e.g.
 * `withNexusMeta(textPart, { thinkingMs: 1 })` is a type error.
 */
export function withNexusMeta<P extends NexusMessagePart>(
  part: P,
  patch: Partial<NexusMetaForPartType<P['type']>>
): P {
  const existingMeta = (part as { providerMetadata?: Record<string, unknown> }).providerMetadata
  const existingNexus = (existingMeta?.nexus ?? {}) as Record<string, unknown>
  return {
    ...part,
    providerMetadata: {
      ...existingMeta,
      nexus: { ...existingNexus, ...(patch as Record<string, unknown>) }
    }
  } as P
}
