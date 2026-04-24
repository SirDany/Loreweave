import { useCallback, useEffect, useRef, useState } from 'react';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Tool calls emitted during this assistant turn. */
  toolCalls?: ChatToolCall[];
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
  /** Matches the tool name that proposed it (`propose_edit` / `propose_new_entry`). */
  source: string;
  kind: 'edit' | 'new';
  sagaRoot: string;
  relPath: string;
  /** For `edit`: previous file contents. */
  original?: string;
  /** For `edit`: proposed new contents. For `new`: the full file content. */
  next: string;
  diff?: string;
  exists?: boolean;
  rationale?: string | null;
  status: 'pending' | 'applied' | 'discarded';
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
}

interface UseChatOptions {
  sagaRoot: string;
}

let idCounter = 0;
const nextId = () => `${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/**
 * Streams a chat conversation with a Loreweave agent against the Vite dev
 * sidecar's `/lw/chat` SSE endpoint. Because EventSource can't POST a body,
 * we use a plain `fetch` + a manual SSE parser.
 */
export function useChat({ sagaRoot }: UseChatOptions) {
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const abortRef = useRef<AbortController | null>(null);

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
          // Prefer Muse as the default conversational entry point.
          const preferred =
            body.agents.find((a) => a.id === 'muse') ?? body.agents[0]!;
          setAgentId(preferred.id);
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

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const reset = useCallback(() => {
    cancel();
    setMessages([]);
    setPending([]);
    setStreamError(null);
  }, [cancel]);

  const send = useCallback(
    async (content: string, context?: ChatContextAttachment) => {
      if (!content.trim()) return;
      if (!agentId) {
        setStreamError('No agent selected.');
        return;
      }
      cancel();
      setStreamError(null);

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
      // History sent to the model: previous turns + new user message (no
      // placeholder assistant turn).
      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
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
          throw new Error(`/lw/chat ${resp.status}`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        const handleEvent = (event: string, data: string) => {
          if (event === 'token') {
            // SSE data is a JSON-encoded string.
            let token: string;
            try {
              token = JSON.parse(data) as string;
            } catch {
              token = data;
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + token } : m,
              ),
            );
            return;
          }
          if (event === 'tool_call') {
            const parsed = safeParse<{ name: string; args: unknown }>(data);
            if (!parsed) return;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolCalls: [
                        ...(m.toolCalls ?? []),
                        { name: parsed.name, args: parsed.args },
                      ],
                    }
                  : m,
              ),
            );
            return;
          }
          if (event === 'tool_result') {
            const parsed = safeParse<{ name: string; result: ChatToolResult }>(
              data,
            );
            if (!parsed) return;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const calls = m.toolCalls ?? [];
                // Attach to the most recent call for this tool name that
                // doesn't yet have a result.
                for (let i = calls.length - 1; i >= 0; i--) {
                  if (calls[i]!.name === parsed.name && !calls[i]!.result) {
                    const next = calls.slice();
                    next[i] = { ...next[i]!, result: parsed.result };
                    return { ...m, toolCalls: next };
                  }
                }
                return m;
              }),
            );
            // Surface `propose_*` tool results as pending actions.
            if (
              parsed.result.ok &&
              (parsed.name === 'propose_edit' ||
                parsed.name === 'propose_new_entry')
            ) {
              const d = parsed.result.data as PendingAction | undefined;
              if (d && (d.kind === 'edit' || d.kind === 'new')) {
                setPending((prev) => [
                  ...prev,
                  { ...d, id: nextId(), source: parsed.name, status: 'pending' },
                ]);
              }
            }
            return;
          }
          if (event === 'error') {
            const msg =
              (safeParse<string>(data) as string | undefined) ?? data;
            setStreamError(msg);
            return;
          }
          // `done` → loop will exit when stream closes.
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
    [agentId, cancel, messages, sagaRoot],
  );

  const applyPending = useCallback(async (id: string) => {
    setPending((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: 'applied' } : p)),
    );
    const action = pendingRef.current.find((p) => p.id === id);
    if (!action) return;
    try {
      const resp = await fetch('/lw/write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sagaRoot: action.sagaRoot,
          relPath: action.relPath,
          content: action.next,
        }),
      });
      if (!resp.ok) throw new Error(`/lw/write ${resp.status}`);
    } catch (e) {
      setPending((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, status: 'pending', rationale: `apply failed: ${(e as Error).message}` }
            : p,
        ),
      );
    }
  }, []);

  const discardPending = useCallback((id: string) => {
    setPending((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: 'discarded' } : p)),
    );
  }, []);

  // Keep a ref of pending so applyPending can read the current value without
  // making itself depend on it (avoids thrashing the fetch callback).
  const pendingRef = useRef<PendingAction[]>([]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  return {
    agents,
    agentsError,
    agentId,
    setAgentId,
    messages,
    streaming,
    streamError,
    pending,
    send,
    cancel,
    reset,
    applyPending,
    discardPending,
  };
}

function safeParse<T>(data: string): T | undefined {
  try {
    return JSON.parse(data) as T;
  } catch {
    return undefined;
  }
}
