/**
 * commit-maker-notes.service.ts — who made a commit is written when it is
 * made, not reconstructed later.
 *
 * Work an agent carried into its own unit was attributed to it, because
 * the maker could only be inferred afterwards from commit dates and the
 * refs that held each commit; when the evidence was not conclusive the
 * maker was lost. Each commit in a unit now gets a note (`maker`, `unit`)
 * under its agent's own notes ref, pushed with the unit; the maker of a
 * commit is read from those notes first, and inference stays only the
 * fallback for work made before.
 */
import {
	MAKER_NOTES_PREFIX,
	MAKER_NOTES_REMOTE_PREFIX,
} from '../contracts/constants/commit-maker-notes.constant';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { ICommitMaker } from '../contracts/interfaces/commit-maker.interface';
import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import { DELENDAI_SESSION_VARIABLE } from '../contracts/constants/agent-environment.constant';
import { workUnitIdentityOf } from '../development-policy/git-guard-unit';
import { createGitRunner } from '../shared/git-write';
import { integrationRemote } from './work-unit-shared.service';

const notesRefOf = (agent: string): string => `${MAKER_NOTES_PREFIX}${agent}`;

/** How often a note write is retried when another instance holds the ref. */
const NOTE_WRITE_ATTEMPTS = 5;

const pause = (ms: number): Promise<void> =>
	new Promise((resolveAfter) => setTimeout(resolveAfter, ms));

/**
 * Records `agent` as the maker of the commit at `HEAD`, made in `unit`
 * (and `session`, when one is known). Several instances of one model share
 * the agent's name and, on one machine, its notes ref: the unit — one per
 * instance — is what tells them apart, and a write that loses the ref's
 * lock to another instance is retried instead of lost.
 */
export const recordCommitMaker = async (
	git: IGitRunner,
	agent: string,
	unit: string,
	session?: string,
): Promise<boolean> => {
	const note = [
		`maker: ${agent}`,
		`unit: ${unit}`,
		...(session === undefined ? [] : [`session: ${session}`]),
	].join('\n');
	for (let attempt = 1; attempt <= NOTE_WRITE_ATTEMPTS; attempt++) {
		const written = await git([
			'notes',
			`--ref=${notesRefOf(agent)}`,
			'add',
			'-f',
			'-m',
			note,
			'HEAD',
		]);
		if (written.ok) return true;
		await pause(50 * attempt);
	}
	return false;
};

/**
 * Pushes `agent`'s notes. Another instance of the same agent may have
 * pushed first: its notes are fetched, merged into ours (every line kept),
 * and the push is tried once more.
 */
export const pushMakerNotes = async (
	git: IGitRunner,
	remote: string,
	agent: string,
): Promise<boolean> => {
	const ref = notesRefOf(agent);
	if ((await git(['push', '--quiet', remote, `${ref}:${ref}`])).ok)
		return true;
	const incoming = `${MAKER_NOTES_REMOTE_PREFIX}${agent}`;
	if (!(await git(['fetch', '--quiet', remote, `+${ref}:${incoming}`])).ok)
		return false;
	if (
		!(
			await git([
				'notes',
				`--ref=${ref}`,
				'merge',
				'-s',
				'cat_sort_uniq',
				incoming,
			])
		).ok
	)
		return false;
	return (await git(['push', '--quiet', remote, `${ref}:${ref}`])).ok;
};

/** Brings every agent's notes from the forge, beside (not over) the local ones. */
export const fetchMakerNotes = async (
	git: IGitRunner,
	remote: string,
): Promise<boolean> =>
	(
		await git([
			'fetch',
			'--quiet',
			remote,
			`+${MAKER_NOTES_PREFIX}*:${MAKER_NOTES_REMOTE_PREFIX}*`,
		])
	).ok;

/**
 * The maker (and unit) each commit's notes name, local or fetched; a
 * commit nobody recorded is absent.
 */
export const makersOf = async (
	git: IGitRunner,
	commits: readonly string[],
): Promise<ReadonlyMap<string, ICommitMaker>> => {
	const makers = new Map<string, ICommitMaker>();
	for (const commit of commits) {
		const shown = await git([
			'log',
			'-1',
			`--notes=${MAKER_NOTES_PREFIX}*`,
			`--notes=${MAKER_NOTES_REMOTE_PREFIX}*`,
			'--format=%N',
			commit,
		]);
		const maker = shown.ok
			? /^maker: (\S+)$/mu.exec(shown.output)?.[1]
			: undefined;
		const unit = shown.ok
			? /^unit: (\S+)$/mu.exec(shown.output)?.[1]
			: undefined;
		if (maker !== undefined)
			makers.set(commit, {
				agent: maker,
				...(unit === undefined ? {} : { unit }),
			});
	}
	return makers;
};

/**
 * After a commit in a unit's worktree: its maker is the unit's agent, as
 * the branch name says; the note is written and pushed with the unit. A
 * commit on any other branch records nothing.
 */
export const recordUnitCommit = async (
	cwd: string,
	policy: IResolvedDevelopmentPolicy,
	branch: string | undefined,
): Promise<boolean> => {
	if (branch === undefined) return false;
	const identity = workUnitIdentityOf(policy, branch);
	if (identity === undefined) return false;
	const git = createGitRunner(cwd);
	const session = process.env[DELENDAI_SESSION_VARIABLE];
	if (!(await recordCommitMaker(git, identity.agent, branch, session)))
		return false;
	return pushMakerNotes(git, integrationRemote(cwd, policy), identity.agent);
};
