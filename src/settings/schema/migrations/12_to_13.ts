import { SettingMigration } from '../setting.types'

/**
 * Migration from version 12 to version 13
 * - Add lightRagServerUrl setting for remote LightRAG server support
 * - Add lightRagUseRemote toggle for local/remote server mode
 */
export const migrateFrom12To13: SettingMigration['migrate'] = (data) => {
  const newData = { ...data }
  newData.version = 13

  if (!newData.lightRagServerUrl) {
    newData.lightRagServerUrl = 'http://localhost:9621'
  }

  if (newData.lightRagUseRemote === undefined) {
    newData.lightRagUseRemote = false
  }

  return newData
}
