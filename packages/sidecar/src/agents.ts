/**
 * Loads the Copilot agent definitions from .github/agents/*.agent.md so the
 * web assistant can offer the same personalities the VS Code Copilot chat
 * does. Each agent file is a markdown doc with YAML frontmatter:
 *
 *     ---
 *     description: "Use when ..."
 *     tools: [read, search, edit]
 *     ---
 *     # Muse — the Ideator
 *     You are Muse...
 *
 * Frontmatter becomes metadata (`description`, `tools`) and the rest of the
 * file becomes the system prompt. File name (minus `.agent.md`) is the agent
 * `id` (e.g. `muse`).
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
  const name = headingMatch ? headingMatch[1]!.replace(/\s*[—–-].*$/, '').trim() : id;
  return {
    id,
    name: name || id,
    description: typeof frontmatter.description === 'string'
      ? frontmatter.description
      : '',
    tools: Array.isArray(frontmatter.tools)
      ? (frontmatter.tools as unknown[]).filter((t): t is string => typeof t === 'string')
      : [],
    systemPrompt: body.trim(),
  };
}

/**
 * Loads every agent under `<repoRoot>/.github/agents/*.agent.md` plus, when
 * available, the repository's `copilot-instructions.md` as a shared preamble
 * used by every chat turn.
 */
export async function loadAgents(repoRoot: string): Promise<{
  agents: AgentDescriptor[];
  preamble: string;
}> {
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
  const agents: AgentDescriptor[] = [];
  for (const file of entries) {
    if (!file.endsWith('.agent.md')) continue;
    const id = file.replace(/\.agent\.md$/, '');
    const text = await fs.readFile(path.join(agentsDir, file), 'utf8');
    agents.push(parseAgent(id, text));
  }
  agents.sort((a, b) => a.id.localeCompare(b.id));
  return { agents, preamble };
}
