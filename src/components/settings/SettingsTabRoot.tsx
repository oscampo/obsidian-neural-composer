import { App } from 'obsidian'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { useSettings } from '../../contexts/settings-context'
import NeuralComposerPlugin from '../../main'
import {
  BrainCircuit,
  CircleHelp,
  Cpu,
  KeyRound,
  MessageSquare,
  Settings2,
  Share2,
  Wrench,
} from '../../utils/icons'

import { ChatSection } from './sections/ChatSection'
import { HelpSection } from './sections/HelpSection'
import { McpSection } from './sections/McpSection'
import { ModelsSection } from './sections/ModelsSection'
import { NeuralSection } from './sections/NeuralSection'
import { ProvidersSection } from './sections/ProvidersSection'
import { ServerActionsSection } from './sections/ServerActionsSection'
import { TemplateSection } from './sections/TemplateSection'

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type TabId =
  | 'providers'
  | 'models'
  | 'chat'
  | 'graph'
  | 'tools'
  | 'advanced'
  | 'help'

interface TabDef {
  id: TabId
  label: string
  Icon: React.FC<{ size?: number; strokeWidth?: number }>
}

const TABS: TabDef[] = [
  { id: 'providers', label: 'Providers', Icon: KeyRound },
  { id: 'models', label: 'Models', Icon: Cpu },
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
  { id: 'graph', label: 'Graph & Vault', Icon: Share2 },
  { id: 'tools', label: 'Tools (MCP)', Icon: Wrench },
  { id: 'advanced', label: 'Advanced', Icon: Settings2 },
  { id: 'help', label: 'Help', Icon: CircleHelp },
]

const LS_KEY = 'neural-composer-settings-active-tab'

// ---------------------------------------------------------------------------
// Brand logo tile — violet rounded square with brain-circuit glyph inside
// ---------------------------------------------------------------------------

function BrainLogoTile({ size = 36 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        background: 'var(--interactive-accent)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow:
          '0 1px 0 rgba(255,255,255,0.08) inset, 0 4px 14px rgba(0,0,0,0.28)',
        flexShrink: 0,
      }}
    >
      <BrainCircuit
        size={Math.round(size * 0.6)}
        color="#fff"
        strokeWidth={2}
      />
    </div>
  )
}

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

function ProviderChip({
  modelId,
  size = 22,
}: {
  modelId: string
  size?: number
}) {
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
// Command bar
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
      <div style={{ textAlign: 'left' }}>
        <div
          style={{
            color: 'var(--text-faint)',
            fontSize: 9.5,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-monospace)',
            fontSize: 11.5,
            color: 'var(--text-normal)',
            marginTop: 2,
            lineHeight: 1,
          }}
        >
          {short}
        </div>
      </div>
      {/* chevron-down */}
      <svg
        width={11}
        height={11}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: 'var(--text-faint)', marginLeft: 2, flexShrink: 0 }}
        aria-hidden="true"
      >
        <path d="M4 6l4 4 4-4" />
      </svg>
    </button>
  )
}

function CommandBar({ onModelsClick }: { onModelsClick: () => void }) {
  const { settings } = useSettings()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 16px',
        height: 52,
        flexShrink: 0,
        background: 'var(--background-secondary)',
        borderBottom: '1px solid var(--background-modifier-border)',
      }}
    >
      {/* small fixed spacer — keeps pills away from rail edge */}
      <div style={{ flex: '0 0 8px' }} />

      <QuickSlot
        label="Chat"
        modelId={settings.chatModelId}
        onClick={onModelsClick}
      />
      <QuickSlot
        label="Apply"
        modelId={settings.applyModelId}
        onClick={onModelsClick}
      />
      <QuickSlot
        label="Embed"
        modelId={settings.embeddingModelId}
        onClick={onModelsClick}
      />

      {/* flex spacer so Support button is right-aligned */}
      <div style={{ flex: 1 }} />

      {/* Ko-fi support button */}
      <button
        onClick={() => window.open('https://ko-fi.com/oscampo', '_blank')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 12px',
          borderRadius: 999,
          background: 'rgba(255,94,91,0.12)',
          color: '#FF5E5B',
          fontSize: 11.5,
          fontWeight: 600,
          border: '1px solid rgba(255,94,91,0.25)',
          cursor: 'pointer',
          flexShrink: 0,
          letterSpacing: '0.01em',
        }}
        title="Support Neural Composer on Ko-fi"
      >
        ☕ Support
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab content
// ---------------------------------------------------------------------------

const EYEBROW: React.CSSProperties = {
  color: 'var(--text-faint)',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontWeight: 600,
}

const H1: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 26,
  fontWeight: 700,
  color: 'var(--text-normal)',
  letterSpacing: '-0.02em',
  lineHeight: 1.2,
  padding: 0,
  border: 'none',
}

function TabHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={EYEBROW}>Configuración</div>
      <h1 style={H1}>
        {title}
        {sub && (
          <span
            style={{
              color: 'var(--text-muted)',
              fontWeight: 500,
              fontSize: 20,
            }}
          >
            {' '}
            {sub}
          </span>
        )}
      </h1>
    </div>
  )
}

function TabContent({
  activeTab,
  app,
  plugin,
}: {
  activeTab: TabId
  app: App
  plugin: NeuralComposerPlugin
}) {
  const wrap = (
    title: string,
    children: React.ReactNode,
    sub?: string,
  ) => (
    <div className="nc-tab-content">
      <TabHeader title={title} sub={sub} />
      {children}
    </div>
  )

  switch (activeTab) {
    case 'providers':
      return wrap('Providers', <ProvidersSection app={app} plugin={plugin} />)
    case 'models':
      return wrap('Models', <ModelsSection app={app} plugin={plugin} />)
    case 'chat':
      return wrap(
        'Chat',
        <>
          <ChatSection />
          <TemplateSection app={app} />
        </>,
      )
    case 'graph':
      return wrap('Graph & Vault', <NeuralSection plugin={plugin} />)
    case 'tools':
      return wrap('Tools', <McpSection app={app} plugin={plugin} />, '· MCP')
    case 'advanced':
      return wrap(
        'Advanced',
        <ServerActionsSection app={app} plugin={plugin} />,
      )
    case 'help':
      return (
        <div className="nc-tab-content">
          <TabHeader title="Help" />
          <HelpSection app={app} plugin={plugin} />
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

  // Strip Obsidian's default containerEl padding so the layout fills the pane
  useEffect(() => {
    const host = rootRef.current?.closest<HTMLElement>('.vertical-tab-content')
    if (host) {
      host.classList.add('nc-settings-host')
      return () => host.classList.remove('nc-settings-host')
    }
  }, [])

  return (
    <div
      ref={rootRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        minHeight: 520,
        background: 'var(--background-primary)',
        fontFamily: 'var(--font-interface)',
      }}
    >
      {/* ── Icon nav rail ─────────────────────────────────────────────── */}
      <div
        style={{
          width: 56,
          flexShrink: 0,
          background: 'var(--background-secondary-alt)',
          borderRight: '1px solid var(--background-modifier-border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '12px 0',
          gap: 2,
        }}
      >
        {/* Brand logo tile */}
        <div style={{ marginBottom: 12 }}>
          <BrainLogoTile size={36} />
        </div>

        {/* All 7 tab buttons in order */}
        {TABS.map(({ id, label, Icon }) => {
          const sel = activeTab === id
          return (
            <button
              key={id}
              onClick={() => switchTab(id)}
              title={label}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                border: 'none',
                // Active → filled accent square + white icon (same as BrainLogoTile)
                // Inactive → transparent bg + accent-coloured icon
                background: sel ? 'var(--interactive-accent)' : 'transparent',
                color: sel ? '#ffffff' : 'var(--interactive-accent)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                transition: 'background 0.12s, color 0.12s',
                boxShadow: sel
                  ? '0 1px 0 rgba(255,255,255,0.08) inset, 0 4px 14px rgba(0,0,0,0.28)'
                  : 'none',
                padding: 0,
              }}
            >
              <Icon size={15} strokeWidth={1.75} />
            </button>
          )
        })}
      </div>

      {/* ── Right side: command bar + scrollable content ───────────────── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <CommandBar onModelsClick={() => switchTab('models')} />

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <TabContent activeTab={activeTab} app={app} plugin={plugin} />
        </div>
      </div>
    </div>
  )
}
