import {
  Plugin,
  Notice,
  requestUrl,
  Editor,
  MarkdownView,
  TFile,
  TFolder,
  WorkspaceLeaf,
  setTooltip,
  Platform,
  Menu,
  TAbstractFile,
} from 'obsidian'
import type { ChildProcess } from 'child_process'
import {
  NativeGraphView,
  NATIVE_GRAPH_VIEW_TYPE,
} from './views/NativeGraphView'

import { ApplyView } from './ApplyView'
import { ChatView } from './ChatView'
import { ChatProps } from './components/chat-view/Chat'
import { APPLY_VIEW_TYPE, CHAT_VIEW_TYPE } from './constants'
import { McpManager } from './core/mcp/mcpManager'
import { RAGEngine } from './core/rag/ragEngine'
import { DocIndexService } from './core/rag/docIndexService'
import { FileExplorerDecorator } from './core/rag/fileExplorerDecorator'
import { DatabaseManager } from './database/DatabaseManager'
import {
  NeuralComposerSettings,
  NeuralComposerSettingsSchema,
} from './settings/schema/setting.types'
import { parseNeuralComposerSettings } from './settings/schema/settings'
import { NeuralComposerSettingTab } from './settings/SettingTab'
import { getMentionableBlockData } from './utils/obsidian'
import { VectorManager } from './database/modules/vector/VectorManager'

export const PLUGIN_NAME = 'Neural Composer'
export const BACKEND_NAME = 'LightRAG'
export const TERM_API = 'API'
export const TERM_LLM = 'LLM'
export const TERM_LLM_EMBED = 'LLM/Embed'
export const VAR_MAX_ASYNC = 'MAX_ASYNC' // Nombre de variable de entorno/configuración

// --- MASTER EXTENSION LIST ---
const SUPPORTED_EXTENSIONS = [
  'md',
  'txt',
  'docx',
  'pdf',
  'pptx',
  'xlsx',
  'rtf',
  'odt',
  'epub',
  'html',
  'htm',
  'xml',
  'json',
  'yaml',
  'yml',
  'csv',
  'tex',
  'log',
  'conf',
  'ini',
  'properties',
  'sql',
  'bat',
  'sh',
  'c',
  'cpp',
  'py',
  'java',
  'js',
  'ts',
  'swift',
  'go',
  'rb',
  'php',
  'css',
  'scss',
  'less',
]

const TEXT_BASED_EXTENSIONS = [
  'md',
  'txt',
  'html',
  'htm',
  'xml',
  'json',
  'yaml',
  'yml',
  'csv',
  'tex',
  'log',
  'conf',
  'ini',
  'properties',
  'sql',
  'bat',
  'sh',
  'c',
  'cpp',
  'py',
  'java',
  'js',
  'ts',
  'swift',
  'go',
  'rb',
  'php',
  'css',
  'scss',
  'less',
]

// Definition for internal use, as 'Adapter' is not exported directly
interface FileSystemAdapterWithBasePath {
  getBasePath: () => string
}

export default class NeuralComposerPlugin extends Plugin {
  settings: NeuralComposerSettings
  initialChatProps?: ChatProps
  settingsChangeListeners: ((newSettings: NeuralComposerSettings) => void)[] =
    []
  mcpManager: McpManager | null = null
  dbManager: DatabaseManager | null = null
  ragEngine: RAGEngine | null = null

  private dbManagerInitPromise: Promise<DatabaseManager> | null = null
  private ragEngineInitPromise: Promise<RAGEngine> | null = null

  private timeoutIds: ReturnType<typeof setTimeout>[] = []
  private modifyDebounceMap: Map<string, ReturnType<typeof setTimeout>> =
    new Map()
  private serverProcess: ChildProcess | null = null
  private lastErrorTime: number = 0
  public docIndexService: DocIndexService | null = null
  private fileExplorerDecorator: FileExplorerDecorator | null = null
  private lastServerStatus: 'online' | 'offline' | 'busy' = 'offline'
  /** True once the doc-status index has been loaded from disk. Prevents vault
   *  events that fire during Obsidian startup from re-submitting already-ingested files. */
  private docIndexReady = false

  /** Detected LightRAG core version (from GET /health → core_version). Null when offline or not yet checked. */
  public lightRagServerVersion: string | null = null
  /** True once at least one health check has completed (distinguishes "not yet checked" from "offline"). */
  public lightRagServerChecked = false

  private versionChangeListeners: Set<
    (info: { version: string | null; checked: boolean }) => void
  > = new Set()

  /** Subscribe to LightRAG server version/status changes. Returns an unsubscribe fn. */
  addVersionChangeListener(
    fn: (info: { version: string | null; checked: boolean }) => void,
  ): () => void {
    this.versionChangeListeners.add(fn)
    return () => this.versionChangeListeners.delete(fn)
  }

  private setServerVersion(v: string | null): void {
    const wasChecked = this.lightRagServerChecked
    this.lightRagServerChecked = true
    // Notify if: first health check (checked state just flipped) OR version changed
    if (!wasChecked || v !== this.lightRagServerVersion) {
      this.lightRagServerVersion = v
      this.versionChangeListeners.forEach((fn) =>
        fn({ version: v, checked: true }),
      )
    }
  }

  // Node.js modules — loaded lazily on desktop only, always null on mobile
  private _nodeFs: typeof import('fs') | null = null
  private _nodePath: typeof import('path') | null = null
  private _nodeChildProcess: typeof import('child_process') | null = null
  private _nodeNet: typeof import('net') | null = null

  // --- STATUS BAR PROPERTIES ---
  private statusBarEl: HTMLElement
  private statusDotEl: HTMLElement
  private heartbeatInterval: number

  /** Returns true if the user has enabled remote server mode. */
  isRemoteServer(): boolean {
    return this.settings.lightRagUseRemote
  }

  /** Extracts the port number from the configured server URL, with safe fallback. */
  private getServerPort(): number {
    try {
      return parseInt(new URL(this.settings.lightRagServerUrl).port) || 9621
    } catch {
      return 9621
    }
  }

  /** Returns headers for LightRAG API calls, including auth if configured. */
  private getLightRagHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}
    if (this.settings.lightRagApiKey) {
      headers['Authorization'] = `Bearer ${this.settings.lightRagApiKey}`
    }
    return headers
  }

  async onload() {
    await this.loadSettings()

    // Load Node.js built-ins once at startup — desktop only, never on mobile.
    // Use require() (not import()) because the bundle is CJS and dynamic ESM
    // import() is not resolved correctly in Obsidian's plugin loader.
    if (Platform.isDesktop) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this._nodeFs = require('fs') as typeof import('fs')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this._nodePath = require('path') as typeof import('path')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this._nodeChildProcess =
        require('child_process') as typeof import('child_process')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this._nodeNet = require('net') as typeof import('net')
    }

    // --- ZERO-CONFIG & PORTABILITY ---
    if (Platform.isDesktop && !this.settings.lightRagWorkDir) {
      // Safe casting to check for desktop adapter capabilities
      const adapter = this.app.vault.adapter

      if (
        typeof (adapter as unknown as FileSystemAdapterWithBasePath)
          .getBasePath === 'function'
      ) {
        const vaultRoot = (
          adapter as unknown as FileSystemAdapterWithBasePath
        ).getBasePath()
        const defaultPath = this._nodePath!.join(vaultRoot, '.neural_memory')

        if (!this._nodeFs!.existsSync(defaultPath)) {
          try {
            this._nodeFs!.mkdirSync(defaultPath, { recursive: true })
          } catch (e) {
            console.error('Failed to create default folder:', e)
            new Notice('Failed to create default .neural_memory folder.')
          }
        }

        this.settings.lightRagWorkDir = defaultPath
        await this.saveData(this.settings)
      }
    }

    // --- STATUS BAR INITIALIZATION ---
    this.statusBarEl = this.addStatusBarItem()
    this.statusBarEl.addClass('nrlcmp-status-bar-item')
    this.statusDotEl = this.statusBarEl.createSpan({ cls: 'nrlcmp-status-dot' })
    this.statusBarEl.createSpan({ text: 'Neural' })
    setTooltip(this.statusBarEl, `${BACKEND_NAME} server status`)

    this.statusBarEl.onclick = () => {
      void this.handleStatusBarClick()
    }

    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this))
    this.registerView(APPLY_VIEW_TYPE, (leaf) => new ApplyView(leaf))

    this.addRibbonIcon('brain-circuit', `Open ${PLUGIN_NAME}`, () => {
      void this.openChatView()
    })

    // NATIVE GRAPH VIEWER
    this.registerView(
      NATIVE_GRAPH_VIEW_TYPE,
      (leaf) => new NativeGraphView(leaf, this),
    )

    this.addCommand({
      id: 'open-native-graph',
      name: 'Open native graph view',
      callback: () => {
        // Wrapped in void async IIFE to satisfy void return expectation
        void (async () => {
          const { workspace } = this.app
          let leaf: WorkspaceLeaf | null = null
          const leaves = workspace.getLeavesOfType(NATIVE_GRAPH_VIEW_TYPE)

          if (leaves.length > 0) {
            leaf = leaves[0]
          } else {
            leaf = workspace.getLeaf(true)
            await leaf.setViewState({
              type: NATIVE_GRAPH_VIEW_TYPE,
              active: true,
            })
          }
          if (leaf) await workspace.revealLeaf(leaf)
        })()
      },
    })

    this.addCommand({
      id: 'open-new-chat',
      name: 'Open chat',
      callback: () => {
        void this.openChatView(true)
      },
    })

    this.addCommand({
      id: 'add-selection-to-chat',
      name: 'Add selection to chat',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        void this.addSelectionToChat(editor, view)
      },
    })

    // --- QUICK RESTART COMMAND ---
    this.addCommand({
      id: 'restart-neural-backend',
      name: `Restart neural backend (${BACKEND_NAME})`,
      callback: () => {
        if (!Platform.isDesktop) {
          new Notice(
            'Local server management is only available on desktop. Use remote server mode on mobile.',
          )
          return
        }
        this.restartLightRagServer()
      },
    })

    // --- CONTEXT MENU (FOLDERS) ---
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFolder) {
          menu.addItem((item) => {
            item
              .setTitle('Ingest folder into graph')
              .setIcon('layers')
              .onClick(() => {
                void this.batchIngestFolder(file)
              })
          })
        }
      }),
    )

    // --- SINGLE FILE INGEST COMMAND ---
    this.addCommand({
      id: 'ingest-current-file',
      name: 'Ingest current file into knowledge graph',
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile()
        if (
          !file ||
          !SUPPORTED_EXTENSIONS.includes(file.extension.toLowerCase())
        ) {
          return false
        }
        if (checking) return true

        // IIFE to handle async in callback safely
        void (async () => {
          const title = file.basename
          const ext = file.extension.toLowerCase()
          const notice = new Notice(
            `Sending "${file.name}" to the system...`,
            0,
          )

          try {
            const ragEngine = await this.getRAGEngine()
            let success = false

            if (TEXT_BASED_EXTENSIONS.includes(ext)) {
              const content = await this.app.vault.read(file)
              const finalContent =
                ext === 'md' ? `Title: ${title}\n\n${content}` : content
              success = await ragEngine.insertDocument(finalContent, file.path)
            } else {
              success = await ragEngine.uploadDocument(file)
            }

            if (success) {
              notice.setMessage(`Sent. Processing in background...`)
              await this.monitorPipeline(notice)
            } else {
              notice.setMessage(`Upload failed.`)
              setTimeout(() => notice.hide(), 5000)
            }
          } catch (error) {
            console.error(error)
            notice.setMessage(`Critical error connecting to backend.`)
            setTimeout(() => notice.hide(), 5000)
          }
        })()
      },
    })

    // --- INCREMENTAL SYNC: vault event listeners ---
    // Only active when the user has configured a watched sync folder.
    // isInSyncFolder checks that the file lives inside (or at) that folder.
    const isInSyncFolder = (filePath: string): boolean => {
      const syncFolder = this.settings.lightRagSyncFolder.trim()
      if (!syncFolder) return false
      const normalized = syncFolder.endsWith('/')
        ? syncFolder
        : `${syncFolder}/`
      return filePath === syncFolder || filePath.startsWith(normalized)
    }

    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (!(file instanceof TFile)) return
        if (!isInSyncFolder(file.path)) return
        if (!SUPPORTED_EXTENSIONS.includes(file.extension.toLowerCase())) return
        // Guard here (before setTimeout) so startup create-events are dropped
        // before the 2 s timer is even scheduled. By the time the timer would
        // fire, onLayoutReady has already set docIndexReady = true, so the
        // guard inside the async callback would be bypassed on every startup file.
        if (!this.docIndexReady) return
        // Wait 2 s so the file content is available (especially for moves/imports)
        setTimeout(() => {
          void (async () => {
            // Skip if already processed and not modified
            if (this.docIndexService && !this.docIndexService.needsIngestion(file.path, file.stat.mtime)) {
              return
            }
            const notice = new Notice(
              `Graph sync: sending "${file.name}"...`,
              0,
            )
            const ragEngine = await this.getRAGEngine()
            this.docIndexService?.setProcessing(file.path, file.stat.mtime)
            const ok = await ragEngine.ingestFile(file)
            if (!ok) {
              this.docIndexService?.setFailed(file.path)
            } else {
              // Poll pipeline_status every 1 s → sync when done → update dots
              this.docIndexService?.startPipelineWatch(1000)
            }
            notice.setMessage(
              ok
                ? `Graph sync: "${file.name}" sent — processing in background.`
                : `Graph sync: failed to send "${file.name}".`,
            )
            setTimeout(() => notice.hide(), 6000)
          })()
        }, 2000)
      }),
    )

    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (!(file instanceof TFile)) return
        if (!isInSyncFolder(file.path)) return
        void (async () => {
          const notice = new Notice(
            `Graph sync: removing "${file.name}" from index...`,
            0,
          )
          const ragEngine = await this.getRAGEngine()
          const removed = await ragEngine.deleteDocumentByFilePath(
            file.path,
            file.name,
          )
          if (removed) this.docIndexService?.removeEntry(file.path)
          notice.setMessage(
            removed
              ? `Graph sync: "${file.name}" removed from graph.`
              : `Graph sync: "${file.name}" was not in the graph.`,
          )
          setTimeout(() => notice.hide(), 6000)
        })()
      }),
    )

    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (!(file instanceof TFile)) return
        const wasInFolder = isInSyncFolder(oldPath)
        const nowInFolder = isInSyncFolder(file.path)
        if (!wasInFolder && !nowInFolder) return
        void (async () => {
          const ragEngine = await this.getRAGEngine()

          if (wasInFolder && nowInFolder) {
            // Renamed or moved within the watched folder
            const notice = new Notice(
              `Graph sync: updating "${file.name}" in graph...`,
              0,
            )
            const oldName = oldPath.split('/').pop() ?? oldPath
            await ragEngine.deleteDocumentByFilePath(oldPath, oldName)
            this.docIndexService?.renameEntry(oldPath, file.path)
            const ok = await ragEngine.ingestFile(file)
            notice.setMessage(
              ok
                ? `Graph sync: graph updated for "${file.name}".`
                : `Graph sync: failed to update "${file.name}".`,
            )
            setTimeout(() => notice.hide(), 6000)
          } else if (wasInFolder) {
            // Moved OUT of the watched folder
            const notice = new Notice(
              `Graph sync: removing "${file.name}" from graph...`,
              0,
            )
            const oldName = oldPath.split('/').pop() ?? oldPath
            const removed = await ragEngine.deleteDocumentByFilePath(
              oldPath,
              oldName,
            )
            notice.setMessage(
              removed
                ? `Graph sync: "${file.name}" removed from graph.`
                : `Graph sync: "${file.name}" was not in the graph.`,
            )
            setTimeout(() => notice.hide(), 6000)
          } else {
            // Moved INTO the watched folder
            const notice = new Notice(
              `Graph sync: sending "${file.name}"...`,
              0,
            )
            this.docIndexService?.setProcessing(file.path, file.stat.mtime)
            const ok = await ragEngine.ingestFile(file)
            if (!ok) {
              this.docIndexService?.setFailed(file.path)
            } else {
              this.docIndexService?.startPipelineWatch(1000)
            }
            notice.setMessage(
              ok
                ? `Graph sync: "${file.name}" sent — processing in background.`
                : `Graph sync: failed to send "${file.name}".`,
            )
            setTimeout(() => notice.hide(), 6000)
          }
        })()
      }),
    )

    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (!(file instanceof TFile)) return
        if (!isInSyncFolder(file.path)) return
        if (!SUPPORTED_EXTENSIONS.includes(file.extension.toLowerCase())) return

        // Debounce: wait 5 s of inactivity before re-indexing
        const existing = this.modifyDebounceMap.get(file.path)
        if (existing) clearTimeout(existing)
        const id = setTimeout(() => {
          this.modifyDebounceMap.delete(file.path)
          void (async () => {
            if (!this.docIndexReady) return
            // Skip if not modified since last ingestion
            if (this.docIndexService && !this.docIndexService.needsIngestion(file.path, file.stat.mtime)) {
              return
            }
            const notice = new Notice(
              `Graph sync: re-indexing "${file.name}"...`,
              0,
            )
            const ragEngine = await this.getRAGEngine()
            this.docIndexService?.setProcessing(file.path, file.stat.mtime)
            const ok = await ragEngine.reindexFile(file)
            if (!ok) {
              this.docIndexService?.setFailed(file.path)
            } else {
              this.docIndexService?.startPipelineWatch(1000)
            }
            notice.setMessage(
              ok
                ? `Graph sync: "${file.name}" sent — processing in background.`
                : `Graph sync: failed to re-index "${file.name}".`,
            )
            setTimeout(() => notice.hide(), 6000)
          })()
        }, 5000)
        this.modifyDebounceMap.set(file.path, id)
      }),
    )

    // --- DOCUMENT STATUS CONTEXT MENUS ---
    this.registerEvent(
      this.app.workspace.on(
        'file-menu',
        (menu: Menu, file: TAbstractFile) => {
          const syncFolder = this.settings.lightRagSyncFolder.trim()
          if (!syncFolder || !this.docIndexService) return

          if (file instanceof TFile) {
            const inFolder =
              file.path === syncFolder ||
              file.path.startsWith(syncFolder + '/')
            if (!inFolder) return

            const status = this.docIndexService.getStatus(file.path)

            // Allow reprocessing for any non-processed state, including
            // 'processing' (stuck from a crashed session) and 'removed'
            // (user wants to re-add the doc to the graph).
            if (status === 'failed' || status === 'unknown' || status === 'processing' || status === 'removed') {
              menu.addItem((item) =>
                item
                  .setTitle('Reprocess document')
                  .setIcon('refresh-cw')
                  .onClick(() => {
                    void (async () => {
                      const ragEngine = await this.getRAGEngine()
                      this.docIndexService!.setProcessing(
                        file.path,
                        file.stat.mtime,
                      )
                      const ok = await ragEngine.ingestFile(file)
                      if (!ok) {
                        this.docIndexService!.setFailed(file.path)
                      } else {
                        this.docIndexService!.startPipelineWatch(1000)
                      }
                    })()
                  }),
              )
            }

            if (status === 'processed') {
              menu.addItem((item) =>
                item
                  .setTitle('Remove from graph')
                  .setIcon('trash-2')
                  .onClick(() => {
                    void (async () => {
                      const ragEngine = await this.getRAGEngine()
                      await ragEngine.deleteDocumentByFilePath(
                        file.path,
                        file.name,
                      )
                      // Mark as 'removed' (blue dot) instead of deleting the entry.
                      // This preserves the intentional-removal state across restarts
                      // and prevents auto-reingestion on file-change events.
                      this.docIndexService!.setRemoved(file.path)
                    })()
                  }),
              )
            }
          }

          if (file instanceof TFolder && file.path === syncFolder) {
            menu.addItem((item) =>
              item
                .setTitle('Reprocess folder')
                .setIcon('refresh-cw')
                .onClick(() => {
                  void (async () => {
                    const ragEngine = await this.getRAGEngine()
                    const files = this.app.vault
                      .getFiles()
                      .filter(
                        (f) =>
                          (f.path === syncFolder ||
                            f.path.startsWith(syncFolder + '/')) &&
                          SUPPORTED_EXTENSIONS.includes(
                            f.extension.toLowerCase(),
                          ),
                      )
                    let anySubmitted = false
                    for (const f of files) {
                      const st = this.docIndexService!.getStatus(f.path)
                      // Include 'processing' — a doc can be stuck at that
                      // status from a previous failed/interrupted submission.
                      if (st === 'failed' || st === 'unknown' || st === 'processing') {
                        this.docIndexService!.setProcessing(f.path, f.stat.mtime)
                        const ok = await ragEngine.ingestFile(f)
                        if (!ok) this.docIndexService!.setFailed(f.path)
                        else anySubmitted = true
                      }
                    }
                    if (anySubmitted) {
                      this.docIndexService!.startPipelineWatch(1000)
                    }
                  })()
                }),
            )
          }
        },
      ),
    )

    this.addSettingTab(new NeuralComposerSettingTab(this.app, this))

    // --- AGGRESSIVE AUTO-START ---
    this.app.workspace.onLayoutReady(() => {
      if (
        Platform.isDesktop &&
        this.settings.enableAutoStartServer &&
        !this.isRemoteServer()
      ) {
        void this.startLightRagServer()
      }
      // --- LATIDO LEGAL Y SEGURO ---
      // registerInterval asegura que el proceso muera si el plugin se apaga
      this.registerInterval(
        window.setInterval(() => {
          void this.checkAndUpdateStatus()
        }, 30000),
      )

      // Primera revisión inmediata
      void this.checkAndUpdateStatus()

      // Initialize doc index service + file explorer decoration
      this.docIndexService = new DocIndexService(this)
      this.fileExplorerDecorator = new FileExplorerDecorator()
      this.docIndexService.setUpdateCallback(() => this.decorateFileExplorer())

      // MutationObserver inside FileExplorerDecorator watches childList changes
      // (Obsidian re-rendering file items) and re-applies data-nc-status attributes.
      // Safe: our setAttribute calls are attribute mutations — they do NOT fire
      // childList observers, so there is zero risk of an infinite loop.
      this.fileExplorerDecorator.startObserving(() => this.decorateFileExplorer())

      // Re-decorate whenever the workspace layout changes (pane open/close, etc.)
      this.registerEvent(
        this.app.workspace.on('layout-change', () => {
          this.decorateFileExplorer()
        }),
      )

      // Load persisted index → render immediately, then sync with server
      void (async () => {
        await this.docIndexService!.load()
        this.docIndexReady = true   // vault events safe to process from here
        this.decorateFileExplorer() // render cached statuses right away

        // Give a short delay for the server to be reachable, then sync.
        // We check health first so we don't clobber the cached index when
        // the server is simply offline.
        setTimeout(() => {
          void (async () => {
            const online = await this.docIndexService?.isServerOnline()
            if (online) {
              await this.docIndexService?.syncFromServer()
              this.decorateFileExplorer()
              // Always start pipeline watch after the initial sync:
              // • If the pipeline is idle → one poll → busy=false → stops immediately
              // • If docs are processing (from a previous session) → watches until done
              this.docIndexService?.startPipelineWatch(2000)
            }
          })()
        }, 2000)
      })()
    })
  }

  // --- MONITORING LOGIC ---
  async monitorPipeline(notice: Notice) {
    this.updateStatusUI('busy')
    let isBusy = true
    let errors = 0
    // Wait for server to register task
    await new Promise((r) => setTimeout(r, 1000))

    while (isBusy) {
      try {
        const response = await requestUrl({
          url: `${this.settings.lightRagServerUrl}/documents/pipeline_status`,
          method: 'GET',
          headers: this.getLightRagHeaders(),
        })

        const status = response.json
        isBusy = status.busy

        if (isBusy) {
          const total = status.batchs || 1
          const current = status.cur_batch || 0
          const percent = Math.round((current / total) * 100)

          notice.setMessage(
            `System processing...\n` +
              `Progress: ${percent}% (${current}/${total})\n` +
              `📝 ${status.latest_message || 'Analyzing...'}`,
          )
        }

        if (!isBusy) break

        await new Promise((r) => setTimeout(r, 1500)) // Polling 1.5s
      } catch {
        // Fix: Use empty catch block to avoid unused variable '_' warning
        errors++
        if (errors > 3) isBusy = false
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    this.updateStatusUI('online')
    notice.setMessage('Integrated knowledge!\nThe graph is up to date.')
    setTimeout(() => notice.hide(), 5000)
  }

  // --- BATCH LOGIC ---
  private getAllSupportedFiles(folder: TFolder): TFile[] {
    let files: TFile[] = []
    for (const child of folder.children) {
      if (child instanceof TFile) {
        if (SUPPORTED_EXTENSIONS.includes(child.extension.toLowerCase())) {
          files.push(child)
        }
      } else if (child instanceof TFolder) {
        files = files.concat(this.getAllSupportedFiles(child))
      }
    }
    return files
  }

  async batchIngestFolder(folder: TFolder) {
    const files = this.getAllSupportedFiles(folder)
    if (files.length === 0) {
      new Notice('Empty folder or no supported files.')
      return
    }

    const notice = new Notice(
      `📦 Sending ${files.length} files to system...`,
      0,
    )

    try {
      const ragEngine = await this.getRAGEngine()
      let successCount = 0

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const ext = file.extension.toLowerCase()

        notice.setMessage(
          `📦 Sending (${i + 1}/${files.length}):\n📄 ${file.name}`,
        )

        try {
          let result = false
          if (TEXT_BASED_EXTENSIONS.includes(ext)) {
            const content = await this.app.vault.read(file)
            const finalContent =
              ext === 'md' ? `Title: ${file.basename}\n\n${content}` : content
            result = await ragEngine.insertDocument(finalContent, file.path)
          } else {
            result = await ragEngine.uploadDocument(file)
          }

          if (result) successCount++
          await new Promise((resolve) => setTimeout(resolve, 200))
        } catch (err) {
          console.error(`Error processing ${file.name}:`, err)
        }
      }

      notice.setMessage(
        `Uploaded files (${successCount}).\nStart processing...`,
      )
      await this.monitorPipeline(notice)
    } catch (error) {
      console.error('Batch error:', error)
      notice.setMessage('Error starting upload.')
      setTimeout(() => notice.hide(), 5000)
    }
  }

  // --- LIFECYCLE & SERVER MANAGEMENT ---

  onunload() {
    window.clearInterval(this.heartbeatInterval)
    this.timeoutIds.forEach((id) => clearTimeout(id))
    this.timeoutIds = []
    this.modifyDebounceMap.forEach((id) => clearTimeout(id))
    this.modifyDebounceMap.clear()

    if (this.ragEngine) {
      this.ragEngine.cleanup()
      this.ragEngine = null
    }

    // Reset promises so they can be re-initialized if plugin is re-enabled without full reload
    this.dbManagerInitPromise = null
    this.ragEngineInitPromise = null

    if (this.dbManager) {
      // FIX: Use void operator to handle the async cleanup promise
      void this.dbManager.cleanup()
      this.dbManager = null
    }
    if (this.mcpManager) {
      // FIX: Use void operator here too if mcpManager.cleanup() is async
      void this.mcpManager.cleanup()
      this.mcpManager = null
    }
    this.docIndexService?.destroy()
    this.docIndexService = null
    this.fileExplorerDecorator?.clear()
    this.fileExplorerDecorator = null
    this.stopLightRagServer()
  }

  /** Apply data-nc-status attributes to files and the watched folder. No DOM injection. */
  private decorateFileExplorer(): void {
    if (!this.fileExplorerDecorator || !this.docIndexService) return
    const syncFolder = this.settings.lightRagSyncFolder.trim()

    // Compute aggregate folder status from ALL files in the sync folder,
    // not just the ones visible in the DOM (avoids false-green on scroll).
    const folderFilePaths = syncFolder
      ? this.app.vault
          .getFiles()
          .filter(
            (f) =>
              f.path === syncFolder || f.path.startsWith(syncFolder + '/'),
          )
          .map((f) => f.path)
      : []
    const folderStatus = this.docIndexService.computeFolderStatus(folderFilePaths)

    this.fileExplorerDecorator.decorate(
      syncFolder,
      (path) => this.docIndexService!.getStatus(path),
      folderStatus,
    )
  }

  public stopLightRagServer() {
    if (!Platform.isDesktop) {
      this.updateStatusUI('offline')
      return
    }
    if (this.serverProcess) {
      this.serverProcess.kill()
      this.serverProcess = null
    }
    try {
      if (this._nodeChildProcess && typeof process !== 'undefined') {
        if (process.platform === 'win32') {
          this._nodeChildProcess.execSync(
            'taskkill /F /IM lightrag-server.exe /T',
            { stdio: 'ignore' },
          )
        } else {
          // macOS / Linux: kill whatever is listening on the server port.
          // This handles orphaned processes started outside the plugin (e.g.
          // manually, or from a previous Obsidian session).
          const port = this.getServerPort()
          this._nodeChildProcess.execSync(
            `bash -c "lsof -ti tcp:${port} | xargs kill -9 2>/dev/null || true"`,
            { stdio: 'ignore' },
          )
        }
      }
    } catch {
      // Ignore kill errors if process not found
    }
    this.updateStatusUI('offline')
  }

  public restartLightRagServer(skipEnvUpdate = false) {
    if (!Platform.isDesktop) {
      new Notice(
        'Local server management is only available on desktop. Use remote server mode on mobile.',
      )
      return
    }
    new Notice('Restarting system backend...')
    this.stopLightRagServer()
    // Use timeout to allow process to fully die
    this.timeoutIds.push(
      setTimeout(() => {
        if (!skipEnvUpdate) this.updateEnvFile()
        void this.startLightRagServer()
      }, 2000),
    )
  }

  // Normalizes a provider base URL so it ends with /v1, regardless of how the user entered it.
  // LightRAG's Python OpenAI client uses base_url directly and expects the /v1 path to be included.
  private normalizeBindingHost(url: string): string {
    const trimmed = url.replace(/\/+$/, '') // strip trailing slashes
    if (trimmed.endsWith('/v1')) return trimmed
    return `${trimmed}/v1`
  }

  // GENERATOR
  public generateEnvConfig(): string {
    const workDir = this.settings.lightRagWorkDir
    if (!workDir) return ''

    try {
      const targetLlmId =
        this.settings.lightRagModelId || this.settings.chatModelId
      const embeddingId =
        this.settings.lightRagEmbeddingModelId || this.settings.embeddingModelId

      const llmModelObj = this.settings.chatModels.find(
        (m) => m.id === targetLlmId,
      )
      const embedModelObj = this.settings.embeddingModels.find(
        (m) => m.id === embeddingId,
      )

      const llmProvider = this.settings.providers.find(
        (p) => p.id === llmModelObj?.providerId,
      )
      const embedProvider = this.settings.providers.find(
        (p) => p.id === embedModelObj?.providerId,
      )

      let envContent = `# Generated by Neural Composer\n`
      envContent += `# You can edit this file manually before restarting.\n\n`

      envContent += `WORKING_DIR=${workDir}\n`
      envContent += `HOST=127.0.0.1\n`
      envContent += `PORT=${this.getServerPort()}\n`
      envContent += `SUMMARY_LANGUAGE=${this.settings.lightRagSummaryLanguage || 'English'}\n`

      // --- TUNING VARS ---
      envContent += `\n# --- Performance Tuning ---\n`
      envContent += `MAX_ASYNC=${this.settings.lightRagMaxAsync}\n`
      envContent += `MAX_PARALLEL_INSERT=${this.settings.lightRagMaxParallelInsert}\n`
      envContent += `CHUNK_SIZE=${this.settings.lightRagChunkSize}\n`
      envContent += `CHUNK_OVERLAP_SIZE=${this.settings.lightRagChunkOverlap}\n\n`

      // LLM CONFIGURATION
      if (llmModelObj && llmProvider) {
        envContent += `# LLM Configuration\n`

        // Lista de proveedores nativos que LightRAG conoce por nombre
        const nativeProviders = [
          'openai',
          'gemini',
          'ollama',
          'anthropic',
          'azure',
        ]

        // ¿Es un proveedor nativo o uno custom?
        const isNative = nativeProviders.includes(llmProvider.id)

        if (isNative) {
          envContent += `LLM_BINDING=${llmProvider.id}\n`

          if (llmProvider.id === 'ollama' && llmProvider.baseUrl) {
            envContent += `OLLAMA_HOST=${llmProvider.baseUrl}\n`
          } else if (llmProvider.baseUrl) {
            envContent += `LLM_BINDING_HOST=${this.normalizeBindingHost(llmProvider.baseUrl)}\n`
          }
          if (llmProvider.apiKey) {
            envContent += `LLM_BINDING_API_KEY=${llmProvider.apiKey}\n`
          }
        } else {
          // Custom provider: use openai-compatible binding.
          // Include a fallback base URL for well-known providers that may not
          // have an explicit baseUrl stored (e.g. openrouter added before this
          // field was required). Without this, LightRAG silently falls back to
          // api.openai.com and rejects non-OpenAI keys with a 401 error.
          const KNOWN_PROVIDER_BASE_URLS: Record<string, string> = {
            openrouter: 'https://openrouter.ai/api/v1',
            groq: 'https://api.groq.com/openai/v1',
            deepseek: 'https://api.deepseek.com',
            mistral: 'https://api.mistral.ai/v1',
            perplexity: 'https://api.perplexity.ai',
            morph: 'https://api.morph.so/v1',
            'lm-studio': 'http://localhost:1234/v1',
          }
          envContent += `LLM_BINDING=openai\n`
          const resolvedLlmBaseUrl =
            llmProvider.baseUrl ||
            KNOWN_PROVIDER_BASE_URLS[llmProvider.id] ||
            KNOWN_PROVIDER_BASE_URLS[llmProvider.type]
          if (resolvedLlmBaseUrl) {
            envContent += `LLM_BINDING_HOST=${this.normalizeBindingHost(resolvedLlmBaseUrl)}\n`
          }
          if (llmProvider.apiKey) {
            envContent += `LLM_BINDING_API_KEY=${llmProvider.apiKey}\n`
          }
        }

        envContent += `LLM_MODEL=${llmModelObj.model}\n`
      }

      // Embeddings (Smart Mapping)
      if (embedModelObj && embedProvider) {
        envContent += `\n# Embedding Configuration\n`

        const nativeProviders = [
          'openai',
          'gemini',
          'ollama',
          'anthropic',
          'azure',
        ]
        const isNativeEmbed = nativeProviders.includes(embedProvider.id)

        if (isNativeEmbed) {
          envContent += `EMBEDDING_BINDING=${embedProvider.id}\n`

          // LightRAG bug workaround: get_default_host('ollama') reads LLM_BINDING_HOST
          // as a fallback instead of using a proper Ollama default. When LLM_BINDING_HOST
          // is set to a remote provider (e.g. OpenRouter), Ollama embedding silently routes
          // there and gets 404s. Always write EMBEDDING_BINDING_HOST explicitly to prevent this.
          const NATIVE_EMBED_DEFAULT_HOSTS: Record<string, string> = {
            ollama: 'http://localhost:11434',
          }
          const resolvedNativeEmbedHost =
            embedProvider.baseUrl ||
            NATIVE_EMBED_DEFAULT_HOSTS[embedProvider.id]
          if (resolvedNativeEmbedHost) {
            // Ollama uses its own /api/* paths — do NOT append /v1
            const normalizedEmbedHost =
              embedProvider.id === 'ollama'
                ? resolvedNativeEmbedHost.replace(/\/+$/, '')
                : this.normalizeBindingHost(resolvedNativeEmbedHost)
            envContent += `EMBEDDING_BINDING_HOST=${normalizedEmbedHost}\n`
          }
          if (embedProvider.apiKey) {
            envContent += `EMBEDDING_BINDING_API_KEY=${embedProvider.apiKey}\n`
          }
        } else {
          // Custom provider: use openai-compatible binding with fallback base URL.
          const KNOWN_EMBED_BASE_URLS: Record<string, string> = {
            openrouter: 'https://openrouter.ai/api/v1',
            groq: 'https://api.groq.com/openai/v1',
            deepseek: 'https://api.deepseek.com',
            mistral: 'https://api.mistral.ai/v1',
            perplexity: 'https://api.perplexity.ai',
            morph: 'https://api.morph.so/v1',
            'lm-studio': 'http://localhost:1234/v1',
          }
          envContent += `EMBEDDING_BINDING=openai\n`
          const resolvedEmbedBaseUrl =
            embedProvider.baseUrl ||
            KNOWN_EMBED_BASE_URLS[embedProvider.id] ||
            KNOWN_EMBED_BASE_URLS[embedProvider.type]
          if (resolvedEmbedBaseUrl) {
            envContent += `EMBEDDING_BINDING_HOST=${this.normalizeBindingHost(resolvedEmbedBaseUrl)}\n`
          }
          if (embedProvider.apiKey) {
            envContent += `EMBEDDING_BINDING_API_KEY=${embedProvider.apiKey}\n`
          }
        }

        envContent += `EMBEDDING_MODEL=${embedModelObj.model}\n`
        envContent += `EMBEDDING_DIM=${embedModelObj.dimension || 1024}\n`
        envContent += `MAX_TOKEN_SIZE=8192\n`
      }

      // RERANKING
      const rerankSelection = this.settings.lightRagRerankBinding

      if (rerankSelection && rerankSelection !== '') {
        envContent += `\n# Reranking Configuration\n`

        let realBindingName = rerankSelection

        if (rerankSelection === 'custom') {
          realBindingName = this.settings.lightRagRerankBindingType || 'cohere'
          envContent += `RERANK_BINDING_HOST=${this.settings.lightRagRerankHost}\n`
        } else {
          if (rerankSelection === 'jina')
            envContent += `RERANK_BINDING_HOST=https://api.jina.ai/v1/rerank\n`
          if (rerankSelection === 'cohere')
            envContent += `RERANK_BINDING_HOST=https://api.cohere.com/v2/rerank\n`
        }

        envContent += `RERANK_BINDING=${realBindingName}\n`
        envContent += `RERANK_MODEL=${this.settings.lightRagRerankModel}\n`
        if (this.settings.lightRagRerankApiKey) {
          envContent += `RERANK_BINDING_API_KEY=${this.settings.lightRagRerankApiKey}\n`
        }
      } else {
        envContent += `\n# Reranking Disabled\n`
        envContent += `RERANK_BINDING=null\n`
      }

      // API Keys
      const providersNeeded = new Set([llmProvider, embedProvider])
      envContent += `\n# API Keys\n`
      providersNeeded.forEach((p) => {
        if (p && p.apiKey) {
          const keyName = p.id.toUpperCase()
          if (keyName === 'GEMINI') envContent += `GEMINI_API_KEY=${p.apiKey}\n`
          if (keyName === 'OPENAI') envContent += `OPENAI_API_KEY=${p.apiKey}\n`
          if (keyName === 'ANTHROPIC')
            envContent += `ANTHROPIC_API_KEY=${p.apiKey}\n`
        }
      })

      // Entity Types
      if (this.settings.useCustomEntityTypes) {
        const rawTypes = this.settings.lightRagEntityTypes
        if (rawTypes && rawTypes.trim().length > 0) {
          const typeList = rawTypes
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
          envContent += `\nENTITY_TYPES='${JSON.stringify(typeList)}'\n`
        }
      }

      // Custom Overrides
      if (this.settings.lightRagCustomEnv) {
        envContent += `\n\n#####################################\n`
        envContent += `### USER CUSTOM CONFIGURATION     ###\n`
        envContent += `### (Overrides defaults above)    ###\n`
        envContent += `#####################################\n`
        envContent += this.settings.lightRagCustomEnv
        envContent += `\n`
      }

      return envContent
    } catch (err) {
      console.error('Error generating config:', err)
      return ''
    }
  }

  public saveEnvAndRestart(content: string) {
    if (!Platform.isDesktop || !this._nodeFs || !this._nodePath) return
    const workDir = this.settings.lightRagWorkDir
    if (!workDir) return

    try {
      const envPath = this._nodePath.join(workDir, '.env')
      this._nodeFs.writeFileSync(envPath, content)
      // skipEnvUpdate=true so the manually-edited content is not overwritten
      this.restartLightRagServer(true)
    } catch (e) {
      new Notice('Error saving .env file')
      console.error(e)
    }
  }

  public updateEnvFile() {
    if (!Platform.isDesktop || !this._nodeFs || !this._nodePath) return
    const content = this.generateEnvConfig()
    const workDir = this.settings.lightRagWorkDir
    if (workDir && content) {
      const envPath = this._nodePath.join(workDir, '.env')
      this._nodeFs.writeFileSync(envPath, content)
    }
  }

  public async reprocessFailedDocuments(): Promise<void> {
    const url = `${this.settings.lightRagServerUrl}/documents/reprocess_failed`
    try {
      const response = await requestUrl({
        url,
        method: 'POST',
        headers: this.settings.lightRagApiKey
          ? { Authorization: `Bearer ${this.settings.lightRagApiKey}` }
          : {},
        throw: false,
      })
      if (response.status < 400) {
        new Notice(
          'Re-processing failed documents — check the graph view in a few minutes.',
        )
      } else {
        new Notice(`Reprocess request failed (HTTP ${response.status})`)
      }
    } catch (e) {
      console.error('reprocessFailedDocuments error:', e)
      new Notice('Could not reach the LightRAG server.')
    }
  }

  private isPortInUse(port: number): Promise<boolean> {
    if (!Platform.isDesktop || !this._nodeNet) return Promise.resolve(false)
    return new Promise((resolve) => {
      const socket = new this._nodeNet!.Socket()

      const onError = () => {
        socket.destroy()
        resolve(false) // Closed
      }

      socket.setTimeout(500)
      socket.once('error', onError)
      socket.once('timeout', onError)

      socket.connect(port, '127.0.0.1', () => {
        socket.destroy()
        resolve(true) // Open (In Use)
      })
    })
  }

  async startLightRagServer() {
    if (!Platform.isDesktop) {
      new Notice(
        'Local server is not supported on mobile. Configure a remote server in settings.',
      )
      return
    }
    if (this.isRemoteServer()) {
      void this.checkAndUpdateStatus()
      return
    }

    const command = this.settings.lightRagCommand
    const workDir = this.settings.lightRagWorkDir

    if (!workDir || !command) {
      new Notice(`Configure ${BACKEND_NAME} paths in settings.`)
      return
    }

    this.updateEnvFile()

    const isAlive = await this.isPortInUse(this.getServerPort())
    if (isAlive) {
      this.updateStatusUI('online') // Si ya está vivo, lo ponemos verde
      return
    }

    new Notice(`Starting ${BACKEND_NAME}...`)
    this.updateStatusUI('busy') // Amarillo mientras arranca

    try {
      const envVars = typeof process !== 'undefined' ? { ...process.env } : {}

      // --- FIX: SANITIZE PATHS (ESPACIOS EN WINDOWS) ---
      // Si la ruta tiene espacios y no tiene comillas, las agregamos.
      const safeWorkDir =
        workDir.includes(' ') && !workDir.startsWith('"')
          ? `"${workDir}"`
          : workDir

      const safeCommand =
        command.includes(' ') && !command.startsWith('"')
          ? `"${command}"`
          : command
      // ------------------------------------------------

      // Usamos las variables sanitizadas en el comando y argumentos
      this.serverProcess = this._nodeChildProcess!.spawn(
        safeCommand,
        [
          '--port',
          `${this.getServerPort()}`,
          '--working-dir',
          safeWorkDir,
          '--workers',
          '1',
        ],
        {
          cwd: workDir, // cwd usa la ruta original (Node la maneja bien)
          shell: true,
          env: { ...envVars, PYTHONIOENCODING: 'utf-8', FORCE_COLOR: '1' },
        },
      )

      this.serverProcess.stderr?.on('data', (data) => {
        const msg = data.toString()
        const now = Date.now()

        if (!this.lastErrorTime || now - this.lastErrorTime > 5000) {
          if (
            msg.includes('503') ||
            msg.includes('overloaded') ||
            msg.includes('UNAVAILABLE')
          ) {
            new Notice(
              'Provider error: model overloaded (503).\nServer is busy, please wait a moment.',
              0,
            )
            this.lastErrorTime = now
          } else if (msg.includes('Invalid API key') || msg.includes('401')) {
            if (msg.includes('Rerank'))
              new Notice(`Rerank error: invalid ${TERM_API} key.`, 0)
            else
              new Notice(`${TERM_LLM_EMBED} error: Invalid ${TERM_API} key.`, 0)
            this.lastErrorTime = now
          } else if (
            msg.includes('Quota') ||
            msg.includes('429') ||
            msg.includes('RESOURCE_EXHAUSTED')
          ) {
            if (msg.includes('Rerank')) new Notice('Rerank quota exceeded.', 0)
            else if (msg.includes('google') || msg.includes('gemini'))
              new Notice(
                `Gemini quota exceeded.\nReduce ${VAR_MAX_ASYNC} in settings.`,
                0,
              )
            else new Notice(`${TERM_API} rate limit hit.`, 0)
            this.lastErrorTime = now
          }
        }

        if (!msg.includes('INFO:') && !msg.includes('WARNING:')) {
          console.error(`[LightRAG Error]: ${msg}`)
        }
      })

      this.serverProcess.on('close', (code) => {
        this.serverProcess = null
        this.updateStatusUI('offline')
      })

      // --- DETECCIÓN REACTIVA (LINTER SAFE) ---
      void (async () => {
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 1000))
          const alive = await this.isPortInUse(this.getServerPort())
          if (alive) {
            this.updateStatusUI('online')
            new Notice(`${BACKEND_NAME} activated`)
            return
          }
        }
        this.updateStatusUI('offline')
        new Notice('Server failed to respond in time.')
      })()
    } catch (error) {
      console.error('Error starting server:', error)
      new Notice('Fatal error starting server.')
      this.updateStatusUI('offline')
    }
  }

  async loadSettings() {
    this.settings = parseNeuralComposerSettings(await this.loadData())
    await this.saveData(this.settings)
  }

  async setSettings(newSettings: NeuralComposerSettings) {
    const validationResult = NeuralComposerSettingsSchema.safeParse(newSettings)
    if (!validationResult.success) {
      new Notice('Invalid settings')
      return
    }
    // If switching to remote mode, stop any running local server
    if (newSettings.lightRagUseRemote && !this.settings.lightRagUseRemote) {
      this.stopLightRagServer()
      void this.checkAndUpdateStatus()
    }
    this.settings = newSettings
    await this.saveData(newSettings)
    this.ragEngine?.setSettings(newSettings)
    this.settingsChangeListeners.forEach((listener) => listener(newSettings))
  }

  addSettingsChangeListener(
    listener: (newSettings: NeuralComposerSettings) => void,
  ) {
    this.settingsChangeListeners.push(listener)
    return () => {
      this.settingsChangeListeners = this.settingsChangeListeners.filter(
        (l) => l !== listener,
      )
    }
  }

  openChatView(openNewChat = false) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    const editor = view?.editor
    if (!view || !editor) {
      void this.activateChatView(undefined, openNewChat)
      return
    }
    const selectedBlockData = getMentionableBlockData(editor, view)
    void this.activateChatView(
      { selectedBlock: selectedBlockData ?? undefined },
      openNewChat,
    )
  }

  async activateChatView(chatProps?: ChatProps, openNewChat = false) {
    this.initialChatProps = chatProps
    let leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]

    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false) as WorkspaceLeaf
      if (leaf) {
        await leaf.setViewState({
          type: CHAT_VIEW_TYPE,
          active: true,
        })
      }
    }

    // Ensure leaf exists before accessing view
    leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]

    if (leaf) {
      // FIX: Add await because revealLeaf returns a Promise
      await this.app.workspace.revealLeaf(leaf)

      if (openNewChat && leaf.view instanceof ChatView) {
        leaf.view.openNewChat(chatProps?.selectedBlock)
      }
    }
  }

  async addSelectionToChat(editor: Editor, view: MarkdownView) {
    const data = getMentionableBlockData(editor, view)
    if (!data) return

    const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
    if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) {
      await this.activateChatView({ selectedBlock: data })
      return
    }

    const leaf = leaves[0]
    await this.app.workspace.revealLeaf(leaf)

    if (leaf.view instanceof ChatView) {
      const chatView = leaf.view
      chatView.addSelectionToChat(data)
      chatView.focusMessage()
    }
  }

  // --- BYPASS ---
  getDbManager(): Promise<DatabaseManager> {
    // Changed to return Promise.resolve to satisfy interface without async keyword overhead for mock
    return Promise.resolve({} as DatabaseManager)
  }

  // Fix: Removed 'async' keyword as the method implementation is synchronous
  // wrapping the result in Promises manually to satisfy the interface.
  getRAGEngine(): Promise<RAGEngine> {
    if (this.ragEngine) return Promise.resolve(this.ragEngine)

    if (!this.ragEngineInitPromise) {
      this.ragEngineInitPromise = new Promise<RAGEngine>((resolve, reject) => {
        try {
          this.ragEngine = new RAGEngine(
            this.app,
            this.settings,
            // FIX: Use safe double-casting instead of 'any'
            // We cast to unknown first, then to the expected type.
            {} as unknown as VectorManager,
            () => {
              this.restartLightRagServer()
              return Promise.resolve()
            },
          )
          resolve(this.ragEngine)
        } catch (error) {
          this.ragEngineInitPromise = null
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
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

  // --- AUTOMATED ONTOLOGIST ---
  public async generateEntityTypes(): Promise<string | null> {
    const sourcePath = this.settings.lightRagOntologyFolder

    if (!sourcePath) {
      new Notice("Please define an 'ontology source folder' first.")
      return null
    }

    const folder = this.app.vault.getAbstractFileByPath(sourcePath)
    if (!folder || !(folder instanceof TFolder)) {
      new Notice(`Folder not found: "${sourcePath}"`)
      return null
    }

    new Notice(`Analyzing notes in "${sourcePath}"...`)

    try {
      const allFiles = this.getAllSupportedFiles(folder)
      if (allFiles.length === 0) throw new Error('Folder is empty.')

      const sampleSize = Math.min(allFiles.length, 5)
      const sampleFiles = allFiles
        .sort(() => 0.5 - Math.random())
        .slice(0, sampleSize)

      let sampleText = ''
      for (const file of sampleFiles) {
        const content = await this.app.vault.read(file)
        sampleText += `--- NOTE: ${file.basename} ---\n${content.substring(0, 1000)}\n...\n\n`
      }

      const targetLang = this.settings.lightRagSummaryLanguage || 'English'

      const prompt = `
        ACT AS: Senior Data Ontologist & Knowledge Graph Architect.
        TASK: Analyze the provided user's "${sourcePath}" folder to extract the fundamental ontology.
        GOAL: Define a concise list of high-level "Entity Types" that cover the majority of the concepts in the text without being overly granular.
        
        GUIDELINES FOR ENTITY TYPES:
        - **Abstraction:** Prefer broad categories (e.g., use "Organization" instead of "Company", "Startup", "NGO").
        - **Relevance:** Include types for abstract concepts (e.g., "Concept", "Methodology", "Goal") as LightRAG relies on conceptual connections.
        - **Coverage:** The list should allow classifying at least 90% of the key nouns in the text.
        
        RULES:
        1. Output ONLY a comma-separated list of types. NO preamble, NO markdown, NO explanations.
        2. Types must be singular and PascalCase (e.g., ResearchPaper, SoftwareTool).
        3. Limit the list to the top 8-15 most relevant types.
        4. CRITICAL: The output types MUST be in ${targetLang}.

        SAMPLE CONTENT:
        ${sampleText}

        YOUR OUTPUT:
        `

      const generatedTypes = await this.simpleLLMCall(prompt)

      if (generatedTypes) {
        const cleanTypes = generatedTypes
          .replace(/Here are...|Output:|\[|\]/gi, '')
          .trim()

        await this.setSettings({
          ...this.settings,
          lightRagEntityTypes: cleanTypes,
        })

        new Notice('Ontology generated!')
        this.updateEnvFile()

        return cleanTypes
      }
    } catch (e) {
      console.error(e)
      new Notice('Error generating ontology.')
    }
    return null
  }

  // Simple Helper for LLM Call
  async simpleLLMCall(prompt: string): Promise<string> {
    const chatModelId = this.settings.chatModelId
    const modelObj = this.settings.chatModels.find((m) => m.id === chatModelId)
    const provider = this.settings.providers.find(
      (p) => p.id === modelObj?.providerId,
    )

    if (!provider || !modelObj) throw new Error('Model not configured')

    // Gemini Logic
    if (provider.id === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelObj.model}:generateContent?key=${provider.apiKey}`

      const response = await requestUrl({
        url: url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      })

      const data = response.json
      return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    }

    // Generic Fallback (OpenAI/Ollama/Compatible)
    const baseUrl =
      provider.baseUrl ||
      (provider.id === 'openai'
        ? 'https://api.openai.com/v1'
        : 'http://localhost:11434/v1')

    const response = await requestUrl({
      url: `${baseUrl}/chat/completions`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey || 'ollama'}`,
      },
      body: JSON.stringify({
        model: modelObj.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }),
    })

    const data = response.json
    return data.choices?.[0]?.message?.content || ''
  }

  // --- STATUS BAR LOGIC ---
  private startStatusHeartbeat() {
    // Revisar cada 30 segundos
    this.heartbeatInterval = window.setInterval(() => {
      void this.checkAndUpdateStatus()
    }, 30000)
    // Primera revisión inmediata
    void this.checkAndUpdateStatus()
  }

  private async checkAndUpdateStatus() {
    // Si el proceso no existe y no está el auto-start, está offline
    if (
      !this.isRemoteServer() &&
      !this.settings.enableAutoStartServer &&
      !this.serverProcess
    ) {
      this.updateStatusUI('offline')
      return
    }

    try {
      const response = await requestUrl({
        url: `${this.settings.lightRagServerUrl}/health`,
        method: 'GET',
        headers: this.getLightRagHeaders(),
        throw: false,
      })

      if (response.status === 200) {
        const data: { pipeline_busy?: boolean; core_version?: string; api_version?: string } =
          response.json
        const isBusy = data?.pipeline_busy ?? false
        // Store the server version (core_version is canonical; api_version as fallback)
        this.setServerVersion(data?.core_version ?? data?.api_version ?? null)
        this.updateStatusUI(isBusy ? 'busy' : 'online')
      } else {
        this.setServerVersion(null)
        this.updateStatusUI('offline')
      }
    } catch {
      this.setServerVersion(null)
      this.updateStatusUI('offline')
    }
  }

  private updateStatusUI(status: 'online' | 'offline' | 'busy') {
    if (status === 'online' && this.lastServerStatus !== 'online') {
      // Server just came online — sync statuses and update dots
      void (async () => {
        await this.docIndexService?.syncFromServer()
        this.decorateFileExplorer()
      })()
    }
    this.lastServerStatus = status
    if (!this.statusDotEl) return
    this.statusDotEl.removeClass('is-online', 'is-offline', 'is-busy')

    const versionTag = this.lightRagServerVersion ? ` v${this.lightRagServerVersion}` : ''
    if (status === 'online') {
      this.statusDotEl.addClass('is-online')
      setTooltip(this.statusBarEl, `LightRAG${versionTag} · Online`, { placement: 'top' })
    } else if (status === 'busy') {
      this.statusDotEl.addClass('is-busy')
      setTooltip(this.statusBarEl, `LightRAG${versionTag} · Processing…`, { placement: 'top' })
    } else {
      this.statusDotEl.addClass('is-offline')
      const offlineHint = this.isRemoteServer()
        ? 'check remote server'
        : 'click to restart'
      setTooltip(this.statusBarEl, `LightRAG · Offline (${offlineHint})`, { placement: 'top' })
    }
  }

  private async handleStatusBarClick() {
    if (this.isRemoteServer()) {
      new Notice(`Checking remote ${BACKEND_NAME} server...`)
      void this.checkAndUpdateStatus()
      return
    }
    if (!Platform.isDesktop) {
      new Notice(
        'Configure a remote LightRAG server in settings to use Neural Composer on mobile.',
      )
      return
    }
    const isAlive = await this.isPortInUse(this.getServerPort())
    if (!isAlive) {
      new Notice(`Starting ${BACKEND_NAME} from status bar...`)
      void this.startLightRagServer()
    } else {
      new Notice('System is already online.')
    }
  }
}
