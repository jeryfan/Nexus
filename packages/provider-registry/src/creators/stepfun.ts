import { openaiCompatible } from './_api'
import { defineCreator } from './types'

export default defineCreator({
  id: 'stepfun',
  name: 'StepFun',
  fetchModels: openaiCompatible('https://api.stepfun.com', 'STEPFUN_API_KEY'),
  modelsDevProviders: ['stepfun', 'stepfun-ai'],
  idPrefixes: ['step'],
  reasoningFamilies: [{ pattern: 'step-3' }, { pattern: 'step-r1-v-mini' }]
})
