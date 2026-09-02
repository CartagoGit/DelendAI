#!/usr/bin/env bun
/**
 * no-stashes.script.ts — stash policy guard.
 *
 * This repo forbids git stashes: in a shared worktree a stash is work an
 * agent left behind, invisible to everyone else, and a source of `git apply`
 * conflicts when two hooks run at once.
 *
 * BUT lefthook creates a stash *itself*. Whenever a `pre-commit` hook runs
 * while any file is PARTIALLY staged (the same path has both staged and
 * unstaged hunks), lefthook hides the unstaged hunks in a stash titled
 * exactly `lefthook auto backup`, runs the jobs against the staged state,
 * and restores the stash afterwards. Verified empirically against lefthook
 * 2.1.10 in a throwaway repo:
 *
 *   - partially staged file + any pre-commit job  -> stash created, then dropped
 *   - staged and unstaged changes in DIFFERENT files -> no stash at all
 *   - `stage_fixed: false` on every job -> stash still created (it is not
 *     the `stage_fixed` flag that triggers it, it is partial staging)
 *   - lefthook interrupted mid-run (SIGINT / timeout / killed agent)
 *     -> the stash is NEVER restored and dangles forever
 *
 * There is no configuration that turns this off: the full option set of
 * lefthook 2.1.10 (dumped from the binary's struct tags) contains no
 * `no_stash`, no `hide_unstaged`, and no `LEFTHOOK_*` env killswitch for it.
 * A previous guess of `no_stash: true` in lefthook.yml was silently ignored.
 *
 * Consequence for THIS check: it runs as a child of lefthook, so during a
 * pre-commit run lefthook's own live backup stash is always visible to it.
 * Reporting that as a policy violation is a false positive produced by the
 * guard's own runner, and it trains agents to ignore the guard. So:
 *
 *   - a `lefthook auto backup` stash while a lefthook process is alive is
 *     TRANSIENT and is ignored (with a note, not a violation);
 *   - the same stash with NO lefthook process running is DANGLING: it is
 *     unrestored work from a killed hook run, and it is reported loudly with
 *     the exact recovery command;
 *   - any other stash is a real developer/agent stash and is a violation.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/** Exact reflog subject lefthook uses for its partial-staging backup. */
export const LEFTHOOK_BACKUP_SUBJECT = 'lefthook auto backup';

export type StashKind = 'lefthook-backup' | 'user';

export interface IStashEntry {
	readonly ref: string;
	readonly message: string;
	/** Committer timestamp of the stash commit, in epoch seconds. */
	readonly createdAtEpochSeconds?: number;
}

/**
 * A live lefthook backup is seconds old — the hook run that created it is
 * still in flight. Anything older than this, even with a lefthook process
 * alive (a *different*, concurrent agent's run), is a leftover from an
 * earlier interrupted run and must be surfaced. Generous on purpose: a false
 * alarm here is worse than a late one, because it trains agents to ignore
 * the guard.
 */
export const TRANSIENT_BACKUP_MAX_AGE_SECONDS = 600;

export interface IClassifiedStash extends IStashEntry {
	readonly kind: StashKind;
}

export const parseStashList = (output: string): readonly IStashEntry[] =>
	output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => {
			const [ref, message = '', createdAt] = line.split('|');
			const epoch = Number.parseInt(createdAt ?? '', 10);
			return {
				ref: ref ?? line,
				message,
				...(Number.isFinite(epoch)
					? { createdAtEpochSeconds: epoch }
					: {}),
			};
		});

export const classifyStash = (entry: IStashEntry): StashKind =>
	entry.message.trim() === LEFTHOOK_BACKUP_SUBJECT
		? 'lefthook-backup'
		: 'user';

export const classifyStashList = (
	entries: readonly IStashEntry[],
): readonly IClassifiedStash[] =>
	entries.map((entry) => ({ ...entry, kind: classifyStash(entry) }));

const renderEntries = (entries: readonly IStashEntry[]): string =>
	entries
		.map(({ ref, message }) =>
			message.length > 0 ? `${ref}: ${message}` : ref,
		)
		.join('\n');

export const formatStashPolicyError = (
	stashes: readonly IStashEntry[],
): string =>
	[
		'stash policy violation: git stashes are forbidden in this repository.',
		'Reconcile each stash by applying and committing useful work, or drop it after review:',
		renderEntries(stashes),
		'',
		'  git stash show -p <ref>   # inspect',
		'  git stash pop <ref>       # recover into the worktree',
		'  git stash drop <ref>      # discard after review',
	].join('\n');

export const formatDanglingLefthookBackup = (
	stashes: readonly IStashEntry[],
): string =>
	[
		'DANGLING LEFTHOOK BACKUP STASH — this is unrestored work, not a policy nit.',
		'',
		'lefthook hides partially-staged (unstaged) hunks in a stash while a',
		'pre-commit hook runs and restores them when it finishes. No lefthook',
		'process is running now, so this stash was left behind by a hook run that',
		'was interrupted (SIGINT, tool timeout, killed agent). The hunks it holds',
		'are NOT in your worktree.',
		'',
		renderEntries(stashes),
		'',
		'Recover it before doing anything else:',
		'',
		'  git stash show -p stash@{0}   # see what is in there',
		'  git stash pop  stash@{0}      # put it back in the worktree',
		'',
		'lefthook 2.1.10 has no option to disable this backup; detecting the',
		'leftover is the only available mitigation.',
	].join('\n');

/**
 * True when a lefthook process is alive — meaning any `lefthook auto backup`
 * stash on disk is that run's live, transient backup rather than a leftover.
 *
 * Checked in two ways, cheapest first:
 *  1. our own ancestor chain via /proc (we are normally a grandchild of the
 *     lefthook binary that invoked this check);
 *  2. a repo-wide scan of /proc for any live lefthook process, which covers
 *     the concurrent-agent case where another agent's hook run owns the stash.
 *
 * On a platform without /proc we return `true` (assume transient): a false
 * "everything is fine" is far better than a false alarm that teaches agents
 * to ignore this guard.
 */
export const isLefthookRunning = (
	readdir: () => readonly string[] = () => readdirSync('/proc'),
	readCmdline: (pid: string) => string = (pid) =>
		readFileSync(`/proc/${pid}/cmdline`, 'utf8'),
): boolean => {
	let pids: readonly string[];
	try {
		pids = readdir();
	} catch {
		return true;
	}
	for (const pid of pids) {
		if (!/^\d+$/.test(pid)) continue;
		try {
			const cmdline = readCmdline(pid).replace(/\0/g, ' ');
			if (/(^|[/\s])lefthook(-linux[^\s]*)?($|[\s/])/.test(cmdline)) {
				return true;
			}
		} catch {
			// process exited between readdir and read — ignore
		}
	}
	return false;
};

export const runNoStashesCheck = (
	lefthookRunning: boolean = isLefthookRunning(),
): number => {
	const result = spawnSync('git', ['stash', 'list', '--format=%gd|%gs|%ct'], {
		encoding: 'utf8',
	});
	if (result.status !== 0) {
		console.error('stash policy check could not inspect git stash list.');
		return result.status ?? 1;
	}

	const classified = classifyStashList(parseStashList(result.stdout ?? ''));
	const userStashes = classified.filter((entry) => entry.kind === 'user');
	const backups = classified.filter(
		(entry) => entry.kind === 'lefthook-backup',
	);

	let status = 0;

	// A lefthook backup is only this run's live, transient state if a lefthook
	// process is alive AND the stash was made seconds ago. An OLD backup with
	// a lefthook process running belongs to an earlier, interrupted run — that
	// is exactly the dangling case, and age is the only thing that separates
	// the two (both carry the identical reflog subject).
	const nowSeconds = Math.floor(Date.now() / 1000);
	const isTransient = (entry: IClassifiedStash): boolean => {
		if (!lefthookRunning) return false;
		const createdAt = entry.createdAtEpochSeconds;
		if (createdAt === undefined) return true;
		return nowSeconds - createdAt <= TRANSIENT_BACKUP_MAX_AGE_SECONDS;
	};
	const danglingBackups = backups.filter((entry) => !isTransient(entry));

	if (backups.length > 0) {
		if (danglingBackups.length === 0) {
			// The guard runs INSIDE lefthook. Reporting lefthook's own live
			// backup would be a violation caused by the guard's own runner.
			console.log(
				`stash policy: ignoring ${backups.length} transient lefthook backup stash(es) (a lefthook run is in flight).`,
			);
		} else {
			console.error(formatDanglingLefthookBackup(danglingBackups));
			status = 1;
		}
	}

	if (userStashes.length > 0) {
		console.error(formatStashPolicyError(userStashes));
		status = 1;
	}

	if (status === 0 && backups.length === 0)
		console.log('stash policy: clean');
	return status;
};

if (import.meta.main) process.exit(runNoStashesCheck());
