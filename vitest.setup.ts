// Vitest setup：为 DOM 测试注册 @testing-library/jest-dom 匹配器。
// Why: jest-dom 的 `@testing-library/jest-dom/vitest` 入口在其 node_modules 副本里
// `import { expect } from 'vitest'`，拿到的是与测试文件不同实例的 expect，导致
// expect.extend 未生效（vitest 4 下的重复实例问题）。在 setup 文件里直接对测试上下文的
// expect 扩展 matchers 可稳定生效（setupFiles 与测试文件同一模块图）。
import * as matchers from '@testing-library/jest-dom/matchers'
import { expect } from 'vitest'

expect.extend(matchers)
