/**
 * close-actor.resolver.ts — who is closing, and is that a unit's owner.
 *
 * The close gate asks "is the caller a provably active actor?". Before
 * this, the caller was never named: the gate compared a task id spelled
 * `proposal-SLICE` against claims spelled `proposal/slice` and supplied
 * no agent, so a claim made one call earlier could not be recognised as
 * the caller's. Three facts decide it, resolved here once:
 *
 *  - the actor: an explicit `agent`, else what the environment declares
 *    (`DELENDAI_AGENT_ID`), else the agent the checkout's work ref names;
 *  - the task, in one canonical spelling whatever spelling a claim used;
 *  - whether the checkout is the actor's own unit for this slice, which
 *    is itself proof the actor is at work on it, with or without a claim.
 *
 * Unit ownership is read from the work ref behind `unitOwnerOf`, the one
 * place a unit lease can replace it.
 */
import {
	compileWorkRefParser,
	resolveWorkAgentId,
} from '@delendai/core/public';

import type { IWorkRefShape } from '../contracts/interfaces/review-attribution.interface';
import { unitOfRef } from '../services/review-claims.service';

export type ICloseActorSource =
	| 'argument'
	| 'environment'
	| 'work-ref'
	| 'none';

/** The unit a checkout is on, as its work ref names it. */
export interface IUnitOwner {
	readonly agent: string;
	readonly proposal: string;
	readonly slice: string;
	readonly branch: string;
}

export interface ICloseActor {
	readonly agent: string | undefined;
	readonly source: ICloseActorSource;
	/** The unit the checkout is on, when it is a work unit. */
	readonly unit: IUnitOwner | undefined;
	/** True when `unit` is this actor's own, for the slice being closed. */
	readonly ownsUnit: boolean;
}

const TASK_ID_PATTERN = /^([a-z]\d{3,})[/:-](.+)$/iu;

/**
 * One spelling for a slice's task id: `x00871/S1`, `x00871:s1` and
 * `x00871-S1` are the same task. Anything not shaped like a slice task
 * is compared as written.
 */
export const canonicalTaskId = (taskId: string): string => {
	const trimmed = taskId.trim();
	const match = TASK_ID_PATTERN.exec(trimmed);
	return match === null
		? trimmed
		: `${match[1]!.toLowerCase()}-${match[2]!.toUpperCase()}`;
};

const normalizedAgent = (value: string): string =>
	resolveWorkAgentId({ model: value }).id;

/**
 * The owner of the unit a branch names — the seam a unit lease replaces.
 * `undefined` when the branch is not a work ref or the project names none.
 */
export const unitOwnerOf = (
	branch: string | undefined,
	shape: IWorkRefShape | undefined,
): IUnitOwner | undefined => {
	if (branch === undefined || branch === '' || shape === undefined) {
		return undefined;
	}
	const unit = unitOfRef(`refs/heads/${branch}`, shape);
	if (unit === undefined) return undefined;
	const identity = compileWorkRefParser(
		shape.workRefTemplate,
		shape.workRefPrefix,
	)?.parse(unit);
	if (identity === undefined || identity.agent === '') return undefined;
	return {
		agent: identity.agent,
		proposal: identity.proposal,
		slice: identity.slice,
		branch,
	};
};

const sameText = (left: string, right: string): boolean =>
	left.toLowerCase() === right.toLowerCase();

export const resolveCloseActor = (input: {
	readonly agent?: string | undefined;
	readonly environment?: string | undefined;
	readonly branch?: string | undefined;
	readonly shape?: IWorkRefShape | undefined;
	readonly proposalId: string;
	readonly sliceId: string;
}): ICloseActor => {
	const unit = unitOwnerOf(input.branch, input.shape);
	const declared = resolveWorkAgentId({
		...(input.agent === undefined ? {} : { model: input.agent }),
		...(input.environment === undefined
			? {}
			: { environment: input.environment }),
	});
	const named = declared.source === 'none' ? undefined : declared;
	const agent = named?.id ?? unit?.agent;
	const source: ICloseActorSource =
		named === undefined
			? unit === undefined
				? 'none'
				: 'work-ref'
			: named.source === 'model'
				? 'argument'
				: 'environment';
	const ownsUnit =
		unit !== undefined &&
		agent !== undefined &&
		normalizedAgent(unit.agent) === normalizedAgent(agent) &&
		sameText(unit.proposal, input.proposalId) &&
		(sameText(unit.slice, input.sliceId) || sameText(unit.slice, 'all'));
	return { agent, source, unit, ownsUnit };
};
