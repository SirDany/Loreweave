import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type ChatRole = 'user' | 'assistant' | 'system';
export type ApprovalPolicy = 'auto-reads' | 'writes-approval' | 'approve-all';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Tool calls emitted during this assistant turn. */
  toolCalls?: ChatToolCall[];
  /** Handoff recommendations emitted during this turn. */
  handoffs?: Array<{ to: string; instructions: string }>;
}

export interface ChatToolCall {
  name: string;
  args: unknown;
  result?: ChatToolResult;
}

export interface ChatToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface PendingAction {
  id: string;
  /** Matches the tool name that proposed it (`propose_edit` / `propose_patch` / `propose_new_entry`). */
  source: string;
  kind: 'edit' | 'new';
  sagaRoot: string;
  relPath: string;
  /** Previous file contents (for `edit`) or existing file if any (for `new`). */
  original?: string;
  /** For `edit`/`new`: proposed new contents. */
  next: string;
  diff?: string;
  /** sha256-prefix of `original` at proposal time — enables stale detection on Apply. */
  originalHash?: string;
  /** sha256-prefix of the file after Apply. Enables Revert to detect external changes. */
  appliedHash?: string;
  exists?: boolean;
  rationale?: string | null;
  patch?: boolean;
  status: 'pending' | 'applied' | 'discarded' | 'stale';
  error?: string;
}

export interface AgentMeta {
  id: string;
  name: string;
  description: string;
  tools: string[];
}

export interface ChatContextAttachment {
  selection?: string;
  path?: string;
  lines?: [number, number];
  likelyRefs?: string[];
}

export interface UsageSummary {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

interface UseChatOptions {
  sagaRoot: string;
  approvalPolicy?: ApprovalPolicy;
}

interface PersistedThread {
  messages: ChatMessage[];
  pending: PendingAction[];
  usageTotal: UsageSummary;
}

let idCounter = 0;
const nextId = () => `${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

const THREADS_KEY = (sagaRoot: string) => `lw.chat.threads.${sagaRoot}`;

function loadThreads(sagaRoot: string): Record<string, PersistedThread> {
  try {
    const raw = localStorage.getItem(THREADS_KEY(sagaRoot));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PersistedThread>;
  } catch {
    return {};
  }
}

function saveThreads(
  sagaRoot: string,
  threads: Record<string, PersistedThread>,
) {
  try {
    localStorage.setItem(THREADS_KEY(sagaRoot), JSON.stringify(threads));
  } catch {
    /* quota exceeded or private mode — best-effort only */
  }
}

/**
 * Streams a chat conversation with a Loreweave agent against the Vite dev
 * sidecar's `/lw/chat` SSE endpoint. Maintains per-agent threads persisted
 * to `localStorage` so switching agents preserves each personality's
 * context, and offers retry + handoff handling.
 */
export function useChat({ sagaRoot, approvalPolicy: _policy = 'writes-approval' }: UseChatOptions) {
  void _policy;
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [agentId, setAgentIdState] = useState<string>('');
  const [threads, setThreads] = useState<Record<string, PersistedThread>>(
    () => loadThreads(sagaRoot),
  );
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<{
    content: string;
    context?: ChatContextAttachment;
  } | null>(null);

  // Reload threads when saga changes.
  useEffect(() => {
    setThreads(loadThreads(sagaRoot));
  }, [sagaRoot]);

  // Persist threads.
  useEffect(() => {
    saveThreads(sagaRoot, threads);
  }, [sagaRoot, threads]);

  // Load agent catalog once.
  useEffect(() => {
    let cancelled = false;
    fetch('/lw/agents')
      .then(async (r) => {
        if (!r.ok) throw new Error(`/lw/agents ${r.status}`);
        return (await r.json()) as { agents: AgentMeta[] };
      })
      .then((body) => {
        if (cancelled) return;
        setAgents(body.agents);
        if (!agentId && body.agents.length > 0) {
          const preferred =
            body.agents.find((a) => a.id === 'muse') ?? body.agents[0]!;
          setAgentIdState(preferred.id);
        }
      })
      .catch((e) => {
        if (!cancelled) setAgentsError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentThread = useMemo<PersistedThread>(
    () =>
      threads[agentId] ?? {
        messages: [],
        pending: [],
        usageTotal: {},
      },
    [threads, agentId],
  );

  const updateThread = useCallback(
    (updater: (t: PersistedThread) => PersistedThread) => {
      setThreads((prev) => {
        const curr = prev[agentId] ?? {
          messages: [],
          pending: [],
          usageTotal: {},
        };
        return { ...prev, [agentId]: updater(curr) };
      });
    },
    [agentId],
  );

  const setAgentId = useCallback(
    (id: string) => {
      // Switching agents cancels any in-flight stream so responses don't
      // bleed across threads.
      abortRef.current?.abort();
      abortRef.current = null;
      setStreaming(false);
      setAgentIdState(id);
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const reset = useCallback(() => {
    cancel();
    setThreads((prev) => ({
      ...prev,
      [agentId]: { messages: [], pending: [], usageTotal: {} },
    }));
    setStreamError(null);
    lastUserMessageRef.current = null;
  }, [agentId, cancel]);

  const sendInternal = useCallback(
    async (content: string, context?: ChatContextAttachment) => {
      if (!content.trim()) return;
      if (!agentId) {
        setStreamError('No agent selected.');
        return;
      }
      cancel();
      setStreamError(null);
      lastUserMessageRef.current = { content, context };

      const userMsg: ChatMessage = {
        id: nextId(),
        role: 'user',
        content,
      };
      const assistantId = nextId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        toolCalls: [],
      };

      // Snapshot history ourselves so we don't race setThreads.
      const existingMessages = currentThread.messages;
      const history = [...existingMessages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      updateThread((t) => ({
        ...t,
        messages: [...t.messages, userMsg, assistantMsg],
      }));
      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const resp = await fetch('/lw/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            agent: agentId,
            sagaRoot,
            messages: history,
            context,
          }),
          signal: ctrl.signal,
        });
        if (!resp.ok || !resp.body) {
          const txt = await resp.text().catch(() => '');
          throw new Error(`/lw/chat ${resp.status}${txt ? `: ${txt}` : ''}`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        const applyToAssistant = (fn: (m: ChatMessage) => ChatMessage) => {
          updateThread((t) => ({
            ...t,
            messages: t.messages.map((m) => (m.id === assistantId ? fn(m) : m)),
          }));
        };

        const handleEvent = (event: string, data: string) => {
          if (event === 'token') {
            let token: string;
            try {
              token = JSON.parse(data) as string;
            } catch {
              token = data;
            }
            applyToAssistant((m) => ({ ...m, content: m.content + token }));
            return;
          }
          if (event === 'tool_call') {
            const parsed = safeParse<{ name: string; args: unknown }>(data);
            if (!parsed) return;
            applyToAssistant((m) => ({
              ...m,
              toolCalls: [
                ...(m.toolCalls ?? []),
                { name: parsed.name, args: parsed.args },
              ],
            }));
            return;
          }
          if (event === 'tool_result') {
            const parsed = safeParse<{ name: string; result: ChatToolResult }>(
              data,
            );
            if (!parsed) return;
            applyToAssistant((m) => {
              const calls = m.toolCalls ?? [];
              for (let i = calls.length - 1; i >= 0; i--) {
                if (calls[i]!.name === parsed.name && !calls[i]!.result) {
                  const next = calls.slice();
                  next[i] = { ...next[i]!, result: parsed.result };
                  return { ...m, toolCalls: next };
                }
              }
              return m;
            });
            // Surface `propose_*` tool results as pending actions; dedupe
            // on (source, relPath) so re-proposals replace the previous card.
            if (
              parsed.result.ok &&
              (parsed.name === 'propose_edit' ||
                parsed.name === 'propose_patch' ||
                parsed.name === 'propose_new_entry')
            ) {
              const d = parsed.result.data as
                | (PendingAction & { relPath: string })
                | undefined;
              if (d && (d.kind === 'edit' || d.kind === 'new')) {
                updateThread((t) => {
                  const filtered = t.pending.filter(
                    (p) =>
                      p.status !== 'pending' ||
                      p.source !== parsed.name ||
                      p.relPath !== d.relPath,
                  );
                  return {
                    ...t,
                    pending: [
                      ...filtered,
                      {
                        ...d,
                        id: nextId(),
                        source: parsed.name,
                        status: 'pending',
                      },
                    ],
                  };
                });
              }
            }
            // Handoff recommendations go on the assistant message.
            if (parsed.name === 'handoff' && parsed.result.ok) {
              const d = parsed.result.data as
                | { to?: string; instructions?: string }
                | undefined;
              if (d?.to && d?.instructions) {
                applyToAssistant((m) => ({
                  ...m,
                  handoffs: [
                    ...(m.handoffs ?? []),
                    { to: d.to!, instructions: d.instructions! },
                  ],
                }));
              }
            }
            return;
          }
          if (event === 'usage') {
            const u = safeParse<UsageSummary>(data);
            if (!u) return;
            updateThread((t) => ({
              ...t,
              usageTotal: {
                promptTokens:
                  (t.usageTotal.promptTokens ?? 0) + (u.promptTokens ?? 0),
                completionTokens:
                  (t.usageTotal.completionTokens ?? 0) +
                  (u.completionTokens ?? 0),
                totalTokens:
                  (t.usageTotal.totalTokens ?? 0) + (u.totalTokens ?? 0),
              },
            }));
            return;
          }
          if (event === 'error') {
            const msg = (safeParse<string>(data) as string | undefined) ?? data;
            setStreamError(msg);
            return;
          }
        };

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let sepIdx = buf.indexOf('\n\n');
          while (sepIdx !== -1) {
            const raw = buf.slice(0, sepIdx);
            buf = buf.slice(sepIdx + 2);
            const lines = raw.split(/\r?\n/);
            let event = 'message';
            const dataLines: string[] = [];
            for (const line of lines) {
              if (line.startsWith(':')) continue;
              if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:'))
                dataLines.push(line.slice(5).replace(/^ /, ''));
            }
            handleEvent(event, dataLines.join('\n'));
            sepIdx = buf.indexOf('\n\n');
          }
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setStreamError((e as Error).message);
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
      }
    },
    [agentId, cancel, currentThread.messages, sagaRoot, updateThread],
  );

  const send = useCallback(
    (content: string, context?: ChatContextAttachment) =>
      sendInternal(content, context),
    [sendInternal],
  );

  /** Re-send the last user message (after an error or to regenerate). */
  const retry = useCallback(async () => {
    const last = lastUserMessageRef.current;
    if (!last) return;
    // Strip the previous assistant turn so regenerate replaces it.
    updateThread((t) => {
      const msgs = t.messages.slice();
      // Remove trailing assistant + user pair; sendInternal re-adds them.
      while (msgs.length && msgs[msgs.length - 1]!.role === 'assistant') {
        msgs.pop();
      }
      if (msgs.length && msgs[msgs.length - 1]!.role === 'user') {
        msgs.pop();
      }
      return { ...t, messages: msgs };
    });
    await sendInternal(last.content, last.context);
  }, [sendInternal, updateThread]);

  const applyPending = useCallback(
    async (id: string): Promise<void> => {
      const action = threadsRef.current[agentId]?.pending.find(
        (p) => p.id === id,
      );
      if (!action) return;
      // Mark applying eagerly; revert on error.
      updateThread((t) => ({
        ...t,
        pending: t.pending.map((p) =>
          p.id === id ? { ...p, status: 'applied', error: undefined } : p,
        ),
      }));
      try {
        const resp = await fetch('/lw/apply', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sagaRoot: action.sagaRoot,
            relPath: action.relPath,
            content: action.next,
            originalHash: action.originalHash,
          }),
        });
        if (resp.status === 409) {
          updateThread((t) => ({
            ...t,
            pending: t.pending.map((p) =>
              p.id === id
                ? {
                    ...p,
                    status: 'stale',
                    error:
                      'File changed on disk since proposal. Ask the agent to re-propose.',
                  }
                : p,
            ),
          }));
          return;
        }
        if (!resp.ok) {
          throw new Error(`/lw/apply ${resp.status}`);
        }
        // Capture the new hash so Revert can validate it hasn't drifted.
        try {
          const body = (await resp.json()) as { newHash?: string };
          if (body?.newHash) {
            updateThread((t) => ({
              ...t,
              pending: t.pending.map((p) =>
                p.id === id ? { ...p, appliedHash: body.newHash } : p,
              ),
            }));
          }
        } catch {
          /* ignore */
        }
      } catch (e) {
        updateThread((t) => ({
          ...t,
          pending: t.pending.map((p) =>
            p.id === id
              ? { ...p, status: 'pending', error: (e as Error).message }
              : p,
          ),
        }));
      }
    },
    [agentId, updateThread],
  );

  const discardPending = useCallback(
    (id: string) => {
      updateThread((t) => ({
        ...t,
        pending: t.pending.map((p) =>
          p.id === id ? { ...p, status: 'discarded' } : p,
        ),
      }));
    },
    [updateThread],
  );

  /** Revert a previously-applied action by writing `original` back. */
  const revertApplied = useCallback(
    async (id: string): Promise<void> => {
      const action = threadsRef.current[agentId]?.pending.find(
        (p) => p.id === id,
      );
      if (!action || action.status !== 'applied' || action.original == null) {
        return;
      }
      try {
        const resp = await fetch('/lw/apply', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sagaRoot: action.sagaRoot,
            relPath: action.relPath,
            content: action.original,
            // Require the file to still match our applied content before we
            // overwrite it with the original — otherwise we'd clobber the
            // writer's manual edits.
            originalHash: action.appliedHash,
          }),
        });
        if (resp.status === 409) {
          updateThread((t) => ({
            ...t,
            pending: t.pending.map((p) =>
              p.id === id
                ? {
                    ...p,
                    status: 'stale',
                    error:
                      'File changed since apply. Revert would clobber new edits.',
                  }
                : p,
            ),
          }));
          return;
        }
        if (!resp.ok) throw new Error(`/lw/apply ${resp.status}`);
        updateThread((t) => ({
          ...t,
          pending: t.pending.map((p) =>
            p.id === id ? { ...p, status: 'discarded' } : p,
          ),
        }));
      } catch (e) {
        updateThread((t) => ({
          ...t,
          pending: t.pending.map((p) =>
            p.id === id ? { ...p, error: (e as Error).message } : p,
          ),
        }));
      }
    },
    [agentId, updateThread],
  );

  /** Keep a ref of the threads map for async callbacks. */
  const threadsRef = useRef(threads);
  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  return {
    agents,
    agentsError,
    agentId,
    setAgentId,
    messages: currentThread.messages,
    pending: currentThread.pending,
    usageTotal: currentThread.usageTotal,
    streaming,
    streamError,
    send,
    cancel,
    reset,
    retry,
    applyPending,
    discardPending,
    revertApplied,
    canRetry: !!lastUserMessageRef.current && !streaming,
  };
}

function safeParse<T>(data: string): T | undefined {
  try {
    return JSON.parse(data) as T;
  } catch {
    return undefined;
  }
}
