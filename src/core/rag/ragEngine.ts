import { App, TFile , Notice} from 'obsidian' // <--- 1. ¡IMPORTANTE! Agregado TFile

import { QueryProgressState } from '../../components/chat-view/QueryProgress'
import { VectorManager } from '../../database/modules/vector/VectorManager'
import { SelectEmbedding } from '../../database/schema'
import { SmartComposerSettings } from '../../settings/schema/setting.types'
import { EmbeddingModelClient } from '../../types/embedding'

import { getEmbeddingModelClient } from './embedding'



export class RAGEngine {
  private app: App
  private settings: SmartComposerSettings
  private vectorManager: VectorManager | null = null
  private embeddingModel: EmbeddingModelClient | null = null
    // --- NUEVA PROPIEDAD ---
  private restartServerCallback: () => Promise<void>;

  constructor(
    app: App,
    settings: SmartComposerSettings,
    vectorManager: VectorManager,
    // --- NUEVO PARÁMETRO ---
    restartServerCallback?: () => Promise<void> 
  ) {
    this.app = app
    this.settings = settings
    this.vectorManager = vectorManager
    // Asignamos la función (o una vacía si no existe para evitar crash)
    this.restartServerCallback = restartServerCallback || (async () => {}); 
    this.embeddingModel = getEmbeddingModelClient({
      settings,
      embeddingModelId: settings.embeddingModelId,
    })
  }

  cleanup() {
    this.embeddingModel = null
    this.vectorManager = null
  }

  setSettings(settings: SmartComposerSettings) {
    this.settings = settings
    this.embeddingModel = getEmbeddingModelClient({
      settings,
      embeddingModelId: settings.embeddingModelId,
    })
  }

  async updateVaultIndex(
    options: { reindexAll: boolean } = { reindexAll: false },
    onQueryProgressChange?: (queryProgress: QueryProgressState) => void,
  ): Promise<void> {
    // Método neutralizado o mantenido por compatibilidad, pero no lo usamos activamente
    if (!this.embeddingModel) {
      throw new Error('Embedding model is not set')
    }
  }

// --- INJERTO CORA: INGESTA CORREGIDA (VERSIÓN SWAGGER) ---
  async insertDocument(content: string, description?: string): Promise<boolean> {
    const safeName = description && description.trim() ? description : `Note_${Date.now()}.md`;
    
    console.log(`🕸️ [Cora Plugin] Ingestando en /documents/texts: ${safeName}...`);
    
    try {
      // 1. Usamos el endpoint PLURAL (/texts)
      const response = await fetch("http://localhost:9621/documents/texts", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
        },
        // 2. BODY SEGÚN LA IMAGEN
        // Arrays paralelos: texts y file_sources
        body: JSON.stringify({ 
            "texts": [content],
            "file_sources": [safeName] 
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      console.log("✅ [Cora Plugin] Ingesta exitosa:", data);
      return true;

    } catch (error) {
      console.error("❌ Error en ingesta:", error);
      new Notice(`Error al guardar en el Grafo: ${error.message}`);
      return false;
    }
  }
//------------------------------------------------


// --- INJERTO CORA: AUTO-HEALING RAG ---
  async processQuery({
    query,
    scope,
    onQueryProgressChange,
  }: {
    query: string
    scope?: {
      files: string[]
      folders: string[]
    }
    onQueryProgressChange?: (queryProgress: QueryProgressState) => void
  }): Promise<
    (Omit<SelectEmbedding, 'embedding'> & {
      similarity: number
    })[]
  > {
    
    // 1. ESTRATEGIA LOCAL (Se mantiene igual)
    if (scope && scope.files && scope.files.length > 0) {
        // ... (Copia aquí tu lógica local anterior que ya funcionaba) ...
        // (Resumida para ahorrar espacio en el chat, pero tú mantén la que tenías)
        const localResults: any[] = [];
        for (const filePath of scope.files) {
             const file = this.app.vault.getAbstractFileByPath(filePath);
             if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                localResults.push({
                    id: -1, model: 'local-file', path: filePath, content: content, similarity: 1.0, mtime: file.stat.mtime,
                    metadata: { startLine: 0, endLine: 0, fileName: file.name, content: content }
                });
             }
        }
        onQueryProgressChange?.({ type: 'querying-done', queryResult: [] });
        return localResults;
    }

    // 2. ESTRATEGIA GLOBAL CON AUTO-REPARACIÓN
    console.log("🕸️ [Cora Plugin] Consultando Grafo Global...");
    onQueryProgressChange?.({ type: 'querying' })

    const performQuery = async () => {
        const response = await fetch("http://localhost:9621/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                query: query, mode: "hybrid", stream: false, only_need_context: false
            })
        });
        if (!response.ok) throw new Error(`Status ${response.status}`);
        return await response.json();
    };

    try {
      let data;
      
      try {
          // INTENTO 1: Normal
          data = await performQuery();
      } catch (firstError) {
          console.warn("⚠️ Falló el primer intento. El servidor podría estar dormido.", firstError);
          
          if (this.settings.enableAutoStartServer) {
              // INTENTO DE RESURRECCIÓN
              onQueryProgressChange?.({ type: 'querying' }); // Spinner simple
              new Notice("🧠 Despertando el cerebro... (Espera unos segundos)");
              
              // 1. Llamar al reinicio
              await this.restartServerCallback();
              
              // 2. Esperar cortesía a que Uvicorn arranque (4 segundos)
              await new Promise(resolve => setTimeout(resolve, 4000));
              
              console.log("🔄 Reintentando consulta...");
              // INTENTO 2: Post-Resurrección
              data = await performQuery();
          } else {
              throw firstError; // Si el auto-start está apagado, fallar normal.
          }
      }

      // --- PROCESAMIENTO DE RESPUESTA (Igual que antes) ---
      console.log("✅ Datos recibidos:", data);
      const results: any[] = [];
      const graphAnswer = typeof data === 'string' ? data : (data.response || "");
      
      if (graphAnswer) {
          results.push({
              id: -1, model: 'lightrag-answer', path: "❤️ Respuesta de Cora (Grafo)",
              content: graphAnswer, similarity: 1.0, mtime: Date.now(),
              metadata: { startLine: 0, endLine: 0, fileName: "GraphAnswer", content: graphAnswer }
          });
      }

      if (data.references && Array.isArray(data.references)) {
          for (let i = 0; i < data.references.length; i++) {
              const ref = data.references[i];
              const filePath = ref.file_path || `Ref #${i+1}`;
              results.push({
                  id: -(i + 2), model: 'lightrag-ref', path: `📂 ${filePath}`,
                  content: `[Fuente del Grafo]`, similarity: 0.5, mtime: Date.now(),
                  metadata: { startLine: 0, endLine: 0, fileName: filePath }
              });
          }
      }

      onQueryProgressChange?.({ type: 'querying-done', queryResult: [] })
      return results;

    } catch (error) {
      console.error("❌ Error definitivo:", error);
      const errorDoc: any = {
          id: -2, path: "⚠️ Cerebro Desconectado",
          content: `No pude conectar con el servidor LightRAG.\nIntenté reiniciarlo pero no respondió.\n\nError: ${error.message}`,
          similarity: 1.0, metadata: { startLine: 0, endLine: 0 }
      };
      return [errorDoc];
    }
  }

  private async getQueryEmbedding(query: string): Promise<number[]> {
    if (!this.embeddingModel) {
      throw new Error('Embedding model is not set')
    }
    return this.embeddingModel.getEmbedding(query)
  }
}