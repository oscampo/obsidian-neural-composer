import { App, PluginSettingTab, Setting } from 'obsidian'
import { createRoot } from 'react-dom/client'

import { SettingsTabRoot } from '../components/settings/SettingsTabRoot'
import { SettingsProvider } from '../contexts/settings-context'
import NeuralComposerPlugin from '../main'

// Obsidian 1.13+ declarative settings API (getSettingDefinitions()), not yet
// present in this repo's installed `obsidian` type definitions (1.11.4), so
// this is a minimal local type for just the "render" entry kind we use --
// see https://docs.obsidian.md/Plugins/User+interface/Settings. On Obsidian
// 1.13+, returning a non-empty array here makes display() stop being called
// entirely, and is what makes the plugin show up in Obsidian's global
// settings search (the whole point of this, see the community-plugin-review
// bot warning that prompted it) -- one single entry, not per-field, since
// our settings tab is a full custom React app (tabs, icon rail, command
// bar), not a list of individual rows.
type RenderSettingDefinition = {
  name: string
  desc?: string
  render: (setting: Setting) => (() => void) | void
}

export class NeuralComposerSettingTab extends PluginSettingTab {
  plugin: NeuralComposerPlugin
  private unmount: (() => void) | null = null

  constructor(app: App, plugin: NeuralComposerPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  private mount(containerEl: HTMLElement): () => void {
    this.hide()
    containerEl.empty()
    const host = containerEl.closest<HTMLElement>('.vertical-tab-content')
    host?.addClass('nc-settings-host')
    const root = createRoot(containerEl)
    root.render(
      <SettingsProvider
        settings={this.plugin.settings}
        setSettings={(newSettings) => this.plugin.setSettings(newSettings)}
        addSettingsChangeListener={(listener) =>
          this.plugin.addSettingsChangeListener(listener)
        }
      >
        <SettingsTabRoot app={this.app} plugin={this.plugin} />
      </SettingsProvider>,
    )
    const unmount = () => {
      if (this.unmount !== unmount) return
      root.unmount()
      host?.removeClass('nc-settings-host')
      containerEl.removeClass('nc-full-settings-row')
      this.unmount = null
    }
    this.unmount = unmount
    return unmount
  }

  // Pre-1.13 fallback (and still the code path this.mount() shares with
  // getSettingDefinitions() below).
  display(): void {
    this.mount(this.containerEl)
  }

  hide(): void {
    this.unmount?.()
  }

  // Obsidian 1.13+ mounts the dashboard inside a Setting row; the scoped
  // row styles keep the same full-pane containing block as display().
  getSettingDefinitions(): RenderSettingDefinition[] {
    return [
      {
        name: 'Neural Composer',
        desc: 'Providers, models, chat, graph & vault, MCP tools, advanced settings, help.',
        render: (setting: Setting) => {
          const unmount = this.mount(setting.settingEl)
          setting.settingEl.addClass('nc-full-settings-row')
          return unmount
        },
      },
    ]
  }
}
