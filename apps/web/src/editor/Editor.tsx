import { Fragment, useEffect, useRef, useState } from "react";
import {
  Bold,
  Code,
  Code2,
  Heading,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
} from "lucide-react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, tooltips } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { loreweaveExtensions, type RefCatalog } from "./ReferenceExtension.js";
import { refAtOffset, type RefAtCursor } from "./refAtCursor.js";
import {
  cycleHeading,
  insertCodeBlock,
  insertHorizontalRule,
  insertLink,
  markdownFormattingKeymap,
  toggleInlineWrap,
  toggleLinePrefix,
  toggleOrderedList,
} from "./markdownCommands.js";

export interface EditorSelectionEvent {
  /** Currently selected text (main selection range). */
  text: string;
  /** 1-based line range of the selection. */
  lines: [number, number];
}

interface Props {
  value: string;
  catalog: RefCatalog;
  readOnly?: boolean;
  onChange?: (v: string) => void;
  /** Hide the markdown formatting toolbar above the editor. */
  hideToolbar?: boolean;
  /**
   * Called when the writer picks an agent action from the selection toolbar.
   * `action` is one of the agent ids (muse / scribe / warden / polisher).
   */
  onAskAssistant?: (
    action: string,
    selection: EditorSelectionEvent,
  ) => void;
  /**
   * Fires whenever the cursor enters or leaves an `@type/id` echo. `null`
   * means the cursor isn't inside any echo.
   */
  onRefAtCursor?: (ref: RefAtCursor | null) => void;
}

interface Anchor {
  top: number;
  left: number;
  text: string;
  lines: [number, number];
}

const TOOLBAR_ACTIONS: Array<{
  id: string;
  label: string;
  title: string;
}> = [
  { id: 'scribe-brainstorm', label: 'Brainstorm', title: 'Ask Scribe to brainstorm ideas for this passage' },
  { id: 'scribe-rewrite', label: 'Rewrite', title: 'Ask Scribe to rewrite this passage honoring canon' },
  { id: 'scribe-audit', label: 'Audit Canon', title: 'Ask Scribe to check canon consistency and Sigil terms' },
  { id: 'scribe-polish', label: 'Polish Prose', title: 'Ask Scribe to polish rhythm and prose without changing canon' },
];

const modernEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "hsl(var(--foreground))",
    height: "100%",
  },
  ".cm-content": {
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    fontSize: "0.9375rem",
    lineHeight: "1.75",
    padding: "1.25rem 1.5rem",
    caretColor: "hsl(var(--primary))",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "hsl(var(--muted-foreground) / 0.5)",
    border: "none",
    paddingRight: "0.5rem",
  },
  ".cm-activeLine": {
    backgroundColor: "hsl(var(--primary) / 0.08)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "hsl(var(--primary))",
    fontWeight: "600",
  },
  ".cm-cursor": {
    borderLeftColor: "hsl(var(--primary))",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "hsl(var(--primary) / 0.25) !important",
  },
});

export function Editor({ value, catalog, readOnly, onChange, onAskAssistant, onRefAtCursor, hideToolbar }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const lwCompartment = useRef(new Compartment());
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const lastRefKey = useRef<string | null>(null);
  const refCallback = useRef(onRefAtCursor);
  refCallback.current = onRefAtCursor;

  // Initial mount
  useEffect(() => {
    if (!host.current) return;
    const hostEl = host.current;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([
          // Markdown formatting shortcuts take precedence so Ctrl+B / Ctrl+I
          // don't fall through to the default keymap's selection commands.
          ...markdownFormattingKeymap(),
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        modernEditorTheme,
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(!!readOnly),
        tooltips({
          parent: typeof document !== "undefined" ? document.body : undefined,
          position: "fixed",
        }),
        lwCompartment.current.of(loreweaveExtensions(catalog)),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && onChange) onChange(u.state.doc.toString());
          if (u.selectionSet || u.docChanged) {
            updateAnchor(u.view);
            updateRef(u.view);
          }
        }),
      ],
    });
    view.current = new EditorView({ state, parent: hostEl });

    const updateAnchor = (v: EditorView) => {
      const sel = v.state.selection.main;
      if (sel.empty || !onAskAssistant) {
        setAnchor(null);
        return;
      }
      const text = v.state.sliceDoc(sel.from, sel.to);
      if (!text.trim()) {
        setAnchor(null);
        return;
      }
      const fromCoords = v.coordsAtPos(sel.from);
      if (!fromCoords) {
        setAnchor(null);
        return;
      }
      const hostRect = hostEl.getBoundingClientRect();
      const startLine = v.state.doc.lineAt(sel.from).number;
      const endLine = v.state.doc.lineAt(sel.to).number;
      const aboveTop = fromCoords.top - hostRect.top - 40;
      const top = aboveTop < 4 ? fromCoords.bottom - hostRect.top + 6 : aboveTop;
      const maxLeft = Math.max(8, hostRect.width - 340);
      const left = Math.min(Math.max(8, fromCoords.left - hostRect.left), maxLeft);
      setAnchor({
        top,
        left,
        text,
        lines: [startLine, endLine],
      });
    };

    const updateRef = (v: EditorView) => {
      const cb = refCallback.current;
      if (!cb) return;
      const pos = v.state.selection.main.head;
      const ref = refAtOffset(v.state.doc.toString(), pos);
      const key = ref ? `${ref.type}/${ref.id}@${ref.from}` : null;
      if (key === lastRefKey.current) return;
      lastRefKey.current = key;
      cb(ref);
    };

    return () => {
      view.current?.destroy();
      view.current = null;
    };
    // host ref is stable; we intentionally mount once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap extensions when catalog changes
  useEffect(() => {
    view.current?.dispatch({
      effects: lwCompartment.current.reconfigure(loreweaveExtensions(catalog)),
    });
  }, [catalog]);

  // Sync external value changes (e.g. switching chapter)
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current !== value) {
      v.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {!readOnly && !hideToolbar && (
        <MarkdownToolbar viewRef={view} />
      )}
      <div ref={host} className="relative flex-1 overflow-auto">
        {anchor && onAskAssistant && (
          <div
            className="absolute z-40 flex items-center gap-1 rounded-lg border border-border/80 bg-popover/95 backdrop-blur-md px-2 py-1 shadow-xl ring-1 ring-primary/25"
            style={{ top: Math.max(4, anchor.top), left: anchor.left }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
              Scribe
            </span>
            {TOOLBAR_ACTIONS.map((a) => (
              <button
                key={a.id}
                title={a.title}
                className="rounded-md px-2 py-0.5 text-xs text-foreground/90 hover:bg-primary/15 hover:text-primary transition-colors font-medium"
                onClick={() =>
                  onAskAssistant(a.id, { text: anchor.text, lines: anchor.lines })
                }
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- markdown formatting toolbar -----------------------------------

interface ToolbarButton {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  title: string;
  run: (v: EditorView) => void;
}

const TOOLBAR_BUTTONS: ToolbarButton[] = [
  {
    icon: Heading,
    label: 'H',
    title: 'Heading (cycle H1/H2/H3 — Ctrl+Shift+H)',
    run: (v) => cycleHeading(v),
  },
  {
    icon: Bold,
    label: 'B',
    title: 'Bold (Ctrl+B)',
    run: (v) => toggleInlineWrap(v, '**'),
  },
  {
    icon: Italic,
    label: 'I',
    title: 'Italic (Ctrl+I)',
    run: (v) => toggleInlineWrap(v, '_'),
  },
  {
    icon: Strikethrough,
    label: 'S',
    title: 'Strikethrough (Ctrl+Shift+X)',
    run: (v) => toggleInlineWrap(v, '~~'),
  },
  {
    icon: Code,
    label: 'Code',
    title: 'Inline code (Ctrl+E)',
    run: (v) => toggleInlineWrap(v, '`'),
  },
  {
    icon: LinkIcon,
    label: 'Link',
    title: 'Link (Ctrl+L)',
    run: (v) => insertLink(v),
  },
  {
    icon: List,
    label: 'UL',
    title: 'Bullet list (Ctrl+Shift+8)',
    run: (v) => toggleLinePrefix(v, '- ', [/^\*\s/, /^\d+\.\s/]),
  },
  {
    icon: ListOrdered,
    label: 'OL',
    title: 'Numbered list (Ctrl+Shift+7)',
    run: (v) => toggleOrderedList(v),
  },
  {
    icon: Quote,
    label: 'Quote',
    title: 'Blockquote (Ctrl+Shift+.)',
    run: (v) => toggleLinePrefix(v, '> '),
  },
  {
    icon: Code2,
    label: 'Block',
    title: 'Code block',
    run: (v) => insertCodeBlock(v),
  },
  {
    icon: Minus,
    label: 'HR',
    title: 'Horizontal rule',
    run: (v) => insertHorizontalRule(v),
  },
];

function MarkdownToolbar({ viewRef }: { viewRef: React.MutableRefObject<EditorView | null> }) {
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/80 bg-card/60 backdrop-blur-md px-3 py-1.5"
      onMouseDown={(e) => e.preventDefault()}
    >
      {TOOLBAR_BUTTONS.map((b, i) => {
        // Insert a subtle divider after the heading-cycle button and after
        // the inline-formatting cluster so the toolbar reads as three groups:
        // structure • inline • blocks.
        const Icon = b.icon;
        const divider = i === 1 || i === 5 || i === 8;
        return (
          <Fragment key={b.label + i}>
            {divider && (
              <span
                aria-hidden
                className="mx-1 inline-block h-4 w-px bg-border/80"
              />
            )}
            <button
              type="button"
              title={b.title}
              onClick={() => {
                const v = viewRef.current;
                if (v) b.run(v);
              }}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-foreground/80 hover:bg-primary/10 hover:text-primary transition-colors"
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{b.label}</span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
