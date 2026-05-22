import {
  Brain,
  ChevronDown,
  Cpu,
  KeyRound,
  MessageSquare,
  Settings2,
  Share2,
  Wrench,
} from '../../utils/icons'
import { App } from 'obsidian'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useSettings } from '../../contexts/settings-context'
import NeuralComposerPlugin from '../../main'

import { ChatSection } from './sections/ChatSection'
import { EtcSection } from './sections/EtcSection'
import { McpSection } from './sections/McpSection'
import { ModelsSection } from './sections/ModelsSection'
import { NeuralSection } from './sections/NeuralSection'
import { ProvidersSection } from './sections/ProvidersSection'
import { TemplateSection } from './sections/TemplateSection'

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type TabId = 'providers' | 'models' | 'chat' | 'graph' | 'tools' | 'advanced'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: 'providers',
    label: 'Providers',
    icon: <KeyRound size={17} strokeWidth={2} />,
  },
  { id: 'models', label: 'Models', icon: <Cpu size={17} strokeWidth={2} /> },
  {
    id: 'chat',
    label: 'Chat',
    icon: <MessageSquare size={17} strokeWidth={2} />,
  },
  {
    id: 'graph',
    label: 'Graph & Vault',
    icon: <Share2 size={17} strokeWidth={2} />,
  },
  {
    id: 'tools',
    label: 'Tools (MCP)',
    icon: <Wrench size={17} strokeWidth={2} />,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: <Settings2 size={17} strokeWidth={2} />,
  },
]

const LS_KEY = 'neural-composer-settings-active-tab'

// ---------------------------------------------------------------------------
// Provider chip helpers
// ---------------------------------------------------------------------------

const PROVIDER_COLORS: Record<string, { bg: string; letter: string }> = {
  anthropic: { bg: '#cd6f47', letter: 'A' },
  openai: { bg: '#0d8c6d', letter: 'O' },
  gemini: { bg: '#4285f4', letter: 'G' },
  google: { bg: '#4285f4', letter: 'G' },
  ollama: { bg: '#3d3d3d', letter: 'O' },
  perplexity: { bg: '#1FB8CD', letter: 'P' },
  deepseek: { bg: '#3056ff', letter: 'D' },
  groq: { bg: '#f55036', letter: 'G' },
  mistral: { bg: '#ff7000', letter: 'M' },
  openrouter: { bg: '#6b7280', letter: 'O' },
  'lm-studio': { bg: '#0ea5e9', letter: 'L' },
  morph: { bg: '#a855f7', letter: 'M' },
}

function resolveChip(modelId: string): { bg: string; letter: string } {
  const lower = modelId.toLowerCase()
  for (const [key, val] of Object.entries(PROVIDER_COLORS)) {
    if (lower.startsWith(key) || lower.includes(key)) return val
  }
  return { bg: '#374151', letter: (modelId[0] ?? '?').toUpperCase() }
}

function ProviderChip({ modelId, size = 22 }: { modelId: string; size?: number }) {
  const { bg, letter } = resolveChip(modelId)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 6,
        background: bg,
        color: '#fff',
        fontSize: Math.round(size * 0.48),
        fontWeight: 700,
        letterSpacing: '-0.02em',
        flexShrink: 0,
      }}
    >
      {letter}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Command bar components
// ---------------------------------------------------------------------------

function QuickSlot({
  label,
  modelId,
  onClick,
}: {
  label: string
  modelId: string
  onClick?: () => void
}) {
  const short = modelId.length > 22 ? modelId.slice(0, 20) + '…' : modelId
  return (
    <button className="nc-quickslot" onClick={onClick} title={modelId}>
      <ProviderChip modelId={modelId} size={20} />
      <span className="nc-quickslot__text">
        <span className="nc-quickslot__label">{label}</span>
        <span className="nc-quickslot__model">{short}</span>
      </span>
      <ChevronDown size={11} className="nc-quickslot__chevron" />
    </button>
  )
}

function CommandBar({
  onChatClick,
  onEmbedClick,
}: {
  onChatClick: () => void
  onEmbedClick: () => void
}) {
  const { settings } = useSettings()

  return (
    <header className="nc-cmdbar">
      <div className="nc-cmdbar__spacer" />
      <QuickSlot label="CHAT" modelId={settings.chatModelId} onClick={onChatClick} />
      <QuickSlot
        label="APPLY"
        modelId={settings.applyModelId}
        onClick={onChatClick}
      />
      <QuickSlot
        label="EMBED"
        modelId={settings.embeddingModelId}
        onClick={onEmbedClick}
      />
      <div className="nc-server-pill">
        <span className="nc-server-pill__dot" />
        LightRAG
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Tab content
// ---------------------------------------------------------------------------

function TabContent({
  activeTab,
  app,
  plugin,
}: {
  activeTab: TabId
  app: App
  plugin: NeuralComposerPlugin
}) {
  switch (activeTab) {
    case 'providers':
      return (
        <div className="nc-tab-content">
          <div className="nc-tab-eyebrow">CONFIGURATION</div>
          <h1 className="nc-tab-h1">Providers</h1>
          <ProvidersSection app={app} plugin={plugin} />
        </div>
      )
    case 'models':
      return (
        <div className="nc-tab-content">
          <div className="nc-tab-eyebrow">CONFIGURATION</div>
          <h1 className="nc-tab-h1">Models</h1>
          <ModelsSection app={app} plugin={plugin} />
        </div>
      )
    case 'chat':
      return (
        <div className="nc-tab-content">
          <div className="nc-tab-eyebrow">CONFIGURATION</div>
          <h1 className="nc-tab-h1">Chat</h1>
          <ChatSection />
          <TemplateSection app={app} />
        </div>
      )
    case 'graph':
      return (
        <div className="nc-tab-content">
          <div className="nc-tab-eyebrow">CONFIGURATION</div>
          <h1 className="nc-tab-h1">Graph & Vault</h1>
          <NeuralSection plugin={plugin} />
        </div>
      )
    case 'tools':
      return (
        <div className="nc-tab-content">
          <div className="nc-tab-eyebrow">CONFIGURATION</div>
          <h1 className="nc-tab-h1">
            Tools <span className="nc-tab-h1-sub">· MCP</span>
          </h1>
          <McpSection app={app} plugin={plugin} />
        </div>
      )
    case 'advanced':
      return (
        <div className="nc-tab-content">
          <div className="nc-tab-eyebrow">CONFIGURATION</div>
          <h1 className="nc-tab-h1">Advanced</h1>
          <EtcSection app={app} plugin={plugin} />
        </div>
      )
  }
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

type SettingsTabRootProps = {
  app: App
  plugin: NeuralComposerPlugin
}

export function SettingsTabRoot({ app, plugin }: SettingsTabRootProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  const [activeTab, setActiveTab] = useState<TabId>(
    () => (localStorage.getItem(LS_KEY) as TabId | null) ?? 'models',
  )

  const switchTab = useCallback((tab: TabId) => {
    setActiveTab(tab)
    localStorage.setItem(LS_KEY, tab)
  }, [])

  // Remove default padding from Obsidian's containerEl so nc-root fills it
  useEffect(() => {
    const host = rootRef.current?.closest<HTMLElement>('.vertical-tab-content')
    if (host) {
      host.classList.add('nc-settings-host')
      return () => host.classList.remove('nc-settings-host')
    }
  }, [])

  return (
    <div className="nc-root" ref={rootRef}>
      {/* Icon nav rail */}
      <aside className="nc-rail">
        <div className="nc-rail__logo">
          <Brain size={22} strokeWidth={2} />
        </div>
        <nav className="nc-rail__nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`nc-rail__tab${activeTab === t.id ? ' is-active' : ''}`}
              title={t.label}
              onClick={() => switchTab(t.id)}
            >
              {t.icon}
              {activeTab === t.id && <span className="nc-rail__active-bar" />}
            </button>
          ))}
        </nav>
      </aside>

      {/* Right side: command bar + scrollable content */}
      <div className="nc-main">
        <CommandBar
          onChatClick={() => switchTab('chat')}
          onEmbedClick={() => switchTab('models')}
        />
        <div className="nc-content">
          <TabContent activeTab={activeTab} app={app} plugin={plugin} />
        </div>
      </div>
    </div>
  )
}
