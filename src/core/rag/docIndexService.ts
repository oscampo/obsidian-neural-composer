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
  private pollingTimer: ReturnType<typeof setTimeout> | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private onDecorateAll: (() => void) | null = null
  private onRefreshFile: ((path: string) => void) | null = null

  constructor(private plugin: NeuralComposerPlugin) {}

  setDecorator(decorateAll: () => void, refreshFile: (path: string) => void) {
    this.onDecorateAll = decorateAll
    this.onRefreshFile = refreshFile
  }

  private get index(): Record<string, DocRecord> {
    if (!this.plugin.settings.docIndex) this.plugin.settings.docIndex = {}
    return this.plugin.settings.docIndex
  }

  getStatus(vaultPath: string): DocStatus {
    return this.index[vaultPath]?.status ?? 'unknown'
  }

  getMtime(vaultPath: string): number | undefined {
    return this.index[vaultPath]?.mtime
  }

  /** Returns true if this file should be (re-)ingested right now. */
  needsIngestion(vaultPath: string, currentMtime: number): boolean {
    const rec = this.index[vaultPath]
    if (!rec || rec.status === 'unknown') return true
    if (rec.status === 'processing') return false // already in pipeline
    if (rec.status === 'failed') return false     // manual retry only
    // processed: re-ingest only if the file has changed
    return rec.mtime !== undefined && currentMtime > rec.mtime
  }

  setProcessing(vaultPath: string, mtime: number): void {
    this.index[vaultPath] = { status: 'processing', mtime }
    this.onRefreshFile?.(vaultPath)
    this.scheduleSave()
    this.ensurePolling()
  }

  setProcessed(vaultPath: string, docId?: string): void {
    const rec = this.index[vaultPath] ?? {}
    this.index[vaultPath] = { ...rec, status: 'processed', docId }
    this.onRefreshFile?.(vaultPath)
    this.scheduleSave()
  }

  setFailed(vaultPath: string): void {
    const rec = this.index[vaultPath] ?? {}
    this.index[vaultPath] = { ...rec, status: 'failed' }
    this.onRefreshFile?.(vaultPath)
    this.scheduleSave()
  }

  removeEntry(vaultPath: string): void {
    delete this.index[vaultPath]
    this.onRefreshFile?.(vaultPath)
    this.scheduleSave()
  }

  renameEntry(oldPath: string, newPath: string): void {
    if (this.index[oldPath]) {
      this.index[newPath] = this.index[oldPath]
      delete this.index[oldPath]
      this.onRefreshFile?.(newPath)
      this.scheduleSave()
    }
  }

  /** Fetch LightRAG document list and reconcile with vault files in watched folder. */
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
          // Not yet in LightRAG — only reset if not already tracked as processing
          if (!this.index[file.path] || this.index[file.path].status !== 'processing') {
            this.index[file.path] = { status: 'unknown' }
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
      this.onDecorateAll?.()
      this.ensurePolling()
    } catch {
      // Server not available — use cached index
    }
  }

  private async fetchAllDocs(): Promise<LRDoc[]> {
    const url = `${this.plugin.settings.lightRagServerUrl}/documents/paginated`
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.plugin.settings.lightRagApiKey) {
      headers['Authorization'] = `Bearer ${this.plugin.settings.lightRagApiKey}`
    }
    const res = await requestUrl({
      url,
      method: 'POST',
      headers,
      body: JSON.stringify({ page: 1, page_size: 1000 }),
      throw: false,
    })
    if (res.status >= 400) return []
    const data = res.json as { documents?: LRDoc[] }
    return data.documents ?? []
  }

  private mapStatus(s: LRStatus): DocStatus {
    if (s === 'PROCESSED') return 'processed'
    if (s === 'FAILED') return 'failed'
    return 'processing'
  }

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
      let changed = false

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
          changed = true
        }
      }

      if (changed) this.onDecorateAll?.()
    } catch {
      // Server unavailable
    }

    this.scheduleNextPoll()
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.plugin.saveData(this.plugin.settings)
    }, 3000)
  }

  destroy(): void {
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer)
      this.pollingTimer = null
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
      void this.plugin.saveData(this.plugin.settings)
    }
  }
}
