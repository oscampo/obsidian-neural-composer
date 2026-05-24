import type { DocStatus } from './docIndexService'

/**
 * Applies data-nc-status attributes to file items in the file explorer,
 * and to the watched-folder title element for the aggregate status indicator.
 * CSS ::before pseudo-elements render the colored dot — no DOM injection.
 *
 * A MutationObserver watches for childList changes (Obsidian re-rendering
 * file items on scroll/expand) and re-applies the attributes via
 * requestAnimationFrame.  Observing only childList mutations is safe because
 * our own setAttribute() calls are *attribute* mutations, which do NOT fire
 * childList observers — so there is zero risk of an infinite loop.
 */
export class FileExplorerDecorator {
  private observer: MutationObserver | null = null
  private rafId: number | null = null
  private decorateFn: (() => void) | null = null

  /**
   * Start watching the DOM for file-explorer re-renders.
   * Call once after the decorator is created (e.g. inside onLayoutReady).
   */
  startObserving(decorateFn: () => void): void {
    this.decorateFn = decorateFn
    this.observer = new MutationObserver(() => {
      // Debounce via rAF — one repaint per burst of DOM changes.
      if (this.rafId !== null) return
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null
        this.decorateFn?.()
      })
    })
    // childList-only: fires when Obsidian adds/removes file-title elements.
    // Does NOT fire on setAttribute → no loop.
    this.observer.observe(document.body, { childList: true, subtree: true })
  }

  /**
   * Set data-nc-status on every .nav-file-title[data-path] inside syncFolder,
   * and on the .nav-folder-title[data-path] of the sync folder itself.
   *
   * @param syncFolder    - vault-relative path of the watched folder
   * @param getStatus     - returns the status for a given file path
   * @param folderStatus  - pre-computed aggregate status for the folder element
   */
  decorate(
    syncFolder: string,
    getStatus: (path: string) => DocStatus,
    folderStatus: DocStatus = 'unknown',
  ): void {
    // ── Per-file dots ───────────────────────────────────────────────────────
    document
      .querySelectorAll<HTMLElement>('.nav-file-title[data-path]')
      .forEach((el) => {
        const path = el.getAttribute('data-path') ?? ''
        const inFolder =
          syncFolder &&
          (path === syncFolder || path.startsWith(syncFolder + '/'))

        if (inFolder) {
          const status = getStatus(path)
          if (status === 'unknown') {
            el.removeAttribute('data-nc-status')
          } else {
            el.setAttribute('data-nc-status', status)
          }
        } else {
          el.removeAttribute('data-nc-status')
        }
      })

    // ── Watched-folder aggregate dot ────────────────────────────────────────
    if (syncFolder) {
      // Escape quotes in path for use inside an attribute selector string.
      const escaped = syncFolder.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      const folderEl = document.querySelector<HTMLElement>(
        `.nav-folder-title[data-path="${escaped}"]`,
      )
      if (folderEl) {
        if (folderStatus === 'unknown') {
          folderEl.removeAttribute('data-nc-status')
        } else {
          folderEl.setAttribute('data-nc-status', folderStatus)
        }
      }
    }
  }

  /** Remove all status attributes and stop the observer (called on unload). */
  clear(): void {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.decorateFn = null
    document
      .querySelectorAll<HTMLElement>('[data-nc-status]')
      .forEach((el) => el.removeAttribute('data-nc-status'))
  }
}
