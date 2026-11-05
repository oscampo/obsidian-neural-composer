import OpenAI from 'openai'
import { ReasoningEffort } from 'openai/resources'

import { ChatModel } from '../../types/chat-model.types'
import {
  LLMOptions,
  LLMRequestNonStreaming,
  LLMRequestStreaming,
  RequestMessage,
} from '../../types/llm/request'
import {
  LLMResponseNonStreaming,
  LLMResponseStreaming,
} from '../../types/llm/response'
import { LLMProvider } from '../../types/provider.types'
import { obsidianRequestUrlFetch } from '../../utils/fetch-utils'
import { formatMessages } from '../../utils/llm/request'

import { BaseLLMProvider } from './base'
import { LLMBaseUrlNotSetException } from './exception'
import { NoStainlessOpenAI } from './NoStainlessOpenAI'
import { OpenAIMessageAdapter } from './openaiMessageAdapter'

export class OpenAICompatibleProvider extends BaseLLMProvider<
  Extract<LLMProvider, { type: 'openai-compatible' }>
> {
  private adapter: OpenAIMessageAdapter
  private client: OpenAI

  constructor(provider: Extract<LLMProvider, { type: 'openai-compatible' }>) {
    super(provider)
    const settings = provider.additionalSettings
    this.adapter = new OpenAIMessageAdapter({
      forwardReasoning: !!(
        settings?.sendReasoning || settings?.fillMissingReasoning
      ),
    })
    this.client = new (settings?.noStainless ? NoStainlessOpenAI : OpenAI)({
      apiKey: provider.apiKey ?? '',
      baseURL: provider.baseUrl ? provider.baseUrl?.replace(/\/+$/, '') : '',
      dangerouslyAllowBrowser: true,
      ...(settings?.useObsidianRequest
        ? { fetch: OpenAICompatibleProvider.obsidianFetch }
        : {}),
    })
  }

  /**
   * fetch() replacement backed by Obsidian's requestUrl (no CORS). requestUrl
   * rejects forbidden headers that the OpenAI SDK adds, and servers without
   * CORS often reject the x-stainless-* headers, so both are removed.
   */
  private static obsidianFetch = async (
    url: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const headers = new Headers(init?.headers)
    for (const h of [
      'content-length',
      'connection',
      'host',
      'accept-encoding',
      'user-agent',
    ]) {
      headers.delete(h)
    }
    const stainless: string[] = []
    headers.forEach((_v, k) => {
      if (k.startsWith('x-stainless-')) stainless.push(k)
    })
    stainless.forEach((k) => headers.delete(k))
    return obsidianRequestUrlFetch(
      typeof url === 'string' ? url : url instanceof URL ? url : url.url,
      { ...init, headers },
    )
  }

  private prepareMessages(messages: RequestMessage[]): RequestMessage[] {
    const formatted = formatMessages(messages)
    if (!this.provider.additionalSettings?.fillMissingReasoning) {
      return formatted
    }
    return formatted.map((m) =>
      m.role === 'assistant' && !m.reasoning ? { ...m, reasoning: '.' } : m,
    )
  }

  private reasoningParams(model: ChatModel): {
    reasoning_effort?: ReasoningEffort
  } {
    if (
      model.providerType !== 'openai-compatible' ||
      !model.reasoning?.enabled ||
      !model.reasoning.reasoning_effort
    ) {
      return {}
    }
    // Free text: the provider validates the level
    return {
      reasoning_effort: model.reasoning.reasoning_effort as ReasoningEffort,
    }
  }

  async generateResponse(
    model: ChatModel,
    request: LLMRequestNonStreaming,
    options?: LLMOptions,
  ): Promise<LLMResponseNonStreaming> {
    if (model.providerType !== 'openai-compatible') {
      throw new Error('Model is not an OpenAI Compatible model')
    }

    if (!this.provider.baseUrl) {
      throw new LLMBaseUrlNotSetException(
        `Provider ${this.provider.id} base URL is missing. Please set it in settings menu.`,
      )
    }

    const formattedRequest = {
      ...request,
      messages: this.prepareMessages(request.messages),
      ...this.reasoningParams(model),
    }
    return this.adapter.generateResponse(this.client, formattedRequest, options)
  }

  async streamResponse(
    model: ChatModel,
    request: LLMRequestStreaming,
    options?: LLMOptions,
  ): Promise<AsyncIterable<LLMResponseStreaming>> {
    if (model.providerType !== 'openai-compatible') {
      throw new Error('Model is not an OpenAI Compatible model')
    }

    if (!this.provider.baseUrl) {
      throw new LLMBaseUrlNotSetException(
        `Provider ${this.provider.id} base URL is missing. Please set it in settings menu.`,
      )
    }

    const formattedRequest = {
      ...request,
      messages: this.prepareMessages(request.messages),
      ...this.reasoningParams(model),
    }
    return this.adapter.streamResponse(this.client, formattedRequest, options)
  }

  async getEmbedding(model: string, text: string): Promise<number[]> {
    const embedding = await this.client.embeddings.create({
      model: model,
      input: text,
      encoding_format: 'float',
    })
    return embedding.data[0].embedding
  }
}
