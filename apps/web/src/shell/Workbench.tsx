import { useState } from 'react';
import type { RefCatalog } from '../editor/ReferenceExtension.js';
import type {
  CanonDigestPayload,
  DumpEntry,
  DumpPayload,
  KindInfo,
} from '../lib/lw.js';
import { lwWrite } from '../lib/lw.js';
import { applyFrontmatterPatch, patchForKanbanMove } from '../loom/contrib/frontmatter-patch.js';
import { getLens, getLensManifest } from '../loom/registry.js';
import { assistantPromptFor, type Jumper } from '../lib/saga-helpers.js';
import { BUILTIN_SECTIONS, type Section } from '../state/types.js';
import type { AssistantSeed } from '../state/useApp.js';
import { ChapterPreview } from '../views/ChapterPreview.js';
import { ChapterView } from '../views/ChapterView.js';
import { ConstellationView } from '../views/ConstellationView.js';
import { EmptyState } from '../views/EmptyState.js';
import { EntryView } from '../views/EntryView.js';
import { ThreadView } from '../views/ThreadView.js';
import { TracesView } from '../views/TracesView.js';
import { VersionsPanel } from '../views/VersionsPanel.js';
import { cn } from '../lib/utils.js';

interface WorkbenchProps {
  section: Section;
  data: DumpPayload;
  catalog: RefCatalog;
  digest: CanonDigestPayload | null;
  kinds: KindInfo[];
  sagaPath: string;
  tomeLens: string | null;
  currentEntry: DumpEntry | null;
  currentChapter: { tome: string; chapter: DumpPayload['tomes'][number]['chapters'][number] } | null;
  selectionKey: string | undefined;
  onJump: Jumper;
  onSaved: () => void;
  openAssistant: (seed: AssistantSeed) => void;
}

/**
 * Main editing pane. Dispatches to the right view based on section
 * + selection. Owns the Story Edit/Preview tab state because it's
 * local to the chapter editor.
 */
export function Workbench({
  section,
  data,
  catalog,
  digest,
  kinds,
  sagaPath,
  tomeLens,
  currentEntry,
  currentChapter,
  selectionKey,
  onJump,
  onSaved,
  openAssistant,
}: WorkbenchProps) {
  const [storyTab, setStoryTab] = useState<'edit' | 'preview'>('edit');

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-background">
      {currentEntry && (
        <EntryView
          entry={currentEntry}
          catalog={catalog}
          sagaPath={sagaPath}
          allEntries={data.entries}
          kinds={kinds}
          onSaved={onSaved}
          onAsk={() =>
            openAssistant({
              agent: 'muse',
              prompt: `Tell me about \`@${currentEntry.type}/${currentEntry.id}\`. Read the Codex and list what's established vs. open questions.`,
              context: {
                path: currentEntry.relPath,
                likelyRefs: [`${currentEntry.type}/${currentEntry.id}`],
              },
            })
          }
          key={selectionKey}
        />
      )}
      {currentChapter && section === 'story' && (
        <div className="border-b border-border bg-card/40">
          <div className="flex px-2 py-1 gap-1">
            <StoryTabButton
              active={storyTab === 'edit'}
              onClick={() => setStoryTab('edit')}
              label="Edit"
            />
            <StoryTabButton
              active={storyTab === 'preview'}
              onClick={() => setStoryTab('preview')}
              label="Preview"
            />
          </div>
        </div>
      )}
      {currentChapter && section === 'story' && storyTab === 'edit' && (
        <ChapterView
          chapter={currentChapter}
          catalog={catalog}
          sagaPath={sagaPath}
          digest={digest}
          onJumpToEntry={(type, id) =>
            onJump({ kind: 'entry', key: `${type}/${id}` })
          }
          onSaved={onSaved}
          onAskAssistant={(action, sel, relPath) => {
            const likelyRefs = Array.from(
              new Set(
                currentChapter.chapter.refs.map((r) => `${r.type}/${r.id}`),
              ),
            );
            openAssistant({
              agent: action,
              prompt: assistantPromptFor(action),
              context: {
                selection: sel.text,
                path: relPath,
                lines: sel.lines,
                likelyRefs,
              },
            });
          }}
          onAsk={() => {
            const likelyRefs = Array.from(
              new Set(
                currentChapter.chapter.refs.map((r) => `${r.type}/${r.id}`),
              ),
            );
            openAssistant({
              agent: 'muse',
              prompt:
                "Discuss this chapter with me — structure, pacing, what works, what doesn't.",
              context: { path: currentChapter.chapter.relPath, likelyRefs },
            });
          }}
          onAudit={() => {
            const likelyRefs = Array.from(
              new Set(
                currentChapter.chapter.refs.map((r) => `${r.type}/${r.id}`),
              ),
            );
            openAssistant({
              agent: 'warden',
              prompt:
                'Audit this chapter against the Codex: list contradictions, broken @refs, slang misuse, and Thread conflicts. Cite files.',
              context: { path: currentChapter.chapter.relPath, likelyRefs },
            });
          }}
          key={selectionKey}
        />
      )}
      {currentChapter && section === 'story' && storyTab === 'preview' && (
        <ChapterPreview
          chapter={currentChapter.chapter}
          data={data}
          onJump={onJump}
        />
      )}
      {!currentEntry && !currentChapter && section === 'threads' && (
        <ThreadView
          data={data}
          sagaPath={sagaPath}
          tomeLens={tomeLens}
          onReloaded={onSaved}
        />
      )}
      {!currentEntry && !currentChapter && section === 'traces' && (
        <TracesView
          data={data}
          sagaPath={sagaPath}
          onJump={onJump}
          onReload={onSaved}
        />
      )}
      {!currentEntry && !currentChapter && section === 'versions' && (
        <VersionsPanel sagaPath={sagaPath} onChanged={onSaved} />
      )}
      {!currentEntry && !currentChapter && section === 'constellation' && (
        <ConstellationView data={data} onJump={onJump} />
      )}
      {!currentEntry &&
        !currentChapter &&
        !BUILTIN_SECTIONS.includes(section as (typeof BUILTIN_SECTIONS)[number]) && (
          <CustomLensSlot
            section={section}
            data={data}
            sagaPath={sagaPath}
            selectionKey={selectionKey}
            onJump={onJump}
            onSaved={onSaved}
          />
        )}
      {!currentEntry &&
        !currentChapter &&
        section !== 'threads' &&
        section !== 'traces' &&
        section !== 'versions' &&
        section !== 'constellation' &&
        BUILTIN_SECTIONS.includes(section as (typeof BUILTIN_SECTIONS)[number]) && (
          <EmptyState section={section} diagnostics={data.diagnostics} />
        )}
    </main>
  );
}

function StoryTabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-md px-4 py-1.5 text-xs uppercase tracking-widest transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

interface CustomLensSlotProps {
  section: string;
  data: DumpPayload;
  sagaPath: string;
  selectionKey: string | undefined;
  onJump: Jumper;
  onSaved: () => void;
}

/**
 * Renders a saga- or contrib-defined Lens by looking up its manifest
 * and renderer in the Loom registry. When the manifest opts in via
 * `editable: true`, drag-and-drop edits are persisted by writing the
 * patched frontmatter through `lwWrite`.
 */
function CustomLensSlot({
  section,
  data,
  sagaPath,
  selectionKey,
  onJump,
  onSaved,
}: CustomLensSlotProps) {
  const manifest = getLensManifest(section);
  const renderer = manifest ? getLens(manifest.renderer) : undefined;
  if (!manifest || !renderer) {
    return <EmptyState section={section} diagnostics={data.diagnostics} />;
  }
  const Renderer = renderer.component;
  const onMove = manifest.editable
    ? async (entry: DumpEntry, newColumn: string) => {
        const groupBy = manifest.groupBy ?? 'status';
        const patch = patchForKanbanMove(entry, groupBy, newColumn);
        const content = applyFrontmatterPatch(entry, patch);
        try {
          await lwWrite(sagaPath, entry.relPath, content);
          onSaved();
        } catch (err) {
          console.error('lens onMove failed', err);
        }
      }
    : undefined;
  return (
    <Renderer
      manifest={manifest}
      entries={data.entries}
      selectionKey={selectionKey}
      onSelect={(key: string) => onJump({ kind: 'entry', key })}
      onMove={onMove}
    />
  );
}
