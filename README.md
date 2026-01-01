# 🧠 Neural Composer

**Neural Composer** is the graph-based evolution of the *Smart Composer* plugin for Obsidian. 

It upgrades your note-taking experience by connecting Obsidian to a local **LightRAG (Graph RAG)** server. Instead of simple vector search, Neural Composer retrieves information based on **relationships** and deep context from your knowledge graph.

> **Forked from:** [Smart Composer](https://github.com/glowingjade/obsidian-smart-composer)
> **Developed by:** Oscar Campo & Cora (AI Co-Pilot)

## ✨ Features

*   **Graph Retrieval:** Queries your local LightRAG server using hybrid search (Vector + Knowledge Graph).
*   **Dual Mode:**
    *   **Chat:** Context-aware chat with specific files.
    *   **Vault Chat:** Deep search across your entire vault using the Knowledge Graph.
*   **Source Transparency:** See exactly which documents were used to generate the answer.
*   **Zero-Config Client:** Designed to work out-of-the-box with the standard LightRAG Server API.

## 🛠️ Prerequisites (The Backend)

This plugin acts as a **client**. You need the **LightRAG Server** running on your machine to act as the "brain".

1.  **Install LightRAG:**
    ```bash
    pip install "lightrag-hku[api]"
    ```

2.  **Run the Server:**
    Run the server pointing to your desired working directory (where your graph will live):
    ```bash
    lightrag-server --port 9621 --working-dir ./my_graph_data
    ```
    *(Note: Ensure the server is running on port **9621**, which is the default expected by Neural Composer).*

3.  **Ingest your Data:**
    Open the LightRAG WebUI (usually at `http://localhost:9621/webui`), go to the "Documents" tab, and upload your Obsidian markdown files to populate the graph.

## 🚀 Installation (The Plugin)

1.  Download `main.js`, `manifest.json`, and `styles.css` from the **[Releases](../../releases)** page.
2.  Create a folder named `obsidian-neural-composer` inside your vault's `.obsidian/plugins/` directory.
3.  Place the files in that folder.
4.  Open Obsidian Settings > Community Plugins > **Reload** > **Enable Neural Composer**.

## 💡 Usage

1.  Ensure `lightrag-server` is running in your terminal.
2.  Open Neural Composer in Obsidian.
3.  Select **Vault Chat**.
4.  Ask a question! (e.g., *"What are the main themes in my project X?"*).
5.  The plugin will query the Graph and provide an answer based on the relationships found in your notes.

## 🤝 Credits & License

*   Original UI/UX and core logic by [glowingjade](https://github.com/glowingjade) (Smart Composer).
*   Graph Integration logic by **Oscar Campo**.
*   Powered by [LightRAG](https://github.com/HKUDS/LightRAG).

MIT License.
