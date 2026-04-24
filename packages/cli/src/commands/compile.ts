/**
 * `lw compile` — concatenate per-scene markdown files under
 * `tomes/<tome>/story/NN-<slug>/scenes/*.md` into `chapter.md` at the
 * chapter root.
 *
 * Conventions:
 * - Scene files are any `*.md` inside a `scenes/` folder, sorted
 *   lexicographically (use numeric prefixes like `01-arrival.md` to
 *   control order).
 * - Hidden files and `_*.md` scene files are skipped (reserved for
 *   draft / archived content the writer doesn't want compiled).
 * - A `<!-- compiled: ... -->` banner is injected at the top of the
 *   generated file so it's clear the file is machine-generated.
 * - The writer can still hand-edit `chapter.md`; re-compiling overwrites
 *   it, so the recommended flow is: edit scenes, compile, commit.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

interface Opts {
  tome?: string;
  chapter?: string;
  check?: boolean;
}

const BANNER_START = '<!-- loreweave:compiled';
const BANNER_END = '-->';

export async function compileCmd(saga: string, opts: Opts): Promise<void> {
  const root = path.resolve(saga);
  const tomesDir = path.join(root, 'tomes');
  let tomeSlugs: string[];
  try {
    tomeSlugs = (await fs.readdir(tomesDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    console.error(`no tomes/ directory under ${saga}`);
    process.exit(1);
  }
  const targetTomes = opts.tome ? [opts.tome] : tomeSlugs;
  let wrote = 0;
  let wouldWrite = 0;
  for (const tome of targetTomes) {
    const storyDir = path.join(tomesDir, tome, 'story');
    let chapterDirs: string[];
    try {
      chapterDirs = (await fs.readdir(storyDir, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      continue;
    }
    for (const chapter of chapterDirs) {
      if (opts.chapter && chapter !== opts.chapter) continue;
      const scenesDir = path.join(storyDir, chapter, 'scenes');
      let scenes: string[];
      try {
        scenes = (await fs.readdir(scenesDir))
          .filter((f) => f.endsWith('.md') && !f.startsWith('_') && !f.startsWith('.'))
          .sort((a, b) => a.localeCompare(b));
      } catch {
        continue; // no scenes/ folder — writer isn't using scene mode.
      }
      if (scenes.length === 0) continue;

      const parts: string[] = [];
      for (const s of scenes) {
        const body = await fs.readFile(path.join(scenesDir, s), 'utf8');
        parts.push(body.replace(/\s+$/g, ''));
      }
      const now = new Date().toISOString();
      const banner = `${BANNER_START} from scenes/ at ${now} ${BANNER_END}`;
      const compiled = banner + '\n\n' + parts.join('\n\n') + '\n';
      const outPath = path.join(storyDir, chapter, 'chapter.md');
      if (opts.check) {
        let existing = '';
        try {
          existing = await fs.readFile(outPath, 'utf8');
        } catch {
          /* missing — would write */
        }
        if (existing.trim() !== compiled.trim()) {
          console.log(`stale: ${path.relative(root, outPath)}`);
          wouldWrite++;
        }
        continue;
      }
      await fs.writeFile(outPath, compiled, 'utf8');
      console.log(
        `compiled ${scenes.length} scene(s) -> ${path.relative(root, outPath)}`,
      );
      wrote++;
    }
  }
  if (opts.check) {
    if (wouldWrite > 0) {
      console.error(
        `${wouldWrite} chapter(s) would be rewritten; run \`lw compile\` to refresh.`,
      );
      process.exit(2);
    }
    console.log('all scene-compiled chapters up to date.');
    return;
  }
  if (wrote === 0) console.log('no scenes/ folders found — nothing compiled.');
}
