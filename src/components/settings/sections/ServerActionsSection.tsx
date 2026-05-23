import { App, Notice } from 'obsidian'

import NeuralComposerPlugin from '../../../main'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { EnvEditorModal } from '../../modals/EnvEditorModal'
import { AdvancedEnvSection } from './AdvancedEnvSection'

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

      {/* 1. Review .env & restart */}
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

      {/* 2. Advanced configuration (total control) — env textarea */}
      <AdvancedEnvSection plugin={plugin} />

      {/* 3. Reprocess failed documents */}
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
