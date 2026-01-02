import { Setting } from 'obsidian'
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
          }),
      )

  }, [plugin.settings]) // Se actualiza si cambian los settings

  return <div ref={settingsRef} />
}