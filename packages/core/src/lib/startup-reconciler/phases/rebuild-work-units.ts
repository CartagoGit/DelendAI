/**
 * rebuild-work-units.ts — phase 4: the refs are the truth, the database
 * is the view.
 *
 * This is the phase that makes "close the laptop, open the office
 * machine" work. The office machine has an empty database and a full set
 * of `wip/*` refs; each ref names a `(proposal, slice, generation)`, so
 * walking them recreates the work units and their checkpoints. Both
 * writes are keyed on identities the work model derives (`ensure` on
 * `(repository, proposal, slice)`, `record` on `(work unit, generation)`),
 * which is why re-walking converges instead of accumulating — twenty
 * boots leave exactly the rows one boot leaves.
 *
 * Three conditions here are refused rather than resolved:
 *
 *   - two refs claiming the SAME generation: whichever one we recorded,
 *     the other agent's checkpoint would silently lose its identity;
 *   - a ref whose tip is no longer a descendant of the checkpoint we
 *     recorded: history was rewritten under us, and the commits in
 *     between exist nowhere else;
 *   - a ref that matches no identity at all: its commits cannot be
 *     attributed, and inventing an owner is worse than saying so.
 *
 * None of the three deletes anything. They degrade the boot and emit a
 * repair task.
 */

import type { IStartupFinding } from '../contracts';
import { finding } from '../finding-catalog';
import type {
	IObservedRef,
	IStartupGitSeam,
	IStartupRepositoryKey,
	IWorkRefSnapshot,
} from '../seams';
import type { IStartupStatePorts } from '../state-ports';
import type { IWorkRefParser } from '../work-ref-identity';

/** A ref the boot successfully tied back to a work unit. */
export interface IRebuiltRef {
	readonly ref: string;
	readonly sha: string;
	readonly workUnitId: number;
	readonly workUnitUid: string;
	readonly generation: number;
	readonly snapshot?: IWorkRefSnapshot | undefined;
}

/** What phase 4 produced. */
export interface IWorkRefPhaseResult {
	readonly findings: readonly IStartupFinding[];
	readonly counters: {
		readonly refsExamined: number;
		readonly refsSkippedUnchanged: number;
		readonly workUnitsRebuilt: number;
		readonly generationsRecorded: number;
	};
	readonly rebuilt: readonly IRebuiltRef[];
}

export interface IWorkRefPhaseInput {
	readonly ports: IStartupStatePorts;
	readonly git: IStartupGitSeam;
	readonly parser: IWorkRefParser | undefined;
	readonly refs: readonly IObservedRef[];
	readonly repository: IStartupRepositoryKey;
	readonly repositoryId: number;
	readonly integrationRef: string;
	readonly integrationSha: string;
	readonly agentId: string;
	readonly machineId: string;
	readonly mode: 'full' | 'incremental';
	/** Ref SHAs the previous run on this machine already examined. */
	readonly previousRefs: Readonly<Record<string, string>>;
	readonly now: number;
}

const identityKey = (proposal: string, slice: string, generation: number) =>
	`${proposal}/${slice}@${String(generation)}`;

export const runWorkRefPhase = async (
	input: IWorkRefPhaseInput,
): Promise<IWorkRefPhaseResult> => {
	const findings: IStartupFinding[] = [];
	const rebuilt: IRebuiltRef[] = [];
	let refsExamined = 0;
	let refsSkippedUnchanged = 0;
	let workUnitsRebuilt = 0;
	let generationsRecorded = 0;

	if (input.parser === undefined) {
		return {
			findings,
			counters: {
				refsExamined: 0,
				refsSkippedUnchanged: 0,
				workUnitsRebuilt: 0,
				generationsRecorded: 0,
			},
			rebuilt,
		};
	}

	// Pass 1 — identity only. No git, no writes: a duplicate must be
	// detected BEFORE either of the two refs is recorded.
	const byIdentity = new Map<string, IObservedRef[]>();
	const attributed = new Map<string, ReturnType<IWorkRefParser['parse']>>();
	for (const ref of input.refs) {
		const identity = input.parser.parse(ref.name);
		if (identity === undefined || identity.generation < 1) {
			findings.push(
				finding({
					code: 'work-refs.unattributable',
					phase: 'work-refs',
					kind: 'blocker',
					subject: ref.name,
					message: `The ref ${ref.name} matches no work identity under the policy's template; its commits cannot be attributed and it was left untouched.`,
					detail: { sha: ref.sha },
				}),
			);
			continue;
		}
		attributed.set(ref.name, identity);
		const key = identityKey(
			identity.proposal,
			identity.slice,
			identity.generation,
		);
		const bucket = byIdentity.get(key);
		if (bucket === undefined) byIdentity.set(key, [ref]);
		else bucket.push(ref);
	}

	const conflicted = new Set<string>();
	for (const [key, group] of byIdentity) {
		if (group.length < 2) continue;
		const names = group.map((ref) => ref.name).sort();
		for (const name of names) conflicted.add(name);
		findings.push(
			finding({
				code: 'work-refs.duplicate-generation',
				phase: 'work-refs',
				kind: 'blocker',
				subject: names.join(' + '),
				message: `Two work refs claim ${key}. Neither was recorded, neither was deleted, and no owner was invented.`,
				detail: { identity: key, refs: names.join(',') },
			}),
		);
	}

	// Pass 2 — the writes, only for refs whose identity is unambiguous.
	// The set of units this repository already had is read ONCE: it is
	// what distinguishes "rebuilt from a ref" from "already known", which
	// is the number the idempotency test asserts on.
	const knownUnits = new Set(
		input.ports.workUnits
			.listForRepository(input.repositoryId)
			.map((unit) => `${unit.proposalUid}/${unit.sliceUid}`),
	);
	for (const ref of input.refs) {
		const identity = attributed.get(ref.name);
		if (identity === undefined || conflicted.has(ref.name)) continue;

		const unitKey = `${identity.proposal}/${identity.slice}`;
		const isNewUnit = !knownUnits.has(unitKey);
		const unit = input.ports.workUnits.ensure({
			repositoryId: input.repositoryId,
			repository: input.repository,
			proposalUid: identity.proposal,
			sliceUid: identity.slice,
			createdByAgentId: identity.agent,
			now: input.now,
		});
		if (isNewUnit) {
			knownUnits.add(unitKey);
			workUnitsRebuilt += 1;
			findings.push(
				finding({
					code: 'work-refs.work-unit-rebuilt',
					phase: 'work-refs',
					kind: 'repaired',
					subject: unit.uid,
					message: `Rebuilt work unit ${unit.uid} from the ref ${ref.name}; local state did not know it.`,
				}),
			);
		}

		const existing = input.ports.generations.get(
			unit.id,
			identity.generation,
		);
		const unchanged =
			input.mode === 'incremental' &&
			input.previousRefs[ref.name] === ref.sha &&
			existing !== null &&
			existing.wipHeadSha === ref.sha;
		if (unchanged) {
			refsSkippedUnchanged += 1;
			rebuilt.push({
				ref: ref.name,
				sha: ref.sha,
				workUnitId: unit.id,
				workUnitUid: unit.uid,
				generation: identity.generation,
			});
			continue;
		}

		refsExamined += 1;
		if (existing !== null && existing.wipHeadSha !== ref.sha) {
			const stillContained = await input.git.isAncestor(
				existing.wipHeadSha,
				ref.sha,
			);
			if (!stillContained) {
				findings.push(
					finding({
						code: 'work-refs.history-rewritten',
						phase: 'work-refs',
						kind: 'blocker',
						subject: ref.name,
						message: `The recorded checkpoint ${existing.wipHeadSha} is no longer contained in ${ref.name}; the ref was NOT re-recorded and nothing was discarded.`,
						detail: {
							recorded: existing.wipHeadSha,
							live: ref.sha,
						},
					}),
				);
				continue;
			}
		}

		const snapshot = await input.git.describeRef(
			ref.name,
			input.integrationRef,
		);
		if (snapshot === undefined) {
			findings.push(
				finding({
					code: 'work-refs.unattributable',
					phase: 'work-refs',
					kind: 'blocker',
					subject: ref.name,
					message: `The ref ${ref.name} could not be read from git; it was left untouched.`,
				}),
			);
			continue;
		}

		// A checkpoint already contained in the integration branch IS a
		// merge candidate: the schema only lets such a row carry an
		// integrated SHA, and phase 7 is about to record exactly that.
		const contained =
			input.integrationSha.length > 0 &&
			(await input.git.isAncestor(snapshot.sha, input.integrationSha));
		input.ports.generations.record({
			workUnitId: unit.id,
			generation: identity.generation,
			baseIntegrationSha:
				snapshot.baseSha.length > 0
					? snapshot.baseSha
					: input.integrationSha,
			wipRef: snapshot.name,
			wipHeadSha: snapshot.sha,
			patchDigest: snapshot.patchDigest,
			fileScope: snapshot.fileScope,
			checkpointKind: contained ? 'merge-candidate' : 'durability',
			authorAgentId: identity.agent,
			machineId: input.machineId,
			now: input.now,
		});
		generationsRecorded += 1;
		findings.push(
			finding({
				code: 'work-refs.generation-recorded',
				phase: 'work-refs',
				kind: 'repaired',
				subject: `${unit.uid}@${String(identity.generation)}`,
				message: `Recorded checkpoint ${snapshot.sha} observed on ${ref.name}.`,
			}),
		);
		input.ports.workUnits.advanceGeneration(
			unit.uid,
			identity.generation,
			input.now,
		);
		rebuilt.push({
			ref: ref.name,
			sha: ref.sha,
			workUnitId: unit.id,
			workUnitUid: unit.uid,
			generation: identity.generation,
			snapshot,
		});
	}

	return {
		findings,
		counters: {
			refsExamined,
			refsSkippedUnchanged,
			workUnitsRebuilt,
			generationsRecorded,
		},
		rebuilt,
	};
};
