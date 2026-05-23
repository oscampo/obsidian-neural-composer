import { App } from 'obsidian'
import type { DocIndexService, DocStatus } from './docIndexService'

export class FileExplorerDecorator {
  private observer: MutationObserver | null = null
  private isDecorating = false
  private pendingDecorate = false
  private rafId: number | null = null

  constructor(
    private app: App,
    private docIndex: DocIndexService,
    private getWatchedFolder: () => string,
  ) {}

  start(): void {
    const container = this.getContainer()
    if (!container) return

    this.observer = new MutationObserver((mutations) => {
      // Ignore mutations we caused ourselves (our own dots being added/removed)
      const isOwnMutation = mutations.every((m) =>
        Array.from(m.addedNodes).concat(Array.from(m.removedNodes)).every(
          (n) =>
            n instanceof HTMLElement && n.classList.contains('nc-doc-dot'),
        ),
      )
      if (isOwnMutation) return

      this.scheduleDecorate()
    })

    this.observer.observe(container, { childList: true, subtree: true })
    this.scheduleDecorate()
  }

  stop(): void {
    this.observer?.disconnect()
    this.observer = null
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.cleanup()
  }

  /** Schedule a decoration pass on the next animation frame (debounced). */
  private scheduleDecorate(): void {
    if (this.isDecorating) {
      this.pendingDecorate = true
      return
    }
    if (this.rafId !== null) return // already scheduled

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      this.decorateAll()
    })
  }

  decorateAll(): void {
    if (this.isDecorating) {
      this.pendingDecorate = true
      return
    }

    const folder = this.getWatchedFolder()
    const container = this.getContainer()
    if (!container) return

    this.isDecorating = true
    try {
      const fileEls = container.querySelectorAll<HTMLElement>(
        '.nav-file-title[data-path]',
      )

      fileEls.forEach((el) => {
        const path = el.getAttribute('data-path') ?? ''
        const inFolder =
          folder && (path === folder || path.startsWith(folder + '/'))

        if (inFolder) {
          this.applyDot(el, this.docIndex.getStatus(path))
        } else {
          this.removeDot(el)
        }
      })
    } finally {
      this.isDecorating = false
    }

    // If a decorate was requested while we were busy, run it next frame
    if (this.pendingDecorate) {
      this.pendingDecorate = false
      this.scheduleDecorate()
    }
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

    this.isDecorating = true
    try {
      if (inFolder) {
        this.applyDot(el, this.docIndex.getStatus(filePath))
      } else {
        this.removeDot(el)
      }
    } finally {
      this.isDecorating = false
    }
  }

  private applyDot(el: HTMLElement, status: DocStatus): void {
    const existing = el.querySelector('.nc-doc-dot')

    if (status === 'unknown') {
      existing?.remove()
      return
    }

    const newClass = `nc-doc-dot nc-doc-dot--${status}`

    if (existing) {
      // Only update className if it changed — avoids a DOM write
      if (existing.className !== newClass) {
        existing.className = newClass
      }
      return
    }

    const dot = document.createElement('span')
    dot.className = newClass
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
