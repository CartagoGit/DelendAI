/**
 * ts-walker.ts — TypeScript file walker (c00126 S1).
 *
 * Async walker for a set of repository-relative roots. Skips directories
 * that are not part of the source tree (node_modules, dist, build, .cache,
 * .git) and emitted `.d.ts` declarations. Returns every authored
 * `.ts`/`.tsx` file, sorted by relative path.
 *
 * `.d.ts` is excluded because it is build output, not source:
 * `.gitignore` carries `packages/*\/src/**\/*.d.ts`, so those files are
 * not in the repository at all. Every consumer of this walker is a
 * convention or architecture lint, and on 2026-09-04 four of them
 * reported findings in emitted declarations — 113 "unmatched" filenames
 * chosen by `tsc`, and working-directory violations in generated type
 * signatures. None of them named a line anybody could edit, and the fix
 * always belonged in the `.ts` this walk already returns.
 *
 * The walker is the only helper in the scan barrel that performs I/O; the
 * rest are pure text/pattern scanners that operate on the file map.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const TS_EXTS = /\.tsx?$/;
const DECLARATION_FILE = /\.d\.tsx?$/;

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.cache', '.git']);

/**
 * Walk `roots` (each relative to `rootDir`) and return every
 * TypeScript source file beneath them. Skips the standard non-source
 * directories. Missing roots are silently skipped.
 */
export const walkTsFiles = async (
	rootDir: string,
	roots: readonly string[],
): Promise<readonly string[]> => {
	const out: string[] = [];
	const stack: string[] = [...roots];
	while (stack.length > 0) {
		const rel = stack.pop() as string;
		const abs = join(rootDir, rel);
		let entries: readonly import('node:fs').Dirent[];
		try {
			entries = await readdir(abs, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
			if (entry.isDirectory()) {
				if (SKIP_DIRS.has(entry.name)) continue;
				stack.push(childRel);
				continue;
			}
			if (!entry.isFile()) continue;
			if (!TS_EXTS.test(entry.name)) continue;
			if (DECLARATION_FILE.test(entry.name)) continue;
			out.push(childRel);
		}
	}
	out.sort((a, b) => a.localeCompare(b));
	return out;
};
