import matter from 'gray-matter';
import YAML from 'yaml';
import {
  CustomKindEntryFrontmatterSchema,
  EntryFrontmatterSchema,
  TraceFrontmatterSchema,
} from './schemas.js';

const TYPE_ALIASES: Record<string, string> = {
  character: 'character',
  characters: 'character',
  location: 'location',
  locations: 'location',
  concept: 'concept',
  concepts: 'concept',
  lore: 'lore',
  lores: 'lore',
  waypoint: 'waypoint',
  waypoints: 'waypoint',
  event: 'waypoint',
  events: 'waypoint',
  term: 'term',
  terms: 'term',
  lexicon: 'term',
  glossary: 'term',
  slang: 'term',
  sigil: 'sigil',
  sigils: 'sigil',
  tag: 'sigil',
  tags: 'sigil',
};

const TRACE_KINDS = new Set(['idea', 'todo', 'remark', 'question', 'done']);
const TRACE_STATUSES = new Set(['open', 'resolved', 'archived']);
const ENTRY_STATUSES = new Set(['draft', 'canon']);
const ENTRY_VISIBILITIES = new Set(['public', 'private']);

function toForwardSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

function basenameStem(fileOrRelPath: string): string {
  const base = toForwardSlashes(fileOrRelPath).split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

function slugifyKebab(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toSnakeKey(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
}

/**
 * Strip a wrapping outer Markdown/YAML code fence (` ```markdown ... ``` `) if an
 * LLM emitted the entire document inside a fenced block.
 */
export function stripOuterCodeFence(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n');
  const trimmed = normalized.trim();
  const openMatch = trimmed.match(/^```[a-zA-Z0-9_-]*[ \t]*\n/);
  if (!openMatch) return raw;

  let inner = trimmed.slice(openMatch[0].length);
  if (/\n```[ \t]*$/.test(inner)) {
    inner = inner.replace(/\n```[ \t]*$/, '');
    return inner.trim() + '\n';
  }

  // Handle truncated LLM output that opened with ```markdown before `---` or `#`
  const head = inner.trimStart();
  if (head.startsWith('---') || head.startsWith('#') || /^[a-z_]+:/i.test(head)) {
    return inner;
  }
  return raw;
}

/**
 * Infer a canonical Loreweave entry type from the file's directory path.
 */
export function inferTypeFromPath(fileOrRelPath: string): string | undefined {
  const parts = toForwardSlashes(fileOrRelPath)
    .toLowerCase()
    .split('/')
    .filter(Boolean);
  // Walk from parent folder upward, skipping filename
  for (let i = parts.length - 2; i >= 0; i--) {
    const seg = parts[i]!;
    if (seg === 'character' || seg === 'characters') return 'character';
    if (seg === 'location' || seg === 'locations') return 'location';
    if (seg === 'concept' || seg === 'concepts') return 'concept';
    if (seg === 'lore' || seg === 'lores') return 'lore';
    if (seg === 'waypoint' || seg === 'waypoints' || seg === 'event' || seg === 'events') {
      return 'waypoint';
    }
    if (seg === 'lexicon' || seg === 'glossary' || seg === 'term' || seg === 'terms') {
      return 'term';
    }
    if (seg === 'sigil' || seg === 'sigils' || seg === 'tag' || seg === 'tags') {
      return 'sigil';
    }
  }
  return undefined;
}

function normalizeEntryType(rawType: unknown, fileOrRelPath: string): string {
  const pathType = inferTypeFromPath(fileOrRelPath);
  if (typeof rawType === 'string' && rawType.trim()) {
    const cleaned = rawType.trim().toLowerCase().replace(/^@/, '');
    const mapped = TYPE_ALIASES[cleaned];
    if (mapped) return mapped;
    // Allow valid custom-kind kebab-case type ids when authored explicitly
    if (/^[a-z][a-z0-9-]*$/.test(cleaned)) return cleaned;
  }
  return pathType ?? 'lore';
}

function normalizeIdList(val: unknown, stripPrefixes: string[] = []): string[] {
  const items: string[] = [];
  if (Array.isArray(val)) {
    for (const v of val) {
      if (typeof v === 'string') items.push(v);
    }
  } else if (typeof val === 'string') {
    for (const part of val.split(/[,;\n]/)) {
      if (part.trim()) items.push(part);
    }
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rawItem of items) {
    let s = rawItem.trim().replace(/^@/, '');
    for (const prefix of stripPrefixes) {
      if (s.toLowerCase().startsWith(prefix)) {
        s = s.slice(prefix.length);
        break;
      }
    }
    const slug = slugifyKebab(s);
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
    }
  }
  return out;
}

function normalizeStringList(val: unknown): string[] {
  const out: string[] = [];
  if (Array.isArray(val)) {
    for (const v of val) {
      if (typeof v === 'string' && v.trim()) out.push(v.trim());
    }
  } else if (typeof val === 'string' && val.trim()) {
    out.push(val.trim());
  }
  return out;
}

function unescapePathSlashes(s: string): string {
  return s.replace(/\\\//g, '/');
}

function splitFrontmatter(text: string): {
  yamlData: Record<string, unknown> | null;
  body: string;
} {
  const norm = text.replace(/\r\n/g, '\n');
  const closed = norm.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (closed) {
    try {
      const parsed = YAML.parse(closed[1]!);
      if (isPlainRecord(parsed)) {
        return {
          yamlData: parsed,
          body: norm.slice(closed[0].length),
        };
      }
    } catch {
      // Fall through: might be markdown bullets after an unclosed `---` and a later `<hr>` `---`.
    }
  }
  // Strip a lone leading `---` if an LLM forgot the closing `---`
  if (/^---\n/.test(norm)) {
    return {
      yamlData: null,
      body: norm.slice(4),
    };
  }
  return { yamlData: null, body: norm };
}

interface ExtractedMarkdownMeta {
  headingName?: string;
  fields: Record<string, unknown>;
  properties: Record<string, unknown>;
}

function extractMarkdownMetadata(body: string): ExtractedMarkdownMeta {
  const fields: Record<string, unknown> = {};
  const properties: Record<string, unknown> = {};
  let headingName: string | undefined;
  let section = '';

  const lines = body.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+?)\s*$/);
    if (h1 && !headingName) {
      headingName = h1[1]!.trim();
      continue;
    }
    const h2 = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (h2) {
      section = h2[1]!.trim().toLowerCase();
      continue;
    }

    const kv = line.match(/^\s*[-*]\s+\*\*([^*\n]+?)\*\*:?\s*(.+?)\s*$/);
    if (kv) {
      const keyRaw = kv[1]!.trim().replace(/:$/, '').toLowerCase();
      const val = unescapePathSlashes(kv[2]!.trim());
      if (keyRaw === 'type' || keyRaw === 'entry type') {
        fields.type = val;
      } else if (keyRaw === 'kind') {
        fields.kind = val;
      } else if (keyRaw === 'status') {
        fields.status = val;
      } else if (keyRaw === 'visibility') {
        fields.visibility = val;
      } else if (keyRaw === 'name' || keyRaw === 'title') {
        fields.name = val;
      } else if (keyRaw === 'id') {
        fields.id = val;
      } else if (keyRaw === 'term') {
        fields.term = val;
      } else if (keyRaw === 'definition') {
        fields.definition = val;
      } else if (keyRaw === 'language') {
        fields.language = val;
      } else if (keyRaw === 'pronunciation') {
        fields.pronunciation = val;
      } else if (keyRaw === 'slang_of' || keyRaw === 'slang of') {
        fields.slang_of = val;
      } else if (keyRaw === 'inherits') {
        const cur = Array.isArray(fields.inherits) ? (fields.inherits as string[]) : [];
        fields.inherits = [...cur, val];
      } else if (keyRaw === 'tags' || keyRaw === 'sigils') {
        const cur = Array.isArray(fields.tags) ? (fields.tags as string[]) : [];
        fields.tags = [...cur, val];
      } else if (keyRaw === 'speaks') {
        const cur = Array.isArray(fields.speaks) ? (fields.speaks as string[]) : [];
        fields.speaks = [...cur, val];
      } else if (keyRaw === 'spoken_here' || keyRaw === 'spoken here') {
        const cur = Array.isArray(fields.spoken_here) ? (fields.spoken_here as string[]) : [];
        fields.spoken_here = [...cur, val];
      } else if (keyRaw === 'appears_in' || keyRaw === 'appears in') {
        const cur = Array.isArray(fields.appears_in) ? (fields.appears_in as string[]) : [];
        fields.appears_in = [...cur, val];
      } else if (keyRaw === 'aliases') {
        const cur = Array.isArray(fields.aliases) ? (fields.aliases as string[]) : [];
        fields.aliases = [...cur, val];
      } else {
        const propKey = toSnakeKey(keyRaw);
        if (propKey) properties[propKey] = val;
      }
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (bullet && section) {
      const val = unescapePathSlashes(bullet[1]!.trim());
      if (!val) continue;
      if (section.includes('inherit')) {
        const cur = Array.isArray(fields.inherits) ? (fields.inherits as string[]) : [];
        fields.inherits = [...cur, val];
      } else if (section === 'tags' || section === 'sigils') {
        const cur = Array.isArray(fields.tags) ? (fields.tags as string[]) : [];
        fields.tags = [...cur, val];
      } else if (section.includes('appears')) {
        const cur = Array.isArray(fields.appears_in) ? (fields.appears_in as string[]) : [];
        fields.appears_in = [...cur, val];
      } else if (section.includes('alias')) {
        const cur = Array.isArray(fields.aliases) ? (fields.aliases as string[]) : [];
        fields.aliases = [...cur, val];
      } else if (section.includes('example')) {
        const cur = Array.isArray(fields.examples) ? (fields.examples as string[]) : [];
        fields.examples = [...cur, val];
      } else if (section === 'source' || section === 'sources') {
        if (typeof properties.source === 'string' && properties.source) {
          properties.source = `${properties.source}, ${val}`;
        } else {
          properties.source = val;
        }
      }
    }
  }

  return { headingName, fields, properties };
}

function cleanRecord(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (isPlainRecord(v)) {
      const cleaned = cleanRecord(v);
      if (Object.keys(cleaned).length > 0) out[k] = cleaned;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Normalize an arbitrary Markdown/YAML Codex, Lexicon, or Sigil file so it
 * contains clean, valid YAML frontmatter matching its path and filename stem.
 */
export function normalizeEntryMarkdown(
  raw: string,
  fileOrRelPath: string,
): {
  frontmatter: Record<string, unknown>;
  body: string;
  content: string;
  changed: boolean;
} {
  const unfenced = stripOuterCodeFence(raw);
  const { yamlData, body } = splitFrontmatter(unfenced);
  const stem = basenameStem(fileOrRelPath);
  const expectedId = slugifyKebab(stem) || 'entry';
  const md = extractMarkdownMetadata(body);

  const merged: Record<string, unknown> = {
    ...md.fields,
    ...(yamlData ?? {}),
  };

  const rawTypeCandidate =
    merged.type ??
    (inferTypeFromPath(fileOrRelPath) ? undefined : merged.kind);
  const type = normalizeEntryType(rawTypeCandidate, fileOrRelPath);

  const fm: Record<string, unknown> = {
    id: expectedId,
    type,
  };

  const nameRaw = merged.name ?? merged.title ?? md.headingName ?? expectedId;
  fm.name =
    typeof nameRaw === 'string' && nameRaw.trim()
      ? nameRaw.trim()
      : String(nameRaw);

  if (type === 'term') {
    const termRaw = merged.term ?? fm.name ?? expectedId;
    fm.term =
      typeof termRaw === 'string' && termRaw.trim() ? termRaw.trim() : expectedId;
    if (typeof merged.language === 'string' && merged.language.trim()) {
      fm.language = merged.language.trim();
    }
    if (typeof merged.slang_of === 'string' && merged.slang_of.trim()) {
      const slangSlug = normalizeIdList(merged.slang_of, ['sigil/', 'sigils/', 'tag/', 'tags/'])[0];
      if (slangSlug) fm.slang_of = slangSlug;
    }
    if (typeof merged.pronunciation === 'string' && merged.pronunciation.trim()) {
      fm.pronunciation = merged.pronunciation.trim();
    }
    const examples = normalizeStringList(merged.examples);
    if (examples.length > 0) fm.examples = examples;
    if (typeof merged.definition === 'string' && merged.definition.trim()) {
      fm.definition = merged.definition.trim();
    }
  }

  if (type === 'sigil') {
    if (typeof merged.kind === 'string' && merged.kind.trim()) {
      fm.kind = merged.kind.trim();
    }
    if (typeof merged.description === 'string' && merged.description.trim()) {
      fm.description = merged.description.trim();
    }
  }

  const aliases = normalizeStringList(merged.aliases);
  if (aliases.length > 0) fm.aliases = aliases;

  const tags = normalizeIdList(merged.tags, ['sigil/', 'sigils/', 'tag/', 'tags/']);
  if (tags.length > 0) fm.tags = tags;

  const inherits = normalizeIdList(merged.inherits, ['sigil/', 'sigils/', 'tag/', 'tags/']);
  if (inherits.length > 0) fm.inherits = inherits;

  const speaks = normalizeIdList(merged.speaks, ['sigil/', 'sigils/', 'tag/', 'tags/']);
  if (speaks.length > 0) fm.speaks = speaks;

  const spokenHere = normalizeIdList(merged.spoken_here, ['sigil/', 'sigils/', 'tag/', 'tags/']);
  if (spokenHere.length > 0) fm.spoken_here = spokenHere;

  const appearsIn = normalizeIdList(merged.appears_in, ['tome/', 'tomes/']);
  if (appearsIn.length > 0) fm.appears_in = appearsIn;

  const mergedProps: Record<string, unknown> = {
    ...md.properties,
    ...(isPlainRecord(merged.properties) ? merged.properties : {}),
  };
  if (typeof mergedProps.source === 'string') {
    mergedProps.source = unescapePathSlashes(mergedProps.source);
  }
  const cleanedProps = cleanRecord(mergedProps);
  if (Object.keys(cleanedProps).length > 0) fm.properties = cleanedProps;

  if (isPlainRecord(merged.overrides)) {
    const cleanedOverrides = cleanRecord(merged.overrides);
    if (Object.keys(cleanedOverrides).length > 0) fm.overrides = cleanedOverrides;
  }

  const rawStatus =
    typeof merged.status === 'string' ? merged.status.trim().toLowerCase() : undefined;
  if (rawStatus && ENTRY_STATUSES.has(rawStatus)) {
    fm.status = rawStatus;
  } else if (!yamlData) {
    fm.status = 'draft';
  }

  const rawVis =
    typeof merged.visibility === 'string'
      ? merged.visibility.trim().toLowerCase()
      : undefined;
  if (rawVis && ENTRY_VISIBILITIES.has(rawVis)) {
    fm.visibility = rawVis;
  }

  const cleanFm = cleanRecord(fm);
  const trimmedBody = body.trim() || `# ${String(cleanFm.name)}\n`;
  const yamlBlock = YAML.stringify(cleanFm, { lineWidth: 0 }).trimEnd();
  const content = `---\n${yamlBlock}\n---\n\n${trimmedBody}\n`;

  // Verify round-trip via gray-matter stays readable.
  void matter;

  return {
    frontmatter: cleanFm,
    body: trimmedBody,
    content,
    changed: content !== raw,
  };
}

/**
 * Normalize an arbitrary Trace markdown file so its YAML frontmatter satisfies
 * `TraceFrontmatterSchema`.
 */
export function normalizeTraceMarkdown(
  raw: string,
  fileOrRelPath: string,
): {
  frontmatter: Record<string, unknown>;
  body: string;
  content: string;
  changed: boolean;
} {
  const unfenced = stripOuterCodeFence(raw);
  const { yamlData, body } = splitFrontmatter(unfenced);
  const stem = basenameStem(fileOrRelPath);
  const expectedId = slugifyKebab(stem) || 'trace';
  const rawObj = yamlData ?? {};

  const kindRaw =
    typeof rawObj.kind === 'string' ? rawObj.kind.trim().toLowerCase() : 'remark';
  const kind = TRACE_KINDS.has(kindRaw) ? kindRaw : 'remark';

  const statusRaw =
    typeof rawObj.status === 'string' ? rawObj.status.trim().toLowerCase() : 'open';
  const status = TRACE_STATUSES.has(statusRaw) ? statusRaw : 'open';

  const fm: Record<string, unknown> = {
    id: expectedId,
    kind,
    status,
  };
  if (typeof rawObj.target === 'string' && rawObj.target.trim()) {
    fm.target = rawObj.target.trim();
  }
  if (typeof rawObj.author === 'string' && rawObj.author.trim()) {
    fm.author = rawObj.author.trim();
  }
  if (rawObj.created instanceof Date) {
    fm.created = rawObj.created.toISOString().slice(0, 10);
  } else if (typeof rawObj.created === 'string' && rawObj.created.trim()) {
    fm.created = rawObj.created.trim();
  }
  if (rawObj.updated instanceof Date) {
    fm.updated = rawObj.updated.toISOString().slice(0, 10);
  } else if (typeof rawObj.updated === 'string' && rawObj.updated.trim()) {
    fm.updated = rawObj.updated.trim();
  }
  const tags = normalizeIdList(rawObj.tags, ['sigil/', 'sigils/', 'tag/', 'tags/']);
  if (tags.length > 0) fm.tags = tags;

  const cleanFm = cleanRecord(fm);
  const trimmedBody = body.trim() || `# ${expectedId}\n`;
  const yamlBlock = YAML.stringify(cleanFm, { lineWidth: 0 }).trimEnd();
  const content = `---\n${yamlBlock}\n---\n\n${trimmedBody}\n`;

  return {
    frontmatter: cleanFm,
    body: trimmedBody,
    content,
    changed: content !== raw,
  };
}

/**
 * Convert leading tabs on frontmatter lines to spaces so YAML parsers don't fail.
 */
export function cleanFrontmatterTabs(raw: string): string {
  const lines = raw.split(/\r?\n/);
  let inFrontmatter = false;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (i === 0 && line.trim() === '---') {
      inFrontmatter = true;
      out.push(line);
      continue;
    }
    if (inFrontmatter && line.trim() === '---') {
      inFrontmatter = false;
      out.push(line);
      continue;
    }
    if (inFrontmatter) {
      out.push(line.replace(/^\t+/, (tabs) => '  '.repeat(tabs.length)));
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}

export interface KnownEntitySummary {
  id: string;
  name: string;
  type: string;
  aliases?: string[];
}

/**
 * Automatically scan markdown body paragraphs for mentions of known canon entities
 * and weave canonical `@type/id` or `[Display Name](@type/id)` Echoes.
 * Skips markdown headings, code blocks, URLs, and existing `@...` or `[...]` links.
 */
export function weaveEchoesInMarkdown(
  body: string,
  knownEntities: KnownEntitySummary[],
  currentEntityId?: string,
): string {
  if (!knownEntities || knownEntities.length === 0) return body;

  const entities = knownEntities
    .filter((e) => e.id !== currentEntityId)
    .sort((a, b) => b.name.length - a.name.length);

  const lines = body.split(/\r?\n/);
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    if (/^#{1,6}\s/.test(line)) continue;

    let updatedLine = line;

    for (const ent of entities) {
      const namesToMatch = [ent.name, ...(ent.aliases ?? [])].filter(
        (n): n is string => Boolean(n && n.length >= 3),
      );

      for (const name of namesToMatch) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?<![@\\[\\w])${escaped}(?![\\]\\w])`, 'g');

        if (!regex.test(updatedLine)) continue;
        regex.lastIndex = 0;

        updatedLine = updatedLine.replace(regex, (matched, offset, fullString) => {
          const before = fullString.slice(0, offset);
          const openBracket = before.lastIndexOf('[');
          const closeBracket = before.lastIndexOf(']');
          const openParen = before.lastIndexOf('(');
          const closeParen = before.lastIndexOf(')');
          if (openBracket > closeBracket) return matched;
          if (openParen > closeParen) return matched;
          if (offset > 0 && fullString[offset - 1] === '@') return matched;

          if (matched.toLowerCase() === ent.id.replace(/-/g, ' ')) {
            return `@${ent.type}/${ent.id}`;
          }
          return `[${matched}](@${ent.type}/${ent.id})`;
        });
      }
    }

    lines[i] = updatedLine;
  }

  return lines.join('\n');
}

/**
 * Detect entity category mismatches (e.g. an AI, comrade, culture, or species
 * mistakenly placed under `codex/locations/`) and auto-route to the proper folder.
 */
export function autoRouteTaxonomy(
  relPath: string,
  raw: string,
): { relPath: string; content: string; rerouted?: string } {
  let normRel = toForwardSlashes(relPath).replace(/^\/+/, '');
  const parts = normRel.split('/');
  const lastPart = parts[parts.length - 1];
  if (parts.length > 0 && lastPart && lastPart.endsWith('.md')) {
    const dot = lastPart.lastIndexOf('.');
    const stem = lastPart.slice(0, dot);
    const cleanStem = stem
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    parts[parts.length - 1] = `${cleanStem}.md`;
    normRel = parts.join('/');
  }

  const cleanedRaw = cleanFrontmatterTabs(raw);
  let parsedData: Record<string, unknown> = {};
  let body = cleanedRaw;
  try {
    const m = matter(cleanedRaw);
    parsedData = (m.data as Record<string, unknown>) ?? {};
    body = m.content;
  } catch {
    /* fallback to regex */
  }

  const rawRole = String(
    (parsedData.properties as Record<string, unknown> | undefined)?.role ??
      parsedData.role ??
      '',
  ).toLowerCase();
  const rawDesc = String(
    (parsedData.properties as Record<string, unknown> | undefined)?.description ??
      parsedData.description ??
      '',
  ).toLowerCase();
  const rawInherits = Array.isArray(parsedData.inherits)
    ? parsedData.inherits.map(String).join(' ').toLowerCase()
    : String(parsedData.inherits ?? '').toLowerCase();
  const rawType = String(parsedData.type ?? '').toLowerCase();
  const combinedContext = `${rawRole} ${rawDesc} ${rawInherits} ${body.slice(0, 1500).toLowerCase()}`;

  const stem = basenameStem(normRel);

  if (normRel.startsWith('codex/locations/')) {
    const isCharacter =
      rawType === 'character' ||
      rawInherits.includes('ai') ||
      rawInherits.includes('human') ||
      rawInherits.includes('sigil/ai') ||
      rawInherits.includes('sigil/human') ||
      /\b(ai|artificial intelligence|tether|comrade|person|being|persona|investigator|traveller|archaeologist|official)\b/.test(
        rawRole,
      ) ||
      /\b(captured ai|ship ai|former tether|comrade ais? carried in|sub-ais?)\b/.test(
        combinedContext,
      );

    const isFaction =
      rawType === 'faction' ||
      /\b(culture|cybernetic culture|society|faction|political group|organization)\b/.test(
        rawRole,
      ) ||
      /\b(all ais taken together|a network of ais|culture that embraces cybernetics|political entity)\b/.test(
        combinedContext,
      );

    const isAlienSpecies =
      rawInherits.includes('alien') ||
      /\b(alien species|intelligent alien life)\b/.test(rawRole) ||
      /\b(intelligent alien life form)\b/.test(combinedContext);

    const isVessel =
      rawInherits.includes('ship') ||
      /\b(spaceship|ship|vessel|starship)\b/.test(rawRole) ||
      /\b(is the ship)\b/.test(combinedContext);

    if (isCharacter) {
      const newPath = `codex/characters/${stem}.md`;
      const updatedContent = cleanedRaw.replace(/type:\s*['"]?location['"]?/i, 'type: character');
      return {
        relPath: newPath,
        content: updatedContent,
        rerouted: `Auto-routed from ${normRel} to ${newPath} (detected entity type: character / AI / person)`,
      };
    }
    if (isFaction) {
      const newPath = `codex/factions/${stem}.md`;
      const updatedContent = cleanedRaw.replace(/type:\s*['"]?location['"]?/i, 'type: faction');
      return {
        relPath: newPath,
        content: updatedContent,
        rerouted: `Auto-routed from ${normRel} to ${newPath} (detected entity type: faction / organization / culture)`,
      };
    }
    if (isAlienSpecies) {
      const newPath = `sigils/${stem}.md`;
      const updatedContent = cleanedRaw.replace(/type:\s*['"]?location['"]?/i, 'type: sigil');
      return {
        relPath: newPath,
        content: updatedContent,
        rerouted: `Auto-routed from ${normRel} to ${newPath} (detected entity type: species / sigil)`,
      };
    }
    if (isVessel) {
      const newPath = `codex/lore/${stem}.md`;
      const updatedContent = cleanedRaw.replace(/type:\s*['"]?location['"]?/i, 'type: lore');
      return {
        relPath: newPath,
        content: updatedContent,
        rerouted: `Auto-routed from ${normRel} to ${newPath} (detected entity type: lore / vessel)`,
      };
    }
  }

  return { relPath: normRel, content: cleanedRaw };
}

/**
 * Normalize file contents before saving or proposing edits inside a Saga.
 * Prevents wrapping code fences and ensures Codex/Lexicon/Sigil/Trace files
 * carry valid YAML frontmatter matching their path & filename.
 */
export function normalizeSagaFileContent(
  relPath: string,
  raw: string,
  options?: { knownEntities?: KnownEntitySummary[] },
): string {
  const normRel = toForwardSlashes(relPath).replace(/^\/+/, '').toLowerCase();
  if (normRel.startsWith('.loreweave/')) return raw;

  const tabCleaned = cleanFrontmatterTabs(raw);
  const hasFence = tabCleaned.trimStart().startsWith('```');
  const expectedId = slugifyKebab(basenameStem(relPath));

  if (
    normRel.endsWith('.md') &&
    !normRel.startsWith('kinds/') &&
    (normRel.startsWith('codex/') ||
      normRel.startsWith('lexicon/') ||
      normRel.startsWith('sigils/'))
  ) {
    if (!hasFence) {
      try {
        const parsed = matter(tabCleaned);
        const strict = EntryFrontmatterSchema.safeParse(parsed.data);
        const loose = strict.success
          ? null
          : CustomKindEntryFrontmatterSchema.safeParse(parsed.data);
        const fm = strict.success
          ? strict.data
          : loose?.success
            ? loose.data
            : null;
        if (fm && fm.id === expectedId && (!options?.knownEntities || options.knownEntities.length === 0)) {
          return tabCleaned;
        }
      } catch {
        /* fall through to normalize */
      }
    }
    const normalized = normalizeEntryMarkdown(tabCleaned, relPath);
    if (options?.knownEntities && options.knownEntities.length > 0) {
      const wovenBody = weaveEchoesInMarkdown(
        normalized.body,
        options.knownEntities,
        expectedId,
      );
      const yamlBlock = YAML.stringify(normalized.frontmatter, { lineWidth: 0 }).trimEnd();
      return `---\n${yamlBlock}\n---\n\n${wovenBody.trim()}\n`;
    }
    return normalized.content;
  }

  if (normRel.endsWith('.md') && normRel.startsWith('traces/')) {
    if (!hasFence) {
      try {
        const parsed = matter(tabCleaned);
        const res = TraceFrontmatterSchema.safeParse(parsed.data);
        if (res.success && res.data.id === expectedId) return tabCleaned;
      } catch {
        /* fall through to normalize */
      }
    }
    return normalizeTraceMarkdown(tabCleaned, relPath).content;
  }

  if (/\.(md|markdown|ya?ml)$/i.test(normRel)) {
    return stripOuterCodeFence(tabCleaned);
  }

  return tabCleaned;
}
