/**
 * fake-state.ts — an in-memory `IIntegrationStatePort` with EXACTLY the
 * sqlite work model's semantics, and no more.
 *
 * A fake that is more capable than the real store makes the idempotency
 * specs lie, so the sharp edges are reproduced deliberately:
 *
 *  - `ensureGeneration` upserts on `(workUnitUid, generation)` and
 *    refreshes only the fields `GenerationsRepo.record` refreshes. It does
 *    NOT rewrite `baseIntegrationSha`, exactly like the ON CONFLICT clause
 *    in the real repository.
 *  - `markIntegrated` is single-winner: `first` is true once, ever.
 *  - `attachPullRequest` reports `attached: false` for a pull request the
 *    generation already carries.
 *  - `appendJournalEvent` dedupes on content-derived identity, the way the
 *    real journal's UNIQUE event id does.
 */

import type {
	IEnsureGenerationArgs,
	IGenerationKey,
	IGenerationState,
	IIntegrationStatePort,
	IJournalEventArgs,
} from '@delendai/core/lib/integration-engine/index';

/** The fake plus everything a spec wants to assert about it. */
export interface IFakeState {
	readonly port: IIntegrationStatePort;
	readonly generations: () => readonly IGenerationState[];
	readonly journal: () => readonly IJournalEventArgs[];
	readonly pullRequests: () => readonly { readonly number: number }[];
	readonly ciRuns: () => readonly { readonly candidateSha: string }[];
}

const key = (id: IGenerationKey): string =>
	`${id.workUnitUid}@${String(id.generation)}`;

/** Canonical JSON so two descriptions of one event hash the same. */
const canonical = (payload: Readonly<Record<string, unknown>>): string =>
	JSON.stringify(
		Object.fromEntries(
			Object.entries(payload).sort(([a], [b]) => (a < b ? -1 : 1)),
		),
	);

const eventIdentity = (event: IJournalEventArgs): string =>
	[
		event.eventKind,
		event.repositoryUid,
		event.workUnitUid,
		String(event.generation),
		event.actorAgentId,
		String(event.occurredAt),
		canonical(event.payload),
	].join('|');

export const createFakeState = (): IFakeState => {
	const generations = new Map<string, IGenerationState>();
	const pullRequests = new Map<string, { readonly number: number }>();
	const ciRuns = new Map<string, { readonly candidateSha: string }>();
	const journal = new Map<string, IJournalEventArgs>();

	const port: IIntegrationStatePort = {
		ensureGeneration: async (args: IEnsureGenerationArgs) => {
			const id = key(args);
			const existing = generations.get(id);
			const next: IGenerationState = {
				workUnitUid: args.workUnitUid,
				generation: args.generation,
				// Mirrors the real ON CONFLICT clause: the base is set once.
				baseIntegrationSha:
					existing?.baseIntegrationSha ?? args.baseIntegrationSha,
				wipRef: args.wipRef,
				wipHeadSha: args.wipHeadSha,
				checkpointKind: args.checkpointKind,
				candidateState: existing?.candidateState ?? 'draft',
				validationState: existing?.validationState ?? 'unknown',
				pullRequestNumber: existing?.pullRequestNumber ?? null,
				integratedSha: existing?.integratedSha ?? null,
			};
			generations.set(id, next);
			return next;
		},

		getGeneration: async (id) => generations.get(key(id)),

		upsertPullRequest: async (args) => {
			pullRequests.set(`${args.repositoryUid}#${String(args.number)}`, {
				number: args.number,
			});
		},

		upsertCiRun: async (args) => {
			ciRuns.set(
				`${args.repositoryUid}#${args.candidateSha}#${args.workflow}#${args.checkName}`,
				{ candidateSha: args.candidateSha },
			);
		},

		attachPullRequest: async (args) => {
			const id = key(args);
			const existing = generations.get(id);
			if (existing === undefined) return { attached: false };
			if (existing.pullRequestNumber === args.pullRequestNumber)
				return { attached: false };
			generations.set(id, {
				...existing,
				pullRequestNumber: args.pullRequestNumber,
				candidateState: 'proposed',
			});
			return { attached: true };
		},

		recordValidation: async (args) => {
			const id = key(args);
			const existing = generations.get(id);
			if (existing === undefined) return;
			generations.set(id, {
				...existing,
				validationState: args.validationState,
			});
		},

		markIntegrated: async (args) => {
			const id = key(args);
			const existing = generations.get(id);
			if (existing === undefined) return { first: false };
			if (existing.integratedSha !== null) return { first: false };
			generations.set(id, {
				...existing,
				integratedSha: args.integratedSha,
				candidateState: 'integrated',
			});
			return { first: true };
		},

		appendJournalEvent: async (event) => {
			const id = eventIdentity(event);
			if (journal.has(id)) return { appended: false };
			journal.set(id, event);
			return { appended: true };
		},
	};

	return {
		port,
		generations: () => [...generations.values()],
		journal: () => [...journal.values()],
		pullRequests: () => [...pullRequests.values()],
		ciRuns: () => [...ciRuns.values()],
	};
};
