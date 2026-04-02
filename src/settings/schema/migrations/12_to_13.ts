import { SettingMigration } from '../setting.types'

/**
 * Migration from version 12 to version 13
 * - Add lightRagServerUrl setting for remote LightRAG server support
 */
export const migrateFrom12To13: SettingMigration['migrate'] = (data) => {
  const newData = { ...data }
  newData.version = 13

  if (!newData.lightRagServerUrl) {
    newData.lightRagServerUrl = 'http://localhost:9621'
  }

  return newData
}
