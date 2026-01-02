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

2.Configure the Server (.env)

You need to configure the LLM and Embedding model for LightRAG. 

1.  Create a `.env` file in the folder where you will run the server.
2.  You can copy the provided [`.env.example`](.env.example) file as a template.
3.  **Example Configuration (Google Gemini):**

    ```ini
    # General Configuration
	# Directory where the graph data will be stored
	WORKING_DIR=./my_graph_data
	
	# --- LLM Configuration (Gemini Example) ---
	# You can change this to 'openai', 'ollama', etc.
	LLM_BINDING=gemini
	LLM_MODEL=gemini-2.0-flash
	
	# --- Embedding Configuration (Gemini Example) ---
	EMBEDDING_BINDING=gemini
	EMBEDDING_MODEL=models/text-embedding-004
	EMBEDDING_DIM=768
	MAX_TOKEN_SIZE=2048
	
	# --- RAG Settings ---
	# Language for internal summaries and graph extraction
	SUMMARY_LANGUAGE=English
	
	# --- Server Network Settings ---
	# 0.0.0.0 allows access from local network (required for some Docker setups)
	HOST=0.0.0.0
	# Neural Composer expects port 9621 by default
	PORT=9621
	
	# --- API Keys ---
	# Uncomment and paste your key here. 
	# For Gemini, use GEMINI_API_KEY. For OpenAI, use OPENAI_API_KEY.
	# GEMINI_API_KEY=your_api_key_here
	# LLM_BINDING_API_KEY=your_api_key_here # <-- Also works
    ```

	> **Note:** This configuration uses Google Gemini (reliable and fast). If you prefer to use **Ollama (Local)**, **OpenAI**, or **Azure**, please refer to the official [LightRAG Configuration Docs](https://github.com/HKUDS/LightRAG) for the specific environment variables.

3. **Run the Server:**
    Run the server pointing to your desired working directory (where your graph will live):
    ```bash
    lightrag-server
    ```
    *(Note: Ensure the server is running on port **9621**, which is the default expected by Neural Composer).*

4.  **Ingest your Data:**
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

