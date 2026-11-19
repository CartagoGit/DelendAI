/**
 * work-deliver-remote.service.ts — a delivery says "pushed" only for a
 * publication ref the remote holds.
 *
 * WHY: the hand-over to review publishes apart from `work deliver` (the
 * guard hook runs `work publish` detached), so a publication that never
 * happened answered "pushed" all the same. Here the remote is read: the
 * ref must exist, and a commit of this clone must be contained in it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { ICliCommandResult } from '../contracts/interfaces/cli-command.interface';
import { REMOTE_PUBLICATION_WAIT } from '../contracts/constants/remote-publication-wait.constant';
import type { IRemotePublicationWait } from '../contracts/interfaces/remote-publication-wait.interface';
import type { IWorkDeliverPorts } from '../contracts/interfaces/work-deliver.interface';

const git = (cwd: string, args: readonly string[]): string | undefined => {
	const run = spawnSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
	});
	return run.status === 0 ? run.stdout.trim() : undefined;
};

/** The sha the remote holds for a branch; undefined when it holds none. */
export const remoteTipOf = (
	cwd: string,
	remote: string,
	branch: string,
): string | undefined => {
	const name = branch.replace(/^refs\/heads\//u, '');
	const listed = git(cwd, ['ls-remote', remote, `refs/heads/${name}`]);
	const sha = listed?.split(/\s+/u)[0] ?? '';
	return sha.length === 0 ? undefined : sha;
};

/**
 * Whether the remote holds `branch` with `head` in it, read up to the
 * wait's attempts, `pause` between them.
 */
export const publicationOnRemote = async (input: {
	readonly cwd: string;
	readonly branch: string;
	/** The head the remote must hold; undefined once the unit's checkout is gone, when only the ref's existence is read. */
	readonly head: string | undefined;
	readonly remote?: string;
	readonly wait?: IRemotePublicationWait;
	readonly pause?: (ms: number) => Promise<void>;
	readonly tipOf?: typeof remoteTipOf;
}): Promise<boolean> => {
	const remote = input.remote ?? 'origin';
	const wait = input.wait ?? REMOTE_PUBLICATION_WAIT;
	const tipOf = input.tipOf ?? remoteTipOf;
	const pause =
		input.pause ??
		((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
	for (let attempt = 1; attempt <= wait.attempts; attempt += 1) {
		const tip = tipOf(input.cwd, remote, input.branch);
		if (
			tip !== undefined &&
			(input.head === undefined ||
				tip === input.head ||
				git(input.cwd, [
					'merge-base',
					'--is-ancestor',
					input.head,
					tip,
				]) !== undefined)
		) {
			return true;
		}
		if (attempt < wait.attempts) await pause(wait.pauseMs);
	}
	return false;
};

/**
 * The refusal of a hand-over whose publication the remote does not hold:
 * the unit has no publication name, or the ref is absent (or lacks the
 * head) after the wait. The hand-over published apart from this command,
 * and nothing had checked that it did.
 */
export const unpublishedRefusal = async (
	ports: IWorkDeliverPorts,
	unit: Record<string, unknown>,
	checkout: string | undefined,
): Promise<ICliCommandResult | undefined> => {
	const publication = (
		typeof unit.publication === 'string' && unit.publication !== ''
			? unit.publication
			: undefined
	)?.replace(/^refs\/heads\//u, '');
	if (publication === undefined) {
		return {
			code: EXIT_CODE.VALIDATION,
			error: "the unit has no publication name: its work ref is under none of the policy's work-ref prefixes, so nothing was published. Fix the name, then deliver again.",
		};
	}
	if (await ports.publicationReached(publication, checkout)) return undefined;
	return {
		code: EXIT_CODE.VALIDATION,
		error: `the hand-over to review did not publish: the remote holds no \`${publication}\` with this unit's head. The unit is proved and in review; run \`delendai work publish\` from it, and find why the hand-over did not.`,
	};
};

/** The remote holds the publication with the unit checkout's head in it. */
export const publicationReachedFrom = async (
	checkout: string,
	fallback: string,
	publication: string,
): Promise<boolean> => {
	// The publication removes the unit's checkout: the remote is then read
	// from where the command runs, for the ref's existence alone.
	const present = existsSync(checkout);
	return publicationOnRemote({
		cwd: present ? checkout : fallback,
		branch: publication,
		head: present ? git(checkout, ['rev-parse', 'HEAD']) : undefined,
	});
};
