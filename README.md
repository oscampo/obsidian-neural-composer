# 🧠 Neural Composer

**Neural Composer** is the graph-based evolution of the *Smart Composer* plugin for Obsidian. 

It upgrades your note-taking experience by connecting Obsidian to a local **LightRAG (Graph RAG)** server. Instead of simple vector search, Neural Composer retrieves information based on **relationships** and deep context from your knowledge graph.

> **Forked from:** [Smart Composer](https://github.com/glowingjade/obsidian-smart-composer)
> 
> **Developed by:** Oscar Campo & Cora (AI Co-Pilot)

## ✨ New Features (v1.0.0)

*   **⚡ Automated Server Management:** The plugin manages the lifecycle of the LightRAG server. It can **auto-start**, **stop**, and **restart** the Python server directly from Obsidian.
*   **⚙️ Dynamic Configuration:** No need to manually edit `.env` files. The plugin automatically generates the server configuration based on your selected LLM and Embedding models in the settings.
*   **📥 Integrated Ingestion:** Add documents to your graph without leaving Obsidian.
    *   **Single Note:** Command to ingest the current file.
    *   **Batch Ingestion:** Right-click any folder to ingest all notes recursively.
*   **📊 Pipeline Monitoring:** Real-time progress indicators and status updates from the server during document processing.
*   **🕸️ Hybrid Retrieval:** 
    *   **Chat Mode:** Reads local files (`@filename`) directly for precision.
    *   **Vault Chat:** Queries the Global Knowledge Graph for deep, connected answers.
*   **🔍 Source Transparency:** View the exact text segments and files the AI used to construct its answer.

## 🛠️ Prerequisites

Neural Composer acts as a controller for the **LightRAG Server**. You need to have the Python environment set up on your machine.

1.  **Install Python (3.10+):** Ensure Python is installed.
2.  **Install LightRAG:**
    ```bash
    pip install "lightrag-hku[api]"
    ```
    *(Recommendation: Use a virtual environment `venv` or `conda` to keep dependencies clean).*

## 🚀 Installation & Setup

### 1. Install the Plugin
1.  Download `main.js`, `manifest.json`, and `styles.css` from the **[Releases](../../releases)** page.
2.  Create a folder named `obsidian-neural-composer` inside your vault's `.obsidian/plugins/` directory.
3.  Place the files there and **Enable** the plugin in Obsidian Settings.

### 2. Configure the Neural Backend
Go to **Settings > Neural Composer > Neural Backend (LightRAG)**.

1.  **LightRAG Command Path:** Enter the **absolute path** to the `lightrag-server` executable.
    *   *Windows (Virtual Env):* `C:\Users\[YourName]\Projects\my-env\Scripts\lightrag-server.exe`
    *   *Mac/Linux (Virtual Env):* `/home/[User]/projects/my-env/bin/lightrag-server`
    *   *Global Install:* `lightrag-server` (if added to system PATH).
2.  **Graph Data Directory:** Enter the absolute path to the folder where you want to store your graph data (Knowledge Base).
    *   *Example:* `C:\Users\[YourName]\Documents\MyGraphData`
3.  **Summary Language:** Enter the language of your notes (e.g., "Spanish", "English", "French").
    *   *Important:* This tells LightRAG how to extract entities and generate summaries. Matching your notes' language ensures better graph quality.
4.  **Auto-start LightRAG Server:** Toggle this **ON**.
5.  **Configure Models:** Go to the **Chat** and **Embedding** sections of the plugin settings and select your providers (e.g., Gemini, OpenAI, Ollama) and API Keys.
6.  Click **"Restart Server"**.

> **Magic:** The plugin will automatically create the necessary `.env` file in your data directory and launch the server for you!

## 💡 Usage

### Building Your Knowledge Graph (Ingestion)
Before the AI can answer questions about your vault, it needs to process your documents.

*   **Single File:** Open a note, open Command Palette (`Ctrl/Cmd + P`), and search for **"Neural Composer: Ingest current note"**.
*   **Entire Folder:** Go to the File Explorer, **Right-Click** on a folder (e.g., "Notes"), and select **"🧠 Ingest Folder into Graph"**.
    *   *Note:* You can monitor the processing status via the notifications inside Obsidian.

### Asking Questions (Retrieval)
1.  Open the Neural Composer view.
2.  Select **Vault Chat**.
3.  Ask complex questions: *"What are the connections between Project X and Project Y?"* or *"Summarize the main concepts from last week's notes."*
4.  Expand **"Show Referenced Documents"** to see the graph evidence.

## 🤝 Credits & License

*   **Core UI/UX:** [glowingjade](https://github.com/glowingjade) (Smart Composer).
*   **Graph Integration & Automation:** Oscar Campo.
*   **Backend Power:** [LightRAG](https://github.com/HKUDS/LightRAG).

MIT License.
