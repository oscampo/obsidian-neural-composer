import { Editor, MarkdownView, Notice, Plugin } from 'obsidian'

import { spawn, execSync, ChildProcess } from 'child_process'; // <--- Agrega execSync
import * as fs from 'fs';
import * as path from 'path';

import { ApplyView } from './ApplyView'
import { ChatView } from './ChatView'
import { ChatProps } from './components/chat-view/Chat'
import { InstallerUpdateRequiredModal } from './components/modals/InstallerUpdateRequiredModal'
import { APPLY_VIEW_TYPE, CHAT_VIEW_TYPE } from './constants'
import { McpManager } from './core/mcp/mcpManager'
import { RAGEngine } from './core/rag/ragEngine'
import { DatabaseManager } from './database/DatabaseManager'
import { PGLiteAbortedException } from './database/exception'
import { migrateToJsonDatabase } from './database/json/migrateToJsonDatabase'
import {
  SmartComposerSettings,
  smartComposerSettingsSchema,
} from './settings/schema/setting.types'
import { parseSmartComposerSettings } from './settings/schema/settings'
import { SmartComposerSettingTab } from './settings/SettingTab'
import { getMentionableBlockData } from './utils/obsidian'

export default class SmartComposerPlugin extends Plugin {
  settings: SmartComposerSettings
  initialChatProps?: ChatProps // TODO: change this to use view state like ApplyView
  settingsChangeListeners: ((newSettings: SmartComposerSettings) => void)[] = []
  mcpManager: McpManager | null = null
  dbManager: DatabaseManager | null = null
  ragEngine: RAGEngine | null = null
  private dbManagerInitPromise: Promise<DatabaseManager> | null = null
  private ragEngineInitPromise: Promise<RAGEngine> | null = null
  private timeoutIds: ReturnType<typeof setTimeout>[] = [] // Use ReturnType instead of number
  private serverProcess: ChildProcess | null = null;

// 1. Método para DETENER (Refactorizado para reuso)
  public stopLightRagServer() {
    if (this.serverProcess) {
        console.log("🛑 Deteniendo LightRAG Server...");
        
        try {
            if (process.platform === 'win32') {
                // Usamos execSync para bloqueo garantizado
                const { execSync } = require('child_process');
                execSync('taskkill /F /IM lightrag-server.exe /T', { stdio: 'ignore' });
                // Opcional: Matar python si es necesario, con cuidado
            } else {
                this.serverProcess.kill();
            }
        } catch (error) {
            console.log("El servidor ya estaba detenido.");
        }
        
        this.serverProcess = null;
    }
  }

  async onload() {
    await this.loadSettings()

    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this))
    this.registerView(APPLY_VIEW_TYPE, (leaf) => new ApplyView(leaf))

    // This creates an icon in the left ribbon.
    this.addRibbonIcon('wand-sparkles', 'Open smart composer', () =>
      this.openChatView(),
    )

    // This adds a simple command that can be triggered anywhere
    this.addCommand({
      id: 'open-new-chat',
      name: 'Open chat',
      callback: () => this.openChatView(true),
    })

    this.addCommand({
      id: 'add-selection-to-chat',
      name: 'Add selection to chat',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.addSelectionToChat(editor, view)
      },
    })

    this.addCommand({
      id: 'rebuild-vault-index',
      name: 'Rebuild entire vault index',
      callback: async () => {
        const notice = new Notice('Rebuilding vault index...', 0)
        try {
          const ragEngine = await this.getRAGEngine()
          await ragEngine.updateVaultIndex(
            { reindexAll: true },
            (queryProgress) => {
              if (queryProgress.type === 'indexing') {
                const { completedChunks, totalChunks } =
                  queryProgress.indexProgress
                notice.setMessage(
                  `Indexing chunks: ${completedChunks} / ${totalChunks}${
                    queryProgress.indexProgress.waitingForRateLimit
                      ? '\n(waiting for rate limit to reset)'
                      : ''
                  }`,
                )
              }
            },
          )
          notice.setMessage('Rebuilding vault index complete')
        } catch (error) {
          console.error(error)
          notice.setMessage('Rebuilding vault index failed')
        } finally {
          this.registerTimeout(() => {
            notice.hide()
          }, 1000)
        }
      },
    })

    this.addCommand({
      id: 'update-vault-index',
      name: 'Update index for modified files',
      callback: async () => {
        const notice = new Notice('Updating vault index...', 0)
        try {
          const ragEngine = await this.getRAGEngine()
          await ragEngine.updateVaultIndex(
            { reindexAll: false },
            (queryProgress) => {
              if (queryProgress.type === 'indexing') {
                const { completedChunks, totalChunks } =
                  queryProgress.indexProgress
                notice.setMessage(
                  `Indexing chunks: ${completedChunks} / ${totalChunks}${
                    queryProgress.indexProgress.waitingForRateLimit
                      ? '\n(waiting for rate limit to reset)'
                      : ''
                  }`,
                )
              }
            },
          )
          notice.setMessage('Vault index updated')
        } catch (error) {
          console.error(error)
          notice.setMessage('Vault index update failed')
        } finally {
          this.registerTimeout(() => {
            notice.hide()
          }, 1000)
        }
      },
    })

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new SmartComposerSettingTab(this.app, this))

    //void this.migrateToJsonStorage() // <-- Comentado!
    // --- AUTO-START LOGIC ---
    if (this.settings.enableAutoStartServer) {
        this.startLightRagServer();
    }

  }

  onunload() {
    // clear all timers
    this.timeoutIds.forEach((id) => clearTimeout(id))
    this.timeoutIds = []

    // RagEngine cleanup
    this.ragEngine?.cleanup()
    this.ragEngine = null

    // Promise cleanup
    this.dbManagerInitPromise = null
    this.ragEngineInitPromise = null

    // DatabaseManager cleanup
    this.dbManager?.cleanup()
    this.dbManager = null

    // McpManager cleanup
    this.mcpManager?.cleanup()
    this.mcpManager = null

    // 2. EXORCISMO SINCRÓNICO (GARANTIZADO)
    if (this.serverProcess) {
        console.log("🛑 Ejecutando Orden 66 (Matar Servidor)...");
        
        try {
            if (process.platform === 'win32') {
                // execSync DETIENE todo hasta que el comando termina.
                // /F = Fuerza bruta
                // /IM = Por nombre de imagen
                // /T = Mata también a los hijos (Tree)
                // stdio: 'ignore' evita que la consola se queje si ya estaba muerto
                execSync('taskkill /F /IM lightrag-server.exe /T', { stdio: 'ignore' });
            } else {
                this.serverProcess.kill();
            }
        } catch (error) {
            // Si falla (ej: ya estaba muerto), no importa, seguimos cerrando.
            console.log("El servidor ya estaba detenido o no se pudo matar.");
        }
        
        this.serverProcess = null;
    }
     this.stopLightRagServer();
  }

 public async restartLightRagServer() {
    new Notice("🔄 Reiniciando Neural Backend...");
    
    // A. Matar
    this.stopLightRagServer();
    
    // B. Esperar un respiro (para liberar el puerto)
    setTimeout(async () => {
        // C. Regenerar .env (por si acaso)
        await this.updateEnvFile();
        
        // D. Encender
        await this.startLightRagServer();
        // La función start ya muestra el Notice de éxito
    }, 1000); 
  }

// --- CORA MOD: GENERADOR DE CONFIGURACIÓN INDEPENDIENTE ---
  public async updateEnvFile() {
    const workDir = this.settings.lightRagWorkDir;

    if (!workDir) return; // Si no hay directorio, no hacemos nada

    try {
        // 1. IDENTIFICAR MODELOS
        const targetLlmId = this.settings.lightRagModelId || this.settings.chatModelId;
        const embeddingId = this.settings.embeddingModelId;
        
        const llmModelObj = this.settings.chatModels.find(m => m.id === targetLlmId);
        const embedModelObj = this.settings.embeddingModels.find(m => m.id === embeddingId);

        const llmProvider = this.settings.providers.find(p => p.id === llmModelObj?.providerId);
        const embedProvider = this.settings.providers.find(p => p.id === embedModelObj?.providerId);

        // 2. CONSTRUIR CONTENIDO
        let envContent = `# Generated by Neural Composer\n`;
        envContent += `WORKING_DIR=${workDir}\n`;
        envContent += `HOST=0.0.0.0\n`;
        envContent += `PORT=9621\n`;
        envContent += `SUMMARY_LANGUAGE=${this.settings.lightRagSummaryLanguage || 'English'}\n\n`;

        // Configuración LLM
        if (llmModelObj && llmProvider) {
            envContent += `# LLM Configuration (${llmProvider.id})\n`;
            envContent += `LLM_BINDING=${llmProvider.id}\n`;
            envContent += `LLM_MODEL=${llmModelObj.model}\n`;
            
            if (llmProvider.baseUrl) {
                if (llmProvider.id === 'ollama') envContent += `OLLAMA_HOST=${llmProvider.baseUrl}\n`;
                if (llmProvider.id === 'openai' && llmProvider.baseUrl.includes('localhost')) {
                    envContent += `OPENAI_BASE_URL=${llmProvider.baseUrl}\n`;
                }
            }
        }

        // Configuración Embedding
        if (embedModelObj && embedProvider) {
            envContent += `\n# Embedding Configuration (${embedProvider.id})\n`;
            envContent += `EMBEDDING_BINDING=${embedProvider.id}\n`;
            envContent += `EMBEDDING_MODEL=${embedModelObj.model}\n`;
            envContent += `EMBEDDING_DIM=${embedModelObj.dimension || 1024}\n`;
            envContent += `MAX_TOKEN_SIZE=8192\n`;
        }

        // API Keys
        const providersNeeded = new Set([llmProvider, embedProvider]);
        envContent += `\n# API Keys\n`;
        providersNeeded.forEach(p => {
            if (p && p.apiKey) {
                const keyName = p.id.toUpperCase(); 
                if (keyName === 'GEMINI') envContent += `GEMINI_API_KEY=${p.apiKey}\n`;
                if (keyName === 'OPENAI') envContent += `OPENAI_API_KEY=${p.apiKey}\n`;
                if (keyName === 'ANTHROPIC') envContent += `ANTHROPIC_API_KEY=${p.apiKey}\n`;
            }
        });

        // 3. ESCRIBIR
        // Importante: Asegúrate de tener 'fs' y 'path' importados arriba
        const envPath = path.join(workDir, '.env');
        fs.writeFileSync(envPath, envContent);
        console.log(`📝 .env actualizado en: ${envPath}`);

    } catch (err) {
        console.error("❌ Error actualizando .env:", err);
    }
  }

async startLightRagServer() {
    const command = this.settings.lightRagCommand;
    const workDir = this.settings.lightRagWorkDir;

    if (!workDir) {
        new Notice("⚠️ Configure LightRAG Working Directory first.");
        return;
    }

    // 1. GENERAR .ENV SIEMPRE ANTES DE ARRANCAR
    await this.updateEnvFile(); 
        // ... (spawn process code) ...
  }

  async loadSettings() {
    this.settings = parseSmartComposerSettings(await this.loadData())
    await this.saveData(this.settings) // Save updated settings
  }

  async setSettings(newSettings: SmartComposerSettings) {
    const validationResult = smartComposerSettingsSchema.safeParse(newSettings)

    if (!validationResult.success) {
      new Notice(`Invalid settings:
${validationResult.error.issues.map((v) => v.message).join('\n')}`)
      return
    }

    this.settings = newSettings
    await this.saveData(newSettings)
    this.ragEngine?.setSettings(newSettings)
    this.settingsChangeListeners.forEach((listener) => listener(newSettings))
  }

  addSettingsChangeListener(
    listener: (newSettings: SmartComposerSettings) => void,
  ) {
    this.settingsChangeListeners.push(listener)
    return () => {
      this.settingsChangeListeners = this.settingsChangeListeners.filter(
        (l) => l !== listener,
      )
    }
  }

  async openChatView(openNewChat = false) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    const editor = view?.editor
    if (!view || !editor) {
      this.activateChatView(undefined, openNewChat)
      return
    }
    const selectedBlockData = await getMentionableBlockData(editor, view)
    this.activateChatView(
      {
        selectedBlock: selectedBlockData ?? undefined,
      },
      openNewChat,
    )
  }

  async activateChatView(chatProps?: ChatProps, openNewChat = false) {
    // chatProps is consumed in ChatView.tsx
    this.initialChatProps = chatProps

    const leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]

    await (leaf ?? this.app.workspace.getRightLeaf(false))?.setViewState({
      type: CHAT_VIEW_TYPE,
      active: true,
    })

    if (openNewChat && leaf && leaf.view instanceof ChatView) {
      leaf.view.openNewChat(chatProps?.selectedBlock)
    }

    this.app.workspace.revealLeaf(
      this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0],
    )
  }

  async addSelectionToChat(editor: Editor, view: MarkdownView) {
    const data = await getMentionableBlockData(editor, view)
    if (!data) return

    const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
    if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) {
      await this.activateChatView({
        selectedBlock: data,
      })
      return
    }

    // bring leaf to foreground (uncollapse sidebar if it's collapsed)
    await this.app.workspace.revealLeaf(leaves[0])

    const chatView = leaves[0].view
    chatView.addSelectionToChat(data)
    chatView.focusMessage()
  }
/*
  async getDbManager(): Promise<DatabaseManager> {
    if (this.dbManager) {
      return this.dbManager
    }

    if (!this.dbManagerInitPromise) {
      this.dbManagerInitPromise = (async () => {
        try {
          this.dbManager = await DatabaseManager.create(this.app)
          return this.dbManager
        } catch (error) {
          this.dbManagerInitPromise = null
          if (error instanceof PGLiteAbortedException) {
            new InstallerUpdateRequiredModal(this.app).open()
          }
          throw error
        }
      })()
    }

    // if initialization is running, wait for it to complete instead of creating a new initialization promise
    return this.dbManagerInitPromise
  }
*/

async getDbManager(): Promise<DatabaseManager> {
    // CORA MOD: Bypass database initialization
    console.log("🕸️ [Cora Mod] Saltando inicialización de DB Local...");
    return {} as any; // Devolvemos un objeto vacío para que no chille TypeScript
}

async getRAGEngine(): Promise<RAGEngine> {
    if (this.ragEngine) {
      return this.ragEngine
    }

    if (!this.ragEngineInitPromise) {
      this.ragEngineInitPromise = (async () => {
        try {
          // CORA MOD: Bypass DB Manager
          this.ragEngine = new RAGEngine(
            this.app,
            this.settings,
            {} as any, // vectorManager dummy
            // --- CALLBACK DE RESURRECCIÓN ---
            async () => {
                console.log("♻️ RAGEngine solicitó reinicio del servidor...");
                await this.startLightRagServer();
            }
          )
          return this.ragEngine
        } catch (error) {
          this.ragEngineInitPromise = null
          throw error
        }
      })()
    }

    return this.ragEngineInitPromise
  }

  async getMcpManager(): Promise<McpManager> {
    if (this.mcpManager) {
      return this.mcpManager
    }

    try {
      this.mcpManager = new McpManager({
        settings: this.settings,
        registerSettingsListener: (
          listener: (settings: SmartComposerSettings) => void,
        ) => this.addSettingsChangeListener(listener),
      })
      await this.mcpManager.initialize()
      return this.mcpManager
    } catch (error) {
      this.mcpManager = null
      throw error
    }
  }

  private registerTimeout(callback: () => void, timeout: number): void {
    const timeoutId = setTimeout(callback, timeout)
    this.timeoutIds.push(timeoutId)
  }

  private async migrateToJsonStorage() {
    try {
      const dbManager = await this.getDbManager()
      await migrateToJsonDatabase(this.app, dbManager, async () => {
        await this.reloadChatView()
        console.log('Migration to JSON storage completed successfully')
      })
    } catch (error) {
      console.error('Failed to migrate to JSON storage:', error)
      new Notice(
        'Failed to migrate to JSON storage. Please check the console for details.',
      )
    }
  }

  private async reloadChatView() {
    const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
    if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) {
      return
    }
    new Notice('Reloading "smart-composer" due to migration', 1000)
    leaves[0].detach()
    await this.activateChatView()
  }
}
