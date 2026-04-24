import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Send,
  Sparkles,
  StopCircle,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Separator } from '../components/ui/separator.js';
import { cn } from '../lib/utils.js';
import {
  useChat,
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
  /** Optional agent to pre-select (e.g. when the user picks from the selection toolbar). */
  initialAgent?: string;
  /** Optional initial prompt to seed the composer with. */
  initialPrompt?: string;
  /** Fire after the writer approves a pending action so the app can reload. */
  onApplied?: () => void;
}

export function AssistantPanel({
  sagaRoot,
  onClose,
  initialContext,
  initialAgent,
  initialPrompt,
  onApplied,
}: Props) {
  const chat = useChat({ sagaRoot });
  const [draft, setDraft] = useState(initialPrompt ?? '');
  const [attachment, setAttachment] = useState<ChatContextAttachment | undefined>(
    initialContext,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialAgent && chat.agents.some((a) => a.id === initialAgent)) {
      chat.setAgentId(initialAgent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAgent, chat.agents.length]);

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

  const selectedAgent = chat.agents.find((a) => a.id === chat.agentId);

  return (
    <aside className="w-[380px] shrink-0 flex flex-col border-l border-border bg-card/60 h-full overflow-hidden">
      <header className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <span className="label-rune flex-1">Assistant</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
          onClick={chat.reset}
          title="Start a new chat"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          title="Close (Ctrl+Shift+A)"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      {/* Agent picker */}
      <div className="px-4 py-3 border-b border-border space-y-2">
        {chat.agentsError ? (
          <div className="text-xs text-destructive">
            Failed to load agents: {chat.agentsError}
          </div>
        ) : chat.agents.length === 0 ? (
          <div className="text-xs text-muted-foreground">Loading agents…</div>
        ) : (
          <>
            <label className="label-rune block">Agent</label>
            <select
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              value={chat.agentId}
              onChange={(e) => chat.setAgentId(e.target.value)}
            >
              {chat.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {selectedAgent?.description && (
              <div className="text-[11px] text-muted-foreground leading-snug">
                {selectedAgent.description}
              </div>
            )}
          </>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto scrollbar-ember px-4 py-3 space-y-4"
      >
        {chat.messages.length === 0 && (
          <div className="text-sm text-muted-foreground italic">
            <Sparkles className="inline h-3.5 w-3.5 mr-1 text-primary/80" />
            Ask the agent about your Saga. It can read the Codex, validate canon,
            search the Lexicon, and propose edits you approve.
          </div>
        )}
        {chat.messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {chat.pending.filter((p) => p.status === 'pending').length > 0 && (
          <Separator />
        )}
        {chat.pending
          .filter((p) => p.status === 'pending')
          .map((action) => (
            <PendingActionCard
              key={action.id}
              action={action}
              onApply={async () => {
                await chat.applyPending(action.id);
                onApplied?.();
              }}
              onDiscard={() => chat.discardPending(action.id)}
            />
          ))}

        {chat.streamError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {chat.streamError}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-background/60 p-3 space-y-2">
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
            }
          }}
          placeholder={
            selectedAgent
              ? `Ask ${selectedAgent.name}… (Ctrl+Enter to send)`
              : 'Loading…'
          }
          className="w-full min-h-[80px] max-h-[200px] resize-y rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          disabled={chat.streaming || !chat.agentId}
        />
        <div className="flex items-center gap-2">
          {chat.streaming ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={chat.cancel}
            >
              <StopCircle className="h-3.5 w-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => void onSubmit()}
              disabled={!draft.trim() || !chat.agentId}
            >
              <Send className="h-3.5 w-3.5" />
              Send
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

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div
      className={cn(
        'rounded-md px-3 py-2 text-sm whitespace-pre-wrap break-words',
        isUser
          ? 'bg-accent/50 border border-accent text-foreground ml-6'
          : 'bg-background border border-border text-foreground mr-6',
      )}
    >
      <div className="label-rune mb-1">
        {isUser ? 'You' : 'Assistant'}
      </div>
      {message.content ||
        (message.role === 'assistant' && (
          <span className="text-muted-foreground italic">…</span>
        ))}
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
}: {
  action: PendingAction;
  onApply: () => void | Promise<void>;
  onDiscard: () => void;
}) {
  return (
    <div className="rounded-md border-2 border-primary/60 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Wrench className="h-3.5 w-3.5 text-primary" />
        <span className="label-rune flex-1">
          {action.kind === 'new' ? 'Proposed new entry' : 'Proposed edit'}
        </span>
        {action.kind === 'new' && action.exists && (
          <Badge variant="warning">overwrites</Badge>
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
        <Button size="sm" className="gap-1.5" onClick={() => void onApply()}>
          <Check className="h-3.5 w-3.5" />
          Apply
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={onDiscard}
        >
          <X className="h-3.5 w-3.5" />
          Discard
        </Button>
      </div>
    </div>
  );
}
