import type React from 'react';
import { REF_REGEX, canonicalType } from '@loreweave/core';
import type { DumpChapter, DumpPayload } from '../lib/lw.js';

interface ChapterPreviewProps {
  chapter: DumpChapter;
  data: DumpPayload;
  onJump: (loc: {
    kind: 'entry' | 'chapter';
    key: string;
    line?: number;
  }) => void;
}

/**
 * Read-only chapter render. References (`[Display](@type/id)` or `@type/id`)
 * become clickable buttons that jump into the corresponding Codex entry; broken
 * references render in a rose tint.
 */
export function ChapterPreview({ chapter, data, onJump }: ChapterPreviewProps) {
  const entryMap = new Map(data.entries.map((e) => [`${e.type}/${e.id}`, e]));

  function renderInline(line: string): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    let last = 0;
    let idx = 0;
    const re = new RegExp(REF_REGEX.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const start = m.index;
      if (start > last) out.push(line.slice(last, start));
      const type = m[1] !== undefined ? canonicalType(m[2]!) : canonicalType(m[5]!);
      const id = m[1] !== undefined ? m[3]! : m[6]!;
      const display = m[1] !== undefined ? m[1] : m[8];
      const key = `${type}/${id}`;
      const hit = entryMap.get(key);
      if (hit) {
        const label = display && display.length > 0 ? display : hit.name;
        out.push(
          <button
            key={idx++}
            type="button"
            onClick={() => onJump({ kind: 'entry', key })}
            title={`${type}/${id}`}
            className="rounded bg-primary/15 px-1 text-primary underline-offset-2 hover:bg-primary/25 hover:underline"
          >
            {label}
          </button>,
        );
      } else {
        out.push(
          <span
            key={idx++}
            className="rounded bg-rose-500/15 px-1 text-rose-300"
          >
            {m[0]}
          </span>,
        );
      }
      last = start + m[0].length;
    }
    if (last < line.length) out.push(line.slice(last));
    return out;
  }

  const blocks = chapter.body.split(/\n\n+/).map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('# ')) {
      return (
        <h2 key={i} className="font-serif text-2xl text-foreground">
          {renderInline(trimmed.slice(2))}
        </h2>
      );
    }
    if (trimmed.startsWith('## ')) {
      return (
        <h3 key={i} className="font-serif text-xl text-foreground">
          {renderInline(trimmed.slice(3))}
        </h3>
      );
    }
    return (
      <p key={i} className="leading-relaxed">
        {trimmed.split('\n').map((line, j, arr) => (
          <span key={j}>
            {renderInline(line)}
            {j < arr.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });

  return (
    <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden break-words scrollbar-ember bg-parchment-grain">
      <article className="mx-auto max-w-2xl px-10 py-12 font-serif text-[1.05rem] text-foreground/90 animate-fade-in">
        <header className="mb-8">
          <div className="label-rune">Chapter</div>
          <h1 className="mt-1 font-serif text-4xl">{chapter.title}</h1>
        </header>
        <div className="space-y-5">{blocks}</div>
      </article>
    </div>
  );
}
