import { requestUrl } from 'obsidian'
import NeuralComposerPlugin from '../../main'

export type DocStatus = 'processed' | 'processing' | 'failed' | 'unknown'

export interface DocRecord {
  status: DocStatus
  docId?: string
  mtime?: number
}

type LRStatus = 'PENDING' | 'PROCESSING' | 'PREPROCESSED' | 'PROCESSED' | 'FAILED'

interface LRDoc {
  id: string
  file_path: string
  status: LRStatus
}

export class DocIndexService {
  private index: Record<string, DocRecord> = {}
  private pollingTimer: ReturnType<typeof setTimeout> | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private onUpdate: (() => void) | null = null
  private readonly statusFilePath: string

  constructor(private plugin: NeuralComposerPlugin) {
    this.statusFilePath = `.obsidian/plugins/${plugin.manifest.id}/doc-status.json`
  }

  /** Register a callback invoked whenever any status changes (for re-decoration). */
  setUpdateCallback(fn: () => void): void {
    this.onUpdate = fn
  }

  // ---------------------------------------------------------------------------
  // Persistence — separate JSON file, independent of data.json
  // ---------------------------------------------------------------------------

  async load(): Promise<void> {
    try {
      const exists = await this.plugin.app.vault.adapter.exists(this.statusFilePath)
      if (exists) {
        const raw = await this.plugin.app.vault.adapter.read(this.statusFilePath)
        this.index = JSON.parse(raw) as Record<string, DocRecord>
      }
    } catch {
      this.index = {}
    }
  }

  private async persist(): Promise<void> {
    try {
      await this.plugin.app.vault.adapter.write(
        this.statusFilePath,
        JSON.stringify(this.index, null, 2),
      )
    } catch (e) {
      console.error('[NeuralComposer] DocIndex: failed to save status file', e)
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.persist()
    }, 2000)
  }

  // ---------------------------------------------------------------------------
  // Public status API
  // ---------------------------------------------------------------------------

  getStatus(vaultPath: string): DocStatus {
    return this.index[vaultPath]?.status ?? 'unknown'
  }

  getMtime(vaultPath: string): number | undefined {
    return this.index[vaultPath]?.mtime
  }

  /**
   * Returns true if this file should be sent to LightRAG right now.
   * - unknown  → yes (never ingested)
   * - processing → no (already in the pipeline)
   * - failed  → no (user triggers manually via context menu)
   * - processed → only if the file was modified after last ingest
   */
  needsIngestion(vaultPath: string, currentMtime: number): boolean {
    const rec = this.index[vaultPath]
    if (!rec || rec.status === 'unknown') return true
    if (rec.status === 'processing') return false
    if (rec.status === 'failed') return false
    return rec.mtime !== undefined && currentMtime > rec.mtime
  }

  setProcessing(vaultPath: string, mtime: number): void {
    this.index[vaultPath] = { status: 'processing', mtime }
    this.notify()
    this.scheduleSave()
    this.ensurePolling()
  }

  setProcessed(vaultPath: string, docId?: string): void {
    const rec = this.index[vaultPath] ?? {}
    this.index[vaultPath] = { ...rec, status: 'processed', docId }
    this.notify()
    this.scheduleSave()
  }

  setFailed(vaultPath: string): void {
    const rec = this.index[vaultPath] ?? {}
    this.index[vaultPath] = { ...rec, status: 'failed' }
    this.notify()
    this.scheduleSave()
  }

  removeEntry(vaultPath: string): void {
    delete this.index[vaultPath]
    this.notify()
    this.scheduleSave()
  }

  renameEntry(oldPath: string, newPath: string): void {
    if (this.index[oldPath]) {
      this.index[newPath] = this.index[oldPath]
      delete this.index[oldPath]
      this.notify()
      this.scheduleSave()
    }
  }

  private notify(): void {
    this.onUpdate?.()
  }

  // ---------------------------------------------------------------------------
  // Server sync
  // ---------------------------------------------------------------------------

  /** Fetch LightRAG document list and reconcile with watched-folder files. */
  async syncFromServer(): Promise<void> {
    const syncFolder = this.plugin.settings.lightRagSyncFolder.trim()
    if (!syncFolder) return

    try {
      const docs = await this.fetchAllDocs()
      const files = this.plugin.app.vault
        .getFiles()
        .filter(
          (f) => f.path === syncFolder || f.path.startsWith(syncFolder + '/'),
        )

      for (const file of files) {
        const lgDoc = docs.find(
          (d) => d.file_path === file.path || d.file_path === file.name,
        )

        if (!lgDoc) {
          // Not found in LightRAG — don't overwrite a processing state
          if (
            !this.index[file.path] ||
            this.index[file.path].status !== 'processing'
          ) {
            this.index[file.path] = this.index[file.path] ?? { status: 'unknown' }
          }
        } else {
          this.index[file.path] = {
            ...this.index[file.path],
            status: this.mapStatus(lgDoc.status),
            docId: lgDoc.id,
          }
        }
      }

      this.scheduleSave()
      this.notify()
      this.ensurePolling()
    } catch {
      // Server not available — use cached index silently
    }
  }

  private async fetchAllDocs(): Promise<LRDoc[]> {
    // GET /documents returns all docs grouped by status (up to 1000).
    // Simpler and more reliable than POST /documents/paginated.
    const url = `${this.plugin.settings.lightRagServerUrl}/documents`
    const headers: Record<string, string> = {}
    if (this.plugin.settings.lightRagApiKey) {
      headers['Authorization'] = `Bearer ${this.plugin.settings.lightRagApiKey}`
    }
    const res = await requestUrl({ url, method: 'GET', headers, throw: false })
    if (res.status >= 400) return []

    // Response shape: { PENDING: [...], PROCESSING: [...], PROCESSED: [...], FAILED: [...], PREPROCESSED: [...] }
    const data = res.json as Record<string, LRDoc[]>
    const all: LRDoc[] = []
    for (const bucket of Object.values(data)) {
      if (Array.isArray(bucket)) all.push(...bucket)
    }
    return all
  }

  private mapStatus(s: LRStatus): DocStatus {
    if (s === 'PROCESSED') return 'processed'
    if (s === 'FAILED') return 'failed'
    return 'processing'
  }

  // ---------------------------------------------------------------------------
  // Polling for in-flight documents
  // ---------------------------------------------------------------------------

  private ensurePolling(): void {
    if (this.pollingTimer) return
    this.scheduleNextPoll()
  }

  private scheduleNextPoll(): void {
    const hasProcessing = Object.values(this.index).some(
      (r) => r.status === 'processing',
    )
    if (!hasProcessing) return

    this.pollingTimer = setTimeout(() => {
      this.pollingTimer = null
      void this.doPoll()
    }, 5000)
  }

  private async doPoll(): Promise<void> {
    const processingPaths = Object.entries(this.index)
      .filter(([, r]) => r.status === 'processing')
      .map(([p]) => p)

    if (processingPaths.length === 0) return

    try {
      const docs = await this.fetchAllDocs()
      for (const vaultPath of processingPaths) {
        const fileName = vaultPath.split('/').pop() ?? vaultPath
        const doc = docs.find(
          (d) => d.file_path === vaultPath || d.file_path === fileName,
        )
        if (!doc) continue

        const newStatus = this.mapStatus(doc.status)
        if (newStatus !== 'processing') {
          if (newStatus === 'processed') this.setProcessed(vaultPath, doc.id)
          else this.setFailed(vaultPath)
        }
      }
    } catch {
      // Server unavailable — retry next cycle
    }

    this.scheduleNextPoll()
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  destroy(): void {
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer)
      this.pollingTimer = null
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
      void this.persist()
    }
    this.onUpdate = null
  }
}
