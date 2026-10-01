/**
 * commit-call-writes.ts — what a delendai tool writes in a unit of work is
 * committed when the call returns.
 *
 * A reviewer's verdicts, a proposal handed to review, a file an agent
 * wrote through `fs_write`: each landed in the unit's worktree and waited
 * there for the agent to commit it. Agents did not, until the end if at
 * all, so the owner following a swarm saw branches that did not move while
 * the work went on, and a session that died took hours of verdicts with
 * it. The work ref is the unit's record; a write the tool made is
 * committed to it as the tool made it.
 *
 * Only the paths the call changed are committed, and only in a unit's
 * worktree (`unitBranchOf`). A call that fails commits nothing. A commit
 * that fails never fails the call: the result says so, and what to run.
 */
import { access } from 'node:fs/promises';
import { join } from 'node:path';

import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import { unitBranchOf } from '../development-policy/project-branches';
import { createGitRunner } from './git-write';

/** Longest commit subject this writes; the rest of the call goes nowhere. */
const MAX_SUBJECT_LENGTH = 72;

/** The arguments that say what a call was about, in the order they read. */
const SUBJECT_ARGS = [
	'proposalId',
	'id',
	'sliceId',
	'action',
	'verdict',
	'to',
	'path',
] as const;

/** Each dirty path, with what its content is now. */
type IDirtyState = ReadonlyMap<string, string>;

const dirtyState = async (
	git: IGitRunner,
	root: string,
): Promise<IDirtyState | undefined> => {
	const status = await git([
		'status',
		'--porcelain=v1',
		'-z',
		'--untracked-files=all',
		'--no-renames',
	]);
	if (!status.ok) return undefined;
	const entries = status.output
		.split('\0')
		.filter((entry) => entry.length > 3)
		.map((entry) => ({ code: entry.slice(0, 2), path: entry.slice(3) }));
	const exists = await Promise.all(
		entries.map((entry) =>
			access(join(root, entry.path)).then(
				() => true,
				() => false,
			),
		),
	);
	const present = entries.filter((_, index) => exists[index] === true);
	const hashes =
		present.length === 0
			? []
			: (
					await git([
						'hash-object',
						'--no-filters',
						'--',
						...present.map((entry) => entry.path),
					])
				).output
					.split('\n')
					.filter((line) => line.length > 0);
	const hashOf = new Map(
		present.map((entry, index) => [entry.path, hashes[index] ?? '']),
	);
	return new Map(
		entries.map((entry) => [
			entry.path,
			`${entry.code}:${hashOf.get(entry.path) ?? 'gone'}`,
		]),
	);
};

/** The paths whose state the call changed, and that are still changed. */
export const pathsTheCallChanged = (
	before: IDirtyState,
	after: IDirtyState,
): readonly string[] =>
	[...after.entries()]
		.filter(([path, state]) => before.get(path) !== state)
		.map(([path]) => path)
		.sort();

/** A conventional commit subject naming the tool and what it acted on. */
export const commitSubjectFor = (tool: string, args: unknown): string => {
	const record =
		typeof args === 'object' && args !== null
			? (args as Record<string, unknown>)
			: {};
	const about = SUBJECT_ARGS.map((key) => record[key])
		.filter((value): value is string => typeof value === 'string')
		.join(' ');
	const subject = `chore(delendai): ${tool}${about.length > 0 ? ` ${about}` : ''}`;
	return subject.length <= MAX_SUBJECT_LENGTH
		? subject
		: `${subject.slice(0, MAX_SUBJECT_LENGTH - 1)}…`;
};

const withNote = (result: unknown, note: string): unknown => {
	if (typeof result !== 'object' || result === null) return result;
	const content = (result as { content?: unknown }).content;
	if (!Array.isArray(content)) return result;
	return { ...result, content: [...content, { type: 'text', text: note }] };
};

const isErrorResult = (result: unknown): boolean =>
	typeof result === 'object' &&
	result !== null &&
	(result as { isError?: unknown }).isError === true;

/**
 * Stage and commit exactly `paths`. A path the call removed, or moved
 * away, is no longer there for `git add` to match: naming it failed the
 * whole commit ("did not match any files") whenever a tool renamed a
 * proposal, which the proposals tools do to keep filenames canonical
 * (x00733). It leaves the index instead.
 */
const commitPaths = async (
	git: IGitRunner,
	root: string,
	paths: readonly string[],
	subject: string,
): Promise<{ readonly ok: boolean; readonly reason?: string }> => {
	const exists = await Promise.all(
		paths.map((path) =>
			access(join(root, path)).then(
				() => true,
				() => false,
			),
		),
	);
	const present = paths.filter((_, index) => exists[index] === true);
	const gone = paths.filter((_, index) => exists[index] !== true);
	if (present.length > 0) {
		const added = await git(['add', '-A', '--', ...present]);
		if (!added.ok) return added;
	}
	if (gone.length > 0) {
		const removed = await git([
			'rm',
			'-q',
			'--cached',
			'--ignore-unmatch',
			'--',
			...gone,
		]);
		if (!removed.ok) return removed;
	}
	// A path the call both created and removed — a proposal renamed to its
	// canonical name, then moved to another stage — is known to neither
	// HEAD nor the index now, and naming it fails the whole commit.
	const tracked =
		gone.length === 0
			? []
			: (
					await git([
						'ls-tree',
						'-r',
						'--name-only',
						'HEAD',
						'--',
						...gone,
					])
				).output
					.split('\n')
					.filter((line) => line.length > 0);
	const committable = [...present, ...tracked];
	if (committable.length === 0) return { ok: true };
	return git(['commit', '-q', '-m', subject, '--', ...committable]);
};

/** Calls in one worktree run one after another, so each commits its own. */
const inFlight = new Map<string, Promise<unknown>>();

const oneAtATime = async <T>(
	root: string,
	work: () => Promise<T>,
): Promise<T> => {
	const previous = inFlight.get(root) ?? Promise.resolve();
	const next = previous.then(work, work);
	const settled = next.catch(() => undefined);
	inFlight.set(root, settled);
	try {
		return await next;
	} finally {
		if (inFlight.get(root) === settled) inFlight.delete(root);
	}
};

/**
 * Run `call` in `root`, and when `root` is a unit of work's worktree,
 * commit the paths it changed.
 */
export const withCallWritesCommitted = async (
	root: string,
	tool: string,
	args: unknown,
	call: () => Promise<unknown>,
	git: IGitRunner = createGitRunner(root),
): Promise<unknown> => {
	const branch = await unitBranchOf(root);
	if (branch === undefined) return call();
	return oneAtATime(root, async () => {
		const before = await dirtyState(git, root);
		const result = await call();
		if (before === undefined || isErrorResult(result)) return result;
		const after = await dirtyState(git, root);
		if (after === undefined) return result;
		const paths = pathsTheCallChanged(before, after);
		if (paths.length === 0) return result;
		const subject = commitSubjectFor(tool, args);
		const committed = await commitPaths(git, root, paths, subject);
		if (committed.ok) return result;
		const note = `delendai could not commit what this call wrote to ${branch} (${committed.reason ?? 'git refused'}). Commit it yourself before going on: git -C ${root} add -A -- ${paths.join(' ')} && git -C ${root} commit -m "${subject}"`;
		process.stderr.write(`[delendai] ${note}\n`);
		return withNote(result, note);
	});
};
