// 浏览器功能的 translate（zh 映射 + fallback 原文）。
// 调用约定沿用 i18next（key + defaultValue + options 插值），但不引入 i18next，
// 而是查 zh.json 提取的映射表（i18n-zh.ts），未命中返回 fallback（英文原文），
// 并按 i18next 的 {{name}} 约定做简单插值（browser 相关调用只用到 value0/value1 形式）。
import { BROWSER_ZH } from './i18n-zh'

export function translate(key: string, fallback?: string, options?: unknown): string {
  const template = BROWSER_ZH[key] ?? fallback ?? key
  if (!options || typeof options !== 'object') {
    return template
  }
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => {
    const value = (options as Record<string, unknown>)[name]
    return value === undefined ? match : String(value)
  })
}
