/**
 * path-utils.ts — repo-relative path conversions (c00126 S1).
 *
 * Pure, framework-agnostic helpers for normalizing paths. Used by the
 * SOLID-compliance lint (c00125) and re-exported from
 * `packages/core/src/public/index.ts` so any other lint can adopt them
 * without copy-paste.
 *
 * SOLID:
 *   - SRP: only path normalization, nothing else.
 *   - DIP: depends on `node:path` only.
 *   - ISP: 2 functions, narrow surface.
 */
import { relative, sep } from 'node:path';

/**
 * Convert `absPath` to a repository-relative POSIX path.
 * Returns paths outside `rootDir` verbatim so callers can detect
 * out-of-tree references without throwing.
 */
export const toRelPosix = (rootDir: string, absPath: string): string => {
	const rel = relative(rootDir, absPath);
	if (rel.startsWith('..') || rel === '') return rel;
	return rel.split(sep).join('/');
};
