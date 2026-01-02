import { App } from 'obsidian'
import SmartComposerPlugin from '../../main'
import { ObsidianButton } from '../common/ObsidianButton'
import { ObsidianSetting } from '../common/ObsidianSetting'

import { ChatSection } from './sections/ChatSection'
import { EtcSection } from './sections/EtcSection'
// import { McpSection } from './sections/McpSection' // Opcional: Si no usamos MCP, comentar
import { ModelsSection } from './sections/ModelsSection'
import { ProvidersSection } from './sections/ProvidersSection'
import { NeuralSection } from './sections/NeuralSection' // Nuestra joya
// import { RAGSection } from './sections/RAGSection' // <--- ELIMINADO (Ya no usamos RAG local)
import { TemplateSection } from './sections/TemplateSection'

type SettingsTabRootProps = {
  app: App
  plugin: SmartComposerPlugin
}

export function SettingsTabRoot({ app, plugin }: SettingsTabRootProps) {
  return (
    <>
      {/* 1. ENCABEZADO PERSONALIZADO */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h2 style={{ marginBottom: '5px' }}>🧠 Neural Composer</h2>
        <p style={{ opacity: 0.7, marginTop: '0' }}>
            Graph-Powered Memory for Obsidian
        </p>
      </div>

      <ObsidianSetting
        name="About & Support"
        desc="Neural Composer is a specialized fork of Smart Composer, powered by LightRAG."
        heading
      >
        <ObsidianButton
          text="Original Project (Smart Composer)"
          onClick={() => window.open('https://github.com/glowingjade/obsidian-smart-composer', '_blank')}
        />
      </ObsidianSetting>

      {/* 2. LO MÁS IMPORTANTE PRIMERO */}
      <ChatSection />
      
      {/* 3. NUESTRA SECCIÓN ESTRELLA */}
      <NeuralSection plugin={plugin} />

      {/* 4. CONFIGURACIÓN DE MODELOS (Necesario para el chat normal) */}
      <ProvidersSection app={app} plugin={plugin} />
      <ModelsSection app={app} plugin={plugin} />

      {/* 5. EXTRAS ÚTILES */}
      <TemplateSection app={app} />
      <EtcSection app={app} plugin={plugin} />
      
      {/* SECCIONES OCULTAS/DESACTIVADAS POR NO SER COMPATIBLES CON LIGHTRAG */}
      {/* <RAGSection app={app} plugin={plugin} /> */} 
      {/* <McpSection app={app} plugin={plugin} /> */}
    </>
  )
}