import { z } from 'zod'

import {
  DEFAULT_APPLY_MODEL_ID,
  DEFAULT_CHAT_MODELS,
  DEFAULT_CHAT_MODEL_ID,
  DEFAULT_EMBEDDING_MODELS,
  DEFAULT_PROVIDERS,
} from '../../constants'
import { chatModelSchema } from '../../types/chat-model.types'
import { embeddingModelSchema } from '../../types/embedding-model.types'
import { mcpServerConfigSchema } from '../../types/mcp.types'
import { llmProviderSchema } from '../../types/provider.types'

import { SETTINGS_SCHEMA_VERSION } from './migrations'

const ragOptionsSchema = z.object({
  chunkSize: z.number().catch(1000),
  thresholdTokens: z.number().catch(8192),
  minSimilarity: z.number().catch(0.0),
  limit: z.number().catch(10),
  excludePatterns: z.array(z.string()).catch([]),
  includePatterns: z.array(z.string()).catch([]),
})

/**
 * Settings Schema
 */
export const smartComposerSettingsSchema = z.object({
  version: z.literal(SETTINGS_SCHEMA_VERSION).catch(SETTINGS_SCHEMA_VERSION),

  providers: z.array(llmProviderSchema).catch([...DEFAULT_PROVIDERS]),

  chatModels: z.array(chatModelSchema).catch([...DEFAULT_CHAT_MODELS]),

  embeddingModels: z
    .array(embeddingModelSchema)
    .catch([...DEFAULT_EMBEDDING_MODELS]),

  chatModelId: z
    .string()
    .catch(
      DEFAULT_CHAT_MODELS.find((v) => v.id === DEFAULT_CHAT_MODEL_ID)?.id ??
        DEFAULT_CHAT_MODELS[0].id,
    ), 
  applyModelId: z
    .string()
    .catch(
      DEFAULT_CHAT_MODELS.find((v) => v.id === DEFAULT_APPLY_MODEL_ID)?.id ??
        DEFAULT_CHAT_MODELS[0].id,
    ),
  embeddingModelId: z.string().catch(DEFAULT_EMBEDDING_MODELS[0].id), 

  systemPrompt: z.string().catch(''),

  ragOptions: ragOptionsSchema.catch({
    chunkSize: 1000,
    thresholdTokens: 8192,
    minSimilarity: 0.0,
    limit: 10,
    excludePatterns: [],
    includePatterns: [],
  }),

  mcp: z
    .object({
      servers: z.array(mcpServerConfigSchema).catch([]),
    })
    .catch({
      servers: [],
    }),

  chatOptions: z
    .object({
      includeCurrentFileContent: z.boolean(),
      enableTools: z.boolean(),
      maxAutoIterations: z.number(),
    })
    .catch({
      includeCurrentFileContent: true,
      enableTools: true,
      maxAutoIterations: 1,
    }),

  // --- CORA MOD: NUEVAS OPCIONES ---
  enableAutoStartServer: z.boolean().catch(false),
  lightRagCommand: z.string().catch('lightrag-server'),
  lightRagWorkDir: z.string().catch(''),
  lightRagModelId: z.string().optional(),
  // CORRECCIÓN: Default a English para público global
  lightRagSummaryLanguage: z.string().catch('English'), 
  lightRagShowCitations: z.boolean().catch(true),
  // ------------------------------
})

export type SmartComposerSettings = z.infer<typeof smartComposerSettingsSchema>

/**
 * Default Settings Constant
 */
export const DEFAULT_SETTINGS: SmartComposerSettings = {
  version: SETTINGS_SCHEMA_VERSION,
  providers: [...DEFAULT_PROVIDERS],
  chatModels: [...DEFAULT_CHAT_MODELS],
  embeddingModels: [...DEFAULT_EMBEDDING_MODELS],
  
  chatModelId: DEFAULT_CHAT_MODELS.find((v) => v.id === DEFAULT_CHAT_MODEL_ID)?.id ?? DEFAULT_CHAT_MODELS[0].id,
  applyModelId: DEFAULT_CHAT_MODELS.find((v) => v.id === DEFAULT_APPLY_MODEL_ID)?.id ?? DEFAULT_CHAT_MODELS[0].id,
  embeddingModelId: DEFAULT_EMBEDDING_MODELS[0].id,
  
  systemPrompt: '',
  
  ragOptions: {
    chunkSize: 1000,
    thresholdTokens: 8192,
    minSimilarity: 0.0,
    limit: 10,
    excludePatterns: [],
    includePatterns: [],
  },
  
  mcp: {
    servers: [],
  },
  
  chatOptions: {
    includeCurrentFileContent: true,
    enableTools: true,
    maxAutoIterations: 1,
  },

  // --- CORA MOD DEFAULTS ---
  enableAutoStartServer: false,
  lightRagCommand: 'lightrag-server',
  lightRagWorkDir: '',
  lightRagModelId: '',
  lightRagSummaryLanguage: 'English', // Default neutro
  lightRagShowCitations: true,
}

export type SettingMigration = {
  fromVersion: number
  toVersion: number
  migrate: (data: Record<string, unknown>) => Record<string, unknown>
}