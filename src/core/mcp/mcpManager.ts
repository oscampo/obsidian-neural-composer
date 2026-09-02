import { Platform } from 'obsidian'

import { NeuralComposerSettings } from '../../settings/schema/setting.types'
import {
  McpClient,
  McpServerConfig,
  McpServerState,
  McpServerStatus,
  McpTool,
  McpToolCallResult,
  McpToolListResult,
} from '../../types/mcp.types'
import {
  ToolCallResponse,
  ToolCallResponseStatus,
} from '../../types/tool-call.types'
import { deepEqual } from '../../utils/deep-equal'

import { InvalidToolNameException, McpNotAvailableException } from './exception'
import {
  getToolName,
  parseToolName,
  validateServerName,
} from './tool-name-utils'

export class McpManager {
  static readonly TOOL_NAME_DELIMITER = '__' // Delimiter for tool name construction (serverName__toolName)

  private settings: NeuralComposerSettings
  private unsubscribeFromSettings: () => void
  private defaultEnv: Record<string, string>

  private servers: McpServerState[] = [] // IMPORTANT: Always use this.updateServers() to update this array
  private activeToolCalls: Map<string, AbortController> = new Map()
  private allowedToolsByConversation: Map<string, Set<string>> = new Map()
  private subscribers = new Set<(servers: McpServerState[]) => void>()

  private availableToolsCache: McpTool[] | null = null

  constructor({
    settings,
    registerSettingsListener,
  }: {
    settings: NeuralComposerSettings
    registerSettingsListener: (
      listener: (settings: NeuralComposerSettings) => void,
    ) => () => void
  }) {
    this.settings = settings
    this.unsubscribeFromSettings = registerSettingsListener((newSettings) => {
      // FIX: Use void operator to handle floating promise from async method
      void this.handleSettingsUpdate(newSettings)
    })
  }

  public async initialize() {
    // shell-env spawns a subshell to read env vars — only needed for local
    // (stdio) servers, and only available on desktop.
    if (Platform.isDesktop) {
      const { shellEnvSync } = await import('shell-env')
      this.defaultEnv = shellEnvSync()
    } else {
      this.defaultEnv = {}
    }

    // Create MCP servers
    const servers = await Promise.all(
      this.settings.mcp.servers.map((serverConfig) =>
        this.connectServer(serverConfig),
      ),
    )
    this.updateServers(servers)
  }

  public cleanup() {
    // Disconnect all clients
    void Promise.all(
      this.servers
        .filter(
          (
            s,
          ): s is Extract<
            McpServerState,
            { status: McpServerStatus.Connected }
          > => s.status === McpServerStatus.Connected,
        )
        .map((s) => s.client.close()),
    )

    if (this.unsubscribeFromSettings) {
      this.unsubscribeFromSettings()
    }

    this.servers = []
    this.subscribers.clear()
    this.activeToolCalls.clear()
  }

  public getServers() {
    return this.servers
  }

  public subscribeServersChange(callback: (servers: McpServerState[]) => void) {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  public async handleSettingsUpdate(settings: NeuralComposerSettings) {
    this.settings = settings
    const updatedServers = settings.mcp.servers.map(
      (serverConfig: McpServerConfig): McpServerState => {
        const existingServer = this.servers.find(
          (s) => s.name === serverConfig.id,
        )
        if (
          existingServer &&
          deepEqual(
            existingServer.config.parameters,
            serverConfig.parameters,
          ) &&
          existingServer.config.enabled === serverConfig.enabled
        ) {
          // Server is already up to date
          return {
            ...existingServer,
            config: serverConfig,
          }
        }
        return {
          name: serverConfig.id,
          config: serverConfig,
          status: McpServerStatus.Connecting,
        }
      },
    )

    this.updateServers(updatedServers)

    await Promise.all(
      updatedServers
        .filter((s) => s.status === McpServerStatus.Connecting)
        .map(async (s) => {
          const server = await this.connectServer(s.config)
          this.updateServers((prevServers) =>
            prevServers.map((prevServer) =>
              prevServer.name === server.name ? server : prevServer,
            ),
          )
        }),
    )
  }

  private notifySubscribers() {
    for (const cb of this.subscribers) cb(this.servers)
  }

  private updateServers(
    newServersOrUpdater?:
      | McpServerState[]
      | ((prevServers: McpServerState[]) => McpServerState[]),
  ) {
    const currentServers = this.servers
    const nextServers =
      typeof newServersOrUpdater === 'function'
        ? newServersOrUpdater(currentServers)
        : (newServersOrUpdater ?? currentServers)

    // Find clients that need to be disconnected
    const clientsToDisconnect: McpClient[] = currentServers
      .filter(
        (
          server,
        ): server is Extract<
          McpServerState,
          { status: McpServerStatus.Connected }
        > => server.status === McpServerStatus.Connected,
      )
      .map((server) => server.client)
      .filter(
        (client) =>
          !nextServers.some(
            (server) =>
              server.status === McpServerStatus.Connected &&
              server.client === client,
          ),
      )

    // Disconnect clients in the background
    if (clientsToDisconnect.length > 0) {
      void Promise.all(clientsToDisconnect.map((client) => client.close()))
    }

    this.servers = nextServers
    this.availableToolsCache = null // Invalidate available tools cache
    this.notifySubscribers() // Should call after invalidating the cache
  }

  private async connectServer(
    serverConfig: McpServerConfig,
  ): Promise<McpServerState> {
    const { id: name, parameters: serverParams, enabled } = serverConfig

    if (!enabled) {
      return {
        name,
        config: serverConfig,
        status: McpServerStatus.Disconnected,
      }
    }

    const isRemote = serverParams.type === 'http'

    if (!isRemote && !Platform.isDesktop) {
      return {
        name,
        config: serverConfig,
        status: McpServerStatus.Error,
        error: new McpNotAvailableException(
          `Local (command-based) MCP server "${name}" requires Obsidian desktop. Use a remote HTTP server (type: "http") on mobile.`,
        ),
      }
    }

    try {
      validateServerName(name)
    } catch (error) {
      return {
        name,
        config: serverConfig,
        status: McpServerStatus.Error,
        error: error as Error,
      }
    }

    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const client = new Client({ name, version: '1.0.0' })

    try {
      if (isRemote) {
        const { StreamableHTTPClientTransport } =
          await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
        await client.connect(
          new StreamableHTTPClientTransport(new URL(serverParams.url), {
            requestInit: { headers: serverParams.headers },
          }),
        )
      } else {
        const { StdioClientTransport } =
          await import('@modelcontextprotocol/sdk/client/stdio.js')
        await client.connect(
          new StdioClientTransport({
            ...serverParams,
            env: {
              ...this.defaultEnv,
              ...(serverParams.env ?? {}),
            },
          }),
        )
      }
    } catch (error) {
      return {
        name,
        config: serverConfig,
        status: McpServerStatus.Error,
        error: new Error(
          `Failed to connect to MCP server ${name}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      }
    }

    try {
      const toolList: McpToolListResult = await client.listTools()
      const tools: McpTool[] = toolList.tools
      return {
        name,
        config: serverConfig,
        status: McpServerStatus.Connected,
        client,
        tools,
      }
    } catch (error) {
      return {
        name,
        config: serverConfig,
        status: McpServerStatus.Error,
        error: new Error(
          `Failed to list tools for MCP server ${name}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      }
    }
  }

  public async listAvailableTools(): Promise<McpTool[]> {
    if (this.availableToolsCache) {
      return this.availableToolsCache
    }

    const availableTools: McpTool[] = (
      await Promise.all(
        this.servers.map(async (server): Promise<McpTool[]> => {
          if (server.status !== McpServerStatus.Connected) {
            return []
          }
          try {
            const toolList: McpToolListResult = await server.client.listTools()
            const tools: McpTool[] = toolList.tools
            return tools
              .filter(
                (tool: McpTool): boolean =>
                  !server.config.toolOptions[tool.name]?.disabled,
              )
              .map(
                (tool: McpTool): McpTool => ({
                  ...tool,
                  name: getToolName(server.name, tool.name),
                }),
              )
          } catch (error) {
            console.error(
              `Failed to list tools for MCP server ${server.name}: ${error instanceof Error ? error.message : String(error)}`,
            )
            return []
          }
        }),
      )
    ).flat()

    this.availableToolsCache = [...availableTools]
    return availableTools
  }

  public allowToolForConversation(
    requestToolName: string,
    conversationId: string,
  ): void {
    let allowedTools = this.allowedToolsByConversation.get(conversationId)
    if (!allowedTools) {
      allowedTools = new Set<string>()
      this.allowedToolsByConversation.set(conversationId, allowedTools)
    }
    allowedTools.add(requestToolName)
  }

  public isToolExecutionAllowed({
    requestToolName,
    conversationId,
  }: {
    requestToolName: string
    conversationId?: string
  }): boolean {
    // Check if the tool is allowed for the conversation
    if (conversationId) {
      if (
        this.allowedToolsByConversation
          .get(conversationId)
          ?.has(requestToolName)
      ) {
        return true
      }
    }

    try {
      const { serverName, toolName } = parseToolName(requestToolName)
      const server = this.servers.find((server) => server.name === serverName)
      if (!server) {
        return false
      }
      const toolOption = server.config.toolOptions[toolName]
      if (!toolOption) {
        return false
      }
      return toolOption.allowAutoExecution ?? false
    } catch (error) {
      if (error instanceof InvalidToolNameException) {
        return false
      }
      throw error
    }
  }

  public async callTool({
    name,
    args,
    id,
    signal,
  }: {
    name: string
    args?: Record<string, unknown> | string | undefined
    id?: string
    signal?: AbortSignal
  }): Promise<
    Extract<
      ToolCallResponse,
      {
        status:
          | ToolCallResponseStatus.Success
          | ToolCallResponseStatus.Error
          | ToolCallResponseStatus.Aborted
      }
    >
  > {
    const toolAbortController = new AbortController()
    if (id !== undefined) {
      const existingAbortController = this.activeToolCalls.get(id)
      if (existingAbortController) {
        existingAbortController.abort()
      }
      this.activeToolCalls.set(id, toolAbortController)
    }
    const compositeSignal = toolAbortController.signal
    if (signal) {
      signal.addEventListener('abort', () => toolAbortController.abort())
    }

    try {
      const { serverName, toolName } = parseToolName(name)
      const server = this.servers.find((server) => server.name === serverName)
      if (!server) {
        throw new Error(`MCP server ${serverName} not found`)
      }
      if (server.status !== McpServerStatus.Connected) {
        throw new Error(`MCP server ${serverName} is not connected`)
      }
      const { client } = server

      const parsedArgs: Record<string, unknown> | undefined =
        typeof args === 'string'
          ? args === ''
            ? {}
            : (JSON.parse(args) as Record<string, unknown>)
          : args

      const result = (await client.callTool(
        {
          name: toolName,
          arguments: parsedArgs,
        },
        undefined,
        {
          signal: compositeSignal,
        },
      )) as McpToolCallResult

      if (result.content.length === 0) {
        throw new Error('Tool call returned no content')
      }
      if (result.content[0].type !== 'text') {
        throw new Error(
          `Tool result with content type ${result.content[0].type} is not currently supported.`,
        )
      }
      if (result.isError) {
        return {
          status: ToolCallResponseStatus.Error,
          error: result.content[0].text,
        }
      }
      return {
        status: ToolCallResponseStatus.Success,
        data: {
          type: 'text',
          text: result.content[0].text,
        },
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          status: ToolCallResponseStatus.Aborted,
        }
      }

      // Handle other errors
      return {
        status: ToolCallResponseStatus.Error,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      }
    } finally {
      if (id !== undefined) {
        this.activeToolCalls.delete(id)
      }
    }
  }

  public abortToolCall(id: string): boolean {
    const toolAbortController = this.activeToolCalls.get(id)
    if (toolAbortController) {
      toolAbortController.abort()
      this.activeToolCalls.delete(id)
      return true
    }
    return false
  }
}
