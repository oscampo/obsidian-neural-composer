import { App, TFile, Notice } from 'obsidian'

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
  private restartServerCallback: () => Promise<void>;

  constructor(
    app: App,
    settings: SmartComposerSettings,
    vectorManager: VectorManager,
    restartServerCallback?: () => Promise<void> 
  ) {
    this.app = app
    this.settings = settings
    this.vectorManager = vectorManager
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
    if (!this.embeddingModel) throw new Error('Embedding model is not set')
  }

  // --- 1. INGESTA TEXTO ---
  async insertDocument(content: string, description?: string): Promise<boolean> {
    const safeName = description && description.trim() ? description : `Note_${Date.now()}.md`;
    console.log(`🕸️ Ingesting Text: ${safeName}...`);
    try {
      const response = await fetch("http://localhost:9621/documents/texts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "texts": [content], "file_sources": [safeName] })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Error ${response.status}: ${errText}`);
      }
      console.log("✅ Text input successful.");
      return true;
    } catch (error) {
      console.error("❌ Error in input of text:", error);
      new Notice(`Error saving to the graph: ${error.message}`);
      return false;
    }
  }

  // --- 2. INGESTA BINARIA ---
  async uploadDocument(file: TFile): Promise<boolean> {
    console.log(`🕸️ Uploading binary: ${file.name}...`);
    try {
      const arrayBuffer = await this.app.vault.readBinary(file);
      const blob = new Blob([arrayBuffer]);
      const formData = new FormData();
      formData.append('file', blob, file.name); 
      
      const response = await fetch("http://localhost:9621/documents/upload", {
        method: "POST",
        body: formData 
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Error ${response.status}: ${errText}`);
      }
      console.log("✅ Binary upload successful.");
      return true;
    } catch (error) {
      console.error("❌ Error uploading file:", error);
      new Notice(`Error uploading ${file.name}: ${error.message}`);
      return false;
    }
  }

  // --- 3. CONSULTA MAESTRA (PASSTHROUGH) ---
  async processQuery({
    query, scope, onQueryProgressChange,
  }: {
    query: string
    scope?: { files: string[], folders: string[] }
    onQueryProgressChange?: (queryProgress: QueryProgressState) => void
  }): Promise<(Omit<SelectEmbedding, 'embedding'> & { similarity: number })[]> {
    
    // A. ESTRATEGIA LOCAL
    if (scope && scope.files && scope.files.length > 0) {
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

    // B. ESTRATEGIA GLOBAL
    console.log("🕸️ Consulting Global Graph...");
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
          data = await performQuery();
      } catch (firstError) {
          console.warn("⚠️ First attempt failed...", firstError);
          if (this.settings.enableAutoStartServer) {
              onQueryProgressChange?.({ type: 'querying' }); 
              new Notice("🧠 Waking up the system...");
              await this.restartServerCallback();
              await new Promise(resolve => setTimeout(resolve, 4000));
              data = await performQuery();
          } else {
              throw firstError;
          }
      }

      console.log("✅ Data received:", data);
      const results: any[] = [];
      const graphAnswer = typeof data === 'string' ? data : (data.response || "");
      
      // --- CONSTRUCCIÓN DEL DOCUMENTO MAESTRO ---
      // Combinamos la respuesta + la lista de referencias en un solo texto
      let masterContent = graphAnswer;

      if (data.references && Array.isArray(data.references)) {
          masterContent += "\n\n--- ORIGINAL REFERENCES (DATA LAYER) ---\n";
          data.references.forEach((ref: any, index: number) => {
              const docName = ref.file_path || `Source ${index + 1}`;
              // Usamos el índice original [1], [2]...
              masterContent += `[${index + 1}] ${docName}\n`;
          });
      }

      // 1. Inyectar Documento Maestro
      if (masterContent) {
          results.push({
              id: -1, 
              model: 'lightrag-master',
              path: "🧠 Graph's Memory",
              content: masterContent, // <--- Aquí va todo junto
              similarity: 1.0, 
              mtime: Date.now(),
              metadata: { startLine: 0, endLine: 0, fileName: "GraphAnswer", content: masterContent }
          });
      }

      // 2. Inyectar Referencias Desglosadas (Para la UI)
      if (data.references && Array.isArray(data.references)) {
          for (let i = 0; i < data.references.length; i++) {
              const ref = data.references[i];
              const filePath = ref.file_path || `Source #${i+1}`;
              const docName = `[${i + 1}] ${filePath}`; 
              
              results.push({
                  id: -(i + 2), 
                  model: 'lightrag-ref', 
                  path: `📂 ${docName}`, 
                  content: `[Full Content of ${docName}]:\n${ref.content || "..."}`, 
                  similarity: 0.5, 
                  mtime: Date.now(),
                  metadata: { startLine: 0, endLine: 0, fileName: filePath }
              });
          }
      }

      onQueryProgressChange?.({ type: 'querying-done', queryResult: [] })
      return results;

    } catch (error) {
      console.error("❌ Fatal error:", error);
      return [];
    }
  }

  private async getQueryEmbedding(query: string): Promise<number[]> {
    if (!this.embeddingModel) throw new Error('Embedding model not set');
    return this.embeddingModel.getEmbedding(query)
  }
}