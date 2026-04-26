import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { DumpEntry } from '../../lib/lw.js';
import { entriesToOptions, filterEchoes } from './echo-filter.js';

export interface EchoOption {
  /** Canonical kind id of the target entry. */
  type: string;
  id: string;
  name: string;
  /** Optional aliases for fuzzy matching. */
  aliases?: string[];
}

interface Props {
  /**
   * Restrict the picker to one or more Kind ids. `undefined` means
   * any kind in `entries`.
   */
  kinds?: string[];
  /** Pool of available options. Caller usually maps `data.entries`. */
  entries: DumpEntry[];
  /**
   * Current selection. Each selected value is `<type>/<id>` so the
   * caller can mix kinds when no `kinds` filter is set.
   */
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

/**
 * Async-filterable autocomplete for picking entry references.
 * Selected items render as removable badges. Used for `inherits`,
 * `tags`, `appears_in`, `speaks`, and any property of `type: ref`
 * or `type: list of ref`.
 */
export function EchoPicker({
  kinds,
  entries,
  value,
  onChange,
  placeholder = 'Search entries…',
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const pool: EchoOption[] = useMemo(
    () => entriesToOptions(entries, kinds),
    [entries, kinds],
  );

  const selectedSet = useMemo(() => new Set(value), [value]);

  const matches = useMemo(
    () => filterEchoes(pool, selectedSet, query),
    [pool, query, selectedSet],
  );

  useEffect(() => {
    if (highlight >= matches.length) setHighlight(0);
  }, [matches, highlight]);

  const add = (opt: EchoOption) => {
    onChange([...value, `${opt.type}/${opt.id}`]);
    setQuery('');
    setHighlight(0);
    inputRef.current?.focus();
  };

  const remove = (key: string) => {
    onChange(value.filter((v) => v !== key));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const m = matches[highlight];
      if (m) add(m);
    } else if (e.key === 'Backspace' && !query && value.length > 0) {
      remove(value[value.length - 1]!);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <div
        className="flex flex-wrap gap-1 min-h-[2rem] border border-border rounded bg-background px-2 py-1"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((key) => {
          const [type, id] = splitKey(key);
          const opt = pool.find((o) => o.type === type && o.id === id);
          const label = opt?.name ?? id;
          return (
            <span
              key={key}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-muted/40 text-xs"
              data-testid="echo-chip"
            >
              <span className="text-muted-foreground">@{type}/</span>
              <span>{label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(key);
                }}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${key}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={query}
          placeholder={value.length === 0 ? placeholder : ''}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Defer so click on a row registers first.
            setTimeout(() => setOpen(false), 100);
          }}
          onKeyDown={onKeyDown}
          className="flex-1 min-w-[8rem] bg-transparent outline-none text-sm"
        />
      </div>

      {open && matches.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto bg-popover border border-border rounded shadow-lg text-sm"
        >
          {matches.map((m, i) => (
            <li
              key={`${m.type}/${m.id}`}
              role="option"
              aria-selected={i === highlight}
              data-testid="echo-option"
              onMouseDown={(e) => {
                e.preventDefault();
                add(m);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`px-2 py-1 cursor-pointer flex items-center gap-2 ${
                i === highlight ? 'bg-muted' : ''
              }`}
            >
              <span className="text-xs text-muted-foreground">
                @{m.type}/
              </span>
              <span className="flex-1">{m.name}</span>
              <span className="text-xs text-muted-foreground">{m.id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function splitKey(key: string): [string, string] {
  const slash = key.indexOf('/');
  if (slash < 0) return ['', key];
  return [key.slice(0, slash), key.slice(slash + 1)];
}
