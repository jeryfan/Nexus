// 仅保留 pickNeighbor 单函数；tab-group 系统其余部分随统一 tab 系统在 Nexus 中由 projectPanel
// 取代，不迁移。
export function pickNeighbor(tabOrder: string[], closingTabId: string): string | null {
  const idx = tabOrder.indexOf(closingTabId)
  if (idx === -1) {
    return null
  }
  if (idx + 1 < tabOrder.length) {
    return tabOrder[idx + 1]
  }
  if (idx - 1 >= 0) {
    return tabOrder[idx - 1]
  }
  return null
}
