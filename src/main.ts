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

// --- LISTA MAESTRA DE EXTENSIONES ---
const SUPPORTED_EXTENSIONS = [
    'md', 'txt', 'docx', 'pdf', 'pptx', 'xlsx', 'rtf', 'odt', 'epub',
    'html', 'htm', 'xml', 'json', 'yaml', 'yml', 'csv',
    'tex', 'log', 'conf', 'ini', 'properties', 'sql', 'bat', 'sh', 
    'c', 'cpp', 'py', 'java', 'js', 'ts', 'swift', 'go', 'rb', 'php',
    'css', 'scss', 'less'
];

const TEXT_BASED_EXTENSIONS = [
    'md', 'txt', 'html', 'htm', 'xml', 'json', 'yaml', 'yml', 'csv', 
    'tex', 'log', 'conf', 'ini', 'properties', 'sql', 'bat', 'sh', 
    'c', 'cpp', 'py', 'java', 'js', 'ts', 'swift', 'go', 'rb', 'php', 
    'css', 'scss', 'less'
];

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

    // --- MENÚ CONTEXTUAL (CARPETAS) ---
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
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

// --- CORA MOD: COMANDO DE INGESTA UNIVERSAL (TEXTO Y BINARIOS) ---
    this.addCommand({
      id: 'ingest-current-file', // ID actualizado (aunque puedes dejar el anterior si quieres mantener hotkeys)
      name: '🧠 Ingest current file into Knowledge Graph',
      // Usamos checkCallback para soportar PDFs, Imágenes, etc., no solo Markdown
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        
        // 1. Verificación Rápida: ¿Hay archivo y es soportado?
        if (!file || !SUPPORTED_EXTENSIONS.includes(file.extension.toLowerCase())) {
            return false; // El comando se oculta si no es un archivo válido
        }

        // Si solo estamos chequeando (para mostrar en la paleta), decimos que sí
        if (checking) {
            return true;
        }

        // 2. Ejecución Real (async)
        (async () => {
            const title = file.basename;
            const ext = file.extension.toLowerCase();
            const notice = new Notice(`🧠 Enviando "${file.name}" al cerebro...`, 0);

            try {
                const ragEngine = await this.getRAGEngine();
                let success = false;
                
                // DECISIÓN TÁCTICA: ¿TEXTO O UPLOAD?
                if (TEXT_BASED_EXTENSIONS.includes(ext)) {
                     // Leemos el texto directamente
                     const content = await this.app.vault.read(file);
                     // Enriquecemos con título si es MD para mejor contexto en el grafo
                     const finalContent = ext === 'md' ? `Title: ${title}\n\n${content}` : content;
                     
                     success = await ragEngine.insertDocument(finalContent, file.name);
                } else {
                     // Subimos el archivo binario (PDF, DOCX, etc.)
                     success = await ragEngine.uploadDocument(file);
                }

                if (success) {
                    notice.setMessage(`✅ Enviado. Procesando en segundo plano...`);
                    // Iniciamos el monitoreo para que el usuario vea el progreso real
                    await this.monitorPipeline(notice);
                } else {
                    notice.setMessage(`❌ Falló el envío de "${title}".`);
                    setTimeout(() => notice.hide(), 5000);
                }

            } catch (error) {
                console.error(error);
                notice.setMessage(`❌ Error crítico al conectar con el cerebro.`);
                setTimeout(() => notice.hide(), 5000);
            }
        })();
      },
    })
    // ------------------------------------

    this.addSettingTab(new SmartComposerSettingTab(this.app, this))

    // --- AUTO-START ---
    this.app.workspace.onLayoutReady(() => {
        if (this.settings.enableAutoStartServer) {
            this.startLightRagServer();
        }
    });
  }

  // --- LÓGICA DE MONITOREO (TRANSPARENCIA) ---
  async monitorPipeline(notice: Notice) {
    let isBusy = true;
    let errors = 0;
    // Esperar un momento para que el servidor registre la tarea
    await new Promise(r => setTimeout(r, 1000));

    while (isBusy) {
        try {
            const response = await fetch("http://localhost:9621/documents/pipeline_status");
            if (!response.ok) throw new Error("Status error");
            
            const status = await response.json();
            
            // Si hay documentos en cola (docs > 0) y busy es false, puede que haya terminado o no empezado.
            // Pero generalmente 'busy' es el indicador clave.
            isBusy = status.busy;
            
            if (isBusy) {
                const total = status.batchs || 1;
                const current = status.cur_batch || 0;
                const percent = Math.round((current / total) * 100);
                
                notice.setMessage(
                    `🧠 Cerebro procesando...\n` +
                    `⚙️ Progreso: ${percent}% (${current}/${total})\n` +
                    `📝 ${status.latest_message || "Analizando..."}`
                );
            }

            if (!isBusy) break;

            await new Promise(r => setTimeout(r, 1500)); // Polling cada 1.5s

        } catch (e) {
            errors++;
            if (errors > 3) isBusy = false;
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    
    notice.setMessage("🎉 ¡Conocimiento Integrado!\nEl grafo está actualizado.");
    setTimeout(() => notice.hide(), 5000);
  }

  // --- LÓGICA DE BATCH ---
  private getAllSupportedFiles(folder: TFolder): TFile[] {
    let files: TFile[] = [];
    for (const child of folder.children) {
        if (child instanceof TFile) {
            if (SUPPORTED_EXTENSIONS.includes(child.extension.toLowerCase())) {
                files.push(child);
            }
        } else if (child instanceof TFolder) {
            files = files.concat(this.getAllSupportedFiles(child));
        }
    }
    return files;
  }

  async batchIngestFolder(folder: TFolder) {
    const files = this.getAllSupportedFiles(folder);
    if (files.length === 0) {
        new Notice("⚠️ Carpeta vacía o sin archivos soportados.");
        return;
    }

    const notice = new Notice(`📦 Enviando ${files.length} archivos al cerebro...`, 0);
    
    try {
        const ragEngine = await this.getRAGEngine();
        let successCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const ext = file.extension.toLowerCase();
            
            notice.setMessage(`📦 Enviando (${i + 1}/${files.length}):\n📄 ${file.name}`);
            
            try {
                let result = false;
                if (TEXT_BASED_EXTENSIONS.includes(ext)) {
                    const content = await this.app.vault.read(file);
                    const finalContent = ext === 'md' ? `Title: ${file.basename}\n\n${content}` : content;
                    result = await ragEngine.insertDocument(finalContent, file.name);
                } else {
                    result = await ragEngine.uploadDocument(file);
                }
                
                if (result) successCount++;
                await new Promise(resolve => setTimeout(resolve, 200)); 

            } catch (err) {
                console.error(`Error en ${file.name}:`, err);
            }
        }

        // Una vez enviados, iniciamos el monitoreo del procesamiento real
        notice.setMessage(`✅ Archivos enviados (${successCount}).\n🧠 Iniciando procesamiento neuronal...`);
        await this.monitorPipeline(notice);

    } catch (error) {
        console.error("Error batch:", error);
        notice.setMessage("❌ Error iniciando carga.");
        setTimeout(() => notice.hide(), 5000);
    }
  }

  // --- RESTO DEL CÓDIGO (LIFECYCLE, SERVER MANAGE) ---
  
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
    this.stopLightRagServer();
  }

  public stopLightRagServer() {
    console.log("🛑 Deteniendo servicios LightRAG...");
    if (this.serverProcess) {
        this.serverProcess.kill();
        this.serverProcess = null;
    }
    try {
        if (process.platform === 'win32') {
            execSync('taskkill /F /IM lightrag-server.exe /T', { stdio: 'ignore' });
        }
    } catch (error) {}
  }

  public async restartLightRagServer() {
    new Notice("🔄 Reiniciando Neural Backend...");
    this.stopLightRagServer();
    setTimeout(async () => {
        await this.updateEnvFile();
        await this.startLightRagServer();
    }, 2000);
  }

  public async updateEnvFile() {
    const workDir = this.settings.lightRagWorkDir;
    if (!workDir) return;

    try {
        const targetLlmId = this.settings.lightRagModelId || this.settings.chatModelId;
        const embeddingId = this.settings.embeddingModelId;
        
        const llmModelObj = this.settings.chatModels.find(m => m.id === targetLlmId);
        const embedModelObj = this.settings.embeddingModels.find(m => m.id === embeddingId);

        const llmProvider = this.settings.providers.find(p => p.id === llmModelObj?.providerId);
        const embedProvider = this.settings.providers.find(p => p.id === embedModelObj?.providerId);

        let envContent = `# Generated by Neural Composer\n`;
        envContent += `WORKING_DIR=${workDir}\n`;
        envContent += `HOST=0.0.0.0\n`;
        envContent += `PORT=9621\n`;
        envContent += `SUMMARY_LANGUAGE=${this.settings.lightRagSummaryLanguage || 'English'}\n\n`;

        if (llmModelObj && llmProvider) {
            envContent += `# LLM Configuration\n`;
            envContent += `LLM_BINDING=${llmProvider.id}\n`;
            envContent += `LLM_MODEL=${llmModelObj.model}\n`;
            if (llmProvider.id === 'ollama' && llmProvider.baseUrl) envContent += `OLLAMA_HOST=${llmProvider.baseUrl}\n`;
            else if (llmProvider.id === 'openai' && llmProvider.baseUrl?.includes('localhost')) envContent += `OPENAI_BASE_URL=${llmProvider.baseUrl}\n`;
        }

        if (embedModelObj && embedProvider) {
            envContent += `\n# Embedding Configuration\n`;
            envContent += `EMBEDDING_BINDING=${embedProvider.id}\n`;
            envContent += `EMBEDDING_MODEL=${embedModelObj.model}\n`;
            envContent += `EMBEDDING_DIM=${embedModelObj.dimension || 1024}\n`;
            envContent += `MAX_TOKEN_SIZE=8192\n`;
        }

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
    } catch (err) { console.error("❌ Error actualizando .env:", err); }
  }

  async startLightRagServer() {
    const command = this.settings.lightRagCommand;
    const workDir = this.settings.lightRagWorkDir;

    if (!workDir || !command) {
        new Notice("⚠️ Configure LightRAG paths in settings.");
        return;
    }

    await this.updateEnvFile();

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);
        const response = await fetch("http://localhost:9621/health", { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
            console.log("✅ LightRAG Server ya estaba activo.");
            return;
        }
    } catch (e) {}

    console.log(`🚀 Iniciando LightRAG en: ${workDir}`);
    new Notice("🚀 Iniciando Motor Neural...");

    try {
        this.serverProcess = spawn(command, ['--port', '9621', '--working-dir', workDir], {
            cwd: workDir,
            shell: true,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', FORCE_COLOR: '1' }
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

  // --- BYPASS ---
  async getDbManager(): Promise<DatabaseManager> { return {} as any; }

  async getRAGEngine(): Promise<RAGEngine> {
    if (this.ragEngine) return this.ragEngine
    if (!this.ragEngineInitPromise) {
      this.ragEngineInitPromise = (async () => {
        try {
          this.ragEngine = new RAGEngine(
            this.app, this.settings, {} as any,
            async () => { await this.restartLightRagServer(); }
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

  private registerTimeout(callback: () => void, timeout: number): void {
    const timeoutId = setTimeout(callback, timeout)
    this.timeoutIds.push(timeoutId)
  }
}