/**
 * The creator registry — the single hand-maintained source for the model catalog.
 * One file per creator; `data/models.json` is generated from these (scripts/generate-catalog.ts).
 * Never edit models.json by hand.
 */
import ai21 from './ai21'
import alibaba from './alibaba'
import allenai from './allenai'
import amazon from './amazon'
import anthropic from './anthropic'
import arceeai from './arceeai'
import baai from './baai'
import baidu from './baidu'
import bailing from './bailing'
import black_forest_labs from './black-forest-labs'
import bytedance from './bytedance'
import cogito from './cogito'
import cohere from './cohere'
import deepseek from './deepseek'
import google from './google'
import inception from './inception'
import meituan from './meituan'
import meta from './meta'
import microsoft from './microsoft'
import minimax from './minimax'
import mistral from './mistral'
import moonshot from './moonshot'
import nousresearch from './nousresearch'
import nvidia from './nvidia'
import openai from './openai'
import perplexity from './perplexity'
import recraft from './recraft'
import reka from './reka'
import sourceful from './sourceful'
import stepfun from './stepfun'
import streamlake from './streamlake'
import tencent from './tencent'
import type { Creator } from './types'
import upstage from './upstage'
import vercel from './vercel'
import writer from './writer'
import xai from './xai'
import xiaomi from './xiaomi'
import zhipu from './zhipu'

export const CREATORS: Creator[] = [
  ai21,
  alibaba,
  allenai,
  amazon,
  anthropic,
  arceeai,
  baai,
  baidu,
  bailing,
  black_forest_labs,
  bytedance,
  cogito,
  cohere,
  deepseek,
  google,
  inception,
  meituan,
  meta,
  microsoft,
  minimax,
  mistral,
  moonshot,
  nousresearch,
  nvidia,
  openai,
  perplexity,
  recraft,
  reka,
  stepfun,
  streamlake,
  sourceful,
  tencent,
  upstage,
  vercel,
  writer,
  xai,
  xiaomi,
  zhipu
]

export type { Creator, CreatorModel } from './types'
export { defineCreator } from './types'
