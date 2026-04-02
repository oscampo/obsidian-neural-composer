import { App, TFile, Notice, requestUrl } from 'obsidian'

import { QueryProgressState } from '../../components/chat-view/QueryProgress'
import { VectorManager } from '../../database/modules/vector/VectorManager'
import { SelectEmbedding } from '../../database/schema'
import { NeuralComposerSettings } from '../../settings/schema/setting.types'
import { EmbeddingModelClient } from '../../types/embedding'

import { getEmbeddingModelClient } from './embedding'

// Helper type matching the method signature to avoid 'any' casting
type RagQueryResult = (Omit<SelectEmbedding, 'embedding'> & { similarity: number })[];

// Interface for internal results
interface RagResult extends Partial<SelectEmbedding> {
    id: number;
    model?: string;
    path: string;
    content: string;
    similarity: number;
    mtime?: number;
    metadata?: {
        startLine: number;
        endLine: number;
        fileName?: string;
        content?: string;
    };
}

// FIX: New interface to type the API response and avoid 'any'
interface LightRagAPIResponse {
    response?: string;
    references?: {
        file_path?: string;
        content?: string;
    }[];
    [key: string]: unknown; // Allow other props safely
}

export class RAGEngine {
  private app: App
  private settings: NeuralComposerSettings
  private vectorManager: VectorManager | null = null
  private embeddingModel: EmbeddingModelClient | null = null
  private restartServerCallback: () => Promise<void>;

  constructor(
    app: App,
    settings: NeuralComposerSettings,
    vectorManager: VectorManager,
    restartServerCallback?: () => Promise<void> 
  ) {
    this.app = app
    this.settings = settings
    this.vectorManager = vectorManager
    this.restartServerCallback = restartServerCallback || (() => Promise.resolve()); 
    this.embeddingModel = getEmbeddingModelClient({
      settings,
      embeddingModelId: settings.embeddingModelId,
    })
  }

  cleanup() {
    this.embeddingModel = null
    this.vectorManager = null
  }

  setSettings(settings: NeuralComposerSettings) {
    this.settings = settings
    this.embeddingModel = getEmbeddingModelClient({
      settings,
      embeddingModelId: settings.embeddingModelId,
    })
  }

  // Correct: Returns Promise<void> directly without async/await overhead
  updateVaultIndex(
    options: { reindexAll: boolean } = { reindexAll: false },
    onQueryProgressChange?: (queryProgress: QueryProgressState) => void,
  ): Promise<void> {
    if (!this.embeddingModel) return Promise.reject(new Error('Embedding model is not set'));
    return Promise.resolve();
  }

  // --- 1. TEXT INGESTION ---
  async insertDocument(content: string, description?: string): Promise<boolean> {
    const safeName = description && description.trim() ? description : `Note_${Date.now()}.md`;
    try {
      const response = await requestUrl({
          url: `${this.settings.lightRagServerUrl}/documents/texts`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ "texts": [content], "file_sources": [safeName] }),
          throw: false
      });

      if (response.status >= 400) {
        throw new Error(`Error ${response.status}: ${response.text}`);
      }
      return true;
    } catch (error) {
      console.error("Error in input of text:", error);
      new Notice(`Error saving to the graph: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  // --- 2. BINARY INGESTION (Manual Multipart) ---
  async uploadDocument(file: TFile): Promise<boolean> {
    try {
      const fileData = await this.app.vault.readBinary(file);
      
      const boundary = "----ObsidianBoundary" + Date.now().toString(16);
      
      const prePart = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
      const postPart = `\r\n--${boundary}--\r\n`;

      const preBuffer = new TextEncoder().encode(prePart);
      const postBuffer = new TextEncoder().encode(postPart);
      const bodyBuffer = new Uint8Array(preBuffer.length + fileData.byteLength + postBuffer.length);

      bodyBuffer.set(preBuffer, 0);
      bodyBuffer.set(new Uint8Array(fileData), preBuffer.length);
      bodyBuffer.set(postBuffer, preBuffer.length + fileData.byteLength);

      const response = await requestUrl({
        url: `${this.settings.lightRagServerUrl}/documents/upload`,
        method: "POST",
        headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`
        },
        body: bodyBuffer.buffer,
        throw: false
      });

      if (response.status >= 400) {
        throw new Error(`Error ${response.status}: ${response.text}`);
      }

      return true;
    } catch (error) {
      console.error("Error uploading file:", error);
      new Notice(`Error uploading ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  // --- 3. MASTER QUERY ---
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
  }): Promise<RagQueryResult> {
    
    // 1. LOCAL STRATEGY
    if (scope && scope.files && scope.files.length > 0) {
        const localResults: RagResult[] = [];
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
        // Safe casting to expected return type
        return localResults as unknown as RagQueryResult;
    }

    // 2. GLOBAL STRATEGY
    onQueryProgressChange?.({ type: 'querying' })

    // FIX: Typed return promise to avoid implicit 'any' from response.json
    const performQuery = async (): Promise<LightRagAPIResponse> => {
        const response = await requestUrl({
            url: `${this.settings.lightRagServerUrl}/query`,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: query, mode: "hybrid", stream: false, only_need_context: false
            }),
            throw: false
        });
        
        if (response.status >= 400) {
            const errorText = response.text;
            if (errorText.toLowerCase().includes("quota") || errorText.toLowerCase().includes("credit") || errorText.toLowerCase().includes("429")) {
                new Notice("Rerank error: quota exceeded. Please check your API key.", 0);
            }
            else if (errorText.toLowerCase().includes("rerank")) {
                new Notice(`Reranking error: ${errorText}`, 5000);
            }
            throw new Error(`Status ${response.status}: ${errorText}`);
        }
        // FIX: Cast to interface instead of returning 'any'
        return response.json as LightRagAPIResponse;
    };

    try {
      // FIX: Explicit type for data variable
      let data: LightRagAPIResponse;
      try {
          data = await performQuery();
      } catch (firstError) {
          console.warn("First attempt failed...", firstError);
          if (this.settings.enableAutoStartServer) {
              onQueryProgressChange?.({ type: 'querying' }); 
              new Notice("Waking up the system...");
              await this.restartServerCallback();
              await new Promise(resolve => setTimeout(resolve, 4000));
              data = await performQuery();
          } else {
              throw firstError;
          }
      }

      const results: RagResult[] = [];
      // Data is now typed, so we can access properties safely
      const graphAnswer = data.response || "";
      
      let masterContent = graphAnswer;
      if (data.references && Array.isArray(data.references)) {
          masterContent += "\n\n--- ORIGINAL REFERENCES (DATA LAYER) ---\n";
          // CORRECCIÓN: Quitamos ': any' y dejamos que TS infiera el tipo desde la interfaz LightRagAPIResponse
          data.references.forEach((ref, index) => {
              const docName = ref.file_path || `Source ${index + 1}`;
              masterContent += `[${index + 1}] ${docName}\n`;
          });
      }

      if (masterContent) {
          results.push({
              id: -1, model: 'lightrag-master', path: "Graph's memory",
              content: masterContent, similarity: 1.0, mtime: Date.now(),
              metadata: { startLine: 0, endLine: 0, fileName: "Graph answer", content: masterContent }
          });
      }

      if (data.references && Array.isArray(data.references)) {
          for (let i = 0; i < data.references.length; i++) {
              const ref = data.references[i];
              const filePath = ref.file_path || `Source #${i+1}`;
              const docName = `[${i + 1}] ${filePath}`; 
              results.push({
                  id: -(i + 2), model: 'lightrag-ref', path: `${docName}`,
                  content: `[Full content of ${docName}]:\n${ref.content || "..."}`, 
                  similarity: 0.5, mtime: Date.now(),
                  metadata: { startLine: 0, endLine: 0, fileName: filePath }
              });
          }
      }

      onQueryProgressChange?.({ type: 'querying-done', queryResult: [] })
      return results as unknown as RagQueryResult;

    } catch (error: unknown) {
      console.error("Final error:", error);
      const message = error instanceof Error ? error.message : String(error);
      const errorDoc: RagResult = {
          id: -2, path: "Query error",
          content: `No response could be obtained from graph.\n\nPossible cause: ${message}\n\nIf you use reranking, check your credits.`,
          similarity: 1.0, metadata: { startLine: 0, endLine: 0 }
      };
      return [errorDoc] as unknown as RagQueryResult;
    }
  }

  private getQueryEmbedding(query: string): Promise<number[]> {
    if (!this.embeddingModel) return Promise.reject(new Error('Embedding model not set'));
    return this.embeddingModel.getEmbedding(query)
  }
}