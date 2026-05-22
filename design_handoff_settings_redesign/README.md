# Handoff: Neural Composer · Settings Redesign (V3 Command Center)

## Overview

Rediseño completo de la ventana de Settings del plugin **Neural Composer** para Obsidian. El UI actual tiene ~10 secciones apiladas verticalmente con tablas largas, mucha jerarquía plana, y configuraciones avanzadas mezcladas con las del día a día. El rediseño consolida todo en **6 tabs** accesibles desde un **rail de iconos a la izquierda**, con una **barra de comando persistente** arriba que siempre muestra los modelos activos (chat / apply / embedding) y el estado del servidor LightRAG.

Objetivos del rediseño:
- Reducir la carga cognitiva (de scroll infinito a navegación por tabs).
- Hacer visible lo importante: qué modelos están activos, si el servidor está online.
- Permitir cambiar de modelo sin navegar de tab (quick-slots en la command bar).
- Esconder lo avanzado (`.env`, reranking, ontology) tras `<details>` collapsibles.
- Identidad visual propia (rail con icono cerebro violeta) sin romper la estética nativa de Obsidian.

## About the Design Files

Los archivos `.html` y `.jsx` incluidos son **prototipos de referencia construidos en React + HTML**. No son código para copiar directamente al plugin. La tarea es **recrear este diseño dentro del entorno del plugin de Obsidian** (TypeScript, Obsidian API), respetando los patterns existentes del plugin y las CSS variables nativas de Obsidian.

Concretamente para un plugin de Obsidian:
- La clase de settings hereda de `PluginSettingTab` y se monta sobre `containerEl`.
- El layout custom (rail + command bar + tabs) **NO** se construye con la API `Setting` nativa, sino con `createEl` / `createDiv` y CSS propio en un archivo `styles.css` del plugin.
- Para iconos, usar `setIcon(el, 'brain')` del módulo `obsidian` (Lucide ya viene integrado).
- Para toggles, dropdowns y text inputs, usar la API `Setting` pero envueltos en los containers custom del nuevo layout.

## Fidelity

**High-fidelity (hifi)**. Los mocks tienen colores, spacing, tipografía, iconos y estados finales. El developer debe reproducirlos pixel-perfect, **pero sustituyendo los colores hardcoded por las CSS variables nativas de Obsidian** donde haga sentido (ver sección "Design Tokens · Mapping a Obsidian"). Esto hace que el plugin respete el tema activo del usuario (default, custom themes, etc.) automáticamente.

## Files en este handoff

- `Neural Composer Settings.html` — entry point del prototipo (carga los scripts)
- `src/shared.jsx` — design tokens, componentes compartidos (Toggle, Button, Badge, Icon, BrainLogo, ProviderChip, SettingRow, SectionHeading, SearchInput, Select, TabSidebar)
- `src/v3-dashboard.jsx` — **el diseño a implementar** (V3 Command Center)
- `src/v1-native.jsx` / `src/v2-modern.jsx` — variantes alternativas (no implementar, solo referencia)
- `src/app.jsx` — wrapping en el canvas de Tweaks

Para correr el prototipo localmente: abre `Neural Composer Settings.html` en un navegador (no requiere build, usa React UMD + Babel standalone).

---

## Arquitectura general del nuevo Settings

```
┌──────────────────────────────────────────────────────────────────────┐
│  [Modal frame de Obsidian — no se renderiza desde el plugin]         │
├──────┬───────────────────────────────────────────────────────────────┤
│      │  ┌──────── COMMAND BAR (persistent) ───────────────────────┐  │
│ RAIL │  │ [Search]  [Chat slot] [Apply slot] [Embed slot] [LightRAG]│ │
│      │  └──────────────────────────────────────────────────────────┘  │
│      │                                                                │
│ Logo │  ┌──────── CONTENT (scrollable per tab) ──────────────────┐   │
│ ----  │  │                                                        │   │
│ Icon │  │  H1 + KPIs                                            │   │
│ Icon │  │                                                        │   │
│ Icon │  │  Cards y sections del tab activo                      │   │
│ Icon │  │                                                        │   │
│ Icon │  │                                                        │   │
│ Icon │  │                                                        │   │
│      │  │                                                        │   │
│ [×]  │  │                                                        │   │
└──────┴──┴────────────────────────────────────────────────────────────┘
```

Estructura DOM sugerida (en el plugin):

```html
<div class="nc-settings-root">
  <aside class="nc-rail">
    <div class="nc-rail__logo"><!-- BrainLogo --></div>
    <button class="nc-rail__tab is-active" data-tab="providers">…</button>
    <button class="nc-rail__tab" data-tab="models">…</button>
    <!-- … -->
  </aside>

  <main class="nc-main">
    <header class="nc-cmdbar">
      <div class="nc-search">…</div>
      <div class="nc-cmdbar__spacer"></div>
      <button class="nc-quickslot">Chat · gemini-3-flash-preview</button>
      <button class="nc-quickslot">Apply · gemini-2.0-flash</button>
      <button class="nc-quickslot">Embed · text-embedding-004</button>
      <span class="nc-status nc-status--online">LightRAG</span>
    </header>

    <section class="nc-content" data-active-tab="models">
      <!-- contenido del tab activo -->
    </section>
  </main>
</div>
```

---

## Tabs (6 en total)

El rail de la izquierda contiene en orden:

1. **Providers** — `key` icon (Lucide: `key-round`)
2. **Models** — `cpu` icon (Lucide: `cpu`)
3. **Chat** — `message` icon (Lucide: `message-square`)
4. **Graph & Vault** — `graph` icon (Lucide: `share-2` o `network`)
5. **Tools (MCP)** — `wrench` icon (Lucide: `wrench`)
6. **Advanced** — `gear` icon (Lucide: `settings-2`)

State: una sola variable de tab activo. Al hacer click, se cambia el atributo `data-active-tab` del contenedor `.nc-content` y se re-renderiza.

---

## Componentes globales

### 1. Brain Logo (rail header)

- 40×40 px, `border-radius: 10px` (≈ 0.26 × size).
- Background: color de acento (default `var(--interactive-accent)`, el morado actual del plugin).
- Glyph: icono de Obsidian/Lucide `brain` en blanco, 60% del tamaño del tile (24px).
- Sombra: `0 6px 16px rgba(124, 58, 237, 0.2)` (color de acento al 20%).
- Highlight superior interno: `inset 0 1px 0 rgba(255,255,255,0.08)`.

### 2. Rail (sidebar de iconos)

- Width: **64px**, fixed.
- Background: `var(--background-secondary-alt)` (más oscuro que el contenido).
- Border-right: `1px solid var(--background-modifier-border)`.
- Padding: `14px 0`.
- Cada botón de tab: **44×44 px**, `border-radius: 10px`.
  - Inactive: `background: transparent`, `color: var(--text-muted)`.
  - Active: `background: var(--interactive-accent-hover)` con `opacity 0.16` (o usar `color-mix`), `color: var(--interactive-accent)`.
  - Active marker: barra vertical de **3px × 24px** pegada a la izquierda del rail (`left: -8px`, vertically centered), color `var(--interactive-accent)`, `border-radius: 3px`.
- Tooltip nativo (`title` attribute) con el nombre del tab.
- Icono: **17px**, stroke `2px`.
- Al final del rail (push to bottom): botón cerrar (×) opcional — en Obsidian normalmente no hace falta porque el modal de Settings ya tiene su cierre.

### 3. Command Bar (persistent)

- Height: ~52px.
- Background: `var(--background-secondary)`.
- Border-bottom: `1px solid var(--background-modifier-border)`.
- Padding: `10px 22px`.
- `display: flex; align-items: center; gap: 14px`.

**Contenido (en orden):**

- **Search input** (`width: 260px`):
  - Background: `var(--background-modifier-form-field)`.
  - Border: `1px solid var(--background-modifier-border)`, `border-radius: 6px`.
  - Padding: `6px 10px`.
  - Icono lupa (Lucide `search`, 13px) a la izquierda en `var(--text-muted)`.
  - Placeholder: `"⌘K  Buscar settings…"`.
  - Comportamiento: filtra todos los settings de todos los tabs (búsqueda global). Al escribir, mostrar resultados en un dropdown debajo del input con `[tab name] › [setting name]`. Enter navega al setting.

- **Spacer** (`flex: 1`).

- **3 Quick-slots** (uno por slot: Chat, Apply, Embed):
  - `display: inline-flex; align-items: center; gap: 8px`.
  - Padding: `5px 10px 5px 7px`, `border-radius: 7px`.
  - Background: `var(--background-primary-alt)`, border `1px solid var(--background-modifier-border)`.
  - Estructura interna:
    - **ProviderChip** (22px, color del provider — ver sección Providers).
    - Texto en dos líneas:
      - Label arriba: `"CHAT"` / `"APPLY"` / `"EMBED"`, `uppercase`, `letter-spacing: 0.08em`, `font-size: 9.5px`, `font-weight: 600`, `color: var(--text-faint)`.
      - Modelo abajo: `font-family: monospace`, `font-size: 11.5px`, `color: var(--text-normal)`.
    - Chevron-down (Lucide, 11px) a la derecha en `var(--text-faint)`.
  - Click → abre un dropdown con la lista de modelos activos de ese tipo. Permite cambiar el modelo activo sin navegar a la pestaña Models.

- **LightRAG status pill**:
  - Padding: `4px 10px`, `border-radius: 999px`.
  - Background: `var(--background-modifier-success)` o equivalente (verde suave: `rgba(63, 185, 80, 0.14)`).
  - Color: verde `#3fb950` (o `var(--color-green)`).
  - Dot de 7px a la izquierda del texto en el mismo verde.
  - Texto: `"LightRAG"`.
  - Click → abre el tab "Graph & Vault" directamente.
  - Si el servidor está caído: cambia a rojo (`var(--background-modifier-error)` + `#f85149`) con texto `"LightRAG offline"`.

### 4. KPI block (header de tab)

Cada tab principal (Models, Providers, Graph & Vault) tiene un header con:

```
CONFIGURACIÓN                        [KPI] [KPI] [KPI]
Models                               12     16    5
                                     activos disp. providers
```

- Eyebrow `"CONFIGURACIÓN"`: 11px, `uppercase`, `letter-spacing: 0.1em`, `font-weight: 600`, `color: var(--text-faint)`.
- H1: **26px**, `font-weight: 700`, `letter-spacing: -0.02em`, `color: var(--text-normal)`. Margin-top: 6px.
- KPIs a la derecha: cada uno es `text-align: right`, número grande en monospace 22px/700, label debajo en 11px uppercase faint.
- KPI "principal" (ej. modelos activos) usa el color de acento en el número.

### 5. Provider Chip

Avatar circular/rectangular de 16/18/22/26/32/36/40px (según contexto). Mapping de colores:

| Provider     | Background  | FG       | Letter |
|--------------|-------------|----------|--------|
| `anthropic`  | `#cd6f47`   | `#fff`   | `A`    |
| `openai`     | `#0d8c6d`   | `#fff`   | `O`    |
| `gemini`     | `#4285f4`   | `#fff`   | `G`    |
| `ollama`     | `#3d3d3d`   | `#fff`   | `O`    |
| `perplexity` | `#1FB8CD`   | `#fff`   | `P`    |
| `deepseek`   | `#3056ff`   | `#fff`   | `D`    |
| `groq`       | `#f55036`   | `#fff`   | `G`    |
| `mistral`    | `#ff7000`   | `#fff`   | `M`    |
| `openrouter` | `#6b7280`   | `#fff`   | `O`    |
| `lm-studio`  | `#0ea5e9`   | `#fff`   | `L`    |
| `morph`      | `#a855f7`   | `#fff`   | `M`    |
| custom       | `#374151`   | `#fff`   | initial|

Estilo: `border-radius: 6px` (para todos los tamaños), `font-weight: 700`, `font-size: ~50% del size del chip`, `letter-spacing: -0.02em`, contenido centrado.

> **Mejora opcional:** usar SVG logos reales de cada provider en vez de la inicial, si el plugin los puede empacar.

### 6. Toggle (Obsidian-style)

Reutilizar la API nativa de Obsidian (`new Setting(el).addToggle(t => …)`). Si se necesita una versión standalone fuera del componente `Setting`, hacerla coincidir con la nativa:
- Off: `32px × 18px`, background `var(--background-modifier-border)`, knob blanco de `14px`.
- On: background `var(--interactive-accent)`, knob a la derecha.
- Transition: `120ms ease-out` en background y left position del knob.

### 7. Badge / Status pill

Pequeño pill de status. Variantes:

| Tone     | Background                              | FG                        | Uso                          |
|----------|-----------------------------------------|---------------------------|------------------------------|
| neutral  | `var(--background-modifier-border)`     | `var(--text-muted)`       | "Custom", "Local"            |
| success  | `rgba(63, 185, 80, 0.14)`               | `#3fb950`                 | "Connected", "Activo", "Online" |
| warn     | `rgba(210, 153, 34, 0.14)`              | `#d29922`                 | warnings de coste            |
| danger   | `rgba(248, 81, 73, 0.14)`               | `#f85149`                 | errores, "Disconnected"      |
| accent   | `var(--interactive-accent)` @ 16%       | `var(--interactive-accent)` | "Activo" en Embedding       |

Estilo: `padding: 2px 7px`, `border-radius: 999px`, `font-size: 11px`, `font-weight: 500`. Opcionalmente con dot circular de 6px del mismo color a la izquierda del texto.

### 8. Card

El bloque visual base de todo el contenido. Estructura:

```css
.nc-card {
  padding: 14px;
  border-radius: 12px;
  background: var(--background-primary-alt);
  border: 1px solid var(--background-modifier-border);
}
.nc-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: var(--text-normal);
  font-size: 13.5px;
  font-weight: 600;
}
.nc-card__title svg { color: var(--interactive-accent); }
```

### 9. SettingRow (compat con la API de Obsidian)

Si se construye con la API nativa, simplemente envolver `new Setting(parentEl)` dentro de un `.nc-card`. Si se construye manualmente:

```
[ Name (13.5px, weight 500)          ]  [ control ]
[ Desc (12px, muted, line-height 1.5)]
```

- Padding vertical: `14px` (o `10px` en modo dense).
- Border-top entre rows: `1px solid var(--background-modifier-border)` (excepto la primera, marcada como `borderless`).

---

## Contenido de cada tab

### Tab 1 · Providers

**Header:**
- Eyebrow + H1 "Providers".
- Botón CTA arriba a la derecha: `"+ Add provider"` (variant cta, color de acento, blanco).

**Sección "Tus providers":**

Grid `repeat(2, 1fr)` con gap `10px`. Cada card:

```
[ProviderChip 40px] [Nombre + badge "Custom"?]   [Edit ⌃]
                    [● Connected · sk-…7Hq2  ]
```

- Card: `padding: 14px`, `border-radius: 10px`, mismo styling que `.nc-card`.
- Nombre: 14px / 600 / `var(--text-normal)`.
- Badge "Custom" si es un provider personalizado.
- Badge "Connected" (success, con dot) o "Local" (neutral, con dot) según `status`.
- API key enmascarada: monospace, 11px, `var(--text-faint)`, truncada con ellipsis.
- Botón "Edit" a la derecha: border `1px solid var(--background-modifier-border)`, padding `5px 8px`, border-radius `6px`, con icono Lucide `pencil` 12px.

**Sección "Más providers":**

Wrap de pills disponibles para añadir. Cada pill:
- `padding: 7px 12px 7px 8px`, `border-radius: 8px`.
- Background: `var(--background-primary-alt)`.
- Border: `1px dashed var(--background-modifier-border)` (dashed indica "no configurado aún").
- ProviderChip 20px + nombre + Lucide `plus` 11px.
- Cursor pointer. Click → modal para añadir API key.

Lista actual: `perplexity`, `deepseek`, `groq`, `mistral`, `openrouter`, `lm-studio`, `morph`.

**Datos de ejemplo (PROVIDERS):**
```js
[
  { id: 'anthropic',  name: 'Anthropic', status: 'connected', keyMasked: 'sk-ant-…7Hq2' },
  { id: 'openai',     name: 'OpenAI',    status: 'connected', keyMasked: 'sk-…4kPm' },
  { id: 'gemini',     name: 'Gemini',    status: 'connected', keyMasked: 'AIza…9vXc' },
  { id: 'ollama',     name: 'Ollama',    status: 'local',     keyMasked: 'http://localhost:11434' },
  { id: 'my-qwen',    name: 'My-Qwen',   status: 'connected', keyMasked: 'sk-…8Lm3', custom: true },
]
```

---

### Tab 2 · Models (el más importante)

**Header KPIs:**
- Eyebrow "CONFIGURACIÓN" + H1 "Models".
- A la derecha, 3 KPIs: `activos` (color de acento), `disponibles`, `providers`.

**Toolbar:**
- Search input ancho 280px placeholder `"Buscar entre 16 modelos…"`.
- Botón "Solo activos" (variant default con icono `zap`).
- Botón CTA "+ Add custom model".

**Lista agrupada por provider:**

Cada grupo es una "tarjeta provider" con:

```
┌──────────────────────────────────────────────────────┐
│ [ProviderChip 36px] Anthropic         [3 ON badge]  │
│                     4 modelos · 3 habilitados        │
├──────────────────────────────────────────────────────┤
│  claude-opus-4-1     ○      │  claude-sonnet-4.5  ⭐ ●│
│  claude-haiku-4.5    ●      │  claude-sonnet-3.7  ○  │
└──────────────────────────────────────────────────────┘
```

- Card: `border-radius: 12px`, `border 1px var(--background-modifier-border)`, background `var(--background-primary-alt)`, overflow hidden, sombra `0 1px 0 rgba(0,0,0,0.2)`.
- Header del grupo:
  - Padding `14px 16px`.
  - Background con gradiente sutil: `linear-gradient(90deg, transparent, var(--background-secondary))`.
  - Border-bottom: `1px solid var(--background-modifier-border)`.
  - Provider chip 36px + nombre 15px/700 capitalizado + counter "N modelos · M habilitados" en 11.5px faint.
  - Badge "M ON" tone accent dot, a la derecha, solo si hay activos.
- Contenido:
  - Grid `repeat(2, 1fr)`.
  - Cada modelo: `padding 10px 14px`, separadores con `border-right` y `border-top` formando una cuadrícula sutil.
  - ID en monospace 12px.
  - Si el modelo está activo: background del cell con gradient sutil del color de acento: `linear-gradient(90deg, rgba(124,58,237,0.16), transparent)`.
  - Star ⭐ (Lucide `star`) si es favorito.
  - Toggle a la derecha (Obsidian-style, size sm).

**Lista de modelos de ejemplo (CHAT_MODELS):**
```js
[
  { id: 'claude-opus-4-1',          provider: 'anthropic', enabled: false },
  { id: 'claude-sonnet-4.5',        provider: 'anthropic', enabled: true, favorite: true },
  { id: 'claude-haiku-4.5',         provider: 'anthropic', enabled: true },
  { id: 'gpt-5',                    provider: 'openai',    enabled: false },
  { id: 'gpt-5-mini',               provider: 'openai',    enabled: false },
  { id: 'gpt-4.1',                  provider: 'openai',    enabled: false },
  { id: 'gpt-4o',                   provider: 'openai',    enabled: true },
  { id: 'gpt-4o-mini',              provider: 'openai',    enabled: false },
  { id: 'o3',                       provider: 'openai',    enabled: false },
  { id: 'gemini-2.5-pro',           provider: 'gemini',    enabled: true },
  { id: 'gemini-2.5-flash',         provider: 'gemini',    enabled: true },
  { id: 'gemini-2.5-flash-lite',    provider: 'gemini',    enabled: true },
  { id: 'gemini-3-flash-preview',   provider: 'gemini',    enabled: true, favorite: true },
  { id: 'sonar-pro',                provider: 'perplexity',enabled: false },
  { id: 'sonar-reasoning',          provider: 'perplexity',enabled: false },
  { id: 'morph-v0',                 provider: 'morph',     enabled: false },
]
```

**Sub-sección "Embedding models":**

`SectionHeading` ("Embedding models" + desc "Para vectorización de notas (RAG)" + botón "+ Add").

Grid `repeat(2, 1fr)` gap 8px. Cada item:
- ProviderChip 22px + ID monospace 11.5px + dim "768 dim" en faint 10.5px.
- Si es el activo: background `var(--accent-soft)` (16%), border `1px solid color-mix(in srgb, var(--interactive-accent) 40%, transparent)`, badge "Activo" tone accent.

Datos:
```js
[
  { id: 'text-embedding-3-small', provider: 'openai',  dim: 1536 },
  { id: 'text-embedding-3-large', provider: 'openai',  dim: 3072 },
  { id: 'text-embedding-004',     provider: 'gemini',  dim: 768, active: true },
  { id: 'nomic-embed-text',       provider: 'ollama',  dim: 768 },
  { id: 'mxbai-embed-large',      provider: 'ollama',  dim: 1024 },
  { id: 'bge-m3',                 provider: 'ollama',  dim: 1024 },
  { id: 'gemini-embedding-001',   provider: 'gemini',  dim: 3072 },
]
```

---

### Tab 3 · Chat

**Header:** Eyebrow + H1 "Chat" (sin KPIs).

**Layout:** Grid `1.4fr 1fr` con gap 14px.

**Card izquierda · "System prompt":**
- Icon `message-square` accent + título "System prompt".
- Desc: "Se añade al inicio de cada conversación nueva".
- Textarea: width 100%, min-height 110px, padding 10px, border-radius 8px, background `var(--background-secondary)`, border `1px solid var(--background-modifier-border)`, monospace 12px, resize vertical.

**Card derecha · "Comportamiento":**
- 3 SettingRows densos:
  - "Include current file" (toggle, ON)
  - "Enable tools" (toggle, OFF)
  - "Max auto tools" (number input width 50px, default 1)

**Sección "Prompt templates":**
- SectionHeading + CTA "+ Nueva".
- Estado vacío: padding 40px, border `1px dashed`, color faint, texto "Aún no hay plantillas".
- Estado lleno: lista de cards con name, preview y acciones (Edit, Delete).

---

### Tab 4 · Graph & Vault

**Header:** Eyebrow + H1 "Graph & Vault".

**Hero card · "LightRAG Server":**

```
┌────────────────────────────────────────────────────┐
│ [⚡] LightRAG Server           [● Online badge]    │
│      http://localhost:9622                          │
│                                                     │
│  [1,348]   [4,712]   [11,290]   [0]                │
│  Notas    Entidades  Relaciones  Pendientes        │
│                                                     │
│  [Restart] [Review .env] [Reprocess failed]        │
└────────────────────────────────────────────────────┘
```

- Padding 18px, border-radius 12px.
- Background con gradient sutil success: `linear-gradient(135deg, rgba(63,185,80,0.14), transparent 60%), var(--background-primary-alt)`.
- Icon 36×36 con `border-radius: 10px`, background success soft, color verde, glyph `zap` 16px.
- Title 14/700 + URL monospace 11.5px muted.
- Badge "Online" tone success con dot.
- Stats: grid 4 columnas. Cada stat: número 20px/700 monospace, label 10.5px uppercase faint.
- Botones: "Restart" (cta), "Review .env" (default), "Reprocess failed" (ghost).

**Grid de cards 2×2 (Connection / Vault sync):**

Card "Connection" (icon `link`):
- "Remote server" (toggle)
- "Server URL" (text input monospace, default `http://localhost:9622`)
- "API key" (text input, placeholder "Vacío")

Card "Vault sync" (icon `folder`):
- "Watched folder" (text input, default "Papers", desc "Vacío = todo el vault")
- "Show citations" (toggle, desc "Footnotes [1]")
- "Summary language" (select, default "Español")

**`<details>` colapsable "Ontology, Reranking, Visualization":**

Marcador "Avanzado" a la derecha. Al expandir, muestra:
- Ontology: "Custom entity types" (toggle)
- Reranking: "Rerank provider" (select), "Rerank model" (text input)
- Visualization: "Rendering engine" (select 2D/3D)

---

### Tab 5 · Tools (MCP)

**Header:** Eyebrow + H1 "Tools · MCP" (el "· MCP" más pequeño y faint).

**Warning callout:**
- Background warn soft, border `1px solid rgba(210,153,34,0.2)`.
- Icon `info` warn.
- Texto: "**Atención al consumo:** los resultados de las tools se inyectan en el contexto del LLM. Resultados largos pueden aumentar significativamente el coste por mensaje."

**CTA arriba:** "+ Add MCP Server" (variant cta).

**Estado vacío:**
- Padding 60px, border `2px dashed`, border-radius 12px, background `var(--background-primary-alt)`.
- Icon `wrench` en tile accent-soft 48px.
- Texto 14/600 "Aún no hay servidores MCP" + sub 12.5px "Conecta servidores para que la IA pueda usar herramientas externas".

**Estado lleno (no incluido en mock, pero a implementar):**
- Cards por servidor con: nombre, comando, estado (running/stopped), número de tools expuestas, toggle de habilitar.

---

### Tab 6 · Advanced

**Header:** Eyebrow + H1 "Advanced".

**Card única con 3 SettingRows:**
- "Edit .env variables" — desc "Configuración cruda del servidor LightRAG" — botón "Abrir" (icon `pencil`).
- "Restart server" — desc "Aplica cambios de configuración" — botón CTA "Restart" (icon `refresh-ccw`).
- "Reprocess failed documents" — desc "Re-ejecutar extracción en documentos fallidos" — botón "Reprocess".

Las settings avanzadas que no caben aquí (reranking, ontology) están dentro del `<details>` del tab Graph & Vault.

---

## Design Tokens

### Colores — propuesta (dark mode reference)

| Token             | Mock value           | Mapeo a Obsidian                                  |
|-------------------|----------------------|---------------------------------------------------|
| Background base   | `#1e1e1e`            | `var(--background-primary)`                       |
| Background alt    | `#181818`            | `var(--background-primary-alt)`                   |
| Background sec    | `#161616`            | `var(--background-secondary)`                     |
| Background sec-alt| `#111111`            | `var(--background-secondary-alt)`                 |
| Border            | `#2a2a2a`            | `var(--background-modifier-border)`               |
| Border hover      | `#3a3a3a`            | `var(--background-modifier-border-hover)`         |
| Form field        | `#1a1a1a`            | `var(--background-modifier-form-field)`           |
| Text normal       | `#dcddde`            | `var(--text-normal)`                              |
| Text muted        | `#a3a3a3`            | `var(--text-muted)`                               |
| Text faint        | `#6e6e6e`            | `var(--text-faint)`                               |
| **Accent**        | `#7c3aed` (violeta)  | `var(--interactive-accent)` — tema del usuario    |
| Accent hover      | `#8b5cf6`            | `var(--interactive-accent-hover)`                 |
| Accent soft       | `rgba(124,58,237,.16)`| `color-mix(in srgb, var(--interactive-accent) 16%, transparent)` |
| Text accent       | `#a78bfa`            | `var(--text-accent)` (cuando exista) o accent     |
| Success           | `#3fb950`            | `var(--color-green)` (Obsidian 1.5+) o hardcoded  |
| Success soft      | `rgba(63,185,80,.14)`| `color-mix(in srgb, var(--color-green) 14%, transparent)` |
| Warn              | `#d29922`            | `var(--color-yellow)` o hardcoded                 |
| Danger            | `#f85149`            | `var(--color-red)` o hardcoded                    |

> **Importante:** el morado violeta `#7c3aed` que usa el mock es solo el default. En el plugin, **debe respetar `var(--interactive-accent)`** para que cambie con el tema del usuario. El BrainLogo del rail también usa este accent.

### Tipografía

| Uso                  | Family                    | Size  | Weight | Letter-spacing | Color                |
|----------------------|---------------------------|-------|--------|----------------|----------------------|
| Eyebrow              | Inter / system            | 11    | 600    | 0.10em         | text-faint, uppercase|
| H1 (tab title)       | Inter / system            | 26    | 700    | -0.02em        | text-normal          |
| Card title           | Inter / system            | 13.5  | 600    | normal         | text-normal          |
| Section heading      | Inter / system            | 14    | 600    | -0.005em       | text-normal          |
| Setting name         | Inter / system            | 13.5  | 500    | normal         | text-normal          |
| Setting desc         | Inter / system            | 12    | 400    | normal         | text-muted, lh 1.5   |
| Badge                | Inter / system            | 11    | 500    | 0.005em        | (tone-specific)      |
| KPI number           | JetBrains Mono / monospace| 22    | 700    | -0.02em        | (accent o normal)    |
| Stat number (hero)   | JetBrains Mono / monospace| 20    | 700    | -0.01em        | text-normal          |
| Model ID             | JetBrains Mono / monospace| 12-12.5| 400   | normal         | text-normal/muted    |
| Quick-slot label     | Inter / system            | 9.5   | 600    | 0.08em         | text-faint, uppercase|

> Obsidian ya carga Inter por defecto en `var(--font-interface)`. Para monospace usa `var(--font-monospace)`. **No es necesario importar fuentes** — el plugin debe usar las del usuario.

### Spacing scale

- 4, 6, 8, 10, 12, 14, 16, 18, 22, 28, 32, 40, 48, 60 px

### Border radius

- 5, 6, 7, 8, 10, 12, 999 (pill)
- Default para cards: **12px**
- Default para botones: **6px**
- Default para inputs: **6px**
- Brain logo: 10px (~0.26 × size)

### Shadows

- Card sutil: `0 1px 0 rgba(0,0,0,0.2)` (solo en dark)
- Modal: `0 30px 60px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04)` (no aplicable — Obsidian gestiona el modal)
- Brain logo: `0 6px 16px rgba(124, 58, 237, 0.2)` + inset `0 1px 0 rgba(255,255,255,0.08)`

---

## Interactions & Behavior

### Navegación entre tabs

- Click en tab del rail → cambia `activeTab` en state → re-render del `.nc-content`.
- Transition opcional: `opacity 0.15s` al cambiar contenido.
- Persistir `activeTab` en `localStorage` (clave `neural-composer-settings-active-tab`) para que recuerde el último tab visitado.

### Quick-slots (command bar)

- Click → abre un `<select>`-like dropdown (o el Suggester de Obsidian) con la lista de modelos **habilitados** del tipo correspondiente (chat / apply / embedding).
- Selección → actualiza el setting correspondiente del plugin (`settings.activeChatModel`, etc.), guarda, y refresca la UI.
- Si no hay modelos habilitados de ese tipo → dropdown muestra "Ningún modelo habilitado — ve a Models" y al hacer click navega al tab Models.

### Búsqueda global

- Tipear en el search input → filtrar todos los settings de todos los tabs (matching contra setting name + desc + tab name).
- Mostrar resultados en un dropdown debajo del input, formato: `[Tab name] › [Setting name]` (ej. "Chat › Include current file").
- Click en resultado → navega al tab correspondiente + scroll-into-view del setting + highlight breve (3s) con outline accent.
- Shortcut: `Cmd/Ctrl + K` enfoca el input.

### Toggles

- Animación de 120ms.
- En settings con consecuencias (ej. "Enable tools"), opcionalmente mostrar `Notice` de Obsidian al cambiar.

### Validación

- API keys: validar formato básico al perder foco. Mostrar dot rojo + tooltip si formato inválido.
- URLs de servidor: validar que sea URL válida. Botón "Restart server" deshabilitado si la URL es inválida.

### Estado vacío de Models filtrado

- Si search no devuelve resultados: card único centrado con "Ningún modelo coincide con tu búsqueda" + botón "Limpiar filtros".

---

## State Management

Variables de estado (componente raíz):

```ts
{
  activeTab: 'providers' | 'models' | 'chat' | 'graph' | 'tools' | 'advanced',
  searchQuery: string,
  expandedProviderGroups: Record<string, boolean>,
  showOnlyEnabled: boolean,                // toggle del filter en Models
  // settings persistidos vía plugin.saveData():
  activeChatModel: string,
  activeApplyModel: string,
  activeEmbeddingModel: string,
  enabledChatModels: Set<string>,
  enabledEmbeddingModels: Set<string>,
  providers: Record<string, { apiKey: string, baseUrl?: string, status: 'connected'|'local'|'disconnected' }>,
  systemPrompt: string,
  includeCurrentFile: boolean,
  enableTools: boolean,
  maxAutoTools: number,
  lightragServerUrl: string,
  lightragApiKey: string,
  watchedFolder: string,
  showCitations: boolean,
  summaryLanguage: string,
  // …
}
```

Persistencia: `await this.plugin.saveSettings()` después de cada cambio.

Lectura inicial: en `onOpen()` / `display()` del `PluginSettingTab`, cargar desde `this.plugin.settings`.

Estado en vivo: si el servidor LightRAG cambia de estado (online/offline), reflejarlo en la pill de la command bar. Poll cada 30s, o websocket si el server lo soporta.

---

## Implementación sugerida (Obsidian-specific)

### Estructura de archivos en el plugin

```
src/
  settings/
    NeuralComposerSettingTab.ts     ← clase principal (extends PluginSettingTab)
    components/
      Rail.ts                        ← rail de iconos
      CommandBar.ts                  ← command bar persistent
      tabs/
        ProvidersTab.ts
        ModelsTab.ts
        ChatTab.ts
        GraphTab.ts
        ToolsTab.ts
        AdvancedTab.ts
      shared/
        Card.ts
        ProviderChip.ts
        Badge.ts
        StatBlock.ts
    styles.css                       ← @imported desde main styles.css
```

### Esqueleto del SettingTab principal

```ts
import { PluginSettingTab, App, setIcon } from 'obsidian';

export class NeuralComposerSettingTab extends PluginSettingTab {
  plugin: NeuralComposerPlugin;
  activeTab: TabId = 'models';

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('nc-settings-root');

    this.renderRail(containerEl);
    const main = containerEl.createDiv('nc-main');
    this.renderCommandBar(main);
    const content = main.createDiv('nc-content');
    this.renderTab(content, this.activeTab);
  }

  private switchTab(tab: TabId) {
    this.activeTab = tab;
    this.display();  // o solo re-render del content
  }

  // … renderRail, renderCommandBar, renderTab(content, tabId) …
}
```

### CSS — variables custom del plugin

```css
.nc-settings-root {
  --nc-rail-width: 64px;
  --nc-cmdbar-height: 52px;
  --nc-card-radius: 12px;
  --nc-tab-radius: 10px;

  display: flex;
  height: 100%;
  background: var(--background-primary);
  color: var(--text-normal);
}

.nc-rail { /* … */ }
.nc-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.nc-cmdbar { /* … */ }
.nc-content {
  flex: 1;
  overflow: auto;
  padding: 20px 28px 32px;
}

/* … */
```

> **Importante:** todo el CSS debe ir scopeado bajo `.nc-settings-root` para no contaminar otros plugins.

---

## Assets

- **Brain icon**: usar `setIcon(el, 'brain')` de Obsidian — Lucide `brain` ya está incluido. No necesitas archivo externo.
- **Provider icons**: por ahora se usan iniciales sobre fondos de color. Si quieres SVGs reales:
  - Anthropic: hay logo oficial en su web.
  - OpenAI: idem.
  - Gemini: idem.
  - Para los menores (groq, mistral, perplexity), considera mantener iniciales para uniformidad.
- **Lucide icons usados** (todos vía `setIcon`):
  - `brain`, `key-round`, `cpu`, `message-square`, `share-2`, `wrench`, `settings-2`
  - `search`, `chevron-down`, `chevron-right`, `plus`, `pencil`, `trash-2`, `refresh-ccw`
  - `star`, `zap`, `link`, `folder`, `info`, `x`, `check`

---

## Lo que sigue del prototipo (para futuras iteraciones)

- **Estado del servidor LightRAG**: la pill verde de la command bar debería reflejar polling real.
- **Onboarding**: si es la primera vez que se abre el plugin (sin providers configurados), mostrar un estado especial en el tab Providers ("Comienza añadiendo tu primera API key…").
- **Import/export de settings**: añadir botón en Advanced para exportar todas las settings a JSON e importarlas en otra máquina.
- **Búsqueda con keyboard navigation**: ↑↓ en resultados, Enter para ir, Esc para cerrar.
- **Reordenar quick-slots**: drag&drop para personalizar qué slots se muestran en la command bar.
