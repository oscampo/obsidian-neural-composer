import { minimatch } from 'minimatch'
import { Vault } from 'obsidian'

export const findFilesMatchingPatterns = (patterns: string[], vault: Vault) => {
  const files = vault.getMarkdownFiles()
  return files.filter((file) => {
    return patterns.some((pattern) => minimatch(file.path, pattern))
  })
}

/**
 * Builds a glob exclude pattern for a vault path.
 *
 * Folders are expanded to match every descendant (`path/**`) so all files
 * inside are excluded; files are matched by their exact path.
 */
export const getExcludePatternForPath = (
  path: string,
  isFolder: boolean,
): string => {
  return isFolder ? `${path}/**` : path
}

/**
 * Returns true if any segment of the vault path starts with a dot, i.e. the
 * file or one of its parent folders is hidden (e.g. `.trash/note.md`,
 * `Research/.archive/old.md`).
 */
export const isHiddenPath = (path: string): boolean => {
  return path.split('/').some((segment) => segment.startsWith('.'))
}

/**
 * Decides whether a vault path is excluded from graph (LightRAG) ingestion.
 *
 * A path is excluded when hidden-file exclusion is enabled and the path is
 * hidden, or when it matches any of the configured glob exclude patterns.
 */
export const isExcludedFromGraphSync = (
  path: string,
  {
    excludePatterns,
    excludeHiddenFiles,
  }: { excludePatterns: string[]; excludeHiddenFiles: boolean },
): boolean => {
  if (excludeHiddenFiles && isHiddenPath(path)) {
    return true
  }
  return excludePatterns.some((pattern) => minimatch(path, pattern))
}
