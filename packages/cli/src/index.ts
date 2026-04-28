import { Command } from 'commander';
import { auditCmd } from './commands/audit.js';
import { backupListCmd } from './commands/backup-list.js';
import { backupCmd } from './commands/backup.js';
import { calendarCmd } from './commands/calendar.js';
import { compileCmd } from './commands/compile.js';
import { dumpCmd } from './commands/dump.js';
import { entryDiffCmd } from './commands/entry-diff.js';
import { exportCmd } from './commands/export.js';
import { gitCmd } from './commands/git.js';
import { importCmd } from './commands/import.js';
import { ingestCmd } from './commands/ingest.js';
import { kindsCmd } from './commands/kinds.js';
import { lensesCmd } from './commands/lenses.js';
import { listSagasCmd } from './commands/list-sagas.js';
import { migrateCmd } from './commands/migrate.js';
import { newCmd } from './commands/new.js';
import { refsCmd } from './commands/refs.js';
import { renameCmd } from './commands/rename.js';
import { resolveCmd } from './commands/resolve.js';
import { restoreCmd } from './commands/restore.js';
import { searchCmd } from './commands/search.js';
import { threadCmd } from './commands/thread.js';
import { validateCmd } from './commands/validate.js';

export async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program
    .name('lw')
    .description('Loreweave CLI — validate, resolve, query and audit a Saga.')
    .version('0.1.0');

  program
    .command('validate')
    .description('Validate a Saga: schemas, references, timelines, slang.')
    .argument('<saga>', 'path to the Saga directory')
    .option('--tome <slug>', 'limit prose-dependent checks to one Tome')
    .option('--json', 'emit JSON instead of human output')
    .action(validateCmd);

  program
    .command('resolve')
    .alias('weave')
    .description(
      'Weave an entry: merged properties + provenance (alias: resolve).'
    )
    .argument('<saga>', 'path to the Saga directory')
    .argument('<ref>', 'entry reference, e.g. "character/aaron"')
    .option('--json', 'emit JSON')
    .action(resolveCmd);

  program
    .command('refs')
    .alias('echoes')
    .description(
      'List inbound and outbound Echoes (references) for an entry (alias: echoes).'
    )
    .argument('<saga>', 'path to the Saga directory')
    .argument('<ref>', 'entry reference, e.g. "character/aaron"')
    .option('--in-tome <slug>', 'restrict inbound prose references to one Tome')
    .option('--json', 'emit JSON')
    .action(refsCmd);

  program
    .command('audit')
    .description('Run the full consistency audit (validate + slang + drift).')
    .argument('<saga>', 'path to the Saga directory')
    .option('--tome <slug>', 'restrict to one Tome')
    .option('--json', 'emit JSON')
    .action(auditCmd);

  program
    .command('thread')
    .description('Linearize a Thread (timeline).')
    .argument('<saga>', 'path to the Saga directory')
    .argument('<thread-id>', 'thread id as declared in timelines/<id>.yaml')
    .option('--linear', 'print linear order')
    .option(
      '--with-branches',
      'include parent thread waypoints up to branch point'
    )
    .option('--tome <slug>', 'apply the Tome lens')
    .option('--json', 'emit JSON')
    .action(threadCmd);

  program
    .command('calendar')
    .description('Calendar operations (parse a date).')
    .argument('<saga>', 'path to the Saga directory')
    .argument('<calendar-id>', 'calendar id')
    .argument('<op>', 'operation: parse')
    .argument('<value>', 'input value')
    .action(calendarCmd);

  program
    .command('dump')
    .description('Dump the entire loaded Saga as JSON (for UI consumption).')
    .argument('<saga>', 'path to the Saga directory')
    .option('--tome <slug>', 'scope prose-dependent checks to one Tome')
    .action(dumpCmd);

  program
    .command('export')
    .description(
      'Export a Saga as a zip, publish a Tome (md/html/pdf/docx/epub), render the codex (md/html), or extract a single chapter.'
    )
    .argument('<saga>', 'path to the Saga directory')
    .option(
      '--format <fmt>',
      'saga | saga-json | tome-md | tome-html | tome-pdf | tome-docx | tome-epub | chapter-md | codex-md | codex-html | slang-md',
      'saga'
    )
    .option('--tome <slug>', 'tome id (required for tome-* and chapter-md)')
    .option('--chapter <slug>', 'chapter slug (required for chapter-md)')
    .option(
      '--out <file>',
      'output file (defaults to <saga>[.zip|.md|.html|...])'
    )
    .option(
      '--plan',
      'for --format=saga, list files that would be included instead of writing'
    )
    .option('--json', 'with --plan, emit JSON')
    .action(exportCmd);

  program
    .command('compile')
    .description('Concatenate per-scene markdown into each chapter.md.')
    .argument('<saga>', 'path to the Saga directory')
    .option('--tome <slug>', 'only compile one tome')
    .option('--chapter <slug>', 'only compile one chapter')
    .option('--check', 'exit non-zero if any chapter.md is out of date')
    .action(compileCmd);

  program
    .command('backup')
    .description(
      'Snapshot a Saga as a timestamped zip into <saga>/.loreweave/backups/.'
    )
    .argument('<saga>', 'path to the Saga directory')
    .option(
      '--label <name>',
      'optional label appended to the snapshot filename'
    )
    .option('--out <dir>', 'override the snapshot directory')
    .option('--keep <n>', 'prune to the n most-recent snapshots', (v) =>
      parseInt(v, 10)
    )
    .option('--json', 'emit JSON')
    .action(backupCmd);

  program
    .command('backup-list')
    .description('List backup snapshots for a Saga, newest first.')
    .argument('<saga>', 'path to the Saga directory')
    .option('--dir <dir>', 'override the snapshot directory')
    .option('--json', 'emit JSON')
    .action(backupListCmd);

  program
    .command('restore')
    .description(
      'Restore a Saga from a backup zip. Dry-run by default; pass --apply to write. A pre-restore safety backup is taken automatically.'
    )
    .argument('<zip>', 'path to the snapshot zip')
    .option(
      '--saga <dir>',
      'override the target Saga directory (default: sagas/<bundle-root>)'
    )
    .option(
      '--apply',
      'actually write changes; without this flag, prints a dry-run plan'
    )
    .option(
      '--no-pre-backup',
      'skip the safety pre-restore snapshot (not recommended)'
    )
    .option('--json', 'emit JSON')
    .action(restoreCmd);

  program
    .command('search')
    .description("Plain text + Echo search across a Saga's entries and prose.")
    .argument('<saga>', 'path to the Saga directory')
    .argument(
      '<query>',
      'text to search for (or an Echo target with --scope=echoes)'
    )
    .option(
      '--type <type>',
      'restrict to a single entry type (character, term, sigil, ...)'
    )
    .option(
      '--scope <scope>',
      'where to search: entries | prose | echoes | all',
      'all'
    )
    .option('--case', 'case-sensitive match (default: case-insensitive)')
    .option('--limit <n>', 'cap results', (v) => parseInt(v, 10), 200)
    .option('--json', 'emit JSON')
    .action(searchCmd);

  program
    .command('entry-diff')
    .description(
      'Diff a single entry against HEAD (or --staged against the index).'
    )
    .argument('<saga>', 'path to the Saga directory')
    .argument('<ref>', 'entry reference, e.g. "character/aaron"')
    .option('--staged', 'diff staged changes instead of working tree')
    .option('--json', 'emit JSON')
    .action(entryDiffCmd);

  program
    .command('import')
    .description('Import a Loreweave saga zip with conflict resolution.')
    .argument('<zip>', 'path to the saga-export zip')
    .option('--into <dir>', 'target directory for sagas/', 'sagas')
    .option('--plan', 'print a dry-run plan; do not write')
    .option(
      '--resolve <mode>',
      'conflict strategy: overwrite | keep | prompt',
      'prompt'
    )
    .option('--json', 'emit JSON (non-interactive only)')
    .action(importCmd);

  program
    .command('ingest')
    .description(
      'Stage external source files for the @archivist agent to analyze.'
    )
    .argument('<saga>', 'path to the Saga directory')
    .argument('<files...>', 'file(s) or folder(s) to stage')
    .option('--label <name>', 'batch label for the ingest folder')
    .option('--json', 'emit JSON manifest')
    .action(ingestCmd);

  program
    .command('migrate')
    .description(
      'Migrate a Saga to canonical naming (wiki->codex, glossary->lexicon, tags->sigils, timelines->threads, type: event->waypoint, type: tag->sigil, @event/->@waypoint/, @tag/->@sigil/).'
    )
    .argument('<saga>', 'path to the Saga directory')
    .option(
      '--apply',
      'actually write changes; without this flag, prints a dry-run plan'
    )
    .option('--json', 'emit JSON plan')
    .action(migrateCmd);

  program
    .command('rename')
    .description(
      'Rename an entry and rewrite every @echo across Codex/Lexicon/Sigils/Threads/Traces/prose. Dry-run by default.'
    )
    .argument('<saga>', 'path to the Saga directory')
    .argument('<from>', 'source ref, e.g. character/aaron')
    .argument(
      '<to>',
      'target ref or bare id, e.g. character/aaron-stormrider or aaron-stormrider'
    )
    .option(
      '--apply',
      'actually write changes; without this flag, prints a dry-run plan'
    )
    .option('--json', 'emit JSON plan')
    .action(renameCmd);

  program
    .command('git')
    .description(
      'Local versioning helpers: status | branches | log | commit | checkout | init | remotes | remote-add | remote-remove | fetch | pull | push | diff | merge-abort | merge-continue.'
    )
    .argument('<sub>', 'git subcommand')
    .argument(
      '<saga>',
      'path to the Saga directory (or any path inside the repo)'
    )
    .option('--message <msg>', 'commit message (commit only)')
    .option('--branch <name>', 'branch name (checkout/pull/push)')
    .option('--remote <name>', 'remote name (remotes/fetch/pull/push)')
    .option('--url <url>', 'remote url (remote-add)')
    .option('--file <path>', 'file to diff (diff only)')
    .option('--staged', 'diff staged changes (diff only)')
    .option('--limit <n>', 'log limit', (v) => parseInt(v, 10), 30)
    .option(
      '--all',
      'branches: include remotes; commit: stage all; checkout: create new branch; push: --set-upstream'
    )
    .option('--json', 'emit JSON')
    .action(gitCmd);

  program
    .command('list-sagas')
    .description('List discovered Sagas under a directory (default: ./sagas).')
    .argument('[root]', 'directory containing Sagas', 'sagas')
    .option('--json', 'emit JSON')
    .action(listSagasCmd);

  program
    .command('kinds')
    .description('List the resolved Kind catalog (built-ins + saga overrides).')
    .argument('<saga>', 'path to the Saga directory')
    .option('--json', 'emit JSON')
    .action(kindsCmd);

  program
    .command('lenses')
    .description('List saga-defined Lenses under <saga>/.loreweave/lenses/.')
    .argument('<saga>', 'path to the Saga directory')
    .option('--json', 'emit JSON')
    .action(lensesCmd);

  program
    .command('new')
    .description(
      'Scaffold a new entry from the kind catalog. Writes a stub markdown file with required-property defaults pre-filled.',
    )
    .argument('<saga>', 'path to the Saga directory')
    .argument('<kind>', 'kind id, echoPrefix, or alias (e.g. character)')
    .argument('<id>', 'new entry id (kebab-case)')
    .option('--name <name>', 'human-readable name')
    .option('--status <status>', 'draft | canon')
    .option('--visibility <visibility>', 'public | private')
    .option('--tags <tags>', 'comma-separated sigil ids to seed `tags:`')
    .option('--dry-run', 'print frontmatter to stdout instead of writing a file')
    .option('--force', 'overwrite an existing entry with the same id')
    .action(newCmd);

  await program.parseAsync(argv, { from: 'user' });
}
