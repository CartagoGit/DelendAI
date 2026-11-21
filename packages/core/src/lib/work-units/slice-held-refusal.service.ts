/**
 * slice-held-refusal.service.ts — the refusal `work enter` gives when a
 * slice is held. Only a live lease holds a slice: a unit its owner left, or
 * whose work landed, holds nothing, though the swarm view still shows it.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IWorkUnitResult } from '../contracts/interfaces/work-unit-context.interface';
import { describeSliceHolders, holdersOfSlice } from './slice-holders.service';
import { readUnitStandings } from './unit-standings.service';
import { refused } from './work-unit-shared.service';
import type { ISwarmView } from '../contracts/interfaces/work-swarm.interface';

export const sliceHeldRefusal = async (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly swarm: ISwarmView;
	readonly agent: string;
	readonly kind: string;
	readonly proposal: string;
	readonly slice: string;
}): Promise<IWorkUnitResult | undefined> => {
	const { root, policy, swarm, agent, kind, proposal, slice } = input;
	const standings = await readUnitStandings({ root, policy });
	const holders = holdersOfSlice({
		view: swarm,
		standings,
		agent,
		kind,
		proposal,
		slice,
	});
	if (holders.length === 0) return undefined;
	return refused(
		`${proposal} ${slice} is already being worked on under a live lease: two units on one slice do the same work twice and collide when they land.`,
		describeSliceHolders(holders, standings).join('\n'),
	);
};
