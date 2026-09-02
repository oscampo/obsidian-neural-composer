export class McpNotAvailableException extends Error {
  constructor(
    message = 'Local (command-based) MCP servers are not available on mobile',
  ) {
    super(message)
    this.name = 'McpNotAvailableException'
  }
}
export class InvalidToolNameException extends Error {
  constructor(name: string) {
    super(`Invalid tool name: ${name}`)
    this.name = 'InvalidToolNameException'
  }
}
