/**
 * fakes.ts — the seams a spec supplies instead of a network.
 *
 * Git and the state database are REAL in these specs (a temp repository
 * and a temp SQLite file); the forge and the durable journal are faked,
 * because "reconcile against GitHub" cannot be asserted offline and
 * because a mutating call to a live forge is exactly what this work must
 * never make. The fakes COUNT their calls: several specs assert that a
 * warm boot asked the forge once and got "not modified", which is a claim
 * about how much work happened, not about the answer.
 */

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import type { IResolvedDevelopmentPolicy } from '@delendai/core/lib/contracts/interfaces/development-policy.interface';
import type {
	IForgeCheckRun,
	IForgePullRequest,
	IJournalSourceEvent,
	IStartupClock,
	IStartupEnvironment,
	IStartupEnvironmentSeam,
	IStartupForgeSeam,
	IStartupJournalSource,
} from '@delendai/core/lib/startup-reconciler/index';

/** A clock the spec controls. */
export interface ITestClock extends IStartupClock {
	advance(ms: number): void;
}

export const testClock = (start = 1_700_000_000_000): ITestClock => {
	let current = start;
	return {
		now: () => current,
		advance: (ms: number) => {
			current += ms;
		},
	};
};

export const REPOSITORY = {
	forge: 'github',
	owner: 'acme',
	name: 'widgets',
} as const;

export const environmentSeam = (input: {
	readonly workspaceRoot: string;
	readonly machineId: string;
	readonly agentId: string;
	readonly withRepository?: boolean;
}): IStartupEnvironmentSeam => ({
	detect: async (): Promise<IStartupEnvironment> => ({
		workspaceRoot: input.workspaceRoot,
		machineId: input.machineId,
		hostname: input.machineId,
		platform: 'linux',
		agentId: input.agentId,
		...(input.withRepository === false ? {} : { repository: REPOSITORY }),
	}),
});

/** A forge that answers from fixtures and counts what it was asked. */
export interface IFakeForge extends IStartupForgeSeam {
	readonly calls: () => { readonly pulls: number; readonly checks: number };
	readonly conditionalHits: () => number;
}

export const fakeForge = (input: {
	readonly pullRequests?: readonly IForgePullRequest[];
	readonly checkRuns?: readonly IForgeCheckRun[];
	readonly etag?: string;
}): IFakeForge => {
	let pulls = 0;
	let checks = 0;
	let conditional = 0;
	const etag = input.etag ?? 'etag-1';
	return {
		calls: () => ({ pulls, checks }),
		conditionalHits: () => conditional,
		listPullRequests: async (request) => {
			pulls += 1;
			if (request.etag === etag) {
				conditional += 1;
				return { kind: 'not-modified' };
			}
			return {
				kind: 'payload',
				payload: input.pullRequests ?? [],
				etag,
			};
		},
		listCheckRuns: async () => {
			checks += 1;
			return { kind: 'payload', payload: input.checkRuns ?? [] };
		},
	};
};

/** A durable journal that hands back a fixed export. */
export const fakeJournalSource = (
	events: readonly IJournalSourceEvent[],
): IStartupJournalSource => ({
	read: async (request) => {
		const since = request.sinceOccurredAt;
		return {
			kind: 'payload',
			payload:
				since === undefined
					? events
					: events.filter((event) => event.occurredAt >= since),
		};
	},
});

/**
 * The policy the specs run under: a shared checkout with WIP refs and
 * pull-request integration — the model the reconciler exists for.
 * Governance is switched off unless a spec is about governance, so that
 * an unrelated assertion is not answered by a forge-settings blocker.
 */
export const testPolicy = (overrides?: {
	readonly governance?: 'none' | 'observed' | 'enforced';
}): IResolvedDevelopmentPolicy =>
	resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			governance: { strategy: overrides?.governance ?? 'none' },
		},
	});
