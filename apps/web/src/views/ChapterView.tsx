import { BookOpen, Bot, Shield } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Editor } from '../editor/LazyEditor.js';
import type { RefAtCursor } from '../editor/refAtCursor.js';
import type { RefCatalog } from '../editor/ReferenceExtension.js';
import type { CanonDigestPayload, DumpChapter } from '../lib/lw.js';
import { lwWrite } from '../lib/lw.js';
import { cn } from '../lib/utils.js';
import { CodexPane } from './CodexPane.js';

interface ChapterViewProps {
  chapter: { tome: string; chapter: DumpChapter };
  catalog: RefCatalog;
  sagaPath: string;
  digest: CanonDigestPayload | null;
  onSaved: () => void;
  onJumpToEntry?: (type: string, id: string) => void;
  onAskAssistant?: (
    action: string,
    selection: { text: string; lines: [number, number] },
    path: string,
  ) => void;
  onAsk?: () => void;
  onAudit?: () => void;
}

/**
 * Chapter prose editor with the inline CodexPane. The Codex pane is
 * collapsible and remembers its state in localStorage.
 */
export function ChapterView({
  chapter,
  catalog,
  sagaPath,
  digest,
  onSaved,
  onJumpToEntry,
  onAskAssistant,
  onAsk,
  onAudit,
}: ChapterViewProps) {
  const [draft, setDraft] = useState(chapter.chapter.body);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [cursorRef, setCursorRef] = useState<RefAtCursor | null>(null);
  const [paneOpen, setPaneOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('loreweave.codexPane') !== '0';
    } catch {
      return true;
    }
  });
  const togglePane = () => {
    setPaneOpen((v) => {
      const next = !v;
      try {
        window.localStorage.setItem('loreweave.codexPane', next ? '1' : '0');
      } catch {
        /* best effort */
      }
      return next;
    });
  };
  const dirty = draft !== chapter.chapter.body;

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await lwWrite(sagaPath, chapter.chapter.relPath, draft);
      setStatus('saved');
      onSaved();
    } catch (e) {
      setStatus('error: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const refCount = chapter.chapter.refs.length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-3 border-b border-border bg-card/40 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[11px] text-muted-foreground truncate">
            {chapter.chapter.relPath}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-serif text-lg">{chapter.chapter.title}</span>
            <Badge variant="secondary">{chapter.tome}</Badge>
            <Badge variant="outline">
              {refCount} echo{refCount !== 1 ? 'es' : ''}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {status && (
            <span
              className={cn(
                status.startsWith('error')
                  ? 'text-rose-400'
                  : 'text-emerald-400',
              )}
            >
              {status}
            </span>
          )}
          {dirty && <span className="text-amber-400">• unsaved</span>}
          {onAsk && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={onAsk}
              title="Ask the assistant about this chapter"
            >
              <Bot className="h-3.5 w-3.5" />
              Ask
            </Button>
          )}
          {onAudit && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={onAudit}
              title="Run @warden audit on this chapter"
            >
              <Shield className="h-3.5 w-3.5" />
              Audit
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={togglePane}
            title={paneOpen ? 'Hide Codex pane' : 'Show Codex pane'}
          >
            <BookOpen className="h-3.5 w-3.5" />
            {paneOpen ? 'Hide codex' : 'Show codex'}
          </Button>
          <Button
            variant={dirty ? 'default' : 'outline'}
            size="sm"
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <Editor
            value={draft}
            catalog={catalog}
            onChange={setDraft}
            onRefAtCursor={setCursorRef}
            onAskAssistant={
              onAskAssistant
                ? (action, sel) =>
                    onAskAssistant(action, sel, chapter.chapter.relPath)
                : undefined
            }
          />
        </div>
        {paneOpen && (
          <aside className="w-80 shrink-0 border-l border-border bg-card/30">
            <CodexPane
              cursorRef={cursorRef}
              digest={digest}
              onJump={onJumpToEntry}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
