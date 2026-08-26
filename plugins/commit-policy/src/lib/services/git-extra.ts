/**
 * git-extra.ts — small `git <cmd>` helpers that are NOT exported from
 * `@mcp-vertex/core/public` but the policy engine needs. Kept local
 * so we do not depend on the git plugin (which would create a
 * dependency cycle).
 *
 * Each helper takes an `IGitRunner` so the tests can stub git.
 */

import type { IGitRunner } from '@mcp-vertex/core/public';

/**
 * Current branch (short name, no refs/heads/ prefix). Returns
 * `undefined` when git is not a repo, the HEAD is detached, or the
 * command fails for any reason — never throws.
 */
export const gitCurrentBranch = async (
	run: IGitRunner,
): Promise<string | undefined> => {
	const result = await run(['rev-parse', '--abbrev-ref', 'HEAD']);
	if (!result.ok) return undefined;
	const trimmed = result.output.trim();
	if (trimmed.length === 0 || trimmed === 'HEAD') return undefined;
	return trimmed;
};

/**
 * Remote name + branch name of the current branch's upstream
 * (parsing `git rev-parse --abbrev-ref @{upstream}`). Returns
 * `undefined` when there is no upstream (fresh branch, no fetch).
 */
export const gitUpstream = async (
	run: IGitRunner,
): Promise<{ remote: string; branch: string } | undefined> => {
	const result = await run(['rev-parse', '--abbrev-ref', '@{upstream}']);
	if (!result.ok) return undefined;
	const trimmed = result.output.trim();
	if (trimmed.length === 0 || trimmed === '@{upstream}') return undefined;
	const slash = trimmed.indexOf('/');
	if (slash <= 0 || slash === trimmed.length - 1) return undefined;
	return {
		remote: trimmed.slice(0, slash),
		branch: trimmed.slice(slash + 1),
	};
};

/**
 * Count the files currently dirty in the worktree (porcelain v1).
 * Used by the threshold trigger. `0` when not a repo.
 */
export const gitDirtyFileCount = async (run: IGitRunner): Promise<number> => {
	const result = await run(['status', '--porcelain=v1']);
	if (!result.ok) return 0;
	const lines = result.output.split('\n').filter((line) => line.length > 0);
	return lines.length;
};

/**
 * Count unpushed commits on the current branch (ahead-of-upstream).
 * `0` when there is no upstream or the branch is clean.
 */
export const gitUnpushedCommitCount = async (
	run: IGitRunner,
): Promise<number> => {
	const result = await run(['rev-list', '--count', '@{upstream}..HEAD']);
	if (!result.ok) return 0;
	const n = Number.parseInt(result.output.trim(), 10);
	return Number.isFinite(n) ? n : 0;
};

/**
 * Conventional-Commit first-line check. Mirrors the regex used by
 * the `git` plugin's `isConventionalCommitMessage` so the two
 * surfaces agree. Pure function over the input string.
 */
const CONVENTIONAL_PREFIXES = [
	'feat',
	'fix',
	'refactor',
	'perf',
	'docs',
	'test',
	'chore',
	'build',
	'ci',
	'style',
	'revert',
] as const;

const CONVENTIONAL_RE = new RegExp(
	`^(${CONVENTIONAL_PREFIXES.join('|')})(\\([^)]+\\))?!?:\\s+\\S`,
	'u',
);

export const isConventionalCommitMessage = (message: string): boolean => {
	const first = message.trim().split('\n')[0] ?? '';
	return CONVENTIONAL_RE.test(first);
};

/**
 * x00263 (AUD-CP-005): list of paths currently in the index
 * (`git diff --cached --name-only`). Returns `[]` when git is not
 * a repo, when the index is empty, or when the command fails —
 * never throws. Used by `commit-driver` to assert that the slice
 * only staged paths it owns.
 */
export const gitCachedNames = async (
	run: IGitRunner,
): Promise<readonly string[]> => {
	const result = await run(['diff', '--cached', '--name-only']);
	if (!result.ok) return [];
	return result.output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
};
