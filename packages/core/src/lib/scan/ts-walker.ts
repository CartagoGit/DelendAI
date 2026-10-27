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
const GENERATED_FILE = /\.generated\.tsx?$/;

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.cache', '.git']);

/**
 * Options accepted by {@link walkTsFiles}.
 *
 * `authoredOnly` narrows the walk to hand-authored source: in addition
 * to the standard exclusions, files matching `*.generated.ts` and any
 * segment named `generated/` are skipped. Default `false` so the four
 * callers that already share this walker see exactly the same file
 * set they did before — the option exists for gates whose notion of
 * "source" excludes machine-produced files, so they can adopt the
 * walker without silently expanding the set of files they look at
 * (which was the failure mode r00046 set out to fix).
 */
export interface IWalkTsFilesOptions {
	readonly authoredOnly?: boolean;
}

/**
 * Walk `roots` (each relative to `rootDir`) and return every
 * TypeScript source file beneath them. Skips the standard non-source
 * directories. Missing roots are silently skipped.
 *
 * Pass `{ authoredOnly: true }` to additionally exclude `*.generated.ts`
 * files and any `generated/` directory segment; this is what gates that
 * care only about hand-authored code (e.g. r00046's four) need.
 */
export const walkTsFiles = async (
	rootDir: string,
	roots: readonly string[],
	options?: IWalkTsFilesOptions,
): Promise<readonly string[]> => {
	const authoredOnly = options?.authoredOnly === true;
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
				if (authoredOnly && entry.name === 'generated') continue;
				stack.push(childRel);
				continue;
			}
			if (!entry.isFile()) continue;
			if (!TS_EXTS.test(entry.name)) continue;
			if (DECLARATION_FILE.test(entry.name)) continue;
			if (authoredOnly && GENERATED_FILE.test(entry.name)) continue;
			out.push(childRel);
		}
	}
	out.sort((a, b) => a.localeCompare(b));
	return out;
};
