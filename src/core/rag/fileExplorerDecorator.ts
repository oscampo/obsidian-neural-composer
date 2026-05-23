import { App } from 'obsidian'
import type { DocIndexService, DocStatus } from './docIndexService'

export class FileExplorerDecorator {
  private observer: MutationObserver | null = null

  constructor(
    private app: App,
    private docIndex: DocIndexService,
    private getWatchedFolder: () => string,
  ) {}

  start(): void {
    const container = this.getContainer()
    if (!container) return

    this.observer = new MutationObserver(() => this.decorateAll())
    this.observer.observe(container, { childList: true, subtree: true })
    this.decorateAll()
  }

  stop(): void {
    this.observer?.disconnect()
    this.observer = null
    this.cleanup()
  }

  decorateAll(): void {
    const folder = this.getWatchedFolder()
    const container = this.getContainer()
    if (!container) return

    const fileEls = container.querySelectorAll<HTMLElement>(
      '.nav-file-title[data-path]',
    )

    fileEls.forEach((el) => {
      const path = el.getAttribute('data-path') ?? ''
      const inFolder =
        folder &&
        (path === folder || path.startsWith(folder + '/'))

      if (inFolder) {
        this.applyDot(el, this.docIndex.getStatus(path))
      } else {
        this.removeDot(el)
      }
    })
  }

  refreshFile(filePath: string): void {
    const container = this.getContainer()
    if (!container) return

    const el = container.querySelector<HTMLElement>(
      `.nav-file-title[data-path="${this.esc(filePath)}"]`,
    )
    if (!el) return

    const folder = this.getWatchedFolder()
    const inFolder =
      folder && (filePath === folder || filePath.startsWith(folder + '/'))

    if (inFolder) {
      this.applyDot(el, this.docIndex.getStatus(filePath))
    } else {
      this.removeDot(el)
    }
  }

  private applyDot(el: HTMLElement, status: DocStatus): void {
    // Remove stale dot first
    el.querySelector('.nc-doc-dot')?.remove()

    if (status === 'unknown') return

    const dot = document.createElement('span')
    dot.className = `nc-doc-dot nc-doc-dot--${status}`
    el.prepend(dot)
  }

  private removeDot(el: HTMLElement): void {
    el.querySelector('.nc-doc-dot')?.remove()
  }

  private getContainer(): HTMLElement | null {
    const leaf = this.app.workspace.getLeavesOfType('file-explorer')[0]
    if (!leaf) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (leaf.view as any).containerEl as HTMLElement
  }

  private cleanup(): void {
    const container = this.getContainer()
    if (!container) return
    container.querySelectorAll('.nc-doc-dot').forEach((el) => el.remove())
  }

  private esc(str: string): string {
    return str.replace(/["\\]/g, '\\$&')
  }
}
