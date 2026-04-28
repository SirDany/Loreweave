import { loadSaga, type ResolvedKind } from '@loreweave/core';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

interface NewOptions {
  name?: string;
  visibility?: 'public' | 'private';
  status?: 'draft' | 'canon';
  /** Comma-separated tag list. */
  tags?: string;
  /** Print frontmatter to stdout instead of writing a file. */
  dryRun?: boolean;
  /** Overwrite an existing file with the same id. */
  force?: boolean;
}

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

function defaultForField(type: string, def: unknown): unknown {
  if (def !== undefined) return def;
  switch (type) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'list':
      return [];
    default:
      return null;
  }
}

function findKind(kinds: ResolvedKind[], probe: string): ResolvedKind | undefined {
  return kinds.find(
    (k) => k.id === probe || k.echoPrefix === probe || k.aliases.includes(probe),
  );
}

export async function newCmd(
  sagaPath: string,
  kindArg: string,
  idArg: string,
  opts: NewOptions,
): Promise<void> {
  if (!ID_RE.test(idArg)) {
    console.error(`error: id must be kebab-case (got "${idArg}")`);
    process.exitCode = 1;
    return;
  }

  const saga = await loadSaga(sagaPath);
  const kindList = saga.kinds ? Array.from(saga.kinds.byId.values()) : [];
  const kind = findKind(kindList, kindArg);
  if (!kind) {
    console.error(
      `error: unknown kind "${kindArg}". Run \`lw kinds ${sagaPath}\` to see available kinds.`,
    );
    process.exitCode = 1;
    return;
  }

  const fm: Record<string, unknown> = {
    id: idArg,
    type: kind.echoPrefix,
  };
  if (opts.name) fm.name = opts.name;
  if (opts.status) fm.status = opts.status;
  if (opts.visibility) fm.visibility = opts.visibility;
  if (opts.tags) {
    const tags = opts.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length > 0) fm.tags = tags;
  }
  // Seed required + defaulted properties from the kind catalog.
  const props: Record<string, unknown> = {};
  for (const [propName, field] of Object.entries(kind.properties)) {
    if (field.required || field.default !== undefined) {
      props[propName] = defaultForField(field.type, field.default);
    }
  }
  if (Object.keys(props).length > 0) fm.properties = props;

  const yaml = YAML.stringify(fm).trimEnd();
  const namePart = opts.name ? `# ${opts.name}\n\n` : `# ${idArg}\n\n`;
  const body = `---\n${yaml}\n---\n\n${namePart}TODO: write me.\n`;

  if (opts.dryRun) {
    process.stdout.write(body);
    return;
  }

  const folder = path.resolve(sagaPath, kind.storage);
  await fs.mkdir(folder, { recursive: true });
  const file = path.join(folder, `${idArg}.md`);
  if (!opts.force) {
    try {
      await fs.access(file);
      console.error(`error: ${file} already exists (use --force to overwrite)`);
      process.exitCode = 1;
      return;
    } catch {
      // ENOENT means we're good to create it.
    }
  }
  await fs.writeFile(file, body, 'utf8');
  console.log(`created ${path.relative(process.cwd(), file)}`);
}
