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
 * that fails never fails the call: the result says so, and what to run,
 * and the writes are kept as pending. The next call in the worktree, or
 * the start pass, commits them under the tool's subject while they are
 * still as the tool left them: committed under any other subject, a
 * verdict reads as written by hand and its pack can never land.
 */
import { access } from 'node:fs/promises';
import { join } from 'node:path';

import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import { CALL_WRITES_NOT_COMMITTED } from '../contracts/constants/call-writes.constant';
import type { IPendingCallWrite } from '../contracts/interfaces/pending-call-writes.interface';
import { unitBranchOf } from '../development-policy/project-branches';
import { createGitRunner } from './git-write';
import {
	readPendingCallWrites,
	writePendingCallWrites,
} from './pending-call-writes.store';

/**
 * How long a commit of a call's writes may take. A commit runs the
 * repository's hooks, which in a busy swarm took more than the 60 seconds
 * a git call gets: the commit was killed and the verdict left behind,
 * six times in one day. The hooks decide, not the runner's default.
 */
const COMMIT_TIMEOUT_MS = 10 * 60_000;

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

/** A git refusal that is another process holding a lock, not a verdict. */
const LOCK_HELD =
	/\.lock'?:? File exists|cannot lock ref|Unable to create '.*\.lock'/iu;

/** How often, and how far apart, a commit refused by a held lock is tried. */
const LOCK_ATTEMPTS = 5;
const LOCK_PAUSE_MS = 1000;

/**
 * Run `commit` again while git refuses it only because another process
 * holds a lock: a fetch or a commit in another worktree of the clone
 * takes the shared refs' locks for a moment, and a verdict's commit that
 * met one was left staged for good.
 */
const commitRetryingLocks = async (
	commit: () => Promise<{ readonly ok: boolean; readonly reason?: string }>,
): Promise<{ readonly ok: boolean; readonly reason?: string }> => {
	let outcome = await commit();
	for (
		let attempt = 1;
		attempt < LOCK_ATTEMPTS &&
		!outcome.ok &&
		LOCK_HELD.test(outcome.reason ?? '');
		attempt += 1
	) {
		await new Promise((done) => setTimeout(done, LOCK_PAUSE_MS));
		outcome = await commit();
	}
	return outcome;
};

/** A path's content, from its dirty state (`<status code>:<hash>`). */
const contentOf = (state: string | undefined): string | undefined =>
	state?.slice(state.indexOf(':') + 1);

/**
 * Commit the writes a tool left pending in `root`, each under the tool's
 * subject, while every one of its paths is still as the tool left it. A
 * path changed since is somebody else's edit too: that record is dropped
 * and its paths left for whoever commits them. Returns how many committed.
 */
export const commitPendingCallWrites = async (
	root: string,
	git: IGitRunner = createGitRunner(root),
): Promise<number> => {
	const pending = await readPendingCallWrites(git);
	if (pending.length === 0) return 0;
	const state = await dirtyState(git, root);
	if (state === undefined) return 0;
	const kept: IPendingCallWrite[] = [];
	let committed = 0;
	for (const write of pending) {
		const paths = Object.keys(write.paths);
		// The content decides, not the index: the failed commit had
		// already staged what the tool wrote.
		const untouched = paths.every(
			(path) =>
				contentOf(state.get(path)) === contentOf(write.paths[path]),
		);
		if (!untouched) continue;
		const outcome = await commitRetryingLocks(() =>
			commitPaths(git, root, paths, write.subject),
		);
		if (outcome.ok) committed += 1;
		else kept.push(write);
	}
	await writePendingCallWrites(git, kept);
	return committed;
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
	git: IGitRunner = createGitRunner(root, COMMIT_TIMEOUT_MS),
): Promise<unknown> => {
	const branch = await unitBranchOf(root);
	if (branch === undefined) return call();
	return oneAtATime(root, async () => {
		await commitPendingCallWrites(root, git);
		const before = await dirtyState(git, root);
		const result = await call();
		if (before === undefined || isErrorResult(result)) return result;
		const after = await dirtyState(git, root);
		if (after === undefined) return result;
		const paths = pathsTheCallChanged(before, after);
		if (paths.length === 0) return result;
		const subject = commitSubjectFor(tool, args);
		const committed = await commitRetryingLocks(() =>
			commitPaths(git, root, paths, subject),
		);
		if (committed.ok) return result;
		await writePendingCallWrites(git, [
			...(await readPendingCallWrites(git)),
			{
				subject,
				paths: Object.fromEntries(
					paths.map((path) => [path, after.get(path) ?? '']),
				),
			},
		]);
		const said = `${CALL_WRITES_NOT_COMMITTED} what this call wrote to ${branch} (${(committed.reason ?? 'git refused').replace(/\s+/gu, ' ').trim()}). Commit it yourself before going on: git -C ${root} add -A -- ${paths.join(' ')} && git -C ${root} commit -m "${subject}"`;
		const note = said.slice('[delendai] '.length);
		process.stderr.write(`${said}\n`);
		return withNote(result, note);
	});
};
