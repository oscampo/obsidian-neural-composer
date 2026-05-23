import type { DocStatus } from './docIndexService'

/**
 * Applies data-nc-status attributes to file items in the file explorer.
 * CSS ::before pseudo-elements render the colored dot — no DOM injection,
 * no MutationObserver, no infinite loops.
 *
 * Uses document.querySelectorAll so it works regardless of whether the
 * file-explorer leaf is currently accessible.
 */
export class FileExplorerDecorator {
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

  /** Remove all status attributes (called on unload). */
  clear(): void {
    document
      .querySelectorAll<HTMLElement>('[data-nc-status]')
      .forEach((el) => el.removeAttribute('data-nc-status'))
  }
}
