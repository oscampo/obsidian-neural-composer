// v3 — Bold: command-center layout. Icon nav rail + persistent quick-switch bar
// always showing active chat/apply/embedding models. The most visually distinctive.

const V3Dashboard = ({ theme, dense }) => {
  const [tab, setTab] = React.useState('models');
  const [models, setModels] = React.useState(window.CHAT_MODELS);
  const [search, setSearch] = React.useState('');

  const toggleModel = (id) =>
    setModels((ms) => ms.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)));

  return (
    <ModalChrome theme={theme}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Icon nav rail */}
        <div style={{
          width: 64, flex: '0 0 auto',
          background: theme.bgSecondaryAlt,
          borderRight: `1px solid ${theme.bgModifierBorder}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '14px 0', gap: 6,
        }}>
          <div style={{ marginBottom: 14 }}>
            <BrainLogo size={40} accent={theme.accent} />
          </div>
          {TABS.map((t) => {
            const sel = tab === t.id;
            return (
              <button
                key={t.id} onClick={() => setTab(t.id)}
                title={t.label}
                style={{
                  width: 44, height: 44, borderRadius: 10, border: 'none',
                  background: sel ? theme.accentSoft : 'transparent',
                  color: sel ? theme.textAccent : theme.textMuted,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative', transition: 'all 0.12s',
                }}
              >
                <Icon name={t.icon} size={17} />
                {sel && <span style={{
                  position: 'absolute', left: -8, top: 10, bottom: 10, width: 3,
                  background: theme.accent, borderRadius: 3,
                }} />}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          <button title="Close" style={{
            width: 36, height: 36, borderRadius: 8, border: 'none',
            background: 'transparent', color: theme.textFaint, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Icon name="x" size={15} /></button>
        </div>

        {/* Right side: persistent header + content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Persistent command bar — always shows what's active */}
          <CommandBar theme={theme} />

          <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px 32px' }}>
            {tab === 'models' && (
              <ModelsBoldTab
                theme={theme} dense={dense}
                models={models} toggleModel={toggleModel}
                search={search} setSearch={setSearch}
              />
            )}
            {tab === 'providers' && <ProvidersBoldTab theme={theme} dense={dense} />}
            {tab === 'chat' && <ChatBoldTab theme={theme} dense={dense} />}
            {tab === 'graph' && <GraphBoldTab theme={theme} dense={dense} />}
            {tab === 'tools' && <ToolsBoldTab theme={theme} dense={dense} />}
            {tab === 'advanced' && <AdvancedBoldTab theme={theme} dense={dense} />}
          </div>
        </div>
      </div>
    </ModalChrome>
  );
};

// Persistent quick-switch bar at top of content — distinctive feature of v3.
// Users can switch chat/apply/embedding models without changing tabs.
const CommandBar = ({ theme }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '10px 22px',
    background: theme.bgSecondary,
    borderBottom: `1px solid ${theme.bgModifierBorder}`,
  }}>
    <SearchInput value="" theme={theme} placeholder="⌘K  Buscar settings…" width={260} />
    <div style={{ flex: 1 }} />
    <QuickSlot theme={theme} label="Chat" provider="gemini" value="gemini-3-flash-preview" />
    <QuickSlot theme={theme} label="Apply" provider="gemini" value="gemini-2.0-flash" />
    <QuickSlot theme={theme} label="Embed" provider="gemini" value="text-embedding-004" />
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 999,
      background: theme.successSoft, color: theme.success,
      fontSize: 11.5, fontWeight: 500,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: 7, background: theme.success }} />
      LightRAG
    </div>
  </div>
);

const QuickSlot = ({ theme, label, provider, value }) => (
  <button style={{
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '5px 10px 5px 7px', borderRadius: 7,
    background: theme.bgPrimaryAlt, border: `1px solid ${theme.bgModifierBorder}`,
    cursor: 'pointer', font: 'inherit',
  }}>
    <ProviderChip id={provider} theme={theme} size={20} />
    <div style={{ textAlign: 'left' }}>
      <div style={{ color: theme.textFaint, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, lineHeight: 1 }}>{label}</div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, color: theme.textNormal, marginTop: 2, lineHeight: 1 }}>{value}</div>
    </div>
    <span style={{ color: theme.textFaint, marginLeft: 2 }}><Icon name="chevronDown" size={11} /></span>
  </button>
);

// ---- MODELS TAB ----
const ModelsBoldTab = ({ theme, dense, models, toggleModel, search, setSearch }) => {
  const groups = {};
  models.forEach((m) => {
    if (!groups[m.provider]) groups[m.provider] = [];
    groups[m.provider].push(m);
  });

  const totalEnabled = models.filter((m) => m.enabled).length;
  const filtered = (ms) => ms.filter((m) => !search || m.id.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      {/* Header with KPIs */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <div style={{ color: theme.textFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
            Configuración
          </div>
          <h1 style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700, color: theme.textNormal, letterSpacing: '-0.02em' }}>
            Models
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 16, color: theme.textMuted, fontSize: 12.5 }}>
          <KPI theme={theme} value={totalEnabled} label="activos" tone="accent" />
          <KPI theme={theme} value={models.length} label="disponibles" />
          <KPI theme={theme} value={Object.keys(groups).length} label="providers" />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <SearchInput value={search} onChange={setSearch} theme={theme} placeholder="Buscar entre 16 modelos…" width={280} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button theme={theme} icon="bolt">Solo activos</Button>
          <Button theme={theme} variant="cta" icon="plus">Add custom model</Button>
        </div>
      </div>

      {/* Provider columns */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Object.entries(groups).map(([prov, ms]) => {
          const fs = filtered(ms);
          if (search && fs.length === 0) return null;
          const activeCount = ms.filter((m) => m.enabled).length;
          return (
            <div key={prov} style={{
              borderRadius: 12, border: `1px solid ${theme.bgModifierBorder}`,
              background: theme.bgPrimaryAlt, overflow: 'hidden',
              boxShadow: '0 1px 0 rgba(0,0,0,0.2)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px',
                background: `linear-gradient(90deg, transparent, ${theme.bgSecondary})`,
                borderBottom: `1px solid ${theme.bgModifierBorder}`,
              }}>
                <ProviderChip id={prov} theme={theme} size={36} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: theme.textNormal, textTransform: 'capitalize', letterSpacing: '-0.005em' }}>
                    {prov}
                  </div>
                  <div style={{ fontSize: 11.5, color: theme.textFaint, marginTop: 2 }}>
                    {ms.length} modelos · {activeCount} habilitados
                  </div>
                </div>
                {activeCount > 0 && <Badge label={`${activeCount} ON`} tone="accent" theme={theme} dot />}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }}>
                {fs.map((m, i) => (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px',
                      borderRight: i % 2 === 0 ? `1px solid ${theme.bgModifierBorder}` : 'none',
                      borderTop: i >= 2 ? `1px solid ${theme.bgModifierBorder}` : 'none',
                      background: m.enabled ? `linear-gradient(90deg, ${theme.accentSoft}, transparent)` : 'transparent',
                    }}
                  >
                    <span style={{
                      fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
                      color: m.enabled ? theme.textNormal : theme.textMuted,
                      flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{m.id}</span>
                    {m.favorite && <span style={{ color: theme.warn }}><Icon name="star" size={11} /></span>}
                    <Toggle on={m.enabled} onChange={() => toggleModel(m.id)} theme={theme} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Embedding section */}
      <SectionHeading
        theme={theme}
        title="Embedding models"
        desc="Para vectorización de notas (RAG)"
        action={<Button theme={theme} icon="plus">Add</Button>}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {window.EMBEDDING_MODELS.map((m) => (
          <div key={m.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 8,
            background: m.active ? theme.accentSoft : theme.bgPrimaryAlt,
            border: `1px solid ${m.active ? theme.accent + '66' : theme.bgModifierBorder}`,
          }}>
            <ProviderChip id={m.provider} theme={theme} size={22} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, color: theme.textNormal, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.id}</div>
              <div style={{ color: theme.textFaint, fontSize: 10.5, marginTop: 1 }}>{m.dim} dim</div>
            </div>
            {m.active && <Badge label="Activo" tone="accent" theme={theme} />}
          </div>
        ))}
      </div>
    </div>
  );
};

const KPI = ({ theme, value, label, tone }) => (
  <div style={{ textAlign: 'right' }}>
    <div style={{
      fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em',
      color: tone === 'accent' ? theme.textAccent : theme.textNormal,
      fontFamily: 'JetBrains Mono, monospace', lineHeight: 1,
    }}>{value}</div>
    <div style={{ fontSize: 11, color: theme.textFaint, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
  </div>
);

// ---- PROVIDERS TAB ----
const ProvidersBoldTab = ({ theme, dense }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
      <div>
        <div style={{ color: theme.textFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
          Configuración
        </div>
        <h1 style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700, color: theme.textNormal, letterSpacing: '-0.02em' }}>
          Providers
        </h1>
      </div>
      <Button theme={theme} variant="cta" icon="plus">Add provider</Button>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 24 }}>
      {PROVIDERS.map((p) => (
        <div key={p.id} style={{
          padding: 14, borderRadius: 10,
          background: theme.bgPrimaryAlt, border: `1px solid ${theme.bgModifierBorder}`,
          display: 'flex', gap: 14, alignItems: 'center',
        }}>
          <ProviderChip id={p.id} theme={theme} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span style={{ fontWeight: 600, color: theme.textNormal, fontSize: 14 }}>{p.name}</span>
              {p.custom && <Badge label="Custom" tone="neutral" theme={theme} />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge
                label={p.status === 'local' ? 'Local' : 'Connected'}
                tone={p.status === 'local' ? 'neutral' : 'success'}
                theme={theme} dot
              />
              <span style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                color: theme.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{p.keyMasked}</span>
            </div>
          </div>
          <button style={{
            background: 'transparent', border: `1px solid ${theme.bgModifierBorder}`,
            borderRadius: 6, padding: '5px 8px',
            color: theme.textMuted, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12,
          }}>
            <Icon name="edit" size={12} />
            Edit
          </button>
        </div>
      ))}
    </div>

    <SectionHeading theme={theme} title="Más providers" desc="Click para añadir API key" />
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {PROVIDER_OPTIONS.map((p) => (
        <div key={p} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '7px 12px 7px 8px', borderRadius: 8,
          background: theme.bgPrimaryAlt, border: `1px dashed ${theme.bgModifierBorder}`,
          cursor: 'pointer', color: theme.textMuted, fontSize: 12.5, textTransform: 'capitalize',
        }}>
          <ProviderChip id={p} theme={theme} size={20} />
          {p}
          <Icon name="plus" size={11} />
        </div>
      ))}
    </div>
  </div>
);

// ---- CHAT TAB ----
const ChatBoldTab = ({ theme, dense }) => (
  <div>
    <div style={{ marginBottom: 22 }}>
      <div style={{ color: theme.textFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
        Configuración
      </div>
      <h1 style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700, color: theme.textNormal, letterSpacing: '-0.02em' }}>
        Chat
      </h1>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
      <div style={{
        padding: 16, borderRadius: 12,
        background: theme.bgPrimaryAlt, border: `1px solid ${theme.bgModifierBorder}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ color: theme.textAccent }}><Icon name="msg" size={14} /></span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: theme.textNormal }}>System prompt</span>
        </div>
        <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10 }}>Se añade al inicio de cada conversación nueva</div>
        <textarea
          placeholder="Eres un asistente de investigación científica. Cuando me ayudes, sé conciso…"
          style={{
            width: '100%', minHeight: 110, padding: 10, borderRadius: 8,
            background: theme.bgSecondary, border: `1px solid ${theme.bgModifierBorder}`,
            color: theme.textNormal, fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
            resize: 'vertical', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          padding: 14, borderRadius: 12,
          background: theme.bgPrimaryAlt, border: `1px solid ${theme.bgModifierBorder}`,
        }}>
          <SettingRow theme={theme} dense borderless
            name="Include current file"
            desc="Adjuntar la nota activa"
            control={<Toggle on={true} theme={theme} />}
          />
          <SettingRow theme={theme} dense
            name="Enable tools"
            desc="Permitir uso de MCP tools"
            control={<Toggle on={false} theme={theme} />}
          />
          <SettingRow theme={theme} dense
            name="Max auto tools"
            desc="Sin confirmación"
            control={<input type="number" defaultValue={1} style={{
              width: 50, padding: '6px 8px', borderRadius: 6,
              background: theme.bgModifierFormField, border: `1px solid ${theme.bgModifierBorder}`,
              color: theme.textNormal, font: 'inherit', fontSize: 13, textAlign: 'center',
            }} />}
          />
        </div>
      </div>
    </div>

    <SectionHeading
      theme={theme}
      title="Prompt templates"
      desc="Inserta con /temp- en el chat"
      action={<Button theme={theme} variant="cta" icon="plus">Nueva</Button>}
    />
    <div style={{
      padding: 40, textAlign: 'center', borderRadius: 10,
      border: `1px dashed ${theme.bgModifierBorder}`, color: theme.textFaint, fontSize: 13,
      background: theme.bgPrimaryAlt,
    }}>
      Aún no hay plantillas
    </div>
  </div>
);

// ---- GRAPH TAB ----
const GraphBoldTab = ({ theme, dense }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
      <div>
        <div style={{ color: theme.textFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
          Configuración
        </div>
        <h1 style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700, color: theme.textNormal, letterSpacing: '-0.02em' }}>
          Graph & Vault
        </h1>
      </div>
    </div>

    {/* Big server status card */}
    <div style={{
      padding: 18, borderRadius: 12,
      background: `linear-gradient(135deg, ${theme.successSoft}, transparent 60%), ${theme.bgPrimaryAlt}`,
      border: `1px solid ${theme.bgModifierBorder}`,
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: theme.successSoft, color: theme.success,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="bolt" size={16} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.textNormal }}>LightRAG Server</div>
          <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 2, fontFamily: 'JetBrains Mono, monospace' }}>
            http://localhost:9622
          </div>
        </div>
        <Badge label="Online" tone="success" theme={theme} dot />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        <Stat2 theme={theme} value="1,348" label="Notas" />
        <Stat2 theme={theme} value="4,712" label="Entidades" />
        <Stat2 theme={theme} value="11,290" label="Relaciones" />
        <Stat2 theme={theme} value="0" label="Pendientes" />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button theme={theme} variant="cta" icon="refresh">Restart</Button>
        <Button theme={theme} icon="edit">Review .env</Button>
        <Button theme={theme} variant="ghost" icon="refresh">Reprocess failed</Button>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div style={{
        padding: 14, borderRadius: 12,
        background: theme.bgPrimaryAlt, border: `1px solid ${theme.bgModifierBorder}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: theme.textNormal, fontSize: 13.5, fontWeight: 600 }}>
          <span style={{ color: theme.textAccent }}><Icon name="link" size={14} /></span>
          Connection
        </div>
        <SettingRow theme={theme} dense borderless
          name="Remote server"
          control={<Toggle on={true} theme={theme} />}
        />
        <SettingRow theme={theme} dense
          name="Server URL"
          control={<input defaultValue="http://localhost:9622" style={{
            width: 170, padding: '6px 10px', borderRadius: 6,
            background: theme.bgModifierFormField, border: `1px solid ${theme.bgModifierBorder}`,
            color: theme.textNormal, font: 'inherit', fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
          }} />}
        />
        <SettingRow theme={theme} dense
          name="API key"
          control={<input placeholder="Vacío" style={{
            width: 170, padding: '6px 10px', borderRadius: 6,
            background: theme.bgModifierFormField, border: `1px solid ${theme.bgModifierBorder}`,
            color: theme.textNormal, font: 'inherit', fontSize: 12,
          }} />}
        />
      </div>

      <div style={{
        padding: 14, borderRadius: 12,
        background: theme.bgPrimaryAlt, border: `1px solid ${theme.bgModifierBorder}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: theme.textNormal, fontSize: 13.5, fontWeight: 600 }}>
          <span style={{ color: theme.textAccent }}><Icon name="folder" size={14} /></span>
          Vault sync
        </div>
        <SettingRow theme={theme} dense borderless
          name="Watched folder"
          desc="Vacío = todo el vault"
          control={<input defaultValue="Papers" style={{
            width: 130, padding: '6px 10px', borderRadius: 6,
            background: theme.bgModifierFormField, border: `1px solid ${theme.bgModifierBorder}`,
            color: theme.textNormal, font: 'inherit', fontSize: 12,
          }} />}
        />
        <SettingRow theme={theme} dense
          name="Show citations"
          desc="Footnotes [1]"
          control={<Toggle on={false} theme={theme} />}
        />
        <SettingRow theme={theme} dense
          name="Summary language"
          control={<Select value="Español" theme={theme} width={110} />}
        />
      </div>
    </div>

    <details style={{ marginTop: 14 }}>
      <summary style={{
        cursor: 'pointer', padding: '12px 14px',
        borderRadius: 10, border: `1px solid ${theme.bgModifierBorder}`,
        background: theme.bgPrimaryAlt, color: theme.textNormal,
        fontSize: 13.5, fontWeight: 600, listStyle: 'none',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Icon name="gear" size={13} />
        Ontology, Reranking, Visualization
        <span style={{ color: theme.textFaint, fontSize: 11.5, fontWeight: 400, marginLeft: 'auto' }}>
          Avanzado
        </span>
      </summary>
    </details>
  </div>
);

const Stat2 = ({ theme, value, label }) => (
  <div>
    <div style={{ color: theme.textNormal, fontSize: 20, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '-0.01em', lineHeight: 1 }}>{value}</div>
    <div style={{ color: theme.textFaint, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginTop: 4 }}>{label}</div>
  </div>
);

// ---- TOOLS ----
const ToolsBoldTab = ({ theme, dense }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
      <div>
        <div style={{ color: theme.textFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
          Configuración
        </div>
        <h1 style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700, color: theme.textNormal, letterSpacing: '-0.02em' }}>
          Tools <span style={{ color: theme.textFaint, fontWeight: 500, fontSize: 16 }}>· MCP</span>
        </h1>
      </div>
      <Button theme={theme} variant="cta" icon="plus">Add MCP Server</Button>
    </div>

    <div style={{
      padding: '14px 16px', borderRadius: 10,
      background: theme.warnSoft, border: `1px solid ${theme.warn}33`,
      display: 'flex', gap: 12, alignItems: 'flex-start',
      marginBottom: 20,
    }}>
      <div style={{ color: theme.warn, flex: '0 0 auto' }}><Icon name="info" size={14} /></div>
      <div style={{ color: theme.textNormal, fontSize: 12.5, lineHeight: 1.55 }}>
        <strong>Atención al consumo:</strong> los resultados de las tools se inyectan en el contexto del LLM.
        Resultados largos pueden aumentar significativamente el coste por mensaje.
      </div>
    </div>

    <div style={{
      padding: 60, textAlign: 'center', borderRadius: 12,
      border: `2px dashed ${theme.bgModifierBorder}`, color: theme.textFaint,
      background: theme.bgPrimaryAlt,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, margin: '0 auto 14px',
        background: theme.accentSoft, color: theme.textAccent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="wrench" size={20} />
      </div>
      <div style={{ color: theme.textNormal, fontSize: 14, fontWeight: 600 }}>Aún no hay servidores MCP</div>
      <div style={{ fontSize: 12.5, marginTop: 6 }}>Conecta servidores para que la IA pueda usar herramientas externas</div>
    </div>
  </div>
);

// ---- ADVANCED ----
const AdvancedBoldTab = ({ theme, dense }) => (
  <div>
    <div style={{ marginBottom: 22 }}>
      <div style={{ color: theme.textFaint, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
        Configuración
      </div>
      <h1 style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700, color: theme.textNormal, letterSpacing: '-0.02em' }}>
        Advanced
      </h1>
    </div>

    <div style={{
      padding: 16, borderRadius: 12,
      background: theme.bgPrimaryAlt, border: `1px solid ${theme.bgModifierBorder}`,
    }}>
      <SettingRow theme={theme} dense borderless
        name="Edit .env variables"
        desc="Configuración cruda del servidor LightRAG"
        control={<Button theme={theme} icon="edit">Abrir</Button>}
      />
      <SettingRow theme={theme} dense
        name="Restart server"
        desc="Aplica cambios de configuración"
        control={<Button theme={theme} variant="cta" icon="refresh">Restart</Button>}
      />
      <SettingRow theme={theme} dense
        name="Reprocess failed documents"
        desc="Re-ejecutar extracción en documentos fallidos"
        control={<Button theme={theme} icon="refresh">Reprocess</Button>}
      />
    </div>
  </div>
);

window.V3Dashboard = V3Dashboard;
