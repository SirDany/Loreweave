import { useEffect, useMemo, useState } from "react";
import {
  exportPlan,
  runExport,
  type DumpPayload,
  type ExportFormat,
  type SagaZipPlan,
} from "../lib/lw.js";

interface Props {
  sagaPath: string;
  data: DumpPayload;
  onClose: () => void;
}

interface FormatDef {
  id: ExportFormat;
  label: string;
  ext: string;
  needsTome: boolean;
  needsChapter: boolean;
  needsPandoc: boolean;
  detail: string;
}

const FORMATS: FormatDef[] = [
  {
    id: "saga",
    label: "Saga zip",
    ext: "zip",
    needsTome: false,
    needsChapter: false,
    needsPandoc: false,
    detail: "Full saga as a portable .zip — share with collaborators or archive.",
  },
  {
    id: "saga-json",
    label: "Saga JSON",
    ext: "json",
    needsTome: false,
    needsChapter: false,
    needsPandoc: false,
    detail: "Entire loaded saga as a single JSON document — for tooling.",
  },
  {
    id: "tome-md",
    label: "Tome → Markdown",
    ext: "md",
    needsTome: true,
    needsChapter: false,
    needsPandoc: false,
    detail: "Concatenated chapters with @echoes resolved to display names.",
  },
  {
    id: "tome-html",
    label: "Tome → HTML",
    ext: "html",
    needsTome: true,
    needsChapter: false,
    needsPandoc: false,
    detail: "Self-contained HTML document with simple typography.",
  },
  {
    id: "tome-pdf",
    label: "Tome → PDF",
    ext: "pdf",
    needsTome: true,
    needsChapter: false,
    needsPandoc: true,
    detail: "Pandoc + xelatex. Requires pandoc on PATH.",
  },
  {
    id: "tome-docx",
    label: "Tome → DOCX",
    ext: "docx",
    needsTome: true,
    needsChapter: false,
    needsPandoc: true,
    detail: "Pandoc DOCX for editing in Word / LibreOffice.",
  },
  {
    id: "tome-epub",
    label: "Tome → EPUB",
    ext: "epub",
    needsTome: true,
    needsChapter: false,
    needsPandoc: true,
    detail: "Pandoc EPUB for ebook readers.",
  },
  {
    id: "chapter-md",
    label: "Chapter → Markdown",
    ext: "md",
    needsTome: true,
    needsChapter: true,
    needsPandoc: false,
    detail: "Single chapter with @echoes resolved.",
  },
  {
    id: "codex-md",
    label: "Codex (world bible) → Markdown",
    ext: "md",
    needsTome: false,
    needsChapter: false,
    needsPandoc: false,
    detail: "Every codex/lexicon/sigil entry, grouped by type, cross-linked.",
  },
  {
    id: "codex-html",
    label: "Codex (world bible) → HTML",
    ext: "html",
    needsTome: false,
    needsChapter: false,
    needsPandoc: false,
    detail: "Same as above, browsable HTML.",
  },
  {
    id: "slang-md",
    label: "Slang cheat-sheet → Markdown",
    ext: "md",
    needsTome: false,
    needsChapter: false,
    needsPandoc: false,
    detail:
      "Lexicon grouped by language → slang-group, with definitions, pronunciations, and who speaks each group.",
  },
];

export function ExportDialog({ sagaPath, data, onClose }: Props) {
  const [format, setFormat] = useState<ExportFormat>("saga");
  const [tome, setTome] = useState<string>(data.tomes[0]?.id ?? "");
  const [chapter, setChapter] = useState<string>("");
  const [out, setOut] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [plan, setPlan] = useState<SagaZipPlan | null>(null);

  const def = useMemo(() => FORMATS.find((f) => f.id === format)!, [format]);

  const tomeObj = useMemo(
    () => data.tomes.find((t) => t.id === tome) ?? null,
    [data.tomes, tome],
  );

  // Default the output filename whenever inputs change.
  useEffect(() => {
    const base = sagaPath.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "saga";
    const tomeBit = def.needsTome && tome ? `-${tome}` : "";
    const chapBit = def.needsChapter && chapter ? `-${chapter}` : "";
    const codexBit = def.id.startsWith("codex") ? "-codex" : def.id === "slang-md" ? "-slang" : "";
    setOut(`${base}${tomeBit}${chapBit}${codexBit}.${def.ext}`);
  }, [sagaPath, def, tome, chapter]);

  // Fetch the saga zip plan when "saga" is selected.
  useEffect(() => {
    if (format !== "saga") {
      setPlan(null);
      return;
    }
    let cancelled = false;
    exportPlan(sagaPath)
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch((e) => {
        if (!cancelled) setErr((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [format, sagaPath]);

  // Reset chapter when tome changes.
  useEffect(() => {
    if (!def.needsChapter) return;
    setChapter(tomeObj?.chapters[0]?.slug ?? "");
  }, [tomeObj, def.needsChapter]);

  const canRun =
    !busy &&
    !!out.trim() &&
    (!def.needsTome || !!tome) &&
    (!def.needsChapter || !!chapter);

  const doRun = async () => {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const stdout = await runExport({
        saga: sagaPath,
        format,
        out: out.trim(),
        tome: def.needsTome ? tome : undefined,
        chapter: def.needsChapter ? chapter : undefined,
      });
      setInfo(stdout || `wrote ${out}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-card border border-border rounded-lg shadow-2xl">
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-base text-foreground">Export</div>
            <div className="text-xs text-muted-foreground">{sagaPath}</div>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            esc
          </button>
        </header>

        <div className="p-5 space-y-4 text-sm">
          <label className="block text-xs">
            <span className="text-muted-foreground">format</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              className="mt-1 w-full bg-background border border-border rounded px-2 py-1 text-sm"
            >
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <div className="mt-1 text-muted-foreground">
              {def.detail}
              {def.needsPandoc && (
                <span className="text-amber-300"> · requires pandoc on PATH</span>
              )}
            </div>
          </label>

          {def.needsTome && (
            <label className="block text-xs">
              <span className="text-muted-foreground">tome</span>
              <select
                value={tome}
                onChange={(e) => setTome(e.target.value)}
                className="mt-1 w-full bg-background border border-border rounded px-2 py-1 text-sm"
              >
                {data.tomes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.id})
                  </option>
                ))}
              </select>
            </label>
          )}

          {def.needsChapter && tomeObj && (
            <label className="block text-xs">
              <span className="text-muted-foreground">chapter</span>
              <select
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                className="mt-1 w-full bg-background border border-border rounded px-2 py-1 text-sm"
              >
                {tomeObj.chapters.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.title} ({c.slug})
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-xs">
            <span className="text-muted-foreground">output path</span>
            <input
              value={out}
              onChange={(e) => setOut(e.target.value)}
              className="mt-1 w-full bg-background border border-border rounded px-2 py-1 font-mono text-xs"
              placeholder={`${def.ext} file path`}
            />
            <div className="mt-1 text-muted-foreground">
              Relative paths are resolved against the working directory the CLI
              runs in. Use an absolute path to put the file anywhere.
            </div>
          </label>

          {format === "saga" && plan && (
            <div className="border border-border rounded p-3 bg-background text-xs">
              <div className="text-muted-foreground mb-1">
                Will include <span className="text-foreground">{plan.totalFiles}</span> files
                ({(plan.totalBytes / 1024).toFixed(1)} KB).
              </div>
              <ul className="max-h-32 overflow-auto font-mono text-[11px] text-muted-foreground">
                {plan.files.slice(0, 30).map((f) => (
                  <li key={f.relPath}>
                    <span className="text-muted-foreground/70">
                      {String(f.size).padStart(6)}
                    </span>{" "}
                    {f.relPath}
                  </li>
                ))}
                {plan.files.length > 30 && (
                  <li className="text-muted-foreground/70">
                    … and {plan.files.length - 30} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {err && (
            <div className="text-rose-400 text-xs whitespace-pre-wrap">{err}</div>
          )}
          {info && (
            <div className="text-emerald-300 text-xs whitespace-pre-wrap">{info}</div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded border border-border text-foreground/90 hover:bg-muted text-xs"
          >
            Close
          </button>
          <button
            onClick={() => void doRun()}
            disabled={!canRun}
            className="px-3 py-1 rounded border border-primary bg-primary/20 text-primary-foreground hover:bg-primary/30 disabled:opacity-40 text-xs"
          >
            {busy ? "Exporting…" : "Export"}
          </button>
        </footer>
      </div>
    </div>
  );
}
