/**
 * Tool catalog exposed to the AI assistant. Every tool ultimately wraps the
 * `lw` CLI or a `safeJoin`-validated filesystem read. Mutating tools
 * (`propose_*`) never write to disk — they return a preview/diff that the
 * UI surfaces as a pending action for the writer to apply.
 */
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export interface ToolContext {
  repoRoot: string;
  cliBin: string;
  /** Default Saga root the conversation is scoped to, if any. */
  defaultSagaRoot?: string;
  safeJoin: (root: string, rel: string) => string;
}

export interface ToolResult {
  ok: boolean;
  /** Machine-readable payload. Serialized as JSON for the model. */
  data?: unknown;
  /** Human-readable error. */
  error?: string;
}

export type ToolName =
  | 'lw_validate'
  | 'lw_weave'
  | 'lw_echoes'
  | 'lw_search'
  | 'lw_dump'
  | 'lw_thread'
  | 'lw_audit'
  | 'lw_list_entries'
  | 'read_file'
  | 'propose_edit'
  | 'propose_new_entry';

// ---------- zod parameter schemas ------------------------------------------

const sagaRootSchema = z.string().min(1).describe(
  'Relative-to-repo or absolute path to the Saga root (e.g. "sagas/example-saga").',
);
const refSchema = z
  .string()
  .regex(/^[a-z]+\/[a-zA-Z0-9._\-]+$/)
  .describe('Loreweave reference like "character/aaron" or "term/grukh".');

export const toolSchemas = {
  lw_validate: z.object({ sagaRoot: sagaRootSchema }),
  lw_weave: z.object({ sagaRoot: sagaRootSchema, ref: refSchema }),
  lw_echoes: z.object({ sagaRoot: sagaRootSchema, ref: refSchema }),
  lw_search: z.object({
    sagaRoot: sagaRootSchema,
    query: z.string().min(1),
    scope: z.enum(['all', 'entries', 'prose', 'echoes']).optional(),
    type: z.string().optional(),
  }),
  lw_dump: z.object({
    sagaRoot: sagaRootSchema,
    tome: z.string().optional(),
  }),
  lw_thread: z.object({
    sagaRoot: sagaRootSchema,
    threadId: z.string().min(1),
    linear: z.boolean().optional(),
    withBranches: z.boolean().optional(),
    tome: z.string().optional(),
  }),
  lw_audit: z.object({
    sagaRoot: sagaRootSchema,
    tome: z.string().optional(),
  }),
  lw_list_entries: z.object({
    sagaRoot: sagaRootSchema,
    type: z.string().optional(),
  }),
  read_file: z.object({
    sagaRoot: sagaRootSchema,
    relPath: z
      .string()
      .min(1)
      .describe('Path relative to the Saga root (e.g. "codex/characters/aaron.md").'),
  }),
  propose_edit: z.object({
    sagaRoot: sagaRootSchema,
    relPath: z.string().min(1),
    newContent: z
      .string()
      .describe('Full file contents after the edit. Must include frontmatter.'),
    rationale: z.string().optional(),
  }),
  propose_new_entry: z.object({
    sagaRoot: sagaRootSchema,
    relPath: z
      .string()
      .min(1)
      .describe('Destination path under the Saga root, e.g. "codex/characters/new.md".'),
    content: z.string(),
    rationale: z.string().optional(),
  }),
} as const;

export interface ToolDescriptor {
  description: string;
  schema: z.ZodTypeAny;
  /** Marks tools whose results are exposed to the user as approval cards. */
  proposes?: boolean;
}

export const toolDescriptors: Record<ToolName, ToolDescriptor> = {
  lw_validate: {
    description: 'Run canon + reference validation on a Saga. Returns diagnostics.',
    schema: toolSchemas.lw_validate,
  },
  lw_weave: {
    description:
      'Return the fully-resolved (Weave) view of an entry: own + inherited Sigil properties with provenance.',
    schema: toolSchemas.lw_weave,
  },
  lw_echoes: {
    description:
      'List inbound and outbound @type/id references for an entry (inbound = who mentions it, outbound = who it mentions).',
    schema: toolSchemas.lw_echoes,
  },
  lw_search: {
    description:
      'Full-text or echo search across a Saga. scope=echoes treats the query as a type/id target.',
    schema: toolSchemas.lw_search,
  },
  lw_dump: {
    description:
      'Return the full loaded Saga as JSON (entries, tomes, chapters, traces, diagnostics). Heavy — prefer smaller tools first.',
    schema: toolSchemas.lw_dump,
  },
  lw_thread: {
    description: 'Resolve a Thread (timeline) to an ordered list of waypoints.',
    schema: toolSchemas.lw_thread,
  },
  lw_audit: {
    description:
      'Audit a Saga (or a single tome) for prose-vs-canon drift, broken echoes, slang misuse.',
    schema: toolSchemas.lw_audit,
  },
  lw_list_entries: {
    description: 'List all Codex/Lexicon/Sigil entries, optionally filtered by type.',
    schema: toolSchemas.lw_list_entries,
  },
  read_file: {
    description:
      'Read any file inside a Saga root. Use this for the raw markdown+frontmatter when weave/dump are not enough.',
    schema: toolSchemas.read_file,
  },
  propose_edit: {
    description:
      'Propose a full-file replacement. Does NOT write; returns a unified diff the writer must approve.',
    schema: toolSchemas.propose_edit,
    proposes: true,
  },
  propose_new_entry: {
    description:
      'Propose creating a new Codex/Lexicon/Sigil entry at the given path. Does NOT write; returns a preview.',
    schema: toolSchemas.propose_new_entry,
    proposes: true,
  },
};

// ---------- executor -------------------------------------------------------

function execCli(
  cliBin: string,
  cwd: string,
  args: string[],
  timeoutMs = 20_000,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn('node', [cliBin, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      stderr += `\n[lw assistant] aborted after ${timeoutMs}ms`;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + String(e), code: 1 });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
}

function tryJson<T = unknown>(s: string): T | string {
  try {
    return JSON.parse(s) as T;
  } catch {
    return s;
  }
}

function resolveSagaRoot(ctx: ToolContext, sagaRoot: string): string {
  return path.isAbsolute(sagaRoot) ? sagaRoot : path.join(ctx.repoRoot, sagaRoot);
}

function unifiedDiff(oldText: string, newText: string, file: string): string {
  // Tiny line-level diff good enough for preview cards. For a production
  // experience, swap in the `diff` package — but we ship with zero new deps
  // here and the sidecar already limits payloads.
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const out: string[] = [`--- a/${file}`, `+++ b/${file}`];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (j < b.length && !a.includes(b[j]!, i)) {
      out.push(`+${b[j]}`);
      j++;
      continue;
    }
    if (i < a.length && !b.includes(a[i]!, j)) {
      out.push(`-${a[i]}`);
      i++;
      continue;
    }
    // Fall-through: replace
    if (i < a.length) out.push(`-${a[i++]}`);
    if (j < b.length) out.push(`+${b[j++]}`);
  }
  return out.join('\n');
}

export async function runTool(
  name: ToolName,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const desc = toolDescriptors[name];
  if (!desc) return { ok: false, error: `unknown tool: ${name}` };
  const parsed = desc.schema.safeParse(rawArgs);
  if (!parsed.success) {
    return { ok: false, error: `invalid arguments: ${parsed.error.message}` };
  }
  const args = parsed.data as Record<string, unknown>;
  const sagaRootRel = (args.sagaRoot as string) ?? ctx.defaultSagaRoot;
  if (!sagaRootRel) return { ok: false, error: 'sagaRoot is required' };
  const sagaRoot = resolveSagaRoot(ctx, sagaRootRel);

  try {
    switch (name) {
      case 'lw_validate': {
        const r = await execCli(ctx.cliBin, ctx.repoRoot, [
          'validate',
          sagaRootRel,
          '--json',
        ]);
        return { ok: r.code === 0, data: tryJson(r.stdout), error: r.stderr || undefined };
      }
      case 'lw_weave': {
        const r = await execCli(ctx.cliBin, ctx.repoRoot, [
          'weave',
          sagaRootRel,
          args.ref as string,
          '--json',
        ]);
        return { ok: r.code === 0, data: tryJson(r.stdout), error: r.stderr || undefined };
      }
      case 'lw_echoes': {
        const r = await execCli(ctx.cliBin, ctx.repoRoot, [
          'echoes',
          sagaRootRel,
          args.ref as string,
          '--json',
        ]);
        return { ok: r.code === 0, data: tryJson(r.stdout), error: r.stderr || undefined };
      }
      case 'lw_search': {
        const cli = ['search', sagaRootRel, args.query as string, '--json'];
        if (args.scope) cli.push('--scope', args.scope as string);
        if (args.type) cli.push('--type', args.type as string);
        const r = await execCli(ctx.cliBin, ctx.repoRoot, cli);
        return { ok: r.code === 0, data: tryJson(r.stdout), error: r.stderr || undefined };
      }
      case 'lw_dump': {
        const cli = ['dump', sagaRootRel];
        if (args.tome) cli.push('--tome', args.tome as string);
        const r = await execCli(ctx.cliBin, ctx.repoRoot, cli, 45_000);
        return { ok: r.code === 0, data: tryJson(r.stdout), error: r.stderr || undefined };
      }
      case 'lw_thread': {
        const cli = ['thread', sagaRootRel, args.threadId as string, '--json'];
        if (args.linear) cli.push('--linear');
        if (args.withBranches) cli.push('--with-branches');
        if (args.tome) cli.push('--tome', args.tome as string);
        const r = await execCli(ctx.cliBin, ctx.repoRoot, cli);
        return { ok: r.code === 0, data: tryJson(r.stdout), error: r.stderr || undefined };
      }
      case 'lw_audit': {
        const cli = ['audit', sagaRootRel, '--json'];
        if (args.tome) cli.push('--tome', args.tome as string);
        const r = await execCli(ctx.cliBin, ctx.repoRoot, cli, 30_000);
        return { ok: r.code === 0, data: tryJson(r.stdout), error: r.stderr || undefined };
      }
      case 'lw_list_entries': {
        // Cheapest route: use `dump` and project.
        const r = await execCli(ctx.cliBin, ctx.repoRoot, ['dump', sagaRootRel], 45_000);
        if (r.code !== 0) return { ok: false, error: r.stderr };
        const parsed = tryJson<{ entries: Array<{ type: string; id: string; name: string }> }>(
          r.stdout,
        );
        if (typeof parsed === 'string') {
          return { ok: false, error: 'dump returned non-JSON' };
        }
        const typeFilter = args.type as string | undefined;
        const rows = parsed.entries
          .filter((e) => !typeFilter || e.type === typeFilter)
          .map((e) => ({ type: e.type, id: e.id, name: e.name }));
        return { ok: true, data: rows };
      }
      case 'read_file': {
        const abs = ctx.safeJoin(sagaRoot, args.relPath as string);
        const content = await fs.readFile(abs, 'utf8');
        return { ok: true, data: { relPath: args.relPath, content } };
      }
      case 'propose_edit': {
        const rel = args.relPath as string;
        const abs = ctx.safeJoin(sagaRoot, rel);
        let original = '';
        try {
          original = await fs.readFile(abs, 'utf8');
        } catch {
          original = '';
        }
        const next = args.newContent as string;
        return {
          ok: true,
          data: {
            kind: 'edit',
            sagaRoot: sagaRootRel,
            relPath: rel,
            original,
            next,
            diff: unifiedDiff(original, next, rel),
            rationale: (args.rationale as string | undefined) ?? null,
          },
        };
      }
      case 'propose_new_entry': {
        const rel = args.relPath as string;
        const abs = ctx.safeJoin(sagaRoot, rel);
        let exists = false;
        try {
          await fs.access(abs);
          exists = true;
        } catch {
          exists = false;
        }
        return {
          ok: true,
          data: {
            kind: 'new',
            sagaRoot: sagaRootRel,
            relPath: rel,
            content: args.content as string,
            exists,
            rationale: (args.rationale as string | undefined) ?? null,
          },
        };
      }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  return { ok: false, error: 'unhandled tool' };
}
