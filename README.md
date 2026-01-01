# 🧠 Neural Composer

**Neural Composer** is an advanced evolution of the *Smart Composer* plugin for Obsidian. It replaces the standard local retrieval with a connection to a **LightRAG (Graph RAG)** server, enabling deep, relationship-based memory retrieval and context-aware interactions.

> **Co-Authored by:** Oscar Campo & Cora (AI)

## ✨ Features

*   **Graph Retrieval (RAG):** Connects to a local LightRAG server to query a Knowledge Graph of your vault.
*   **Dual Mode:** 
    *   **Chat:** Interact with specific notes or files (`@filename`).
    *   **Vault Chat:** Query your entire knowledge base via the Graph.
*   **Source Transparency:** See exactly which documents informed the AI's answer.

## 🚀 Installation & Setup

### 1. The Plugin
1.  Download `main.js`, `manifest.json`, and `styles.css` from the Releases page.
2.  Place them in `.obsidian/plugins/obsidian-neural-composer`.
3.  Enable in Obsidian Settings.

### 2. The Backend (The Brain)
This plugin requires a local Python server running LightRAG.

1.  Navigate to the `backend/` folder.
2.  Install dependencies: `pip install -r requirements.txt`
3.  Set up your `.env` file with `GOOGLE_API_KEY`.
4.  Run the server: `uvicorn main:app --reload`

## 🤝 Credits
Forked from [Smart Composer](https://github.com/glowingjade/obsidian-smart-composer). All credits for the UI/UX foundation go to the original author.
