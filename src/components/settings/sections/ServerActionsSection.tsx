import { App, Notice } from 'obsidian'

import NeuralComposerPlugin from '../../../main'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { EnvEditorModal } from '../../modals/EnvEditorModal'

type ServerActionsSectionProps = {
  app: App
  plugin: NeuralComposerPlugin
}

export function ServerActionsSection({
  app,
  plugin,
}: ServerActionsSectionProps) {
  return (
    <div className="nrlcmp-settings-section">
      <div className="nrlcmp-settings-header">Server management</div>

      <ObsidianSetting
        name="Apply changes & restart"
        desc="You must restart the server after changing any setting to apply the new configuration (.env)."
        className="nrlcmp-restart-setting"
      >
        <ObsidianButton
          text="Restart server now"
          cta
          onClick={() => {
            new Notice('Restarting server…')
            plugin.restartLightRagServer()
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name="Server configuration"
        desc="Review the generated .env file, tweak advanced parameters, and restart the server."
      >
        <ObsidianButton
          text="Review .env & restart"
          cta
          onClick={() => {
            new EnvEditorModal(app, plugin).open()
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name="Reprocess failed documents"
        desc="Re-submits any documents that failed entity extraction (e.g. after fixing the LLM configuration). The server must be running."
      >
        <ObsidianButton
          text="Reprocess failed"
          onClick={() => {
            void plugin.reprocessFailedDocuments()
          }}
        />
      </ObsidianSetting>
    </div>
  )
}
