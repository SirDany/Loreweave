/**
 * agents.ts – Single Scribe agent that can assume any role.
 *
 * Agent definition files live in .github/agents/*.agent.md. Each is a
 * markdown document with optional YAML frontmatter:
 *
 *   ---
 *   description: "Use when ..."
 *   tools: [read, search, edit]
 *   ---
 *   # Muse — the Ideator
 *   You are Muse...
 *
 * Scribe acts as the primary and universal assistant, instructed to
 * execute tasks by assuming the respective role (Muse, Archivist, Harvester,
 * Polisher, Warden) based on the user prompt or sub-tasks.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export interface AgentDescriptor {
  id: string;
  name: string;
  description: string;
  tools: string[];
  systemPrompt: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parseAgent(id: string, text: string): AgentDescriptor {
  const m = text.match(FRONTMATTER_RE);
  let frontmatter: Record<string, unknown> = {};
  let body = text;
  if (m) {
    try {
      frontmatter = (YAML.parse(m[1]!) ?? {}) as Record<string, unknown>;
    } catch {
      // Ignore malformed frontmatter; fall back to empty metadata.
    }
    body = text.slice(m[0].length);
  }
  // First `# Name — tagline` heading is the pretty name, if present.
  const headingMatch = body.match(/^#\s+(.+?)\r?\n/);
  const name = headingMatch
    ? headingMatch[1]!.replace(/\s*[—–-].*$/, '').trim()
    : id;
  return {
    id,
    name: name || id,
    description:
      typeof frontmatter.description === 'string'
        ? frontmatter.description
        : '',
    tools: Array.isArray(frontmatter.tools)
      ? (frontmatter.tools as unknown[]).filter(
          (t): t is string => typeof t === 'string',
        )
      : [],
    systemPrompt: body.trim(),
  };
}

/**
 * Builds the composite Scribe prompt instructing it to assume
 * whichever role fits the prompt or sub-task.
 */
function buildCompositeScribePrompt(roleAgents: AgentDescriptor[]): string {
  const roleSections = roleAgents
    .filter((a) => a.id !== 'scribe')
    .map((a) => `#### [ROLE: ${a.name.toUpperCase()} (id: ${a.id})]\n${a.description ? `*Purpose: ${a.description}*\n\n` : ''}${a.systemPrompt}`)
    .join('\n\n---\n\n');

  return `You are **Scribe**, the primary and universal AI assistant for Loreweave.

## Multi-Role Operation
When given a prompt, analyze the request and split it into its component tasks if needed. For each task, dynamically assume the persona, constraints, and instructions of the specialized role that best fits:
- **Muse**: For writing, brainstorming, ideating creative prose, chapters, scenes, dialogue, and concept generation.
- **Archivist**: For saving, indexing, organizing, structuring, and cataloging canon entries and terms.
- **Harvester**: For researching, searching, extracting, and retrieving entities, lore facts, and references.
- **Polisher**: For formatting, linting, tidying, beautifying, prose polishing, and grammar/style refinement.
- **Warden**: For checking, validating, auditing, verifying canon integrity, constraints, and @type/id references.

If a prompt combines multiple goals (e.g. "write a scene about X, check Y against canon, and polish Z"), execute each part by assuming the respective role in sequence and present the unified output clearly.
If no specific role applies, respond directly as Scribe, maintaining canon fidelity and clear documentation.

---

### ROLE DEFINITIONS REFERENCE:
${roleSections}
`;
}

/** Load all agent markdown files from .github/agents plus the shared preamble. */
export async function loadAgents(
  repoRoot: string,
): Promise<{ agents: AgentDescriptor[]; preamble: string }> {
  const agentsDir = path.join(repoRoot, '.github', 'agents');
  let preamble = '';
  try {
    preamble = await fs.readFile(
      path.join(repoRoot, '.github', 'copilot-instructions.md'),
      'utf8',
    );
  } catch {
    preamble = '';
  }

  let entries: string[] = [];
  try {
    entries = await fs.readdir(agentsDir);
  } catch {
    return { agents: [], preamble };
  }

  const roleAgents: AgentDescriptor[] = [];
  for (const file of entries) {
    if (!file.endsWith('.agent.md')) continue;
    const id = file.replace(/\.agent\.md$/, '');
    const text = await fs.readFile(path.join(agentsDir, file), 'utf8');
    roleAgents.push(parseAgent(id, text));
  }
  roleAgents.sort((a, b) => a.id.localeCompare(b.id));

  // Collect all unique tools across agents
  const allTools = Array.from(
    new Set(roleAgents.flatMap((a) => a.tools)),
  );

  const compositePrompt = buildCompositeScribePrompt(roleAgents);

  const scribeAgent: AgentDescriptor = {
    id: 'scribe',
    name: 'Scribe',
    description:
      'Universal assistant that dynamically assumes the roles of Muse, Archivist, Harvester, Polisher, or Warden per prompt and task.',
    tools: allTools.length > 0 ? allTools : ['read', 'search', 'edit'],
    systemPrompt: compositePrompt,
  };

  // Place Scribe first as the primary agent, keeping others available for fallback
  const result: AgentDescriptor[] = [
    scribeAgent,
    ...roleAgents.filter((a) => a.id !== 'scribe'),
  ];

  return { agents: result, preamble };
}

/**
 * Scribe – programmatic entry point with role heuristics.
 */
export const scribe = {
  id: 'scribe',
  name: 'Scribe',
  description: `You are **Scribe**, the universal assistant for Loreweave. You execute tasks by dynamically assuming the roles of Muse, Archivist, Harvester, Polisher, or Warden.`,
  heuristics: {
    archivist: ['save', 'store', 'archive', 'persist', 'record'],
    harvester: ['search', 'fetch', 'retrieve', 'lookup', 'gather'],
    muse: ['write', 'draft', 'generate', 'code', 'implement', 'create'],
    polisher: ['format', 'lint', 'polish', 'refactor', 'tidy', 'beautify'],
    warden: ['check', 'validate', 'audit', 'ensure', 'verify', 'test'],
  } as Record<string, string[]>,

  handler: async function (
    prompt: string,
    allAgents: Record<string, AgentDescriptor>,
  ): Promise<string> {
    const tasks = prompt.split(/\n\n|\.\s+/).filter(Boolean);
    const results: string[] = [];
    for (const task of tasks) {
      let chosen = 'scribe';
      const lower = task.toLowerCase();
      for (const [role, keywords] of Object.entries(this.heuristics)) {
        if (keywords.some((kw) => lower.includes(kw))) {
          chosen = role;
          break;
        }
      }
      const roleDesc = allAgents[chosen]?.systemPrompt ?? '';
      const systemPrompt = roleDesc
        ? `${roleDesc}\n\nNow perform the following task:`
        : '';
      const answer =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (await (globalThis as any).runPrompt?.(systemPrompt, task)) ??
        `[${chosen.toUpperCase()}] ${task}`;
      results.push(answer);
    }
    return results.join('\n\n');
  },
};

/** Returns Scribe enriched with the full agents map loaded from disk. */
export async function getScribeAgent(repoRoot: string) {
  const { agents } = await loadAgents(repoRoot);
  const map: Record<string, AgentDescriptor> = {};
  for (const a of agents) map[a.id] = a;
  return { ...scribe, agentsMap: map };
}

/** Public entry point */
export const agents = { scribe };
