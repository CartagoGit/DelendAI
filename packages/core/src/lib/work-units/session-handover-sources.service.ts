/**
 * session-handover-sources.service.ts — the readers that feed the handover
 * from what git and the work-unit leases already hold. A section no reader
 * here answers is reported missing by the handover, never guessed.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { ISwarmUnit } from '../contracts/interfaces/work-swarm.interface';
import type {
	IHandoverEntry,
	ISessionHandoverSources,
} from './session-handover.interface';
import { readSwarm } from './work-swarm.service';

const unitEntry = (unit: ISwarmUnit): IHandoverEntry => ({
	id: unit.ref,
	summary: `${unit.agent} ${unit.subject}: ${String(unit.ahead)} ahead, ${String(unit.behind)} behind`,
	source: unit.ref,
});

const commitEntry = (unit: ISwarmUnit): IHandoverEntry => ({
	id: unit.tip,
	summary: `tip of ${unit.ref}`,
	source: unit.ref,
});

/** Readers over the work refs of this clone; the swarm is read once. */
export const handoverSourcesFor = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
}): ISessionHandoverSources => {
	let swarm: ReturnType<typeof readSwarm> | undefined;
	const view = () => {
		swarm ??= readSwarm(input);
		return swarm;
	};
	return {
		units: async () => view().units.map(unitEntry),
		branches: async () => view().published.map(unitEntry),
		commits: async () => view().units.map(commitEntry),
	};
};
