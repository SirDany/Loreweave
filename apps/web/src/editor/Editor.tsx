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
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { loreweaveExtensions, type RefCatalog } from "./ReferenceExtension.js";
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
  { id: 'muse', label: 'Muse', title: 'Brainstorm about this passage' },
  { id: 'scribe', label: 'Scribe', title: 'Rewrite this passage' },
  { id: 'warden', label: 'Warden', title: 'Check canon consistency' },
  { id: 'polisher', label: 'Polisher', title: 'Polish prose without changing canon' },
];

const darkTheme = EditorView.theme(
  {
    "&": { backgroundColor: "transparent", color: "#e7e5e4", height: "100%" },
    ".cm-content": { fontFamily: "ui-serif, Georgia, serif", padding: "1rem" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "#57534e",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "rgba(120, 53, 15, 0.15)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#a8a29e" },
    ".cm-cursor": { borderLeftColor: "#fbbf24" },
  },
  { dark: true },
);

export function Editor({ value, catalog, readOnly, onChange, onAskAssistant, hideToolbar }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const lwCompartment = useRef(new Compartment());
  const [anchor, setAnchor] = useState<Anchor | null>(null);

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
        darkTheme,
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(!!readOnly),
        lwCompartment.current.of(loreweaveExtensions(catalog)),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && onChange) onChange(u.state.doc.toString());
          if (u.selectionSet || u.docChanged) {
            updateAnchor(u.view);
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
      setAnchor({
        top: fromCoords.top - hostRect.top - 36,
        left: Math.max(8, fromCoords.left - hostRect.left),
        text,
        lines: [startLine, endLine],
      });
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
            className="absolute z-20 flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-1 shadow-lg"
            style={{ top: Math.max(4, anchor.top), left: anchor.left }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <span className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Ask
            </span>
            {TOOLBAR_ACTIONS.map((a) => (
              <button
                key={a.id}
                title={a.title}
                className="rounded px-2 py-0.5 text-xs text-foreground/90 hover:bg-accent hover:text-accent-foreground"
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
      className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border bg-card/60 px-2 py-1"
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
                className="mx-1 inline-block h-4 w-px bg-border"
              />
            )}
            <button
              type="button"
              title={b.title}
              onClick={() => {
                const v = viewRef.current;
                if (v) b.run(v);
              }}
              className="inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] font-medium text-foreground/85 hover:bg-accent hover:text-accent-foreground"
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
