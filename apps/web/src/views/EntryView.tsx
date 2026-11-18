import { Bot } from 'lucide-react';
import { useState } from 'react';
import YAML from 'yaml';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Editor } from '../editor/LazyEditor.js';
import type { RefCatalog } from '../editor/ReferenceExtension.js';
import type { DumpEntry, KindInfo } from '../lib/lw.js';
import { lwWrite } from '../lib/lw.js';
import { cn } from '../lib/utils.js';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog.js';
import { EntryEditor } from './EntryEditor.js';
import { RenameDialog } from './RenameDialog.js';

interface EntryViewProps {
  entry: DumpEntry;
  catalog: RefCatalog;
  sagaPath: string;
  /** Pool used by the EntryEditor's EchoPickers. */
  allEntries: DumpEntry[];
  /** Resolved Kind catalog. */
  kinds: KindInfo[];
  onSaved: () => void;
  onAsk?: () => void;
  /** Called after the entry's file is deleted; parent should clear selection. */
  onDeleted?: () => void;
}

/**
 * Editor wrapper for a Codex/Lexicon/Sigil entry. Header shows id +
 * status + Save/Rename/Frontmatter; body delegates to the prose
 * Editor. The Frontmatter button opens the legacy YAML/text editor —
 * Phase 2 replaces that with the KindForm.
 */
export function EntryView({
  entry,
  catalog,
  sagaPath,
  allEntries,
  kinds,
  onSaved,
  onAsk,
  onDeleted,
}: EntryViewProps) {
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState(entry.body);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const dirty = draft !== entry.body;
  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const charCount = draft.length;

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const fm = YAML.stringify(entry.frontmatter).trimEnd();
      const body = draft.startsWith('\n') ? draft : `\n\n${draft}`;
      const content = `---\n${fm}\n---${body.endsWith('\n') ? body : body + '\n'}`;
      await lwWrite(sagaPath, entry.relPath, content);
      setStatus('saved');
      onSaved();
    } catch (e) {
      setStatus('error: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden animate-panel-enter">
      <header className="shrink-0 flex-wrap px-4 py-2.5 border-b border-border/80 bg-card/40 backdrop-blur-md flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[11px] text-muted-foreground truncate">
            {entry.relPath}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="font-semibold text-base tracking-tight text-foreground">{entry.name}</span>
            <Badge variant="secondary" className="rounded-md">{entry.type}</Badge>
            <Badge variant="outline" className="rounded-md font-mono text-[10px]">
              {wordCount}w · {charCount}c
            </Badge>
            {entry.appears_in && entry.appears_in.length > 0 && (
              <Badge variant="default" className="rounded-md">{entry.appears_in.join(', ')}</Badge>
            )}
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
              title="Ask the assistant about this entry"
            >
              <Bot className="h-3.5 w-3.5" />
              Ask
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setRenaming(true)}>
            Rename
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} title="Edit entry properties and metadata">
            Properties
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-rose-400 hover:text-rose-300"
            onClick={() => setDeleting(true)}
          >
            Delete
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
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        <Editor value={draft} catalog={catalog} onChange={setDraft} />
      </div>
      {editing && (
        <EntryEditor
          entry={{ ...entry, body: draft }}
          sagaPath={sagaPath}
          allEntries={allEntries}
          kinds={kinds}
          onClose={() => setEditing(false)}
          onSaved={onSaved}
        />
      )}
      {renaming && (
        <RenameDialog
          sagaPath={sagaPath}
          type={entry.type}
          id={entry.id}
          name={entry.name}
          onClose={() => setRenaming(false)}
          onRenamed={() => onSaved()}
        />
      )}
      {deleting && (
        <ConfirmDeleteDialog
          sagaPath={sagaPath}
          relPath={entry.relPath}
          label={`${entry.type} "${entry.name}"`}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            onDeleted?.();
            onSaved();
          }}
        />
      )}
    </div>
  );
}
