/**
 * Sidebar filter modes. The list is flat (no enabled/disabled split), so the
 * filter is also the only knob for hiding disabled providers.
 *
 * - `enabled`: only `isEnabled === true`
 * - `disabled`: only `isEnabled === false`
 * - `all` (default): every provider
 */
export type ProviderFilterMode = 'enabled' | 'disabled' | 'all'
