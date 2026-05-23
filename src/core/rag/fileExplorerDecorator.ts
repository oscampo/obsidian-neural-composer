import type { DocStatus } from './docIndexService'

/**
 * Applies data-nc-status attributes to file items in the file explorer.
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
   * Set data-nc-status on every .nav-file-title[data-path] inside syncFolder.
   * Files outside syncFolder have the attribute removed.
   */
  decorate(syncFolder: string, getStatus: (path: string) => DocStatus): void {
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
