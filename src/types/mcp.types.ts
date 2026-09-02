import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type {
  CallToolResult,
  ListToolsResult,
  Tool,
} from '@modelcontextprotocol/sdk/types'
import { z } from 'zod'

export type McpTool = Tool
export type McpToolCallResult = CallToolResult
export type McpToolListResult = ListToolsResult
export type McpClient = Client

// Local (stdio) servers are spawned as a child process via Node.js — desktop only.
// `type` is optional here so existing configs (and configs copy-pasted from other
// MCP clients, which never include a "type" field) keep validating unchanged.
const mcpStdioServerParametersSchema = z
  .object({
    type: z.literal('stdio').optional(),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .strict()

// Remote servers reached over Streamable HTTP — just a fetch, works on any platform.
const mcpHttpServerParametersSchema = z
  .object({
    type: z.literal('http'),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .strict()

export const mcpServerParametersSchema = z.union([
  mcpHttpServerParametersSchema,
  mcpStdioServerParametersSchema,
])
export type McpServerParameters = z.infer<typeof mcpServerParametersSchema>

export const mcpServerToolOptionsSchema = z.record(
  z.string(),
  z.object({
    disabled: z.boolean().optional(),
    allowAutoExecution: z.boolean().optional(),
  }),
)

export const mcpServerConfigSchema = z.object({
  id: z.string(),
  parameters: mcpServerParametersSchema,
  enabled: z.boolean(),
  toolOptions: mcpServerToolOptionsSchema,
})
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>

export enum McpServerStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
}

export type McpServerState = {
  name: string
  config: McpServerConfig
} & (
  | {
      status: McpServerStatus.Connecting | McpServerStatus.Disconnected
    }
  | {
      status: McpServerStatus.Connected
      client: McpClient
      tools: McpTool[]
    }
  | {
      status: McpServerStatus.Error
      error: Error
    }
)
