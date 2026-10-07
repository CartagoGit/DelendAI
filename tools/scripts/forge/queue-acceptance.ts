/**
 * queue-acceptance.ts — which queued candidates land as they are, read
 * from git in the checkout the queue runs in (f00755).
 */
import { execFileSync } from 'node:child_process';

import { footprintBetween, mergeBaseOf } from './candidate-footprint';
import { acceptIndependent } from './independent-candidates';
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

/**
 * The verdict for each candidate, in the order given. A candidate whose
 * commits cannot be read is not accepted: it is brought forward, as every
 * candidate was before.
 */
export const queueAcceptance = (input: {
	readonly root: string;
	readonly remote: string;
	readonly integration: string;
	readonly integrationSha: string;
	readonly candidates: readonly IQueuedCandidate[];
}): readonly ICandidateAcceptance[] => {
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
		const level = base === input.integrationSha;
		changes.push({
			number: candidate.number,
			headRef: candidate.headRef,
			level,
			own: footprintBetween(input.root, base, candidate.headSha),
			integration: level
				? { zones: new Set(), files: new Set() }
				: footprintBetween(input.root, base, input.integrationSha),
		});
	}
	return [...acceptIndependent(changes), ...unreadable];
};

const revParse = (root: string, ref: string): string | undefined => {
	try {
		return execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], {
			cwd: root,
			encoding: 'utf8',
		}).trim();
	} catch {
		return undefined;
	}
};

/**
 * The queued branches that land as they are, from the machine that brings
 * candidates forward: the same verdicts the queue job arms by, so that
 * machine does not bring forward (and send back to its checks) a
 * candidate the queue is about to land.
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
	return new Set(
		queueAcceptance({ ...input, integrationSha, candidates })
			.filter((verdict) => verdict.accepted)
			.map((verdict) => verdict.headRef),
	);
};
