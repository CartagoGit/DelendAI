/**
 * queue-acceptance.ts — which queued candidates land as they are, read
 * from git in the checkout the queue runs in (f00755).
 */
import {
	acceptIndependent,
	acceptRiders,
	culpritsAmong,
	type ICandidateAcceptance,
	type IQueueCandidateChange,
	type ITrainPriority,
} from '@delendai/core/cli';
import { execFileSync } from 'node:child_process';
import { readGit } from '@delendai/core/runtime';

import { footprintBetween, mergeBaseOf } from './candidate-footprint';
import { testedAgainst } from './candidate-tested-base';

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

/** How long a rider waits for a train before it is brought forward on its own. */
export const TRAIN_GRACE_SECONDS = 900;

/**
 * Whether a pushed train under `prefixes` carries `headSha`: the train is
 * built from the tip with every rider merged, so a rider it carries is
 * proved and landed by it.
 */
const carriedByATrain = (
	root: string,
	remote: string,
	prefixes: readonly string[],
	headSha: string,
	tipSha: string,
): boolean => {
	for (const prefix of prefixes) {
		// Only a train built from the CURRENT tip carries anything: the
		// queue names a train after its tip and prunes the others, and a
		// failed train left from an older tip made this machine wait for
		// a train that would never run, while the queue waited for this
		// machine to bring the rider forward.
		const current = `${prefix}${tipSha.slice(0, 12)}/`;
		const listed =
			readGit(root, ['ls-remote', '--heads', remote, `${current}*`]) ??
			'';
		for (const line of listed.split('\n')) {
			const name = line.split('\t')[1]?.replace(/^refs\/heads\//u, '');
			if (name === undefined || !fetched(root, remote, name)) continue;
			if (
				readGit(root, [
					'merge-base',
					'--is-ancestor',
					headSha,
					`${remote}/${name}`,
				]) !== undefined
			) {
				return true;
			}
		}
	}
	return false;
};

/**
 * The candidates the queue isolated as culprits, by number, with the head
 * each was isolated at: the queue keeps such a candidate off its trains
 * until its head moves, so this machine must not leave it to one.
 */
const culpritHeads = (
	root: string,
	remote: string,
	prefixes: readonly string[],
): ReadonlyMap<number, string> => {
	const branches = new Map<string, string>();
	for (const prefix of prefixes) {
		const listed =
			readGit(root, [
				'ls-remote',
				'--heads',
				remote,
				`${prefix}culprit/*`,
			]) ?? '';
		for (const line of listed.split('\n')) {
			const [sha, ref] = line.split('\t');
			if (sha !== undefined && ref !== undefined) {
				branches.set(ref.replace(/^refs\/heads\//u, ''), sha);
			}
		}
	}
	return culpritsAmong(prefixes, branches);
};

/**
 * The queued branches that land as they are or ride a train, from the
 * machine that brings candidates forward: the same verdicts the queue job
 * arms and assembles trains by, so that machine does not bring forward
 * (and send back to its checks) a candidate the queue is about to land.
 * What is left for it is the candidate that cannot ride a train.
 *
 * A rider is left to the train only while a train can carry it. With
 * `trainPrefixes`, a rider that no pushed train carries, once the tip is
 * older than the grace, is NOT in the set: the train failed (it could not
 * be assembled, pushed or dispatched), the queue lands only what lands as
 * it is, and a rider left to a train that never comes waits forever. It is
 * then brought forward by the individual path, in queue order, and lands
 * by its own merge once green.
 */
export const branchesLandingAsTheyAre = (input: {
	readonly root: string;
	readonly remote: string;
	readonly integration: string;
	readonly queue: readonly {
		readonly number: number;
		readonly branch: string;
	}[];
	readonly trainPrefixes?: readonly string[];
	/** Seconds the integration tip must have stood for a train to be missed. */
	readonly trainGraceSeconds?: number;
	/** The clock, in epoch seconds. */
	readonly now?: number;
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
	const alone = acceptIndependent(changes)
		.filter((verdict) => verdict.accepted)
		.map((verdict) => verdict.headRef);
	const culprits = culpritHeads(
		input.root,
		input.remote,
		input.trainPrefixes ?? [],
	);
	const accepted = acceptRiders(changes)
		.filter((verdict) => verdict.accepted)
		.filter((verdict) => !alone.includes(verdict.headRef))
		.filter((verdict) => {
			const isolated = culprits.get(verdict.number);
			return (
				isolated === undefined ||
				isolated !==
					candidates.find((each) => each.headRef === verdict.headRef)
						?.headSha
			);
		});
	const riding = accepted.length >= 2 ? accepted : [];
	const tipTime = Number(
		readGit(input.root, ['log', '-1', '--format=%ct', integrationSha]) ??
			'0',
	);
	const missed =
		input.trainPrefixes !== undefined &&
		(input.now ?? Math.floor(Date.now() / 1000)) - tipTime >=
			(input.trainGraceSeconds ?? TRAIN_GRACE_SECONDS);
	return new Set([
		...alone,
		...riding
			.filter(
				(verdict) =>
					!missed ||
					carriedByATrain(
						input.root,
						input.remote,
						input.trainPrefixes ?? [],
						candidates.find(
							(each) => each.headRef === verdict.headRef,
						)?.headSha ?? '',
						integrationSha,
					),
			)
			.map((verdict) => verdict.headRef),
	]);
};
