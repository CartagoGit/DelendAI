/**
 * pull-request-urgency.service.ts — `--urgent=<reason>` leaves its mark on
 * the pull request.
 *
 * `work deliver --urgent` moved the unit's proof ahead in the compute slot
 * and left nothing on the pull request, so the queue, which reads only
 * pull requests, could not lead with it. The reason travels as one line of
 * the pull request's body (`Urgent: <reason>`): the list of open pull
 * requests the queue already reads carries the body, so reading it costs
 * the queue no call, where a label would cost one to create and one to
 * read.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scalarArg } from './command-args.helper';
import { worktreeOfRef } from './unit-removal.service';

const URGENT_LINE = /^Urgent: (?<reason>.+)$/mu;

/** The body line that carries the reason, one line whatever the reason says. */
export const urgentLine = (reason: string): string =>
	`Urgent: ${reason.replace(/\s+/gu, ' ').trim()}`;

/** The urgent reason a pull request body carries, or `undefined`. */
export const urgentReasonOfBody = (
	body: string | null | undefined,
): string | undefined => {
	const reason = URGENT_LINE.exec(body ?? '')?.groups?.reason?.trim();
	return reason === undefined || reason.length === 0 ? undefined : reason;
};

const NOTE = 'delendai-urgent';

const gitDirOf = (worktree: string): string | undefined => {
	try {
		return execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
			cwd: worktree,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return undefined;
	}
};

/**
 * Remember, in the unit's own git directory (per worktree, never
 * committed), that its delivery is urgent: the transition that publishes
 * it runs apart from the command that was told so.
 */
export const noteUnitUrgency = async (
	worktree: string,
	reason: string,
): Promise<boolean> => {
	const dir = gitDirOf(worktree);
	if (dir === undefined || reason.trim().length === 0) return false;
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, NOTE), `${urgentLine(reason)}\n`);
	return true;
};

/** The reason noted for the unit at `worktree`, if any. */
export const unitUrgencyNote = async (
	worktree: string,
): Promise<string | undefined> => {
	const dir = gitDirOf(worktree);
	if (dir === undefined) return undefined;
	return urgentReasonOfBody(
		await readFile(join(dir, NOTE), 'utf8').catch(() => ''),
	);
};

/**
 * Why this publication is urgent: said to the command, else noted by the
 * delivery. Read before the publication removes the worktree that holds
 * the note.
 */
export const urgencyOfUnit = async (
	args: readonly string[],
	root: string,
	workRef: string,
): Promise<string | undefined> => {
	const stated = scalarArg(args, 'urgent');
	if (stated !== undefined) return stated;
	const worktree = worktreeOfRef(
		root,
		workRef.replace(/^refs\/heads\//u, ''),
	);
	return worktree === undefined ? undefined : unitUrgencyNote(worktree);
};

/**
 * The body with the urgent line added, or `undefined` when it already
 * carries one: a delivery from a CLI older than the mark left none.
 */
export const bodyWithUrgentLine = (
	body: string | null | undefined,
	reason: string,
): string | undefined =>
	urgentReasonOfBody(body) === undefined
		? `${(body ?? '').trimEnd()}\n\n${urgentLine(reason)}\n`.replace(
				/^\n+/u,
				'',
			)
		: undefined;

/**
 * Where the unit that published `publicationRef` noted its urgency while its
 * worktree lives: `delendai/pr/<…>` is published from `delendai/wip/<…>`.
 */
export const urgencyNotePathOfPublication = (
	root: string,
	publicationRef: string,
): string | undefined => {
	const worktree = worktreeOfRef(
		root,
		publicationRef.replace(/^([^/]+)\/pr\//u, '$1/wip/'),
	);
	const dir = worktree === undefined ? undefined : gitDirOf(worktree);
	return dir === undefined ? undefined : join(dir, NOTE);
};
