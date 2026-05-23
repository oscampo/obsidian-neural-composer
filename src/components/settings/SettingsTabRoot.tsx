import { App } from 'obsidian'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { useSettings } from '../../contexts/settings-context'
import NeuralComposerPlugin from '../../main'
import { BrainCircuit } from '../../utils/icons'

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

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'providers', label: 'Providers', icon: 'key' },
  { id: 'models', label: 'Models', icon: 'cpu' },
  { id: 'chat', label: 'Chat', icon: 'msg' },
  { id: 'graph', label: 'Graph & Vault', icon: 'graph' },
  { id: 'tools', label: 'Tools (MCP)', icon: 'wrench' },
  { id: 'advanced', label: 'Advanced', icon: 'gear' },
  // help sits at the bottom of the rail, separated by a spacer
  { id: 'help', label: 'Help', icon: 'help' },
]

const LS_KEY = 'neural-composer-settings-active-tab'

// ---------------------------------------------------------------------------
// Brand logo tile — violet rounded square with brain-circuit glyph inside
// ---------------------------------------------------------------------------

function BrainLogoTile({ size = 40 }: { size?: number }) {
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
// Rail SVG icons — minimal inline paths matching v1/shared.jsx design tokens
// ---------------------------------------------------------------------------

function RailIcon({ name, size = 15 }: { name: string; size?: number }) {
  // 'help' needs both a circle and a path — handle specially
  if (name === 'help') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6" />
        <path d="M6.5 6.3a1.5 1.5 0 1 1 2.25 1.3L8 9.2" />
        <circle cx="8" cy="11.2" r=".6" fill="currentColor" stroke="none" />
      </svg>
    )
  }

  const paths: Record<string, string> = {
    key: 'M10.5 5.5a3 3 0 1 1-1.06 2.31L3 14.25V11l1.25-1.25H7v-2h2v-2L10.5 5.5z',
    cpu: 'M5 5h6v6H5zM3 6.5v3M3 10.5v.5M3 5h.5M13 6.5v3M13 10.5v.5M13 5h-.5M6.5 3v.5M9.5 3v.5M6.5 13v-.5M9.5 13v-.5',
    msg: 'M3 4.5h10v6H8l-3 2.5v-2.5H3z',
    graph:
      'M4 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5.5 9l5-2M5.5 11l5 1',
    wrench:
      'M11.5 4.5a2.5 2.5 0 0 1-3 3l-4.5 4.5L3 11l4.5-4.5a2.5 2.5 0 0 1 3-3l-1.25 1.25.75.75.75.75z',
    gear: 'M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8 2.5v1.5M8 12v1.5M13.5 8H12M4 8H2.5M11.5 4.5L10.5 5.5M5.5 10.5L4.5 11.5M11.5 11.5L10.5 10.5M5.5 5.5L4.5 4.5',
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? ''} />
    </svg>
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
        gap: 10,
        padding: '0 22px',
        height: 52,
        flexShrink: 0,
        background: 'var(--background-secondary)',
        borderBottom: '1px solid var(--background-modifier-border)',
      }}
    >
      {/* spacer pushes slots to the right */}
      <div style={{ flex: 1 }} />

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

      {/* Ko-fi support button */}
      <button
        onClick={() => window.open('https://ko-fi.com/oscampo', '_blank')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 10px',
          borderRadius: 999,
          background: 'rgba(255,94,91,0.12)',
          color: '#FF5E5B',
          fontSize: 11.5,
          fontWeight: 500,
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
        }}
        title="Support Neural Composer on Ko-fi"
      >
        ☕ Ko-fi
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

  // Split tabs: main group (first 6) and bottom help tab
  const mainTabs = TABS.slice(0, 6)
  const bottomTabs = TABS.slice(6)

  return (
    <div
      ref={rootRef}
      style={{
        /* Use absolute positioning so nc-root fills the host container
           regardless of its padding — fixes the left-edge gap */
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
        }}
      >
        {/* Brand logo tile */}
        <div style={{ marginBottom: 12 }}>
          <BrainLogoTile size={36} />
        </div>

        {/* Main tab buttons */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            flex: 1,
          }}
        >
          {mainTabs.map((t) => {
            const sel = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                title={t.label}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  border: 'none',
                  background: sel
                    ? 'color-mix(in srgb, var(--interactive-accent) 16%, transparent)'
                    : 'transparent',
                  color: sel
                    ? 'var(--interactive-accent)'
                    : 'var(--text-faint)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  transition: 'background 0.12s, color 0.12s',
                  boxShadow: 'none',
                  padding: 0,
                }}
              >
                <RailIcon name={t.icon} size={15} />
                {sel && (
                  <span
                    style={{
                      position: 'absolute',
                      left: -6,
                      top: 8,
                      bottom: 8,
                      width: 2.5,
                      background: 'var(--interactive-accent)',
                      borderRadius: 2,
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Bottom: help tab */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          {bottomTabs.map((t) => {
            const sel = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                title={t.label}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  border: 'none',
                  background: sel
                    ? 'color-mix(in srgb, var(--interactive-accent) 16%, transparent)'
                    : 'transparent',
                  color: sel
                    ? 'var(--interactive-accent)'
                    : 'var(--text-faint)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  transition: 'background 0.12s, color 0.12s',
                  boxShadow: 'none',
                  padding: 0,
                }}
              >
                <RailIcon name={t.icon} size={15} />
                {sel && (
                  <span
                    style={{
                      position: 'absolute',
                      left: -6,
                      top: 8,
                      bottom: 8,
                      width: 2.5,
                      background: 'var(--interactive-accent)',
                      borderRadius: 2,
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>
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
