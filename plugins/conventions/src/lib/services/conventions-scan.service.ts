/**
 * conventions-scan.ts — walk a workspace and classify every source
 * file against the active language profile (f00037 S3; multi-language
 * profiles f00113 S5).
 *
 * Pure engine over an injectable directory reader (`IDirReader`): the
 * production wiring passes `node:fs`, tests pass an in-memory tree. This
 * is the Dependency-Inversion seam that lets `check-conventions.tool.ts`
 * be exercised without touching the real filesystem.
 */
import {
	classifyWithProfile,
	matchesProfileExtension,
	type ILanguageProfile,
} from '../profiles/profile.contract';
import { TYPESCRIPT_PROFILE } from '../profiles/profile-registry';

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
	/** Total files of the profile's extensions classified. */
	readonly total: number;
	/** Count per role (every profile role present, zero when none). */
	readonly counts: Readonly<Record<string, number>>;
	/** Repo-relative POSIX paths the profile maps to `'other'` (the drift). */
	readonly unmatched: readonly string[];
	/**
	 * Scan roots whose OWN listing failed (nonexistent/unreadable), in
	 * input order. a00064: a `total: 0` caused by roots that describe a
	 * different project's layout must be distinguishable from a
	 * genuinely empty tree — the same silent-zero class that sent an
	 * adopter agent into a retry meltdown on search/docs (a00063).
	 */
	readonly missingRoots: readonly string[];
}

const emptyCounts = (profile: ILanguageProfile): Record<string, number> =>
	Object.fromEntries([
		...profile.rules.map((rule) => [rule.name, 0] as const),
		['other', 0] as const,
	]);

/** Directories never worth scanning (build output, deps, vcs). */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.cache', 'build']);

/**
 * Walk `scanRoots` breadth-first via the injected reader, classify every
 * file matching the profile's extensions, and aggregate counts + the
 * unmatched (`'other'`) list. Defaults to the TypeScript profile —
 * omitting `profile` is byte-identical to the pre-f00113 behaviour.
 * The unmatched list is sorted for deterministic output.
 */
export const scanConventions = async (
	reader: IDirReader,
	scanRoots: readonly string[],
	profile: ILanguageProfile = TYPESCRIPT_PROFILE,
): Promise<IConventionsScanResult> => {
	const counts = emptyCounts(profile);
	const skipDirs = new Set([...SKIP_DIRS, ...(profile.skipDirs ?? [])]);
	const unmatched: string[] = [];
	const missingRoots: string[] = [];
	const rootSet = new Set(scanRoots);
	let total = 0;

	const stack: string[] = [...scanRoots];
	while (stack.length > 0) {
		const dir = stack.pop() as string;
		const entries = await reader.list(dir).catch(() => {
			// A failing TOP-LEVEL root is a config-vs-reality mismatch the
			// caller must be able to surface; a failing nested dir is just
			// filesystem churn and stays silently skipped as before.
			if (rootSet.has(dir)) missingRoots.push(dir);
			return [];
		});
		for (const entry of entries) {
			const rel = dir === '' ? entry.name : `${dir}/${entry.name}`;
			if (entry.isDirectory) {
				if (!skipDirs.has(entry.name)) stack.push(rel);
				continue;
			}
			if (!matchesProfileExtension(profile, entry.name)) continue;
			total += 1;
			const role = classifyWithProfile(profile, rel);
			counts[role] = (counts[role] ?? 0) + 1;
			if (role === 'other') unmatched.push(rel);
		}
	}

	unmatched.sort((a, b) => a.localeCompare(b));
	// Preserve the caller's input order for actionable error messages
	// (`missingRoots` collects in pop order, which reverses the stack).
	missingRoots.sort((a, b) => scanRoots.indexOf(a) - scanRoots.indexOf(b));
	return { total, counts, unmatched, missingRoots };
};
