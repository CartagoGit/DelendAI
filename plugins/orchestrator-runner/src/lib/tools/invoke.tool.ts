/**
 * invoke.tool.ts — `<prefix>_invoke` (Option E core, f00067 S6).
 *
 * The game-changer: the orchestrator hands a task, the runner EXECUTES it on
 * the best provider (with fallback), and returns the structured result. All
 * the safety (CRITICAL I5), fallback (I7) and cancellation (I8) logic lives
 * in {@link InvocationManager}; this tool is a thin, validated shell around
 * it. It NEVER spends without a signed confirmation token.
 */
import {
	compactOutputSchema,
	projectValue,
	projectDetail,
	toolJson,
	type DetailProjections,
	type IArtifactHandle,
	type IHandleStore,
	type IRoutingDecision,
	type IToolRegistration,
} from '@mcp-vertex/core/public';
import z from 'zod';

import type { InvocationManager, IInvokeOutput } from '../invoke/manager';
import { CapabilityTagSchema } from '../schemas';

export interface IInvokeToolOptions {
	readonly namespacePrefix: string;
	readonly manager: InvocationManager;
	readonly resultHandleStore?: IHandleStore<
		NonNullable<IInvokeOutput['result']>
	>;
	readonly resultHandleTtlMs?: number;
	readonly resultHandleMaxBytes?: number;
}

type TDetailLevel = 'compact' | 'normal' | 'full';

interface IProviderCompactView {
	readonly id: string;
	readonly kind: IRoutingDecision['targetProvider']['kind'];
	readonly modelId: string;
	readonly costTier: IRoutingDecision['targetProvider']['costTier'];
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

type IInvokeCompactView = Omit<IInvokeOutput, 'decision'> & {
	readonly decision: IRoutingDecisionCompactView;
};

type IInvokeNormalView = Omit<IInvokeOutput, 'decision'> & {
	readonly decision: IRoutingDecisionNormalView;
};

interface IInvokeResultArtifact extends IArtifactHandle {
	readonly projectedBytes: number;
}

const DetailSchema = z.enum(['compact', 'normal', 'full']);

const projectProviderCompact = (
	decision: IRoutingDecision['targetProvider'],
): IProviderCompactView => ({
	id: decision.id,
	kind: decision.kind,
	modelId: decision.modelId,
	costTier: decision.costTier,
	contextWindow: decision.contextWindow,
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

const INVOKE_DETAIL_PROJECTIONS: DetailProjections<IInvokeOutput> = {
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
	task: z.string().min(1),
	mode: z.enum(['plan', 'explore', 'implement', 'review']).optional(),
	capabilityHints: z.array(CapabilityTagSchema).optional(),
	costPreference: z.enum(['minimize', 'balanced', 'maximize']).optional(),
	sessionId: z.string().min(1).optional(),
	stream: z.boolean().optional(),
	toolsAllow: z.array(z.string()).optional(),
	timeoutMs: z.number().int().min(1).optional(),
	fallbackStrategy: z.enum(['rerank', 'tier-down']).optional(),
	detail: DetailSchema.optional(),
	maxBytes: z.number().int().min(1).optional(),
});

export const buildInvokeRegistration = (
	options: IInvokeToolOptions,
): IToolRegistration => ({
	id: 'invoke',
	tags: ['orchestrator-runner', 'lazy', 'invoke', 'spend'],
	summary:
		'Execute a task on the best provider (with fallback). Gated by executeApi + a signed confirmation token — never spends silently.',
	descriptionKey: 'mcp-vertex_orchestrator-runner_invoke',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_invoke`,
			{
				description:
					"Execute a task on the best-scored provider and return its structured result. Plans a fallback chain (rerank|tier-down), enforces a wall-clock timeout that fires the per-kind cancellation ladder, and — CRITICAL SAFETY — never spends the user's API money unless executeApi is on AND a one-time signed confirmation token (from an MCP elicitation) authorises THAT invocation. With executeApi:false, api/cli routes return an 'execution-disabled' error and a handoff instead of spending. Pass detail:'compact'|'normal'|'full' to control only the embedded routing decision: compact (default) keeps the chosen route lean, normal adds alternate summaries plus the scoring trace, and full restores the legacy full decision payload. Pass maxBytes to bound the returned execution result; when a handle store is configured, oversized results also include a bounded resultArtifact handle for follow-up chaining.",
				inputSchema: InputSchema,
				// v00130 (AUD-B01): `InvokeOutputSchema` (the full, exported
				// Zod shape) is not used as a runtime response validator
				// anywhere in this handler — only declared here as the wire
				// `outputSchema`. It stays exported from `schemas.ts` for the
				// behavioural tests; `tools/list` gets the compact envelope
				// instead. The real response payload is unchanged.
				outputSchema: compactOutputSchema(),
			},
			async (args: z.infer<typeof InputSchema>) => {
				const level: TDetailLevel = args.detail ?? 'compact';
				const output = await options.manager.invoke({
					task: args.task,
					...(args.mode !== undefined ? { mode: args.mode } : {}),
					...(args.capabilityHints !== undefined
						? { capabilityHints: args.capabilityHints }
						: {}),
					...(args.costPreference !== undefined
						? { costPreference: args.costPreference }
						: {}),
					...(args.sessionId !== undefined
						? { sessionId: args.sessionId }
						: {}),
					...(args.stream !== undefined
						? { stream: args.stream }
						: {}),
					...(args.toolsAllow !== undefined
						? { toolsAllow: args.toolsAllow }
						: {}),
					...(args.timeoutMs !== undefined
						? { timeoutMs: args.timeoutMs }
						: {}),
					...(args.fallbackStrategy !== undefined
						? { fallbackStrategy: args.fallbackStrategy }
						: {}),
				});
				const view = projectDetail(
					output,
					INVOKE_DETAIL_PROJECTIONS,
					level,
				) as IInvokeCompactView | IInvokeNormalView | IInvokeOutput;
				if (args.maxBytes === undefined || view.result === undefined) {
					return toolJson({
						...view,
						level,
					});
				}
				const resultProjection = projectValue(view.result, {
					mode: 'full',
					maxBytes: args.maxBytes,
				});
				let resultArtifact: IInvokeResultArtifact | null = null;
				if (
					resultProjection.truncatedByBytes &&
					options.resultHandleStore !== undefined
				) {
					const handle = options.resultHandleStore.open(view.result, {
						...(options.resultHandleTtlMs !== undefined
							? { ttlMs: options.resultHandleTtlMs }
							: {}),
						...(options.resultHandleMaxBytes !== undefined
							? { maxBytes: options.resultHandleMaxBytes }
							: {}),
						label: 'orchestrator-runner.invoke.result',
					});
					resultArtifact = Object.freeze({
						...handle,
						projectedBytes: Buffer.byteLength(
							JSON.stringify(view.result),
							'utf8',
						),
					});
				}
				return toolJson({
					...view,
					result: resultProjection.value as IInvokeOutput['result'],
					resultProjection: {
						maxBytes: args.maxBytes,
						emittedBytes: resultProjection.emittedBytes,
						truncated: resultProjection.truncated,
						truncatedByBytes: resultProjection.truncatedByBytes,
						truncatedByLimit: resultProjection.truncatedByLimit,
					},
					...(resultArtifact !== null ? { resultArtifact } : {}),
					level,
				});
			},
		);
	},
});
