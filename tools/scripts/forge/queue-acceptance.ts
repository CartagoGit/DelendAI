/**
 * queue-acceptance.ts — which queued candidates land as they are, read
 * from git in the checkout the queue runs in (f00755).
 */
import { execFileSync } from 'node:child_process';
import { readGit } from '@delendai/core/runtime';

import { footprintBetween, mergeBaseOf } from './candidate-footprint';
import { testedAgainst } from './candidate-tested-base';
import {
	acceptIndependent,
	acceptRiders,
	type ITrainPriority,
} from './independent-candidates';
import type {
	ICandidateAcceptance,
	IQueueCandidateChange,
} from './independent-candidates.interface';

export interface IQueuedCandidate {
	readonly number: number;
	readonly headRef: string;
	readonly headSha: string;
}

const fetched = (root: string, remote: string, ref: string): boolean => {
	try {
		execFileSync('git', ['fetch', '-q', '--', remote, ref], {
			cwd: root,
			stdio: 'ignore',
		});
		return true;
	} catch {
		return false;
	}
};

interface IQueueAcceptanceInput {
	readonly root: string;
	readonly remote: string;
	readonly integration: string;
	readonly integrationSha: string;
	readonly candidates: readonly IQueuedCandidate[];
	/** The integration commit a candidate's run saw; see candidate-tested-base. */
	readonly testedFrom?: (headSha: string, base: string) => string | undefined;
}

/**
 * What each candidate changed and what the integration branch changed
 * under it, read once for both verdicts; and the candidates whose commits
 * cannot be read here, which are accepted by neither.
 */
const changesOf = (
	input: IQueueAcceptanceInput,
): {
	readonly changes: readonly IQueueCandidateChange[];
	readonly unreadable: readonly ICandidateAcceptance[];
} => {
	const testedFrom =
		input.testedFrom ??
		((headSha: string, base: string) =>
			testedAgainst({
				root: input.root,
				remote: input.remote,
				integration: input.integration,
				headSha,
				base,
			}));
	fetched(input.root, input.remote, input.integration);
	const changes: IQueueCandidateChange[] = [];
	const unreadable: ICandidateAcceptance[] = [];
	for (const candidate of input.candidates) {
		const base =
			fetched(input.root, input.remote, candidate.headRef) &&
			mergeBaseOf(input.root, input.integrationSha, candidate.headSha);
		if (base === false || base === undefined) {
			unreadable.push({
				number: candidate.number,
				headRef: candidate.headRef,
				accepted: false,
				why: 'its commits could not be read here',
			});
			continue;
		}
		// What the candidate's own checks have not seen starts at the commit
		// they ran on, not at the one it left.
		const seen = testedFrom(candidate.headSha, base) ?? base;
		const level = seen === input.integrationSha;
		changes.push({
			number: candidate.number,
			headRef: candidate.headRef,
			level,
			own: footprintBetween(input.root, base, candidate.headSha),
			integration: level
				? { zones: new Set(), files: new Set() }
				: footprintBetween(input.root, seen, input.integrationSha),
		});
	}
	return { changes, unreadable };
};

/**
 * The verdict for each candidate, in the order given. A candidate whose
 * commits cannot be read is not accepted: it is brought forward, as every
 * candidate was before.
 */
export const queueAcceptance = (
	input: IQueueAcceptanceInput,
): readonly ICandidateAcceptance[] => {
	const { changes, unreadable } = changesOf(input);
	return [...acceptIndependent(changes), ...unreadable];
};

/**
 * Which candidates ride the next train, in train order: every one whose
 * commits can be read, an urgent repair first (see `acceptRiders`).
 */
export const trainRiders = (
	input: IQueueAcceptanceInput & {
		readonly priorityOf?: (
			number: number,
			headRef: string,
		) => ITrainPriority;
	},
): readonly ICandidateAcceptance[] => {
	const { changes, unreadable } = changesOf(input);
	const priorityOf = input.priorityOf;
	return [
		...(priorityOf === undefined
			? acceptRiders(changes)
			: acceptRiders(changes, (change) =>
					priorityOf(change.number, change.headRef),
				)),
		...unreadable,
	];
};

const revParse = (root: string, ref: string): string | undefined => {
	return readGit(root, ['rev-parse', '--verify', '--quiet', ref]);
};

/**
 * The queued branches that land as they are or ride a train, from the
 * machine that brings candidates forward: the same verdicts the queue job
 * arms and assembles trains by, so that machine does not bring forward
 * (and send back to its checks) a candidate the queue is about to land.
 * What is left for it is the candidate that cannot ride a train.
 */
export const branchesLandingAsTheyAre = (input: {
	readonly root: string;
	readonly remote: string;
	readonly integration: string;
	readonly queue: readonly {
		readonly number: number;
		readonly branch: string;
	}[];
}): ReadonlySet<string> => {
	// Fetched BEFORE it is read: the queue job decides with the integration
	// branch as it is now, and a remote-tracking ref this machine last
	// updated an hour ago called a candidate level that the integration
	// branch had since moved past, in the very files it touches.
	fetched(input.root, input.remote, input.integration);
	const integrationSha = revParse(
		input.root,
		`${input.remote}/${input.integration}`,
	);
	if (integrationSha === undefined) return new Set();
	const candidates = input.queue.flatMap((entry) => {
		fetched(input.root, input.remote, entry.branch);
		const headSha = revParse(input.root, `${input.remote}/${entry.branch}`);
		return headSha === undefined
			? []
			: [{ number: entry.number, headRef: entry.branch, headSha }];
	});
	// A candidate that rides a train is proved and landed by it: bringing
	// it forward here as well would spend a local proof on what the
	// train's one run proves. A train runs only for two riders or more; a
	// lone one is brought forward and runs its own checks.
	const { changes } = changesOf({ ...input, integrationSha, candidates });
	const riders = acceptRiders(changes).filter((verdict) => verdict.accepted);
	return new Set(
		[...acceptIndependent(changes), ...(riders.length >= 2 ? riders : [])]
			.filter((verdict) => verdict.accepted)
			.map((verdict) => verdict.headRef),
	);
};
