import { useEffect, useRef, useState } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { loreweaveExtensions, type RefCatalog } from "./ReferenceExtension.js";

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

export function Editor({ value, catalog, readOnly, onChange, onAskAssistant }: Props) {
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
        keymap.of([...defaultKeymap, ...historyKeymap]),
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
    <div ref={host} className="relative h-full overflow-auto">
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
  );
}
