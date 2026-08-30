/**
 * `<ns>_dispatch` — run an `IModePlan` end-to-end via the configured
 * `IDispatchPort`. Linear-only in S2; S3 adds the parallel runner
 * (swarm mode reuses the same envelope).
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolJson } from '@mcp-vertex/core/public';

import type { OrchestratorEngine } from '../policy/policy.js';
import { LinearDispatcher } from '../dispatch/linear-dispatcher.js';
import {
	InvalidDispatchPortFactoryError,
	MissingDispatchPortError,
} from '../dispatch/port-resolution.helper.js';
import { InMemoryTelemetrySink } from '../telemetry/event.js';
import type { ITelemetrySink } from '../telemetry/event.js';
import {
	BudgetPolicySchema,
	OrchestrationModeSchema,
	RotationPolicySchema,
} from '../policy/types.js';
import type {
	IDispatchPort,
	IPlanOutcome,
	ISubagentResult,
} from '../dispatch/contracts.js';

const PlanStepSchema = z.object({
	order: z.number().int().positive(),
	kind: z.enum(['orchestrate', 'spawn', 'join', 'verify']),
	instruction: z.string().min(1),
	subagentRole: z
		.enum(['scout', 'implementer', 'verifier', 'reviewer', 'scribe'])
		.optional(),
	dependsOn: z.array(z.number().int().positive()).optional(),
});

const SubagentResultSchema = z.object({
	subagentId: z.string(),
	tokensUsed: z.number().int().nonnegative(),
	output: z.string(),
	schemaOk: z.boolean(),
	hadError: z.boolean(),
});

const StepOutcomeSchema = z.object({
	order: z.number().int().positive(),
	kind: PlanStepSchema.shape.kind,
	slotId: z.string(),
	subagentIds: z.array(z.string()),
	result: SubagentResultSchema.nullable(),
	rotations: z.array(
		z.object({ subagentId: z.string(), reason: z.string() }),
	),
	ok: z.boolean(),
});

const PlanOutcomeSchema = z.object({
	mode: OrchestrationModeSchema,
	steps: z.array(StepOutcomeSchema),
	budget: z.object({
		consumedOrchestrator: z.number().int().nonnegative(),
		consumedSubagents: z.record(z.string(), z.number().int().nonnegative()),
		steps: z.number().int().nonnegative(),
	}),
	ok: z.boolean(),
	error: z.string().optional(),
});

const INPUT_SCHEMA = z
	.object({
		task: z.object({
			id: z.string().min(1),
			description: z.string().min(1),
			tags: z.array(z.string()).default([]),
			hint: z.enum(['trivial', 'small', 'medium', 'large']).optional(),
		}),
		override: OrchestrationModeSchema.optional(),
	})
	.strict();

const BudgetOutputSchema = BudgetPolicySchema.omit({ timeoutMs: true }).extend({
	consumedOrchestrator: z.number().int().nonnegative(),
	consumedSubagents: z.record(z.string(), z.number().int().nonnegative()),
	steps: z.number().int().nonnegative(),
	exhausted: z.boolean(),
});

const _RotationOutputSchema = RotationPolicySchema;

const PlanRefSchema = z.object({
	mode: OrchestrationModeSchema,
	rationale: z.string(),
	steps: z.array(PlanStepSchema),
	budget: BudgetPolicySchema,
	rotation: RotationPolicySchema,
});

type IDispatchArgs = z.infer<typeof INPUT_SCHEMA>;
type IBudgetArgs = { taskId?: string };

/**
 * Map a dispatch-port failure to the tool-error envelope, or `undefined`
 * when the error is something else and must keep propagating. Pure and
 * exported so the refusal contract is testable without standing up an
 * `McpServer` double.
 */
export const dispatchPortRefusal = (
	err: unknown,
): ReturnType<typeof toolError> | undefined => {
	if (
		err instanceof MissingDispatchPortError ||
		err instanceof InvalidDispatchPortFactoryError
	) {
		return toolError(
			err.message,
			'Configure `plugins.agent-orchestrator.options.portFactory` with a real dispatch port, or set `allowFakeDispatchPort: true` for tests only.',
		);
	}
	return undefined;
};

export interface IDispatchToolDeps {
	readonly namespacePrefix: string;
	readonly engine: () => OrchestratorEngine;
	/**
	 * Resolved lazily, at call time. A host that never dispatches still
	 * gets the port-independent tools (`_plan`, `_budget`); only an
	 * actual `_dispatch` call has to have a real dispatch capability,
	 * and it fails loudly rather than fabricating success.
	 */
	readonly port: () => IDispatchPort;
	/** Optional in-memory cache of last outcomes, keyed by taskId. */
	readonly lastOutcome?: (taskId: string) => IPlanOutcome | undefined;
	/**
	 * Sink the dispatcher's `dispatch.start` / `dispatch.end` / `rotate`
	 * events land in. Defaults to a private, throwaway sink so tests can
	 * build a registration without a real one; a host that also mounts
	 * the `_events` tool must pass the same instance both places, or the
	 * two surfaces silently diverge.
	 */
	readonly telemetry?: ITelemetrySink;
}

export function buildDispatchRegistration(
	deps: IDispatchToolDeps,
): IToolRegistration {
	const {
		namespacePrefix,
		engine,
		port,
		lastOutcome,
		telemetry = new InMemoryTelemetrySink(),
	} = deps;

	const runPlan = async (task: {
		id: string;
		description: string;
		tags: readonly string[];
		hint?: 'trivial' | 'small' | 'medium' | 'large';
	}): Promise<IPlanOutcome> => {
		const plan = engine().plan({
			id: task.id,
			description: task.description,
			tags: task.tags,
			...(task.hint !== undefined ? { hint: task.hint } : {}),
		});
		const dispatcher = new LinearDispatcher(
			plan,
			port(),
			task.id,
			telemetry,
		);
		const outcome = await dispatcher.run();
		lastOutcomeCache.set(task.id, { plan, outcome });
		return outcome;
	};

	const lastOutcomeCache = new Map<
		string,
		{ plan: ReturnType<OrchestratorEngine['plan']>; outcome: IPlanOutcome }
	>();

	return {
		id: 'dispatch',
		summary:
			'Plan and execute a task via the configured orchestration policy. Linear-only in S2; swarm parallel lands in S3.',
		tags: ['orchestration', 'policy', 'dispatch'],
		register: async (server) => {
			server.registerTool(
				`${namespacePrefix}_dispatch`,
				{
					description:
						'Plan and execute a task via the configured orchestration policy. Returns the per-step outcome, rotation log, and budget snapshot. Linear-only in S2.',
					inputSchema: INPUT_SCHEMA,
					outputSchema: PlanOutcomeSchema,
				},
				async (args: IDispatchArgs) => {
					try {
						const outcome = await runPlan({
							id: args.task.id,
							description: args.task.description,
							tags: args.task.tags,
							...(args.task.hint !== undefined
								? { hint: args.task.hint }
								: {}),
						});
						return toolJson(outcome);
					} catch (err) {
						const refusal = dispatchPortRefusal(err);
						if (refusal !== undefined) return refusal;
						throw err;
					}
				},
			);

			server.registerTool(
				`${namespacePrefix}_budget`,
				{
					description:
						'Read the current orchestrator budget snapshot. Requires a `_dispatch` call with the same taskId first.',
					inputSchema: z
						.object({ taskId: z.string().min(1) })
						.strict(),
					outputSchema: BudgetOutputSchema,
				},
				async (args: IBudgetArgs) => {
					if (!args.taskId) {
						return toolJson({
							consumedOrchestrator: 0,
							consumedSubagents: {},
							steps: 0,
							exhausted: false,
							maxTokensOrchestrator: 0,
							maxTokensPerSubagent: 0,
						});
					}
					const cached = lastOutcomeCache.get(args.taskId);
					if (lastOutcome !== undefined && cached === undefined) {
						const fallback = lastOutcome(args.taskId);
						if (fallback !== undefined) {
							return toolJson(mapBudget(fallback));
						}
					}
					if (cached === undefined) {
						return toolJson({
							consumedOrchestrator: 0,
							consumedSubagents: {},
							steps: 0,
							exhausted: false,
							maxTokensOrchestrator: 0,
							maxTokensPerSubagent: 0,
						});
					}
					return toolJson(mapBudget(cached.outcome));
				},
			);

			server.registerTool(
				`${namespacePrefix}_plan_ref`,
				{
					description:
						'Read the plan that `_dispatch` used for a taskId. Companion to `_budget`.',
					inputSchema: z
						.object({ taskId: z.string().min(1) })
						.strict(),
					outputSchema: PlanRefSchema,
				},
				async (args: IBudgetArgs) => {
					if (!args.taskId) {
						return toolJson({
							mode: 'single',
							rationale: 'no plan',
							steps: [],
							budget: {
								maxTokensOrchestrator: 0,
								maxTokensPerSubagent: 0,
								timeoutMs: 0,
							},
							rotation: {
								maxIterationsPerSubagent: 1,
								allow: ['error-storm'],
							},
						});
					}
					const cached = lastOutcomeCache.get(args.taskId);
					if (cached === undefined) {
						return toolJson({
							mode: 'single',
							rationale: 'no plan for that taskId',
							steps: [],
							budget: {
								maxTokensOrchestrator: 0,
								maxTokensPerSubagent: 0,
								timeoutMs: 0,
							},
							rotation: {
								maxIterationsPerSubagent: 1,
								allow: ['error-storm'],
							},
						});
					}
					return toolJson(cached.plan);
				},
			);
		},
	};
}

function mapBudget(outcome: IPlanOutcome): Record<string, unknown> {
	const consumedSubagents: Record<string, number> = {};
	for (const [k, v] of outcome.budget.consumedSubagents) {
		consumedSubagents[k] = v;
	}
	return {
		consumedOrchestrator: outcome.budget.consumedOrchestrator,
		consumedSubagents,
		steps: outcome.budget.steps,
		exhausted: outcome.budget.consumedOrchestrator > 0,
		maxTokensOrchestrator: 0,
		maxTokensPerSubagent: 0,
	};
}

export type { ISubagentResult };
