# Configuration

The settings panel (**Settings → Neural Composer**) has a sidebar with seven tabs. This page explains every option in each tab.

The dashboard fills the available settings pane, including the separate settings window. Resize it freely: the navigation rail, model menu, and settings content scroll independently in small windows; wide model tables can also scroll horizontally. On mobile, controls stay below Obsidian's header and safe-area inset.

[screenshot: full settings panel — sidebar showing the 7 tabs: Providers, Models, Chat, Graph & Vault, Tools (MCP), Advanced, Help]

---

## Providers

This tab manages which AI providers the plugin can use and stores your API credentials.

[screenshot: Providers tab — showing a list of provider rows, each with a name and masked API key field]

**Supported providers:**

| Provider    | Type  | Notes                                             |
| :---------- | :---- | :------------------------------------------------ |
| OpenAI      | Cloud | GPT-4o, GPT-4.1, o3, etc.                       |
| Anthropic   | Cloud | Claude 3.x / 4.x models                         |
| Gemini      | Cloud | Google's Gemini family                           |
| Groq        | Cloud | Fast inference, Llama/Mixtral models             |
| Deepseek    | Cloud | Deepseek-chat and Deepseek-reasoner              |
| Mistral     | Cloud | Mistral and Mixtral models                       |
| Perplexity  | Cloud | Search-augmented models                          |
| OpenRouter  | Cloud | Unified gateway to many providers                |
| Ollama      | Local | Fully offline; no API key required               |
| LM Studio   | Local | Local model runner with an OpenAI-compatible API |
| Morph       | Cloud | Code-focused model for the Apply step            |

For each cloud provider, paste the API key into the corresponding field. Keys are stored only in Obsidian's local `data.json` and are never sent anywhere except the provider's own API endpoint.

For Ollama and LM Studio, enter the base URL of their local API server (defaults: `http://localhost:11434` and `http://localhost:1234`). No API key is needed.

---

## Models

Three model slots to configure:

[screenshot: Models tab — three dropdowns: Chat model, Apply model, Embedding model]

| Slot                | Purpose                                                                                 |
| :------------------ | :-------------------------------------------------------------------------------------- |
| **Chat model**      | Answers your questions in the chat pane. Choose for quality and cost. |
| **Apply model**     | Applies a suggested edit back into your note. A fast, cheap model works well here. |
| **Embedding model** | Converts text to vectors for similarity search. Must match the model LightRAG was indexed with. |

> **Important:** After changing the embedding model, re-ingest your notes so the stored embeddings stay consistent with the new model.

---

## Chat

Controls the behavior of the chat pane.

[screenshot: Chat tab — showing the three toggles/fields described below]

| Setting | Default | What it does |
| :--- | :--- | :--- |
| **Include current file content** | On | Automatically attaches the content of the note you have open in the editor to every message. Useful when asking questions about the file you're working on. |
| **Enable tools** | On | Allows the AI to use MCP tools and built-in vault tools (e.g., reading or editing notes). Disable if you want pure chat with no side-effects. |
| **Max auto-iterations** | 1 | How many times the model can automatically call a tool and loop back before stopping and showing you the result. Increase for complex tool-use workflows; lower to 1 for predictable output. |

**System prompt**

A free-text field appended to every chat request before the user message. Use this to give the model standing instructions — e.g., *"Always answer in Spanish"* or *"You are my research assistant. Be concise."*

---

## Graph & Vault

Controls the LightRAG backend, vault integration, and ingestion behavior. This is the most important tab for initial setup.

[screenshot: Graph & Vault tab — full view showing all sections]

### Local vs. remote server

By default the plugin runs `lightrag-server` as a subprocess on your machine (**local mode**). Toggle **Use remote server** to connect to a LightRAG instance running elsewhere — on a NAS, VPS, or Docker container. When remote mode is on, a URL field appears.

[screenshot: detail of the "Use remote server" toggle and the URL input field that appears when it's enabled]

### Command path

The absolute path to the `lightrag-server` binary. Required for local mode only. See [Installation](Installation) Step 2 for how to find this path.

### Data directory

The folder where LightRAG stores the graph database, vector index, and cache files. Can be anywhere on your disk — it does not need to be inside the vault. Use a dedicated, empty folder. Do not put other files in it.

### Auto-start

When on, the plugin starts `lightrag-server` automatically when Obsidian opens, and stops it when Obsidian closes. Recommended for most users.

### Graph logic model

The LLM used by LightRAG internally to extract entities and relationships during ingestion. This is separate from your chat model. A cost-efficient model (e.g., `gemini-flash` or `gpt-4o-mini`) is usually sufficient.

### Embedding model (server-side)

The embedding model LightRAG uses on the server side. Must be consistent with the model used when the graph was first built. Changing this and re-ingesting will rebuild the vector index from scratch.

### Summary language

The language LightRAG uses when writing entity summaries into the graph. Defaults to English. Change this if your notes are primarily in another language.

### Citations

When enabled, chat responses include numbered citation markers (e.g., `[1]`) linked to the source documents and text chunks that were retrieved. Disable if you prefer cleaner output.

### Query mode

Controls the retrieval strategy used for each chat query. You can also change this per-query from the dropdown in the chat toolbar.

[screenshot: query mode dropdown in the chat toolbar showing the six options]

| Mode       | Best for                                                                 |
| :--------- | :----------------------------------------------------------------------- |
| **local**  | Precise factual questions — fast vector similarity search               |
| **global** | Broad, synthesizing questions — traverses entity relationships           |
| **hybrid** | A good default — combines local and global                               |
| **naive**  | Comparing output with and without graph traversal                        |
| **mix**    | Richest answers — weighted blend of all strategies; uses more tokens     |
| **bypass** | Questions unrelated to your vault — skips retrieval, goes straight to LLM |

### Watched folder

When set, Neural Composer watches this vault folder for file changes. Every time you save a note inside it, the plugin queues it for re-ingestion (with a 5-second debounce). Renames and deletes are handled automatically.

Leave this blank if you prefer to ingest manually via right-click → **Add to graph**.

### Reranking

Reranking runs a second-pass scoring model over retrieved chunks to improve result quality before the LLM sees them. Optional, but useful when dealing with very large graphs.

[screenshot: Reranking section — showing the provider dropdown (None / Jina AI / Cohere / Custom) and the fields that appear below it]

| Setting | Notes |
| :--- | :--- |
| **Provider** | None (off), Jina AI, Cohere, or Custom (local endpoint) |
| **Model** | The reranker model name. Jina default: `jina-reranker-v2-base-multilingual`. Cohere default: `rerank-english-v3.0`. |
| **API key** | Required for Jina AI and Cohere. Not needed for a custom local endpoint. |
| **Host** | Only shown for Custom — the base URL of your local reranking server. |

### Ontology (entity types)

Lets you teach the graph your domain's vocabulary so LightRAG extracts the right kinds of entities from your notes.

[screenshot: Ontology section — showing the toggle "Use custom entity types" and the textarea below it with example types]

Toggle **Use custom entity types** to enable. Then enter a comma-separated list of entity type names in the textarea (e.g., `Person, Experiment, Theorem, Location`). LightRAG will prioritize these types when building the graph.

> **LightRAG v1.5+ note:** Version 1.5 replaced the inline entity types list with a jinja2 template file. When Neural Composer detects a v1.5+ server, the textarea is replaced with a **file path** field — point it at a `.jinja2` template file in your data directory. A migration banner will appear in settings explaining the change.

---

## Advanced

### .env editor

LightRAG is configured via a `.env` file in its data directory. The Advanced tab includes a raw text editor for this file, letting you set options that the UI doesn't expose — for example, `LIGHTRAG_KV_STORAGE`, `LIGHTRAG_GRAPH_STORAGE`, or provider-specific environment variables.

[screenshot: Advanced tab — .env editor textarea with a few KEY=VALUE lines visible]

Changes to the `.env` file take effect after the next **Restart Server**.

### Performance tuning

| Setting                 | Default | What it does                                                                                   |
| :---------------------- | :------ | :--------------------------------------------------------------------------------------------- |
| **Chunk size**          | 1200    | Characters per text chunk before embedding. Larger = more context per chunk, more tokens per call. |
| **Chunk overlap**       | 100     | Characters shared between consecutive chunks. Prevents concepts from being split at boundaries. |
| **Async workers**       | 4       | Parallel workers during ingestion. Higher = faster ingestion, higher API concurrency and cost. |
| **Max parallel insert** | 1       | Parallel document inserts. Increase carefully — too high can overwhelm the LightRAG pipeline.  |

---

## Tools (MCP)

Neural Composer connects to external [Model Context Protocol](https://modelcontextprotocol.io/) servers and makes their tools available inside the chat pane. This tab is where you register those servers.

> Neural Composer is an MCP **client** — it calls tools *from* external servers. It does not expose itself as a server to other applications.

[screenshot: Tools (MCP) tab — showing an empty server list with an "Add MCP server" button]

### Adding an MCP server

Click **Add MCP server** and fill in:

| Field | Notes |
| :--- | :--- |
| **Name** | A label for your own reference (e.g., `GitHub`). |
| **Parameters** | A JSON object with `command`, optional `args`, and optional `env`. See below. |

### Parameters format

```json
{
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
  }
}
```

Paste only this inner object — do not wrap it in a `mcpServers` key.

See the [MCP Tools](MCP-Tools) page for full examples and troubleshooting.

---

## Help

The Help tab contains quick-start guidance, links to this wiki, and the current plugin and server version. Nothing to configure here — it's a reference panel you can consult without leaving Obsidian.

[screenshot: Help tab showing version badge, quick-start steps, and wiki link]
