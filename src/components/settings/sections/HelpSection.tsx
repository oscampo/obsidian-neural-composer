import { App, Notice } from 'obsidian'

import { useSettings } from '../../../contexts/settings-context'
import NeuralComposerPlugin from '../../../main'
import { NeuralComposerSettingsSchema } from '../../../settings/schema/setting.types'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ConfirmModal } from '../../modals/ConfirmModal'

const LINKS = [
  {
    label: 'GitHub — source & issues',
    url: 'https://github.com/oscampo/obsidian-neural-composer',
  },
  {
    label: 'Ko-fi — support development',
    url: 'https://ko-fi.com/oscampo',
  },
]

type HelpSectionProps = {
  app: App
  plugin: NeuralComposerPlugin
}

export function HelpSection({ app, plugin }: HelpSectionProps) {
  const { setSettings } = useSettings()

  const handleResetSettings = () => {
    new ConfirmModal(app, {
      title: 'Reset settings',
      message:
        'Are you sure you want to reset all settings to default values? This cannot be undone.',
      ctaText: 'Reset',
      onConfirm: () => {
        void (async () => {
          const defaultSettings = NeuralComposerSettingsSchema.parse({})
          await setSettings(defaultSettings)
          new Notice('Settings have been reset to defaults')
        })()
      },
    }).open()
  }

  return (
    <>
      {/* Links */}
      <div className="nrlcmp-settings-section">
        <div className="nrlcmp-settings-header">Resources</div>
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}
        >
          {LINKS.map(({ label, url }) => (
            <a
              key={url}
              href={url}
              onClick={(e) => {
                e.preventDefault()
                window.open(url, '_blank')
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--link-color, var(--interactive-accent))',
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* Version info */}
      <div className="nrlcmp-settings-section">
        <div className="nrlcmp-settings-header">About</div>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-muted)',
            margin: '4px 0 0',
          }}
        >
          Neural Composer · v{plugin.manifest.version}
        </p>
      </div>

      {/* Reset settings */}
      <div className="nrlcmp-settings-section">
        <div className="nrlcmp-settings-header">Danger zone</div>
        <ObsidianSetting
          name="Reset settings"
          desc="Reset all settings to default values"
        >
          <ObsidianButton text="Reset" warning onClick={handleResetSettings} />
        </ObsidianSetting>
      </div>
    </>
  )
}
