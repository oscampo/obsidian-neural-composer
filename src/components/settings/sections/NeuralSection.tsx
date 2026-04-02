import { Setting, Notice } from 'obsidian';
import { EnvEditorModal } from '../../modals/EnvEditorModal';
import { useEffect, useRef, useState } from 'react';
import NeuralComposerPlugin from '../../../main';

export const BACKEND_NAME = "LightRAG";
export const TERM_API = 'API';
export const TERM_APIs = 'APIs';
export const TERM_LLM = 'LLM';
export const FOLDER_DIR = 'Main/Memories';
export const RERANK_ENDPOINT = 'http://localhost:8000/v1/rerank';
export const COHERE = 'cohere';
export const ADV_SETTINGS ='MAX_TOTAL_TOKENS=30000\nLLM_TIMEOUT=180\n...'
export const TWO_D ='2D';
export const THREE_D ='3D';
export const GRAPH_UNIT = 'GPU';


export const NeuralSection = ({ plugin }: { plugin: NeuralComposerPlugin }) => {
  const settingsRef = useRef<HTMLDivElement>(null);
  
  // Local state for immediate UI reactivity
  const [currentRerankBinding, setCurrentRerankBinding] = useState(plugin.settings.lightRagRerankBinding);
  const [useCustomOntology, setUseCustomOntology] = useState(plugin.settings.useCustomEntityTypes);

  useEffect(() => {
    if (!settingsRef.current) return;
    settingsRef.current.empty();
    const container = settingsRef.current;

    container.createEl('h3', { text: `Neural backend (${BACKEND_NAME})` });

    // 1. Auto-start
    new Setting(container)
      .setName(`Auto-start ${BACKEND_NAME} server`)
      .setDesc('Automatically start the server when Obsidian opens.')
      .addToggle((toggle) =>
        toggle
          .setValue(plugin.settings.enableAutoStartServer)
          .onChange((value) => {
             void plugin.setSettings({ ...plugin.settings, enableAutoStartServer: value });
          }),
      );

    // 2. Paths
    new Setting(container)
      .setName(`${BACKEND_NAME} command path`)
      .setDesc('Absolute path to the executable (e.g., lightrag-server.exe).')
      .addText((text) =>
        text
          .setPlaceholder('D:\\...\\lightrag-server.exe')
          .setValue(plugin.settings.lightRagCommand)
          .onChange((value) => {
             void plugin.setSettings({ ...plugin.settings, lightRagCommand: value });
          }),
      );

    new Setting(container)
      .setName('Graph data directory')
      .setDesc('Absolute path to the folder containing your graph data.')
      .addText((text) =>
        text
          .setPlaceholder('D:\\...\\cora_graph_memory')
          .setValue(plugin.settings.lightRagWorkDir)
          .onChange((value) => {
            // Usamos una IIFE o bloque para agrupar lógica asíncrona dentro de void
            void (async () => {
                await plugin.setSettings({ ...plugin.settings, lightRagWorkDir: value });
                plugin.updateEnvFile();
            })();
          }),
      );

    const isRemote = plugin.isRemoteServer();

    new Setting(container)
      .setName(`${BACKEND_NAME} server URL`)
      .setDesc(
        isRemote
          ? 'Connected to a remote server. Auto-start and local process management are disabled.'
          : 'Base URL of the LightRAG server. Change this to connect to a remote server (e.g., http://192.168.1.100:9621).'
      )
      .addText((text) =>
        text
          .setPlaceholder('http://localhost:9621')
          .setValue(plugin.settings.lightRagServerUrl)
          .onChange((value) => {
            void plugin.setSettings({ ...plugin.settings, lightRagServerUrl: value });
          }),
      );

    // 3. Graph Logic Model
    new Setting(container)
      .setName(`Graph logic model (${TERM_LLM})`)
      .setDesc(`Select the model ${BACKEND_NAME} will use for indexing/reasoning.`)
      .addDropdown((dropdown) => {
        plugin.settings.chatModels.forEach((model) => {
          dropdown.addOption(model.id, `${model.providerId} - ${model.model}`);
        });
        dropdown.addOption('', 'Same as chat model (default)');
        dropdown.setValue(plugin.settings.lightRagModelId || '');
        dropdown.onChange((value) => {
          void (async () => {
            await plugin.setSettings({ ...plugin.settings, lightRagModelId: value });
            plugin.updateEnvFile();
          })();
        });
      });

    // 3.5 Graph Embedding Model
    new Setting(container)
      .setName('Graph embedding model')
      .setDesc('Select the model used for vectorizing your notes, (must match the dimensions used during ingestion).')
      .addDropdown((dropdown) => {
        plugin.settings.embeddingModels.forEach((model) => {
          dropdown.addOption(model.id, `${model.providerId} - ${model.model} (${model.dimension || '?'} dim)`);
        });
        
        dropdown.addOption('', 'Same as chat model (default)');
        dropdown.setValue(plugin.settings.lightRagEmbeddingModelId || '');

        dropdown.onChange((value) => {
           void (async () => {
              await plugin.setSettings({
                ...plugin.settings,
                lightRagEmbeddingModelId: value,
              });
              plugin.updateEnvFile(); 
           })();
        });
      });

    // 4. Language
    new Setting(container)
      .setName('Summary language')
      .setDesc(`Language used by ${BACKEND_NAME} for internal summaries.`)
      .addText((text) =>
        text
          .setPlaceholder('English')
          .setValue(plugin.settings.lightRagSummaryLanguage)
          .onChange((value) => {
            void (async () => {
                await plugin.setSettings({ ...plugin.settings, lightRagSummaryLanguage: value });
                plugin.updateEnvFile();
            })();
          }),
      );

    // 5. Citations
    new Setting(container)
      .setName('Show citations in chat')
      .setDesc('If enabled, the AI will add footnotes like [1] linking to sources.')
      .addToggle((toggle) =>
        toggle
          .setValue(plugin.settings.lightRagShowCitations)
          .onChange((value) => {
             void plugin.setSettings({ ...plugin.settings, lightRagShowCitations: value });
          }),
      );

    // --- ONTOLOGY SECTION ---
    container.createEl('h4', { text: 'Ontology (categories)' });

    new Setting(container)
      .setName('Use custom entity types')
      .setDesc(`Enable to define your own knowledge categories. Disable to use ${BACKEND_NAME} defaults.`)
      .addToggle((toggle) =>
        toggle
          .setValue(useCustomOntology)
          .onChange((value) => {
             void (async () => {
                await plugin.setSettings({
                  ...plugin.settings,
                  useCustomEntityTypes: value,
                });
                setUseCustomOntology(value); 
                plugin.updateEnvFile();
             })();
          }),
      );

    // CONDITIONAL ONTOLOGY BLOCK
    if (useCustomOntology) {
        const warningDiv = container.createDiv({ cls: 'nrlcmp-setting-warning' });
        
        // FIX: Sentence case
        warningDiv.createEl('strong', { text: 'Critical warning:' });
        warningDiv.createEl('br');
        // FIX: Sentence case (Entity Types -> entity types)
        warningDiv.createSpan({ text: 'Changing entity types fundamentally alters how the graph is built.' });
        warningDiv.createEl('br');
        // FIX: Sentence case (Graph Data folder -> graph data folder)
        warningDiv.createSpan({ text: 'If you already have data ingested, you ' });
        warningDiv.createEl('strong', { text: 'Must delete your graph data folder' });
        warningDiv.createSpan({ text: ' and re-ingest all documents.' });

        new Setting(container)
          .setName('Ontology source folder')
          .setDesc('Folder with representative notes to analyze.')
          .addText((text) =>
            text
              .setPlaceholder(`${FOLDER_DIR}`)
              .setValue(plugin.settings.lightRagOntologyFolder)
              .onChange((value) => {
                 void plugin.setSettings({ ...plugin.settings, lightRagOntologyFolder: value });
              }),
          );

        let typesTextArea: HTMLTextAreaElement;
        
        new Setting(container)
          .setName('Entity types definition')
          .setDesc('Define the "categories" of your field of knowledge.')
          .addButton((button) => 
            button
              .setButtonText('Analyze & generate')
              .setCta()
              .onClick(() => { // Removed async
                 void (async () => { // Wrapped in void async IIFE
                     const newTypes = await plugin.generateEntityTypes();
                     if (newTypes && typesTextArea) {
                         typesTextArea.value = newTypes;
                         typesTextArea.dispatchEvent(new Event('change'));
                     }
                 })();
              })
          );

        const textAreaContainer = container.createDiv({ cls: 'nrlcmp-textarea-container' });
        typesTextArea = textAreaContainer.createEl('textarea', { cls: 'nrlcmp-setting-textarea' });
        typesTextArea.value = plugin.settings.lightRagEntityTypes;
        typesTextArea.onchange = (e) => { // Removed async
            const target = e.target as HTMLTextAreaElement;
            void (async () => { // Wrapped
                await plugin.setSettings({ ...plugin.settings, lightRagEntityTypes: target.value });
                plugin.updateEnvFile();
            })();
        };
    }

    // --- RERANKING SECTION ---
    container.createEl('h4', { text: 'Reranking (precision)' });

    new Setting(container)
      .setName('Rerank provider')
      .setDesc('Service to re-order results. Use "custom" for local servers.')
      .addDropdown((dropdown) => {
        dropdown.addOption('', 'None (disabled)');
        dropdown.addOption('jina', 'Jina AI');
        dropdown.addOption('cohere', 'Cohere');
        dropdown.addOption('custom', 'Custom / local');
        
        dropdown.setValue(currentRerankBinding === 'jina' || currentRerankBinding === 'cohere' ? currentRerankBinding : (currentRerankBinding ? 'custom' : ''));
        
        dropdown.onChange((value) => {
          void (async () => {
              const newModel = value === 'jina' ? 'jina-reranker-v2-base-multilingual' : 
                               value === 'cohere' ? 'rerank-v3.5' : 
                               plugin.settings.lightRagRerankModel; 

              await plugin.setSettings({
                ...plugin.settings,
                lightRagRerankBinding: value,
                lightRagRerankModel: newModel
              });
              plugin.updateEnvFile();
              setCurrentRerankBinding(value); 
          })();
        });
      });

    if (currentRerankBinding && currentRerankBinding !== '') {
        
        // 1. MODEL
        new Setting(container)
        .setName('Rerank model')
        .setDesc('E.g. "BAAI/bge-reranker-v2-m3" for local.')
        .addText((text) =>
            text
            .setPlaceholder('Model name')
            .setValue(plugin.settings.lightRagRerankModel)
            .onChange((value) => {
                void (async () => {
                    await plugin.setSettings({ ...plugin.settings, lightRagRerankModel: value });
                    plugin.updateEnvFile();
                })();
            })
        );

        // 2. API KEY
        new Setting(container)
        .setName(`Rerank ${TERM_API} key`)
        .setDesc('Leave empty for local open servers.')
        .addText((text) =>
            text
            .setPlaceholder('Your key here')
            .setValue(plugin.settings.lightRagRerankApiKey)
            .onChange((value) => {
                void (async () => {
                    await plugin.setSettings({ ...plugin.settings, lightRagRerankApiKey: value });
                    plugin.updateEnvFile();
                })();
            })
        );
        
        // 3. HOST URL
        if (currentRerankBinding === 'custom') {
             new Setting(container)
            .setName('Local/custom host URL')
            .setDesc('The full URL to the rerank endpoint (e.g. http://localhost:8000/v1/rerank).')
            .addText((text) =>
                text
                .setPlaceholder(`${RERANK_ENDPOINT}`)
                .setValue(plugin.settings.lightRagRerankHost || '') 
                .onChange((value) => {
                    void (async () => {
                        await plugin.setSettings({ ...plugin.settings, lightRagRerankHost: value });
                        plugin.updateEnvFile();
                    })();
                })
            );
            
            // 4. BINDING
             new Setting(container)
            .setName('Binding type')
            .setDesc(`Internal binding type for ${BACKEND_NAME} (usually "cohere" for compatible local ${TERM_APIs}).`)
            .addText((text) =>
                text
                .setPlaceholder(`${COHERE}`)
                .setValue(plugin.settings.lightRagRerankBindingType || 'cohere') 
                .onChange((value) => {
                    void (async () => {
                        await plugin.setSettings({ ...plugin.settings, lightRagRerankBindingType: value });
                        plugin.updateEnvFile();
                    })();
                })
            );
        }
    }

    // --- ADVANCED ENV SECTION ---
    container.createEl('h4', { text: 'Advanced configuration (total control)' });
    
    const details = container.createEl('details');
    // Using class for cursor pointer instead of inline style
    const summary = details.createEl('summary', { text: 'Edit custom .env variables' });
    summary.addClass('nrlcmp-cursor-pointer');
    
    const advancedContainer = details.createDiv({ cls: 'nrlcmp-advanced-container' });

    advancedContainer.createEl('p', { 
        text: 'Variables defined here will be appended to the .env file and will *override* any plugin defaults. Use this for advanced tuning (context limits, timeouts, chunking strategies).',
        cls: 'setting-item-description'
    });

    // ENV TEXT AREA
    new Setting(advancedContainer)
        .setClass('nrlcmp-env-setting')
        .addTextArea(text => {
            text
                .setPlaceholder(`${ADV_SETTINGS}`)
                .setValue(plugin.settings.lightRagCustomEnv)
                .onChange((value) => { // Removed async
                    void plugin.setSettings({ ...plugin.settings, lightRagCustomEnv: value });
                });
            text.inputEl.addClass('nrlcmp-env-textarea');
        });

    // TEMPLATE BUTTON
    new Setting(advancedContainer)
        .setName('Load full configuration template')
        .setDesc(`Paste the full list of available ${BACKEND_NAME} variables (commented out) into the box above.`)
        .addButton(btn => btn
            .setButtonText('Insert template')
            .onClick(() => { // Removed async
                void (async () => { // Wrapped
                    if (plugin.settings.lightRagCustomEnv.length > 50) {
                        new Notice("Overwriting existing custom configuration...");
                    }
                    
                    const template = `# --- Query Configuration ---
# ENABLE_LLM_CACHE=true
# TOP_K=40
# CHUNK_TOP_K=20
# MAX_TOTAL_TOKENS=30000
# KG_CHUNK_PICK_METHOD=VECTOR

# --- Document Processing ---
# CHUNK_SIZE=1200
# CHUNK_OVERLAP_SIZE=100
# ENABLE_LLM_CACHE_FOR_EXTRACT=true

# --- Timeouts ---
# LLM_TIMEOUT=180
# EMBEDDING_TIMEOUT=30

# --- Storage Selection (Advanced) ---
# LIGHTRAG_KV_STORAGE=JsonKVStorage
# LIGHTRAG_VECTOR_STORAGE=NanoVectorDBStorage
`;
                    await plugin.setSettings({ ...plugin.settings, lightRagCustomEnv: template });
                    
                    const ta = advancedContainer.querySelector('textarea');
                    if(ta) ta.value = template;
                })();
            })
        );

    // 7. RESTART BUTTON (EMPHASIS)
    new Setting(container)
      .setName('Apply changes & restart')
      .setDesc('You *must* restart the server after changing *any* setting above to apply the new configuration (.env).')
      .setClass('nrlcmp-restart-setting') 
      .addButton((button) =>
        button
          .setButtonText('Restart server now')
          .setCta()
          .onClick(() => { // Removed async completely as restartLightRagServer is void
            new Notice("Restarting server...");
            plugin.restartLightRagServer();
          }),
      );

    // 8. ENV EDITOR MODAL
    new Setting(container)
      .setName('Server configuration')
      .setDesc('Review the generated .env file, tweak advanced parameters, and restart the server.')
      .addButton((button) =>
        button
          .setButtonText('Review .env & restart')
          .setCta()
          .onClick(() => {
            new EnvEditorModal(plugin.app, plugin).open();
          }),
      );

    // VISUALIZATION
    container.createEl('h4', { text: 'Visualization' });

    new Setting(container)
      .setName('Graph rendering engine')
      .setDesc(`Choose ${TWO_D} for performance/clarity or ${THREE_D} for immersion (requires ${GRAPH_UNIT}).`)
      .addDropdown((dropdown) => {
        dropdown.addOption('2d', `${TWO_D} - Fast & clean`);
        dropdown.addOption('3d', `${THREE_D} - Immersive - uses ${GRAPH_UNIT}`);
        dropdown.setValue(plugin.settings.graphViewMode);
        dropdown.onChange((value) => { // Removed async
          void plugin.setSettings({
            ...plugin.settings,
            graphViewMode: value as '2d' | '3d',
          });
        });
      });

  }, [plugin.settings, currentRerankBinding, useCustomOntology]);
  
  return <div ref={settingsRef} />;
};