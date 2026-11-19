import { useEffect, useMemo, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  ArrowRight,
  Bot,
  Box,
  Check,
  ChevronRight,
  Cpu,
  FileSearch,
  FileText,
  GitBranch,
  Layers,
  MessageSquare,
  Minimize2,
  Network,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  StopCircle,
  Undo2,
  Workflow,
  Wrench,
  X,
} from 'lucide-react';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { cn } from '../lib/utils.js';
import type {
  ApprovalPolicy,
  ChatContextAttachment,
  ChatMessage,
  PendingAction,
  useChat,
} from '../state/useChat.js';

export interface ScribeOrchestratorOverlayProps {
  sagaRoot: string;
  isOpen: boolean;
  onClose: () => void;
  chat: ReturnType<typeof useChat>;
  policy: ApprovalPolicy;
  onPolicyChange: (p: ApprovalPolicy) => void;
  onApplied?: () => void;
  onOpenAiSettings?: () => void;
  initialPrompt?: string;
  initialContext?: ChatContextAttachment;
}

type ViewTab = 'graph' | 'split' | 'deck';

export function ScribeOrchestratorOverlay({
  sagaRoot: _sagaRoot,
  isOpen,
  onClose,
  chat,
  policy,
  onPolicyChange,
  onApplied,
  onOpenAiSettings: _onOpenAiSettings,
}: ScribeOrchestratorOverlayProps): JSX.Element | null {
  const [activeTab, setActiveTab] = useState<ViewTab>('graph');
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [directFeedback, setDirectFeedback] = useState<Record<string, string>>({});
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [applyingAll, setApplyingAll] = useState(false);
  const [chatDraft, setChatDraft] = useState('');

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const pendingOpen = useMemo(
    () => chat.pending.filter((p) => p.status === 'pending' || p.status === 'stale'),
    [chat.pending],
  );
  const pendingActionable = useMemo(
    () => chat.pending.filter((p) => p.status === 'pending'),
    [chat.pending],
  );

  const selectedAction = useMemo(() => {
    if (selectedActionId) {
      return chat.pending.find((p) => p.id === selectedActionId) ?? null;
    }
    return pendingOpen[0] ?? chat.pending[0] ?? null;
  }, [chat.pending, pendingOpen, selectedActionId]);

  if (!isOpen) return null;

  const handleSendDirectFeedback = async (action: PendingAction) => {
    const text = (directFeedback[action.id] ?? '').trim();
    if (!text) return;
    setSubmittingFeedback(true);
    try {
      const prompt = `Regarding proposal for \`${action.relPath}\` (${action.kind}):\n${text}\n\nPlease revise this specific entry accordingly and propose the updated version.`;
      await chat.send(prompt);
      setDirectFeedback((prev) => ({ ...prev, [action.id]: '' }));
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleApplyAll = async () => {
    if (pendingActionable.length === 0 || applyingAll) return;
    setApplyingAll(true);
    try {
      for (const item of pendingActionable) {
        await chat.applyPending(item.id);
      }
      onApplied?.();
    } finally {
      setApplyingAll(false);
    }
  };

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[150] flex flex-col bg-background/95 backdrop-blur-2xl text-foreground select-none animate-fade-in"
    >
      {/* Top Mission Control Bar */}
      <header className="shrink-0 h-14 px-6 border-b border-border/80 bg-card/60 backdrop-blur-md flex items-center justify-between gap-4">
        {/* Left: Branding & Model Profile */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg border border-primary/40 bg-primary/10 flex items-center justify-center text-primary shadow-sm">
            <Workflow className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight text-foreground">
                Scribe Orchestrator Engine
              </span>
              {chat.streaming ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 font-mono text-[10px] text-amber-400">
                  <Activity className="h-3 w-3 animate-pulse" />
                  <span>Orchestrating…</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border/60 bg-muted/40 font-mono text-[10px] text-muted-foreground">
                  <Check className="h-2.5 w-2.5 text-emerald-500" />
                  <span>Standing By</span>
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-2 font-mono">
              <span>Model: <strong className="text-foreground">{chat.modelProfile?.modelId ?? 'default'}</strong></span>
              <span>•</span>
              <span className="uppercase">{chat.modelProfile?.tier ?? 'standard'}</span>
              <span>•</span>
              <span>Context: {chat.modelProfile?.contextWindow.toLocaleString() ?? 'auto'} tok</span>
            </div>
          </div>
        </div>

        {/* Center: View Mode Tabs */}
        <div className="inline-flex items-center rounded-lg border border-border/80 bg-muted/40 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('graph')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors',
              activeTab === 'graph'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Network className="h-3.5 w-3.5" />
            <span>Execution Graph</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('split')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors',
              activeTab === 'split'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span>Graph + Chat Split</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('deck')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors',
              activeTab === 'deck'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Proposals ({chat.pending.length})</span>
          </button>
        </div>

        {/* Right: Policy & Exit Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onPolicyChange(policy === 'auto' ? 'standard' : 'auto')}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors',
              policy === 'auto'
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-500'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {policy === 'auto' ? (
              <>
                <Sparkles className="h-3 w-3 text-amber-500" />
                <span>Auto Execute</span>
              </>
            ) : (
              <>
                <Check className="h-3 w-3" />
                <span>Review Standard</span>
              </>
            )}
          </button>

          {/* Prominent Exit Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 gap-2 border-primary/40 bg-card hover:bg-muted text-foreground font-medium text-xs shadow-sm"
          >
            <Minimize2 className="h-3.5 w-3.5 text-primary" />
            <span>Exit to Sidebar</span>
            <kbd className="text-[10px] font-mono px-1 rounded bg-muted text-muted-foreground border border-border">
              Esc
            </kbd>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            title="Close Orchestrator View"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Orchestrator Canvas Body */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        {/* GRAPH VIEW or LEFT SIDE OF SPLIT */}
        <div
          className={cn(
            'flex flex-col h-full overflow-hidden transition-all',
            activeTab === 'graph' && 'flex-1',
            activeTab === 'split' && 'w-3/5 border-r border-border/80',
            activeTab === 'deck' && 'hidden',
          )}
        >
          {/* Graph Stage & Action Inspector */}
          <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
            {/* The Interactive Node Graph Stage */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col items-center justify-start space-y-6 bg-gradient-to-b from-card/30 to-background/80">
              {/* Orchestrator Master Node */}
              <div className="w-full max-w-xl rounded-2xl border-2 border-primary/50 bg-card/90 backdrop-blur-md p-4 shadow-xl space-y-3 relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary">
                      <Cpu className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-foreground tracking-tight">
                        Coordinator Engine
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        Single-thread prompt dispatcher & sub-agent synthesizer
                      </div>
                    </div>
                  </div>
                  <Badge variant={policy === 'auto' ? 'warning' : 'secondary'} className="text-[10px] font-mono uppercase">
                    {policy === 'auto' ? 'Autonomous Mode' : 'Standard Gate'}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px] text-muted-foreground border-t border-border/50">
                  <div>
                    Batch Limit: <span className="text-foreground">≤{chat.modelProfile?.recommendedBatchSize ?? 3}</span>
                  </div>
                  <div>
                    Max Steps: <span className="text-foreground">{chat.modelProfile?.maxToolStepsPerTurn ?? 6}/turn</span>
                  </div>
                  <div>
                    Keepalive: <span className="text-emerald-400">15m Safe</span>
                  </div>
                </div>
              </div>

              {/* Connecting Trunk Line */}
              <div className="w-0.5 h-6 bg-border relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary animate-ping" />
              </div>

              {/* Pipeline Stages Grid */}
              <div className="w-full max-w-3xl grid grid-cols-4 gap-3 relative">
                {/* Stage 1: Ingest & Survey */}
                <div className="rounded-xl border border-border/80 bg-card/60 p-3 flex flex-col space-y-2 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-primary font-medium text-xs flex items-center gap-1.5">
                      <FileSearch className="h-3.5 w-3.5" />
                      <span>1. Ingest/Scan</span>
                    </span>
                    <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                      Paged
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Surveys documents section-by-section (max 400 lines) to avoid context saturation.
                  </p>
                </div>

                {/* Stage 2: Sigils & Schemas */}
                <div className="rounded-xl border border-border/80 bg-card/60 p-3 flex flex-col space-y-2 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-primary font-medium text-xs flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5" />
                      <span>2. Sigils/Kinds</span>
                    </span>
                    <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                      Domain
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Discovers shared domain schemas (`kinds/`) and archetypes before creating leaf entities.
                  </p>
                </div>

                {/* Stage 3: Batch Extraction */}
                <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-3 flex flex-col space-y-2 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-primary font-medium text-xs flex items-center gap-1.5">
                      <Box className="h-3.5 w-3.5" />
                      <span>3. Extraction</span>
                    </span>
                    <Badge variant="success" className="text-[9px] py-0 px-1 font-mono">
                      Active
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Emits rich draft entries ({chat.pending.length} proposals staged).
                  </p>
                </div>

                {/* Stage 4: Echo Weaving */}
                <div className="rounded-xl border border-border/80 bg-card/60 p-3 flex flex-col space-y-2 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-primary font-medium text-xs flex items-center gap-1.5">
                      <GitBranch className="h-3.5 w-3.5" />
                      <span>4. Echo Linker</span>
                    </span>
                    <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                      Auto
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Auto-routes taxonomy mistakes and weaves canonical `@type/id` echo tags in prose.
                  </p>
                </div>
              </div>

              {/* Connecting Trunk Line to Proposals */}
              <div className="w-0.5 h-6 bg-border relative" />

              {/* Proposals Nodes Cluster */}
              <div className="w-full max-w-3xl rounded-2xl border border-border/80 bg-card/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-xs text-foreground">
                      Generated Action Nodes ({chat.pending.length})
                    </span>
                    <span className="text-[11px] text-muted-foreground italic">
                      Click any node to inspect diff & answer directly
                    </span>
                  </div>
                  {pendingActionable.length >= 2 && (
                    <Button
                      size="sm"
                      onClick={handleApplyAll}
                      disabled={applyingAll}
                      className="h-6 px-2.5 text-xs gap-1 bg-primary text-primary-foreground font-medium"
                    >
                      <Check className="h-3 w-3" />
                      {applyingAll ? 'Applying…' : `Apply All (${pendingActionable.length})`}
                    </Button>
                  )}
                </div>

                {chat.pending.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground/70 italic border border-dashed border-border/60 rounded-xl">
                    No active proposals. Start a harvest or request Scribe to generate entries to populate the graph.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
                    {chat.pending.map((action) => {
                      const isSelected = selectedAction?.id === action.id;
                      return (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => setSelectedActionId(action.id)}
                          className={cn(
                            'text-left p-2.5 rounded-xl border text-xs flex flex-col justify-between gap-1.5 transition-all shadow-sm',
                            isSelected
                              ? 'border-primary ring-1 ring-primary bg-primary/10'
                              : 'border-border/80 bg-card hover:border-primary/40',
                          )}
                        >
                          <div className="flex items-center justify-between gap-1 w-full">
                            <span className="font-mono text-[10px] truncate font-medium text-foreground">
                              {action.relPath.split('/').pop()}
                            </span>
                            <Badge
                              variant={
                                action.status === 'applied'
                                  ? 'success'
                                  : action.status === 'stale'
                                    ? 'warning'
                                    : 'secondary'
                              }
                              className="text-[9px] py-0 px-1 font-mono uppercase shrink-0"
                            >
                              {action.status}
                            </Badge>
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono truncate">
                            {action.relPath}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Pane of Graph: Proposal Inspector & Direct Feedback */}
            <aside className="w-[380px] shrink-0 border-l border-border/80 bg-card/60 flex flex-col overflow-y-auto p-4 space-y-4">
              {selectedAction ? (
                <div className="space-y-4 flex flex-col h-full">
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <div>
                      <span className="text-xs font-semibold text-foreground">
                        Proposal Inspector
                      </span>
                      <div className="font-mono text-[11px] text-muted-foreground truncate">
                        {selectedAction.relPath}
                      </div>
                    </div>
                    <Badge
                      variant={
                        selectedAction.status === 'applied'
                          ? 'success'
                          : selectedAction.status === 'stale'
                            ? 'warning'
                            : 'secondary'
                      }
                      className="text-[10px] uppercase font-mono"
                    >
                      {selectedAction.status}
                    </Badge>
                  </div>

                  {selectedAction.rationale && (
                    <div className="text-xs text-muted-foreground italic bg-muted/20 p-2.5 rounded-lg border border-border/50">
                      {selectedAction.rationale}
                    </div>
                  )}

                  {/* Diff Preview */}
                  <div className="flex-1 min-h-[140px] max-h-60 overflow-y-auto rounded-lg border border-border bg-background p-2 font-mono text-[10px] leading-relaxed">
                    {selectedAction.diff ? (
                      <pre className="whitespace-pre-wrap break-words">
                        {selectedAction.diff.split('\n').map((line, i) => {
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
                      <pre className="whitespace-pre-wrap break-words">
                        {selectedAction.next}
                      </pre>
                    )}
                  </div>

                  {/* Approve / Discard Action Bar */}
                  <div className="flex items-center gap-2">
                    {selectedAction.status === 'applied' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await chat.revertApplied(selectedAction.id);
                          onApplied?.();
                        }}
                        className="gap-1.5 text-xs flex-1"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        Revert Change
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          onClick={async () => {
                            await chat.applyPending(selectedAction.id);
                            onApplied?.();
                          }}
                          disabled={selectedAction.status === 'stale'}
                          className="gap-1.5 text-xs flex-1 bg-primary text-primary-foreground font-medium"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Approve & Apply
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => chat.discardPending(selectedAction.id)}
                          className="gap-1.5 text-xs text-muted-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                          Discard
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Direct Answer / Steer Box for this specific item */}
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2 mt-auto">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>Answer or Steer this Proposal</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Instruct Scribe to revise or refine this entry specifically without touching the rest:
                    </p>
                    <textarea
                      value={directFeedback[selectedAction.id] ?? ''}
                      onChange={(e) =>
                        setDirectFeedback((prev) => ({
                          ...prev,
                          [selectedAction.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendDirectFeedback(selectedAction);
                        }
                      }}
                      placeholder="e.g. Change archetype to Pilot, link to @character/kell, adjust backstory..."
                      className="w-full text-xs bg-background border border-border rounded-lg p-2 resize-none h-16 focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={
                          submittingFeedback ||
                          !(directFeedback[selectedAction.id] ?? '').trim()
                        }
                        onClick={() => void handleSendDirectFeedback(selectedAction)}
                        className="h-7 px-3 text-xs gap-1.5 bg-primary text-primary-foreground"
                      >
                        <Send className="h-3 w-3" />
                        <span>Send Revision to Scribe</span>
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-muted-foreground italic">
                  Select a proposal node to inspect details and provide direct steering feedback.
                </div>
              )}
            </aside>
          </div>
        </div>

        {/* CHAT THREAD (ONLY IN SPLIT VIEW) */}
        {activeTab === 'split' && (
          <div className="w-2/5 flex flex-col h-full bg-background/50">
            {/* Conversation Header */}
            <div className="px-4 py-2 border-b border-border/80 bg-muted/20 flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5 text-primary" />
                <span>Active Scribe Thread</span>
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                {chat.messages.length} messages
              </span>
            </div>

            {/* Message Stream */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 font-sans text-xs">
              {chat.messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'p-3 rounded-xl border max-w-[90%]',
                    m.role === 'user'
                      ? 'ml-auto bg-primary/10 border-primary/20 text-foreground'
                      : 'mr-auto bg-card border-border/80 text-foreground/90',
                  )}
                >
                  <div className="font-semibold text-[10px] text-muted-foreground uppercase mb-1">
                    {m.role === 'user' ? 'You' : 'Scribe'}
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                </div>
              ))}
            </div>

            {/* Split View Quick Composer */}
            <div className="p-3 border-t border-border/80 bg-card/60 flex items-center gap-2">
              <input
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && chatDraft.trim()) {
                    void chat.send(chatDraft);
                    setChatDraft('');
                  }
                }}
                placeholder="Ask Scribe to continue, revise, or proceed..."
                className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
              />
              <Button
                size="sm"
                disabled={!chatDraft.trim() || chat.streaming}
                onClick={() => {
                  if (chatDraft.trim()) {
                    void chat.send(chatDraft);
                    setChatDraft('');
                  }
                }}
                className="h-8 px-3 text-xs gap-1"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* PROPOSAL DECK VIEW (FULL-SCREEN TABLE OF PROPOSALS WITH INLINE DIRECT FEEDBACK) */}
        {activeTab === 'deck' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Scribe Proposals Deck
                </h2>
                <p className="text-xs text-muted-foreground">
                  Review generated file changes, approve individually or in batch, or answer proposals directly.
                </p>
              </div>
              {pendingActionable.length >= 1 && (
                <Button
                  size="sm"
                  onClick={handleApplyAll}
                  disabled={applyingAll}
                  className="gap-1.5 text-xs bg-primary text-primary-foreground font-medium"
                >
                  <Check className="h-3.5 w-3.5" />
                  Apply All ({pendingActionable.length})
                </Button>
              )}
            </div>

            {chat.pending.length === 0 ? (
              <div className="py-16 text-center text-xs text-muted-foreground italic border border-dashed border-border/60 rounded-2xl">
                No proposals in this session yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {chat.pending.map((action) => (
                  <div
                    key={action.id}
                    className="rounded-xl border border-border/80 bg-card/80 p-4 space-y-3 shadow-sm flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {action.relPath}
                        </span>
                        <Badge
                          variant={
                            action.status === 'applied'
                              ? 'success'
                              : action.status === 'stale'
                                ? 'warning'
                                : 'secondary'
                          }
                          className="text-[10px] uppercase font-mono"
                        >
                          {action.status}
                        </Badge>
                      </div>

                      {action.rationale && (
                        <div className="text-xs text-muted-foreground italic">
                          {action.rationale}
                        </div>
                      )}

                      <div className="max-h-40 overflow-y-auto rounded border border-border bg-background p-2 font-mono text-[10px]">
                        {action.diff ? (
                          <pre className="whitespace-pre-wrap break-words">{action.diff}</pre>
                        ) : (
                          <pre className="whitespace-pre-wrap break-words">{action.next}</pre>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-border/50">
                      <div className="flex items-center justify-between gap-2">
                        {action.status === 'applied' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await chat.revertApplied(action.id);
                              onApplied?.();
                            }}
                            className="gap-1 text-xs"
                          >
                            <Undo2 className="h-3 w-3" />
                            Revert
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={async () => {
                                await chat.applyPending(action.id);
                                onApplied?.();
                              }}
                              className="gap-1 text-xs bg-primary text-primary-foreground font-medium"
                            >
                              <Check className="h-3 w-3" />
                              Apply
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => chat.discardPending(action.id)}
                              className="gap-1 text-xs text-muted-foreground"
                            >
                              <X className="h-3 w-3" />
                              Discard
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Inline Direct Answer on this proposal */}
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          value={directFeedback[action.id] ?? ''}
                          onChange={(e) =>
                            setDirectFeedback((prev) => ({
                              ...prev,
                              [action.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              void handleSendDirectFeedback(action);
                            }
                          }}
                          placeholder="Directly instruct Scribe to revise this item..."
                          className="flex-1 bg-background border border-border rounded px-2.5 py-1 text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                        <Button
                          size="sm"
                          disabled={
                            submittingFeedback || !(directFeedback[action.id] ?? '').trim()
                          }
                          onClick={() => void handleSendDirectFeedback(action)}
                          className="h-7 px-2.5 text-xs gap-1"
                        >
                          <Send className="h-3 w-3" />
                          <span>Reply</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
}
