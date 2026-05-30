import {
  ItemView,
  WorkspaceLeaf,
  Notice,
  setIcon,
  TextComponent,
  ButtonComponent,
  setTooltip,
  requestUrl,
  Modal,
  App,
  Platform,
} from 'obsidian'
import { XMLParser } from 'fast-xml-parser'
import Graph from 'graphology'
import Sigma from 'sigma'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import FA2Layout from 'graphology-layout-forceatlas2/worker'
// ForceGraph3D (~4MB with three.js) is lazy-loaded on first 3D render
type ForceGraph3DConstructor = () => ForceGraph3DInstance
import { MergeSelectionModal } from '../components/modals/MergeSelectionModal'
// Use type import to avoid circular dependency values but get the type
import type NeuralComposerPlugin from '../main'

import { CreateRelationModal } from '../components/modals/CreateRelationModal'

// LightRAG /graphs API response types
interface ApiKgNode {
  id: string
  labels: string[]
  properties: Record<string, unknown>
}

interface ApiKgEdge {
  id: string
  type?: string
  source: string
  target: string
  properties: Record<string, unknown>
}

interface ApiKnowledgeGraph {
  nodes: ApiKgNode[]
  edges: ApiKgEdge[]
  is_truncated: boolean
}

export const NATIVE_GRAPH_VIEW_TYPE = 'neural-native-graph'

// --- Interfaces for Strict Typing ---
interface GraphNode {
  id: string
  type: string
  desc: string
  source_id: string
  val: number
  degree?: number
  file_paths?: string[]
  // For 3D graph coords
  x?: number
  y?: number
  z?: number
  // Fix: Added optional property to match usage in showNodeDetails
  node_type?: string
}

interface ChunkDocMap {
  full_doc_id?: string
  doc_id?: string
  [key: string]: unknown
}

interface DocNameMap {
  file_name?: string
  file_path?: string
  id?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

interface GraphMLAttribute {
  id: string
  'attr.name'?: string
}

interface GraphMLNodeData {
  key: string
  value: string | number
}

interface GraphMLRawNode {
  id: string
  data?: GraphMLNodeData[] | GraphMLNodeData
}

interface GraphMLRawEdge {
  source: string
  target: string
  '@_source'?: string
  '@_target'?: string
  normalizedSource?: string
  normalizedTarget?: string
}

interface GraphMLParsed {
  graphml?: {
    key?: GraphMLAttribute | GraphMLAttribute[]
    graph?: {
      node?: GraphMLRawNode | GraphMLRawNode[]
      edge?: GraphMLRawEdge | GraphMLRawEdge[]
    }
  }
}

// Interfaces for external untyped libraries
interface FA2LayoutInstance {
  start: () => void
  stop: () => void
  isRunning: () => boolean
  kill: () => void
}

// Helper interface for links inside the 3D graph
interface GraphLink {
  source: string
  target: string
}

// Fix 1: Improved typing for 3d-force-graph replacing 'any' with GraphNode/GraphLink
interface ForceGraph3DInstance {
  (element: HTMLElement): ForceGraph3DInstance
  // Fix [8, 9]: Typed nodes and links instead of any[]
  graphData(data: {
    nodes: GraphNode[]
    links: GraphLink[]
  }): ForceGraph3DInstance
  backgroundColor(color: string): ForceGraph3DInstance
  nodeAutoColorBy(attr: string): ForceGraph3DInstance
  nodeVal(attr: string): ForceGraph3DInstance
  nodeRelSize(size: number): ForceGraph3DInstance
  nodeLabel(attr: string): ForceGraph3DInstance
  nodeOpacity(opacity: number): ForceGraph3DInstance
  linkWidth(width: number): ForceGraph3DInstance
  linkOpacity(opacity: number): ForceGraph3DInstance
  cooldownTicks(ticks: number): ForceGraph3DInstance
  // Fix [10]: Callback receives a GraphNode, not any
  onNodeClick(callback: (node: GraphNode) => void): ForceGraph3DInstance
  width(width: number): ForceGraph3DInstance
  height(height: number): ForceGraph3DInstance
  // Fix [11]: lookAt expects a GraphNode (or coordinates), avoiding any
  cameraPosition(
    pos: { x: number; y: number; z: number },
    lookAt?: GraphNode,
    ms?: number,
  ): ForceGraph3DInstance
  zoomToFit(ms: number, padding: number): ForceGraph3DInstance
  _destructor(): void
}

// Fix [12]: Interface for Getter usage ensuring strict return types
interface ForceGraph3DGetter {
  graphData(): { nodes: GraphNode[]; links: GraphLink[] }
}

export class NativeGraphView extends ItemView {
  private plugin: NeuralComposerPlugin
  private workDir: string

  // Node.js modules — loaded lazily in onOpen() on desktop only (for loadReferenceMaps)
  private _nodeFs: typeof import('fs') | null = null
  private _nodePath: typeof import('path') | null = null

  // API-based graph navigation state
  private currentRootLabel: string = '' // '' = overview mode
  private currentMaxDepth: number = 3 // only used in explore mode
  private currentMaxNodes: number = 1000
  private statsLabelEl: HTMLElement | null = null
  private graphContainer: HTMLElement | null = null
  /** Node id to focus+detail after the next render (used when auto-entering explore mode). */
  private pendingDetailNode: string | null = null

  private sigmaInstance: Sigma | null = null
  private fa2Layout: FA2LayoutInstance | null = null
  private graph3D: ForceGraph3DInstance | null = null

  private graph: Graph | null = null
  private chunkToDocMap: Record<string, ChunkDocMap> = {}
  private docToNameMap: Record<string, DocNameMap> = {}

  private detailsPanel: HTMLElement | null = null
  private sidebarListEl: HTMLElement | null = null
  private searchInputEl: HTMLInputElement | null = null
  private sortBtnEl: HTMLElement | null = null

  private selectedNodes: Set<string> = new Set()
  private sortAscending: boolean = false
  private allNodes: GraphNode[] = []
  private filteredNodes: GraphNode[] = []

  constructor(leaf: WorkspaceLeaf, plugin: NeuralComposerPlugin) {
    super(leaf)
    this.plugin = plugin
    this.workDir = plugin.settings.lightRagWorkDir
  }

  getViewType() {
    return NATIVE_GRAPH_VIEW_TYPE
  }
  getDisplayText() {
    return 'Neural manager'
  }
  getIcon() {
    return 'brain-circuit'
  }

  async onOpen() {
    await super.onOpen()

    const container = this.contentEl
    container.empty()

    if (!Platform.isDesktop) {
      container.addClass('nrlcmp-graph-view')
      const notice = container.createDiv({ cls: 'nrlcmp-mobile-notice' })
      notice.createEl('p', {
        text: 'The graph view requires a local LightRAG server and is only available on desktop. On mobile, use remote server mode to access chat features.',
      })
      return
    }

    // Load Node.js modules — desktop only, used by loadReferenceMaps for source file resolution.
    // Use require() (not import()) because the bundle is CJS and dynamic ESM
    // import() is not resolved correctly in Obsidian's plugin loader.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    this._nodeFs = require('fs') as typeof import('fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    this._nodePath = require('path') as typeof import('path')
    this.workDir = this.plugin.settings.lightRagWorkDir

    container.addClass('nrlcmp-graph-view')

    const is3D = this.plugin.settings.graphViewMode === '3d'
    container.addClass(is3D ? 'nrlcmp-mode-3d' : 'nrlcmp-mode-2d')

    // Load chunk→doc maps from local files (desktop only, best-effort for source citations)
    await this.loadReferenceMaps()

    // Reset navigation state on open
    this.currentRootLabel = ''

    // LEFT ZONE (Graph)
    const graphZone = container.createDiv({ cls: 'nrlcmp-graph-zone' })

    const graphContainer = graphZone.createDiv({
      cls: 'nrlcmp-sigma-container',
    })
    graphContainer.id = 'sigma-container'
    this.graphContainer = graphContainer

    this.createGraphToolbar(graphZone, graphContainer)
    this.createDetailsPanel(graphZone)

    // RIGHT ZONE (Sidebar)
    const sidebar = container.createDiv({ cls: 'nrlcmp-sidebar' })
    this.buildSidebar(sidebar)

    // Initial render via API
    void this.render(graphContainer)
  }

  // Fix: Removed async (no await). Returns Promise to match interface.
  onClose(): Promise<void> {
    this.cleanup()
    return Promise.resolve()
  }

  // --- DATA LOGIC ---
  async loadReferenceMaps() {
    if (!this._nodeFs || !this._nodePath) return
    try {
      const chunksPath = this._nodePath.join(
        this.workDir,
        'kv_store_text_chunks.json',
      )
      const docsPath = this._nodePath.join(
        this.workDir,
        'kv_store_doc_status.json',
      )

      if (this._nodeFs.existsSync(chunksPath)) {
        const content = this._nodeFs.readFileSync(chunksPath, 'utf-8')
        this.chunkToDocMap = JSON.parse(content) as Record<string, ChunkDocMap>
      }

      if (this._nodeFs.existsSync(docsPath)) {
        const raw = JSON.parse(
          this._nodeFs.readFileSync(docsPath, 'utf-8'),
        ) as Record<string, Record<string, unknown>>

        // kv_store_doc_status.json can use either the file path OR the doc ID as
        // the key depending on the LightRAG version. Build a map that is indexed
        // by BOTH so lookups via full_doc_id always succeed.
        this.docToNameMap = {}
        for (const [key, val] of Object.entries(raw)) {
          const entry: DocNameMap = { ...val, _rawKey: key }
          // Index by the raw key (may be a file path or doc ID)
          this.docToNameMap[key] = entry
          // Also index by the embedded id field if it differs from the key
          const embeddedId = val.id as string | undefined
          if (embeddedId && embeddedId !== key) {
            this.docToNameMap[embeddedId] = entry
          }
        }
      }
    } catch (e) {
      console.error('Error loading maps', e)
    }
  }

  // --- API GRAPH METHODS ---

  private getLightRagHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}
    if (this.plugin.settings.lightRagApiKey) {
      headers['X-API-Key'] = this.plugin.settings.lightRagApiKey
    }
    return headers
  }

  private get serverUrl(): string {
    return this.plugin.settings.lightRagServerUrl
  }

  /** Returns every label that exists in the graph (nodes with ≥1 edge). */
  private async fetchAllLabels(): Promise<string[] | null> {
    try {
      const resp = await requestUrl({
        url: `${this.serverUrl}/graph/label/list`,
        method: 'GET',
        headers: this.getLightRagHeaders(),
        throw: false,
      })
      if (resp.status !== 200) return null
      return Array.isArray(resp.json) ? (resp.json as string[]) : null
    } catch {
      return null
    }
  }

  private async fetchPopularLabel(): Promise<string | null> {
    try {
      const response = await requestUrl({
        url: `${this.serverUrl}/graph/label/popular?limit=1`,
        method: 'GET',
        headers: this.getLightRagHeaders(),
        throw: false,
      })
      if (response.status !== 200) return null
      const labels: string[] = response.json
      return labels.length > 0 ? labels[0] : null
    } catch (e) {
      console.error('Failed to fetch popular labels:', e)
      return null
    }
  }

  async fetchGraphData(
    label: string,
    maxDepth = 3,
    maxNodes = 500,
  ): Promise<{ nodes: GraphNode[]; edges: GraphMLRawEdge[] } | null> {
    try {
      const url = `${this.serverUrl}/graphs?label=${encodeURIComponent(label)}&max_depth=${maxDepth}&max_nodes=${maxNodes}`
      const response = await requestUrl({
        url,
        method: 'GET',
        headers: this.getLightRagHeaders(),
        throw: false,
      })
      if (response.status !== 200) return null

      const data: ApiKnowledgeGraph = response.json

      const nodeDegrees = new Map<string, number>()
      data.edges.forEach((e) => {
        nodeDegrees.set(e.source, (nodeDegrees.get(e.source) || 0) + 1)
        nodeDegrees.set(e.target, (nodeDegrees.get(e.target) || 0) + 1)
      })

      const nodes: GraphNode[] = data.nodes.map((n) => ({
        id: n.id,
        type: (n.labels[0] as string) || 'Concept',
        desc: String(n.properties.description ?? ''),
        source_id: String(n.properties.source_id ?? ''),
        val: (nodeDegrees.get(n.id) || 0) + 1,
        file_paths: this.getFilenames(String(n.properties.source_id ?? '')),
      }))

      const edges: GraphMLRawEdge[] = data.edges.map((e) => ({
        source: e.source,
        target: e.target,
        normalizedSource: e.source,
        normalizedTarget: e.target,
      }))

      return { nodes, edges }
    } catch (e) {
      console.error('Failed to fetch graph data:', e)
      return null
    }
  }

  getFilenames(sourceIds: string): string[] {
    if (!sourceIds) return []
    const chunks = sourceIds
      .split(new RegExp('<SEP>|,'))
      .map((s) => s.trim().replace(/['"[\]]/g, ''))
      .filter(Boolean)
    const fileNames = new Set<string>()
    chunks.forEach((chunkId) => {
      const chunkData = this.chunkToDocMap[chunkId]
      if (!chunkData) return
      const docID = String(chunkData.full_doc_id ?? chunkData.doc_id ?? '')
      if (!docID) return
      const docData = this.docToNameMap[docID]
      if (!docData) return

      // Try every plausible field/path where LightRAG stores the filename
      const meta = docData.metadata as Record<string, unknown> | undefined
      const rawName =
        docData.file_name || // direct field (older versions)
        docData.file_path || // alternative direct field
        meta?.file_name || // nested in metadata
        meta?.file_path || // nested alternative
        (docData._rawKey as string) || // the raw JSON key (often is the file path)
        docData.id // doc ID as last-resort display name
      if (rawName) {
        // Show only the basename so long paths stay readable
        const name =
          String(rawName).replace(/\\/g, '/').split('/').pop() ||
          String(rawName)
        fileNames.add(name)
      }
    })
    return Array.from(fileNames)
  }

  // --- MAIN RENDER ---
  async render(container: HTMLElement) {
    this.cleanup()
    container.empty()

    const isOverview = !this.currentRootLabel

    // Loading indicator
    const loadingEl = container.createDiv({ cls: 'nrlcmp-loading' })
    loadingEl.setText(
      isOverview ? 'Loading full graph overview...' : 'Loading subgraph...',
    )

    // In overview mode resolve the most popular node as root for traversal;
    // in explore mode the root is already set by the user.
    let rootLabel = this.currentRootLabel
    if (isOverview) {
      const popular = await this.fetchPopularLabel()
      if (!popular) {
        loadingEl.setText(
          'No graph data found. Ingest documents into the knowledge graph first.',
        )
        return
      }
      rootLabel = popular
    }

    // Overview: traverse with unlimited depth to reach every connected node.
    // Explore: use the user-controlled depth for a focused neighbourhood.
    const depth = isOverview ? 999 : this.currentMaxDepth
    const data = await this.fetchGraphData(
      rootLabel,
      depth,
      this.currentMaxNodes,
    )

    loadingEl.remove()

    if (!data || data.nodes.length === 0) {
      container
        .createDiv({ cls: 'nrlcmp-loading' })
        .setText('No nodes found for this entity. Try a different search.')
      this.updateStatsLabel(0, 0, isOverview)
      return
    }

    // In overview mode: also fetch ALL labels so we can add nodes from
    // disconnected components that the BFS traversal could not reach.
    if (isOverview) {
      const allLabels = await this.fetchAllLabels()
      if (allLabels) {
        const existingIds = new Set(data.nodes.map((n) => n.id))
        const isolated: GraphNode[] = allLabels
          .filter((lbl) => !existingIds.has(lbl))
          .map((lbl) => ({
            id: lbl,
            type: 'Unknown',
            desc: '',
            source_id: '',
            val: 1, // degree 0 — renders as the smallest node size
            file_paths: [],
          }))
        data.nodes.push(...isolated)
      }
    }

    this.allNodes = data.nodes.sort((a, b) => b.val - a.val)
    this.filteredNodes = this.allNodes
    this.updateSidebarList()
    this.updateStatsLabel(data.nodes.length, data.edges.length, isOverview)

    const mode = this.plugin.settings.graphViewMode
    if (mode === '3d') {
      this.render3D(container, data.nodes, data.edges)
    } else {
      this.render2D(container, data.nodes, data.edges)
    }

    // If we auto-entered explore mode from a placeholder node click,
    // open the detail panel automatically once the graph is ready.
    if (this.pendingDetailNode) {
      const targetId = this.pendingDetailNode
      this.pendingDetailNode = null
      // Small delay so sigma/forcegraph finishes initial setup
      setTimeout(() => {
        const enriched = this.allNodes.find((n) => n.id === targetId)
        if (!enriched) return
        if (mode === '2d') {
          // focusOnNode2D zooms + highlights + opens the details panel
          this.focusOnNode2D(targetId)
        } else {
          this.showNodeDetails(enriched)
        }
      }, 250)
    }
  }

  private updateStatsLabel(nodes: number, edges: number, isOverview = false) {
    if (!this.statsLabelEl) return
    if (nodes === 0) {
      this.statsLabelEl.setText('')
      return
    }
    const renderMode = this.plugin.settings.graphViewMode.toUpperCase()
    const viewInfo = isOverview ? 'overview' : `depth ${this.currentMaxDepth}`
    const truncated = nodes >= this.currentMaxNodes ? ' · truncated' : ''
    this.statsLabelEl.setText(
      `${nodes} nodes · ${edges} edges · ${viewInfo} · ${renderMode}${truncated}`,
    )
  }

  // --- HELPER 2D ---
  /** Returns true for synthetic isolated nodes added in overview mode (no real data yet). */
  private isPlaceholderNode(nodeId: string): boolean {
    const n = this.allNodes.find((x) => x.id === nodeId)
    return !!n && n.type === 'Unknown' && n.desc === ''
  }

  /**
   * If a placeholder (isolated) node is clicked, switch to explore mode so its
   * real description and connections are fetched, then auto-open the detail panel.
   * Returns true if the switch was triggered (caller should bail out of the normal flow).
   */
  private autoExploreIfPlaceholder(nodeId: string): boolean {
    if (!this.isPlaceholderNode(nodeId)) return false
    this.pendingDetailNode = nodeId
    this.currentRootLabel = nodeId
    if (this.graphContainer) void this.render(this.graphContainer)
    return true
  }

  focusOnNode2D(nodeId: string) {
    if (!this.graph || !this.sigmaInstance) return

    // Auto-enter explore mode for isolated nodes (they have no real data yet)
    if (this.autoExploreIfPlaceholder(nodeId)) return

    if (this.fa2Layout && this.fa2Layout.isRunning()) {
      this.fa2Layout.stop()
    }

    const attrs = this.graph.getNodeAttributes(nodeId)
    const visualData = this.sigmaInstance.getNodeDisplayData(nodeId)
    if (!attrs) return

    let targetX = attrs.x
    let targetY = attrs.y
    if (
      visualData &&
      typeof visualData.x === 'number' &&
      !isNaN(visualData.x)
    ) {
      targetX = visualData.x
      targetY = visualData.y
    }

    void this.sigmaInstance
      .getCamera()
      .animate(
        { x: targetX, y: targetY, ratio: 0.15, angle: 0 },
        { duration: 1500, easing: 'cubicInOut' },
      )

    // Reset styles
    this.graph.forEachNode((n) => {
      this.graph?.setNodeAttribute(n, 'color', '#444')
      this.graph?.setNodeAttribute(n, 'label', '')
      this.graph?.setNodeAttribute(n, 'zIndex', 0)
    })
    this.graph.forEachEdge((e) =>
      this.graph?.setEdgeAttribute(e, 'hidden', true),
    )

    // Highlight neighbors
    this.graph.forEachNeighbor(nodeId, (n) => {
      this.graph?.setNodeAttribute(n, 'color', '#ff0055')
      this.graph?.setNodeAttribute(n, 'label', n)
      this.graph?.setNodeAttribute(n, 'zIndex', 1)
    })
    this.graph.forEachEdge(nodeId, (e) => {
      this.graph?.setEdgeAttribute(e, 'hidden', false)
      this.graph?.setEdgeAttribute(e, 'color', '#ff0055')
      this.graph?.setEdgeAttribute(e, 'size', 2)
    })

    // Highlight target
    const isDark = document.body.classList.contains('theme-dark')
    this.graph.setNodeAttribute(nodeId, 'color', isDark ? '#ffffff' : '#00d4ff')
    this.graph.setNodeAttribute(nodeId, 'label', nodeId)
    this.graph.setNodeAttribute(
      nodeId,
      'size',
      (visualData?.size || attrs.size || 5) * 1.5,
    )

    this.showNodeDetails({
      id: nodeId,
      ...attrs,
      type: attrs.node_type || attrs.type,
    } as unknown as GraphNode)
  }

  // --- ENGINE 2D ---
  render2D(
    container: HTMLElement,
    nodes: GraphNode[],
    edges: GraphMLRawEdge[],
  ) {
    this.graph = new Graph()
    const LABEL_THRESHOLD = 4

    nodes.forEach((n) => {
      if (!this.graph?.hasNode(n.id)) {
        const showLabel = n.val > LABEL_THRESHOLD
        this.graph?.addNode(n.id, {
          label: showLabel ? n.id : '',
          size: Math.max(3, Math.min(n.val * 1.5, 20)),
          color: '#00d4ff',
          type: 'circle',
          node_type: n.type,
          desc: n.desc,
          file_paths: n.file_paths,
          val: n.val,
          forceLabel: showLabel,
          x: Math.random() * 100,
          y: Math.random() * 100,
        })
      }
    })

    edges.forEach((e) => {
      const src = e.normalizedSource || e.source
      const tgt = e.normalizedTarget || e.target
      if (this.graph?.hasNode(src) && this.graph?.hasNode(tgt)) {
        if (!this.graph.hasEdge(src, tgt)) {
          this.graph.addEdge(src, tgt, {
            color: '#333',
            size: 0.5,
            hidden: false,
          })
        }
      }
    })

    const initSigma = () => {
      if (container.clientWidth === 0) {
        requestAnimationFrame(initSigma)
        return
      }
      if (!this.graph) return
      if (this.sigmaInstance) this.sigmaInstance.kill()

      const isDark = document.body.classList.contains('theme-dark')
      const labelTextColor = isDark ? '#e8e8e8' : '#111111'
      container.style.backgroundColor = isDark ? '#111111' : '#f0f0f0'

      // Stamp label color onto every node so the custom hover renderer can read it
      this.graph.forEachNode((n) => {
        this.graph?.setNodeAttribute(n, 'labelColor', labelTextColor)
      })

      // Custom hover renderer: same shape as Sigma's default but theme-aware background
      const hoverBgColor = isDark ? 'rgba(28, 28, 28, 0.97)' : '#ffffff'
      const hoverShadowColor = isDark ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.4)'
      const drawHover = (
        context: CanvasRenderingContext2D,
        data: {
          x: number
          y: number
          size: number
          label: string
          [key: string]: unknown
        },
        settings: { labelSize: number; labelFont: string; labelWeight: string },
      ) => {
        const size = settings.labelSize
        const font = settings.labelFont
        const weight = settings.labelWeight
        const PADDING = 2

        context.font = `${weight} ${size}px ${font}`
        context.fillStyle = hoverBgColor
        context.shadowOffsetX = 0
        context.shadowOffsetY = 0
        context.shadowBlur = 8
        context.shadowColor = hoverShadowColor

        if (typeof data.label === 'string') {
          const textWidth = context.measureText(data.label).width
          const boxWidth = Math.round(textWidth + 5)
          const boxHeight = Math.round(size + 2 * PADDING)
          const radius = Math.max(data.size, size / 2) + PADDING
          const angleRadian = Math.asin(Math.min(boxHeight / 2 / radius, 1))
          const xDeltaCoord = Math.sqrt(
            Math.abs(radius ** 2 - (boxHeight / 2) ** 2),
          )

          context.beginPath()
          context.moveTo(data.x + xDeltaCoord, data.y + boxHeight / 2)
          context.lineTo(data.x + radius + boxWidth, data.y + boxHeight / 2)
          context.lineTo(data.x + radius + boxWidth, data.y - boxHeight / 2)
          context.lineTo(data.x + xDeltaCoord, data.y - boxHeight / 2)
          context.arc(data.x, data.y, radius, angleRadian, -angleRadian)
          context.closePath()
          context.fill()
        } else {
          context.beginPath()
          context.arc(data.x, data.y, data.size + PADDING, 0, Math.PI * 2)
          context.closePath()
          context.fill()
        }

        context.shadowOffsetX = 0
        context.shadowOffsetY = 0
        context.shadowBlur = 0

        // Label text — use per-node labelColor attribute
        if (typeof data.label === 'string') {
          const textColor =
            (data.labelColor as string | undefined) || labelTextColor
          context.fillStyle = textColor
          context.fillText(
            data.label,
            data.x + data.size + 3,
            data.y + size / 3,
          )
        }
      }

      this.sigmaInstance = new Sigma(this.graph, container, {
        minCameraRatio: 0.001,
        maxCameraRatio: 10,
        renderLabels: true,
        labelFont: 'monospace',
        labelColor: { attribute: 'labelColor' },
        labelSize: 14,
        labelWeight: 'bold',
        allowInvalidContainer: true,
        zIndex: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        defaultDrawNodeHover: drawHover as any,
      })

      const settings = forceAtlas2.inferSettings(this.graph)
      this.fa2Layout = new FA2Layout(this.graph, {
        settings: { ...settings, gravity: 1, slowDown: 5 },
      })
      // FIXED: Optional chaining to prevent "Object is possibly null"
      this.fa2Layout?.start()

      window.setTimeout(() => {
        if (this.fa2Layout?.isRunning()) this.fa2Layout.stop()
      }, 4000)

      // --- EVENTS ---
      this.sigmaInstance.on('clickNode', (event) => {
        this.focusOnNode2D(event.node)
      })

      this.sigmaInstance.on('enterNode', (event) => {
        const attrs = this.graph?.getNodeAttributes(event.node)
        if (!attrs) return
        if (attrs.color !== '#ffffff') {
          this.graph?.setNodeAttribute(event.node, 'label', event.node)
          this.graph?.setNodeAttribute(event.node, 'color', '#ff0055')
          this.graph?.setNodeAttribute(event.node, 'zIndex', 10)
        }
      })

      this.sigmaInstance.on('leaveNode', (event) => {
        const attrs = this.graph?.getNodeAttributes(event.node)
        if (!attrs) return
        if (attrs.color === '#ff0055') {
          this.graph?.setNodeAttribute(event.node, 'color', '#00d4ff')
          this.graph?.setNodeAttribute(event.node, 'zIndex', 0)
          if (attrs.forceLabel) {
            this.graph?.setNodeAttribute(event.node, 'label', event.node)
          } else {
            this.graph?.setNodeAttribute(event.node, 'label', '')
          }
        }
      })

      this.sigmaInstance.on('clickStage', () => {
        if (!this.graph) return
        this.graph.forEachNode((n, a) => {
          this.graph?.setNodeAttribute(n, 'color', '#00d4ff')
          this.graph?.setNodeAttribute(n, 'zIndex', 0)
          this.graph?.setNodeAttribute(n, 'label', a.forceLabel ? n : '')
        })
        this.graph.forEachEdge((e) => {
          this.graph?.setEdgeAttribute(e, 'hidden', false)
          this.graph?.setEdgeAttribute(e, 'color', '#333')
        })
        if (this.detailsPanel) this.detailsPanel.removeClass('nrlcmp-visible')
      })
    }
    requestAnimationFrame(initSigma)
  }

  // --- ENGINE 3D ---
  async render3D(
    container: HTMLElement,
    nodes: GraphNode[],
    edges: GraphMLRawEdge[],
  ) {
    const gData = {
      nodes: nodes.map((n) => ({ ...n, type: n.type })),
      links: edges.map((e) => ({
        source: e.normalizedSource || e.source,
        target: e.normalizedTarget || e.target,
      })),
    }

    const { default: ForceGraph3D } = await import('3d-force-graph')
    this.graph3D = (ForceGraph3D as unknown as ForceGraph3DConstructor)()(
      container,
    )
      .graphData(gData)
      .backgroundColor('#000005')
      .nodeAutoColorBy('type')
      .nodeVal('val')
      .nodeRelSize(4)
      .nodeLabel('id')
      .nodeOpacity(0.9)
      .linkWidth(0.6)
      .linkOpacity(0.2)
      .cooldownTicks(100)
      // Fix [16]: Typed callback argument
      .onNodeClick((node: GraphNode) => {
        // Isolated placeholder nodes have no data — auto-enter explore mode
        if (this.autoExploreIfPlaceholder(node.id ?? '')) return
        this.showNodeDetails(node)
        // Safe check for coordinates before using them
        if (
          typeof node.x === 'number' &&
          typeof node.y === 'number' &&
          typeof node.z === 'number'
        ) {
          const dist = 40
          const ratio = 1 + dist / Math.hypot(node.x, node.y, node.z)
          if (this.graph3D) {
            this.graph3D.cameraPosition(
              { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio },
              node,
              2000,
            )
          }
        }
      })

    this.graph3D?.width(container.clientWidth)
    this.graph3D?.height(container.clientHeight)
  }

  cleanup() {
    if (this.sigmaInstance) {
      this.sigmaInstance.kill()
      this.sigmaInstance = null
    }
    if (this.fa2Layout) {
      this.fa2Layout.stop()
      this.fa2Layout = null
    }
    if (this.graph3D) {
      this.graph3D._destructor()
      this.graph3D = null
    }
  }

  updateSidebarList() {
    if (!this.graph && this.allNodes.length === 0) return
    this.sortAscending = false
    this.allNodes.sort((a, b) => b.val - a.val)
    this.filteredNodes = this.allNodes
    this.renderList()
  }

  createDetailsPanel(container: HTMLElement) {
    this.detailsPanel = container.createDiv({ cls: 'nrlcmp-details-panel' })
  }

  // --- UI DETAILS ---
  showNodeDetails(node: Partial<GraphNode>) {
    if (!this.detailsPanel) return
    this.detailsPanel.empty()

    const files = node.file_paths || []
    const type = node.node_type || node.type || 'Unknown'
    const nodeId = node.id || 'Unknown' // Safe fallback
    const desc = node.desc || 'No description.'

    // 1. Header
    const header = this.detailsPanel.createDiv({ cls: 'nrlcmp-details-header' })
    header.createSpan({ text: type.toUpperCase(), cls: 'nrlcmp-details-type' })

    const btnGroup = header.createDiv({ cls: 'nrlcmp-btn-group' })
    const editBtn = btnGroup.createEl('button', {
      text: '✏️',
      cls: 'nrlcmp-details-btn-edit',
    })
    const closeBtn = btnGroup.createEl('button', {
      text: '✕',
      cls: 'nrlcmp-details-close',
    })
    closeBtn.onclick = () => {
      if (this.detailsPanel) this.detailsPanel.removeClass('nrlcmp-visible')
    }

    // 2. Body
    const content = this.detailsPanel.createDiv({ cls: 'nrlcmp-details-body' })

    // View Mode
    const viewMode = content.createDiv()
    viewMode.id = 'view-mode'
    viewMode.addClass('nrlcmp-visible')

    const meta = viewMode.createDiv({ cls: 'nrlcmp-details-meta' })
    meta.createSpan({ text: 'Links: ' })
    meta.createEl('b', {
      text: String(node.val || 0),
      cls: 'nrlcmp-text-highlight',
    })

    viewMode.createEl('h2', { text: nodeId, cls: 'nrlcmp-details-title' })

    const descBox = viewMode.createDiv({ cls: 'nrlcmp-details-desc-box' })
    descBox.setText(desc)

    const sourcesSection = viewMode.createDiv({ cls: 'nrlcmp-sources-section' })
    sourcesSection.createEl('h4', {
      text: 'Context sources',
      cls: 'nrlcmp-sources-title',
    })

    const ul = sourcesSection.createEl('ul', { cls: 'nrlcmp-sources-list' })

    if (files.length > 0) {
      files.forEach((f: string) => {
        const li = ul.createEl('li', { cls: 'nrlcmp-source-item' })
        li.createSpan({ text: '📄', cls: 'nrlcmp-source-icon' })
        li.createSpan({ text: f })
      })
    } else {
      ul.createEl('li', { text: 'No explicit source', cls: 'nrlcmp-no-source' })
    }

    // Explore from this node
    const exploreBtn = viewMode.createEl('button', {
      text: 'Explore from here',
      cls: 'nrlcmp-explore-btn',
    })
    setTooltip(exploreBtn, 'Reload graph centered on this entity')
    exploreBtn.onclick = () => {
      this.currentRootLabel = nodeId
      if (this.graphContainer) void this.render(this.graphContainer)
    }

    // Edit Mode
    const editMode = content.createDiv()
    editMode.id = 'edit-mode'
    editMode.addClass('nrlcmp-hidden')

    const makeInput = (lbl: string, val: string) => {
      editMode.createEl('label', { text: lbl, cls: 'nrlcmp-edit-label' })
      const i = editMode.createEl('input', { cls: 'nrlcmp-edit-input' })
      i.type = 'text'
      i.value = val
      return i
    }

    const nameInput = makeInput('Name (ID)', nodeId)
    const typeInput = makeInput('Type', type)

    editMode.createEl('label', {
      text: 'Description',
      cls: 'nrlcmp-edit-label',
    })
    const descInput = editMode.createEl('textarea', {
      cls: 'nrlcmp-edit-input',
    })
    descInput.value = desc
    descInput.rows = 6

    const actions = editMode.createDiv({ cls: 'nrlcmp-edit-actions' })

    const cancelBtn = new ButtonComponent(actions).setButtonText('Cancel')
    const saveBtn = new ButtonComponent(actions).setButtonText('Save changes')
    saveBtn.setCta()

    // Wiring
    editBtn.onclick = () => {
      viewMode.removeClass('nrlcmp-visible')
      viewMode.addClass('nrlcmp-hidden')

      editMode.removeClass('nrlcmp-hidden')
      editMode.addClass('nrlcmp-visible')
    }
    cancelBtn.buttonEl.onclick = () => {
      editMode.removeClass('nrlcmp-visible')
      editMode.addClass('nrlcmp-hidden')

      viewMode.removeClass('nrlcmp-hidden')
      viewMode.addClass('nrlcmp-visible')
    }

    saveBtn.buttonEl.onclick = () => {
      const newName = nameInput.value.trim()
      if (newName && nodeId !== 'Unknown') {
        void (async () => {
          await this.updateNode(nodeId, {
            entity_name: newName,
            entity_type: typeInput.value.trim(),
            description: descInput.value.trim(),
          })
          if (this.detailsPanel) this.detailsPanel.removeClass('nrlcmp-visible')
        })()
      }
    }

    this.detailsPanel.addClass('nrlcmp-visible')
  }

  async updateNode(oldName: string, data: Record<string, unknown>) {
    new Notice(`Updating node "${oldName}"...`)
    try {
      const response = await requestUrl({
        url: `${this.plugin.settings.lightRagServerUrl}/graph/entity/edit`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.plugin.settings.lightRagApiKey
            ? { 'X-API-Key': this.plugin.settings.lightRagApiKey }
            : {}),
        },
        body: JSON.stringify({
          entity_name: oldName,
          updated_data: data,
          allow_rename: true,
          allow_merge: true,
        }),
      })

      if (response.status === 200) {
        new Notice('Node updated!')
        setTimeout(() => {
          const container = this.contentEl.querySelector('#sigma-container')
          if (container instanceof HTMLElement) void this.render(container)
        }, 1500)
      } else {
        new Notice(`Error updating: ${response.text}`)
      }
    } catch (e) {
      console.error(e)
      new Notice('API connection error')
    }
  }

  createGraphToolbar(container: HTMLElement, graphContainer: HTMLElement) {
    const tb = container.createDiv({ cls: 'nrlcmp-toolbar' })

    // Entity explore input — loads subgraph centered on a specific entity
    const exploreInput = tb.createEl('input', { cls: 'nrlcmp-toolbar-input' })
    exploreInput.type = 'text'
    exploreInput.placeholder = 'Explore entity...'
    setTooltip(
      exploreInput,
      'Type an entity name and press Enter to center the graph on it',
    )

    const loadEntity = () => {
      const val = exploreInput.value.trim()
      if (!val) return
      this.currentRootLabel = val
      exploreInput.value = ''
      void this.render(graphContainer)
    }
    exploreInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadEntity()
    })

    const btnExplore = tb.createEl('button', { cls: 'nrlcmp-toolbar-btn' })
    setIcon(btnExplore, 'search')
    setTooltip(btnExplore, 'Load subgraph for this entity')
    btnExplore.onclick = loadEntity

    // Separator
    tb.createEl('span', { cls: 'nrlcmp-toolbar-sep' })

    // Depth controls — only meaningful in explore mode (currentRootLabel set)
    const isExplore = !!this.currentRootLabel
    const btnLess = tb.createEl('button', { cls: 'nrlcmp-toolbar-btn' })
    setIcon(btnLess, 'minus')
    setTooltip(
      btnLess,
      isExplore
        ? 'Decrease subgraph depth (−1)'
        : 'Switch to explore mode first',
    )
    btnLess.disabled = !isExplore
    btnLess.onclick = () => {
      if (!this.currentRootLabel) return
      this.currentMaxDepth = Math.max(1, this.currentMaxDepth - 1)
      void this.render(graphContainer)
    }

    const btnMore = tb.createEl('button', { cls: 'nrlcmp-toolbar-btn' })
    setIcon(btnMore, 'plus')
    setTooltip(
      btnMore,
      isExplore
        ? 'Increase subgraph depth (+1)'
        : 'Switch to explore mode first',
    )
    btnMore.disabled = !isExplore
    btnMore.onclick = () => {
      if (!this.currentRootLabel) return
      this.currentMaxDepth = Math.min(10, this.currentMaxDepth + 1)
      void this.render(graphContainer)
    }

    // Separator
    tb.createEl('span', { cls: 'nrlcmp-toolbar-sep' })

    const btnReload = tb.createEl('button', { cls: 'nrlcmp-toolbar-btn' })
    setIcon(btnReload, 'refresh-cw')
    setTooltip(btnReload, 'Back to full overview (all nodes)')
    btnReload.onclick = () => {
      this.currentRootLabel = ''
      this.currentMaxDepth = 3
      this.currentMaxNodes = 1000
      void this.render(graphContainer)
    }

    const btnReset = tb.createEl('button', { cls: 'nrlcmp-toolbar-btn' })
    setIcon(btnReset, 'maximize')
    setTooltip(btnReset, 'Reset camera')
    btnReset.onclick = () => {
      if (this.graph3D) this.graph3D.zoomToFit(1000, 50)
      if (this.sigmaInstance)
        void this.sigmaInstance
          .getCamera()
          .animate({ x: 0.5, y: 0.5, ratio: 0.1 }, { duration: 500 })
    }

    // Stats label — updated after each render
    this.statsLabelEl = tb.createEl('span', { cls: 'nrlcmp-toolbar-stats' })
  }

  buildSidebar(container: HTMLElement) {
    const header = container.createDiv({ cls: 'nrlcmp-sidebar-header' })
    header.createEl('h4', { text: 'Node manager' })

    const searchInput = new TextComponent(header)
    searchInput.setPlaceholder('Filter list...')
    searchInput.inputEl.addClass('nrlcmp-full-width')
    searchInput.onChange((val) => this.filterList(val))
    this.searchInputEl = searchInput.inputEl

    const actionButtons = header.createDiv({ cls: 'nrlcmp-sidebar-actions' })
    new ButtonComponent(actionButtons)
      .setButtonText('Merge')
      .setCta()
      .onClick(() => {
        void this.mergeSelectedNodes()
      })
    // NUEVO BOTÓN: CREATE RELATION
    new ButtonComponent(actionButtons)
      .setButtonText('Link')
      .setTooltip('Create relationships between selected nodes')
      // Fix: Removed async keyword
      .onClick(() => {
        this.createRelationBetweenSelected()
      })
    new ButtonComponent(actionButtons)
      .setButtonText('Delete')
      .setWarning()
      .onClick(() => {
        void this.deleteSelectedNodes()
      })

    const filterBar = header.createDiv({ cls: 'nrlcmp-sidebar-filters' })
    this.sortBtnEl = filterBar.createEl('span', {
      text: 'Sort: degree ⬇',
      cls: 'nrlcmp-sort-btn',
    })
    this.sortBtnEl.onclick = () => this.toggleSort()

    const allEntitiesBtn = filterBar.createEl('span', {
      text: 'All entities',
      cls: 'nrlcmp-orphans-btn',
    })
    setTooltip(
      allEntitiesBtn,
      'Browse all entities in the graph — including orphans and unexplored nodes',
    )
    allEntitiesBtn.onclick = () => void this.showAllEntities()

    this.sidebarListEl = container.createDiv({ cls: 'nrlcmp-sidebar-list' })
  }

  toggleSort() {
    this.sortAscending = !this.sortAscending
    // Fix: Sentence case "Sort: degree"
    if (this.sortBtnEl)
      this.sortBtnEl.textContent = `Sort: degree ${this.sortAscending ? '⬆' : '⬇'}`
    this.filteredNodes.sort((a, b) =>
      this.sortAscending ? a.val - b.val : b.val - a.val,
    )
    this.renderList()
  }

  async showAllEntities() {
    if (this.searchInputEl) this.searchInputEl.value = ''
    if (!this.sidebarListEl) return

    this.sidebarListEl.empty()
    const loadingRow = this.sidebarListEl.createDiv({ cls: 'nrlcmp-list-more' })
    loadingRow.setText('Loading all entities...')

    try {
      // Step 1: get every label that exists in the graph (nodes in any edge)
      const listResp = await requestUrl({
        url: `${this.serverUrl}/graph/label/list`,
        method: 'GET',
        headers: this.getLightRagHeaders(),
        throw: false,
      })
      if (listResp.status !== 200) {
        loadingRow.setText(`Failed to load entities (HTTP ${listResp.status}).`)
        return
      }
      const graphLabels: string[] = Array.isArray(listResp.json)
        ? listResp.json
        : []
      const graphLabelSet = new Set(graphLabels)

      // Step 2: get all labels sorted by degree — "popular" with a high limit.
      // Any label NOT returned here (after requesting up to 1000) that IS in
      // graphLabels has degree 0 in the stored graph → true orphan node.
      const popularResp = await requestUrl({
        url: `${this.serverUrl}/graph/label/popular?limit=1000`,
        method: 'GET',
        headers: this.getLightRagHeaders(),
        throw: false,
      })
      const popularLabels: string[] =
        popularResp.status === 200 && Array.isArray(popularResp.json)
          ? popularResp.json
          : []
      const popularSet = new Set(popularLabels)

      // True orphans: in graph (have a node) but NOT in popular list (degree 0)
      const orphanLabels = graphLabels.filter((lbl) => !popularSet.has(lbl))

      const currentIds = new Set(this.allNodes.map((n) => n.id))

      // Extra nodes not in current subgraph: mark with val=-1 ("unexplored")
      // True orphans: mark with val=-2 ("orphan")
      const extra: GraphNode[] = graphLabels
        .filter((lbl) => !currentIds.has(lbl))
        .map((lbl) => ({
          id: lbl,
          type: 'Unknown',
          desc: '',
          source_id: '',
          val: orphanLabels.includes(lbl) ? -2 : -1,
          file_paths: [],
        }))

      this.filteredNodes = [...this.allNodes, ...extra]
      this.renderList()
    } catch (e) {
      loadingRow.setText(`Error loading entities: ${String(e)}`)
    }
  }

  filterList(query: string) {
    if (!query) {
      this.filteredNodes = this.allNodes
    } else {
      const q = query.toLowerCase()
      this.filteredNodes = this.allNodes.filter((n) =>
        n.id.toLowerCase().includes(q),
      )
    }
    this.renderList()
  }

  renderList() {
    if (!this.sidebarListEl) return
    this.sidebarListEl.empty()
    const VISIBLE_LIMIT = 100
    const visibleNodes = this.filteredNodes.slice(0, VISIBLE_LIMIT)

    visibleNodes.forEach((node) => {
      const row = this.sidebarListEl!.createDiv({ cls: 'nrlcmp-sidebar-row' })
      const cb = row.createEl('input', { type: 'checkbox' })
      cb.checked = this.selectedNodes.has(node.id)
      cb.onclick = (e) => {
        e.stopPropagation()
        if (cb.checked) this.selectedNodes.add(node.id)
        else this.selectedNodes.delete(node.id)
      }

      // val > 0  → in current subgraph, degree = val-1
      // val = -1 → unexplored (in graph but not in current view)
      // val = -2 → orphan (graph node with degree 0, not reachable by traversal)
      const isInSubgraph = node.val > 0
      const isOrphan = node.val === -2
      const rowCls = isOrphan
        ? 'nrlcmp-row-orphan'
        : isInSubgraph
          ? ''
          : 'nrlcmp-row-external'
      if (rowCls) row.addClass(rowCls)

      const info = row.createDiv({ cls: 'nrlcmp-row-info' })
      info.createDiv({ text: node.id, cls: 'nrlcmp-row-title' })
      let metaText: string
      if (isOrphan) {
        metaText = `${node.type} · orphan`
      } else if (!isInSubgraph) {
        metaText = `${node.type} · unexplored`
      } else {
        metaText = `${node.type} · ${node.val - 1}`
      }
      info.createDiv({ text: metaText, cls: 'nrlcmp-row-meta' })
      info.onclick = () => {
        if (isInSubgraph) {
          this.searchNode(node.id)
        } else {
          // Unexplored or orphan — load as new root to reveal connections
          this.currentRootLabel = node.id
          if (this.graphContainer) void this.render(this.graphContainer)
        }
      }
    })

    if (this.filteredNodes.length > VISIBLE_LIMIT) {
      this.sidebarListEl.createDiv({
        text: `...and ${this.filteredNodes.length - VISIBLE_LIMIT} more. Use search to filter.`,
        cls: 'nrlcmp-list-more',
      })
    }
  }

  mergeSelectedNodes() {
    const targets = Array.from(this.selectedNodes)
    if (targets.length < 2) {
      new Notice('Select 2+ nodes')
      return
    }

    new MergeSelectionModal(
      this.plugin.app,
      targets,
      async (targetNode: string, sourceNodes: string[]) => {
        new Notice(`Merging into ${targetNode}...`)
        try {
          const response = await requestUrl({
            url: `${this.plugin.settings.lightRagServerUrl}/graph/entities/merge`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(this.plugin.settings.lightRagApiKey
                ? {
                    'X-API-Key': this.plugin.settings.lightRagApiKey,
                  }
                : {}),
            },
            body: JSON.stringify({
              entity_to_change_into: targetNode,
              entities_to_change: sourceNodes,
            }),
          })

          if (response.status === 200) {
            new Notice('Merged!')
            this.selectedNodes.clear()
            setTimeout(() => {
              const container = this.contentEl.querySelector('#sigma-container')
              if (container instanceof HTMLElement) void this.render(container)
            }, 1000)
          } else {
            new Notice(`Error: ${response.text}`)
          }
        } catch (e) {
          console.error(e)
          new Notice('API error')
        }
      },
    ).open()
  }

  deleteSelectedNodes() {
    const targets = Array.from(this.selectedNodes)
    if (targets.length === 0) return

    new ConfirmationModal(
      this.plugin.app,
      `Delete ${targets.length} nodes?`,
      async () => {
        try {
          for (const entity of targets) {
            await requestUrl({
              url: `${this.plugin.settings.lightRagServerUrl}/documents/delete_entity`,
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
                ...(this.plugin.settings.lightRagApiKey
                  ? {
                      'X-API-Key': this.plugin.settings.lightRagApiKey,
                    }
                  : {}),
              },
              body: JSON.stringify({ entity_name: entity }),
            })
          }
          new Notice('Deleted!')
          this.selectedNodes.clear()
          setTimeout(() => {
            const container = this.contentEl.querySelector('#sigma-container')
            if (container instanceof HTMLElement) void this.render(container)
          }, 1000)
        } catch (e) {
          console.error(e)
          new Notice('Error deleting nodes')
        }
      },
    ).open()
  }

  searchNode(query: string) {
    if (!query) return
    const lower = query.toLowerCase()

    if (this.plugin.settings.graphViewMode === '3d' && this.graph3D) {
      // Fix 3: Use safe casting to Getter interface to access graph data without 'any'
      const graphData = (
        this.graph3D as unknown as ForceGraph3DGetter
      ).graphData()
      const nodes = graphData?.nodes || []

      // Fix 4: Explicit type for 'n' to avoid implicit any
      const target = nodes.find((n: GraphNode) =>
        n.id.toLowerCase().includes(lower),
      )
      if (target) {
        this.showNodeDetails(target)
        const dist = 40
        const ratio =
          1 + dist / Math.hypot(target.x || 0, target.y || 0, target.z || 0)
        if (this.graph3D) {
          this.graph3D.cameraPosition(
            {
              x: (target.x || 0) * ratio,
              y: (target.y || 0) * ratio,
              z: (target.z || 0) * ratio,
            },
            target,
            2000,
          )
        }
      } else {
        new Notice('Node not found')
      }
    } else if (this.sigmaInstance && this.graph) {
      const target = this.graph
        .nodes()
        .find((n) => n.toLowerCase().includes(lower))
      if (target) {
        this.focusOnNode2D(target)
        new Notice(`Found: ${target}`)
      } else {
        new Notice('Node not found')
      }
    }
  }

  // Removed async as it doesn't await anything critical before opening modal
  createRelationBetweenSelected() {
    const targets = Array.from(this.selectedNodes)
    if (targets.length < 2) {
      new Notice('Select at least 2 nodes to link.')
      return
    }

    new CreateRelationModal(
      this.app,
      targets,
      // Acción: Enviar a la API
      async (data) => {
        for (const target of data.targets) {
          try {
            await requestUrl({
              url: `${this.plugin.settings.lightRagServerUrl}/graph/relation/create`,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(this.plugin.settings.lightRagApiKey
                  ? {
                      'X-API-Key': this.plugin.settings.lightRagApiKey,
                    }
                  : {}),
              },
              body: JSON.stringify({
                source_entity: data.source,
                target_entity: target,
                relation_data: {
                  description: data.description,
                  keywords: data.keywords,
                  weight: 1.0,
                },
              }),
            })
          } catch (e) {
            console.error(e)
          }
        }
        new Notice(`Created ${data.targets.length} relationships.`)
        this.selectedNodes.clear()
        // Recargar grafo para ver las nuevas líneas
        setTimeout(() => {
          void this.render(
            this.contentEl.querySelector('#sigma-container') as HTMLElement,
          )
        }, 1000)
      },
      // Acción: Sugerencia AI
      async (source, targets) => {
        const targetLang =
          this.plugin.settings.lightRagSummaryLanguage || 'English'
        const prompt = `Act as a Knowledge Graph Architect. 
              The user wants to connect the node "${source}" with the following nodes: ${targets.join(', ')}.
              Write a ONE-SENTENCE description in the language of the notes (${targetLang}) that explains a logical connection between these concepts. 
              Be concise and technical. Output ONLY the sentence.`

        return await this.plugin.simpleLLMCall(prompt)
      },
    ).open()
  }
}

// Helper: Safe Confirmation Modal
class ConfirmationModal extends Modal {
  constructor(
    app: App,
    private message: string,
    private onConfirm: () => Promise<void> | void,
  ) {
    super(app)
  }

  onOpen() {
    const { contentEl } = this
    contentEl.createEl('h2', { text: 'Confirm action' })
    contentEl.createDiv({ text: this.message, cls: 'nrlcmp-confirm-msg' })

    const btnContainer = contentEl.createDiv({ cls: 'nrlcmp-modal-btns' })

    new ButtonComponent(btnContainer)
      .setButtonText('Cancel')
      .onClick(() => this.close())

    new ButtonComponent(btnContainer)
      .setButtonText('Confirm')
      .setWarning()
      .onClick(() => {
        void (async () => {
          await this.onConfirm()
          this.close()
        })()
      })
  }

  onClose() {
    this.contentEl.empty()
  }
}
