import { App, Notice, Setting } from 'obsidian'
import { useEffect, useRef } from 'react'

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

  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.empty()
    const container = containerRef.current

    // Debounce timer for the env textarea — declared here so the cleanup
    // function can cancel any pending save when the effect tears down.
    let saveTimer: ReturnType<typeof setTimeout> | null = null

    // ── 1. Advanced configuration ─────────────────────────────────────────
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
          // Read current value directly from plugin (once, on mount).
          // We intentionally do NOT track `settings` in the effect deps so
          // that typing here never triggers a DOM rebuild and focus loss.
          .setValue(plugin.settings.lightRagCustomEnv)
          .onChange((value) => {
            // Debounce: persist to plugin settings only after 800 ms of
            // inactivity.  This avoids calling setSettings() on every single
            // keystroke, which would broadcast a settings-change event,
            // cause parent components to re-render, and destroy this textarea.
            if (saveTimer) clearTimeout(saveTimer)
            saveTimer = setTimeout(() => {
              saveTimer = null
              void plugin.setSettings({
                ...plugin.settings,
                lightRagCustomEnv: value,
              })
            }, 800)
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
            // Sync the DOM value directly — the effect won't re-run so we
            // must update the textarea imperatively.
            const ta = advancedContainer.querySelector('textarea')
            if (ta) ta.value = ENV_TEMPLATE
          })()
        }),
      )

    // ── 2. Server configuration ───────────────────────────────────────────
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

    // Cleanup: cancel any pending save when the component unmounts.
    return () => {
      if (saveTimer) clearTimeout(saveTimer)
    }
    // Intentionally excludes `settings` from deps.
    // Adding it would cause the effect to re-run on every save, which clears
    // the DOM (container.empty()), destroys the textarea, and loses focus.
    // The textarea value is read once at mount; subsequent persistence is
    // handled by the debounced onChange above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin, app])

  return (
    <div className="nrlcmp-settings-section">
      <div className="nrlcmp-settings-header">Server management</div>
      <div ref={containerRef} />
    </div>
  )
}
