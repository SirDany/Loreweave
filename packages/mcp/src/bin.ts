#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLoreweaveMcpServer } from './server.js';

async function main() {
  const server = createLoreweaveMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Loreweave MCP] Server started on stdio');
}

main().catch((err) => {
  console.error('[Loreweave MCP] Fatal error:', err);
  process.exit(1);
});
