import type { EditorView } from '@codemirror/view';
import { EditorSelection, type ChangeSpec } from '@codemirror/state';

/**
 * Small set of markdown formatting commands that operate on the current
 * selection (or current line, for block-level commands). Each command
 * returns `true` if it handled the event — used as a CodeMirror keymap
 * return value so unhandled shortcuts fall through to the default keymap.
 */

// ---------- inline wrapping ------------------------------------------------

/**
 * Toggle a symmetric inline wrapper (bold, italic, strikethrough, inline
 * code) around the current selection. If the selection is empty, inserts
 * both markers and places the cursor between them. If the selection is
 * already wrapped, unwraps it.
 */
export function toggleInlineWrap(view: EditorView, marker: string): boolean {
  if (view.state.readOnly) return false;
  const changes: ChangeSpec[] = [];
  const newSelections: Array<{ anchor: number; head: number }> = [];
  let offset = 0;

  for (const range of view.state.selection.ranges) {
    const from = range.from + offset;
    const to = range.to + offset;
    const doc = view.state.doc;
    const before = doc.sliceString(Math.max(0, from - marker.length), from);
    const after = doc.sliceString(to, to + marker.length);
    const inner = doc.sliceString(from, to);

    if (range.empty) {
      // Insert paired markers and place cursor between them.
      const insert = marker + marker;
      changes.push({ from, to, insert });
      const caret = from + marker.length;
      newSelections.push({ anchor: caret, head: caret });
      offset += insert.length;
      continue;
    }

    if (before === marker && after === marker) {
      // Already wrapped — strip surrounding markers.
      changes.push({
        from: from - marker.length,
        to: to + marker.length,
        insert: inner,
      });
      const start = from - marker.length;
      newSelections.push({ anchor: start, head: start + inner.length });
      offset -= marker.length * 2;
    } else if (inner.startsWith(marker) && inner.endsWith(marker) && inner.length >= marker.length * 2) {
      // Selection includes the markers — strip them.
      const stripped = inner.slice(marker.length, inner.length - marker.length);
      changes.push({ from, to, insert: stripped });
      newSelections.push({ anchor: from, head: from + stripped.length });
      offset -= marker.length * 2;
    } else {
      // Wrap.
      const insert = marker + inner + marker;
      changes.push({ from, to, insert });
      newSelections.push({
        anchor: from + marker.length,
        head: from + marker.length + inner.length,
      });
      offset += marker.length * 2;
    }
  }

  view.dispatch({
    changes,
    selection: EditorSelection.create(
      newSelections.map((s) => EditorSelection.range(s.anchor, s.head)),
    ),
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

// ---------- line-prefix commands ------------------------------------------

/**
 * Toggle a line-prefix (headings, blockquote, list markers) for every line
 * touched by the selection. If a line already has the prefix it's removed;
 * if it has a *different* prefix from `alternates`, the prefix is swapped;
 * otherwise the prefix is added.
 */
export function toggleLinePrefix(
  view: EditorView,
  prefix: string,
  alternates: RegExp[] = [],
): boolean {
  if (view.state.readOnly) return false;
  const doc = view.state.doc;
  const changes: ChangeSpec[] = [];
  const seen = new Set<number>();

  for (const range of view.state.selection.ranges) {
    const startLine = doc.lineAt(range.from);
    const endLine = doc.lineAt(range.to);
    for (let n = startLine.number; n <= endLine.number; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const line = doc.line(n);
      const text = line.text;

      if (text.startsWith(prefix)) {
        changes.push({
          from: line.from,
          to: line.from + prefix.length,
          insert: '',
        });
        continue;
      }
      let swapped = false;
      for (const re of alternates) {
        const m = text.match(re);
        if (m) {
          changes.push({
            from: line.from,
            to: line.from + m[0].length,
            insert: prefix,
          });
          swapped = true;
          break;
        }
      }
      if (!swapped) {
        changes.push({ from: line.from, to: line.from, insert: prefix });
      }
    }
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes, scrollIntoView: true });
  view.focus();
  return true;
}

// ---------- ordered list ---------------------------------------------------

export function toggleOrderedList(view: EditorView): boolean {
  if (view.state.readOnly) return false;
  const doc = view.state.doc;
  const changes: ChangeSpec[] = [];
  const seen = new Set<number>();

  // If every selected line already looks like `N. `, strip it. Otherwise,
  // number them starting at 1 within each contiguous selection range.
  for (const range of view.state.selection.ranges) {
    const startLine = doc.lineAt(range.from);
    const endLine = doc.lineAt(range.to);
    let allOrdered = true;
    for (let n = startLine.number; n <= endLine.number; n++) {
      if (!/^\d+\.\s/.test(doc.line(n).text)) {
        allOrdered = false;
        break;
      }
    }
    let counter = 1;
    for (let n = startLine.number; n <= endLine.number; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const line = doc.line(n);
      if (allOrdered) {
        const m = line.text.match(/^\d+\.\s/);
        if (m) {
          changes.push({
            from: line.from,
            to: line.from + m[0].length,
            insert: '',
          });
        }
      } else {
        const bulletMatch = line.text.match(/^[-*]\s/);
        if (bulletMatch) {
          changes.push({
            from: line.from,
            to: line.from + bulletMatch[0].length,
            insert: `${counter}. `,
          });
        } else {
          changes.push({
            from: line.from,
            to: line.from,
            insert: `${counter}. `,
          });
        }
        counter += 1;
      }
    }
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes, scrollIntoView: true });
  view.focus();
  return true;
}

// ---------- link ----------------------------------------------------------

/**
 * Wrap the selection in a markdown link. When the selection is empty,
 * inserts `[text](url)` and places the cursor on `url`. When non-empty,
 * uses the selection as the link text and places the cursor on `url`.
 * If the selection looks like a URL, swaps — uses it as the URL and
 * places the cursor on `text`.
 */
export function insertLink(view: EditorView): boolean {
  if (view.state.readOnly) return false;
  const range = view.state.selection.main;
  const selected = view.state.sliceDoc(range.from, range.to);
  const looksLikeUrl = /^(https?:\/\/|www\.|\/|\.)/i.test(selected.trim());

  let insert: string;
  let cursorStart: number;
  let cursorEnd: number;

  if (range.empty) {
    insert = '[text](url)';
    cursorStart = range.from + 7; // after `[text](`
    cursorEnd = cursorStart + 3; // select `url`
  } else if (looksLikeUrl) {
    insert = `[text](${selected})`;
    cursorStart = range.from + 1;
    cursorEnd = cursorStart + 4; // select `text`
  } else {
    insert = `[${selected}](url)`;
    cursorStart = range.from + selected.length + 3;
    cursorEnd = cursorStart + 3;
  }

  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.range(cursorStart, cursorEnd),
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

// ---------- fenced code block ---------------------------------------------

export function insertCodeBlock(view: EditorView): boolean {
  if (view.state.readOnly) return false;
  const range = view.state.selection.main;
  const selected = view.state.sliceDoc(range.from, range.to);
  const fence = '```';
  const line = view.state.doc.lineAt(range.from);
  const prefix = line.from === range.from ? '' : '\n';

  if (selected) {
    const insert = `${prefix}${fence}\n${selected}\n${fence}\n`;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      selection: EditorSelection.cursor(range.from + prefix.length + fence.length + 1),
      scrollIntoView: true,
    });
  } else {
    const insert = `${prefix}${fence}\n\n${fence}\n`;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      selection: EditorSelection.cursor(range.from + prefix.length + fence.length + 1),
      scrollIntoView: true,
    });
  }
  view.focus();
  return true;
}

// ---------- horizontal rule -----------------------------------------------

export function insertHorizontalRule(view: EditorView): boolean {
  if (view.state.readOnly) return false;
  const range = view.state.selection.main;
  const line = view.state.doc.lineAt(range.from);
  const atLineStart = line.from === range.from;
  const insert = `${atLineStart ? '' : '\n'}\n---\n\n`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.cursor(range.from + insert.length),
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

// ---------- heading cycle --------------------------------------------------

/** `# ` → `## ` → `### ` → no heading → `# ` (per-line). */
export function cycleHeading(view: EditorView): boolean {
  if (view.state.readOnly) return false;
  const doc = view.state.doc;
  const changes: ChangeSpec[] = [];
  const seen = new Set<number>();

  for (const range of view.state.selection.ranges) {
    const startLine = doc.lineAt(range.from);
    const endLine = doc.lineAt(range.to);
    for (let n = startLine.number; n <= endLine.number; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const line = doc.line(n);
      const m = line.text.match(/^(#{1,6})\s/);
      if (!m) {
        changes.push({ from: line.from, to: line.from, insert: '# ' });
      } else if (m[1]!.length < 3) {
        changes.push({
          from: line.from,
          to: line.from + m[0].length,
          insert: '#'.repeat(m[1]!.length + 1) + ' ',
        });
      } else {
        changes.push({
          from: line.from,
          to: line.from + m[0].length,
          insert: '',
        });
      }
    }
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes, scrollIntoView: true });
  view.focus();
  return true;
}

// ---------- keymap factory -------------------------------------------------

/**
 * Returns CodeMirror keymap entries for the markdown formatting commands.
 * Shortcuts intentionally avoid `Mod-k` (reserved for the saga-wide search
 * palette in [App.tsx](../App.tsx)).
 */
export function markdownFormattingKeymap() {
  return [
    { key: 'Mod-b', run: (v: EditorView) => toggleInlineWrap(v, '**') },
    { key: 'Mod-i', run: (v: EditorView) => toggleInlineWrap(v, '_') },
    { key: 'Mod-Shift-x', run: (v: EditorView) => toggleInlineWrap(v, '~~') },
    { key: 'Mod-e', run: (v: EditorView) => toggleInlineWrap(v, '`') },
    { key: 'Mod-Shift-h', run: cycleHeading },
    { key: 'Mod-l', run: insertLink },
    {
      key: 'Mod-Shift-8',
      run: (v: EditorView) =>
        toggleLinePrefix(v, '- ', [/^\*\s/, /^\d+\.\s/]),
    },
    { key: 'Mod-Shift-7', run: toggleOrderedList },
    {
      key: 'Mod-Shift-.',
      run: (v: EditorView) => toggleLinePrefix(v, '> '),
    },
  ];
}
