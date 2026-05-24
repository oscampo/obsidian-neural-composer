import { AbstractInputSuggest, App, Setting, Notice, TFolder } from 'obsidian'
import { EnvEditorModal } from '../../modals/EnvEditorModal'
import { useEffect, useRef, useState } from 'react'
import NeuralComposerPlugin from '../../../main'

class FolderSuggest extends AbstractInputSuggest<TFolder> {
  private readonly input: HTMLInputElement

  constructor(app: App, inputEl: HTMLInputElement) {
    super(app, inputEl)
    this.input = inputEl
  }

  getSuggestions(query: string): TFolder[] {
    const lower = query.toLowerCase()
    return this.app.vault
      .getAllFolders(false)
      .filter((f) => f.path.toLowerCase().includes(lower))
      .slice(0, 50)
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path)
  }

  selectSuggestion(folder: TFolder): void {
    this.setValue(folder.path)
    this.input.dispatchEvent(new Event('input'))
    this.close()
  }
}

export const BACKEND_NAME = 'LightRAG'
export const TERM_API = 'API'
export const TERM_APIs = 'APIs'
export const TERM_LLM = 'LLM'
export const FOLDER_DIR = 'Main/Memories'
export const RERANK_ENDPOINT = 'http://localhost:8000/v1/rerank'
export const COHERE = 'cohere'
export const ADV_SETTINGS = 'MAX_TOTAL_TOKENS=30000\nLLM_TIMEOUT=180\n...'
export const TWO_D = '2D'
export const THREE_D = '3D'
export const GRAPH_UNIT = 'GPU'
export const YOUR_SERVER = 'http://your-server:9621'

export const NeuralSection = ({ plugin }: { plugin: NeuralComposerPlugin }) => {
  const settingsRef = useRef<HTMLDivElement>(null)

  const [settings, setLocalSettings] = useState(plugin.settings)

  // Local state for immediate UI reactivity
  const [currentRerankBinding, setCurrentRerankBinding] = useState(
    plugin.settings.lightRagRerankBinding,
  )
  const [useCustomOntology, setUseCustomOntology] = useState(
    plugin.settings.useCustomEntityTypes,
  )
  const [useRemote, setUseRemote] = useState(plugin.settings.lightRagUseRemote)

  /**
   * Server info state — { version, checked }
   *   checked=false → first health check hasn't run yet → hide badge
   *   checked=true, version=null → offline → red "offline" badge
   *   checked=true, version='1.4.16' → online → green version badge
   */
  const [serverInfo, setServerInfo] = useState<{ version: string | null; checked: boolean }>(
    () => ({ version: plugin.lightRagServerVersion, checked: plugin.lightRagServerChecked }),
  )

  useEffect(() => {
    return plugin.addSettingsChangeListener(setLocalSettings)
  }, [plugin])

  // Subscribe to server version/status changes (populated by checkAndUpdateStatus)
  useEffect(() => {
    return plugin.addVersionChangeListener(setServerInfo)
  }, [plugin])

  useEffect(() => {
    if (!settingsRef.current) return
    settingsRef.current.empty()
    const container = settingsRef.current

    // Header row: title + version badge side by side
    const headerRow = container.createDiv({ cls: 'nc-server-header-row' })
    headerRow.createEl('h3', { text: `Neural backend (${BACKEND_NAME})` })
    // Version badge — updated reactively by the separate useEffect below.
    // data-nc-version acts as a stable selector so the reactive effect can
    // find and update this element without rebuilding the whole DOM.
    const versionBadge = headerRow.createSpan({
      cls: 'nc-version-badge',
      attr: { 'data-nc-version': '' },
    })
    // Render initial state (before the reactive effect runs)
    if (plugin.lightRagServerChecked) {
      if (plugin.lightRagServerVersion) {
        versionBadge.textContent = `v${plugin.lightRagServerVersion}`
        versionBadge.addClass('nc-version-badge--online')
      } else {
        versionBadge.textContent = 'offline'
        versionBadge.addClass('nc-version-badge--offline')
      }
    }

    // --- SERVER CONNECTION MODE ---
    new Setting(container)
      .setName('Use remote server')
      .setDesc(
        'Connect to a remote ${BACKEND_NAME} server instead of running one locally.',
      )
      .addToggle((toggle) =>
        toggle.setValue(useRemote).onChange((value) => {
          setUseRemote(value)
          void plugin.setSettings({
            ...plugin.settings,
            lightRagUseRemote: value,
          })
        }),
      )

    if (useRemote) {
      // --- REMOTE MODE ---
      new Setting(container)
        .setName('Server URL')
        .setDesc(
          'Base URL of the remote LightRAG server (e.g., http://192.168.1.100:9621).',
        )
        .addText((text) =>
          text
            .setPlaceholder(`${YOUR_SERVER}`)
            .setValue(plugin.settings.lightRagServerUrl)
            .onChange((value) => {
              void plugin.setSettings({
                ...plugin.settings,
                lightRagServerUrl: value,
              })
            }),
        )

      new Setting(container)
        .setName('API key')
        .setDesc('Optional authentication key for the remote server.')
        .addText((text) =>
          text
            .setPlaceholder('Leave empty if not required')
            .setValue(plugin.settings.lightRagApiKey)
            .onChange((value) => {
              void plugin.setSettings({
                ...plugin.settings,
                lightRagApiKey: value,
              })
            }),
        )
    } else {
      // --- LOCAL MODE ---
      new Setting(container)
        .setName(`Auto-start ${BACKEND_NAME} server`)
        .setDesc('Automatically start the server when Obsidian opens.')
        .addToggle((toggle) =>
          toggle
            .setValue(plugin.settings.enableAutoStartServer)
            .onChange((value) => {
              void plugin.setSettings({
                ...plugin.settings,
                enableAutoStartServer: value,
              })
            }),
        )

      new Setting(container)
        .setName(`${BACKEND_NAME} command path`)
        .setDesc('Path to the lightrag-server executable.')
        .addText((text) =>
          text
            .setPlaceholder('Lightrag server')
            .setValue(plugin.settings.lightRagCommand)
            .onChange((value) => {
              void plugin.setSettings({
                ...plugin.settings,
                lightRagCommand: value,
              })
            }),
        )

      new Setting(container)
        .setName('Graph data directory')
        .setDesc('Folder for the graph database and index files.')
        .addText((text) =>
          text
            .setPlaceholder('.neural_memory')
            .setValue(plugin.settings.lightRagWorkDir)
            .onChange((value) => {
              void (async () => {
                await plugin.setSettings({
                  ...plugin.settings,
                  lightRagWorkDir: value,
                })
                plugin.updateEnvFile()
              })()
            }),
        )
    }

    // 3. Graph Logic Model
    new Setting(container)
      .setName(`Graph logic model (${TERM_LLM})`)
      .setDesc(
        `Select the model ${BACKEND_NAME} will use for indexing/reasoning.`,
      )
      .addDropdown((dropdown) => {
        settings.chatModels.forEach((model) => {
          dropdown.addOption(model.id, `${model.providerId} - ${model.model}`)
        })
        dropdown.addOption('', 'Same as chat model (default)')
        dropdown.setValue(settings.lightRagModelId || '')
        dropdown.onChange((value) => {
          void (async () => {
            await plugin.setSettings({
              ...plugin.settings,
              lightRagModelId: value,
            })
            plugin.updateEnvFile()
          })()
        })
      })

    // 3.5 Graph Embedding Model
    new Setting(container)
      .setName('Graph embedding model')
      .setDesc(
        'Select the model used for vectorizing your notes, (must match the dimensions used during ingestion).',
      )
      .addDropdown((dropdown) => {
        settings.embeddingModels.forEach((model) => {
          dropdown.addOption(
            model.id,
            `${model.providerId} - ${model.model} (${model.dimension || '?'} dim)`,
          )
        })

        dropdown.addOption('', 'Same as chat model (default)')
        dropdown.setValue(settings.lightRagEmbeddingModelId || '')

        dropdown.onChange((value) => {
          void (async () => {
            await plugin.setSettings({
              ...plugin.settings,
              lightRagEmbeddingModelId: value,
            })
            plugin.updateEnvFile()
          })()
        })
      })

    // 4. Language
    new Setting(container)
      .setName('Summary language')
      .setDesc(`Language used by ${BACKEND_NAME} for internal summaries.`)
      .addText((text) =>
        text
          .setPlaceholder('English')
          .setValue(plugin.settings.lightRagSummaryLanguage)
          .onChange((value) => {
            void (async () => {
              await plugin.setSettings({
                ...plugin.settings,
                lightRagSummaryLanguage: value,
              })
              plugin.updateEnvFile()
            })()
          }),
      )

    // 5. Citations
    new Setting(container)
      .setName('Show citations in chat')
      .setDesc(
        'If enabled, the AI will add footnotes like [1] linking to sources.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(plugin.settings.lightRagShowCitations)
          .onChange((value) => {
            void plugin.setSettings({
              ...plugin.settings,
              lightRagShowCitations: value,
            })
          }),
      )

    // --- INCREMENTAL SYNC ---
    container.createEl('h4', { text: 'Vault sync' })

    new Setting(container)
      .setName('Watched folder')
      .setDesc(
        'Vault-relative folder to watch for changes. ' +
          'When set, deleting or renaming a note removes it from the graph automatically, ' +
          'and saving a note re-indexes it after 5 s of inactivity. ' +
          'Leave empty to disable. Only files you have previously ingested are affected.',
      )
      .addText((text) => {
        text
          .setPlaceholder('e.g. Main/Knowledge')
          .setValue(plugin.settings.lightRagSyncFolder)
          .onChange((value) => {
            void plugin.setSettings({
              ...plugin.settings,
              lightRagSyncFolder: value,
            })
          })
        new FolderSuggest(plugin.app, text.inputEl)
      })

    // --- ONTOLOGY SECTION ---
    container.createEl('h4', { text: 'Ontology (categories)' })

    new Setting(container)
      .setName('Use custom entity types')
      .setDesc(
        `Enable to define your own knowledge categories. Disable to use ${BACKEND_NAME} defaults.`,
      )
      .addToggle((toggle) =>
        toggle.setValue(useCustomOntology).onChange((value) => {
          void (async () => {
            await plugin.setSettings({
              ...plugin.settings,
              useCustomEntityTypes: value,
            })
            setUseCustomOntology(value)
            plugin.updateEnvFile()
          })()
        }),
      )

    // CONDITIONAL ONTOLOGY BLOCK
    if (useCustomOntology) {
      const warningDiv = container.createDiv({ cls: 'nrlcmp-setting-warning' })

      // FIX: Sentence case
      warningDiv.createEl('strong', { text: 'Critical warning:' })
      warningDiv.createEl('br')
      // FIX: Sentence case (Entity Types -> entity types)
      warningDiv.createSpan({
        text: 'Changing entity types fundamentally alters how the graph is built.',
      })
      warningDiv.createEl('br')
      // FIX: Sentence case (Graph Data folder -> graph data folder)
      warningDiv.createSpan({ text: 'If you already have data ingested, you ' })
      warningDiv.createEl('strong', {
        text: 'Must delete your graph data folder',
      })
      warningDiv.createSpan({ text: ' and re-ingest all documents.' })

      new Setting(container)
        .setName('Ontology source folder')
        .setDesc(
          'Vault-relative folder with representative notes to analyze (e.g. Main/Memories).',
        )
        .addText((text) => {
          text
            .setPlaceholder(`${FOLDER_DIR}`)
            .setValue(plugin.settings.lightRagOntologyFolder)
            .onChange((value) => {
              void plugin.setSettings({
                ...plugin.settings,
                lightRagOntologyFolder: value,
              })
            })
          new FolderSuggest(plugin.app, text.inputEl)
        })

      let typesTextArea: HTMLTextAreaElement

      new Setting(container)
        .setName('Entity types definition')
        .setDesc('Define the "categories" of your field of knowledge.')
        .addButton((button) =>
          button
            .setButtonText('Analyze & generate')
            .setCta()
            .onClick(() => {
              // Removed async
              void (async () => {
                // Wrapped in void async IIFE
                const newTypes = await plugin.generateEntityTypes()
                if (newTypes && typesTextArea) {
                  typesTextArea.value = newTypes
                  typesTextArea.dispatchEvent(new Event('change'))
                }
              })()
            }),
        )

      const textAreaContainer = container.createDiv({
        cls: 'nrlcmp-textarea-container',
      })
      typesTextArea = textAreaContainer.createEl('textarea', {
        cls: 'nrlcmp-setting-textarea',
      })
      typesTextArea.value = plugin.settings.lightRagEntityTypes
      typesTextArea.onchange = (e) => {
        // Removed async
        const target = e.target as HTMLTextAreaElement
        void (async () => {
          // Wrapped
          await plugin.setSettings({
            ...plugin.settings,
            lightRagEntityTypes: target.value,
          })
          plugin.updateEnvFile()
        })()
      }
    }

    // --- RERANKING SECTION ---
    container.createEl('h4', { text: 'Reranking (precision)' })

    new Setting(container)
      .setName('Rerank provider')
      .setDesc('Service to re-order results. Use "custom" for local servers.')
      .addDropdown((dropdown) => {
        dropdown.addOption('', 'None (disabled)')
        dropdown.addOption('jina', 'Jina AI')
        dropdown.addOption('cohere', 'Cohere')
        dropdown.addOption('custom', 'Custom / local')

        dropdown.setValue(
          currentRerankBinding === 'jina' || currentRerankBinding === 'cohere'
            ? currentRerankBinding
            : currentRerankBinding
              ? 'custom'
              : '',
        )

        dropdown.onChange((value) => {
          void (async () => {
            const newModel =
              value === 'jina'
                ? 'jina-reranker-v2-base-multilingual'
                : value === 'cohere'
                  ? 'rerank-v3.5'
                  : plugin.settings.lightRagRerankModel

            await plugin.setSettings({
              ...plugin.settings,
              lightRagRerankBinding: value,
              lightRagRerankModel: newModel,
            })
            plugin.updateEnvFile()
            setCurrentRerankBinding(value)
          })()
        })
      })

    if (currentRerankBinding && currentRerankBinding !== '') {
      // 1. MODEL
      new Setting(container)
        .setName('Rerank model')
        .setDesc('E.g. "BAAI/bge-reranker-v2-m3" for local.')
        .addText((text) =>
          text
            .setPlaceholder('Model name')
            .setValue(plugin.settings.lightRagRerankModel)
            .onChange((value) => {
              void (async () => {
                await plugin.setSettings({
                  ...plugin.settings,
                  lightRagRerankModel: value,
                })
                plugin.updateEnvFile()
              })()
            }),
        )

      // 2. API KEY
      new Setting(container)
        .setName(`Rerank ${TERM_API} key`)
        .setDesc('Leave empty for local open servers.')
        .addText((text) =>
          text
            .setPlaceholder('Your key here')
            .setValue(plugin.settings.lightRagRerankApiKey)
            .onChange((value) => {
              void (async () => {
                await plugin.setSettings({
                  ...plugin.settings,
                  lightRagRerankApiKey: value,
                })
                plugin.updateEnvFile()
              })()
            }),
        )

      // 3. HOST URL
      if (currentRerankBinding === 'custom') {
        new Setting(container)
          .setName('Local/custom host URL')
          .setDesc(
            'The full URL to the rerank endpoint (e.g. http://localhost:8000/v1/rerank).',
          )
          .addText((text) =>
            text
              .setPlaceholder(`${RERANK_ENDPOINT}`)
              .setValue(plugin.settings.lightRagRerankHost || '')
              .onChange((value) => {
                void (async () => {
                  await plugin.setSettings({
                    ...plugin.settings,
                    lightRagRerankHost: value,
                  })
                  plugin.updateEnvFile()
                })()
              }),
          )

        // 4. BINDING
        new Setting(container)
          .setName('Binding type')
          .setDesc(
            `Internal binding type for ${BACKEND_NAME} (usually "cohere" for compatible local ${TERM_APIs}).`,
          )
          .addText((text) =>
            text
              .setPlaceholder(`${COHERE}`)
              .setValue(plugin.settings.lightRagRerankBindingType || 'cohere')
              .onChange((value) => {
                void (async () => {
                  await plugin.setSettings({
                    ...plugin.settings,
                    lightRagRerankBindingType: value,
                  })
                  plugin.updateEnvFile()
                })()
              }),
          )
      }
    }

    // Apply changes & restart — after Reranking, before Visualization
    new Setting(container)
      .setName('Apply changes & restart')
      .setDesc(
        'You *must* restart the server after changing any setting above to apply the new configuration (.env).',
      )
      .setClass('nrlcmp-restart-setting')
      .addButton((button) =>
        button
          .setButtonText('Restart server now')
          .setCta()
          .onClick(() => {
            new Notice('Restarting server...')
            plugin.restartLightRagServer()
          }),
      )

    // VISUALIZATION — Advanced env config moved to Advanced tab
    container.createEl('h4', { text: 'Visualization' })

    new Setting(container)
      .setName('Graph rendering engine')
      .setDesc(
        `Choose ${TWO_D} for performance/clarity or ${THREE_D} for immersion (requires ${GRAPH_UNIT}).`,
      )
      .addDropdown((dropdown) => {
        dropdown.addOption('2d', `${TWO_D} - Fast & clean`)
        dropdown.addOption('3d', `${THREE_D} - Immersive - uses ${GRAPH_UNIT}`)
        dropdown.setValue(plugin.settings.graphViewMode)
        dropdown.onChange((value) => {
          // Removed async
          void plugin.setSettings({
            ...plugin.settings,
            graphViewMode: value as '2d' | '3d',
          })
        })
      })
  }, [settings, currentRerankBinding, useCustomOntology, useRemote])

  // Reactively update the version badge on every server info change
  // without rebuilding the entire DOM (no focus loss, no flicker).
  useEffect(() => {
    const badge = settingsRef.current?.querySelector<HTMLElement>('[data-nc-version]')
    if (!badge) return

    const { version, checked } = serverInfo

    // Reset all state classes first
    badge.classList.remove('nc-version-badge--online', 'nc-version-badge--offline')

    if (!checked) {
      // Health check hasn't run yet — hide badge completely
      badge.textContent = ''
    } else if (version) {
      // Online with detected version
      badge.textContent = `v${version}`
      badge.classList.add('nc-version-badge--online')
    } else {
      // Checked and server is offline
      badge.textContent = 'offline'
      badge.classList.add('nc-version-badge--offline')
    }
  }, [serverInfo])

  return <div ref={settingsRef} />
}
