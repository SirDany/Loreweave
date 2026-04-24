// CodeMirror 6 extension: autocomplete + hover preview + broken-ref underline
// for Loreweave.
//
// References: `@type/id` — e.g. @character/aaron, @term/grukh.
// Sigils:     `#<sigil-id>` — freeform tags.
//
// The catalog is passed in at creation time. When the underlying Saga reloads
// we swap the extension via a compartment (see Editor.tsx).

import {
  autocompletion,
  CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import {
  Decoration,
  EditorView,
  hoverTooltip,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

export interface RefCatalogEntry {
  type: string;
  id: string;
  name: string;
  /** Short summary string for hover preview. */
  summary?: string;
}

export interface RefCatalog {
  entries: RefCatalogEntry[];
  sigils: string[];
}

const REF_TYPES = [
  "character",
  "location",
  "concept",
  "lore",
  "waypoint",
  "term",
  "sigil",
];

function refCompletions(catalog: RefCatalog) {
  return (ctx: CompletionContext): CompletionResult | null => {
    // Match "@" + optional "type/" + partial id immediately before cursor.
    const m = ctx.matchBefore(/@[a-zA-Z]*\/?[a-zA-Z0-9\-_]*/);
    if (!m || (m.from === m.to && !ctx.explicit)) return null;
    const text = m.text;
    const slash = text.indexOf("/");
    if (slash === -1) {
      // @<partial-type>  →  offer type names
      return {
        from: m.from + 1,
        options: REF_TYPES.map((t) => ({
          label: t,
          apply: `${t}/`,
          type: "type",
        })),
        validFor: /^[a-zA-Z]*$/,
      };
    }
    const type = text.slice(1, slash);
    const partial = text.slice(slash + 1);
    const matches = catalog.entries.filter((e) => e.type === type);
    return {
      from: m.from + slash + 1,
      options: matches.map((e) => ({
        label: e.id,
        detail: e.name,
        type: "variable",
      })),
      validFor: /^[a-zA-Z0-9\-_]*$/,
      filter: partial.length > 0 ? undefined : true,
    };
  };
}

function sigilCompletions(catalog: RefCatalog) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/#[a-zA-Z0-9\-_]*/);
    if (!m || (m.from === m.to && !ctx.explicit)) return null;
    return {
      from: m.from + 1,
      options: catalog.sigils.map((s) => ({ label: s, type: "keyword" })),
      validFor: /^[a-zA-Z0-9\-_]*$/,
    };
  };
}

const REF_RE = /@([a-zA-Z]+)\/([a-zA-Z0-9\-_]+)/g;

function brokenRefPlugin(catalog: RefCatalog) {
  const valid = new Set(catalog.entries.map((e) => `${e.type}/${e.id}`));
  const broken = Decoration.mark({ class: "lw-broken-ref" });
  const ok = Decoration.mark({ class: "lw-ref" });

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
      }
      build(view: EditorView): DecorationSet {
        const b = new RangeSetBuilder<Decoration>();
        for (const { from, to } of view.visibleRanges) {
          const text = view.state.doc.sliceString(from, to);
          for (const m of text.matchAll(REF_RE)) {
            const start = from + (m.index ?? 0);
            const end = start + m[0].length;
            const key = `${m[1]}/${m[2]}`;
            b.add(start, end, valid.has(key) ? ok : broken);
          }
        }
        return b.finish();
      }
    },
    { decorations: (v) => v.decorations },
  );
}

export function loreweaveExtensions(catalog: RefCatalog) {
  const lookup = new Map<string, RefCatalogEntry>();
  for (const e of catalog.entries) lookup.set(`${e.type}/${e.id}`, e);

  const hover = hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos);
    const text = line.text;
    const rel = pos - line.from;
    // find a @type/id token that spans `rel`
    for (const m of text.matchAll(REF_RE)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (rel >= start && rel <= end) {
        const key = `${m[1]}/${m[2]}`;
        const entry = lookup.get(key);
        return {
          pos: line.from + start,
          end: line.from + end,
          above: true,
          create() {
            const dom = document.createElement("div");
            dom.className = "lw-hover";
            if (!entry) {
              dom.textContent = `unknown reference: ${key}`;
              dom.style.color = "#fecaca";
            } else {
              const h = document.createElement("div");
              h.style.fontWeight = "600";
              h.textContent = `${entry.name}`;
              const s = document.createElement("div");
              s.style.fontSize = "0.75rem";
              s.style.color = "#a8a29e";
              s.textContent = `${entry.type}/${entry.id}`;
              dom.append(h, s);
              if (entry.summary) {
                const p = document.createElement("div");
                p.style.fontSize = "0.8rem";
                p.style.marginTop = "0.25rem";
                p.style.maxWidth = "24rem";
                p.textContent = entry.summary;
                dom.appendChild(p);
              }
            }
            return { dom };
          },
        };
      }
    }
    return null;
  });

  return [
    autocompletion({
      override: [refCompletions(catalog), sigilCompletions(catalog)],
      activateOnTyping: true,
    }),
    brokenRefPlugin(catalog),
    hover,
    EditorView.theme({
      ".lw-ref": { color: "#fbbf24", textDecoration: "underline dotted #fbbf24" },
      ".lw-broken-ref": {
        color: "#f87171",
        textDecoration: "underline wavy #f87171",
      },
      ".lw-hover": {
        padding: "0.5rem 0.75rem",
        background: "#1c1917",
        border: "1px solid #44403c",
        borderRadius: "0.25rem",
        color: "#e7e5e4",
      },
    }),
  ];
}
