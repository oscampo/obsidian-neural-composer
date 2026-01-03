import { Setting, DropdownComponent } from 'obsidian' // <--- Agregar DropdownComponent
import { useEffect, useRef } from 'react'

import SmartComposerPlugin from '../../../main'

export const NeuralSection = ({ plugin }: { plugin: SmartComposerPlugin }) => {
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!settingsRef.current) return
    
    // Limpiamos para evitar duplicados al refrescar
    settingsRef.current.empty()
    
    const container = settingsRef.current

    container.createEl('h3', { text: '🧠 Neural Backend (LightRAG)' })

    // 1. Toggle Auto-start
    new Setting(container)
      .setName('Auto-start LightRAG Server')
      .setDesc('Automatically start the server when Obsidian opens.')
      .addToggle((toggle) =>
        toggle
          .setValue(plugin.settings.enableAutoStartServer)
          .onChange(async (value) => {
            await plugin.setSettings({
              ...plugin.settings,
              enableAutoStartServer: value,
            })
          }),
      )

    // 2. Command Path
    new Setting(container)
      .setName('LightRAG Command Path')
      .setDesc('Absolute path to the executable (e.g., lightrag-server.exe in your venv).')
      .addText((text) =>
        text
          .setPlaceholder('D:\\...\\lightrag-server.exe')
          .setValue(plugin.settings.lightRagCommand)
          .onChange(async (value) => {
            await plugin.setSettings({
              ...plugin.settings,
              lightRagCommand: value,
            })
          }),
      )

    // 3. Working Directory
    new Setting(container)
      .setName('Graph Data Directory')
      .setDesc('Absolute path to the folder containing your graph data.')
      .addText((text) =>
        text
          .setPlaceholder('D:\\...\\cora_graph_memory')
          .setValue(plugin.settings.lightRagWorkDir)
          .onChange(async (value) => {
            await plugin.setSettings({
              ...plugin.settings,
              lightRagWorkDir: value,
            })
             await plugin.updateEnvFile(); 
          }),
      )

     // --- NUEVO: SELECTOR DE MODELO DEDICADO ---
    new Setting(container)
      .setName('Graph Logic Model (LLM)')
      .setDesc('Select the model LightRAG will use for indexing and reasoning. Can be different from your Chat model.')
      .addDropdown((dropdown) => {
        // 1. Llenar la lista con los modelos disponibles
        plugin.settings.chatModels.forEach((model) => {
          dropdown.addOption(model.id, `${model.providerId} - ${model.model}`)
        })
        
        // 2. Opción "Igual que el Chat" (Default)
        dropdown.addOption('', 'Same as Chat Model (Default)')

        // 3. Configurar valor actual
        dropdown.setValue(plugin.settings.lightRagModelId || '')

        dropdown.onChange(async (value) => {
          await plugin.setSettings({
            ...plugin.settings,
            lightRagModelId: value,
          })
           await plugin.updateEnvFile(); 
        })
      })

    // 4. Summary Language
    new Setting(container)
      .setName('Summary Language')
      .setDesc('Language used by LightRAG for internal summaries (e.g., "Spanish", "English").')
      .addText((text) =>
        text
          .setPlaceholder('English')
          .setValue(plugin.settings.lightRagSummaryLanguage)
          .onChange(async (value) => {
            await plugin.setSettings({
              ...plugin.settings,
              lightRagSummaryLanguage: value,
            })
             await plugin.updateEnvFile(); 
          }),
      )


    // 5. CITATION TOGGLE
    new Setting(container)
      .setName('Show Citations in Chat')
      .setDesc('If enabled, the AI will add footnotes (e.g., [1]) linking to sources. Disable for a more natural conversation.')
      .addToggle((toggle) =>
        toggle
          .setValue(plugin.settings.lightRagShowCitations)
          .onChange(async (value) => {
            await plugin.setSettings({
              ...plugin.settings,
              lightRagShowCitations: value,
            })
          }),
      )

    // 6. RESTART BUTTON
    new Setting(container)
      .setName('Apply Changes & Restart')
      .setDesc('Restart the LightRAG server to apply new configuration settings (.env).')
      .addButton((button) =>
        button
          .setButtonText('Restart Server')
          .setCta() // Call To Action (lo hace azul/resaltado)
          .onClick(async () => {
            // Deshabilitar botón visualmente si quisieras, 
            // pero por ahora solo llamamos a la acción.
            await plugin.restartLightRagServer();
          }),
      )

  }, [plugin.settings]) // Se actualiza si cambian los settings

  return <div ref={settingsRef} />
}