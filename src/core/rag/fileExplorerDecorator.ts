import { App } from 'obsidian'
import type { DocStatus } from './docIndexService'

/**
 * Applies data-nc-status attributes to file items in the file explorer.
 * CSS ::before pseudo-elements render the colored dot — no DOM injection,
 * no MutationObserver, no infinite loops.
 */
export class FileExplorerDecorator {
  constructor(private app: App) {}

  /**
   * Set data-nc-status on every file inside syncFolder.
   * Files outside syncFolder have the attribute removed.
   * Call this whenever the index changes or the layout refreshes.
   */
  decorate(syncFolder: string, getStatus: (path: string) => DocStatus): void {
    const container = this.getContainer()
    if (!container) return

    container
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

  /** Remove all status attributes (on unload or when watched folder is cleared). */
  clear(): void {
    const container = this.getContainer()
    if (!container) return
    container
      .querySelectorAll<HTMLElement>('[data-nc-status]')
      .forEach((el) => el.removeAttribute('data-nc-status'))
  }

  private getContainer(): HTMLElement | null {
    const leaf = this.app.workspace.getLeavesOfType('file-explorer')[0]
    if (!leaf) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (leaf.view as any).containerEl as HTMLElement
  }
}
