import { App, Notice, Setting } from 'obsidian'
import { useEffect, useRef, useState } from 'react'

import NeuralComposerPlugin from '../../../main'
import { EnvEditorModal } from '../../modals/EnvEditorModal'
import { ADV_SETTINGS, BACKEND_NAME } from './NeuralSection'

type ServerActionsSectionProps = {
  app: App
  plugin: NeuralComposerPlugin
}

const ENV_TEMPLATE = `# --- Query Configuration ---
# ENABLE_LLM_CACHE=true
# TOP_K=40
# CHUNK_TOP_K=20
# MAX_TOTAL_TOKENS=30000
# KG_CHUNK_PICK_METHOD=VECTOR

# --- Document Processing ---
# CHUNK_SIZE=1200
# CHUNK_OVERLAP_SIZE=100
# ENABLE_LLM_CACHE_FOR_EXTRACT=true

# --- Timeouts ---
# LLM_TIMEOUT=180
# EMBEDDING_TIMEOUT=30

# --- Storage Selection (Advanced) ---
# LIGHTRAG_KV_STORAGE=JsonKVStorage
# LIGHTRAG_VECTOR_STORAGE=NanoVectorDBStorage
`

export function ServerActionsSection({
  app,
  plugin,
}: ServerActionsSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [settings, setLocalSettings] = useState(plugin.settings)

  useEffect(() => {
    return plugin.addSettingsChangeListener(setLocalSettings)
  }, [plugin])

  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.empty()
    const container = containerRef.current

    // 1. Advanced configuration (total control) — env textarea
    container.createEl('h4', {
      text: 'Advanced configuration (total control)',
    })

    container.createEl('p', {
      text: 'Edit custom .env variables',
      cls: 'nrlcmp-env-subtitle',
    })

    const advancedContainer = container.createDiv({
      cls: 'nrlcmp-advanced-container',
    })

    advancedContainer.createEl('p', {
      text: 'Variables defined here will be appended to the .env file and will *override* any plugin defaults. Use this for advanced tuning (context limits, timeouts, chunking strategies).',
      cls: 'setting-item-description',
    })

    new Setting(advancedContainer)
      .setClass('nrlcmp-env-setting')
      .addTextArea((text) => {
        text
          .setPlaceholder(ADV_SETTINGS)
          .setValue(plugin.settings.lightRagCustomEnv)
          .onChange((value) => {
            void plugin.setSettings({
              ...plugin.settings,
              lightRagCustomEnv: value,
            })
          })
        text.inputEl.addClass('nrlcmp-env-textarea')
      })

    new Setting(advancedContainer)
      .setName('Load full configuration template')
      .setDesc(
        `Paste the full list of available ${BACKEND_NAME} variables (commented out) into the box above.`,
      )
      .addButton((btn) =>
        btn.setButtonText('Insert template').onClick(() => {
          void (async () => {
            if (plugin.settings.lightRagCustomEnv.length > 50) {
              new Notice('Overwriting existing custom configuration...')
            }
            await plugin.setSettings({
              ...plugin.settings,
              lightRagCustomEnv: ENV_TEMPLATE,
            })
            const ta = advancedContainer.querySelector('textarea')
            if (ta) ta.value = ENV_TEMPLATE
          })()
        }),
      )

    // 2. Server configuration — Review .env & restart
    new Setting(container)
      .setName('Server configuration')
      .setDesc(
        'Review the generated .env file, tweak advanced parameters, and restart the server.',
      )
      .addButton((button) =>
        button
          .setButtonText('Review .env & restart')
          .setCta()
          .onClick(() => {
            new EnvEditorModal(app, plugin).open()
          }),
      )

    // 3. Reprocess failed documents
    new Setting(container)
      .setName('Reprocess failed documents')
      .setDesc(
        'Re-submits any documents that failed entity extraction (e.g. after fixing the LLM configuration). The server must be running.',
      )
      .addButton((button) =>
        button.setButtonText('Reprocess failed').onClick(() => {
          void plugin.reprocessFailedDocuments()
        }),
      )
  }, [settings, plugin, app])

  return (
    <div className="nrlcmp-settings-section">
      <div className="nrlcmp-settings-header">Server management</div>
      <div ref={containerRef} />
    </div>
  )
}
