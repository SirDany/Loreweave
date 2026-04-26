/**
 * Saga-level constraints. Writers can drop markdown files into
 * `<saga>/.loreweave/rules/*.md` to express agent-wide instructions:
 * voice rules ("never use profanity"), worldbuilding constraints
 * ("characters always have an aversion attribute"), formatting
 * preferences, etc. Every rules file is concatenated into a single
 * "House rules" block that the chat system prompt prepends to the
 * agent persona on every turn.
 *
 * Loader is async + safe: missing directory returns an empty result;
 * malformed entries are skipped. The sidecar refuses to follow
 * symlinks out of the saga via the regular `safeJoin` guard.
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface SagaRulesResult {
  /** Raw markdown to splice into the system prompt; empty when no rules. */
  text: string;
  /** Source files relative to the saga root, for diagnostics + UI listing. */
  files: string[];
}

const RULES_DIR = '.loreweave/rules';

export async function loadSagaRules(sagaRoot: string): Promise<SagaRulesResult> {
  const dir = path.join(sagaRoot, RULES_DIR);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return { text: '', files: [] };
  }
  const mdFiles = entries
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .sort((a, b) => a.localeCompare(b));
  const parts: string[] = [];
  const files: string[] = [];
  for (const f of mdFiles) {
    try {
      const content = (await fs.readFile(path.join(dir, f), 'utf8')).trim();
      if (!content) continue;
      parts.push(content);
      files.push(`${RULES_DIR}/${f}`);
    } catch {
      // Skip unreadable rule file silently — the writer can fix it on disk.
    }
  }
  if (parts.length === 0) return { text: '', files };
  const text = [
    '## House rules',
    '',
    'The writer has set the following Saga-wide constraints. Treat them as binding instructions and prefer them over your own defaults whenever they conflict:',
    '',
    parts.join('\n\n---\n\n'),
  ].join('\n');
  return { text, files };
}
