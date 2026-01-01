### 2. Configure the Server (.env)

You need to configure the LLM and Embedding model for LightRAG. 

1.  Create a `.env` file in the folder where you will run the server.
2.  You can copy the provided [`.env.example`](.env.example) file as a template.
3.  **Example Configuration (Google Gemini):**

    ```ini
    WORKING_DIR=./data
    LLM_BINDING=gemini
    LLM_MODEL=gemini-2.0-flash
    EMBEDDING_BINDING=gemini
    EMBEDDING_MODEL=models/text-embedding-004
    EMBEDDING_DIM=768
    SUMMARY_LANGUAGE=English
    PORT=9621
    GEMINI_API_KEY=your_api_key_here
    ```

> **Note:** This configuration uses Google Gemini (reliable and fast). If you prefer to use **Ollama (Local)**, **OpenAI**, or **Azure**, please refer to the official [LightRAG Configuration Docs](https://github.com/HKUDS/LightRAG) for the specific environment variables.
