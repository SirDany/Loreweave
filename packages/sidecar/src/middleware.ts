/**
 * Loreweave HTTP sidecar — connect/Vite-style middleware registrar.
 *
 * The sidecar mounts a handful of localhost-only endpoints that let the
 * desktop/web UI drive the `lw` CLI and the AI assistant against a local
 * Saga root:
 *
 *   POST /lw          — `{ args: string[] }` → `{ stdout, stderr, code }`
 *   POST /lw/write    — `{ sagaRoot, relPath, content }` → 204
 *   POST /lw/apply    — hash-aware writer for assistant proposals
 *   GET  /lw/events   — SSE stream of FS-change events for a Saga
 *   GET  /lw/agents   — agent catalog loaded from `.github/agents/*.agent.md`
 *   POST /lw/chat     — SSE stream of LLM tokens + tool events
 *
 * All endpoints are meant to bind to `127.0.0.1` only; the caller (the
 * Vite plugin or a standalone launcher) is responsible for host binding.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { watch as fsWatch, type FSWatcher } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import {
  FsAdapter,
  StorageNotFoundError,
  type StorageAdapter,
} from '@loreweave/core';
import { loadAgents, type AgentDescriptor } from './agents.js';
import {
  getDigest,
  invalidateDigest,
  renderDigestForPrompt,
} from './digest-cache.js';
import {
  buildIndex,
  loadIndex,
  providerFromEnv,
  searchIndex,
} from './embeddings.js';
import { commitFile } from './git.js';
import { resolveModel } from './model.js';
import { safeJoin } from './paths.js';
import {
  runTool,
  toolDescriptors,
  type ToolContext,
  type ToolName,
} from './tools.js';

export interface SidecarOptions {
  /** Absolute path of the repo root — used as the CLI's cwd and Saga base. */
  repoRoot: string;
  /** Absolute path to the compiled `lw` CLI entry (`packages/cli/dist/bin.js`). */
  cliBin: string;
}

/**
 * Connect-style middleware registrar. Matches `vite.server.middlewares` and
 * `connect()`, so the same instance can be mounted in dev or in a bare Node
 * HTTP server later.
 */
export interface MiddlewareHost {
  use(
    route: string,
    handler: (req: IncomingMessage, res: ServerResponse) => unknown,
  ): unknown;
}

export interface SidecarHandle {
  /** Close all SSE streams + FS watchers. Safe to call multiple times. */
  close(): void;
}

interface ChatRequest {
  agent: string;
  sagaRoot: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  context?: {
    selection?: string;
    path?: string;
    lines?: [number, number];
    /** `type/id` refs the client knows are relevant (from the current chapter/entry). */
    likelyRefs?: string[];
  };
}

const MAX_BODY = 8 * 1024 * 1024; // 8 MiB — plenty for a chapter + frontmatter
const CLI_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT_CLI = 4;
const CHAT_WINDOW_MS = 60_000;
const CHAT_MAX_PER_WINDOW = 20;

function readBody(req: IncomingMessage, res: ServerResponse): Promise<string | null> {
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

/**
 * Mount every sidecar route on `host`. Returns a handle whose `close()`
 * tears down watchers and SSE streams — the caller should wire it to the
 * HTTP server's `close` event.
 */
export function registerSidecar(
  host: MiddlewareHost,
  opts: SidecarOptions,
): SidecarHandle {
  const { repoRoot, cliBin } = opts;

  // --- concurrency gate for CLI sub-processes -------------------------------
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

  // --- SSE broadcast for file-system changes --------------------------------
  const sseClients = new Set<ServerResponse>();
  const watchers = new Map<string, FSWatcher>();
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
    return path.isAbsolute(sagaRoot) ? sagaRoot : path.join(repoRoot, sagaRoot);
  }

  // Per-Saga storage adapters are cached so we don't re-resolve the absolute
  // root on every request. Swapping `FsAdapter` for an R2/S3 adapter later
  // would mean changing only this factory.
  const adapters = new Map<string, StorageAdapter>();
  function adapterFor(sagaRoot: string): StorageAdapter {
    const abs = path.resolve(safeRoot(sagaRoot));
    let a = adapters.get(abs);
    if (!a) {
      a = new FsAdapter(abs);
      adapters.set(abs, a);
    }
    return a;
  }

  // --- /lw/write ------------------------------------------------------------
  host.use('/lw/write', async (req, res) => {
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
      await adapterFor(sagaRoot).writeFile(relPath, content);
      res.statusCode = 204;
      res.setHeader('cache-control', 'no-store');
      res.end();
    } catch (e) {
      res.statusCode = 400;
      res.end(String(e));
    }
  });

  // --- /lw/apply ------------------------------------------------------------
  host.use('/lw/apply', async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('method not allowed');
      return;
    }
    const body = await readBody(req, res);
    if (body == null) return;
    try {
      const { sagaRoot, relPath, content, originalHash, commit } = JSON.parse(
        body || '{}',
      );
      if (
        typeof sagaRoot !== 'string' ||
        typeof relPath !== 'string' ||
        typeof content !== 'string'
      ) {
        throw new Error('sagaRoot, relPath, content required');
      }
      const commitMessage: string | null =
        commit && typeof commit.message === 'string' && commit.message.trim()
          ? commit.message.trim()
          : null;
      const commitAuthor: { name: string; email: string } | undefined =
        commit &&
        typeof commit.authorName === 'string' &&
        typeof commit.authorEmail === 'string'
          ? { name: commit.authorName, email: commit.authorEmail }
          : undefined;
      const adapter = adapterFor(sagaRoot);
      // Hash-based stale-detection: if the proposal was generated against
      // an original whose contents we know, re-read disk and bail if the
      // writer (or another tool) has since modified the file.
      if (typeof originalHash === 'string' && originalHash.length > 0) {
        let current = '';
        try {
          current = await adapter.readFile(relPath);
        } catch (e) {
          if (!(e instanceof StorageNotFoundError)) throw e;
          current = '';
        }
        const currentHash = createHash('sha256')
          .update(current, 'utf8')
          .digest('hex')
          .slice(0, 16);
        if (currentHash !== originalHash) {
          res.statusCode = 409;
          res.setHeader('content-type', 'application/json');
          res.setHeader('cache-control', 'no-store');
          res.end(
            JSON.stringify({
              error: 'stale',
              message:
                'File changed on disk since the proposal was generated. Refresh and ask the agent to re-propose.',
              currentHash,
              expectedHash: originalHash,
            }),
          );
          return;
        }
      }
      await adapter.writeFile(relPath, content);
      // Any mutation invalidates the on-disk canon digest; the next chat
      // turn will rebuild it from the fresh Saga.
      void invalidateDigest(path.resolve(safeRoot(sagaRoot)));

      // Optional auto-commit. Swallow commit-time failures (e.g. no
      // upstream author configured) so we don't lose a successful write;
      // surface them in the JSON response instead.
      let commitSha: string | null = null;
      let commitShort: string | null = null;
      let commitError: string | null = null;
      if (commitMessage) {
        try {
          const absRoot = path.resolve(safeRoot(sagaRoot));
          const r = await commitFile(absRoot, relPath, commitMessage, commitAuthor);
          if (r) {
            commitSha = r.sha;
            commitShort = r.shortSha;
          }
        } catch (e) {
          commitError = (e as Error).message;
        }
      }

      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', 'no-store');
      res.end(
        JSON.stringify({
          ok: true,
          newHash: createHash('sha256')
            .update(content, 'utf8')
            .digest('hex')
            .slice(0, 16),
          commit:
            commitSha !== null
              ? { sha: commitSha, shortSha: commitShort }
              : commitError !== null
                ? { error: commitError }
                : null,
        }),
      );
    } catch (e) {
      res.statusCode = 400;
      res.end(String(e));
    }
  });

  // --- /lw/digest (cached canon snapshot) ----------------------------------
  // Returns the phone book + resolved-weave cache + thread summaries that
  // the chat system prompt uses. Intended for UI consumers that want O(1)
  // @echo hover previews without running `lw weave` per hover.
  host.use('/lw/digest', async (req, res) => {
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
    const force = url.searchParams.get('force') === '1';
    try {
      const abs = path.resolve(safeRoot(rootParam));
      const digest = await getDigest(abs, { force });
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify(digest));
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e));
    }
  });

  // --- /lw/embed/status ----------------------------------------------------
  host.use('/lw/embed/status', async (req, res) => {
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
    try {
      const abs = path.resolve(safeRoot(rootParam));
      const cfg = providerFromEnv();
      const idx = await loadIndex(abs);
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', 'no-store');
      res.end(
        JSON.stringify({
          enabled: !!cfg,
          provider: cfg?.provider ?? null,
          model: cfg?.model ?? null,
          index: idx
            ? {
                provider: idx.provider,
                model: idx.model,
                builtAt: idx.builtAt,
                entries: idx.entries.length,
              }
            : null,
        }),
      );
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e));
    }
  });

  // --- /lw/embed/build -----------------------------------------------------
  host.use('/lw/embed/build', async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('method not allowed');
      return;
    }
    const body = await readBody(req, res);
    if (body == null) return;
    try {
      const { sagaRoot } = JSON.parse(body || '{}');
      if (typeof sagaRoot !== 'string') throw new Error('sagaRoot required');
      const cfg = providerFromEnv();
      if (!cfg) {
        throw new Error(
          'embeddings provider not configured (set LOREWEAVE_EMBEDDINGS)',
        );
      }
      const abs = path.resolve(safeRoot(sagaRoot));
      const idx = await buildIndex(abs, cfg);
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', 'no-store');
      res.end(
        JSON.stringify({
          ok: true,
          provider: idx.provider,
          model: idx.model,
          entries: idx.entries.length,
        }),
      );
    } catch (e) {
      res.statusCode = 400;
      res.end(String(e));
    }
  });

  // --- /lw/embed/search ----------------------------------------------------
  host.use('/lw/embed/search', async (req, res) => {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('method not allowed');
      return;
    }
    const url = new URL(req.url ?? '', 'http://localhost');
    const rootParam = url.searchParams.get('sagaRoot');
    const q = url.searchParams.get('q');
    const kParam = url.searchParams.get('k');
    if (!rootParam || !q) {
      res.statusCode = 400;
      res.end('sagaRoot + q query params required');
      return;
    }
    try {
      const cfg = providerFromEnv();
      if (!cfg) throw new Error('embeddings provider not configured');
      const abs = path.resolve(safeRoot(rootParam));
      const hits = await searchIndex(abs, q, cfg, kParam ? parseInt(kParam, 10) : 8);
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify({ hits }));
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e));
    }
  });

  // --- /lw/events (SSE FS watcher) -----------------------------------------
  host.use('/lw/events', (req, res) => {
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

  // --- /lw/agents ----------------------------------------------------------
  let agentCache: { agents: AgentDescriptor[]; preamble: string } | null = null;
  const getAgents = async () => {
    if (agentCache) return agentCache;
    agentCache = await loadAgents(repoRoot);
    return agentCache;
  };

  host.use('/lw/agents', async (req, res) => {
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

  // --- /lw/chat (LLM proxy + tool dispatch) --------------------------------
  const chatStartTimes: number[] = [];

  host.use('/lw/chat', async (req, res) => {
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

    // Sliding-window rate limit: cap chat starts per minute.
    const now = Date.now();
    while (chatStartTimes.length && now - chatStartTimes[0]! > CHAT_WINDOW_MS) {
      chatStartTimes.shift();
    }
    if (chatStartTimes.length >= CHAT_MAX_PER_WINDOW) {
      res.statusCode = 429;
      res.setHeader('cache-control', 'no-store');
      res.end(
        `Rate limit: max ${CHAT_MAX_PER_WINDOW} chat turns per minute. Wait a moment and retry.`,
      );
      return;
    }
    chatStartTimes.push(now);

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

    const abort = new AbortController();
    req.on('close', () => abort.abort());

    const logEvents: Array<Record<string, unknown>> = [];
    const pushLog = (evt: Record<string, unknown>) =>
      logEvents.push({ ts: Date.now(), ...evt });

    try {
      const { agents, preamble } = await getAgents();
      const agent = agents.find((a) => a.id === payload.agent);
      if (!agent) throw new Error(`unknown agent: ${payload.agent}`);

      const model = await resolveModel();

      const ctx: ToolContext = {
        repoRoot,
        cliBin,
        defaultSagaRoot: payload.sagaRoot,
        safeJoin,
        storageFor: adapterFor,
      };

      const { tool } = await import('ai');
      const tools: Record<string, unknown> = {};
      for (const [name, desc] of Object.entries(toolDescriptors)) {
        tools[name] = tool({
          description: desc.description,
          parameters: desc.schema,
          execute: async (rawArgs: unknown) => {
            send('tool_call', { name, args: rawArgs });
            pushLog({ type: 'tool_call', name, args: rawArgs });
            const result = await runTool(name as ToolName, rawArgs, ctx, {
              signal: abort.signal,
            });
            send('tool_result', { name, result });
            pushLog({
              type: 'tool_result',
              name,
              ok: result.ok,
              error: result.error?.slice(0, 400),
            });
            return result;
          },
        });
      }


      // Ground the agent in canon: inject a compact phone book of every
      // entry, plus thread summaries. Cached on disk and keyed by git HEAD
      // so this is effectively free after the first turn.
      let system = agent.systemPrompt;
      if (preamble) system = `${preamble}\n\n---\n\n${system}`;
      system += `\n\n---\n\n## Runtime context\n\nYou are operating inside the Loreweave web app. The writer's current Saga root is \`${payload.sagaRoot}\`. Always pass that as \`sagaRoot\` when calling tools. Mutating tools (\`propose_*\`) never write to disk — they produce a pending-action card the writer must approve. Prefer \`propose_patch\` over \`propose_edit\` for localized changes.`;
      try {
        const digest = await getDigest(path.resolve(safeRoot(payload.sagaRoot)));
        system += `\n\n---\n\n${renderDigestForPrompt(digest)}`;
      } catch (e) {
        pushLog({ type: 'digest_error', error: (e as Error).message });
      }
      if (payload.context?.selection) {
        system += `\n\nThe writer attached the following selection as context:\n\n\`\`\`\n${payload.context.selection.replace(/```/g, '``\u200b`')}\n\`\`\``;
        if (payload.context.path) {
          system += `\n\nSelection source: \`${payload.context.path}\``;
        }
      }
      if (
        payload.context?.likelyRefs &&
        payload.context.likelyRefs.length > 0
      ) {
        system += `\n\n### Likely-relevant canon refs\n\nThe writer's current chapter mentions: ${payload.context.likelyRefs
          .map((r) => `\`${r}\``)
          .join(', ')}. Consider calling \`lw_weave\` on any you need before drafting.`;
      }

      const { streamText } = await import('ai');
      // The `ai` SDK type shape drifts between versions; the public runtime
      // contract (`fullStream`, `await result.usage`) is stable. Cast the
      // result here rather than pinning a type that breaks on every bump.
      const result = streamText({
        model: model as never,
        system,
        messages: payload.messages,
        tools: tools as Parameters<typeof streamText>[0]['tools'],
        maxSteps: 8,
        abortSignal: abort.signal,
      }) as unknown as {
        fullStream: AsyncIterable<
          | { type: 'text-delta'; textDelta: string }
          | { type: 'error'; error: unknown }
          | { type: string; [k: string]: unknown }
        >;
        usage: Promise<unknown>;
      };

      pushLog({
        type: 'user',
        agent: payload.agent,
        messages: payload.messages.length,
      });

      let assistantText = '';
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          send('token', part.textDelta);
          assistantText += part.textDelta;
        } else if (part.type === 'error') {
          send('error', String(part.error));
          pushLog({ type: 'error', message: String(part.error) });
        }
      }
      try {
        const usage = await result.usage;
        if (usage) send('usage', usage);
        pushLog({
          type: 'assistant',
          text: assistantText.slice(0, 2000),
          usage,
        });
      } catch {
        pushLog({ type: 'assistant', text: assistantText.slice(0, 2000) });
      }
      send('done', {});
      res.end();
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      send('error', msg);
      pushLog({ type: 'error', message: msg });
      res.end();
    } finally {
      try {
        const line =
          JSON.stringify({
            ts: Date.now(),
            agent: payload.agent,
            sagaRoot: payload.sagaRoot,
            events: logEvents,
          }) + '\n';
        await adapterFor(payload.sagaRoot).appendFile(
          '.loreweave/assistant-log.jsonl',
          line,
        );
      } catch {
        /* ignore log failures */
      }
    }
  });

  // --- /lw (raw CLI exec) --------------------------------------------------
  host.use('/lw', async (req, res) => {
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
      if (!Array.isArray(parsed.args)) throw new Error('args must be an array');
      args = parsed.args;
    } catch (e) {
      res.statusCode = 400;
      res.end(String(e));
      return;
    }

    await acquireSlot();
    let finished = false;
    const child = spawn('node', [cliBin, ...args], { cwd: repoRoot });
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

  return {
    close() {
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
    },
  };
}
