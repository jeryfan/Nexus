/**
 * Concrete pi `compat` defaults shared by the agent bridge (fallback) and the
 * settings UI (prefill). pi's compat has no "default" value — every field is an
 * optional concrete value whose absence means "pi auto-detects" — so this module
 * always yields concrete values, never an ambiguous "default".
 *
 * Resolution: conservative baseline (safe across OpenAI-compatible relays) →
 * vendor rule (only pi-catalog-confirmed vendors) → stored per-endpoint
 * `piCompat` override.
 */
import type { PiCompat } from '../types/provider'

/**
 * Conservative concrete baseline for OpenAI-compatible endpoints. Disabling
 * developer/store/reasoning_effort is harmless even for providers that support
 * them (pi falls back to system role / no store), while leaving them enabled is
 * the common cause of 400s on relays.
 */
export const PI_COMPAT_BASELINE: PiCompat = {
  thinkingFormat: 'openai',
  supportsDeveloperRole: false,
  supportsStore: false,
  supportsReasoningEffort: false,
  supportsUsageInStreaming: true,
  requiresThinkingAsText: false,
  maxTokensField: 'max_completion_tokens'
}

interface CompatRule {
  match: (ids: string, baseUrl: string) => boolean
  compat: PiCompat
}

/** Only vendors verified against pi's own catalog; everything else stays baseline. */
const COMPAT_RULES: CompatRule[] = [
  {
    // Qwen-family: top-level `enable_thinking` (pi qwen-token-plan catalog).
    match: (ids, baseUrl) => /dashscope|bailian|qwen/i.test(ids) || /aliyuncs\.com/.test(baseUrl),
    compat: {
      thinkingFormat: 'qwen',
      supportsDeveloperRole: false,
      supportsStore: false,
      supportsReasoningEffort: false
    }
  },
  {
    // Xiaomi MiMo: deepseek-style thinking + reasoning_content replay (pi catalog).
    match: (ids, baseUrl) => /mimo|xiaomi/i.test(ids) || /xiaomimimo\.com/.test(baseUrl),
    compat: {
      thinkingFormat: 'deepseek',
      supportsDeveloperRole: false,
      supportsStore: false,
      requiresReasoningContentOnAssistantMessages: true
    }
  }
]

/** Vendor-specific override on top of the baseline; undefined when not confirmed. */
export function vendorPiCompat(
  providerId: string,
  presetProviderId: string | undefined,
  baseUrl: string
): PiCompat | undefined {
  const ids = [providerId, presetProviderId ?? ''].join(' ')
  return COMPAT_RULES.find((rule) => rule.match(ids, baseUrl))?.compat
}

/**
 * The concrete compat a provider should use: baseline → vendor rule → stored
 * override. Always fully concrete so callers never see an ambiguous "default".
 */
export function resolveEffectivePiCompat(
  stored: PiCompat | undefined,
  providerId: string,
  presetProviderId: string | undefined,
  baseUrl: string
): PiCompat {
  return {
    ...PI_COMPAT_BASELINE,
    ...vendorPiCompat(providerId, presetProviderId, baseUrl),
    ...stored
  }
}
