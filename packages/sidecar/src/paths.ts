import path from 'node:path';

/**
 * Resolve `rel` against `root` and reject path-escape attempts. The sidecar
 * uses this to guard every file-system operation it proxies on behalf of
 * the writer so a hostile payload can't reach `../../secrets`.
 */
export function safeJoin(root: string, rel: string): string {
  if (rel.includes('..'))
    throw new Error("relative path must not contain '..'");
  const normalizedRoot = path.resolve(root);
  const joined = path.resolve(normalizedRoot, rel);
  if (
    !joined.startsWith(normalizedRoot + path.sep) &&
    joined !== normalizedRoot
  ) {
    throw new Error(
      `path escape detected: ${joined} is outside ${normalizedRoot}`,
    );
  }
  return joined;
}
