import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Gauge,
  Loader2,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  StopCircle,
  Trash2,
  Undo2,
  Wrench,
  X,
} from 'lucide-react';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Separator } from '../components/ui/separator.js';
import {
  fetchConfig,
  type ChatProviderId,
  type MaskedLoreweaveConfig,
} from '../lib/lw.js';
import { cn } from '../lib/utils.js';
import {
  useChat,
  type ApprovalPolicy,
  type ChatContextAttachment,
  type ChatMessage,
  type ChatToolCall,
  type PendingAction,
} from '../state/useChat.js';

interface Props {
  sagaRoot: string;
  onClose: () => void;
  /** Optional initial context (a text selection from the editor). */
  initialContext?: ChatContextAttachment;
  /** Optional initial prompt to seed the composer with. */
  initialPrompt?: string;
  /** Fire after the writer approves a pending action so the app can reload. */
  onApplied?: () => void;
  /** Open the global AI Settings dialog. */
  onOpenAiSettings?: () => void;
  /** Resizable width in pixels */
  width?: number;
}

const POLICY_KEY = (sagaRoot: string) => `lw.chat.approvalPolicy.${sagaRoot}`;
const LEGACY_POLICY_KEY = 'lw.chat.approvalPolicy';
const AUTOCOMMIT_KEY = (sagaRoot: string) => `lw.chat.autoCommit.${sagaRoot}`;

function loadPolicy(sagaRoot: string): ApprovalPolicy {
  try {
    const v =
      (localStorage.getItem(POLICY_KEY(sagaRoot)) as ApprovalPolicy | null) ??
      (localStorage.getItem(LEGACY_POLICY_KEY) as ApprovalPolicy | null);
    if (v === 'auto-reads' || v === 'writes-approval' || v === 'approve-all') {
      return v;
    }
  } catch {
    /* ignore */
  }
  return 'writes-approval';
}

function loadAutoCommit(sagaRoot: string): boolean {
  try {
    const v = localStorage.getItem(AUTOCOMMIT_KEY(sagaRoot));
    // Default: on. A Saga that isn't a git repo just no-ops silently.
    if (v === '0' || v === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

function inferActiveAiLabel(cfg: MaskedLoreweaveConfig | null): {
  configured: boolean;
  label: string;
  title: string;
} {
  if (!cfg) {
    return {
      configured: true,
      label: 'AI…',
      title: 'Open AI Engine & Model settings',
    };
  }
  const c = cfg.chat;
  const detectedProvider: ChatProviderId | undefined =
    c.provider ??
    (c.anthropicApiKey
      ? 'anthropic'
      : c.googleApiKey
        ? 'google'
        : c.openaiApiKey
          ? 'openai'
          : c.openrouterApiKey
            ? 'openrouter'
            : c.groqApiKey
              ? 'groq'
              : c.deepseekApiKey
                ? 'deepseek'
                : c.mistralApiKey
                  ? 'mistral'
                  : c.xaiApiKey
                    ? 'xai'
                    : c.customBaseUrl
                      ? 'openai-compatible'
                      : c.ollamaHost || c.ollamaApiKey
                        ? 'ollama'
                        : undefined);

  const hasEnv = cfg.envOverrides.some(
    (name) => !name.startsWith('LOREWEAVE_EMBEDDINGS'),
  );
  if (!detectedProvider && !hasEnv) {
    return {
      configured: false,
      label: 'Configure AI',
      title: 'No AI provider configured — click to open AI Settings',
    };
  }
  const providerLabel = detectedProvider ?? 'env';
  const modelLabel = c.model ? `${providerLabel} · ${c.model}` : `${providerLabel} · default`;
  return {
    configured: true,
    label: modelLabel,
    title: `Active AI: ${modelLabel} — click to change in AI Settings`,
  };
}

export function AssistantPanel({
  sagaRoot,
  onClose,
  initialContext,
  initialPrompt,
  onApplied,
  onOpenAiSettings,
  width,
}: Props) {
  const [policy, setPolicy] = useState<ApprovalPolicy>(() =>
    loadPolicy(sagaRoot),
  );
  const [autoCommit, setAutoCommit] = useState<boolean>(() =>
    loadAutoCommit(sagaRoot),
  );
  useEffect(() => {
    // Switching Sagas re-loads that Saga's stored policy.
    setPolicy(loadPolicy(sagaRoot));
    setAutoCommit(loadAutoCommit(sagaRoot));
  }, [sagaRoot]);
  useEffect(() => {
    try {
      localStorage.setItem(POLICY_KEY(sagaRoot), policy);
    } catch {
      /* ignore */
    }
  }, [sagaRoot, policy]);
  useEffect(() => {
    try {
      localStorage.setItem(AUTOCOMMIT_KEY(sagaRoot), autoCommit ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sagaRoot, autoCommit]);

  const chat = useChat({ sagaRoot, approvalPolicy: policy, autoCommit });
  const [draft, setDraft] = useState(initialPrompt ?? '');
  const [attachment, setAttachment] = useState<ChatContextAttachment | undefined>(
    initialContext,
  );
  const [showingSettings, setShowingSettings] = useState(false);
  const [aiCfg, setAiCfg] = useState<
    MaskedLoreweaveConfig | null | 'unavailable'
  >(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetchConfig()
      .then((c) => {
        if (active) setAiCfg(c);
      })
      .catch(() => {
        if (active) setAiCfg('unavailable');
      });
    const onUpdated = (evt: Event) => {
      const detail = (evt as CustomEvent<MaskedLoreweaveConfig>).detail;
      if (detail) setAiCfg(detail);
    };
    window.addEventListener('lw-config-updated', onUpdated);
    return () => {
      active = false;
      window.removeEventListener('lw-config-updated', onUpdated);
    };
  }, []);

  const aiPill = useMemo(
    () => (aiCfg === 'unavailable' ? null : inferActiveAiLabel(aiCfg)),
    [aiCfg],
  );

  // Auto-scroll to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat.messages, chat.streaming, chat.pending.length]);

  const onSubmit = async () => {
    if (!draft.trim() || chat.streaming) return;
    const text = draft;
    setDraft('');
    await chat.send(text, attachment);
    setAttachment(undefined);
  };

  const pendingVisible = chat.pending.filter(
    (p) =>
      p.status === 'pending' ||
      p.status === 'stale' ||
      p.status === 'applied',
  );
  const tokenTotal = chat.usageTotal.totalTokens ?? 0;

  const copyTranscript = useCallback(() => {
    const lines: string[] = [
      '# Loreweave chat — Scribe',
      '',
    ];
    for (const m of chat.messages) {
      lines.push(m.role === 'user' ? '## You' : '## Scribe');
      lines.push('');
      lines.push(m.content || '_(empty)_');
      if (m.toolCalls && m.toolCalls.length > 0) {
        lines.push('');
        lines.push('**Tools used:**');
        for (const tc of m.toolCalls) {
          lines.push(`- \`${tc.name}\` — ${tc.result?.ok === false ? 'error' : 'ok'}`);
        }
      }
      lines.push('');
    }
    const md = lines.join('\n');
    navigator.clipboard?.writeText(md).catch(() => {
      /* ignore */
    });
  }, [chat.messages]);

  return (
    <aside
      style={{ width: width ? `${width}px` : undefined }}
      className="w-[420px] shrink-0 flex flex-col panel-glass h-full overflow-hidden"
    >
      <header className="px-4 py-2.5 border-b border-border/80 bg-muted/15 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
        <span className="font-semibold text-xs tracking-tight text-foreground">Scribe</span>
        {onOpenAiSettings && aiPill ? (
          <button
            type="button"
            onClick={onOpenAiSettings}
            title={aiPill.title}
            className={cn(
              'ml-1 mr-auto max-w-[165px] truncate rounded-full border px-2 py-0.5 font-mono text-[10px] transition-colors',
              aiPill.configured
                ? 'border-border bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
            )}
          >
            {aiPill.label}
          </button>
        ) : (
          <span className="flex-1" />
        )}
        {tokenTotal > 0 && (
          <span
            title={`Prompt ${chat.usageTotal.promptTokens ?? 0} / completion ${chat.usageTotal.completionTokens ?? 0}`}
            className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground mr-1"
          >
            <Gauge className="h-3 w-3" />
            {formatTokens(tokenTotal)}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
          onClick={() => setShowingSettings((v) => !v)}
          title="Scribe settings"
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
          onClick={copyTranscript}
          disabled={chat.messages.length === 0}
          title="Copy conversation as markdown"
        >
          <Clipboard className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
          onClick={chat.reset}
          title="Start a new chat with Scribe"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          title="Close Scribe panel (Ctrl+Shift+A)"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      {showingSettings && (
        <SettingsPanel
          policy={policy}
          onPolicyChange={setPolicy}
          autoCommit={autoCommit}
          onAutoCommitChange={setAutoCommit}
          onClose={() => setShowingSettings(false)}
        />
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto scrollbar-ember px-4 py-3 space-y-4"
      >
        {chat.messages.length === 0 && (
          <div className="text-sm text-muted-foreground italic space-y-2">
            <div className="flex items-center gap-1.5 text-foreground/90 font-medium not-italic">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Scribe — Universal Assistant</span>
            </div>
            <p>
              Ask Scribe anything about your Saga. Scribe dynamically assumes the
              roles of <strong>Muse</strong> (creative drafting), <strong>Archivist</strong> (saving canon),{' '}
              <strong>Harvester</strong> (searching lore), <strong>Polisher</strong> (style refinement), and{' '}
              <strong>Warden</strong> (canon audits) based on your prompt.
            </p>
          </div>
        )}
        {chat.messages.map((m, idx) => {
          const isLastAssistant =
            m.role === 'assistant' && idx === chat.messages.length - 1;
          return (
            <MessageBubble
              key={m.id}
              message={m}
              onRetry={
                isLastAssistant && chat.canRetry && !chat.streaming
                  ? () => void chat.retry()
                  : undefined
              }
            />
          );
        })}

        {pendingVisible.length > 0 && <Separator />}
        {pendingVisible.map((action) => (
          <PendingActionCard
            key={action.id}
            action={action}
            onApply={async () => {
              await chat.applyPending(action.id);
              onApplied?.();
            }}
            onDiscard={() => chat.discardPending(action.id)}
            onRevert={async () => {
              await chat.revertApplied(action.id);
              onApplied?.();
            }}
          />
        ))}

        {chat.streamError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {chat.streamError}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border/80 bg-background/70 backdrop-blur-md p-3 space-y-2">
        {/* Quick Scribe Intent Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
          <button
            type="button"
            onClick={() => setDraft('Brainstorm 3 creative options for: ')}
            className="rounded-full border border-border/70 bg-card/60 hover:border-primary/40 hover:bg-primary/10 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            💡 Brainstorm
          </button>
          <button
            type="button"
            onClick={() => setDraft('Polish and refine this prose for rhythm and flow: ')}
            className="rounded-full border border-border/70 bg-card/60 hover:border-primary/40 hover:bg-primary/10 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            ✍️ Polish
          </button>
          <button
            type="button"
            onClick={() => setDraft('Audit this passage for canon consistency and established facts: ')}
            className="rounded-full border border-border/70 bg-card/60 hover:border-primary/40 hover:bg-primary/10 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            🛡️ Canon Audit
          </button>
          <button
            type="button"
            onClick={() => setDraft('Scan this chapter and list all potential new Codex entries: ')}
            className="rounded-full border border-border/70 bg-card/60 hover:border-primary/40 hover:bg-primary/10 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            🌾 Harvest
          </button>
        </div>

        {attachment?.selection && (
          <div className="rounded-md border border-border bg-muted/40 p-2 text-[11px]">
            <div className="flex items-center gap-2 mb-1">
              <span className="label-rune flex-1">Selected context</span>
              <button
                onClick={() => setAttachment(undefined)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            {attachment.path && (
              <div className="font-mono text-muted-foreground truncate">
                {attachment.path}
              </div>
            )}
            <pre className="whitespace-pre-wrap break-words line-clamp-3 text-foreground/80">
              {attachment.selection}
            </pre>
          </div>
        )}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void onSubmit();
            } else if (e.key === 'Escape' && chat.streaming) {
              e.preventDefault();
              chat.cancel();
            }
          }}
          placeholder="Ask Scribe… (Ctrl+Enter to send, Esc to stop)"
          className="w-full min-h-[80px] max-h-[200px] resize-y rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex items-center gap-2">
          {chat.streaming ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={chat.cancel}>
              <StopCircle className="h-3.5 w-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => void onSubmit()}
              disabled={!draft.trim()}
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </Button>
          )}
          {chat.canRetry && !chat.streaming && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => void chat.retry()}
              title="Regenerate the last reply"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </Button>
          )}
          {chat.streaming && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Weaving…
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}

function SettingsPanel({
  policy,
  onPolicyChange,
  autoCommit,
  onAutoCommitChange,
  onClose,
}: {
  policy: ApprovalPolicy;
  onPolicyChange: (p: ApprovalPolicy) => void;
  autoCommit: boolean;
  onAutoCommitChange: (v: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="border-b border-border bg-muted/20 px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <Settings className="h-3.5 w-3.5 text-primary/80" />
        <span className="label-rune flex-1">Scribe settings</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1 text-xs">
        <div className="label-rune text-[10px] text-muted-foreground">Approval policy</div>
        <PolicyOption
          id="auto-reads"
          label="Auto-allow reads, approve writes"
          hint="Default. Read tools run freely; propose_* always asks."
          current={policy}
          onPick={onPolicyChange}
        />
        <PolicyOption
          id="writes-approval"
          label="Approve writes (stricter confirm)"
          hint="Same as default today; kept for future per-tool confirmation."
          current={policy}
          onPick={onPolicyChange}
        />
        <PolicyOption
          id="approve-all"
          label="Approve every tool call"
          hint="Future: prompt before running any tool. Not yet enforced."
          current={policy}
          onPick={onPolicyChange}
        />
      </div>
      <div className="space-y-1 text-xs pt-1 border-t border-border/50">
        <div className="label-rune text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Story Timeline & Checkpoints</div>
        <label className="flex items-start gap-2 cursor-pointer rounded-md border border-border bg-background px-2 py-1.5 hover:bg-muted">
          <input
            type="checkbox"
            className="mt-0.5 accent-primary"
            checked={autoCommit}
            onChange={(e) => onAutoCommitChange(e.target.checked)}
          />
          <div className="flex-1">
            <div className="text-xs font-medium">Auto-checkpoint approved updates</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              When enabled, Scribe automatically records a revision checkpoint in your story timeline whenever you apply suggested changes.
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}

function PolicyOption({
  id,
  label,
  hint,
  current,
  onPick,
}: {
  id: ApprovalPolicy;
  label: string;
  hint: string;
  current: ApprovalPolicy;
  onPick: (p: ApprovalPolicy) => void;
}) {
  const active = id === current;
  return (
    <button
      onClick={() => onPick(id)}
      className={cn(
        'w-full rounded-md border px-2 py-1.5 text-left transition-colors',
        active
          ? 'border-primary/60 bg-primary/10 text-foreground'
          : 'border-border bg-background hover:bg-muted',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-block h-2 w-2 rounded-full',
            active ? 'bg-primary' : 'bg-muted-foreground/50',
          )}
        />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-0.5 pl-4 text-[11px] text-muted-foreground">{hint}</div>
    </button>
  );
}

function MessageBubble({
  message,
  onRetry,
}: {
  message: ChatMessage;
  onRetry?: () => void;
}) {
  const isUser = message.role === 'user';
  return (
    <div
      className={cn(
        'rounded-md px-3 py-2 text-sm',
        isUser
          ? 'bg-accent/50 border border-accent text-foreground ml-6'
          : 'bg-background border border-border text-foreground mr-6',
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="label-rune flex-1">
          {isUser ? 'You' : 'Scribe'}
        </span>
        {onRetry && (
          <button
            onClick={onRetry}
            title="Regenerate"
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>
      {isUser ? (
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
      ) : message.content ? (
        <MarkdownContent text={message.content} />
      ) : (
        <span className="text-muted-foreground italic">…</span>
      )}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mt-2 space-y-1">
          {message.toolCalls.map((tc, i) => (
            <ToolCallChip key={i} call={tc} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolCallChip({ call }: { call: ChatToolCall }) {
  const [open, setOpen] = useState(false);
  const ok = call.result?.ok;
  return (
    <div className="rounded-md border border-border bg-muted/30 text-[11px]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Wrench className="h-3 w-3 text-primary/80" />
        <span className="font-mono">{call.name}</span>
        {call.result == null ? (
          <Badge variant="secondary" className="ml-auto">
            running
          </Badge>
        ) : ok ? (
          <Badge variant="success" className="ml-auto">
            ok
          </Badge>
        ) : (
          <Badge variant="danger" className="ml-auto">
            err
          </Badge>
        )}
      </button>
      {open && (
        <div className="border-t border-border px-2 py-1 space-y-1">
          <div>
            <div className="label-rune">args</div>
            <pre className="whitespace-pre-wrap break-words font-mono text-[10px] text-muted-foreground">
              {JSON.stringify(call.args, null, 2)}
            </pre>
          </div>
          {call.result && (
            <div>
              <div className="label-rune">result</div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-muted-foreground">
                {call.result.error
                  ? call.result.error
                  : JSON.stringify(call.result.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PendingActionCard({
  action,
  onApply,
  onDiscard,
  onRevert,
}: {
  action: PendingAction;
  onApply: () => void | Promise<void>;
  onDiscard: () => void;
  onRevert: () => void | Promise<void>;
}) {
  const stale = action.status === 'stale';
  const applied = action.status === 'applied';
  return (
    <div
      className={cn(
        'rounded-md border-2 p-3 space-y-2',
        stale
          ? 'border-amber-500/60 bg-amber-500/5'
          : applied
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : 'border-primary/60 bg-primary/5',
      )}
    >
      <div className="flex items-center gap-2">
        <Wrench className="h-3.5 w-3.5 text-primary" />
        <span className="label-rune flex-1">
          {action.kind === 'new'
            ? 'Proposed new entry'
            : action.patch
              ? 'Proposed patch'
              : 'Proposed edit'}
        </span>
        {action.kind === 'new' && action.exists && (
          <Badge variant="warning">overwrites</Badge>
        )}
        {stale && <Badge variant="warning">stale</Badge>}
        {applied && <Badge variant="success">applied</Badge>}
        {applied && action.commitShortSha && (
          <Badge variant="secondary" title="Git commit created by auto-commit">
            ⎇ {action.commitShortSha}
          </Badge>
        )}
      </div>
      <div className="font-mono text-[11px] text-foreground/80">
        {action.relPath}
      </div>
      {action.rationale && (
        <div className="text-xs text-muted-foreground italic">
          {action.rationale}
        </div>
      )}
      {action.error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
          {action.error}
        </div>
      )}
      {applied && action.commitError && (
        <div className="rounded border border-amber-600/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
          File saved, but auto-commit failed: {action.commitError}
        </div>
      )}
      <div className="max-h-60 overflow-auto rounded border border-border bg-background font-mono text-[10px] leading-relaxed">
        {action.diff ? (
          <pre className="p-2">
            {action.diff.split('\n').map((line, i) => {
              let cls = 'text-foreground/90';
              if (line.startsWith('+++') || line.startsWith('---'))
                cls = 'text-muted-foreground';
              else if (line.startsWith('+')) cls = 'text-emerald-400';
              else if (line.startsWith('-')) cls = 'text-rose-400';
              return (
                <div key={i} className={cls}>
                  {line || '\u00A0'}
                </div>
              );
            })}
          </pre>
        ) : (
          <pre className="p-2 whitespace-pre-wrap break-words">
            {action.next}
          </pre>
        )}
      </div>
      <div className="flex gap-2">
        {applied ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void onRevert()}
              title="Write the original contents back"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Revert
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={onDiscard}
            >
              <X className="h-3.5 w-3.5" />
              Dismiss
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => void onApply()}
              disabled={stale}
            >
              <Check className="h-3.5 w-3.5" />
              Apply
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onDiscard}>
              <X className="h-3.5 w-3.5" />
              Discard
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- tiny safe markdown renderer -----------------------------------

function MarkdownContent({ text }: { text: string }) {
  const blocks = useMemo(() => splitBlocks(text), [text]);
  return (
    <div className="space-y-2 leading-relaxed">
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  );
}

type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'code'; lang?: string; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'p'; text: string };

function splitBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim() || undefined;
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) {
        buf.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      out.push({ kind: 'code', lang, text: buf.join('\n') });
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      out.push({ kind: 'h', level: h[1]!.length, text: h[2]! });
      i++;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^[-*]\s+/, ''));
        i++;
      }
      out.push({ kind: 'ul', items });
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\d+\.\s+/, ''));
        i++;
      }
      out.push({ kind: 'ol', items });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        buf.push(lines[i]!.replace(/^>\s?/, ''));
        i++;
      }
      out.push({ kind: 'quote', text: buf.join('\n') });
      continue;
    }
    if (line.trim() === '') {
      i++;
      continue;
    }
    // Gather a paragraph.
    const buf: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== '' && !/^(#{1,6}\s|```|[-*]\s|\d+\.\s|>)/.test(lines[i]!)) {
      buf.push(lines[i]!);
      i++;
    }
    out.push({ kind: 'p', text: buf.join(' ') });
  }
  return out;
}

function renderBlock(b: Block, key: number): JSX.Element {
  switch (b.kind) {
    case 'h':
      return (
        <div
          key={key}
          className={cn(
            'font-serif font-semibold',
            b.level === 1 ? 'text-lg' : b.level === 2 ? 'text-base' : 'text-sm',
          )}
        >
          {renderInline(b.text)}
        </div>
      );
    case 'code':
      return (
        <pre
          key={key}
          className="max-h-60 overflow-auto rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] leading-snug"
        >
          {b.text}
        </pre>
      );
    case 'ul':
      return (
        <ul key={key} className="list-disc space-y-0.5 pl-5 text-sm">
          {b.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={key} className="list-decimal space-y-0.5 pl-5 text-sm">
          {b.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ol>
      );
    case 'quote':
      return (
        <blockquote
          key={key}
          className="border-l-2 border-primary/60 pl-3 text-sm italic text-foreground/85"
        >
          {renderInline(b.text)}
        </blockquote>
      );
    case 'p':
      return (
        <p key={key} className="text-sm">
          {renderInline(b.text)}
        </p>
      );
  }
}

function renderInline(text: string): (JSX.Element | string)[] {
  const tokens: (JSX.Element | string)[] = [];
  const re =
    /`([^`]+)`|\*\*([^*]+)\*\*|\b_([^_]+)_\b|\[([^\]]+)\]\(([^)]+)\)|@([a-z][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)(?:\{([^}\n]*)\})?/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push(text.slice(last, m.index));
    if (m[1] != null) {
      tokens.push(
        <code key={i++} className="rounded bg-muted/60 px-1 font-mono text-[11px]">
          {m[1]}
        </code>,
      );
    } else if (m[2] != null) {
      tokens.push(
        <strong key={i++} className="font-semibold">
          {m[2]}
        </strong>,
      );
    } else if (m[3] != null) {
      tokens.push(
        <em key={i++} className="italic">
          {m[3]}
        </em>,
      );
    } else if (m[4] != null && m[5] != null) {
      const href = m[5];
      tokens.push(
        <a
          key={i++}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          {m[4]}
        </a>,
      );
    } else if (m[6] != null && m[7] != null) {
      const display = m[8];
      const label =
        display && display.length > 0 ? display : `@${m[6]}/${m[7]}`;
      tokens.push(
        <span
          key={i++}
          title={`@${m[6]}/${m[7]}`}
          className="rounded bg-primary/15 px-1 font-mono text-[11px] text-primary"
        >
          {label}
        </span>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push(text.slice(last));
  return tokens;
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n} tok`;
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k tok`;
  return `${Math.round(n / 1000)}k tok`;
}
