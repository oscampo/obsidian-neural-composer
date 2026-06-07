import {
  getExcludePatternForPath,
  isExcludedFromGraphSync,
  isHiddenPath,
} from './glob-utils'

describe('getExcludePatternForPath', () => {
  it('returns the exact path for a file', () => {
    expect(getExcludePatternForPath('Research/todo.md', false)).toBe(
      'Research/todo.md',
    )
  })

  it('appends a recursive glob for a folder', () => {
    expect(getExcludePatternForPath('Archive', true)).toBe('Archive/**')
  })

  it('appends a recursive glob for a nested folder', () => {
    expect(getExcludePatternForPath('Work/Private', true)).toBe(
      'Work/Private/**',
    )
  })
})

describe('isHiddenPath', () => {
  it('detects a top-level hidden folder', () => {
    expect(isHiddenPath('.trash/note.md')).toBe(true)
  })

  it('detects a nested hidden folder', () => {
    expect(isHiddenPath('Research/.archive/old.md')).toBe(true)
  })

  it('detects a hidden file', () => {
    expect(isHiddenPath('.secret-note.md')).toBe(true)
  })

  it('returns false for a regular path', () => {
    expect(isHiddenPath('Research/2024/todo.md')).toBe(false)
  })
})

describe('isExcludedFromGraphSync', () => {
  const base = { excludePatterns: [], excludeHiddenFiles: true }

  it('does not exclude a regular file by default', () => {
    expect(isExcludedFromGraphSync('Research/todo.md', base)).toBe(false)
  })

  it('excludes hidden files when excludeHiddenFiles is true', () => {
    expect(isExcludedFromGraphSync('.trash/note.md', base)).toBe(true)
  })

  it('does not exclude hidden files when excludeHiddenFiles is false', () => {
    expect(
      isExcludedFromGraphSync('.trash/note.md', {
        ...base,
        excludeHiddenFiles: false,
      }),
    ).toBe(false)
  })

  it('excludes files matching a glob exclude pattern', () => {
    expect(
      isExcludedFromGraphSync('Research/Templates/daily.md', {
        ...base,
        excludePatterns: ['Research/Templates/**'],
      }),
    ).toBe(true)
  })

  it('does not exclude files outside the exclude patterns', () => {
    expect(
      isExcludedFromGraphSync('Research/keep.md', {
        ...base,
        excludePatterns: ['Research/Templates/**'],
      }),
    ).toBe(false)
  })
})
