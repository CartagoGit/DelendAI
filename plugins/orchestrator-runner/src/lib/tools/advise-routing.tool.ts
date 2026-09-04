/**
 * advise-routing.tool.ts — `<prefix>_advise_routing`.
 *
 * The headless routing brain: given a task description + capability hints,
 * it scores the confirmed roster against the in-memory availability mirror
 * and returns the winning `IRoutingDecision` plus the top-2 backups and the
 * full scoring trace. It NEVER spawns or spends — it advises (S6 executes).
 *
 * Session stickiness (CRITICAL I12): a caller that passes `sessionId` gets
 * the same decision back until the TTL elapses. A generated id is returned
 * when the caller omits one so a follow-up call can opt into stickiness.
 *
 * Loop annotation reuses the injected loop detector (never a new one): when
 * the same session keeps asking for the same route the decision is tagged
 * with a `loopWarning` sourced from the detector's `isAgentStuck`.
 */
import { randomUUID } from 'node:crypto';

import {
	compactOutputSchema,
	projectDetail,
	toolJson,
	type DetailProjections,
	type IRoutingDecision,
	type IToolRegistration,
} from '@delendai/core/public';
import type { IProviderCapabilities } from '@delendai/core/public';
import z from 'zod';

import { buildRoutingDecision } from '../router/advise';
import type { SessionStore } from '../router/session';
import type { HealthStore } from '../healthcheck/store';
import type { CostPreference, ILoopDetectionSeam } from '../types';
import { CapabilityTagSchema } from '../schemas';

export interface IAdviseRoutingToolOptions {
	readonly namespacePrefix: string;
	readonly providers: readonly IProviderCapabilities[];
	readonly health: HealthStore;
	readonly sessions: SessionStore;
	readonly defaultCostPreference: CostPreference;
	readonly loopDetector?: ILoopDetectionSeam | undefined;
}

type TDetailLevel = 'compact' | 'normal' | 'full';

interface ILoopWarningView {
	readonly handoffPath: string;
	readonly suggestedAction: string;
}

interface IProviderCompactView {
	readonly id: string;
	readonly kind: IProviderCapabilities['kind'];
	readonly modelId: string;
	readonly costTier: IProviderCapabilities['costTier'];
	readonly contextWindow: number;
}

interface IAlternateCompactView {
	readonly strategy: IRoutingDecision['strategy'];
	readonly targetProvider: IProviderCompactView;
	readonly rationale: string;
	readonly estimatedCostTier: IRoutingDecision['estimatedCostTier'];
	readonly sessionId: string;
}

interface IRoutingDecisionCompactView {
	readonly strategy: IRoutingDecision['strategy'];
	readonly targetProvider: IProviderCompactView;
	readonly mode: IRoutingDecision['mode'];
	readonly prompt: string;
	readonly invoke: IRoutingDecision['invoke'];
	readonly rationale: string;
	readonly estimatedCostTier: IRoutingDecision['estimatedCostTier'];
	readonly sessionId: string;
}

interface IRoutingDecisionNormalView extends IRoutingDecisionCompactView {
	readonly alternates: readonly IAlternateCompactView[];
	readonly scoringTrace: IRoutingDecision['scoringTrace'];
}

interface IAdviseRoutingView<TDecision> {
	readonly decision: TDecision;
	readonly loopWarning?: ILoopWarningView;
}

type IAdviseRoutingFullView = IAdviseRoutingView<IRoutingDecision>;

const DetailSchema = z.enum(['compact', 'normal', 'full']);

const projectProviderCompact = (
	provider: IProviderCapabilities,
): IProviderCompactView => ({
	id: provider.id,
	kind: provider.kind,
	modelId: provider.modelId,
	costTier: provider.costTier,
	contextWindow: provider.contextWindow,
});

const projectAlternateCompact = (
	decision: IRoutingDecision,
): IAlternateCompactView => ({
	strategy: decision.strategy,
	targetProvider: projectProviderCompact(decision.targetProvider),
	rationale: decision.rationale,
	estimatedCostTier: decision.estimatedCostTier,
	sessionId: decision.sessionId,
});

const projectRoutingCompactDecision = (
	decision: IRoutingDecision,
): IRoutingDecisionCompactView => ({
	strategy: decision.strategy,
	targetProvider: projectProviderCompact(decision.targetProvider),
	mode: decision.mode,
	prompt: decision.prompt,
	invoke: decision.invoke,
	rationale: decision.rationale,
	estimatedCostTier: decision.estimatedCostTier,
	sessionId: decision.sessionId,
});

const projectRoutingNormalDecision = (
	decision: IRoutingDecision,
): IRoutingDecisionNormalView => ({
	...projectRoutingCompactDecision(decision),
	alternates: decision.alternates.map(projectAlternateCompact),
	scoringTrace: decision.scoringTrace,
});

const ROUTING_DETAIL_PROJECTIONS: DetailProjections<IAdviseRoutingFullView> = {
	compact: (full) => ({
		...full,
		decision: projectRoutingCompactDecision(full.decision),
	}),
	normal: (full) => ({
		...full,
		decision: projectRoutingNormalDecision(full.decision),
	}),
	full: (full) => full,
};

const InputSchema = z.object({
	taskDescription: z.string().min(1),
	sliceCapabilityHints: z.array(CapabilityTagSchema).optional(),
	mode: z.enum(['plan', 'explore', 'implement', 'review']).optional(),
	costPreference: z.enum(['minimize', 'balanced', 'maximize']).optional(),
	sessionId: z.string().min(1).optional(),
	detail: DetailSchema.optional(),
});

export const buildAdviseRoutingRegistration = (
	options: IAdviseRoutingToolOptions,
): IToolRegistration => ({
	id: 'advise_routing',
	tags: ['orchestrator-runner', 'lazy', 'routing'],
	summary:
		'Score the provider roster for a task and advise which provider to route to (no spend).',
	descriptionKey: 'mcp-vertex_orchestrator-runner_advise_routing',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_advise_routing`,
			{
				description:
					"Advise which model provider to route a task to. Scores the confirmed roster against the task's capability hints, mode and cost preference, penalising providers the healthcheck marks unavailable, and returns the winning decision (strategy passthrough|api|cli|mcp-tool|handoff). Pass detail:'compact'|'normal'|'full' to control how much routing context comes back: compact (default) returns the winner only, normal adds alternate summaries plus the scoring trace, and full restores the legacy full decision payload. Headless: it never spawns a subprocess or spends money. Pass a sessionId for sticky routing across a multi-step task.",
				inputSchema: InputSchema,
				// v00130 (AUD-B01): `AdviseRoutingOutputSchema` is not used
				// as a runtime response validator anywhere in this handler
				// — only declared here as the wire `outputSchema`. It stays
				// exported from `schemas.ts` for the behavioural tests;
				// `tools/list` gets the compact envelope instead. The real
				// response payload is unchanged.
				outputSchema: compactOutputSchema(),
			},
			async (args: z.infer<typeof InputSchema>) => {
				const sessionId = args.sessionId ?? `sess_${randomUUID()}`;
				const mode = args.mode ?? 'implement';
				const level: TDetailLevel = args.detail ?? 'compact';
				const costPref =
					args.costPreference ?? options.defaultCostPreference;

				// Session stickiness: an existing, non-expired decision wins.
				const sticky = options.sessions.get(sessionId);
				const decision =
					sticky ??
					buildRoutingDecision({
						providers: options.providers,
						availabilityOf: (id) => options.health.get(id),
						hint: {
							mode,
							capabilities: args.sliceCapabilityHints ?? [],
							costPref,
						},
						prompt: args.taskDescription,
						sessionId,
					});
				if (sticky === undefined) {
					options.sessions.set(sessionId, decision);
				}

				const warning =
					options.loopDetector?.isAgentStuck('advise_routing', {
						agent: sessionId,
						taskDescription: args.taskDescription,
					}) ?? null;

				const full: IAdviseRoutingFullView = {
					decision,
					...(warning !== null ? { loopWarning: warning } : {}),
				};
				const view = projectDetail(
					full,
					ROUTING_DETAIL_PROJECTIONS,
					level,
				) as
					| IAdviseRoutingView<IRoutingDecisionCompactView>
					| IAdviseRoutingView<IRoutingDecisionNormalView>
					| IAdviseRoutingFullView;

				return toolJson({
					...view,
					level,
				});
			},
		);
	},
});
