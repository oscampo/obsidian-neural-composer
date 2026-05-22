// v2 — Modern: refined card-based layout, grouped-by-provider models,
// prominent "What's active right now" hero at top of each tab.

const V2Modern = ({ theme, dense }) => {
  const [tab, setTab] = React.useState('models');
  const [search, setSearch] = React.useState('');
  const [models, setModels] = React.useState(window.CHAT_MODELS);
  const [expanded, setExpanded] = React.useState({ anthropic: true, openai: true, gemini: true });

  const toggleModel = (id) =>
    setModels((ms) => ms.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)));

  return (
    <ModalChrome theme={theme}>
      {/* Top chrome */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 22px',
        borderBottom: `1px solid ${theme.bgModifierBorder}`,
        background: theme.bgPrimaryAlt,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <NCLogo size={28} accent={theme.accent} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: theme.textNormal, letterSpacing: '-0.01em' }}>
              Neural Composer
            </div>
            <div style={{ fontSize: 11.5, color: theme.textFaint, marginTop: 1 }}>
              Graph-powered memory for Obsidian · v1.4.2
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SearchInput value="" theme={theme} placeholder="Search settings…" width={260} />
          <button style={{
            width: 28, height: 28, borderRadius: 6, border: 'none',
            background: 'transparent', color: theme.textMuted, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}><Icon name="x" size={14} /></button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, background: theme.bgPrimaryAlt }}>
        <TabSidebar tabs={TABS} active={tab} onSelect={setTab} theme={theme} width={208} />

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px 32px', background: theme.bgPrimary }}>
          {tab === 'models' && (
            <ModelsModernTab
              theme={theme} dense={dense}
              models={models} toggleModel={toggleModel}
              expanded={expanded} setExpanded={setExpanded}
              search={search} setSearch={setSearch}
            />
          )}
          {tab === 'providers' && <ProvidersModernTab theme={theme} dense={dense} />}
          {tab === 'chat' && <ChatModernTab theme={theme} dense={dense} />}
          {tab === 'graph' && <GraphModernTab theme={theme} dense={dense} />}
          {tab === 'tools' && <ToolsModernTab theme={theme} dense={dense} />}
          {tab === 'advanced' && <AdvancedModernTab theme={theme} dense={dense} />}
        </div>
      </div>
    </ModalChrome>
  );
};

// ---- MODELS TAB ----
const ModelsModernTab = ({ theme, dense, models, toggleModel, expanded, setExpanded, search, setSearch }) => {
  const groups = {};
  models.forEach((m) => {
    if (!groups[m.provider]) groups[m.provider] = [];
    groups[m.provider].push(m);
  });

  const totalEnabled = models.filter((m) => m.enabled).length;

  return (
    <div>
      {/* Hero: what's active right now */}
      <div style={{
        padding: 18, borderRadius: 10,
        background: `linear-gradient(135deg, ${theme.accentSoft}, transparent 70%), ${theme.bgSecondary}`,
        border: `1px solid ${theme.bgModifierBorder}`,
        marginBottom: 22,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ color: theme.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
              En uso ahora mismo
            </div>
            <div style={{ color: theme.textNormal, fontSize: 18, fontWeight: 600, marginTop: 4, letterSpacing: '-0.01em' }}>
              Models
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Badge label={`${totalEnabled} activos`} tone="accent" theme={theme} dot />
            <Badge label={`${models.length} disponibles`} tone="neutral" theme={theme} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <ActiveCard theme={theme} label="Chat" value="gemini-3-flash-preview" provider="gemini" />
          <ActiveCard theme={theme} label="Apply" value="gemini-2.0-flash" provider="gemini" />
          <ActiveCard theme={theme} label="Embedding" value="text-embedding-004" provider="gemini" sub="768 dim" />
          <ActiveCard theme={theme} label="Graph LLM" value="(same as chat)" provider={null} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ color: theme.textNormal, fontSize: 14, fontWeight: 600 }}>Chat models</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <SearchInput value={search} onChange={setSearch} theme={theme} placeholder="Buscar modelo…" width={220} />
          <Button theme={theme} icon="plus">Add custom</Button>
        </div>
      </div>

      {/* Grouped by provider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Object.entries(groups).map(([prov, ms]) => {
          const filtered = ms.filter((m) => !search || m.id.toLowerCase().includes(search.toLowerCase()));
          if (search && filtered.length === 0) return null;
          const isExpanded = expanded[prov] !== false;
          const activeCount = ms.filter((m) => m.enabled).length;
          return (
            <div key={prov} style={{
              borderRadius: 10, border: `1px solid ${theme.bgModifierBorder}`,
              background: theme.bgPrimaryAlt, overflow: 'hidden',
            }}>
              <button
                onClick={() => setExpanded({ ...expanded, [prov]: !isExpanded })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  padding: '12px 14px', border: 'none', background: 'transparent',
                  color: theme.textNormal, cursor: 'pointer', textAlign: 'left',
                }}
              >
                <ProviderChip id={prov} theme={theme} size={26} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, textTransform: 'capitalize' }}>{prov}</div>
                  <div style={{ fontSize: 11.5, color: theme.textFaint, marginTop: 1 }}>
                    {activeCount} activos · {ms.length} modelos
                  </div>
                </div>
                {activeCount > 0 && <Badge label={`${activeCount} activos`} tone="success" theme={theme} dot />}
                <span style={{ color: theme.textFaint, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <Icon name="chevronDown" size={14} />
                </span>
              </button>
              {isExpanded && (
                <div style={{ borderTop: `1px solid ${theme.bgModifierBorder}` }}>
                  {filtered.map((m, i) => (
                    <div key={m.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: dense ? '6px 14px 6px 50px' : '8px 14px 8px 50px',
                      borderTop: i === 0 ? 'none' : `1px solid ${theme.bgModifierBorder}33`,
                    }}>
                      <span style={{
                        fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5,
                        color: m.enabled ? theme.textNormal : theme.textMuted, flex: 1,
                      }}>{m.id}</span>
                      {m.favorite && <span style={{ color: theme.warn }}><Icon name="star" size={11} /></span>}
                      <button style={{ background: 'transparent', border: 'none', color: theme.textFaint, cursor: 'pointer', padding: 4 }}>
                        <Icon name="gear" size={13} />
                      </button>
                      <Toggle on={m.enabled} onChange={() => toggleModel(m.id)} theme={theme} size="sm" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Embedding models section — collapsed by default */}
      <details style={{ marginTop: 22 }}>
        <summary style={{
          cursor: 'pointer', padding: '12px 14px',
          borderRadius: 10, border: `1px solid ${theme.bgModifierBorder}`,
          background: theme.bgPrimaryAlt, color: theme.textNormal,
          fontSize: 13.5, fontWeight: 600, listStyle: 'none',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Icon name="cpu" size={14} />
          Embedding models
          <span style={{ color: theme.textFaint, fontSize: 11.5, fontWeight: 400, marginLeft: 'auto' }}>
            1 activo · 7 disponibles
          </span>
        </summary>
        <div style={{ marginTop: 8, borderRadius: 10, border: `1px solid ${theme.bgModifierBorder}`, background: theme.bgPrimaryAlt, overflow: 'hidden' }}>
          {window.EMBEDDING_MODELS.map((m, i) => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px',
              borderTop: i === 0 ? 'none' : `1px solid ${theme.bgModifierBorder}33`,
            }}>
              <ProviderChip id={m.provider} theme={theme} size={22} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, color: theme.textNormal }}>{m.id}</div>
                <div style={{ color: theme.textFaint, fontSize: 11.5, marginTop: 1, textTransform: 'capitalize' }}>
                  {m.provider} · {m.dim} dim
                </div>
              </div>
              {m.active ? (
                <Badge label="Activo" tone="accent" theme={theme} dot />
              ) : (
                <Button theme={theme} variant="ghost">Usar</Button>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
};

const ActiveCard = ({ theme, label, value, provider, sub }) => (
  <div style={{
    padding: '10px 12px', borderRadius: 8,
    background: theme.bgPrimary, border: `1px solid ${theme.bgModifierBorder}`,
    cursor: 'pointer', transition: 'border-color 0.15s',
  }}>
    <div style={{ color: theme.textFaint, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
      {label}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
      {provider && <ProviderChip id={provider} theme={theme} size={16} />}
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, color: theme.textNormal, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
    {sub && <div style={{ color: theme.textFaint, fontSize: 10.5, marginTop: 3 }}>{sub}</div>}
  </div>
);

// ---- PROVIDERS TAB ----
const ProvidersModernTab = ({ theme, dense }) => (
  <div>
    <div style={{
      padding: 18, borderRadius: 10,
      background: `linear-gradient(135deg, ${theme.accentSoft}, transparent 70%), ${theme.bgSecondary}`,
      border: `1px solid ${theme.bgModifierBorder}`,
      marginBottom: 22,
    }}>
      <div style={{ color: theme.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
        Conectados
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
        <div style={{ color: theme.textNormal, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {PROVIDERS.length}
        </div>
        <div style={{ color: theme.textMuted, fontSize: 13 }}>providers configurados</div>
      </div>
      <p style={{ margin: '8px 0 0', color: theme.textMuted, fontSize: 12.5 }}>
        Tus API keys se guardan localmente en tu vault. <a href="#" style={{ color: theme.textAccent }}>¿Cómo obtener API keys?</a>
      </p>
    </div>

    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ color: theme.textNormal, fontSize: 14, fontWeight: 600 }}>Tus providers</div>
      <Button theme={theme} variant="cta" icon="plus">Add provider</Button>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
      {PROVIDERS.map((p) => (
        <div key={p.id} style={{
          padding: 14, borderRadius: 10,
          background: theme.bgPrimaryAlt, border: `1px solid ${theme.bgModifierBorder}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <ProviderChip id={p.id} theme={theme} size={32} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600, color: theme.textNormal, fontSize: 13.5 }}>{p.name}</span>
                {p.custom && <Badge label="Custom" tone="neutral" theme={theme} />}
              </div>
              <Badge
                label={p.status === 'local' ? 'Local' : 'Connected'}
                tone={p.status === 'local' ? 'neutral' : 'success'}
                theme={theme} dot
              />
            </div>
          </div>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5,
            color: theme.textFaint, padding: '6px 8px', borderRadius: 5,
            background: theme.bgSecondary, marginBottom: 10,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {p.keyMasked}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button theme={theme} variant="ghost" icon="edit" style={{ flex: 1, justifyContent: 'center' }}>Edit key</Button>
            {p.custom && <Button theme={theme} variant="ghost" icon="trash" />}
          </div>
        </div>
      ))}
    </div>

    <SectionHeading theme={theme} title="Disponibles" desc="Configura una API key para activar" />
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {PROVIDER_OPTIONS.map((p) => (
        <div key={p} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 12px 6px 8px', borderRadius: 999,
          background: theme.bgSecondary, border: `1px solid ${theme.bgModifierBorder}`,
          cursor: 'pointer', color: theme.textMuted, fontSize: 12.5, textTransform: 'capitalize',
        }}>
          <ProviderChip id={p} theme={theme} size={18} />
          {p}
          <span style={{ color: theme.textFaint, marginLeft: 4 }}><Icon name="plus" size={11} /></span>
        </div>
      ))}
    </div>
  </div>
);

// ---- CHAT TAB ----
const ChatModernTab = ({ theme, dense }) => (
  <div>
    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: theme.textNormal }}>Chat</h2>
    <p style={{ margin: '6px 0 18px', color: theme.textMuted, fontSize: 13 }}>
      Comportamiento por defecto y plantillas de prompt.
    </p>

    {/* Compact behavior card */}
    <div style={{
      padding: 16, borderRadius: 10,
      background: theme.bgPrimaryAlt, border: `1px solid ${theme.bgModifierBorder}`,
      marginBottom: 16,
    }}>
      <div style={{ color: theme.textNormal, fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>Comportamiento</div>
      <SettingRow theme={theme} dense borderless
        name="Include current file"
        desc="Adjuntar la nota activa al chat automáticamente"
        control={<Toggle on={true} theme={theme} />}
      />
      <SettingRow theme={theme} dense
        name="Enable tools"
        desc="Permitir a la IA usar MCP tools"
        control={<Toggle on={false} theme={theme} />}
      />
      <SettingRow theme={theme} dense
        name="Max auto tool requests"
        desc="Tool calls consecutivos sin confirmación"
        control={<input type="number" defaultValue={1} style={{
          width: 56, padding: '6px 8px', borderRadius: 6,
          background: theme.bgModifierFormField, border: `1px solid ${theme.bgModifierBorder}`,
          color: theme.textNormal, font: 'inherit', fontSize: 13, textAlign: 'center',
        }} />}
      />
    </div>

    {/* System prompt as a big textarea preview */}
    <div style={{
      padding: 16, borderRadius: 10,
      background: theme.bgPrimaryAlt, border: `1px solid ${theme.bgModifierBorder}`,
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ color: theme.textNormal, fontSize: 13.5, fontWeight: 600 }}>System prompt</div>
          <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>Se añade al inicio de cada conversación</div>
        </div>
        <Button theme={theme} variant="ghost" icon="edit">Editar</Button>
      </div>
      <div style={{
        padding: 10, borderRadius: 6,
        background: theme.bgSecondary, border: `1px solid ${theme.bgModifierBorder}`,
        fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5,
        color: theme.textMuted, minHeight: 50, lineHeight: 1.5,
      }}>
        Vacío — escribe instrucciones generales para todas las conversaciones…
      </div>
    </div>

    {/* Prompt templates */}
    <div style={{
      padding: 16, borderRadius: 10,
      background: theme.bgPrimaryAlt, border: `1px solid ${theme.bgModifierBorder}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: theme.textNormal, fontSize: 13.5, fontWeight: 600 }}>Prompt templates</div>
          <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
            Escribe <code style={{ background: theme.bgSecondary, padding: '1px 5px', borderRadius: 3 }}>/temp-</code> en el chat para insertar
          </div>
        </div>
        <Button theme={theme} variant="cta" icon="plus">Nueva plantilla</Button>
      </div>
      <div style={{
        padding: 32, marginTop: 12, textAlign: 'center', borderRadius: 8,
        border: `1px dashed ${theme.bgModifierBorder}`, color: theme.textFaint, fontSize: 13,
      }}>
        Aún no hay plantillas
      </div>
    </div>
  </div>
);

// ---- GRAPH TAB ----
const GraphModernTab = ({ theme, dense }) => (
  <div>
    {/* Server status hero */}
    <div style={{
      padding: 18, borderRadius: 10,
      background: theme.bgPrimaryAlt, border: `1px solid ${theme.bgModifierBorder}`,
      marginBottom: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ color: theme.textNormal, fontSize: 14, fontWeight: 600 }}>LightRAG Server</div>
          <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 3 }}>Servidor neural conectado y operativo</div>
        </div>
        <Badge label="Online" tone="success" theme={theme} dot />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <Stat theme={theme} label="Notas indexadas" value="1,348" />
        <Stat theme={theme} label="Entidades" value="4,712" />
        <Stat theme={theme} label="Pendientes" value="0" />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <Button theme={theme} variant="cta" icon="refresh">Restart server</Button>
        <Button theme={theme} icon="edit">Review .env</Button>
        <Button theme={theme} variant="ghost" icon="refresh">Reprocess failed</Button>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Card theme={theme} title="Connection" icon="link">
        <SettingRow theme={theme} dense borderless
          name="Remote server"
          desc="Usar servidor remoto"
          control={<Toggle on={true} theme={theme} />}
        />
        <SettingRow theme={theme} dense
          name="URL"
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
      </Card>

      <Card theme={theme} title="Vault sync" icon="folder">
        <SettingRow theme={theme} dense borderless
          name="Watched folder"
          desc="Subcarpeta. Vacío = todo el vault."
          control={<input defaultValue="Papers" style={{
            width: 130, padding: '6px 10px', borderRadius: 6,
            background: theme.bgModifierFormField, border: `1px solid ${theme.bgModifierBorder}`,
            color: theme.textNormal, font: 'inherit', fontSize: 12,
          }} />}
        />
        <SettingRow theme={theme} dense
          name="Citations in chat"
          desc="Footnotes [1]"
          control={<Toggle on={false} theme={theme} />}
        />
        <SettingRow theme={theme} dense
          name="Summary language"
          control={<Select value="Español" theme={theme} width={110} />}
        />
      </Card>

      <Card theme={theme} title="Ontology" icon="graph">
        <SettingRow theme={theme} dense borderless
          name="Custom entity types"
          desc="Categorías propias en vez de las de LightRAG"
          control={<Toggle on={false} theme={theme} />}
        />
      </Card>

      <Card theme={theme} title="Visualization" icon="bolt">
        <SettingRow theme={theme} dense borderless
          name="Rendering engine"
          desc="2D recomendado"
          control={<Select value="2D" theme={theme} width={80} />}
        />
      </Card>
    </div>

    <details style={{ marginTop: 18 }}>
      <summary style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 13, fontWeight: 500, padding: '10px 0' }}>
        Reranking (precisión)
      </summary>
      <Card theme={theme} title="" icon={null}>
        <SettingRow theme={theme} dense borderless
          name="Rerank provider"
          control={<Select value="Cohere" theme={theme} width={130} />}
        />
        <SettingRow theme={theme} dense
          name="Rerank model"
          control={<input defaultValue="rerank-v4.0-pro" style={{
            width: 170, padding: '6px 10px', borderRadius: 6,
            background: theme.bgModifierFormField, border: `1px solid ${theme.bgModifierBorder}`,
            color: theme.textNormal, font: 'inherit', fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
          }} />}
        />
      </Card>
    </details>
  </div>
);

const Stat = ({ theme, label, value }) => (
  <div style={{
    padding: '10px 12px', borderRadius: 8,
    background: theme.bgSecondary, border: `1px solid ${theme.bgModifierBorder}`,
  }}>
    <div style={{ color: theme.textFaint, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
    <div style={{ color: theme.textNormal, fontSize: 18, fontWeight: 700, marginTop: 4, letterSpacing: '-0.01em', fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
  </div>
);

const Card = ({ theme, title, icon, children }) => (
  <div style={{
    padding: 14, borderRadius: 10,
    background: theme.bgPrimaryAlt, border: `1px solid ${theme.bgModifierBorder}`,
  }}>
    {title && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, color: theme.textNormal, fontSize: 13.5, fontWeight: 600 }}>
        {icon && <span style={{ color: theme.textAccent }}><Icon name={icon} size={14} /></span>}
        {title}
      </div>
    )}
    {children}
  </div>
);

// ---- TOOLS TAB ----
const ToolsModernTab = ({ theme, dense }) => (
  <div>
    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: theme.textNormal }}>Tools (MCP)</h2>
    <p style={{ margin: '6px 0 18px', color: theme.textMuted, fontSize: 13 }}>
      Model Context Protocol — herramientas externas para la IA.
    </p>

    <div style={{
      padding: '12px 14px', borderRadius: 10,
      background: theme.warnSoft, border: `1px solid ${theme.warn}33`,
      display: 'flex', gap: 12, alignItems: 'flex-start',
      color: theme.warn, fontSize: 12.5, marginBottom: 18,
    }}>
      <Icon name="info" size={14} />
      <div style={{ color: theme.textNormal, opacity: 0.9 }}>
        Los resultados de las tools se inyectan en el contexto del LLM.
        Resultados largos pueden aumentar significativamente el consumo de tokens.
      </div>
    </div>

    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ color: theme.textNormal, fontSize: 14, fontWeight: 600 }}>MCP Servers</div>
      <Button theme={theme} variant="cta" icon="plus">Add MCP Server</Button>
    </div>

    <div style={{
      padding: 48, textAlign: 'center', borderRadius: 10,
      border: `1px dashed ${theme.bgModifierBorder}`, color: theme.textFaint,
      background: theme.bgPrimaryAlt,
    }}>
      <div style={{ color: theme.textMuted, fontSize: 13, fontWeight: 500 }}>Aún no hay servidores MCP</div>
      <div style={{ fontSize: 12, marginTop: 4 }}>Conecta servidores para añadir herramientas a la IA</div>
    </div>
  </div>
);

// ---- ADVANCED TAB ----
const AdvancedModernTab = ({ theme, dense }) => (
  <div>
    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: theme.textNormal }}>Advanced</h2>
    <p style={{ margin: '6px 0 18px', color: theme.textMuted, fontSize: 13 }}>
      Configuración de bajo nivel del servidor.
    </p>

    <Card theme={theme} title="Server control" icon="gear">
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
        desc="Re-ejecutar extracción de entidades en docs fallidos"
        control={<Button theme={theme} icon="refresh">Reprocess</Button>}
      />
    </Card>
  </div>
);

window.V2Modern = V2Modern;
