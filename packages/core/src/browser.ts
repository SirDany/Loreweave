// Browser-safe surface of @loreweave/core.
// Excludes Node.js-dependent modules (loader, storage-fs, kind-loader, normalizer).
export * from './types.js';
export * from './references.js';
export * from './resolver.js';
export * from './lens.js';
export * from './calendar.js';
export * from './timeline.js';
export * from './slang.js';
export * from './validator.js';
export * from './integrity.js';
export {
  KindFrontmatterSchema,
  KindFieldSchema,
  KindFieldTypeSchema,
  KindDisplaySchema,
  KindCycleError,
  type KindFrontmatter,
  type KindField,
  type ResolvedKind,
} from './kinds.js';
export { BUILTIN_KIND_DEFS, BUILTIN_KIND_IDS } from './builtin-kinds.js';
export * from './storage.js';
export { MemoryAdapter } from './storage-memory.js';
export {
  buildDigest,
  renderPhoneBook,
  type CanonDigest,
  type PhoneBookEntry,
  type DigestWeaveEntry,
  type DigestThread,
  type DigestThreadWaypoint,
  type BuildDigestOptions,
} from './digest.js';
export {
  summarizeSaga,
  type SagaSummary,
  type SummarizeOptions,
  type KindCount,
  type TagCount,
  type RecentEntry,
  type DiagnosticTotals,
} from './summarize.js';
