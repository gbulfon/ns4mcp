#!/usr/bin/env node
/**
 * ns4mcp entrypoint — MCP server over stdio.
 *
 * Transport is created here and handed to the (transport-agnostic) server, so an
 * HTTP/SSE transport can be swapped in later without touching server.ts.
 *
 * Flags / env:
 *   --dry-run            never send MIDI (validate + track state only)
 *   --channel <1-16>     Nord global MIDI channel (default 1, or NS4_CHANNEL)
 *   --port-match <str>   MIDI port name substring (default "nord", or NS4_PORT_MATCH)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { NordController } from './controller.js';
import { buildServer } from './server.js';

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const channel = Number(argValue('channel') ?? process.env.NS4_CHANNEL ?? '1');
  const portMatch = argValue('port-match') ?? process.env.NS4_PORT_MATCH ?? 'nord';

  const ctrl = new NordController({ dryRun, channel, portMatch });

  // Best-effort connect at startup; tools reconnect on demand if this fails.
  if (!dryRun) {
    if (ctrl.ensureConnected()) process.stderr.write('[ns4mcp] Nord connected.\n');
    else process.stderr.write(`[ns4mcp] Nord not connected (${ctrl.lastError ?? 'unknown'}); will retry on use. Run \`npm run doctor\`.\n`);
  } else {
    process.stderr.write('[ns4mcp] dry-run: MIDI sending disabled.\n');
  }

  const server = buildServer(ctrl);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[ns4mcp] MCP server ready on stdio.\n');

  const shutdown = () => {
    try { ctrl.close(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  process.stderr.write(`[ns4mcp] fatal: ${err.message}\n`);
  process.exit(1);
});
