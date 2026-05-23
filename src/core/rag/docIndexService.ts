import { requestUrl } from 'obsidian'
import NeuralComposerPlugin from '../../main'

export type DocStatus = 'processed' | 'processing' | 'failed' | 'unknown'

export interface DocRecord {
  status: DocStatus
  docId?: string
  mtime?: number
}

/** Shape returned by POST /documents/paginated */
interface LRDoc {
  id: string
  file_path: string
  status: string // 'PENDING' | 'PROCESSING' | 'PREPROCESSED' | 'PROCESSED' | 'FAILED'
}

/**
 * DocIndexService — single source of truth for watched-folder document status.
 *
 * Flow:
 *  1. load()             – read doc-status.json from disk; render immediately.
 *  2. syncFromServer()   – POST /documents/paginated → reconcile → persist → notify.
 *  3. startPipelineWatch(1000) – after any folder change, poll pipeline_status every
 *     1 s until busy=false, then do a final syncFromServer().
 */
export class DocIndexService {
  private index: Record<string, DocRecord> = {}
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private pipelineTimer: ReturnType<typeof setTimeout> | null = null
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
  // Persistence
  // ---------------------------------------------------------------------------

  async load(): Promise<void> {
    try {
      const exists = await this.plugin.app.vault.adapter.exists(
        this.statusFilePath,
      )
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
   * Returns true if this file should be submitted to LightRAG right now.
   * - unknown     → yes (never ingested)
   * - processing  → no  (already in the pipeline)
   * - failed      → no  (user triggers via context menu)
   * - processed   → only if mtime is newer than last ingest
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
  // HTTP helpers
  // ---------------------------------------------------------------------------

  private getHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.plugin.settings.lightRagApiKey) {
      h['Authorization'] = `Bearer ${this.plugin.settings.lightRagApiKey}`
    }
    return h
  }

  /** Returns true if the LightRAG server responds to /health. */
  async isServerOnline(): Promise<boolean> {
    try {
      const res = await requestUrl({
        url: `${this.plugin.settings.lightRagServerUrl}/health`,
        method: 'GET',
        headers: this.getHeaders(),
        throw: false,
      })
      return res.status === 200
    } catch {
      return false
    }
  }

  /**
   * Fetch ALL documents from LightRAG using POST /documents/paginated.
   * This endpoint reliably includes `file_path` in every document record.
   * Handles pagination automatically. Returns [] on error.
   */
  private async fetchAllDocs(): Promise<LRDoc[]> {
    const baseUrl = this.plugin.settings.lightRagServerUrl
    const headers = this.getHeaders()
    const all: LRDoc[] = []
    const pageSize = 200
    let page = 1

    for (;;) {
      let res
      try {
        res = await requestUrl({
          url: `${baseUrl}/documents/paginated`,
          method: 'POST',
          headers,
          body: JSON.stringify({
            page,
            page_size: pageSize,
            sort_field: 'file_path',
            sort_direction: 'asc',
          }),
          throw: false,
        })
      } catch {
        break
      }

      if (res.status >= 400) break

      const data = res.json as { total?: number; documents?: LRDoc[] }
      const docs = data.documents ?? []
      all.push(...docs)

      // Stop when we get a partial page (last page)
      if (docs.length < pageSize) break
      page++
    }

    return all
  }

  private mapStatus(s: string): DocStatus {
    if (s === 'PROCESSED') return 'processed'
    if (s === 'FAILED') return 'failed'
    return 'processing' // PENDING | PROCESSING | PREPROCESSED
  }

  // ---------------------------------------------------------------------------
  // Server sync
  // ---------------------------------------------------------------------------

  /**
   * Fetch the full document list from LightRAG (paginated endpoint) and
   * reconcile it with every file inside the watched folder.
   * Does nothing silently if the server is unreachable or the graph is empty.
   */
  async syncFromServer(): Promise<void> {
    const syncFolder = this.plugin.settings.lightRagSyncFolder.trim()
    if (!syncFolder) return

    try {
      const docs = await this.fetchAllDocs()
      if (docs.length === 0) return // Server offline or empty graph — keep cache

      const files = this.plugin.app.vault
        .getFiles()
        .filter(
          (f) => f.path === syncFolder || f.path.startsWith(syncFolder + '/'),
        )

      for (const file of files) {
        // Match strategies (in priority order):
        //   1. Exact vault-relative path  (text files submitted with file.path)
        //   2. Bare filename              (binary uploads via multipart)
        //   3. Partial suffix match       (e.g. LightRAG prepends a base dir)
        const lgDoc =
          docs.find((d) => d.file_path === file.path) ??
          docs.find((d) => d.file_path === file.name) ??
          docs.find((d) => d.file_path?.endsWith('/' + file.name))

        if (lgDoc) {
          const newStatus = this.mapStatus(lgDoc.status)
          this.index[file.path] = {
            ...this.index[file.path],
            status: newStatus,
            docId: lgDoc.id,
          }
        } else {
          // Not found on LightRAG server:
          //   - 'processing': keep it (might still be queued, not yet visible)
          //   - everything else: reset to unknown so the user knows it needs ingest
          const current = this.index[file.path]?.status
          if (current !== 'processing') {
            this.index[file.path] = { status: 'unknown' }
          }
        }
      }

      this.scheduleSave()
      this.notify()
    } catch {
      // Server not available — keep cached index silently
    }
  }

  // ---------------------------------------------------------------------------
  // Pipeline watch — polls every N ms until busy=false, then syncs
  // ---------------------------------------------------------------------------

  /**
   * Poll GET /documents/pipeline_status every `intervalMs` milliseconds.
   * Stops automatically when the server reports busy=false, then calls
   * syncFromServer() to read the definitive statuses.
   *
   * Any previous pipeline watch is cancelled before starting the new one.
   * Call after submitting any file to LightRAG.
   */
  startPipelineWatch(intervalMs = 1000): void {
    this.stopPipelineWatch()
    this.schedulePipelinePoll(intervalMs)
  }

  private schedulePipelinePoll(intervalMs: number): void {
    this.pipelineTimer = setTimeout(() => {
      this.pipelineTimer = null
      void this.doPipelinePoll(intervalMs)
    }, intervalMs)
  }

  private async doPipelinePoll(intervalMs: number): Promise<void> {
    try {
      const res = await requestUrl({
        url: `${this.plugin.settings.lightRagServerUrl}/documents/pipeline_status`,
        method: 'GET',
        headers: this.getHeaders(),
        throw: false,
      })

      if (res.status === 200) {
        const data = res.json as { busy?: boolean }
        if (data.busy === false) {
          // Pipeline finished — sync definitive statuses from LightRAG
          await this.syncFromServer()
          return // Do NOT reschedule — watch is complete
        }
      }
    } catch {
      // Server temporarily unreachable — keep polling
    }

    // Pipeline still busy or server unreachable — schedule next poll
    this.schedulePipelinePoll(intervalMs)
  }

  stopPipelineWatch(): void {
    if (this.pipelineTimer) {
      clearTimeout(this.pipelineTimer)
      this.pipelineTimer = null
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  destroy(): void {
    this.stopPipelineWatch()
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
      void this.persist()
    }
    this.onUpdate = null
  }
}
