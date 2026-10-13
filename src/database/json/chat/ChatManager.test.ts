import { App } from 'obsidian'

import { ChatManager } from './ChatManager'
import { CHAT_SCHEMA_VERSION, ChatConversation } from './types'

jest.mock('path-browserify', () => ({
  __esModule: true,
  default: {
    join: (...parts: string[]) => parts.join('/'),
    basename: (p: string) => p.split('/').pop() ?? '',
  },
}))

const mockAdapter = {
  exists: jest.fn().mockResolvedValue(true),
  mkdir: jest.fn().mockResolvedValue(undefined),
  read: jest.fn().mockResolvedValue(''),
  write: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
  list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
}

const mockVault = {
  adapter: mockAdapter,
}

const mockApp = {
  vault: mockVault,
} as unknown as App

describe('ChatManager', () => {
  let chatManager: ChatManager

  beforeEach(() => {
    chatManager = new ChatManager(mockApp)
  })

  describe('filename generation and parsing roundtrip', () => {
    // Definimos una interfaz temporal para exponer los métodos privados que queremos testear
    // Esto evita el uso de 'any' y mantiene al linter feliz.
    type TestableChatManager = {
      generateFileName(chat: ChatConversation): string
      parseFileName(fileName: string): {
        id: string
        title: string
        updatedAt: number
        schemaVersion: number
      } | null
    }

    const testTitles = [
      'Simple Title',
      'Special & Characters! #$%^',
      'Unicode 中文 日本語 한국어',
      'Extremely long title that might cause issues with file systems',
      'Title with trailing spaces   ',
      '   Title with leading spaces',
      'Title with _ underscores_and_special_chars',
      'Title with.dots.and-dashes',
      'Title with / slashes \\ and \\ backslashes',
      'Title with "quotes" and \'apostrophes\'',
      'Title with <html> tags',
      'Title with newlines\nand\ttabs',
      '🔥 Title with emojis 🚀',
      ' ',
      'Title-with-123e4567-e89b-12d3-a456-426614174000-uuid-like-substring',
      '_Title_starting_with_underscore',
      'Title+with+plus+signs',
      'Title%20with%20encoded%20characters',
      'Title ending with .json',
      'v1_Title_starting_like_a_versioned_file',
      '..Title with leading dots',
      'Title with trailing dots..',
    ]

    test.each(testTitles)('should correctly roundtrip title: %s', (title) => {
      const chat: ChatConversation = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        title,
        messages: [],
        createdAt: 1620000000000,
        updatedAt: 1620000000000,
        schemaVersion: CHAT_SCHEMA_VERSION,
      }

      // CORRECCIÓN: Usamos casting seguro a la interfaz TestableChatManager en lugar de 'as any'
      const manager = chatManager as unknown as TestableChatManager

      const fileName = manager.generateFileName(chat)
      const metadata = manager.parseFileName(fileName)

      expect(metadata).not.toBeNull()
      if (metadata) {
        expect(metadata.id).toBe(chat.id)
        expect(metadata.title).toBe(chat.title)
        expect(metadata.updatedAt).toBe(chat.updatedAt)
        expect(metadata.schemaVersion).toBe(chat.schemaVersion)
      }
    })
  })

  describe('concurrent saves (in-memory adapter)', () => {
    const makeManager = (delayMs = 5) => {
      const files = new Map<string, string>()
      const wait = () => new Promise((r) => setTimeout(r, delayMs))
      const adapter = {
        exists: async (p: string) => {
          await wait()
          return files.has(p) || p.endsWith('chats')
        },
        mkdir: async () => undefined,
        read: async (p: string) => {
          await wait()
          return files.get(p) ?? ''
        },
        write: async (p: string, c: string) => {
          await wait()
          files.set(p, c)
        },
        remove: async (p: string) => {
          await wait()
          files.delete(p)
        },
        list: async () => {
          await wait()
          return { files: [...files.keys()], folders: [] }
        },
      }
      const app = { vault: { adapter } } as unknown as App
      return { manager: new ChatManager(app), files }
    }

    const msg = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        role: 'user' as const,
        content: null,
        promptContent: null,
        id: `m${i}`,
        mentionables: [],
      }))

    const ID = '123e4567-e89b-12d3-a456-426614174000'

    test('overlapping saveChat calls leave exactly one file', async () => {
      const { manager, files } = makeManager()
      await manager.saveChat(ID, msg(1), 'Chat')
      await Promise.all(
        [2, 3, 4, 5, 6, 7].map((n) => manager.saveChat(ID, msg(n), 'Chat')),
      )
      expect(files.size).toBe(1)
      const chat = await manager.findById(ID)
      expect(chat?.messages).toHaveLength(7)
    })

    test('concurrent first saves create a single file', async () => {
      const { manager, files } = makeManager()
      await Promise.all(
        [1, 2, 3].map((n) => manager.saveChat(ID, msg(n), 'Chat')),
      )
      expect(files.size).toBe(1)
    })

    test('findById and listChats use the newest copy when duplicates exist', async () => {
      const { manager, files } = makeManager(0)
      const base = {
        id: ID,
        title: 'T',
        createdAt: 1,
        schemaVersion: CHAT_SCHEMA_VERSION,
      }
      files.set(
        `.neural_db/chats/v1_T_100_${ID}.json`,
        JSON.stringify({ ...base, updatedAt: 100, messages: msg(1) }),
      )
      files.set(
        `.neural_db/chats/v1_T_200_${ID}.json`,
        JSON.stringify({ ...base, updatedAt: 200, messages: msg(2) }),
      )
      const chat = await manager.findById(ID)
      expect(chat?.updatedAt).toBe(200)
      const list = await manager.listChats()
      expect(list).toHaveLength(1)
      expect(list[0].updatedAt).toBe(200)
    })

    test('deleteChat removes every copy', async () => {
      const { manager, files } = makeManager(0)
      files.set(`.neural_db/chats/v1_T_100_${ID}.json`, '{}')
      files.set(`.neural_db/chats/v1_T_200_${ID}.json`, '{}')
      expect(await manager.deleteChat(ID)).toBe(true)
      expect(files.size).toBe(0)
    })
  })
})
