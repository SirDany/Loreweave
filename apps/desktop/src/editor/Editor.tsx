import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { loreweaveExtensions, type RefCatalog } from "./ReferenceExtension.js";

interface Props {
  value: string;
  catalog: RefCatalog;
  readOnly?: boolean;
  onChange?: (v: string) => void;
}

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

export function Editor({ value, catalog, readOnly, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const lwCompartment = useRef(new Compartment());

  // Initial mount
  useEffect(() => {
    if (!host.current) return;
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
        }),
      ],
    });
    view.current = new EditorView({ state, parent: host.current });
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

  return <div ref={host} className="h-full overflow-auto" />;
}
