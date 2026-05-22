// Shared data + Obsidian theme tokens for all three variations.

// Obsidian dark theme tokens (default app theme).
const OBSIDIAN_DARK = {
  bgPrimary: '#1e1e1e',
  bgPrimaryAlt: '#181818',
  bgSecondary: '#161616',
  bgSecondaryAlt: '#111111',
  bgModifierHover: 'rgba(255,255,255,0.04)',
  bgModifierBorder: '#2a2a2a',
  bgModifierBorderHover: '#3a3a3a',
  bgModifierFormField: '#1a1a1a',
  textNormal: '#dcddde',
  textMuted: '#a3a3a3',
  textFaint: '#6e6e6e',
  textAccent: '#a78bfa',
  accent: '#7c3aed',
  accentHover: '#8b5cf6',
  accentSoft: 'rgba(124,58,237,0.16)',
  success: '#3fb950',
  successSoft: 'rgba(63,185,80,0.14)',
  warn: '#d29922',
  warnSoft: 'rgba(210,153,34,0.14)',
  danger: '#f85149',
  dangerSoft: 'rgba(248,81,73,0.14)',
};

const OBSIDIAN_LIGHT = {
  bgPrimary: '#ffffff',
  bgPrimaryAlt: '#fafafa',
  bgSecondary: '#f4f4f4',
  bgSecondaryAlt: '#ececec',
  bgModifierHover: 'rgba(0,0,0,0.04)',
  bgModifierBorder: '#e6e6e6',
  bgModifierBorderHover: '#d4d4d4',
  bgModifierFormField: '#ffffff',
  textNormal: '#2a2a2a',
  textMuted: '#5e5e5e',
  textFaint: '#8e8e8e',
  textAccent: '#7c3aed',
  accent: '#7c3aed',
  accentHover: '#8b5cf6',
  accentSoft: 'rgba(124,58,237,0.10)',
  success: '#1f9d4d',
  successSoft: 'rgba(31,157,77,0.10)',
  warn: '#b58900',
  warnSoft: 'rgba(181,137,0,0.12)',
  danger: '#cf222e',
  dangerSoft: 'rgba(207,34,46,0.10)',
};

// Sample data shared by all three mocks.
const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', status: 'connected', keyMasked: 'sk-ant-…7Hq2', icon: 'A' },
  { id: 'openai', name: 'OpenAI', status: 'connected', keyMasked: 'sk-…4kPm', icon: 'O' },
  { id: 'gemini', name: 'Gemini', status: 'connected', keyMasked: 'AIza…9vXc', icon: 'G' },
  { id: 'ollama', name: 'Ollama', status: 'local', keyMasked: 'http://localhost:11434', icon: 'O' },
  { id: 'my-qwen', name: 'My-Qwen', status: 'connected', keyMasked: 'sk-…8Lm3', icon: 'Q', custom: true },
];

const PROVIDER_OPTIONS = ['perplexity', 'deepseek', 'groq', 'mistral', 'openrouter', 'lm-studio', 'morph'];

const CHAT_MODELS = [
  { id: 'claude-opus-4-1', provider: 'anthropic', enabled: false },
  { id: 'claude-sonnet-4.5', provider: 'anthropic', enabled: true, favorite: true },
  { id: 'claude-haiku-4.5', provider: 'anthropic', enabled: true },
  { id: 'gpt-5', provider: 'openai', enabled: false },
  { id: 'gpt-5-mini', provider: 'openai', enabled: false },
  { id: 'gpt-4.1', provider: 'openai', enabled: false },
  { id: 'gpt-4o', provider: 'openai', enabled: true },
  { id: 'gpt-4o-mini', provider: 'openai', enabled: false },
  { id: 'o3', provider: 'openai', enabled: false },
  { id: 'gemini-2.5-pro', provider: 'gemini', enabled: true },
  { id: 'gemini-2.5-flash', provider: 'gemini', enabled: true },
  { id: 'gemini-2.5-flash-lite', provider: 'gemini', enabled: true },
  { id: 'gemini-3-flash-preview', provider: 'gemini', enabled: true, favorite: true },
  { id: 'sonar-pro', provider: 'perplexity', enabled: false },
  { id: 'sonar-reasoning', provider: 'perplexity', enabled: false },
  { id: 'morph-v0', provider: 'morph', enabled: false },
];

const EMBEDDING_MODELS = [
  { id: 'text-embedding-3-small', provider: 'openai', dim: 1536 },
  { id: 'text-embedding-3-large', provider: 'openai', dim: 3072 },
  { id: 'text-embedding-004', provider: 'gemini', dim: 768, active: true },
  { id: 'nomic-embed-text', provider: 'ollama', dim: 768 },
  { id: 'mxbai-embed-large', provider: 'ollama', dim: 1024 },
  { id: 'bge-m3', provider: 'ollama', dim: 1024 },
  { id: 'gemini-embedding-001', provider: 'gemini', dim: 3072 },
];

const TABS = [
  { id: 'providers', label: 'Providers', icon: 'key' },
  { id: 'models', label: 'Models', icon: 'cpu' },
  { id: 'chat', label: 'Chat', icon: 'msg' },
  { id: 'graph', label: 'Graph & Vault', icon: 'graph' },
  { id: 'tools', label: 'Tools (MCP)', icon: 'wrench' },
  { id: 'advanced', label: 'Advanced', icon: 'gear' },
];

// Minimal stroke icons. 16px viewbox. fill=none, stroke=currentColor.
const Icon = ({ name, size = 16 }) => {
  const paths = {
    key: 'M10.5 5.5a3 3 0 1 1-1.06 2.31L3 14.25V11l1.25-1.25H7v-2h2v-2L10.5 5.5z',
    cpu: 'M5 5h6v6H5zM3 6.5v3M3 10.5v.5M3 5h.5M13 6.5v3M13 10.5v.5M13 5h-.5M6.5 3v.5M9.5 3v.5M6.5 13v-.5M9.5 13v-.5',
    msg: 'M3 4.5h10v6H8l-3 2.5v-2.5H3z',
    graph: 'M4 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5.5 9l5-2M5.5 11l5 1',
    wrench: 'M11.5 4.5a2.5 2.5 0 0 1-3 3l-4.5 4.5L3 11l4.5-4.5a2.5 2.5 0 0 1 3-3l-1.25 1.25.75.75.75.75z',
    gear: 'M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8 2.5v1.5M8 12v1.5M13.5 8H12M4 8H2.5M11.5 4.5L10.5 5.5M5.5 10.5L4.5 11.5M11.5 11.5L10.5 10.5M5.5 5.5L4.5 4.5',
    search: 'M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM13.5 13.5L10.5 10.5',
    chevron: 'M6 4l4 4-4 4',
    chevronDown: 'M4 6l4 4 4-4',
    plus: 'M8 3v10M3 8h10',
    check: 'M3.5 8l3 3 6-6',
    x: 'M4 4l8 8M12 4l-8 8',
    dot: '',
    edit: 'M3 13h2l7-7-2-2-7 7zM10 4l2 2',
    trash: 'M4 5h8M6 5V3.5h4V5M5 5l.5 8h5L11 5',
    star: 'M8 2.5l1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 11.3 4.6 13l.7-3.8L2.5 6.5l3.8-.5z',
    bolt: 'M9 2L3 9h4l-1 5 6-7H8z',
    link: 'M9 7l-2 2M7 5l1-1a2.12 2.12 0 0 1 3 3l-1 1M9 11l-1 1a2.12 2.12 0 0 1-3-3l1-1',
    download: 'M8 3v7M5 7.5L8 10.5 11 7.5M3 13h10',
    refresh: 'M13 8a5 5 0 1 1-1.5-3.5L13 6M13 3v3h-3',
    folder: 'M2.5 4.5h4l1 1.5h6v6.5h-11z',
    info: 'M8 5v.5M8 7v4',
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] || ''} />
      {name === 'info' && <circle cx="8" cy="8" r="6" />}
      {name === 'dot' && <circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" />}
    </svg>
  );
};

// Logo for Neural Composer — a simple graph mark.
const NCLogo = ({ size = 28, accent = '#7c3aed' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <circle cx="8" cy="10" r="2.5" fill={accent} />
    <circle cx="24" cy="10" r="2.5" fill={accent} opacity="0.6" />
    <circle cx="16" cy="22" r="2.5" fill={accent} opacity="0.8" />
    <circle cx="6" cy="22" r="1.5" fill={accent} opacity="0.4" />
    <circle cx="26" cy="22" r="1.5" fill={accent} opacity="0.4" />
    <path d="M8 10L16 22L24 10M6 22L16 22L26 22M8 10L24 10" stroke={accent} strokeWidth="1.2" opacity="0.5" />
  </svg>
);

// Brain-circuit icon (Lucide) — actual Neural Composer plugin icon.
const BrainIcon = ({ size = 24, color = 'currentColor', strokeWidth = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke={color} strokeWidth={strokeWidth}
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4.5a2.5 2.5 0 0 0-4.96-.46 2.5 2.5 0 0 0-1.98 3 2.5 2.5 0 0 0-1.32 4.24 3 3 0 0 0 .34 5.58 2.5 2.5 0 0 0 2.96 3.08 2.5 2.5 0 0 0 4.91.05L12 20V4.5Z" />
    <path d="M16 8V5c0-1.1.9-2 2-2" />
    <path d="M12 13h4" />
    <path d="M12 18h6a2 2 0 0 1 2 2v1" />
    <path d="M12 8h8" />
    <circle cx="20" cy="8" r="1.1" fill={color} stroke="none" />
    <circle cx="16" cy="13" r="1.1" fill={color} stroke="none" />
    <circle cx="20" cy="21" r="1.1" fill={color} stroke="none" />
    <circle cx="18" cy="3" r="1.1" fill={color} stroke="none" />
  </svg>
);

// Brain logo "tile" — the actual brand badge: violet rounded-rect with the
// brain glyph centered. Mirrors the plugin's own icon in the screenshot.
const BrainLogo = ({ size = 40, accent = '#7c3aed', glyph = '#ffffff', radius }) => (
  <div style={{
    width: size, height: size,
    borderRadius: radius != null ? radius : size * 0.26,
    background: accent,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: `0 1px 0 rgba(255,255,255,0.08) inset, 0 6px 16px ${accent}33`,
    flex: '0 0 auto',
  }}>
    <BrainIcon size={size * 0.6} color={glyph} strokeWidth={2} />
  </div>
);

// Provider monogram chip.
const ProviderChip = ({ id, theme, size = 22 }) => {
  const colorMap = {
    anthropic: { bg: '#cd6f47', fg: '#fff' },
    openai: { bg: '#0d8c6d', fg: '#fff' },
    gemini: { bg: '#4285f4', fg: '#fff' },
    ollama: { bg: '#3d3d3d', fg: '#fff' },
    perplexity: { bg: '#1FB8CD', fg: '#fff' },
    deepseek: { bg: '#3056ff', fg: '#fff' },
    groq: { bg: '#f55036', fg: '#fff' },
    mistral: { bg: '#ff7000', fg: '#fff' },
    openrouter: { bg: '#6b7280', fg: '#fff' },
    'lm-studio': { bg: '#0ea5e9', fg: '#fff' },
    morph: { bg: '#a855f7', fg: '#fff' },
    'my-qwen': { bg: '#374151', fg: '#fff' },
  };
  const c = colorMap[id] || { bg: theme.bgModifierBorder, fg: theme.textNormal };
  const letter = (id || '?').charAt(0).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: 6,
      background: c.bg, color: c.fg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.5, fontWeight: 700, letterSpacing: '-0.02em',
      flex: '0 0 auto',
    }}>{letter}</div>
  );
};

// Generic toggle in Obsidian style.
const Toggle = ({ on, onChange, theme, size = 'md' }) => {
  const w = size === 'sm' ? 28 : 34;
  const h = size === 'sm' ? 16 : 20;
  const knob = h - 4;
  return (
    <button
      onClick={() => onChange && onChange(!on)}
      style={{
        width: w, height: h, borderRadius: h, border: 'none', cursor: 'pointer',
        background: on ? theme.accent : theme.bgModifierBorder,
        position: 'relative', padding: 0, transition: 'background 0.15s', flex: '0 0 auto',
      }}
      aria-pressed={on}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? w - knob - 2 : 2,
        width: knob, height: knob, borderRadius: knob,
        background: '#fff', transition: 'left 0.15s',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
};

// Pill button (Obsidian "mod-cta" style).
const Button = ({ children, variant = 'default', theme, onClick, icon, style }) => {
  const variants = {
    default: { bg: theme.bgSecondary, border: theme.bgModifierBorder, color: theme.textNormal, hover: theme.bgModifierHover },
    cta: { bg: theme.accent, border: theme.accent, color: '#fff', hover: theme.accentHover },
    ghost: { bg: 'transparent', border: 'transparent', color: theme.textMuted, hover: theme.bgModifierHover },
    danger: { bg: 'transparent', border: theme.bgModifierBorder, color: theme.danger, hover: theme.dangerSoft },
  };
  const v = variants[variant];
  const [h, setH] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 6,
        background: h ? (variant === 'cta' ? v.hover : v.hover) : v.bg,
        border: `1px solid ${v.border}`, color: v.color,
        font: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer',
        transition: 'all 0.12s', whiteSpace: 'nowrap', ...style,
      }}
    >
      {icon && <Icon name={icon} size={13} />}
      {children}
    </button>
  );
};

// Field row (Obsidian setting-item).
const SettingRow = ({ name, desc, control, theme, dense, borderless }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 24,
    padding: dense ? '10px 0' : '14px 0',
    borderTop: borderless ? 'none' : `1px solid ${theme.bgModifierBorder}`,
  }}>
    <div style={{ flex: '1 1 auto', minWidth: 0 }}>
      <div style={{ color: theme.textNormal, fontSize: 13.5, fontWeight: 500 }}>{name}</div>
      {desc && <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>{desc}</div>}
    </div>
    <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>{control}</div>
  </div>
);

// Section heading with icon.
const SectionHeading = ({ title, desc, theme, action }) => (
  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, margin: '24px 0 12px' }}>
    <div>
      <div style={{ color: theme.textNormal, fontSize: 14, fontWeight: 600, letterSpacing: '-0.005em' }}>{title}</div>
      {desc && <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 3 }}>{desc}</div>}
    </div>
    {action}
  </div>
);

// Small status badge.
const Badge = ({ label, tone = 'neutral', theme, dot }) => {
  const tones = {
    neutral: { bg: theme.bgModifierBorder, fg: theme.textMuted, dot: theme.textFaint },
    success: { bg: theme.successSoft, fg: theme.success, dot: theme.success },
    warn: { bg: theme.warnSoft, fg: theme.warn, dot: theme.warn },
    danger: { bg: theme.dangerSoft, fg: theme.danger, dot: theme.danger },
    accent: { bg: theme.accentSoft, fg: theme.textAccent, dot: theme.accent },
  };
  const t = tones[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 7px', borderRadius: 999,
      background: t.bg, color: t.fg,
      fontSize: 11, fontWeight: 500, letterSpacing: '0.005em',
      lineHeight: 1.4,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 6, background: t.dot }} />}
      {label}
    </span>
  );
};

// Search input.
const SearchInput = ({ value, onChange, placeholder, theme, width = 240 }) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 10px', borderRadius: 6,
    background: theme.bgModifierFormField, border: `1px solid ${theme.bgModifierBorder}`,
    width, color: theme.textMuted,
  }}>
    <Icon name="search" size={13} />
    <input
      value={value} onChange={(e) => onChange && onChange(e.target.value)}
      placeholder={placeholder || 'Search…'}
      style={{
        border: 'none', outline: 'none', background: 'transparent',
        color: theme.textNormal, font: 'inherit', fontSize: 13, flex: 1, minWidth: 0,
      }}
    />
  </div>
);

// Dropdown select (display only).
const Select = ({ value, theme, width }) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 10px', borderRadius: 6,
    background: theme.bgModifierFormField, border: `1px solid ${theme.bgModifierBorder}`,
    color: theme.textNormal, fontSize: 13, minWidth: width || 'auto', cursor: 'pointer',
  }}>
    <span style={{ flex: 1 }}>{value}</span>
    <span style={{ color: theme.textFaint }}><Icon name="chevronDown" size={12} /></span>
  </div>
);

// Sidebar tab list — used by v1 and v2 (v3 uses its own).
const TabSidebar = ({ tabs, active, onSelect, theme, width = 200, header }) => (
  <div style={{
    width, flex: '0 0 auto',
    background: theme.bgSecondary, borderRight: `1px solid ${theme.bgModifierBorder}`,
    display: 'flex', flexDirection: 'column',
    padding: '14px 8px', gap: 1,
  }}>
    {header}
    {tabs.map((t) => {
      const sel = active === t.id;
      return (
        <button
          key={t.id} onClick={() => onSelect(t.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 5,
            background: sel ? theme.bgModifierHover : 'transparent',
            border: 'none', color: sel ? theme.textNormal : theme.textMuted,
            font: 'inherit', fontSize: 13, fontWeight: sel ? 500 : 400,
            cursor: 'pointer', textAlign: 'left',
            position: 'relative',
          }}
        >
          <span style={{ color: sel ? theme.textAccent : theme.textFaint }}><Icon name={t.icon} size={14} /></span>
          {t.label}
          {sel && <span style={{
            position: 'absolute', left: -8, top: 6, bottom: 6, width: 2.5,
            background: theme.accent, borderRadius: 2,
          }} />}
        </button>
      );
    })}
  </div>
);

// Modal chrome (window frame for each artboard).
const ModalChrome = ({ children, theme, title, onClose }) => (
  <div style={{
    width: '100%', height: '100%',
    background: theme.bgPrimary, color: theme.textNormal,
    borderRadius: 10, overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    fontSize: 13, lineHeight: 1.5,
    boxShadow: '0 30px 60px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04)',
  }}>
    {children}
  </div>
);

// Expose to window for other files.
Object.assign(window, {
  OBSIDIAN_DARK, OBSIDIAN_LIGHT,
  PROVIDERS, PROVIDER_OPTIONS, CHAT_MODELS, EMBEDDING_MODELS, TABS,
  Icon, NCLogo, BrainIcon, BrainLogo, ProviderChip, Toggle, Button,
  SettingRow, SectionHeading, Badge, SearchInput, Select, TabSidebar, ModalChrome,
});
