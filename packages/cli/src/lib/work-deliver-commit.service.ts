/**
 * work-deliver-commit.service.ts — the tool commits what the tool wrote.
 *
 * `work deliver` moves the proposal to in-progress through the proposals
 * tool, which rewrites the proposal's document. When the tool left that
 * write uncommitted, the proof then refused the dirty tree, and the
 * startup reconciler could commit it under `chore(wip): keep the
 * uncommitted work…`, a subject the verdict lint reads as hand-written.
 * So the write is committed here, under the tool's own subject, before
 * anything else runs. Only paths that were clean before the call are
 * taken: a file somebody else left dirty stays theirs.
 */
import type { IGitInCheckout } from '../contracts/interfaces/git-in-checkout.interface';

/** The paths `git status` lists as changed or untracked. */
export const dirtyPathsOf = (git: IGitInCheckout): ReadonlySet<string> => {
	const status = git([
		'status',
		'--porcelain',
		'-z',
		'--untracked-files=all',
	]);
	if (!status.ok) return new Set();
	return new Set(
		status.out
			.split('\0')
			.filter((entry) => entry.length > 3)
			.map((entry) => entry.slice(3)),
	);
};

/** The subject a tool's own commit carries. */
export const toolCommitSubject = (tool: string, detail: string): string =>
	`chore(delendai): ${tool} ${detail}`;

/**
 * Commit the paths a tool call changed, given those dirty before it.
 * `undefined` when it wrote nothing; the commit refusal otherwise.
 */
export const commitToolWrites = (
	git: IGitInCheckout,
	dirtyBefore: ReadonlySet<string>,
	subject: string,
): string | undefined => {
	const written = [...dirtyPathsOf(git)].filter(
		(path) => !dirtyBefore.has(path),
	);
	if (written.length === 0) return undefined;
	const staged = git(['add', '--', ...written]);
	if (!staged.ok) return staged.out || 'git add failed';
	const committed = git(['commit', '-q', '-m', subject, '--', ...written]);
	return committed.ok ? undefined : committed.out || 'git commit failed';
};
