// Recursive markdown text splitter — replaces langchain/text_splitter.
// Implements the same RecursiveCharacterTextSplitter.fromLanguage('markdown')
// behavior and createDocuments() output format used in VectorManager.

type TextDocument = {
  pageContent: string
  metadata: { loc: { lines: { from: number; to: number } } }
}

// Separators tried in order; the first one found in the text is used.
// Mirrors langchain's markdown separator list.
const MARKDOWN_SEPARATORS = [
  '\n# ',
  '\n## ',
  '\n### ',
  '\n#### ',
  '\n##### ',
  '\n###### ',
  '```\n',
  '\n\n',
  '\n',
  ' ',
  '',
]

export class RecursiveMarkdownTextSplitter {
  private readonly chunkSize: number
  private readonly chunkOverlap: number

  constructor({
    chunkSize,
    chunkOverlap = 200,
  }: {
    chunkSize: number
    chunkOverlap?: number
  }) {
    this.chunkSize = chunkSize
    this.chunkOverlap = chunkOverlap
  }

  async createDocuments(texts: string[]): Promise<TextDocument[]> {
    const result: TextDocument[] = []
    for (const text of texts) {
      const chunks = this.splitText(text, MARKDOWN_SEPARATORS)
      let searchPos = 0
      for (const chunk of chunks) {
        const start = Math.max(0, searchPos - this.chunkOverlap)
        const idx = text.indexOf(chunk, start)
        if (idx === -1) {
          // Fallback: no position info
          result.push({
            pageContent: chunk,
            metadata: { loc: { lines: { from: 1, to: 1 } } },
          })
          continue
        }
        const from = text.slice(0, idx).split('\n').length
        const to = text.slice(0, idx + chunk.length).split('\n').length
        result.push({
          pageContent: chunk,
          metadata: { loc: { lines: { from, to } } },
        })
        searchPos = idx + chunk.length
      }
    }
    return result
  }

  private splitText(text: string, separators: string[]): string[] {
    // Find the first separator that actually appears in this text chunk.
    let separator = ''
    let nextSeparators: string[] = []
    for (let i = 0; i < separators.length; i++) {
      if (separators[i] === '' || text.includes(separators[i])) {
        separator = separators[i]
        nextSeparators = separators.slice(i + 1)
        break
      }
    }

    const splits = this.splitBySeparator(text, separator)
    const goodSplits: string[] = []
    const result: string[] = []

    for (const split of splits) {
      if (split.length <= this.chunkSize) {
        goodSplits.push(split)
      } else {
        if (goodSplits.length > 0) {
          result.push(...this.mergeChunks(goodSplits, separator))
          goodSplits.length = 0
        }
        if (nextSeparators.length > 0) {
          result.push(...this.splitText(split, nextSeparators))
        } else {
          result.push(split)
        }
      }
    }

    if (goodSplits.length > 0) {
      result.push(...this.mergeChunks(goodSplits, separator))
    }

    return result
  }

  // Split by separator, keeping the separator at the start of each subsequent
  // piece so structure (e.g. heading markers) is preserved inside chunks.
  private splitBySeparator(text: string, separator: string): string[] {
    if (!separator) return text.length > 0 ? [text] : []
    return text.split(separator).reduce<string[]>((acc, part, i) => {
      const piece = i === 0 ? part : separator + part
      // Skip pieces that are just the separator with no following content.
      if (i === 0 ? piece.length > 0 : piece.length > separator.length) {
        acc.push(piece)
      }
      return acc
    }, [])
  }

  // Merge splits into chunks up to chunkSize, retaining chunkOverlap between
  // consecutive chunks so context isn't lost at boundaries.
  private mergeChunks(splits: string[], separator: string): string[] {
    const sepLen = separator.length
    const docs: string[] = []
    let currentParts: string[] = []
    let total = 0

    for (const split of splits) {
      const splitLen = split.length
      const overhead = currentParts.length > 0 ? sepLen : 0

      if (
        total + overhead + splitLen > this.chunkSize &&
        currentParts.length > 0
      ) {
        docs.push(currentParts.join(separator))
        // Trim from the front until within overlap budget.
        while (
          currentParts.length > 0 &&
          (total > this.chunkOverlap ||
            total + splitLen + sepLen > this.chunkSize)
        ) {
          total -=
            currentParts[0].length + (currentParts.length > 1 ? sepLen : 0)
          currentParts.shift()
        }
      }

      currentParts.push(split)
      total += splitLen + (currentParts.length > 1 ? sepLen : 0)
    }

    if (currentParts.length > 0) {
      docs.push(currentParts.join(separator))
    }

    return docs.filter((d) => d.length > 0)
  }
}
