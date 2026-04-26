import { promises as fs } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

interface LensesOptions {
  json?: boolean;
}

interface LensManifestRaw {
  id?: string;
  name?: string;
  icon?: string;
  renderer?: string;
  description?: string;
  kinds?: string[];
  filter?: Record<string, unknown>;
  groupBy?: string;
  sortBy?: string;
  fields?: string[];
  editable?: boolean;
}

interface LensRecord extends LensManifestRaw {
  source: string;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readLensFiles(saga: string): Promise<LensRecord[]> {
  const dir = path.join(saga, '.loreweave', 'lenses');
  if (!(await exists(dir))) return [];
  const out: LensRecord[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!(e.name.endsWith('.yaml') || e.name.endsWith('.yml'))) continue;
    const file = path.join(dir, e.name);
    const raw = await fs.readFile(file, 'utf8');
    let data: unknown;
    try {
      data = YAML.parse(raw);
    } catch (err) {
      throw new Error(
        `invalid YAML in lens file ${file}: ${(err as Error).message}`,
      );
    }
    if (!data || typeof data !== 'object') {
      throw new Error(`lens file ${file} must contain a YAML mapping`);
    }
    const m = data as LensManifestRaw;
    if (!m.id || !/^[a-z][a-z0-9-]*$/.test(m.id)) {
      throw new Error(`lens file ${file} missing valid kebab-case id`);
    }
    if (!m.name) {
      throw new Error(`lens file ${file} missing name`);
    }
    if (!m.renderer) {
      throw new Error(`lens file ${file} missing renderer`);
    }
    const expected = path.basename(e.name, path.extname(e.name));
    if (m.id !== expected) {
      throw new Error(
        `lens id "${m.id}" does not match filename stem "${expected}" (${file})`,
      );
    }
    out.push({ ...m, source: file });
  }
  return out;
}

export async function lensesCmd(
  saga: string,
  opts: LensesOptions,
): Promise<void> {
  const list = await readLensFiles(saga);
  list.sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''));

  if (opts.json) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }

  if (list.length === 0) {
    console.log('no saga-defined lenses found.');
    return;
  }
  for (const m of list) {
    console.log(`${m.id}  ${m.name}  [${m.renderer}]`);
    if (m.description) console.log(`  ${m.description}`);
    if (m.kinds?.length) console.log(`  kinds: ${m.kinds.join(', ')}`);
    if (m.groupBy) console.log(`  groupBy: ${m.groupBy}`);
    console.log(`  source: ${m.source}`);
  }
}
