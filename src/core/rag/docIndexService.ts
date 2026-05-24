import { requestUrl } from 'obsidian'
import NeuralComposerPlugin from '../../main'

export type DocStatus = 'processed' | 'processing' | 'failed' | 'removed' | 'unknown'

export interface DocRecord {
  status: DocStatus
  docId?: string
  mtime?: number
}

interface LRDoc {
  id: string
  file_path: string
  status: string
}

/**
 * DocIndexService — single source of truth for watched-folder document status.
 *
 * Flow:
 *  1. load()             – read doc-status.json; render cached status immediately.
 *  2. syncFromServer()   – fetch all docs from LightRAG, reconcile, persist, notify.
 *                          Auto-starts pipeline watch if any doc is still processing.
 *  3. startPipelineWatch(1000) – poll pipeline_status every N ms until busy=false,
 *                          then call syncFromServer() for definitive statuses.
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

  setUpdateCallback(fn: () => void): void {
    this.onUpdate = fn
  }

  // ── Persistence ────────────────────────────────────────────────────────────

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

  // ── Public status API ───────────────────────────────────────────────────────

  getStatus(vaultPath: string): DocStatus {
    return this.index[vaultPath]?.status ?? 'unknown'
  }

  getMtime(vaultPath: string): number | undefined {
    return this.index[vaultPath]?.mtime
  }

  hasProcessingDocs(): boolean {
    return Object.values(this.index).some((r) => r.status === 'processing')
  }

  needsIngestion(vaultPath: string, currentMtime: number): boolean {
    const rec = this.index[vaultPath]
    if (!rec || rec.status === 'unknown') return true
    if (rec.status === 'processing') return false
    if (rec.status === 'failed') return false
    if (rec.status === 'removed') return false  // intentionally removed; user must reprocess manually
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

  /**
   * Mark a doc as intentionally removed from the graph.
   * The file still exists in the vault but is no longer in LightRAG.
   * Preserved across syncFromServer() calls — not reset to 'unknown'.
   */
  setRemoved(vaultPath: string): void {
    const rec = this.index[vaultPath] ?? {}
    this.index[vaultPath] = { ...rec, status: 'removed', docId: undefined }
    this.notify()
    this.scheduleSave()
  }

  removeEntry(vaultPath: string): void {
    delete this.index[vaultPath]
    this.notify()
    this.scheduleSave()
  }

  /**
   * Compute the aggregate status for the watched folder based on a list of
   * vault-relative file paths inside it.
   *
   * Priority (highest → lowest):
   *   processing > failed > removed > processed > unknown (= no indicator)
   *
   * Returns 'unknown' when all files are unknown (nothing to show).
   * Returns 'processed' only when EVERY file is 'processed' (folder fully green).
   */
  computeFolderStatus(vaultFilePaths: string[]): DocStatus {
    let hasProcessing = false
    let hasFailed = false
    let hasRemoved = false
    let hasUnknown = false
    let processedCount = 0

    for (const path of vaultFilePaths) {
      const s = this.getStatus(path)
      if (s === 'processing') hasProcessing = true
      else if (s === 'failed') hasFailed = true
      else if (s === 'removed') hasRemoved = true
      else if (s === 'unknown') hasUnknown = true
      else if (s === 'processed') processedCount++
    }

    if (hasProcessing) return 'processing'
    if (hasFailed) return 'failed'
    if (hasRemoved) return 'removed'
    // Green only when every file is confirmed processed
    if (processedCount === vaultFilePaths.length && vaultFilePaths.length > 0) return 'processed'
    // Mix of processed + unknown → no indicator yet
    if (hasUnknown) return 'unknown'
    return 'unknown'
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

  // ── HTTP helpers ───────────────────────────────────────────────────────────

  private getHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.plugin.settings.lightRagApiKey) {
      h['Authorization'] = `Bearer ${this.plugin.settings.lightRagApiKey}`
    }
    return h
  }

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

  // ── Document fetching — dual strategy ─────────────────────────────────────

  /**
   * Strategy 1: POST /documents/paginated — includes file_path reliably.
   * Handles multi-page responses automatically.
   */
  private async fetchViaPaginated(): Promise<LRDoc[]> {
    const baseUrl = this.plugin.settings.lightRagServerUrl
    const headers = this.getHeaders()
    const all: LRDoc[] = []
    const pageSize = 200
    let page = 1

    for (;;) {
      const res = await requestUrl({
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

      if (res.status >= 400) return all // endpoint not available

      const data = res.json as { total?: number; documents?: LRDoc[] }
      const docs = data.documents ?? []
      all.push(...docs)

      if (docs.length < pageSize) break // last page
      page++
    }

    return all
  }

  /**
   * Strategy 2: GET /documents — grouped by status, fallback when paginated
   * endpoint is not available (older LightRAG versions).
   */
  private async fetchViaGrouped(): Promise<LRDoc[]> {
    const res = await requestUrl({
      url: `${this.plugin.settings.lightRagServerUrl}/documents`,
      method: 'GET',
      headers: this.getHeaders(),
      throw: false,
    })

    if (res.status >= 400) return []

    // Response: { PENDING: [...], PROCESSING: [...], PROCESSED: [...], FAILED: [...], ... }
    const data = res.json as Record<string, LRDoc[]>
    const all: LRDoc[] = []
    for (const bucket of Object.values(data)) {
      if (Array.isArray(bucket)) all.push(...bucket)
    }
    return all
  }

  /**
   * Fetch all LightRAG documents.
   * Tries the paginated endpoint first; falls back to grouped GET /documents.
   */
  private async fetchAllDocs(): Promise<LRDoc[]> {
    try {
      const docs = await this.fetchViaPaginated()
      // If paginated returned results, trust them
      if (docs.length > 0) {
        console.log(`[NeuralComposer] DocIndex: fetched ${docs.length} docs via paginated endpoint`)
        return docs
      }
    } catch (e) {
      console.warn('[NeuralComposer] DocIndex: paginated endpoint failed, trying grouped', e)
    }

    try {
      const docs = await this.fetchViaGrouped()
      console.log(`[NeuralComposer] DocIndex: fetched ${docs.length} docs via grouped endpoint`)
      return docs
    } catch {
      return []
    }
  }

  private mapStatus(s: string): DocStatus {
    const upper = (s ?? '').toUpperCase()
    if (upper === 'PROCESSED') return 'processed'
    if (upper === 'FAILED') return 'failed'
    return 'processing' // PENDING | PROCESSING | PREPROCESSED
  }

  // ── Server sync ────────────────────────────────────────────────────────────

  /**
   * Reconcile the local index with the LightRAG server.
   *
   *  • Matched doc   → update status from server (authoritative).
   *  • Not found     → ALWAYS reset to 'unknown'.
   *                    If the server replied with a non-empty list and the doc
   *                    is absent, it was never actually ingested (submission
   *                    failed silently, Obsidian crashed, etc.).  A 'processing'
   *                    state kept from a previous session that is not confirmed
   *                    by the server is stale and must be cleared so the user
   *                    can reprocess the document.
   *
   * After reconciling, any docs that the server reports as PENDING/PROCESSING
   * trigger an automatic pipeline watch.
   */
  async syncFromServer(): Promise<void> {
    const syncFolder = this.plugin.settings.lightRagSyncFolder.trim()
    if (!syncFolder) return

    try {
      const docs = await this.fetchAllDocs()

      if (docs.length === 0) {
        // Server offline or graph genuinely empty — keep cached statuses.
        // Do NOT reset 'processing' here: we can't distinguish "server down"
        // from "empty graph".  The pipeline watch (if running) will sync once
        // the server becomes reachable.
        console.warn('[NeuralComposer] DocIndex: server returned 0 docs — keeping cache')
        return
      }

      const sample = docs.slice(0, 3).map((d) => `${d.file_path} → ${d.status}`)
      console.log('[NeuralComposer] DocIndex sample:', sample)

      const files = this.plugin.app.vault
        .getFiles()
        .filter(
          (f) => f.path === syncFolder || f.path.startsWith(syncFolder + '/'),
        )

      let anyProcessing = false

      for (const file of files) {
        // Three match strategies (in priority order):
        //   1. Exact vault-relative path  ("Research/doc.md" === file.path)
        //   2. Bare filename              ("doc.md" === file.name)
        //   3. Suffix match              (path ends with "/doc.md")
        const lgDoc =
          docs.find((d) => d.file_path && d.file_path === file.path) ??
          docs.find((d) => d.file_path && d.file_path === file.name) ??
          docs.find((d) => d.file_path && d.file_path.endsWith('/' + file.name))

        if (lgDoc) {
          const newStatus = this.mapStatus(lgDoc.status)
          console.log(`[NeuralComposer] DocIndex: ${file.name} → ${lgDoc.status} → ${newStatus}`)
          this.index[file.path] = {
            ...this.index[file.path],
            status: newStatus,
            docId: lgDoc.id,
          }
          if (newStatus === 'processing') anyProcessing = true
        } else {
          // Not found on server after a successful, non-empty response.
          const prev = this.index[file.path]?.status ?? 'unknown'
          if (prev === 'removed') {
            // Intentionally removed by the user — not a stale processing entry.
            // The server correctly has no record of it; preserve the status so
            // the blue dot stays visible and needsIngestion() stays false.
            console.log(`[NeuralComposer] DocIndex: ${file.name} NOT on server (was: removed) → keeping removed`)
          } else {
            // The server is authoritative: the doc does not exist in LightRAG.
            // Reset to 'unknown' — clears docs stuck at 'processing' from a
            // previous session where submission failed silently.
            console.log(`[NeuralComposer] DocIndex: ${file.name} NOT on server (was: ${prev}) → unknown`)
            this.index[file.path] = { status: 'unknown' }
          }
        }
      }

      this.scheduleSave()
      this.notify()

      // Auto-start pipeline watch if the server reports docs still processing
      if (anyProcessing && !this.pipelineTimer) {
        console.log('[NeuralComposer] DocIndex: docs still processing on server — starting pipeline watch')
        this.startPipelineWatch(2000)
      }
    } catch (e) {
      console.error('[NeuralComposer] DocIndex: syncFromServer error', e)
    }
  }

  // ── Pipeline watch ─────────────────────────────────────────────────────────

  /**
   * Poll GET /documents/pipeline_status every `intervalMs` ms.
   * Stops when the pipeline is idle (busy=false) and calls syncFromServer()
   * to get definitive statuses.
   *
   * Safe to call multiple times — cancels any previous watch first.
   */
  startPipelineWatch(intervalMs = 1000): void {
    this.stopPipelineWatch()
    console.log(`[NeuralComposer] DocIndex: pipeline watch started (interval: ${intervalMs}ms)`)
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
        console.log(`[NeuralComposer] DocIndex: pipeline busy = ${data.busy}`)
        if (data.busy === false) {
          // Pipeline finished — get definitive statuses (does NOT restart watch
          // unless it finds more processing docs, preventing infinite loops)
          console.log('[NeuralComposer] DocIndex: pipeline stopped — syncing from server')
          await this.syncFromServer()
          return // watch ended
        }
      }
    } catch {
      // Server temporarily unreachable — keep polling
    }

    this.schedulePipelinePoll(intervalMs)
  }

  stopPipelineWatch(): void {
    if (this.pipelineTimer) {
      clearTimeout(this.pipelineTimer)
      this.pipelineTimer = null
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

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
