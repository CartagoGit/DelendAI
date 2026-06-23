/**
 * conventions-scan.ts — walk a workspace and classify every TypeScript
 * file against the active profile (f00037 S3).
 *
 * Pure engine over an injectable directory reader (`IDirReader`): the
 * production wiring passes `node:fs`, tests pass an in-memory tree. This
 * is the Dependency-Inversion seam that lets `check-conventions.tool.ts`
 * be exercised without touching the real filesystem.
 */
import { classifyPath, type Role } from './typescript-profile.service';

/** Minimal directory-listing port. Returns entry names (files + dirs). */
export interface IDirReader {
	/** List immediate child entries of `relDir` (repo-relative POSIX). */
	list(relDir: string): Promise<readonly IDirEntry[]>;
}

export interface IDirEntry {
	readonly name: string;
	readonly isDirectory: boolean;
}

export interface IConventionsScanResult {
	/** Total `.ts`/`.tsx` files classified. */
	readonly total: number;
	/** Count per role (every role key present, zero when none). */
	readonly counts: Readonly<Record<Role, number>>;
	/** Repo-relative POSIX paths the profile maps to `'other'` (the drift). */
	readonly unmatched: readonly string[];
}

const EMPTY_COUNTS = (): Record<Role, number> => ({
	interface: 0,
	constant: 0,
	service: 0,
	tool: 0,
	registry: 0,
	register: 0,
	factory: 0,
	builder: 0,
	generated: 0,
	barrel: 0,
	other: 0,
});

const isTypeScript = (name: string): boolean =>
	name.endsWith('.ts') || name.endsWith('.tsx');

/** Directories never worth scanning (build output, deps, vcs). */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.cache', 'build']);

/**
 * Walk `scanRoots` breadth-first via the injected reader, classify every
 * TypeScript file, and aggregate counts + the unmatched (`'other'`) list.
 * The unmatched list is sorted for deterministic output.
 */
export const scanConventions = async (
	reader: IDirReader,
	scanRoots: readonly string[],
): Promise<IConventionsScanResult> => {
	const counts = EMPTY_COUNTS();
	const unmatched: string[] = [];
	let total = 0;

	const stack: string[] = [...scanRoots];
	while (stack.length > 0) {
		const dir = stack.pop() as string;
		const entries = await reader.list(dir).catch(() => []);
		for (const entry of entries) {
			const rel = dir === '' ? entry.name : `${dir}/${entry.name}`;
			if (entry.isDirectory) {
				if (!SKIP_DIRS.has(entry.name)) stack.push(rel);
				continue;
			}
			if (!isTypeScript(entry.name)) continue;
			total += 1;
			const role = classifyPath(rel);
			counts[role] += 1;
			if (role === 'other') unmatched.push(rel);
		}
	}

	unmatched.sort((a, b) => a.localeCompare(b));
	return { total, counts, unmatched };
};
