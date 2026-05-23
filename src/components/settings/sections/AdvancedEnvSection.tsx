import { Notice, Setting } from 'obsidian'
import { useEffect, useRef, useState } from 'react'

import NeuralComposerPlugin from '../../../main'
import { ADV_SETTINGS, BACKEND_NAME } from './NeuralSection'

type AdvancedEnvSectionProps = {
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

export function AdvancedEnvSection({ plugin }: AdvancedEnvSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [settings, setLocalSettings] = useState(plugin.settings)

  useEffect(() => {
    return plugin.addSettingsChangeListener(setLocalSettings)
  }, [plugin])

  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.empty()
    const container = containerRef.current

    container.createEl('h4', { text: 'Advanced configuration (total control)' })

    const details = container.createEl('details')
    const summary = details.createEl('summary', {
      text: 'Edit custom .env variables',
    })
    summary.addClass('nrlcmp-cursor-pointer')

    const advancedContainer = details.createDiv({
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
  }, [settings, plugin])

  return <div ref={containerRef} />
}
