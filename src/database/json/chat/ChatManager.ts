import { App } from 'obsidian'
import { v4 as uuidv4 } from 'uuid'

import type { SerializedChatMessage } from '../../../types/chat'
import { deepEqual } from '../../../utils/deep-equal'
import { AbstractJsonRepository } from '../base'
import { CHAT_DIR, ROOT_DIR } from '../constants'
import { EmptyChatTitleException } from '../exception'

import {
  CHAT_SCHEMA_VERSION,
  ChatConversation,
  ChatConversationMetadata,
} from './types'

export class ChatManager extends AbstractJsonRepository<
  ChatConversation,
  ChatConversationMetadata
> {
  // The file name embeds updatedAt, so every save writes a new file and then
  // deletes the old one. Two saves of the same chat running at once both read
  // the same old file and each leave their own new file behind. Saves are
  // therefore serialized per chat id.
  private readonly locks = new Map<string, Promise<unknown>>()

  constructor(app: App) {
    super(app, `${ROOT_DIR}/${CHAT_DIR}`)
  }

  private withLock<T>(id: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve()
    const run = previous.then(task, task)
    const tail = run.catch(() => undefined)
    this.locks.set(id, tail)
    void tail.then(() => {
      if (this.locks.get(id) === tail) this.locks.delete(id)
    })
    return run
  }

  protected generateFileName(chat: ChatConversation): string {
    // Format: v{schemaVersion}_{title}_{updatedAt}_{id}.json
    const encodedTitle = encodeURIComponent(chat.title)
    return `v${chat.schemaVersion}_${encodedTitle}_${chat.updatedAt}_${chat.id}.json`
  }

  protected parseFileName(fileName: string): ChatConversationMetadata | null {
    // Parse: v{schemaVersion}_{title}_{updatedAt}_{id}.json
    const regex = new RegExp(
      `^v${CHAT_SCHEMA_VERSION}_(.+)_(\\d+)_([0-9a-f-]+)\\.json$`,
    )
    const match = fileName.match(regex)
    if (!match) return null

    const title = decodeURIComponent(match[1])
    const updatedAt = parseInt(match[2], 10)
    const id = match[3]

    return {
      id,
      schemaVersion: CHAT_SCHEMA_VERSION,
      title,
      updatedAt,
    }
  }

  public async createChat(
    initialData: Partial<ChatConversation>,
  ): Promise<ChatConversation> {
    if (initialData.id) {
      return this.withLock(initialData.id, () =>
        this.createChatUnlocked(initialData),
      )
    }
    return this.createChatUnlocked(initialData)
  }

  private async createChatUnlocked(
    initialData: Partial<ChatConversation>,
  ): Promise<ChatConversation> {
    if (initialData.title && initialData.title.length === 0) {
      throw new EmptyChatTitleException()
    }

    const now = Date.now()
    const newChat: ChatConversation = {
      id: uuidv4(),
      title: 'New chat',
      messages: [],
      createdAt: now,
      updatedAt: now,
      schemaVersion: CHAT_SCHEMA_VERSION,
      ...initialData,
    }

    await this.create(newChat)
    return newChat
  }

  public async findById(id: string): Promise<ChatConversation | null> {
    const allMetadata = await this.listMetadata()
    // If duplicate files exist for this id, use the most recent one.
    const targetMetadata = allMetadata
      .filter((meta) => meta.id === id)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]

    if (!targetMetadata) return null

    return this.read(targetMetadata.fileName)
  }

  public async updateChat(
    id: string,
    updates: Partial<
      Omit<ChatConversation, 'id' | 'createdAt' | 'updatedAt' | 'schemaVersion'>
    >,
  ): Promise<ChatConversation | null> {
    return this.withLock(id, () => this.updateChatUnlocked(id, updates))
  }

  /**
   * Create the chat if it does not exist, or replace its messages if they
   * changed. Find and write happen under one lock so concurrent calls for the
   * same chat cannot each create or leave behind their own file.
   */
  public async saveChat(
    id: string,
    messages: SerializedChatMessage[],
    title: string,
  ): Promise<void> {
    await this.withLock(id, async () => {
      const existing = await this.findById(id)
      if (existing) {
        if (deepEqual(existing.messages, messages)) return
        await this.updateChatUnlocked(id, { messages })
      } else {
        await this.createChatUnlocked({ id, title, messages })
      }
    })
  }

  private async updateChatUnlocked(
    id: string,
    updates: Partial<
      Omit<ChatConversation, 'id' | 'createdAt' | 'updatedAt' | 'schemaVersion'>
    >,
  ): Promise<ChatConversation | null> {
    const chat = await this.findById(id)
    if (!chat) return null

    if (updates.title !== undefined && updates.title.length === 0) {
      throw new EmptyChatTitleException()
    }

    const updatedChat: ChatConversation = {
      ...chat,
      ...updates,
      updatedAt: Date.now(),
    }

    await this.update(chat, updatedChat)
    return updatedChat
  }

  public async deleteChat(id: string): Promise<boolean> {
    return this.withLock(id, async () => {
      const allMetadata = await this.listMetadata()
      // Remove every copy, otherwise a leftover duplicate would bring the
      // deleted chat back.
      const targets = allMetadata.filter((meta) => meta.id === id)
      if (targets.length === 0) return false

      for (const target of targets) {
        await this.delete(target.fileName)
      }
      return true
    })
  }

  public async listChats(): Promise<ChatConversationMetadata[]> {
    const metadata = await this.listMetadata()
    // Show one entry per chat even if duplicate files exist on disk.
    const newestById = new Map<string, ChatConversationMetadata>()
    for (const meta of metadata) {
      const current = newestById.get(meta.id)
      if (!current || meta.updatedAt > current.updatedAt) {
        newestById.set(meta.id, meta)
      }
    }
    return [...newestById.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }
}
