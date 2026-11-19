import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Clipboard,
  ExternalLink,
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
  clearUsageHistory,
  useChat,
  type ApprovalPolicy,
  type ChatContextAttachment,
  type ChatMessage,
  type ChatToolCall,
  type PendingAction,
  type UsageSummary,
  type UsageWindowStats,
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
      (localStorage.getItem(POLICY_KEY(sagaRoot)) as string | null) ??
      (localStorage.getItem(LEGACY_POLICY_KEY) as string | null);
    if (v === 'auto') {
      return 'auto';
    }
  } catch {
    /* ignore */
  }
  return 'standard';
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
  provider?: ChatProviderId;
  model?: string;
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
    provider: detectedProvider,
    model: c.model,
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

  const chat = useChat({
    sagaRoot,
    approvalPolicy: policy,
    autoCommit,
    onApplied,
  });
  const [draft, setDraft] = useState(initialPrompt ?? '');
  const [attachment, setAttachment] = useState<ChatContextAttachment | undefined>(
    initialContext,
  );
  useEffect(() => {
    if (initialPrompt !== undefined) setDraft(initialPrompt);
  }, [initialPrompt]);
  useEffect(() => {
    if (initialContext !== undefined) setAttachment(initialContext);
  }, [initialContext]);
  const [showingSettings, setShowingSettings] = useState(false);
  const [showingUsage, setShowingUsage] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);
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
    if (!draft.trim()) return;
    const text = draft;
    setDraft('');
    if (chat.streaming) {
      chat.cancel();
      setTimeout(() => {
        void chat.send(text, attachment);
        setAttachment(undefined);
      }, 40);
      return;
    }
    await chat.send(text, attachment);
    setAttachment(undefined);
  };

  const pendingActionable = chat.pending.filter((p) => p.status === 'pending');
  const pendingOpen = chat.pending.filter(
    (p) => p.status === 'pending' || p.status === 'stale',
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
      className="w-[420px] shrink-0 flex flex-col panel-glass h-full min-h-0 max-h-full overflow-hidden"
    >
      <header className="shrink-0 px-4 py-2.5 border-b border-border/80 bg-muted/15 flex items-center gap-2">
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
        <button
          type="button"
          onClick={() => {
            setShowingUsage((v) => !v);
            setShowingSettings(false);
          }}
          title={`Thread: ${(chat.usageTotal.promptTokens ?? 0).toLocaleString()} in / ${(chat.usageTotal.completionTokens ?? 0).toLocaleString()} out · Click for usage & rate limits`}
          className={cn(
            'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] mr-1 transition-colors',
            showingUsage
              ? 'border-primary/50 bg-primary/15 text-primary'
              : 'border-border bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground',
          )}
        >
          <Gauge className="h-3 w-3" />
          <span>{formatTokens(tokenTotal)}</span>
        </button>
        <button
          type="button"
          onClick={() => setPolicy((p) => (p === 'auto' ? 'standard' : 'auto'))}
          title={
            policy === 'auto'
              ? 'Auto Mode: File proposals are applied automatically to disk. Click to switch to Standard Mode.'
              : 'Standard Mode: File proposals require your explicit approval. Click to switch to Auto Mode.'
          }
          className={cn(
            'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium mr-1 transition-colors',
            policy === 'auto'
              ? 'border-amber-500/50 bg-amber-500/15 text-amber-500 dark:text-amber-400 hover:bg-amber-500/25'
              : 'border-border bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground',
          )}
        >
          {policy === 'auto' ? (
            <>
              <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
              <span>Auto</span>
            </>
          ) : (
            <>
              <Check className="h-3 w-3 shrink-0" />
              <span>Standard</span>
            </>
          )}
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setShowingSettings((v) => !v);
            setShowingUsage(false);
          }}
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

      {showingUsage && (
        <UsagePanel
          usageTotal={chat.usageTotal}
          usageWindow={chat.usageWindow}
          provider={aiPill?.provider}
          model={aiPill?.model}
          onClose={() => setShowingUsage(false)}
        />
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-ember px-4 py-3 space-y-4"
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
          const messageActions = chat.pending.filter((p) =>
            p.messageId ? p.messageId === m.id : isLastAssistant,
          );
          return (
            <MessageBubble
              key={m.id}
              message={m}
              actions={messageActions}
              onApplyAction={async (id) => {
                await chat.applyPending(id);
                onApplied?.();
              }}
              onDiscardAction={(id) => chat.discardPending(id)}
              onRevertAction={async (id) => {
                await chat.revertApplied(id);
                onApplied?.();
              }}
              onRetry={
                isLastAssistant && chat.canRetry && !chat.streaming
                  ? () => void chat.retry()
                  : undefined
              }
            />
          );
        })}

        {pendingOpen.length > 0 && <Separator />}
        {pendingActionable.length >= 2 && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="label-rune text-[11px]">
              Open Proposals ({pendingActionable.length})
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={applyingAll}
              onClick={async () => {
                setApplyingAll(true);
                try {
                  for (const item of pendingActionable) {
                    await chat.applyPending(item.id);
                  }
                  onApplied?.();
                } finally {
                  setApplyingAll(false);
                }
              }}
              className="h-7 gap-1.5 text-xs border-primary/45 bg-primary/10 text-primary hover:bg-primary/20"
            >
              <Check className="h-3.5 w-3.5" />
              {applyingAll ? 'Applying…' : `Apply All (${pendingActionable.length})`}
            </Button>
          </div>
        )}
        {pendingOpen.map((action) => (
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
      <div className="shrink-0 border-t border-border/80 bg-background/70 backdrop-blur-md p-3 space-y-2">
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
          placeholder={
            chat.streaming
              ? 'Type instructions to steer Scribe… (Ctrl+Enter to interrupt & steer)'
              : 'Ask Scribe… (Ctrl+Enter to send, Esc to stop)'
          }
          className="w-full min-h-[80px] max-h-[200px] resize-y rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex items-center gap-2">
          {chat.streaming ? (
            <>
              {draft.trim() ? (
                <Button
                  size="sm"
                  className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => void onSubmit()}
                  title="Interrupt current generation and steer Scribe with this instruction"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Interrupt & Steer
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={chat.cancel}
                title="Stop generation (Esc)"
              >
                <StopCircle className="h-3.5 w-3.5" />
                Stop
              </Button>
            </>
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
      <div className="space-y-1.5 text-xs">
        <div className="label-rune text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
          Execution &amp; Approval Mode
        </div>
        <PolicyOption
          id="standard"
          label="Standard (Review Edits)"
          hint="Default. Read tools run freely. All edits and new entries produce review cards that require your approval before saving to disk."
          current={policy}
          onPick={onPolicyChange}
        />
        <PolicyOption
          id="auto"
          label="Auto (Autonomous)"
          hint="Full write rights. Edits and new entries are applied automatically to disk; narrative conflicts and questions are recorded as Traces."
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

function AppliedActionRow({
  action,
  onRevert,
  onDiscard,
}: {
  action: PendingAction;
  onRevert?: () => void | Promise<void>;
  onDiscard?: () => void;
}) {
  const [showDiff, setShowDiff] = useState(false);
  return (
    <div className="rounded border border-emerald-500/35 bg-emerald-500/5 text-xs overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 py-1">
        <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        <span className="font-mono text-[11px] truncate flex-1 text-emerald-600 dark:text-emerald-400 font-medium">
          Applied {action.kind === 'new' ? 'new entry' : action.patch ? 'patch' : 'edit'}: {action.relPath}
        </span>
        {action.commitShortSha && (
          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 font-mono">
            ⎇ {action.commitShortSha}
          </Badge>
        )}
        <button
          type="button"
          onClick={() => setShowDiff((v) => !v)}
          className="text-[10px] text-muted-foreground hover:text-foreground underline decoration-dotted px-1 shrink-0"
        >
          {showDiff ? 'Hide Diff' : 'View Diff'}
        </button>
        {onRevert && (
          <button
            type="button"
            onClick={() => void onRevert()}
            title="Revert applied change"
            className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
          >
            <Undo2 className="h-3 w-3" />
          </button>
        )}
        {onDiscard && (
          <button
            type="button"
            onClick={onDiscard}
            title="Dismiss from history"
            className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {showDiff && (
        <div className="border-t border-emerald-500/20 max-h-48 overflow-y-auto overflow-x-hidden bg-background p-2 font-mono text-[10px] leading-relaxed">
          {action.diff ? (
            <pre className="whitespace-pre-wrap break-words">
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
            <pre className="whitespace-pre-wrap break-words">{action.next}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  onRetry,
  actions,
  onApplyAction: _onApplyAction,
  onDiscardAction,
  onRevertAction,
}: {
  message: ChatMessage;
  onRetry?: () => void;
  actions?: PendingAction[];
  onApplyAction?: (id: string) => void | Promise<void>;
  onDiscardAction?: (id: string) => void;
  onRevertAction?: (id: string) => void | Promise<void>;
}) {
  const isUser = message.role === 'user';
  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden break-words rounded-md px-3 py-2 text-sm',
        isUser
          ? 'bg-accent/50 border border-accent text-foreground ml-6'
          : 'bg-background border border-border text-foreground mr-6',
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="label-rune flex-1">
          {isUser ? 'You' : 'Scribe'}
        </span>
        {!isUser && message.usage && (message.usage.totalTokens ?? 0) > 0 && (
          <span
            title={`Input: ${(message.usage.promptTokens ?? 0).toLocaleString()} · Output: ${(message.usage.completionTokens ?? 0).toLocaleString()} · Total: ${(message.usage.totalTokens ?? 0).toLocaleString()} tokens`}
            className="font-mono text-[10px] text-muted-foreground/85"
          >
            {formatTokens(message.usage.totalTokens ?? 0)} ({formatCompactCount(message.usage.promptTokens ?? 0)} in · {formatCompactCount(message.usage.completionTokens ?? 0)} out)
          </span>
        )}
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
      {actions && actions.length > 0 && (
        <div className="mt-2 space-y-1.5 pt-1.5 border-t border-border/40">
          {actions.map((act) => {
            if (act.status === 'applied') {
              return (
                <AppliedActionRow
                  key={act.id}
                  action={act}
                  onRevert={onRevertAction ? () => onRevertAction(act.id) : undefined}
                  onDiscard={onDiscardAction ? () => onDiscardAction(act.id) : undefined}
                />
              );
            }
            if (act.status === 'pending' || act.status === 'stale') {
              return (
                <div
                  key={act.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 border border-primary/20 text-[11px] text-primary"
                >
                  <Wrench className="h-3 w-3 shrink-0" />
                  <span className="font-mono truncate flex-1">
                    {act.kind === 'new' ? 'Proposed new' : act.patch ? 'Proposed patch' : 'Proposed edit'}: {act.relPath}
                  </span>
                  <span className="text-[10px] text-muted-foreground italic shrink-0">
                    (review below)
                  </span>
                </div>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}

function ToolCallChip({ call }: { call: ChatToolCall }) {
  const [open, setOpen] = useState(false);
  const ok = call.result?.ok;
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-border bg-muted/30 text-[11px]">
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
            <pre className="overflow-x-hidden whitespace-pre-wrap break-all font-mono text-[10px] text-muted-foreground">
              {JSON.stringify(call.args, null, 2)}
            </pre>
          </div>
          {call.result && (
            <div>
              <div className="label-rune">result</div>
              <pre className="max-h-48 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all font-mono text-[10px] text-muted-foreground">
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
        'min-w-0 overflow-hidden rounded-md border-2 p-3 space-y-2',
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
      <div className="break-all font-mono text-[11px] text-foreground/80">
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
      <div className="max-h-60 overflow-y-auto overflow-x-hidden rounded border border-border bg-background font-mono text-[10px] leading-relaxed">
        {action.diff ? (
          <pre className="p-2 whitespace-pre-wrap break-words">
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
    <div className="min-w-0 break-words space-y-2 leading-relaxed">
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
          className="max-h-60 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] leading-snug"
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
        <code key={i++} className="break-all rounded bg-muted/60 px-1 font-mono text-[11px]">
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
          className="break-all rounded bg-primary/15 px-1 font-mono text-[11px] text-primary"
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

function formatCompactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
}

type GeminiTier = 'free' | 'tier1';

function getGeminiReferenceLimits(model: string | undefined, tier: GeminiTier) {
  const isPro = !!model?.toLowerCase().includes('pro');
  if (tier === 'tier1') {
    return isPro
      ? { label: 'Gemini Pro · Tier 1', rpm: 150, tpm: 2_000_000, rpd: 1_000 }
      : { label: 'Gemini Flash · Tier 1', rpm: 1_000, tpm: 4_000_000, rpd: 10_000 };
  }
  return isPro
    ? { label: 'Gemini Pro · Free Tier', rpm: 5, tpm: 250_000, rpd: 100 }
    : { label: 'Gemini Flash · Free Tier', rpm: 15, tpm: 250_000, rpd: 500 };
}

function UsageBar({
  label,
  value,
  max,
  formatVal,
}: {
  label: string;
  value: number;
  max?: number;
  formatVal?: (n: number) => string;
}) {
  const fmt = formatVal ?? ((n: number) => n.toLocaleString());
  const pct = max && max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const barCls =
    pct >= 85
      ? 'bg-rose-500'
      : pct >= 60
        ? 'bg-amber-400'
        : 'bg-primary';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">
          {fmt(value)}
          {max ? (
            <span className="text-muted-foreground"> / {fmt(max)}</span>
          ) : null}
        </span>
      </div>
      {max ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/70 border border-border/50">
          <div
            className={cn('h-full rounded-full transition-all duration-300', barCls)}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function UsagePanel({
  usageTotal,
  usageWindow,
  provider,
  model,
  onClose,
}: {
  usageTotal: UsageSummary;
  usageWindow: UsageWindowStats;
  provider?: ChatProviderId;
  model?: string;
  onClose: () => void;
}) {
  const [tier, setTier] = useState<GeminiTier>(() => {
    try {
      return window.localStorage.getItem('lw.chat.geminiTier') === 'tier1'
        ? 'tier1'
        : 'free';
    } catch {
      return 'free';
    }
  });

  const pickTier = (next: GeminiTier) => {
    setTier(next);
    try {
      window.localStorage.setItem('lw.chat.geminiTier', next);
    } catch {
      /* ignore */
    }
  };

  const showGeminiCaps = provider === 'google' || !provider;
  const refLimits = showGeminiCaps
    ? getGeminiReferenceLimits(model, tier)
    : null;

  return (
    <div className="border-b border-border/80 bg-popover/95 backdrop-blur-md px-4 py-3 space-y-3 max-h-[65vh] overflow-y-auto scrollbar-ember animate-fade-in">
      <div className="flex items-center gap-2">
        <Gauge className="h-3.5 w-3.5 text-primary" />
        <span className="label-rune flex-1">AI Usage &amp; Rate Limits</span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close usage panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Current Thread Token Breakdown */}
      <div className="rounded-lg border border-border/70 bg-card/50 p-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          <span>Current Thread</span>
          <span className="font-mono">
            {(usageTotal.turns ?? 0)} {(usageTotal.turns ?? 0) === 1 ? 'turn' : 'turns'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded border border-border/50 bg-background/50 px-2 py-1">
            <div className="text-[10px] text-muted-foreground">Input</div>
            <div className="font-mono font-semibold text-foreground">
              {(usageTotal.promptTokens ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="rounded border border-border/50 bg-background/50 px-2 py-1">
            <div className="text-[10px] text-muted-foreground">Output</div>
            <div className="font-mono font-semibold text-foreground">
              {(usageTotal.completionTokens ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="rounded border border-border/50 bg-background/50 px-2 py-1">
            <div className="text-[10px] text-muted-foreground">Total</div>
            <div className="font-mono font-semibold text-primary">
              {(usageTotal.totalTokens ?? 0).toLocaleString()}
            </div>
          </div>
        </div>
        {((usageTotal.cachedInputTokens ?? 0) > 0 ||
          (usageTotal.reasoningTokens ?? 0) > 0) && (
          <div className="flex flex-wrap gap-3 pt-0.5 text-[10px] font-mono text-muted-foreground">
            {(usageTotal.cachedInputTokens ?? 0) > 0 && (
              <span>
                Cached read: {usageTotal.cachedInputTokens!.toLocaleString()}
              </span>
            )}
            {(usageTotal.reasoningTokens ?? 0) > 0 && (
              <span>
                Reasoning: {usageTotal.reasoningTokens!.toLocaleString()}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Live Rolling Window Telemetry (RPM / TPM / RPD) */}
      <div className="rounded-lg border border-border/70 bg-card/50 p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Live Telemetry (Local)
          </span>
          {showGeminiCaps && (
            <div className="inline-flex rounded-md border border-border/70 bg-background/60 p-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => pickTier('free')}
                className={cn(
                  'rounded px-1.5 py-0.5 font-medium transition-colors',
                  tier === 'free'
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Free Tier
              </button>
              <button
                type="button"
                onClick={() => pickTier('tier1')}
                className={cn(
                  'rounded px-1.5 py-0.5 font-medium transition-colors',
                  tier === 'tier1'
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Tier 1
              </button>
            </div>
          )}
        </div>

        <UsageBar
          label="Requests / min (60s)"
          value={usageWindow.rpm}
          max={refLimits?.rpm}
        />
        <UsageBar
          label="Tokens / min (60s)"
          value={usageWindow.tpm}
          max={refLimits?.tpm}
          formatVal={formatCompactCount}
        />
        <UsageBar
          label="Requests today"
          value={usageWindow.rpd}
          max={refLimits?.rpd}
        />
        <UsageBar
          label={`Tokens today (${formatCompactCount(usageWindow.promptTokensToday)} in · ${formatCompactCount(usageWindow.completionTokensToday)} out)`}
          value={usageWindow.tokensToday}
          formatVal={formatCompactCount}
        />

        {refLimits && (
          <div className="text-[10px] text-muted-foreground font-mono">
            Reference caps: {refLimits.label} ({refLimits.rpm} RPM · {formatCompactCount(refLimits.tpm)} TPM · {refLimits.rpd} RPD)
          </div>
        )}
      </div>

      {/* Explanation + Actions */}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Google AI Studio API keys use{' '}
        <strong className="text-foreground/90">Gemini Developer API</strong>{' '}
        limits, separate from Antigravity extension &amp; Google AI Pro consumer quotas.
      </p>

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <a
          href="https://aistudio.google.com/usage"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <span>Open AI Studio Usage</span>
          <ExternalLink className="h-3 w-3" />
        </a>
        <button
          type="button"
          onClick={() => clearUsageHistory()}
          className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Reset stats
        </button>
      </div>
    </div>
  );
}
