/**
 * advise.ts — assemble an `IRoutingDecision` from scored providers.
 *
 * Pure over its inputs (roster + availability + hint + prompt): given the
 * confirmed provider roster and the in-memory availability mirror, it
 * scores every provider with {@link explainScore}, ranks them, and builds
 * the winning decision plus the top-2 backups and the full scoring trace.
 * Session stickiness and loop annotation are layered on TOP of this in the
 * tool handler — this function stays deterministic and side-effect-free so
 * it is easy to test.
 */
import type {
	IProviderAvailability,
	IProviderCapabilities,
	IRoutingDecision,
	IRoutingScoreEntry,
	RoutingStrategy,
} from '@delendai/core/public';

import type { IRoutingHint } from '../types';
import { explainScore } from './score';

/**
 * Map a provider's reach `kind` to the routing `strategy` (CRITICAL C4:
 * strategy ∈ `passthrough | api | cli | mcp-tool | handoff`).
 */
export const strategyForKind = (
	kind: IProviderCapabilities['kind'],
): RoutingStrategy => {
	switch (kind) {
		case 'api':
			return 'api';
		case 'cli':
			return 'cli';
		case 'mcp-server':
			return 'mcp-tool';
		case 'subscription':
			return 'passthrough';
		default:
			return 'handoff';
	}
};

export interface IAdviseInput {
	readonly providers: readonly IProviderCapabilities[];
	/** In-memory availability mirror lookup. Missing → optimistic `available`. */
	readonly availabilityOf: (id: string) => IProviderAvailability;
	readonly hint: IRoutingHint;
	readonly prompt: string;
	readonly sessionId: string;
}

interface IRanked {
	readonly provider: IProviderCapabilities;
	readonly score: number;
	readonly reasons: readonly string[];
}

const buildDecisionFor = (
	provider: IProviderCapabilities,
	input: IAdviseInput,
	alternates: readonly IRoutingDecision[],
	scoringTrace: readonly IRoutingScoreEntry[],
): IRoutingDecision => ({
	strategy: strategyForKind(provider.kind),
	targetProvider: provider,
	mode: input.hint.mode,
	prompt: input.prompt,
	invoke: provider.invoke,
	rationale: `Selected ${provider.id} (${provider.modelId}, tier ${provider.costTier}) for a ${input.hint.mode} task with costPreference "${input.hint.costPref}".`,
	estimatedCostTier: provider.costTier,
	alternates,
	scoringTrace,
	sessionId: input.sessionId,
});

/**
 * The empty-roster / all-unavailable decision: nothing to route to, so we
 * hand off. `targetProvider`/`invoke` are absent-shaped placeholders the
 * caller renders as "run bootstrap".
 */
const buildHandoffDecision = (
	input: IAdviseInput,
	scoringTrace: readonly IRoutingScoreEntry[],
	rationale: string,
): IRoutingDecision => ({
	strategy: 'handoff',
	targetProvider: {
		id: 'none',
		kind: 'cli',
		invoke: { kind: 'cli', command: '' },
		modelId: 'none',
		contextWindow: 0,
		costTier: 1,
		strengths: [],
		weaknesses: [],
	},
	mode: input.hint.mode,
	prompt: input.prompt,
	invoke: { kind: 'cli', command: '' },
	rationale,
	estimatedCostTier: 1,
	alternates: [],
	scoringTrace,
	sessionId: input.sessionId,
});

/**
 * Rank the roster and return the winning routing decision. When the roster
 * is empty (or every provider scores as unavailable) the result is a
 * `handoff` decision pointing the caller at bootstrap.
 */
export const buildRoutingDecision = (input: IAdviseInput): IRoutingDecision => {
	const ranked: IRanked[] = input.providers
		.map((provider) => {
			const { score, reasons } = explainScore(
				provider,
				input.hint,
				input.availabilityOf(provider.id),
			);
			return { provider, score, reasons };
		})
		.sort((a, b) => b.score - a.score);

	const scoringTrace: readonly IRoutingScoreEntry[] = ranked.map((r) => ({
		provider: r.provider.id,
		score: r.score,
		reasons: r.reasons,
	}));

	const winner = ranked[0];
	if (winner === undefined) {
		return buildHandoffDecision(
			input,
			scoringTrace,
			'No providers are configured. Run bootstrap_providers (S5) to build a roster.',
		);
	}
	if (winner.score <= -10) {
		return buildHandoffDecision(
			input,
			scoringTrace,
			'Every configured provider is currently unavailable. Retry after a healthcheck, or run bootstrap_providers.',
		);
	}

	// Top-2 backups, each a self-contained decision with no nested
	// alternates/trace (avoids unbounded recursion in the payload).
	const alternates: readonly IRoutingDecision[] = ranked
		.slice(1, 3)
		.filter((r) => r.score > -10)
		.map((r) => buildDecisionFor(r.provider, input, [], []));

	return buildDecisionFor(winner.provider, input, alternates, scoringTrace);
};
