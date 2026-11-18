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
  /** Known aliases (a.k.a. names). */
  aliases?: string[];
  /** Sigil / free tags applied to the entry. */
  tags?: string[];
  /** Draft vs canon status (if set). */
  status?: 'draft' | 'canon' | null;
  /** Parent Sigils this entry inherits from (from the weave cache). */
  inheritsChain?: string[];
  /** A bounded selection of resolved properties for the hover card. */
  properties?: Array<{ key: string; value: unknown; from: string }>;
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

import { REF_REGEX, canonicalType } from "@loreweave/core";

function formatPropValue(value: unknown): string {
  if (value == null) return "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((v) => formatPropValue(v)).join(", ");
  }
  if (typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      return s.length > 60 ? s.slice(0, 60) + "…" : s;
    } catch {
      return "[object]";
    }
  }
  const s = String(value);
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}

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
          const re = new RegExp(REF_REGEX.source, "g");
          let m: RegExpExecArray | null;
          while ((m = re.exec(text))) {
            const start = from + m.index;
            const end = start + m[0].length;
            const type = m[1] !== undefined ? canonicalType(m[2]!) : canonicalType(m[5]!);
            const id = m[1] !== undefined ? m[3]! : m[6]!;
            const key = `${type}/${id}`;
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
    const re = new RegExp(REF_REGEX.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = m.index;
      const end = start + m[0].length;
      if (rel >= start && rel <= end) {
        const type = m[1] !== undefined ? canonicalType(m[2]!) : canonicalType(m[5]!);
        const id = m[1] !== undefined ? m[3]! : m[6]!;
        const display = m[1] !== undefined ? m[1] : m[8];
        const key = `${type}/${id}`;
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
              dom.style.color = "hsl(var(--destructive))";
            } else {
              const header = document.createElement("div");
              header.style.display = "flex";
              header.style.alignItems = "center";
              header.style.gap = "0.4rem";
              const h = document.createElement("div");
              h.style.fontWeight = "600";
              h.style.color = "hsl(var(--popover-foreground))";
              h.textContent = entry.name;
              header.appendChild(h);
              if (entry.status) {
                const badge = document.createElement("span");
                badge.textContent = entry.status;
                badge.style.fontSize = "0.65rem";
                badge.style.textTransform = "uppercase";
                badge.style.padding = "0.05rem 0.35rem";
                badge.style.borderRadius = "0.25rem";
                badge.style.border = "1px solid hsl(var(--border))";
                badge.style.color =
                  entry.status === "draft"
                    ? "hsl(var(--ring))"
                    : "hsl(var(--primary))";
                header.appendChild(badge);
              }
              dom.appendChild(header);

              const s = document.createElement("div");
              s.style.fontSize = "0.75rem";
              s.style.color = "hsl(var(--primary))";
              s.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
              s.textContent = `${entry.type}/${entry.id}`;
              dom.appendChild(s);

              if (display !== undefined) {
                const d = document.createElement("div");
                d.style.fontSize = "0.7rem";
                d.style.color = "hsl(var(--muted-foreground))";
                d.style.marginTop = "0.15rem";
                d.style.fontStyle = "italic";
                d.textContent = `displays as: ${display || "(empty)"}`;
                dom.appendChild(d);
              }

              if (entry.aliases && entry.aliases.length > 0) {
                const a = document.createElement("div");
                a.style.fontSize = "0.7rem";
                a.style.color = "hsl(var(--muted-foreground))";
                a.style.marginTop = "0.15rem";
                a.textContent = `a.k.a. ${entry.aliases.join(", ")}`;
                dom.appendChild(a);
              }

              if (entry.summary) {
                const p = document.createElement("div");
                p.style.fontSize = "0.8rem";
                p.style.marginTop = "0.35rem";
                p.style.color = "hsl(var(--popover-foreground) / 0.9)";
                p.style.maxWidth = "20rem";
                p.textContent = entry.summary;
                dom.appendChild(p);
              }

              if (entry.properties && entry.properties.length > 0) {
                const tbl = document.createElement("div");
                tbl.style.marginTop = "0.45rem";
                tbl.style.display = "grid";
                tbl.style.gridTemplateColumns = "auto 1fr";
                tbl.style.columnGap = "0.55rem";
                tbl.style.rowGap = "0.15rem";
                tbl.style.fontSize = "0.72rem";
                for (const p of entry.properties) {
                  const k = document.createElement("div");
                  k.textContent = p.key;
                  k.style.color = "hsl(var(--muted-foreground))";
                  const v = document.createElement("div");
                  v.textContent = formatPropValue(p.value);
                  v.style.color = "hsl(var(--popover-foreground))";
                  if (p.from.startsWith("sigil:")) {
                    v.title = `inherited from ${p.from}`;
                    v.style.fontStyle = "italic";
                  }
                  tbl.appendChild(k);
                  tbl.appendChild(v);
                }
                dom.appendChild(tbl);
              }

              if (entry.tags && entry.tags.length > 0) {
                const t = document.createElement("div");
                t.style.fontSize = "0.68rem";
                t.style.color = "hsl(var(--muted-foreground))";
                t.style.marginTop = "0.35rem";
                t.textContent = entry.tags.map((x) => `#${x}`).join(" ");
                dom.appendChild(t);
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
      ".lw-ref": { color: "hsl(var(--primary))", textDecoration: "underline dotted hsl(var(--primary))" },
      ".lw-broken-ref": {
        color: "hsl(var(--destructive))",
        textDecoration: "underline wavy hsl(var(--destructive))",
      },
      ".lw-hover": {
        padding: "0.65rem 0.85rem",
        backgroundColor: "hsl(var(--popover) / 0.96)",
        backdropFilter: "blur(16px)",
        border: "1px solid hsl(var(--primary) / 0.35)",
        borderRadius: "0.75rem",
        color: "hsl(var(--popover-foreground))",
        maxWidth: "22rem",
        minWidth: "13rem",
        boxShadow:
          "0 16px 36px -6px rgba(0, 0, 0, 0.55), 0 0 0 1px hsl(var(--border) / 0.5)",
        fontSize: "0.8125rem",
        lineHeight: "1.45",
      },
    }),
  ];
}
