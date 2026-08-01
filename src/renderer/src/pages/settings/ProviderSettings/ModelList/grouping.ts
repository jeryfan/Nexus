export const UNGROUPED_MODEL_GROUP_KEY = '__ungrouped__'

export function normalizeModelGroupName(
  group: string | null | undefined,
  fallback?: string
): string {
  const normalizedGroup = group?.trim()
  if (normalizedGroup && normalizedGroup.toLowerCase() !== 'undefined') {
    return normalizedGroup
  }

  const normalizedFallback = fallback?.trim()
  if (normalizedFallback && normalizedFallback.toLowerCase() !== 'undefined') {
    return normalizedFallback
  }

  return UNGROUPED_MODEL_GROUP_KEY
}

export function getModelGroupLabel(groupName: string): string {
  return groupName === UNGROUPED_MODEL_GROUP_KEY ? '未分组' : groupName
}

