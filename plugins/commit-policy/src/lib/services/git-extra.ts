/**
 * git-extra.ts — small `git <cmd>` helpers that are NOT exported from
 * `@mcp-vertex/core/public` but the policy engine needs. Kept local
 * so we do not depend on the git plugin (which would create a
 * dependency cycle).
 *
 * Each helper takes an `IGitRunner` so the tests can stub git.
 */

import type { IGitRunner } from '@mcp-vertex/core/public';

/** Radix for `Number.parseInt` of `git rev-list --count` output. */
const DEC_RADIX = 10;

/** Removes the proposal/path serialization used for rename entries. */
const normalizeDirtyPath = (raw: string): string => {
	const trimmed = raw.trim();
	const arrow = trimmed.lastIndexOf(' -> ');
	if (arrow >= 0) return trimmed.slice(arrow + 4).trim();
	return trimmed;
};

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
 * x00264 (AUD-CP-006): list of paths currently dirty in the
 * worktree, parsed from `git status --porcelain=v1`. The
 * trigger carries these in the event so the driver can stage
 * the SAME set that crossed the threshold — eliminating the
 * "predicate ≠ action" bug where `gitDirtyFileCount` saw N
 * files but the commit ran on whatever happened to be staged.
 *
 * Returns `[]` when git is not a repo or `status` fails.
 */
/**
 * Paths that exist only while some other process is mid-write.
 *
 * `withFileMutex` creates a `<file>.mutex` sibling for the duration of a
 * write and removes it afterwards. A snapshot commit that happens to run
 * in that window sees the mutex as a dirty untracked file, stages it,
 * and by the time `git add` runs it is gone — the whole commit then
 * fails with `pathspec '...mutex' did not match any files`, so a real
 * batch of finished work is lost to a file that was never meant to be
 * committed. Observed live in this repo.
 *
 * Filtering here rather than at the call sites because every consumer of
 * "what is dirty" wants the same answer: transient coordination files
 * are not work.
 */
const TRANSIENT_PATH_PATTERN = /(^|\/)\.git\/|\.mutex$|\.tmp-[^/]*$|\.lock$/u;

export const isTransientWorkspacePath = (path: string): boolean =>
	TRANSIENT_PATH_PATTERN.test(path);

export const gitDirtyFilePaths = async (
	run: IGitRunner,
): Promise<readonly string[]> => {
	const result = await run(['status', '--porcelain=v1']);
	if (!result.ok) return [];
	const paths: string[] = [];
	for (const raw of result.output.split('\n')) {
		const line = raw.trimEnd();
		if (line.length < 4) continue;
		const rest = line.slice(3);
		if (rest.length === 0) continue;
		const isRenameOrCopy =
			(line[0] === 'R' ||
				line[0] === 'C' ||
				line[1] === 'R' ||
				line[1] === 'C') &&
			rest.includes('->');
		if (line[1] === ' ' && !isRenameOrCopy) continue;
		if (isRenameOrCopy) {
			const arrow = rest.indexOf('->');
			const target = normalizeDirtyPath(
				arrow >= 0 ? rest.slice(arrow + 2) : rest,
			);
			if (target.length > 0) paths.push(target);
		} else {
			const path = normalizeDirtyPath(rest);
			if (path.length > 0) paths.push(path);
		}
	}
	return paths.filter((path) => !isTransientWorkspacePath(path));
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
	const n = Number.parseInt(result.output.trim(), DEC_RADIX);
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
 * x00265 (AUD-CP-007): specific failure codes for non-conventional
 * commit messages. The driver (and later the engine from `f00182`)
 * uses these to give actionable refusals instead of a single
 * umbrella string.
 */
export type ConventionalHeaderStatus =
	| 'OK'
	| 'EMPTY_HEADER'
	| 'MALFORMED_HEADER'
	| 'UNKNOWN_TYPE';

export interface IConventionalHeaderResult {
	readonly status: ConventionalHeaderStatus;
	readonly first: string;
}

/**
 * x00265: validate a message's first line as a Conventional
 * Commit. Returns the structured status instead of a boolean so
 * callers can surface specific codes (`EMPTY_HEADER`,
 * `MALFORMED_HEADER`, `UNKNOWN_TYPE`) in their refusal envelope.
 */
export const validateConventionalHeader = (
	message: string,
): IConventionalHeaderResult => {
	const first = message.trim().split('\n')[0] ?? '';
	if (first.length === 0) return { status: 'EMPTY_HEADER', first };
	const match = /^([A-Za-z][A-Za-z0-9_.-]*)(?:\([^)]+\))?!?:\s/u.exec(first);
	if (match === null) {
		return { status: 'MALFORMED_HEADER', first };
	}
	const type = match[1] ?? '';
	if (
		!CONVENTIONAL_PREFIXES.includes(
			type as (typeof CONVENTIONAL_PREFIXES)[number],
		)
	) {
		return { status: 'UNKNOWN_TYPE', first };
	}
	return { status: 'OK', first };
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
