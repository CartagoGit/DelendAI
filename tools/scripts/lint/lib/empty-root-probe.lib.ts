/**
 * empty-root-probe.lib.ts — every lint is run over a tree that holds
 * nothing but `tools/`, and one that passes there measured nothing.
 *
 * Reading a lint's source cannot settle it: of six sampled that walked a
 * root and swallowed its absence, five behaved differently from what
 * the text implied. Running it does. A lint whose surface really is in
 * that tree — every tracked file, or git history — is named on the
 * allowlist with the reason. Such a lint may also fail there, which
 * depends on the environment (CI, a diff base) and is never wrong; an
 * entry for a lint no gate chain runs is stale.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join, sep } from 'node:path';

export interface IEmptyRootRun {
	/** Repo-relative path of the lint. */
	readonly file: string;
	readonly exitCode: number | null;
}

export interface IEmptyRootFinding {
	readonly file: string;
	readonly detail: string;
	readonly fix: string;
}

/** What the runs over the empty tree say, judged against the allowlist. */
export const judgeEmptyRootRuns = (
	runs: readonly IEmptyRootRun[],
	allowed: Readonly<Record<string, string>>,
): readonly IEmptyRootFinding[] => {
	const ran = new Set(runs.map((run) => run.file));
	return [
		...runs
			.filter(
				(run) => run.exitCode === 0 && allowed[run.file] === undefined,
			)
			.map((run) => ({
				file: run.file,
				detail: 'exits 0 over a tree with no packages/, plugins/, apps/ or docs/: it measured nothing and passed',
				fix: 'call refuseMissingScanRoots() before scanning, or allowlist it with the reason its surface is in the tree',
			})),
		...Object.keys(allowed)
			.filter((file) => !ran.has(file))
			.map((file) => ({
				file,
				detail: 'is on the empty-root allowlist but no gate chain runs it',
				fix: 'remove its allowlist entry',
			})),
	];
};

/**
 * Runs each of `files` from a git tree under the cache root that holds
 * only an indexed copy of `tools/`, so a lint resolves its root to that tree
 * whether it asks the cwd, git or its own location.
 */
export const runOverEmptyRoot = (
	repoRoot: string,
	files: readonly string[],
): readonly IEmptyRootRun[] => {
	const tree = join(repoRoot, '.cache', 'delendai', 'empty-root-probe');
	rmSync(tree, { recursive: true, force: true });
	mkdirSync(tree, { recursive: true });
	try {
		// Without node_modules, and with the real ones linked in: a lint
		// that cannot load its imports exits non-zero for that reason,
		// which would read as a refusal it never made.
		cpSync(join(repoRoot, 'tools'), join(tree, 'tools'), {
			recursive: true,
			filter: (source) => !source.includes(`${sep}node_modules`),
		});
		for (const modules of ['node_modules', join('tools', 'node_modules')]) {
			if (existsSync(join(repoRoot, modules))) {
				symlinkSync(
					join(repoRoot, modules),
					join(tree, modules),
					'dir',
				);
			}
		}
		// Indexed, never committed: a lint over tracked files sees the
		// copy, and one over history sees none.
		for (const args of [
			['init', '-q'],
			['add', '-A'],
		]) {
			spawnSync('git', args, { cwd: tree, stdio: 'ignore' });
		}
		return files.map((file) => ({
			file,
			exitCode: spawnSync('bun', [file], {
				cwd: tree,
				stdio: 'ignore',
				timeout: 60_000,
			}).status,
		}));
	} finally {
		rmSync(tree, { recursive: true, force: true });
	}
};
