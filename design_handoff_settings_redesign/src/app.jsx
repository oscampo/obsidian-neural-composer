// App: wraps the 3 variations in a DesignCanvas with Tweaks for theme + accent.

const TWEAK_DEFAULS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "accent": "#7c3aed",
  "dense": false
}/*EDITMODE-END*/;

const ACCENTS = {
  "#7c3aed": { soft: 'rgba(124,58,237,0.16)', softLight: 'rgba(124,58,237,0.10)', hover: '#8b5cf6', textDark: '#a78bfa' },
  "#2563eb": { soft: 'rgba(37,99,235,0.16)', softLight: 'rgba(37,99,235,0.10)', hover: '#3b82f6', textDark: '#93c5fd' },
  "#10b981": { soft: 'rgba(16,185,129,0.16)', softLight: 'rgba(16,185,129,0.10)', hover: '#34d399', textDark: '#6ee7b7' },
  "#f97316": { soft: 'rgba(249,115,22,0.16)', softLight: 'rgba(249,115,22,0.10)', hover: '#fb923c', textDark: '#fdba74' },
};

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULS);

  // Build active theme.
  const base = t.theme === 'light' ? window.OBSIDIAN_LIGHT : window.OBSIDIAN_DARK;
  const a = ACCENTS[t.accent] || ACCENTS["#7c3aed"];
  const theme = {
    ...base,
    accent: t.accent,
    accentHover: a.hover,
    accentSoft: t.theme === 'light' ? a.softLight : a.soft,
    textAccent: t.theme === 'light' ? t.accent : a.textDark,
  };

  // Artboard dimensions — Obsidian settings modal is typically ~1024x720.
  const W = 1100;
  const H = 760;

  return (
    <>
      <DesignCanvas>
        <DCSection
          id="settings"
          title="Neural Composer · 3 propuestas de UI para Settings"
          subtitle="Misma estructura, tres niveles de personalidad visual. Sidebar con 6 tabs consolida las ~10 secciones del UI actual."
        >
          <DCArtboard id="v1" label="V1 · Nativa refinada" width={W} height={H}>
            <V1Native theme={theme} dense={t.dense} />
          </DCArtboard>
          <DCArtboard id="v2" label="V2 · Modern cards" width={W} height={H}>
            <V2Modern theme={theme} dense={t.dense} />
          </DCArtboard>
          <DCArtboard id="v3" label="V3 · Command center" width={W} height={H}>
            <V3Dashboard theme={theme} dense={t.dense} />
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Tema" />
        <TweakRadio
          label="Modo"
          value={t.theme}
          options={['dark', 'light']}
          onChange={(v) => setTweak('theme', v)}
        />
        <TweakColor
          label="Color de acento"
          value={t.accent}
          options={['#7c3aed', '#2563eb', '#10b981', '#f97316']}
          onChange={(v) => setTweak('accent', v)}
        />
        <TweakSection label="Densidad" />
        <TweakToggle
          label="Modo compacto"
          value={t.dense}
          onChange={(v) => setTweak('dense', v)}
        />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
