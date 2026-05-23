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
 * Settings Schema - VERSIÓN MAESTRA CORA 4.0
 */
export const NeuralComposerSettingsSchema = z.object({
  // --- CONFIGURACIÓN ORIGINAL ---
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

  // --- NEURAL COMPOSER (CORE) ---
  lightRagUseRemote: z.boolean().catch(false),
  lightRagServerUrl: z.string().catch('http://localhost:9621'),
  lightRagApiKey: z.string().catch(''),
  enableAutoStartServer: z.boolean().catch(false),
  lightRagCommand: z.string().catch('lightrag-server'),
  lightRagWorkDir: z.string().catch(''),
  lightRagModelId: z.string().optional().catch(''),
  lightRagSummaryLanguage: z.string().catch('English'),
  lightRagShowCitations: z.boolean().catch(true),
  lightRagQueryMode: z
    .enum(['local', 'global', 'hybrid', 'naive', 'mix', 'bypass'])
    .catch('mix'),
  lightRagEmbeddingModelId: z.string().optional().catch(''),

  // --- RERANKING ---
  lightRagRerankBinding: z.string().catch(''),
  lightRagRerankModel: z.string().catch(''),
  lightRagRerankApiKey: z.string().catch(''),
  lightRagRerankHost: z.string().catch(''),
  lightRagRerankBindingType: z.string().catch(''),

  // --- ONTOLOGY (NUEVO) ---
  lightRagEntityTypes: z.string().catch(''),
  lightRagOntologyFolder: z.string().catch(''),
  // NUEVO INTERRUPTOR:
  useCustomEntityTypes: z.boolean().catch(false),

  graphViewMode: z.enum(['2d', '3d']).catch('2d'),

  // --- NUEVO CAMPO: CONFIGURACIÓN LIBRE ---
  lightRagCustomEnv: z.string().catch(''),

  // --- PERFORMANCE TUNING (NUEVO) ---
  lightRagMaxAsync: z.number().catch(4),
  lightRagMaxParallelInsert: z.number().catch(1),
  lightRagChunkSize: z.number().catch(1200),
  lightRagChunkOverlap: z.number().catch(100),

  // --- INCREMENTAL SYNC ---
  lightRagSyncFolder: z.string().catch(''),
  // ----------------------------------
})

export type NeuralComposerSettings = z.infer<
  typeof NeuralComposerSettingsSchema
>

/**
 * Default Settings Constant
 */
export const DEFAULT_SETTINGS: NeuralComposerSettings = {
  // --- ORIGINALES ---
  version: SETTINGS_SCHEMA_VERSION,
  providers: [...DEFAULT_PROVIDERS],
  chatModels: [...DEFAULT_CHAT_MODELS],
  embeddingModels: [...DEFAULT_EMBEDDING_MODELS],

  chatModelId:
    DEFAULT_CHAT_MODELS.find((v) => v.id === DEFAULT_CHAT_MODEL_ID)?.id ??
    DEFAULT_CHAT_MODELS[0].id,
  applyModelId:
    DEFAULT_CHAT_MODELS.find((v) => v.id === DEFAULT_APPLY_MODEL_ID)?.id ??
    DEFAULT_CHAT_MODELS[0].id,
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

  mcp: { servers: [] },

  chatOptions: {
    includeCurrentFileContent: true,
    enableTools: true,
    maxAutoIterations: 1,
  },

  // --- NEURAL DEFAULTS ---
  lightRagUseRemote: false,
  lightRagServerUrl: 'http://localhost:9621',
  lightRagApiKey: '',
  enableAutoStartServer: false,
  lightRagCommand: 'lightrag-server',
  lightRagWorkDir: '',
  lightRagModelId: '',
  lightRagSummaryLanguage: 'English',
  lightRagShowCitations: true,
  lightRagQueryMode: 'mix',
  lightRagEmbeddingModelId: '',

  // --- RERANK DEFAULTS ---
  lightRagRerankBinding: '',
  lightRagRerankModel: '',
  lightRagRerankApiKey: '',
  lightRagRerankHost: '',
  lightRagRerankBindingType: '',

  // --- ONTOLOGY DEFAULTS ---
  // Ponemos los defaults estándar de LightRAG para que el usuario tenga un punto de partida
  lightRagEntityTypes:
    'Person, Creature, Organization, Location, Event, Concept, Method, Content, Data, Artifact, NaturalObject',
  lightRagOntologyFolder: '',
  // NUEVO DEFAULT:
  useCustomEntityTypes: false,
  graphViewMode: '2d', // Default seguro para todos
  // DEFAULTS NUEVOS
  lightRagMaxAsync: 4,
  lightRagMaxParallelInsert: 1,
  lightRagChunkSize: 1200,
  lightRagChunkOverlap: 100,

  // DEFAULT NUEVO
  lightRagCustomEnv: '',
  lightRagSyncFolder: '',
}

export type SettingMigration = {
  fromVersion: number
  toVersion: number
  migrate: (data: Record<string, unknown>) => Record<string, unknown>
}
