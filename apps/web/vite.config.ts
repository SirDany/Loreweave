import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { promises as fs, watch as fsWatch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { loadAgents, type AgentDescriptor } from './server/agents.js';
import {
  runTool,
  toolDescriptors,
  type ToolName,
  type ToolContext,
} from './server/tools.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const CLI_BIN = path.join(REPO_ROOT, 'packages/cli/dist/bin.js');

/**
 * Dev middleware that lets the browser invoke the `lw` CLI locally.
 * POST /lw         with { args: string[] } -> { stdout, stderr, code }
 * POST /lw/write   with { sagaRoot, relPath, content } -> 204 on success
 * GET  /lw/events  SSE stream; emits `change` when a Saga file is touched
 *
 * All endpoints are bound to localhost by default (see `server.host` below)
 * so the filesystem is never exposed over the network.
 */
function lwSidecar(): Plugin {
  const MAX_BODY = 8 * 1024 * 1024; // 8 MiB — plenty for a chapter + frontmatter
  const CLI_TIMEOUT_MS = 30_000;
  const MAX_CONCURRENT_CLI = 4;

  let inflight = 0;
  const queue: Array<() => void> = [];

  function acquireSlot(): Promise<void> {
    if (inflight < MAX_CONCURRENT_CLI) {
      inflight++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      queue.push(() => {
        inflight++;
        resolve();
      });
    });
  }

  function releaseSlot() {
    inflight--;
    const next = queue.shift();
    if (next) next();
  }

  function readBody(
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      let body = '';
      let oversize = false;
      req.on('data', (chunk) => {
        if (oversize) return;
        body += chunk;
        if (body.length > MAX_BODY) {
          oversize = true;
          res.statusCode = 413;
          res.end('payload too large');
          resolve(null);
        }
      });
      req.on('end', () => {
        if (!oversize) resolve(body);
      });
      req.on('error', () => resolve(null));
    });
  }

  // --- SSE broadcast for file-system changes --------------------------------
  const sseClients = new Set<import('node:http').ServerResponse>();
  const watchers = new Map<string, FSWatcher>();
  /** Debounce burst writes into a single client notification. */
  let broadcastTimer: NodeJS.Timeout | null = null;
  let pendingPath: string | null = null;

  function broadcastChange(file: string) {
    pendingPath = file;
    if (broadcastTimer) return;
    broadcastTimer = setTimeout(() => {
      broadcastTimer = null;
      const payload = JSON.stringify({ path: pendingPath, ts: Date.now() });
      pendingPath = null;
      for (const res of sseClients) {
        try {
          res.write(`event: change\ndata: ${payload}\n\n`);
        } catch {
          sseClients.delete(res);
        }
      }
    }, 120);
  }

  function watchSagaRoot(absRoot: string) {
    if (watchers.has(absRoot)) return;
    try {
      const w = fsWatch(
        absRoot,
        { recursive: true, persistent: false },
        (_event, filename) => {
          if (!filename) return;
          const rel = filename.toString();
          // Ignore tooling noise.
          if (
            rel.includes('.git' + path.sep) ||
            rel.includes(path.sep + '.loreweave' + path.sep) ||
            rel.includes('node_modules')
          ) {
            return;
          }
          broadcastChange(rel);
        },
      );
      w.on('error', () => {
        w.close();
        watchers.delete(absRoot);
      });
      watchers.set(absRoot, w);
    } catch {
      // Recursive watch isn't supported on every platform/FS; skip silently.
    }
  }

  function safeRoot(sagaRoot: string): string {
    return path.isAbsolute(sagaRoot)
      ? sagaRoot
      : path.join(REPO_ROOT, sagaRoot);
  }

  return {
    name: 'loreweave-lw-sidecar',
    configureServer(server) {
      // --- write -----------------------------------------------------------
      server.middlewares.use('/lw/write', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('method not allowed');
          return;
        }
        const body = await readBody(req, res);
        if (body == null) return;
        try {
          const { sagaRoot, relPath, content } = JSON.parse(body || '{}');
          if (
            typeof sagaRoot !== 'string' ||
            typeof relPath !== 'string' ||
            typeof content !== 'string'
          ) {
            throw new Error('sagaRoot, relPath, content required');
          }
          const rootAbs = safeRoot(sagaRoot);
          const safe = safeJoin(rootAbs, relPath);
          await fs.mkdir(path.dirname(safe), { recursive: true });
          await fs.writeFile(safe, content, 'utf8');
          res.statusCode = 204;
          res.setHeader('cache-control', 'no-store');
          res.end();
        } catch (e) {
          res.statusCode = 400;
          res.end(String(e));
        }
      });

      // --- SSE watcher -----------------------------------------------------
      server.middlewares.use('/lw/events', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('method not allowed');
          return;
        }
        const url = new URL(req.url ?? '', 'http://localhost');
        const rootParam = url.searchParams.get('sagaRoot');
        if (!rootParam) {
          res.statusCode = 400;
          res.end('sagaRoot query param required');
          return;
        }
        let absRoot: string;
        try {
          absRoot = path.resolve(safeRoot(rootParam));
        } catch (e) {
          res.statusCode = 400;
          res.end(String(e));
          return;
        }
        res.statusCode = 200;
        res.setHeader('content-type', 'text/event-stream');
        res.setHeader('cache-control', 'no-store');
        res.setHeader('connection', 'keep-alive');
        res.write(`event: ready\ndata: "${absRoot}"\n\n`);

        sseClients.add(res);
        watchSagaRoot(absRoot);

        // Keep-alive ping every 25 s so proxies don't drop the stream.
        const ping = setInterval(() => {
          try {
            res.write(`: ping\n\n`);
          } catch {
            /* ignore */
          }
        }, 25_000);

        req.on('close', () => {
          clearInterval(ping);
          sseClients.delete(res);
        });
      });

      // --- Agent catalog ---------------------------------------------------
      let agentCache: {
        agents: AgentDescriptor[];
        preamble: string;
      } | null = null;
      const getAgents = async () => {
        if (agentCache) return agentCache;
        agentCache = await loadAgents(REPO_ROOT);
        return agentCache;
      };

      server.middlewares.use('/lw/agents', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('method not allowed');
          return;
        }
        try {
          const { agents, preamble } = await getAgents();
          res.statusCode = 200;
          res.setHeader('content-type', 'application/json');
          res.setHeader('cache-control', 'no-store');
          res.end(
            JSON.stringify({
              agents: agents.map((a) => ({
                id: a.id,
                name: a.name,
                description: a.description,
                tools: a.tools,
              })),
              hasPreamble: preamble.length > 0,
            }),
          );
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
        }
      });

      // --- Chat (LLM proxy + tool dispatch) --------------------------------
      server.middlewares.use('/lw/chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('method not allowed');
          return;
        }
        const body = await readBody(req, res);
        if (body == null) return;
        let payload: ChatRequest;
        try {
          payload = JSON.parse(body || '{}');
          if (
            typeof payload.agent !== 'string' ||
            !Array.isArray(payload.messages) ||
            typeof payload.sagaRoot !== 'string'
          ) {
            throw new Error('agent, messages, sagaRoot required');
          }
        } catch (e) {
          res.statusCode = 400;
          res.end(String(e));
          return;
        }

        res.statusCode = 200;
        res.setHeader('content-type', 'text/event-stream');
        res.setHeader('cache-control', 'no-store');
        res.setHeader('connection', 'keep-alive');

        const send = (event: string, data: unknown) => {
          try {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          } catch {
            /* client disconnected */
          }
        };

        try {
          const { agents, preamble } = await getAgents();
          const agent = agents.find((a) => a.id === payload.agent);
          if (!agent) throw new Error(`unknown agent: ${payload.agent}`);

          const model = await resolveModel();

          const ctx: ToolContext = {
            repoRoot: REPO_ROOT,
            cliBin: CLI_BIN,
            defaultSagaRoot: payload.sagaRoot,
            safeJoin,
          };

          // Build AI SDK tool definitions. Each `execute` dispatches to our
          // runTool() and emits tool_call / tool_result SSE events for the
          // UI's tool-call trace.
          const { tool } = await import('ai');
          const tools: Record<string, unknown> = {};
          for (const [name, desc] of Object.entries(toolDescriptors)) {
            tools[name] = tool({
              description: desc.description,
              parameters: desc.schema,
              execute: async (rawArgs: unknown) => {
                send('tool_call', { name, args: rawArgs });
                const result = await runTool(name as ToolName, rawArgs, ctx);
                send('tool_result', { name, result });
                return result;
              },
            });
          }

          let system = agent.systemPrompt;
          if (preamble) system = `${preamble}\n\n---\n\n${system}`;
          system += `\n\n---\n\n## Runtime context\n\nYou are operating inside the Loreweave web app. The writer's current Saga root is \`${payload.sagaRoot}\`. Always pass that as \`sagaRoot\` when calling tools. Mutating tools (\`propose_*\`) never write to disk — they produce a pending-action card the writer must approve.`;
          if (payload.context?.selection) {
            system += `\n\nThe writer attached the following selection as context:\n\n\`\`\`\n${payload.context.selection}\n\`\`\``;
            if (payload.context.path) {
              system += `\n\nSelection source: \`${payload.context.path}\``;
            }
          }

          const { streamText } = await import('ai');
          const result = streamText({
            model,
            system,
            messages: payload.messages,
            tools: tools as Parameters<typeof streamText>[0]['tools'],
            maxSteps: 8,
          });

          for await (const part of result.fullStream) {
            if (part.type === 'text-delta') {
              send('token', part.textDelta);
            } else if (part.type === 'error') {
              send('error', String(part.error));
            }
            // tool_call / tool_result already emitted by execute().
          }
          send('done', {});
          res.end();
        } catch (e) {
          send('error', (e as Error).message ?? String(e));
          res.end();
        }
      });

      // --- CLI exec --------------------------------------------------------
      server.middlewares.use('/lw', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('method not allowed');
          return;
        }
        const body = await readBody(req, res);
        if (body == null) return;
        let args: string[] = [];
        try {
          const parsed = JSON.parse(body || '{}');
          if (!Array.isArray(parsed.args))
            throw new Error('args must be an array');
          args = parsed.args;
        } catch (e) {
          res.statusCode = 400;
          res.end(String(e));
          return;
        }

        await acquireSlot();        let finished = false;
        const child = spawn('node', [CLI_BIN, ...args], { cwd: REPO_ROOT });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
          if (finished) return;
          stderr += `\n[lw sidecar] aborted after ${CLI_TIMEOUT_MS}ms`;
          child.kill('SIGTERM');
          setTimeout(() => child.kill('SIGKILL'), 2000).unref();
        }, CLI_TIMEOUT_MS);

        child.stdout.on('data', (c) => (stdout += c));
        child.stderr.on('data', (c) => (stderr += c));
        child.on('error', (err) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          releaseSlot();
          res.statusCode = 500;
          res.setHeader('cache-control', 'no-store');
          res.end(String(err));
        });
        child.on('close', (code) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          releaseSlot();
          res.setHeader('content-type', 'application/json');
          res.setHeader('cache-control', 'no-store');
          res.end(JSON.stringify({ stdout, stderr, code: code ?? -1 }));
        });
        req.on('close', () => {
          if (finished) return;
          child.kill('SIGTERM');
        });
      });

      server.httpServer?.on('close', () => {
        for (const w of watchers.values()) w.close();
        watchers.clear();
        for (const res of sseClients) {
          try {
            res.end();
          } catch {
            /* ignore */
          }
        }
        sseClients.clear();
      });
    },
  };
}

interface ChatRequest {
  agent: string;
  sagaRoot: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  context?: {
    selection?: string;
    path?: string;
    lines?: [number, number];
  };
}

/**
 * Pick an LLM provider + model from env vars:
 *   LW_AI_PROVIDER=anthropic|openai  (optional, auto-detected from API keys)
 *   LW_AI_MODEL=<model-id>           (optional; sane defaults per provider)
 *   ANTHROPIC_API_KEY / OPENAI_API_KEY
 */
async function resolveModel() {
  const explicit = process.env.LW_AI_PROVIDER?.toLowerCase();
  const provider =
    explicit ??
    (process.env.ANTHROPIC_API_KEY
      ? 'anthropic'
      : process.env.OPENAI_API_KEY
        ? 'openai'
        : undefined);
  if (!provider) {
    throw new Error(
      'No LLM provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY ' +
        '(and optionally LW_AI_PROVIDER / LW_AI_MODEL) in the dev server env.',
    );
  }
  if (provider === 'anthropic') {
    const { anthropic } = await import('@ai-sdk/anthropic');
    return anthropic(process.env.LW_AI_MODEL ?? 'claude-3-5-sonnet-latest');
  }
  if (provider === 'openai') {
    const { openai } = await import('@ai-sdk/openai');
    return openai(process.env.LW_AI_MODEL ?? 'gpt-4o-mini');
  }
  throw new Error(`Unknown LW_AI_PROVIDER: ${provider}`);
}

function safeJoin(root: string, rel: string): string {
  if (rel.includes('..'))
    throw new Error("relative path must not contain '..'");
  const normalizedRoot = path.resolve(root);
  const joined = path.resolve(normalizedRoot, rel);
  if (
    !joined.startsWith(normalizedRoot + path.sep) &&
    joined !== normalizedRoot
  ) {
    throw new Error(
      `path escape detected: ${joined} is outside ${normalizedRoot}`,
    );
  }
  return joined;
}

export default defineConfig({
  plugins: [react(), lwSidecar()],
  resolve: {
    alias: {
      '@': path.resolve(HERE, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    fs: {
      // Allow serving files from the whole repo (sagas/, packages/, …).
      allow: [REPO_ROOT],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (
            id.includes('@codemirror') ||
            id.includes('@lezer') ||
            id.includes('codemirror')
          ) {
            return 'codemirror';
          }
          if (
            id.includes('react-dom') ||
            id.includes('/react/') ||
            id.includes('scheduler')
          ) {
            return 'react';
          }
          if (id.includes('yaml')) return 'yaml';
        },
      },
    },
  },
});
