import { Editor, MarkdownView, Notice, Plugin, TFolder, TFile } from 'obsidian'
import { spawn, execSync, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

import { ApplyView } from './ApplyView'
import { ChatView } from './ChatView'
import { ChatProps } from './components/chat-view/Chat'
import { InstallerUpdateRequiredModal } from './components/modals/InstallerUpdateRequiredModal'
import { APPLY_VIEW_TYPE, CHAT_VIEW_TYPE } from './constants'
import { McpManager } from './core/mcp/mcpManager'
import { RAGEngine } from './core/rag/ragEngine'
import { DatabaseManager } from './database/DatabaseManager'
import {
  SmartComposerSettings,
  smartComposerSettingsSchema,
} from './settings/schema/setting.types'
import { parseSmartComposerSettings } from './settings/schema/settings'
import { SmartComposerSettingTab } from './settings/SettingTab'
import { getMentionableBlockData } from './utils/obsidian'

export default class SmartComposerPlugin extends Plugin {
  settings: SmartComposerSettings
  initialChatProps?: ChatProps 
  settingsChangeListeners: ((newSettings: SmartComposerSettings) => void)[] = []
  mcpManager: McpManager | null = null
  dbManager: DatabaseManager | null = null
  ragEngine: RAGEngine | null = null
  private dbManagerInitPromise: Promise<DatabaseManager> | null = null
  private ragEngineInitPromise: Promise<RAGEngine> | null = null
  private timeoutIds: ReturnType<typeof setTimeout>[] = []
  private serverProcess: ChildProcess | null = null;

  async onload() {
    await this.loadSettings()

    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this))
    this.registerView(APPLY_VIEW_TYPE, (leaf) => new ApplyView(leaf))

    this.addRibbonIcon('wand-sparkles', 'Open Neural Composer', () =>
      this.openChatView(),
    )

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

    // Comandos de re-indexación (Mantenidos por compatibilidad visual, aunque no los usamos en LightRAG)
    this.addCommand({
        id: 'rebuild-vault-index',
        name: 'Rebuild vault index (Legacy)',
        callback: async () => new Notice("Please use LightRAG WebUI for indexing.")
    })

    this.addSettingTab(new SmartComposerSettingTab(this.app, this))

// --- CORA MOD: MENÚ CONTEXTUAL PARA CARPETAS ---
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        // Solo mostramos esta opción si le das clic a una CARPETA
        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item
              .setTitle('🧠 Ingest Folder into Graph')
              .setIcon('layers')
              .onClick(async () => {
                await this.batchIngestFolder(file);
              });
          });
        }
      })
    );
    // -----------------------------------------------

    // --- CORA MOD: COMANDO DE INGESTA ---
    this.addCommand({
      id: 'ingest-current-note',
      name: '🧠 Ingest current note into Knowledge Graph',
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        const content = editor.getValue();
        const title = view.file?.basename || "Untitled";
        
        if (!content.trim()) {
            new Notice("⚠️ La nota está vacía.");
            return;
        }

        const notice = new Notice(`🧠 Aprendiendo: "${title}"...\nEsto puede tomar unos segundos.`, 0); // 0 = se queda fijo

        try {
            const ragEngine = await this.getRAGEngine();
            
            // Le pasamos el contenido completo al servidor
            // Agregamos el título al inicio para darle contexto al Grafo
            const enrichedContent = `Title: ${title}\n\n${content}`;
            
            const success = await ragEngine.insertDocument(enrichedContent, title);

            if (success) {
                notice.setMessage(`✅ ¡Aprendido! "${title}" ya es parte de mi memoria.`);
                setTimeout(() => notice.hide(), 5000); // Esconder a los 5s
            } else {
                notice.setMessage(`❌ Falló la ingesta de "${title}".`);
                setTimeout(() => notice.hide(), 5000);
            }

        } catch (error) {
            console.error(error);
            notice.setMessage(`❌ Error crítico al conectar con el cerebro.`);
            setTimeout(() => notice.hide(), 5000);
        }
      },
    })
    // ------------------------------------

    // --- AUTO-START SEGURO ---
    this.app.workspace.onLayoutReady(() => {
        if (this.settings.enableAutoStartServer) {
            this.startLightRagServer();
        }
    });
  }

  onunload() {
    this.timeoutIds.forEach((id) => clearTimeout(id))
    this.timeoutIds = []

    this.ragEngine?.cleanup()
    this.ragEngine = null
    this.dbManagerInitPromise = null
    this.ragEngineInitPromise = null
    this.dbManager?.cleanup()
    this.dbManager = null
    this.mcpManager?.cleanup()
    this.mcpManager = null

    // LIMPIEZA DE PROCESOS
    this.stopLightRagServer();
  }

  // --- GESTIÓN DE SERVIDOR ---

  public stopLightRagServer() {
    console.log("🛑 Deteniendo servicios LightRAG...");
    
    // Intento 1: Si tenemos la referencia del proceso
    if (this.serverProcess) {
        this.serverProcess.kill();
        this.serverProcess = null;
    }

    // Intento 2: Limpieza profunda por nombre (Para zombis)
    try {
        if (process.platform === 'win32') {
            execSync('taskkill /F /IM lightrag-server.exe /T', { stdio: 'ignore' });
            // Opcional: execSync('taskkill /F /IM python.exe /T', { stdio: 'ignore' }); 
        }
    } catch (error) {
        // Ignorar si no había procesos
    }
  }

  public async restartLightRagServer() {
    new Notice("🔄 Reiniciando Neural Backend...");
    this.stopLightRagServer();
    
    setTimeout(async () => {
        await this.startLightRagServer();
    }, 2000); // Espera un poco más para liberar puertos
  }

  public async updateEnvFile() {
    const workDir = this.settings.lightRagWorkDir;
    if (!workDir) return;

    try {
        // 1. IDENTIFICAR MODELOS (Lógica "Caprichosa")
        const targetLlmId = this.settings.lightRagModelId || this.settings.chatModelId;
        const embeddingId = this.settings.embeddingModelId;
        
        const llmModelObj = this.settings.chatModels.find(m => m.id === targetLlmId);
        const embedModelObj = this.settings.embeddingModels.find(m => m.id === embeddingId);

        const llmProvider = this.settings.providers.find(p => p.id === llmModelObj?.providerId);
        const embedProvider = this.settings.providers.find(p => p.id === embedModelObj?.providerId);

        // 2. CONSTRUIR .ENV
        let envContent = `# Generated by Neural Composer\n`;
        envContent += `WORKING_DIR=${workDir}\n`;
        envContent += `HOST=0.0.0.0\n`;
        envContent += `PORT=9621\n`;
        envContent += `SUMMARY_LANGUAGE=${this.settings.lightRagSummaryLanguage || 'Spanish'}\n\n`;

        // LLM
        if (llmModelObj && llmProvider) {
            envContent += `# LLM Configuration\n`;
            envContent += `LLM_BINDING=${llmProvider.id}\n`;
            envContent += `LLM_MODEL=${llmModelObj.model}\n`;
            
            if (llmProvider.id === 'ollama' && llmProvider.baseUrl) {
                 envContent += `OLLAMA_HOST=${llmProvider.baseUrl}\n`;
            } else if (llmProvider.id === 'openai' && llmProvider.baseUrl?.includes('localhost')) {
                 envContent += `OPENAI_BASE_URL=${llmProvider.baseUrl}\n`;
            }
        }

        // Embeddings
        if (embedModelObj && embedProvider) {
            envContent += `\n# Embedding Configuration\n`;
            envContent += `EMBEDDING_BINDING=${embedProvider.id}\n`;
            envContent += `EMBEDDING_MODEL=${embedModelObj.model}\n`;
            envContent += `EMBEDDING_DIM=${embedModelObj.dimension || 1024}\n`;
            envContent += `MAX_TOKEN_SIZE=8192\n`;
        }

        // API Keys (Acumuladas)
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

    if (!workDir || !command) {
        new Notice("⚠️ Configure LightRAG paths in settings.");
        return;
    }

    // 1. Generar configuración
    await this.updateEnvFile();

    // 2. Verificar estado actual
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);
        const response = await fetch("http://localhost:9621/health", { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
            console.log("✅ LightRAG Server ya estaba activo.");
            return;
        }
    } catch (e) {
        // Servidor apagado, procedemos a iniciar
    }

    console.log(`🚀 Iniciando LightRAG en: ${workDir}`);
    new Notice("🚀 Iniciando Motor Neural...");

    try {
        this.serverProcess = spawn(command, ['--port', '9621', '--working-dir', workDir], {
            cwd: workDir,
            shell: true,
            env: { 
                ...process.env, 
                PYTHONIOENCODING: 'utf-8', // Vital para Windows
                FORCE_COLOR: '1' 
            }
        });

        this.serverProcess.stdout?.on('data', (data) => console.log(`[LightRAG]: ${data}`));
        this.serverProcess.stderr?.on('data', (data) => console.error(`[LightRAG Err]: ${data}`));
        
        this.serverProcess.on('close', (code) => {
            console.log(`[LightRAG] Terminado (Código ${code})`);
            this.serverProcess = null;
        });

        setTimeout(() => {
            if (this.serverProcess) new Notice("✅ Cerebro Neural Activado");
        }, 5000);

    } catch (error) {
        console.error("❌ Error al iniciar servidor:", error);
        new Notice("❌ Error fatal iniciando servidor.");
    }
  }

  // --- CONFIGURACIÓN ESTÁNDAR DEL PLUGIN ---

  async loadSettings() {
    this.settings = parseSmartComposerSettings(await this.loadData())
    await this.saveData(this.settings)
  }

  async setSettings(newSettings: SmartComposerSettings) {
    const validationResult = smartComposerSettingsSchema.safeParse(newSettings)
    if (!validationResult.success) {
      new Notice('Invalid settings')
      return
    }
    this.settings = newSettings
    await this.saveData(newSettings)
    this.ragEngine?.setSettings(newSettings)
    this.settingsChangeListeners.forEach((listener) => listener(newSettings))
  }

  addSettingsChangeListener(listener: (newSettings: SmartComposerSettings) => void) {
    this.settingsChangeListeners.push(listener)
    return () => {
      this.settingsChangeListeners = this.settingsChangeListeners.filter((l) => l !== listener)
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
    this.activateChatView({ selectedBlock: selectedBlockData ?? undefined }, openNewChat)
  }

  async activateChatView(chatProps?: ChatProps, openNewChat = false) {
    this.initialChatProps = chatProps
    const leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]
    await (leaf ?? this.app.workspace.getRightLeaf(false))?.setViewState({
      type: CHAT_VIEW_TYPE,
      active: true,
    })
    if (openNewChat && leaf && leaf.view instanceof ChatView) {
      leaf.view.openNewChat(chatProps?.selectedBlock)
    }
    this.app.workspace.revealLeaf(this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0])
  }

  async addSelectionToChat(editor: Editor, view: MarkdownView) {
    const data = await getMentionableBlockData(editor, view)
    if (!data) return
    const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
    if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) {
      await this.activateChatView({ selectedBlock: data })
      return
    }
    await this.app.workspace.revealLeaf(leaves[0])
    const chatView = leaves[0].view
    chatView.addSelectionToChat(data)
    chatView.focusMessage()
  }

  // --- LOBOTOMÍA DE DB MANAGER ---
  async getDbManager(): Promise<DatabaseManager> {
    console.log("🕸️ [Cora Mod] Bypass DB Local...");
    return {} as any; 
  }

  async getRAGEngine(): Promise<RAGEngine> {
    if (this.ragEngine) return this.ragEngine

    if (!this.ragEngineInitPromise) {
      this.ragEngineInitPromise = (async () => {
        try {
          this.ragEngine = new RAGEngine(
            this.app,
            this.settings,
            {} as any,
            // Callback de resurrección
            async () => {
                console.log("♻️ Solicitando reinicio del servidor...");
                await this.restartLightRagServer();
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
    if (this.mcpManager) return this.mcpManager
    try {
      this.mcpManager = new McpManager({
        settings: this.settings,
        registerSettingsListener: (l) => this.addSettingsChangeListener(l),
      })
      await this.mcpManager.initialize()
      return this.mcpManager
    } catch (error) {
      this.mcpManager = null
      throw error
    }
  }

// --- LÓGICA DE INGESTA MASIVA ---

  // 1. Recolector Recursivo de Archivos
  private getAllMarkdownFiles(folder: TFolder): TFile[] {
    let files: TFile[] = [];
    
    for (const child of folder.children) {
        if (child instanceof TFile && child.extension === 'md') {
            files.push(child);
        } else if (child instanceof TFolder) {
            // Recursividad: Si es carpeta, busca adentro
            files = files.concat(this.getAllMarkdownFiles(child));
        }
    }
    return files;
  }

  // 2. El Procesador por Lotes
  async batchIngestFolder(folder: TFolder) {
    const files = this.getAllMarkdownFiles(folder);
    
    if (files.length === 0) {
        new Notice("⚠️ No se encontraron archivos Markdown en esta carpeta.");
        return;
    }

    // Aviso inicial
    const notice = new Notice(`🧠 Iniciando ingesta masiva de ${files.length} archivos...\nEsto tomará un tiempo.`, 0);
    
    try {
        const ragEngine = await this.getRAGEngine();
        let successCount = 0;
        let failCount = 0;

        // Procesamos UNO POR UNO para no saturar el servidor ni la UI
        // (Podríamos usar Promise.all para concurrencia, pero secuencial es más seguro y estable)
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            // Actualizar la notificación visualmente
            notice.setMessage(`🧠 Procesando (${i + 1}/${files.length}):\n📄 ${file.name}`);
            
            try {
                const content = await this.app.vault.read(file);
                const title = file.basename;
                const enrichedContent = `Title: ${title}\n\n${content}`;

                // Llamamos al motor de ingesta
                const result = await ragEngine.insertDocument(enrichedContent, title);
                
                if (result) successCount++;
                else failCount++;

                // Pequeña pausa para dejar respirar a la UI y al Server
                await new Promise(resolve => setTimeout(resolve, 500)); 

            } catch (err) {
                console.error(`Error en archivo ${file.name}:`, err);
                failCount++;
            }
        }

// AL FINAL DEL BUCLE, EN LUGAR DE DECIR "LISTO":
    
    notice.setMessage("🚀 Datos enviados. Esperando confirmación del cerebro...");
    
    // Iniciar monitoreo
    await this.monitorPipeline(notice);

    } catch (error) {
        console.error("Error crítico en batch:", error);
        notice.setMessage("❌ Error crítico iniciando el proceso.");
    }


  }

  // --- CORA MOD: MONITOREO DE PIPELINE ---
  async monitorPipeline(notice: Notice) {
    let isBusy = true;
    let errors = 0;

    while (isBusy) {
        try {
            // Preguntar estado
            const response = await fetch("http://localhost:9621/documents/pipeline_status");
            if (!response.ok) throw new Error("Error status");
            
            const status = await response.json();
            
            // Actualizar UI
            // status.busy: true si está trabajando
            // status.cur_batch / status.batchs: Progreso
            isBusy = status.busy;
            
            if (isBusy) {
                const percent = status.batchs > 0 
                    ? Math.round((status.cur_batch / status.batchs) * 100) 
                    : 0;
                
                notice.setMessage(
                    `🧠 Cerebro trabajando...\n` +
                    `⚙️ Lote: ${status.cur_batch} / ${status.batchs} (${percent}%)\n` +
                    `📝 ${status.latest_message || "Procesando..."}`
                );
            }

            // Esperar 2 segundos antes de volver a preguntar
            await new Promise(r => setTimeout(r, 2000));

        } catch (e) {
            errors++;
            if (errors > 5) {
                isBusy = false; // Romper si el servidor no responde
                notice.setMessage("⚠️ Se perdió conexión con el estado del servidor, pero el proceso podría seguir en fondo.");
            }
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    
    notice.setMessage("🎉 ¡Aprendizaje Completado!\nEl conocimiento ya está en el Grafo.");
    setTimeout(() => notice.hide(), 5000);
  }

  private registerTimeout(callback: () => void, timeout: number): void {
    const timeoutId = setTimeout(callback, timeout)
    this.timeoutIds.push(timeoutId)
  }
}