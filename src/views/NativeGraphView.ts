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
    App 
} from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import Graph from 'graphology';
import Sigma from 'sigma';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import FA2Layout from 'graphology-layout-forceatlas2/worker'; 
import ForceGraph3D from '3d-force-graph'; 
import { MergeSelectionModal } from '../components/modals/MergeSelectionModal';
// Use type import to avoid circular dependency values but get the type
import type NeuralComposerPlugin from '../main';

import { CreateRelationModal } from '../components/modals/CreateRelationModal';

export const NATIVE_GRAPH_VIEW_TYPE = 'neural-native-graph';

// --- Interfaces for Strict Typing ---
interface GraphNode {
    id: string;
    type: string;
    desc: string;
    source_id: string;
    val: number; 
    degree?: number;
    file_paths?: string[];
    // For 3D graph coords
    x?: number;
    y?: number;
    z?: number;
    // Fix: Added optional property to match usage in showNodeDetails
    node_type?: string; 
}

interface ChunkDocMap {
    full_doc_id?: string;
    [key: string]: unknown;
}

interface DocNameMap {
    file_name?: string;
    id?: string;
    [key: string]: unknown;
}

interface GraphMLAttribute {
    id: string;
    "attr.name"?: string;
}

interface GraphMLNodeData {
    key: string;
    value: string | number;
}

interface GraphMLRawNode {
    id: string;
    data?: GraphMLNodeData[] | GraphMLNodeData;
}

interface GraphMLRawEdge {
    source: string;
    target: string;
    "@_source"?: string;
    "@_target"?: string;
    normalizedSource?: string;
    normalizedTarget?: string;
}

interface GraphMLParsed {
    graphml?: {
        key?: GraphMLAttribute | GraphMLAttribute[];
        graph?: {
            node?: GraphMLRawNode | GraphMLRawNode[];
            edge?: GraphMLRawEdge | GraphMLRawEdge[];
        }
    }
}

// Interfaces for external untyped libraries
interface FA2LayoutInstance {
    start: () => void;
    stop: () => void;
    isRunning: () => boolean;
    kill: () => void;
}


// Helper interface for links inside the 3D graph
interface GraphLink {
    source: string;
    target: string;
}

// Fix 1: Improved typing for 3d-force-graph replacing 'any' with GraphNode/GraphLink
interface ForceGraph3DInstance {
    (element: HTMLElement): ForceGraph3DInstance;
    // Fix [8, 9]: Typed nodes and links instead of any[]
    graphData(data: { nodes: GraphNode[]; links: GraphLink[] }): ForceGraph3DInstance;
    backgroundColor(color: string): ForceGraph3DInstance;
    nodeAutoColorBy(attr: string): ForceGraph3DInstance;
    nodeVal(attr: string): ForceGraph3DInstance;
    nodeRelSize(size: number): ForceGraph3DInstance;
    nodeLabel(attr: string): ForceGraph3DInstance;
    nodeOpacity(opacity: number): ForceGraph3DInstance;
    linkWidth(width: number): ForceGraph3DInstance;
    linkOpacity(opacity: number): ForceGraph3DInstance;
    cooldownTicks(ticks: number): ForceGraph3DInstance;
    // Fix [10]: Callback receives a GraphNode, not any
    onNodeClick(callback: (node: GraphNode) => void): ForceGraph3DInstance;
    width(width: number): ForceGraph3DInstance;
    height(height: number): ForceGraph3DInstance;
    // Fix [11]: lookAt expects a GraphNode (or coordinates), avoiding any
    cameraPosition(pos: {x: number, y: number, z: number}, lookAt?: GraphNode, ms?: number): ForceGraph3DInstance;
    zoomToFit(ms: number, padding: number): ForceGraph3DInstance;
    _destructor(): void;
}

// Fix [12]: Interface for Getter usage ensuring strict return types
interface ForceGraph3DGetter {
    graphData(): { nodes: GraphNode[]; links: GraphLink[] };
}

export class NativeGraphView extends ItemView {
  private plugin: NeuralComposerPlugin; 
  private graphDataPath: string;
  private workDir: string;
  
  private sigmaInstance: Sigma | null = null;
  private fa2Layout: FA2LayoutInstance | null = null;
  private graph3D: ForceGraph3DInstance | null = null;
  
  private graph: Graph | null = null;
  private chunkToDocMap: Record<string, ChunkDocMap> = {};
  private docToNameMap: Record<string, DocNameMap> = {};

  private detailsPanel: HTMLElement | null = null;
  private sidebarListEl: HTMLElement | null = null;
  private searchInputEl: HTMLInputElement | null = null;
  private sortBtnEl: HTMLElement | null = null;
  
  private selectedNodes: Set<string> = new Set();
  private sortAscending: boolean = false;
  private allNodes: GraphNode[] = [];
  private filteredNodes: GraphNode[] = [];
  private focusedNode: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: NeuralComposerPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.workDir = plugin.settings.lightRagWorkDir;
    this.graphDataPath = path.join(this.workDir, 'graph_chunk_entity_relation.graphml');
  }

  getViewType() { return NATIVE_GRAPH_VIEW_TYPE; }
  getDisplayText() { return 'Neural manager'; }
  getIcon() { return 'brain-circuit'; }

  async onOpen() {
    await super.onOpen();

    const container = this.contentEl;
    container.empty();
    
    container.addClass('nrlcmp-graph-view'); 
    
    const is3D = this.plugin.settings.graphViewMode === '3d';
    container.addClass(is3D ? 'nrlcmp-mode-3d' : 'nrlcmp-mode-2d');

    // SYNC CALL
    this.loadReferenceMaps();

    // LEFT ZONE (Graph)
    const graphZone = container.createDiv({ cls: 'nrlcmp-graph-zone' });
    
    const graphContainer = graphZone.createDiv({ cls: 'nrlcmp-sigma-container' });
    graphContainer.id = 'sigma-container';
    
    this.createGraphToolbar(graphZone, graphContainer);
    this.createDetailsPanel(graphZone);

    // RIGHT ZONE (Sidebar)
    const sidebar = container.createDiv({ cls: 'nrlcmp-sidebar' });
    this.buildSidebar(sidebar);

    // Initial render - SYNC call inside timeout
    window.setTimeout(() => { 
        try {
            // Fix: Void for potential floating promise
            void this.render(graphContainer);
        } catch (err) {
            console.error("Render failed:", err);
        }
    }, 100);
  }

  // Fix: Removed async (no await). Returns Promise to match interface.
  onClose(): Promise<void> {
      this.cleanup();
      return Promise.resolve();
  }

  // --- DATA LOGIC ---
  loadReferenceMaps() {
      try {
          const chunksPath = path.join(this.workDir, 'kv_store_text_chunks.json');
          const docsPath = path.join(this.workDir, 'kv_store_doc_status.json');
          
          if (fs.existsSync(chunksPath)) {
              const content = fs.readFileSync(chunksPath, 'utf-8');
              this.chunkToDocMap = JSON.parse(content);
          }
          if (fs.existsSync(docsPath)) {
              const content = fs.readFileSync(docsPath, 'utf-8');
              this.docToNameMap = JSON.parse(content);
          }
      } catch (e) { 
          console.error("Error loading maps", e); 
          new Notice("Failed to load graph reference maps.");
      }
  }

  getFilenames(sourceIds: string): string[] {
      if (!sourceIds) return [];
      const chunks = sourceIds.split(new RegExp('<SEP>|,')).map(s => s.trim().replace(/['"[\]]/g, '')).filter(Boolean);
      const fileNames = new Set<string>();
      chunks.forEach(chunkId => {
          const chunkData = this.chunkToDocMap[chunkId];
          if (chunkData && chunkData.full_doc_id) {
              const docID = String(chunkData.full_doc_id);
              const docData = this.docToNameMap[docID];
              if (docData) fileNames.add(docData.file_name || docData.id || "Unknown");
          }
      });
      return Array.from(fileNames);
  }

  // --- MAIN RENDER ---
  render(container: HTMLElement, label?: HTMLElement) {
    this.cleanup();
    container.empty();

    if (!fs.existsSync(this.graphDataPath)) {
        if(label) label.setText("No data");
        return;
    }

    try {
        const xmlData = fs.readFileSync(this.graphDataPath, 'utf-8');
        
        const parser = new XMLParser({ 
            ignoreAttributes: false, 
            attributeNamePrefix: "", 
            textNodeName: "value" 
        });
        const jsonObj: GraphMLParsed = parser.parse(xmlData);
        
        if (!jsonObj.graphml) throw new Error("Invalid GraphML format");

        const keysRaw = jsonObj.graphml.key || [];
        const keys = Array.isArray(keysRaw) ? keysRaw : [keysRaw];
        
        const keyMap: Record<string, string> = {};
        keys.forEach((k) => { 
            if (k['attr.name']) keyMap[k['id']] = k['attr.name']; 
        });

        const graphEl = jsonObj.graphml.graph || {};
        const rawNodes = Array.isArray(graphEl.node) ? graphEl.node : (graphEl.node ? [graphEl.node] : []);
        const rawEdges = Array.isArray(graphEl.edge) ? graphEl.edge : (graphEl.edge ? [graphEl.edge] : []);

        const nodeDegrees = new Map<string, number>();
        rawEdges.forEach((e) => {
            const src = e.source || e['@_source'] || '';
            const tgt = e.target || e['@_target'] || '';
            if (src && tgt) {
                nodeDegrees.set(src, (nodeDegrees.get(src) || 0) + 1);
                nodeDegrees.set(tgt, (nodeDegrees.get(tgt) || 0) + 1);
            }
        });

        this.allNodes = rawNodes
            .filter((n) => {
                if (n.id.startsWith('chunk-') || n.id.startsWith('doc-')) return false;
                if (n.id.length > 50 && !n.id.includes(' ')) return false;
                return true;
            })
            .map((n) => {
                let type = "Concept"; let desc = ""; let files: string[] = [];
                const dataArr = Array.isArray(n.data) ? n.data : (n.data ? [n.data] : []);
                
                dataArr.forEach((d) => { 
                    const mappedKey = keyMap[d.key] || d.key;
                    if (mappedKey === "entity_type" || d.key === "d0") type = String(d.value);
                    if (mappedKey === "description" || d.key === "d1") desc = String(d.value);
                    
                    if (mappedKey === "file_path" || mappedKey === "source_id") {
                         const val = String(d.value);
                         if (val.includes('.md') || val.includes('.pdf') || val.includes('.txt')) {
                             files = val.split('<SEP>').filter(s => s.trim().length > 0);
                         }
                    }
                });

                return {
                    id: n.id,
                    type: type,
                    desc: desc,
                    source_id: "", 
                    file_paths: files, 
                    val: (nodeDegrees.get(n.id) || 0) + 1
                };
            });
        
        const validNodeIds = new Set(this.allNodes.map(n => n.id));
        const validEdges = rawEdges.filter((e) => {
            const src = e.source || e['@_source'];
            const tgt = e.target || e['@_target'];
            if (src && tgt && validNodeIds.has(src) && validNodeIds.has(tgt)) {
                e.normalizedSource = src;
                e.normalizedTarget = tgt;
                return true;
            }
            return false;
        });

        this.allNodes.sort((a, b) => b.val - a.val);
        this.filteredNodes = this.allNodes;
        this.updateSidebarList();

        const mode = this.plugin.settings.graphViewMode;
        if(label) label.setText(`${this.allNodes.length} nodes | ${validEdges.length} links | ${mode.toUpperCase()}`);

        if (mode === '3d') {
            this.render3D(container, this.allNodes, validEdges);
        } else {
            this.render2D(container, this.allNodes, validEdges);
        }

    } catch (e) { 
        console.error("Graph render error:", e);
        new Notice("Failed to render graph. Check console.");
    }
  }

  // --- HELPER 2D ---
  focusOnNode2D(nodeId: string) {
      if (!this.graph || !this.sigmaInstance) return;

      if (this.fa2Layout && this.fa2Layout.isRunning()) {
          this.fa2Layout.stop();
      }

      const attrs = this.graph.getNodeAttributes(nodeId);
      const visualData = this.sigmaInstance.getNodeDisplayData(nodeId);
      if (!attrs) return;

      let targetX = attrs.x;
      let targetY = attrs.y;
      if (visualData && typeof visualData.x === 'number' && !isNaN(visualData.x)) {
          targetX = visualData.x; targetY = visualData.y;
      }

      void this.sigmaInstance.getCamera().animate({ x: targetX, y: targetY, ratio: 0.15, angle: 0 }, { duration: 1500, easing: 'cubicInOut' });

      // All nodes keep their base_color
      this.graph.forEachNode(n => {
          const a = this.graph?.getNodeAttributes(n);
          this.graph?.setNodeAttribute(n, 'color', a?.base_color || '#00d4ff');
          this.graph?.setNodeAttribute(n, 'label', '');
          this.graph?.setNodeAttribute(n, 'zIndex', 0);
      });
      this.graph.forEachEdge(e => this.graph?.setEdgeAttribute(e, 'hidden', true));

      // Neighbors keep base_color, get label
      this.graph.forEachNeighbor(nodeId, n => {
          const a = this.graph?.getNodeAttributes(n);
          this.graph?.setNodeAttribute(n, 'color', a?.base_color || '#00d4ff');
          this.graph?.setNodeAttribute(n, 'label', n);
          this.graph?.setNodeAttribute(n, 'zIndex', 1);
      });

      // Edges turn red
      this.graph.forEachEdge(nodeId, e => {
          this.graph?.setEdgeAttribute(e, 'hidden', false);
          this.graph?.setEdgeAttribute(e, 'color', '#ff0055');
          this.graph?.setEdgeAttribute(e, 'size', 2);
      });

      // Focused node — keep base_color, persist shadow ring
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sigma = this.sigmaInstance as any;
      if (this.focusedNode) sigma.highlightedNodes.delete(this.focusedNode);
      this.focusedNode = nodeId;
      sigma.highlightedNodes.add(nodeId);
      sigma.scheduleHighlightedNodesRender();

      this.graph.setNodeAttribute(nodeId, 'color', attrs.base_color || '#00d4ff');
      this.graph.setNodeAttribute(nodeId, 'label', nodeId);
      this.graph.setNodeAttribute(nodeId, 'zIndex', 10);
      this.graph.setNodeAttribute(nodeId, 'size', (visualData?.size || attrs.size || 5) * 1.5);

      this.showNodeDetails({
          id: nodeId,
          ...attrs,
          type: attrs.node_type || attrs.type
      } as unknown as GraphNode);
  }

  // --- ENGINE 2D ---
  render2D(container: HTMLElement, nodes: GraphNode[], edges: GraphMLRawEdge[]) {
    this.graph = new Graph();
    const LABEL_THRESHOLD = 4;

    const typeColor = (t: string): string => {
        let h = 5381;
        for (const ch of String(t || 'unknown').toLowerCase())
            h = ((h * 33) ^ ch.charCodeAt(0)) & 0x7fffffff;
        const hue = h % 360, s = 0.6, l = 0.45;
        const a = s * Math.min(l, 1 - l);
        const f = (n: number) => {
            const k = (n + hue / 30) % 12;
            const v = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * v).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    };

    nodes.forEach(n => {
        if (!this.graph?.hasNode(n.id)) {
            const showLabel = n.val > LABEL_THRESHOLD;
            this.graph?.addNode(n.id, {
                label: showLabel ? n.id : '',
                size: Math.max(3, Math.min(n.val * 1.5, 20)),
                color: typeColor(n.type),
                base_color: typeColor(n.type),
                type: 'circle', 
                node_type: n.type, 
                desc: n.desc,
                file_paths: n.file_paths,
                val: n.val,
                forceLabel: showLabel,
                x: Math.random() * 100, 
                y: Math.random() * 100
            });
        }
    });

    edges.forEach(e => {
        const src = e.normalizedSource || e.source;
        const tgt = e.normalizedTarget || e.target;
        if (this.graph?.hasNode(src) && this.graph?.hasNode(tgt)) {
             if (!this.graph.hasEdge(src, tgt)) {
                 this.graph.addEdge(src, tgt, { color: '#333', size: 0.5, hidden: false });
             }
        }
    });

    const initSigma = () => {
        if (container.clientWidth === 0) { requestAnimationFrame(initSigma); return; }
        if (!this.graph) return;
        if (this.sigmaInstance) this.sigmaInstance.kill();

        this.sigmaInstance = new Sigma(this.graph, container, {
            minCameraRatio: 0.001, maxCameraRatio: 10, renderLabels: true,
            labelFont: "monospace", labelColor: { color: getComputedStyle(container).getPropertyValue('--nrlcmp-graph-label-color').trim() || getComputedStyle(document.body).getPropertyValue('--text-normal').trim() || '#000' }, labelSize: 14, labelWeight: "bold",
            allowInvalidContainer: true, zIndex: true
        });

        const settings = forceAtlas2.inferSettings(this.graph);
        this.fa2Layout = new FA2Layout(this.graph, { settings: { ...settings, gravity: 1, slowDown: 5 } });
        // FIXED: Optional chaining to prevent "Object is possibly null"
        this.fa2Layout?.start();
        
        window.setTimeout(() => { if(this.fa2Layout?.isRunning()) this.fa2Layout.stop(); }, 4000);

        // --- EVENTS ---
        this.sigmaInstance.on("clickNode", (event) => {
            this.focusOnNode2D(event.node);
        });

        this.sigmaInstance.on("enterNode", (event) => {
            this.graph?.setNodeAttribute(event.node, 'label', event.node);
            this.graph?.setNodeAttribute(event.node, 'zIndex', 10);
        });

        this.sigmaInstance.on("leaveNode", (event) => {
            if (event.node === this.focusedNode) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (this.sigmaInstance as any)?.highlightedNodes.add(event.node);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (this.sigmaInstance as any)?.scheduleHighlightedNodesRender();
                return;
            }
            const attrs = this.graph?.getNodeAttributes(event.node);
            if (!attrs) return;
            this.graph?.setNodeAttribute(event.node, 'zIndex', 0);
            if (attrs.forceLabel) {
                this.graph?.setNodeAttribute(event.node, 'label', event.node);
            } else {
                this.graph?.setNodeAttribute(event.node, 'label', '');
            }
        });

        this.sigmaInstance.on("clickStage", () => {
            if (this.focusedNode && this.sigmaInstance) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (this.sigmaInstance as any).highlightedNodes.delete(this.focusedNode);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (this.sigmaInstance as any).scheduleHighlightedNodesRender();
            }
            this.focusedNode = null;
            if (!this.graph) return;
            this.graph.forEachNode((n, a) => {
                this.graph?.setNodeAttribute(n, 'color', a.base_color || '#00d4ff');
                this.graph?.setNodeAttribute(n, 'zIndex', 0);
                this.graph?.setNodeAttribute(n, 'label', a.forceLabel ? n : '');
            });
            this.graph.forEachEdge(e => {
                this.graph?.setEdgeAttribute(e, 'hidden', false);
                this.graph?.setEdgeAttribute(e, 'color', '#333');
            });
            if (this.detailsPanel) this.detailsPanel.removeClass('nrlcmp-visible');
        });

        this.sigmaInstance.on("afterRender", () => {
            if (!this.focusedNode || !this.sigmaInstance) return;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.sigmaInstance as any).highlightedNodes.add(this.focusedNode);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.sigmaInstance as any).scheduleHighlightedNodesRender();
        });
    };
    requestAnimationFrame(initSigma);
  }

  // --- ENGINE 3D ---
  render3D(container: HTMLElement, nodes: GraphNode[], edges: GraphMLRawEdge[]) {
      const gData = {
          nodes: nodes.map(n => ({ ...n, type: n.type })),
          links: edges.map((e) => ({ source: e.normalizedSource || e.source, target: e.normalizedTarget || e.target }))
      };
      
      // Fix: Cast to unknown then to specific function signature
      this.graph3D = (ForceGraph3D as unknown as () => ForceGraph3DInstance)()(container)
          .graphData(gData)
          .backgroundColor('#000005') 
          .nodeAutoColorBy('type')
          .nodeVal('val') .nodeRelSize(4) .nodeLabel('id') .nodeOpacity(0.9)
          .linkWidth(0.6).linkOpacity(0.2).cooldownTicks(100)
          // Fix [16]: Typed callback argument
          .onNodeClick((node: GraphNode) => {
              this.showNodeDetails(node);
              // Safe check for coordinates before using them
              if (typeof node.x === 'number' && typeof node.y === 'number' && typeof node.z === 'number') {
                  const dist = 40;
                  const ratio = 1 + dist/Math.hypot(node.x, node.y, node.z);
                  if (this.graph3D) {
                       this.graph3D.cameraPosition({ x: node.x * ratio, y: node.y * ratio, z: node.z * ratio }, node, 2000);
                  }
              }
          });
      
      this.graph3D?.width(container.clientWidth);
      this.graph3D?.height(container.clientHeight);
  }

  cleanup() {
      if (this.sigmaInstance) { this.sigmaInstance.kill(); this.sigmaInstance = null; }
      if (this.fa2Layout) { this.fa2Layout.stop(); this.fa2Layout = null; }
      if (this.graph3D) { this.graph3D._destructor(); this.graph3D = null; }
  }

  updateSidebarList() {
      if (!this.graph && this.allNodes.length === 0) return;
      this.sortAscending = false;
      this.allNodes.sort((a, b) => b.val - a.val);
      this.filteredNodes = this.allNodes;
      this.renderList();
  }

  createDetailsPanel(container: HTMLElement) {
      this.detailsPanel = container.createDiv({ cls: 'nrlcmp-details-panel' });
  }

// --- UI DETAILS ---
showNodeDetails(node: Partial<GraphNode>) {
    if (!this.detailsPanel) return;
    this.detailsPanel.empty();

    const files = node.file_paths || [];
    const type = node.node_type || node.type || "Unknown";
    const nodeId = node.id || "Unknown"; // Safe fallback
    const desc = node.desc || "No description.";

    // 1. Header
    const header = this.detailsPanel.createDiv({ cls: 'nrlcmp-details-header' });
    const headerColor = (node as any).base_color || (node as any).color || (() => {
        let h = 5381;
        for (const ch of String(type || 'concept').toLowerCase())
            h = ((h * 33) ^ ch.charCodeAt(0)) & 0x7fffffff;
        return `hsl(${h % 360},60%,38%)`;
    })();
    header.style.backgroundColor = headerColor;
    header.createSpan({ text: type.toUpperCase(), cls: 'nrlcmp-details-type' });

    const btnGroup = header.createDiv({ cls: 'nrlcmp-btn-group' });
    const editBtn = btnGroup.createEl("button", { text: "✏️", cls: 'nrlcmp-details-btn-edit' });
    const closeBtn = btnGroup.createEl("button", { text: "✕", cls: 'nrlcmp-details-close' });
    closeBtn.onclick = () => { if (this.detailsPanel) this.detailsPanel.removeClass('nrlcmp-visible'); };

    // 2. Body
    const content = this.detailsPanel.createDiv({ cls: 'nrlcmp-details-body' });

    // View Mode
    const viewMode = content.createDiv();
    viewMode.id = "view-mode";
    viewMode.addClass('nrlcmp-visible');
    
    const meta = viewMode.createDiv({ cls: 'nrlcmp-details-meta' });
    meta.createSpan({ text: "Links: " });
    meta.createEl("b", { text: String(node.val || 0), cls: 'nrlcmp-text-highlight' });

    viewMode.createEl("h2", { text: nodeId, cls: 'nrlcmp-details-title' });

    const descBox = viewMode.createDiv({ cls: 'nrlcmp-details-desc-box' });
    descBox.setText(desc);

    const sourcesSection = viewMode.createDiv({ cls: 'nrlcmp-sources-section' });
    sourcesSection.createEl("h4", { text: "Context sources", cls: 'nrlcmp-sources-title' });
    
    const ul = sourcesSection.createEl("ul", { cls: 'nrlcmp-sources-list' });

    if (files.length > 0) {
        files.forEach((f: string) => {
            const li = ul.createEl("li", { cls: 'nrlcmp-source-item' });
            li.createSpan({ text: "📄", cls: 'nrlcmp-source-icon' });
            li.createSpan({ text: f });
        });
    } else {
        ul.createEl("li", { text: "No explicit source", cls: 'nrlcmp-no-source' });
    }

    // Edit Mode
    const editMode = content.createDiv();
    editMode.id = "edit-mode";
    editMode.addClass('nrlcmp-hidden');
    
    const makeInput = (lbl: string, val: string) => {
        editMode.createEl("label", { text: lbl, cls: 'nrlcmp-edit-label' });
        const i = editMode.createEl("input", { cls: 'nrlcmp-edit-input' });
        i.type = "text"; 
        i.value = val;
        return i;
    };

    const nameInput = makeInput("Name (ID)", nodeId);
    const typeInput = makeInput("Type", type);
    
    editMode.createEl("label", { text: "Description", cls: 'nrlcmp-edit-label' });
    const descInput = editMode.createEl("textarea", { cls: 'nrlcmp-edit-input' });
    descInput.value = desc; 
    descInput.rows = 6;

    const actions = editMode.createDiv({ cls: 'nrlcmp-edit-actions' });
    
    const cancelBtn = new ButtonComponent(actions).setButtonText("Cancel");
    const saveBtn = new ButtonComponent(actions).setButtonText("Save changes");
    saveBtn.setCta();

    // Wiring
    editBtn.onclick = () => { 
        viewMode.removeClass('nrlcmp-visible');
        viewMode.addClass('nrlcmp-hidden');
        
        editMode.removeClass('nrlcmp-hidden');
        editMode.addClass('nrlcmp-visible');
    };
    cancelBtn.buttonEl.onclick = () => { 
        editMode.removeClass('nrlcmp-visible');
        editMode.addClass('nrlcmp-hidden');
        
        viewMode.removeClass('nrlcmp-hidden');
        viewMode.addClass('nrlcmp-visible');
    };
    
    saveBtn.buttonEl.onclick = () => {
        const newName = nameInput.value.trim();
        if(newName && nodeId !== "Unknown") {
            void (async () => {
                await this.updateNode(nodeId, { entity_name: newName, entity_type: typeInput.value.trim(), description: descInput.value.trim() });
                if(this.detailsPanel) this.detailsPanel.removeClass('nrlcmp-visible');
            })();
        }
    };

    this.detailsPanel.addClass('nrlcmp-visible');
  }

  async updateNode(oldName: string, data: Record<string, unknown>) {
      new Notice(`Updating node "${oldName}"...`);
      try {
          const response = await requestUrl({
              url: `${this.plugin.settings.lightRagServerUrl}/graph/entity/edit`,
              method: "POST",
              headers: { "Content-Type": "application/json", ...(this.plugin.settings.lightRagApiKey ? { Authorization: `Bearer ${this.plugin.settings.lightRagApiKey}` } : {}) },
              body: JSON.stringify({ 
                  "entity_name": oldName, 
                  "updated_data": data, 
                  "allow_rename": true, 
                  "allow_merge": true 
              })
          });

          if (response.status === 200) { 
              new Notice("Node updated!"); 
              setTimeout(() => { 
                   const container = this.contentEl.querySelector('#sigma-container');
                   if (container instanceof HTMLElement) void this.render(container);
              }, 1500); 
          } else { 
              new Notice(`Error updating: ${response.text}`); 
          }
      } catch (e) { 
          console.error(e); 
          new Notice("API connection error"); 
      }
  }

  createGraphToolbar(container: HTMLElement, graphContainer: HTMLElement) {
      const tb = container.createDiv({ cls: 'nrlcmp-toolbar' });
      const searchInput = tb.createEl('input', { cls: 'nrlcmp-toolbar-input' });
      searchInput.type = 'text'; 
      searchInput.placeholder = 'Search...';
      
      searchInput.addEventListener('keydown', (e) => { 
          if (e.key === 'Enter') this.searchNode(searchInput.value); 
      });

      const btnReload = tb.createEl('button', { cls: 'nrlcmp-toolbar-btn' });
      setIcon(btnReload, 'refresh-cw'); 
      setTooltip(btnReload, 'Reload graph');
      btnReload.onclick = () => { void this.render(graphContainer); };
      
      const btnReset = tb.createEl('button', { cls: 'nrlcmp-toolbar-btn' });
      setIcon(btnReset, 'maximize'); 
      setTooltip(btnReset, 'Reset camera');
      btnReset.onclick = () => { 
          if (this.graph3D) this.graph3D.zoomToFit(1000, 50); 
          if (this.sigmaInstance) void this.sigmaInstance.getCamera().animate({ x: 0.5, y: 0.5, ratio: 0.1 }, { duration: 500 });
      };
  }

  buildSidebar(container: HTMLElement) {
      const header = container.createDiv({ cls: 'nrlcmp-sidebar-header' });
      header.createEl('h4', { text: 'Node manager' });
      
      const searchInput = new TextComponent(header); 
      searchInput.setPlaceholder('Filter list...'); 
      searchInput.inputEl.addClass('nrlcmp-full-width');
      searchInput.onChange((val) => this.filterList(val)); 
      this.searchInputEl = searchInput.inputEl;

      const actionButtons = header.createDiv({ cls: 'nrlcmp-sidebar-actions' });
      new ButtonComponent(actionButtons).setButtonText('Merge').setCta().onClick(() => { void this.mergeSelectedNodes(); });
            // NUEVO BOTÓN: CREATE RELATION
      new ButtonComponent(actionButtons)
        .setButtonText('Link')
        .setTooltip('Create relationships between selected nodes')
        // Fix: Removed async keyword
        .onClick(() => { this.createRelationBetweenSelected(); });
      new ButtonComponent(actionButtons).setButtonText('Delete').setWarning().onClick(() => { void this.deleteSelectedNodes(); });

      const filterBar = header.createDiv({ cls: 'nrlcmp-sidebar-filters' });
      this.sortBtnEl = filterBar.createEl('span', { text: 'Sort: degree ⬇', cls: 'nrlcmp-sort-btn' });
      this.sortBtnEl.onclick = () => this.toggleSort();
      
      const orphansBtn = filterBar.createEl('span', { text: 'Show orphans', cls: 'nrlcmp-orphans-btn' });
      setTooltip(orphansBtn, 'Show disconnected nodes');
      orphansBtn.onclick = () => this.filterOrphans();

      
      this.sidebarListEl = container.createDiv({ cls: 'nrlcmp-sidebar-list' });
  }

  toggleSort() { 
      this.sortAscending = !this.sortAscending; 
      // Fix: Sentence case "Sort: degree"
      if (this.sortBtnEl) this.sortBtnEl.textContent = `Sort: degree ${this.sortAscending ? '⬆' : '⬇'}`; 
      this.filteredNodes.sort((a, b) => this.sortAscending ? a.val - b.val : b.val - a.val); 
      this.renderList(); 
  }
  
  filterOrphans() { 
      if (this.searchInputEl) this.searchInputEl.value = ''; 
      this.filteredNodes = this.allNodes.filter(n => n.val === 1); 
      this.renderList(); 
  }
  
  filterList(query: string) { 
      if (!query) { this.filteredNodes = this.allNodes; } 
      else { const q = query.toLowerCase(); this.filteredNodes = this.allNodes.filter(n => n.id.toLowerCase().includes(q)); } 
      this.renderList(); 
  }
  
  renderList() {
      if (!this.sidebarListEl) return;
      this.sidebarListEl.empty();
      const visibleNodes = this.filteredNodes.slice(0, 50);
      
      visibleNodes.forEach(node => {
          const row = this.sidebarListEl!.createDiv({ cls: 'nrlcmp-sidebar-row' });
          const cb = row.createEl('input', { type: 'checkbox' });
          cb.checked = this.selectedNodes.has(node.id);
          cb.onclick = (e) => { e.stopPropagation(); if (cb.checked) this.selectedNodes.add(node.id); else this.selectedNodes.delete(node.id); };
          
          const info = row.createDiv({ cls: 'nrlcmp-row-info' });
          info.createDiv({ text: node.id, cls: 'nrlcmp-row-title' });
          const degree = node.val > 0 ? node.val - 1 : 0;
          info.createDiv({ text: `${node.type} (${degree})`, cls: 'nrlcmp-row-meta' });
          info.onclick = () => this.searchNode(node.id); 
      });
      
      if (this.filteredNodes.length > 100) {
          this.sidebarListEl.createDiv({ text: `...and ${this.filteredNodes.length - 100} more.`, cls: 'nrlcmp-list-more' });
      }
  }
  
  mergeSelectedNodes() {
      const targets = Array.from(this.selectedNodes);
      if (targets.length < 2) { new Notice("Select 2+ nodes"); return; }
      
      new MergeSelectionModal(this.plugin.app, targets, async (targetNode: string, sourceNodes: string[]) => {
          new Notice(`Merging into ${targetNode}...`);
          try {
              const response = await requestUrl({
                  url: `${this.plugin.settings.lightRagServerUrl}/graph/entities/merge`,
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...(this.plugin.settings.lightRagApiKey ? { Authorization: `Bearer ${this.plugin.settings.lightRagApiKey}` } : {}) },
                  body: JSON.stringify({ "entity_to_change_into": targetNode, "entities_to_change": sourceNodes })
              });

              if (response.status === 200) { 
                  new Notice("Merged!"); 
                  this.selectedNodes.clear(); 
                  setTimeout(() => { 
                      const container = this.contentEl.querySelector('#sigma-container');
                      if (container instanceof HTMLElement) void this.render(container);
                  }, 1000); 
              } else { 
                  new Notice(`Error: ${response.text}`); 
              }
          } catch (e) { console.error(e); new Notice("API error"); }
      }).open();
  }

  deleteSelectedNodes() {
      const targets = Array.from(this.selectedNodes);
      if (targets.length === 0) return;
      
      new ConfirmationModal(this.plugin.app, `Delete ${targets.length} nodes?`, async () => {
          try {
              for (const entity of targets) {
                  await requestUrl({
                      url: `${this.plugin.settings.lightRagServerUrl}/documents/delete_entity`,
                      method: "DELETE",
                      headers: { "Content-Type": "application/json", ...(this.plugin.settings.lightRagApiKey ? { Authorization: `Bearer ${this.plugin.settings.lightRagApiKey}` } : {}) },
                      body: JSON.stringify({ "entity_name": entity })
                  });
              }
              new Notice("Deleted!"); 
              this.selectedNodes.clear();
              setTimeout(() => { 
                   const container = this.contentEl.querySelector('#sigma-container');
                   if (container instanceof HTMLElement) void this.render(container); 
              }, 1000);
          } catch (e) { console.error(e); new Notice("Error deleting nodes"); }
      }).open();
  }

  searchNode(query: string) {
      if(!query) return;
      const lower = query.toLowerCase();
      
      if (this.plugin.settings.graphViewMode === '3d' && this.graph3D) {
          // Fix 3: Use safe casting to Getter interface to access graph data without 'any'
           const graphData = (this.graph3D as unknown as ForceGraph3DGetter).graphData();
           const nodes = graphData?.nodes || [];
           
          // Fix 4: Explicit type for 'n' to avoid implicit any
          const target = nodes.find((n: GraphNode) => n.id.toLowerCase().includes(lower));
          if (target) {
              this.showNodeDetails(target);
              const dist = 40;
              const ratio = 1 + dist/Math.hypot(target.x || 0, target.y || 0, target.z || 0);
              if (this.graph3D) {
                   this.graph3D.cameraPosition({ x: (target.x || 0) * ratio, y: (target.y || 0) * ratio, z: (target.z || 0) * ratio }, target, 2000);
              }
          } else { new Notice("Node not found"); }
      } 
      else if (this.sigmaInstance && this.graph) {
          const target = this.graph.nodes().find(n => n.toLowerCase().includes(lower));
          if (target) {
              this.focusOnNode2D(target);
              new Notice(`Found: ${target}`);
          } else { new Notice("Node not found"); }
      }
  }

  // Removed async as it doesn't await anything critical before opening modal
  createRelationBetweenSelected() {
      const targets = Array.from(this.selectedNodes);
      if (targets.length < 2) { 
          new Notice("Select at least 2 nodes to link."); 
          return; 
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
                          method: "POST",
                          headers: { "Content-Type": "application/json", ...(this.plugin.settings.lightRagApiKey ? { Authorization: `Bearer ${this.plugin.settings.lightRagApiKey}` } : {}) },
                          body: JSON.stringify({
                              source_entity: data.source,
                              target_entity: target,
                              relation_data: {
                                  description: data.description,
                                  keywords: data.keywords,
                                  weight: 1.0
                              }
                          })
                      });
                  } catch (e) { console.error(e); }
              }
              new Notice(`Created ${data.targets.length} relationships.`);
              this.selectedNodes.clear();
              // Recargar grafo para ver las nuevas líneas
              setTimeout(() => { void this.render(this.contentEl.querySelector('#sigma-container') as HTMLElement); }, 1000);
          },
          // Acción: Sugerencia AI
          async (source, targets) => {
              const targetLang = this.plugin.settings.lightRagSummaryLanguage || 'English';
              const prompt = `Act as a Knowledge Graph Architect. 
              The user wants to connect the node "${source}" with the following nodes: ${targets.join(', ')}.
              Write a ONE-SENTENCE description in the language of the notes (${targetLang}) that explains a logical connection between these concepts. 
              Be concise and technical. Output ONLY the sentence.`;
              
              return await this.plugin.simpleLLMCall(prompt);
          }
      ).open();
  }

}

// Helper: Safe Confirmation Modal
class ConfirmationModal extends Modal {
    constructor(app: App, private message: string, private onConfirm: () => Promise<void> | void) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Confirm action' });
        contentEl.createDiv({ text: this.message, cls: 'nrlcmp-confirm-msg' });

        const btnContainer = contentEl.createDiv({ cls: 'nrlcmp-modal-btns' });
        
        new ButtonComponent(btnContainer)
            .setButtonText('Cancel')
            .onClick(() => this.close());

        new ButtonComponent(btnContainer)
            .setButtonText('Confirm')
            .setWarning()
            .onClick(() => {
                void (async () => {
                    await this.onConfirm();
                    this.close();
                })();
            });
    }

    onClose() {
        this.contentEl.empty();
    }
}