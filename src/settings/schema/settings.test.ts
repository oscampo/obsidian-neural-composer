import {
  DEFAULT_APPLY_MODEL_ID,
  DEFAULT_CHAT_MODELS,
  DEFAULT_CHAT_MODEL_ID,
  DEFAULT_EMBEDDING_MODELS,
  DEFAULT_PROVIDERS,
} from '../../constants'

import { SETTINGS_SCHEMA_VERSION } from './migrations'
import { parseNeuralComposerSettings } from './settings'

describe('parseNeuralComposerSettings', () => {
  it('should return default values for empty input', () => {
    const result = parseNeuralComposerSettings({})
    expect(result).toEqual({
      version: SETTINGS_SCHEMA_VERSION,

      providers: [...DEFAULT_PROVIDERS],

      chatModels: [...DEFAULT_CHAT_MODELS],
      embeddingModels: [...DEFAULT_EMBEDDING_MODELS],

      chatModelId: DEFAULT_CHAT_MODEL_ID,
      applyModelId: DEFAULT_APPLY_MODEL_ID,
      embeddingModelId: 'openai/text-embedding-3-small',

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

      enableAutoStartServer: false,
      graphViewMode: '2d',
      lightRagApiKey: '',
      lightRagChunkOverlap: 100,
      lightRagChunkSize: 1200,
      lightRagCommand: 'lightrag-server',
      lightRagCustomEnv: '',
      lightRagEntityTypes: '',
      lightRagExcludeHiddenFiles: true,
      lightRagExcludePatterns: [],
      lightRagMaxAsync: 4,
      lightRagMaxParallelInsert: 1,
      lightRagOntologyFolder: '',
      lightRagQueryMode: 'mix',
      lightRagRerankApiKey: '',
      lightRagRerankBinding: '',
      lightRagRerankBindingType: '',
      lightRagRerankHost: '',
      lightRagRerankModel: '',
      lightRagServerUrl: 'http://localhost:9621',
      lightRagShowCitations: true,
      lightRagSummaryLanguage: 'English',
      lightRagSyncFolder: '',
      lightRagUseRemote: false,
      lightRagWorkDir: '',
      useCustomEntityTypes: false,
    })
  })
})
