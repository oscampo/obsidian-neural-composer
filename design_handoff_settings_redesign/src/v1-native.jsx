// v1 — Conservative: native Obsidian settings, just better organized.
// Sidebar nav, plain setting rows, refined Models table with provider filter pills + search.

const V1Native = ({ theme, dense }) => {
  const [tab, setTab] = React.useState('models');
  const [search, setSearch] = React.useState('');
  const [providerFilter, setProviderFilter] = React.useState('all');
  const [showOnlyEnabled, setShowOnlyEnabled] = React.useState(false);
  const [models, setModels] = React.useState(window.CHAT_MODELS);

  const toggleModel = (id) =>
    setModels((ms) => ms.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)));

  return (
    <ModalChrome theme={theme}>
      {/* Top chrome */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px', borderBottom: `1px solid ${theme.bgModifierBorder}`,
        background: theme.bgPrimary,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <NCLogo size={22} accent={theme.accent} />
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.textNormal }}>
            Neural Composer
          </div>
          <div style={{ fontSize: 12, color: theme.textFaint }}>Settings</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SearchInput value="" theme={theme} placeholder="Search settings…" width={220} />
          <button style={{
            width: 24, height: 24, borderRadius: 5, border: 'none',
            background: 'transparent', color: theme.textMuted, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}><Icon name="x" size={14} /></button>
        </div>
      </div>

      {/* Body: sidebar + content */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <TabSidebar tabs={TABS} active={tab} onSelect={setTab} theme={theme} width={196} />

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px 32px' }}>
          {tab === 'models' && (
            <ModelsTab
              theme={theme} dense={dense}
              models={models} toggleModel={toggleModel}
              search={search} setSearch={setSearch}
              providerFilter={providerFilter} setProviderFilter={setProviderFilter}
              showOnlyEnabled={showOnlyEnabled} setShowOnlyEnabled={setShowOnlyEnabled}
            />
          )}
          {tab === 'providers' && <ProvidersTab theme={theme} dense={dense} />}
          {tab === 'chat' && <ChatTab theme={theme} dense={dense} />}
          {tab === 'graph' && <GraphTab theme={theme} dense={dense} />}
          {tab === 'tools' && <ToolsTab theme={theme} dense={dense} />}
          {tab === 'advanced' && <AdvancedTab theme={theme} dense={dense} />}
        </div>
      </div>

      {/* Footer status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 18px', borderTop: `1px solid ${theme.bgModifierBorder}`,
        background: theme.bgSecondary, fontSize: 11.5, color: theme.textMuted,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: 7, background: theme.success }} />
            LightRAG · online
          </span>
          <span>12 modelos activos</span>
          <span>1,348 notas indexadas</span>
        </div>
        <div style={{ color: theme.textFaint }}>v1.4.2</div>
      </div>
    </ModalChrome>
  );
};

// ---- MODELS TAB (the showcase) ----
const ModelsTab = ({ theme, dense, models, toggleModel, search, setSearch, providerFilter, setProviderFilter, showOnlyEnabled, setShowOnlyEnabled }) => {
  const enabledIds = models.filter((m) => m.enabled).map((m) => m.id);

  // Unique providers present in the models list.
  const providerSet = ['all', ...Array.from(new Set(models.map((m) => m.provider)))];

  const filtered = models.filter((m) => {
    if (providerFilter !== 'all' && m.provider !== providerFilter) return false;
    if (showOnlyEnabled && !m.enabled) return false;
    if (search && !m.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: theme.textNormal, letterSpacing: '-0.01em' }}>
          Models
        </h2>
        <p style={{ margin: '6px 0 0', color: theme.textMuted, fontSize: 13 }}>
          Habilita los modelos que quieres usar en chat y embeddings. Los modelos activos aparecen en el selector del chat.
        </p>
      </div>

      {/* Active selectors at the top — the daily-use bits */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
        marginTop: 20, padding: 14, borderRadius: 8,
        background: theme.bgSecondary, border: `1px solid ${theme.bgModifierBorder}`,
      }}>
        <ActiveSelector
          theme={theme} label="Chat model por defecto"
          value="gemini-3-flash-preview" badge="gemini"
        />
        <ActiveSelector
          theme={theme} label="Apply model"
          value="gemini-2.0-flash" badge="gemini"
        />
        <ActiveSelector
          theme={theme} label="Embedding model"
          value="text-embedding-004 (768d)" badge="gemini"
        />
        <ActiveSelector
          theme={theme} label="Graph logic (LLM)"
          value="Same as chat model" badge={null}
        />
      </div>

      {/* Section: Chat models */}
      <SectionHeading
        theme={theme}
        title="Chat models"
        desc={`${enabledIds.length} activos de ${models.length} disponibles`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <SearchInput value={search} onChange={setSearch} theme={theme} placeholder="Buscar modelo…" width={200} />
            <Button theme={theme} icon="plus">Add custom</Button>
          </div>
        }
      />

      {/* Filter pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {providerSet.map((p) => {
          const sel = providerFilter === p;
          const count = p === 'all' ? models.length : models.filter((m) => m.provider === p).length;
          return (
            <button
              key={p}
              onClick={() => setProviderFilter(p)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 999,
                background: sel ? theme.accentSoft : 'transparent',
                border: `1px solid ${sel ? theme.accent : theme.bgModifierBorder}`,
                color: sel ? theme.textAccent : theme.textMuted,
                font: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {p}
              <span style={{ color: sel ? theme.textAccent : theme.textFaint, fontSize: 11 }}>{count}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: theme.textMuted, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={showOnlyEnabled} onChange={(e) => setShowOnlyEnabled(e.target.checked)} />
          Solo activos
        </label>
      </div>

      {/* Compact rows */}
      <div style={{
        borderRadius: 8, border: `1px solid ${theme.bgModifierBorder}`,
        background: theme.bgPrimary, overflow: 'hidden',
      }}>
        {filtered.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: theme.textFaint, fontSize: 13 }}>
            Ningún modelo coincide con los filtros
          </div>
        )}
        {filtered.map((m, i) => (
          <div
            key={m.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: dense ? '8px 14px' : '10px 14px',
              borderTop: i === 0 ? 'none' : `1px solid ${theme.bgModifierBorder}`,
              background: m.enabled ? 'transparent' : 'transparent',
              transition: 'background 0.12s',
            }}
          >
            <ProviderChip id={m.provider} theme={theme} size={22} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5,
                  color: m.enabled ? theme.textNormal : theme.textMuted,
                }}>{m.id}</span>
                {m.favorite && <span style={{ color: theme.warn }}><Icon name="star" size={11} /></span>}
              </div>
              <div style={{ color: theme.textFaint, fontSize: 11.5, textTransform: 'capitalize', marginTop: 1 }}>
                {m.provider}
              </div>
            </div>
            <button style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: theme.textFaint, padding: 4,
            }}><Icon name="gear" size={14} /></button>
            <Toggle on={m.enabled} onChange={() => toggleModel(m.id)} theme={theme} size="sm" />
          </div>
        ))}
      </div>

      {/* Embedding models — collapsible */}
      <SectionHeading
        theme={theme}
        title="Embedding models"
        desc="Usados para el grafo de conocimiento (RAG)"
        action={<Button theme={theme} icon="plus">Add custom</Button>}
      />
      <div style={{ borderRadius: 8, border: `1px solid ${theme.bgModifierBorder}`, background: theme.bgPrimary, overflow: 'hidden' }}>
        {window.EMBEDDING_MODELS.map((m, i) => (
          <div key={m.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: dense ? '8px 14px' : '10px 14px',
            borderTop: i === 0 ? 'none' : `1px solid ${theme.bgModifierBorder}`,
          }}>
            <ProviderChip id={m.provider} theme={theme} size={22} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, color: theme.textNormal }}>{m.id}</div>
              <div style={{ color: theme.textFaint, fontSize: 11.5, textTransform: 'capitalize', marginTop: 1 }}>
                {m.provider} · {m.dim} dim
              </div>
            </div>
            {m.active && <Badge label="Activo" tone="accent" theme={theme} dot />}
            <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: theme.textFaint, padding: 4 }}>
              <Icon name="trash" size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const ActiveSelector = ({ theme, label, value, badge }) => (
  <div>
    <div style={{ color: theme.textMuted, fontSize: 11.5, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px', borderRadius: 6,
      background: theme.bgPrimary, border: `1px solid ${theme.bgModifierBorder}`,
      cursor: 'pointer',
    }}>
      {badge && <ProviderChip id={badge} theme={theme} size={18} />}
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, color: theme.textNormal, flex: 1 }}>{value}</span>
      <Icon name="chevronDown" size={12} />
    </div>
  </div>
);

// ---- PROVIDERS TAB ----
const ProvidersTab = ({ theme, dense }) => (
  <div>
    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: theme.textNormal }}>Providers</h2>
    <p style={{ margin: '6px 0 20px', color: theme.textMuted, fontSize: 13 }}>
      Tus API keys de los providers configurados. <a href="#" style={{ color: theme.textAccent }}>¿Cómo obtener API keys?</a>
    </p>

    <div style={{ borderRadius: 8, border: `1px solid ${theme.bgModifierBorder}`, background: theme.bgPrimary, overflow: 'hidden' }}>
      {PROVIDERS.map((p, i) => (
        <div key={p.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px',
          borderTop: i === 0 ? 'none' : `1px solid ${theme.bgModifierBorder}`,
        }}>
          <ProviderChip id={p.id} theme={theme} size={28} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 500, color: theme.textNormal }}>{p.name}</span>
              {p.custom && <Badge label="Custom" tone="neutral" theme={theme} />}
              <Badge
                label={p.status === 'local' ? 'Local' : 'Connected'}
                tone={p.status === 'local' ? 'neutral' : 'success'}
                theme={theme} dot
              />
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, color: theme.textFaint, marginTop: 3 }}>
              {p.keyMasked}
            </div>
          </div>
          <Button theme={theme} variant="ghost" icon="edit">Edit</Button>
          {p.custom && <Button theme={theme} variant="ghost" icon="trash" />}
        </div>
      ))}
    </div>

    <div style={{ marginTop: 16 }}>
      <Button theme={theme} variant="cta" icon="plus">Add provider</Button>
    </div>

    <SectionHeading
      theme={theme}
      title="Más providers disponibles"
      desc="Configura más providers para acceder a sus modelos"
    />
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
const ChatTab = ({ theme, dense }) => (
  <div>
    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: theme.textNormal }}>Chat</h2>
    <p style={{ margin: '6px 0 12px', color: theme.textMuted, fontSize: 13 }}>
      Comportamiento del chat y plantillas de prompt.
    </p>

    <SettingRow theme={theme} dense={dense} borderless
      name="Chat model"
      desc="Modelo por defecto para nuevas conversaciones"
      control={<Select value="gemini-3-flash-preview" theme={theme} width={220} />}
    />
    <SettingRow theme={theme} dense={dense}
      name="Apply model"
      desc="Modelo para aplicar ediciones (más rápido y barato)"
      control={<Select value="gemini-2.0-flash" theme={theme} width={220} />}
    />
    <SettingRow theme={theme} dense={dense}
      name="System prompt"
      desc="Se añade al inicio de cada conversación"
      control={<Button theme={theme} icon="edit">Editar</Button>}
    />
    <SettingRow theme={theme} dense={dense}
      name="Include current file"
      desc="Adjuntar automáticamente la nota activa al chat"
      control={<Toggle on={true} theme={theme} />}
    />
    <SettingRow theme={theme} dense={dense}
      name="Enable tools"
      desc="Permitir que la IA use MCP tools"
      control={<Toggle on={false} theme={theme} />}
    />
    <SettingRow theme={theme} dense={dense}
      name="Max auto tool requests"
      desc="Máximo de tool calls consecutivos sin confirmación"
      control={<input type="number" defaultValue={1} style={{
        width: 60, padding: '6px 8px', borderRadius: 6,
        background: theme.bgModifierFormField, border: `1px solid ${theme.bgModifierBorder}`,
        color: theme.textNormal, font: 'inherit', fontSize: 13, textAlign: 'center',
      }} />}
    />

    <SectionHeading
      theme={theme}
      title="Prompt templates"
      desc="Plantillas reutilizables. Escribe /temp- o :temp- en el chat para insertarlas."
      action={<Button theme={theme} variant="cta" icon="plus">Nueva</Button>}
    />
    <div style={{
      padding: 32, textAlign: 'center', borderRadius: 8,
      border: `1px dashed ${theme.bgModifierBorder}`, color: theme.textFaint, fontSize: 13,
    }}>
      Aún no hay plantillas
    </div>
  </div>
);

// ---- GRAPH TAB ----
const GraphTab = ({ theme, dense }) => (
  <div>
    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: theme.textNormal }}>Graph & Vault</h2>
    <p style={{ margin: '6px 0 12px', color: theme.textMuted, fontSize: 13 }}>
      Conexión con LightRAG, sincronización del vault y configuración del grafo de conocimiento.
    </p>

    <SectionHeading theme={theme} title="Neural backend (LightRAG)" desc="Servidor que indexa y consulta tu grafo" />
    <SettingRow theme={theme} dense={dense} borderless
      name="Use remote server"
      desc="Conectar a un LightRAG remoto en vez de ejecutar uno local"
      control={<Toggle on={true} theme={theme} />}
    />
    <SettingRow theme={theme} dense={dense}
      name="Server URL"
      control={<input defaultValue="http://localhost:9622" style={{
        width: 240, padding: '6px 10px', borderRadius: 6,
        background: theme.bgModifierFormField, border: `1px solid ${theme.bgModifierBorder}`,
        color: theme.textNormal, font: 'inherit', fontSize: 13, fontFamily: 'JetBrains Mono, monospace',
      }} />}
    />
    <SettingRow theme={theme} dense={dense}
      name="API key"
      desc="Opcional — solo si tu servidor lo requiere"
      control={<input placeholder="Vacío si no requiere" style={{
        width: 240, padding: '6px 10px', borderRadius: 6,
        background: theme.bgModifierFormField, border: `1px solid ${theme.bgModifierBorder}`,
        color: theme.textNormal, font: 'inherit', fontSize: 13,
      }} />}
    />
    <SettingRow theme={theme} dense={dense}
      name="Summary language"
      desc="Idioma usado por LightRAG para resúmenes internos"
      control={<Select value="Español" theme={theme} width={140} />}
    />
    <SettingRow theme={theme} dense={dense}
      name="Show citations in chat"
      desc="Añadir footnotes [1] enlazando a las fuentes"
      control={<Toggle on={false} theme={theme} />}
    />

    <SectionHeading theme={theme} title="Vault sync" />
    <SettingRow theme={theme} dense={dense} borderless
      name="Watched folder"
      desc="Carpeta del vault donde vigilar cambios. Vacío = todo el vault."
      control={<input defaultValue="Papers" style={{
        width: 180, padding: '6px 10px', borderRadius: 6,
        background: theme.bgModifierFormField, border: `1px solid ${theme.bgModifierBorder}`,
        color: theme.textNormal, font: 'inherit', fontSize: 13,
      }} />}
    />

    <SectionHeading theme={theme} title="Visualization" />
    <SettingRow theme={theme} dense={dense} borderless
      name="Graph rendering engine"
      desc="2D para performance, 3D si tienes GPU"
      control={<Select value="2D · rápido y limpio" theme={theme} width={200} />}
    />

    <details style={{ marginTop: 24 }}>
      <summary style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 13, fontWeight: 500, padding: '8px 0' }}>
        Avanzado: Ontology, Reranking, .env
      </summary>
      <div style={{ paddingLeft: 0, marginTop: 8, color: theme.textFaint, fontSize: 12.5 }}>
        Categorías personalizadas, reranking provider, modelo de reranking, edición directa del .env del servidor…
      </div>
    </details>
  </div>
);

// ---- TOOLS TAB ----
const ToolsTab = ({ theme, dense }) => (
  <div>
    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: theme.textNormal }}>Tools (MCP)</h2>
    <p style={{ margin: '6px 0 12px', color: theme.textMuted, fontSize: 13 }}>
      Model Context Protocol — extiende la IA con herramientas externas.
    </p>

    <div style={{
      padding: '12px 14px', borderRadius: 8, marginTop: 14,
      background: theme.warnSoft, border: `1px solid ${theme.warn}33`,
      display: 'flex', gap: 10, alignItems: 'flex-start',
      color: theme.warn, fontSize: 12.5,
    }}>
      <Icon name="info" size={14} />
      <div>
        <strong>Atención:</strong> el resultado de las tools se inyecta en el contexto del LLM.
        Resultados largos aumentan el consumo de tokens y el coste.
      </div>
    </div>

    <SectionHeading
      theme={theme} title="MCP Servers"
      action={<Button theme={theme} variant="cta" icon="plus">Add MCP Server</Button>}
    />
    <div style={{
      padding: 40, textAlign: 'center', borderRadius: 8,
      border: `1px dashed ${theme.bgModifierBorder}`, color: theme.textFaint, fontSize: 13,
    }}>
      Aún no hay servidores MCP configurados
    </div>
  </div>
);

// ---- ADVANCED TAB ----
const AdvancedTab = ({ theme, dense }) => (
  <div>
    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: theme.textNormal }}>Advanced</h2>
    <p style={{ margin: '6px 0 16px', color: theme.textMuted, fontSize: 13 }}>
      Configuración de bajo nivel del servidor LightRAG. Solo para usuarios avanzados.
    </p>

    <SettingRow theme={theme} dense={dense} borderless
      name="Edit .env variables"
      desc="Configuración cruda del servidor"
      control={<Button theme={theme} icon="edit">Abrir</Button>}
    />
    <SettingRow theme={theme} dense={dense}
      name="Restart server"
      desc="Aplica los cambios de configuración"
      control={<Button theme={theme} variant="cta" icon="refresh">Restart</Button>}
    />
    <SettingRow theme={theme} dense={dense}
      name="Review .env & restart"
      desc="Revisar variables antes de reiniciar"
      control={<Button theme={theme} icon="refresh">Review</Button>}
    />
    <SettingRow theme={theme} dense={dense}
      name="Reprocess failed documents"
      desc="Re-ejecutar extracción de entidades en documentos fallidos"
      control={<Button theme={theme} icon="refresh">Reprocess</Button>}
    />
  </div>
);

window.V1Native = V1Native;
