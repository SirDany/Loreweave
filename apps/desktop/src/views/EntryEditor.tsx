import { useMemo, useState } from "react";
import YAML from "yaml";
import { lwWrite } from "../lib/lw.js";
import type { DumpEntry } from "../lib/lw.js";

interface Props {
  entry: DumpEntry;
  sagaPath: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Edit the frontmatter of a Codex/Lexicon/Sigil entry. Body stays intact.
 * Common fields are exposed as form inputs; everything else is editable
 * as raw YAML so nothing is silently dropped.
 */
export function EntryEditor({ entry, sagaPath, onClose, onSaved }: Props) {
  const { common, rest } = useMemo(() => splitFrontmatter(entry.frontmatter), [entry]);

  const [name, setName] = useState(String(common.name ?? entry.name ?? ""));
  const [status, setStatus] = useState<string>(
    common.status == null ? "" : String(common.status),
  );
  const [tags, setTags] = useState<string>(listToText(common.tags));
  const [inherits, setInherits] = useState<string>(listToText(common.inherits));
  const [aliases, setAliases] = useState<string>(listToText(common.aliases));
  const [appearsIn, setAppearsIn] = useState<string>(listToText(common.appears_in));
  const [restYaml, setRestYaml] = useState<string>(
    Object.keys(rest).length ? YAML.stringify(rest).trimEnd() : "",
  );

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const next: Record<string, unknown> = {};
      // Preserve id + type up front (not user-editable here).
      next.id = entry.id;
      next.type = entry.type;
      if (name.trim()) next.name = name.trim();

      const tagList = textToList(tags);
      if (tagList.length) next.tags = tagList;
      const inhList = textToList(inherits);
      if (inhList.length) next.inherits = inhList;
      const aliasList = textToList(aliases);
      if (aliasList.length) next.aliases = aliasList;
      const appearsList = textToList(appearsIn);
      if (appearsList.length) next.appears_in = appearsList;

      if (status.trim()) next.status = status.trim();

      // Merge remaining YAML (properties, overrides, kind, speaks, ...).
      if (restYaml.trim()) {
        let parsed: unknown;
        try {
          parsed = YAML.parse(restYaml);
        } catch (e) {
          throw new Error("Invalid YAML in advanced fields: " + (e as Error).message);
        }
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (k in next) continue; // common fields win
            next[k] = v;
          }
        } else {
          throw new Error("Advanced YAML must be a mapping.");
        }
      }

      const fm = YAML.stringify(next).trimEnd();
      const body = entry.body.startsWith("\n") ? entry.body : "\n" + entry.body;
      const content = `---\n${fm}\n---${body}`;

      await lwWrite(sagaPath, entry.relPath, content);
      onSaved();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-auto bg-stone-900 border border-stone-700 rounded-lg shadow-2xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <header className="px-5 py-3 border-b border-stone-800 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-xs text-stone-500">
              {entry.type}/{entry.id} · {entry.relPath}
            </div>
            <div className="text-base text-stone-100">Edit frontmatter</div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-100 text-sm px-2"
          >
            ✕
          </button>
        </header>

        <div className="p-5 space-y-4 text-sm">
          <Field label="name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700 rounded px-2 py-1"
            />
          </Field>

          <Field label="status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700 rounded px-2 py-1"
            >
              <option value="">(unset)</option>
              <option value="draft">draft</option>
              <option value="canon">canon</option>
            </select>
          </Field>

          <Field label="tags" hint="comma or newline separated">
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700 rounded px-2 py-1"
            />
          </Field>

          <Field label="inherits" hint="sigil ids, comma or newline separated">
            <input
              value={inherits}
              onChange={(e) => setInherits(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700 rounded px-2 py-1"
            />
          </Field>

          <Field label="aliases" hint="comma or newline separated">
            <input
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700 rounded px-2 py-1"
            />
          </Field>

          <Field label="appears_in" hint="tome slugs, comma or newline separated">
            <input
              value={appearsIn}
              onChange={(e) => setAppearsIn(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700 rounded px-2 py-1"
            />
          </Field>

          <Field
            label="advanced (YAML)"
            hint="properties, overrides, kind, speaks, spoken_here, etc."
          >
            <textarea
              value={restYaml}
              onChange={(e) => setRestYaml(e.target.value)}
              rows={8}
              spellCheck={false}
              className="w-full bg-stone-950 border border-stone-700 rounded px-2 py-1 font-mono text-xs"
            />
          </Field>

          {err && (
            <div className="text-rose-400 text-xs whitespace-pre-wrap">{err}</div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-stone-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded border border-stone-700 text-stone-300 hover:bg-stone-800"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="px-3 py-1 rounded border border-amber-500 bg-amber-900/40 text-amber-100 hover:bg-amber-800/50 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs text-stone-400 mb-1">
        {label}
        {hint && <span className="text-stone-600"> · {hint}</span>}
      </div>
      {children}
    </label>
  );
}

const COMMON_KEYS = new Set([
  "id",
  "type",
  "name",
  "status",
  "tags",
  "inherits",
  "aliases",
  "appears_in",
]);

function splitFrontmatter(fm: Record<string, unknown>) {
  const common: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm ?? {})) {
    if (COMMON_KEYS.has(k)) common[k] = v;
    else rest[k] = v;
  }
  return { common, rest };
}

function listToText(v: unknown): string {
  if (!v) return "";
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
  return String(v);
}

function textToList(s: string): string[] {
  return s
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}
