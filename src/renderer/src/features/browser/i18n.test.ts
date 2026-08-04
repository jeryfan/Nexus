import { describe, expect, it } from 'vitest'

import { translate } from './i18n'

describe('browser i18n shim', () => {
  it('returns the nexus zh translation when the key exists', () => {
    expect(translate('auto.components.ui.dialog.f26c4baeda', 'Close')).toBe('关闭')
  })

  it('returns the English fallback when the key is missing', () => {
    expect(translate('browser.missing.key', 'Fallback text')).toBe('Fallback text')
  })

  it('returns the key itself when both translation and fallback are missing', () => {
    expect(translate('browser.missing.key')).toBe('browser.missing.key')
  })

  it('interpolates {{value0}} in a zh template', () => {
    expect(
      translate(
        'auto.components.workspace.cleanup.candidateRow.browserTabsCount',
        'Browser tabs: {{value0}}',
        { value0: 3 }
      )
    ).toBe('浏览器标签页：3')
  })

  it('interpolates {{value0}} in the fallback when the key is missing', () => {
    expect(translate('browser.missing.key', 'Copied {{value0}}.', { value0: 'x' })).toBe(
      'Copied x.'
    )
  })

  it('keeps the placeholder when the variable is absent from options', () => {
    expect(translate('browser.loadFailure.cantReachHost', "Can't reach {{value0}}", {})).toBe(
      "Can't reach {{value0}}"
    )
  })

  it('returns the plain template when options is undefined or null', () => {
    expect(translate('auto.components.ui.dialog.f26c4baeda', 'Close', undefined)).toBe('关闭')
    expect(translate('auto.components.ui.dialog.f26c4baeda', 'Close', null)).toBe('关闭')
  })
})
