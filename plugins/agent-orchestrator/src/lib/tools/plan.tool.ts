/**
 * `agent-orchestrator_plan` — the S1 MCP tool.
 *
 * Inputs:
 *
 *   - `task`  — ITask shape (id, description, tags, hint?)
 *   - Optional per-call `override` of the configured default mode.
 *
 * Output: a structured `IModePlan` carrying mode, rationale, steps,
 * and the active budgets/rotation. The orchestrator (host) interprets
 * the plan; this tool does NOT dispatch subagents itself (that's S2).
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import type { OrchestratorEngine } from '../policy/policy.js';
import {
	BudgetPolicySchema,
	OrchestrationModeSchema,
	RotationPolicySchema,
	TaskSchema,
} from '../policy/types.js';

const PlanStepSchema = z.object({
	order: z.number().int().positive(),
	kind: z.enum(['orchestrate', 'spawn', 'join', 'verify']),
	instruction: z.string().min(1),
	subagentRole: z
		.enum(['scout', 'implementer', 'verifier', 'reviewer', 'scribe'])
		.optional(),
	dependsOn: z.array(z.number().int().positive()).optional(),
});

const OUTPUT_SCHEMA = z.object({
	mode: OrchestrationModeSchema,
	rationale: z.string(),
	steps: z.array(PlanStepSchema),
	budget: BudgetPolicySchema,
	rotation: RotationPolicySchema,
});

const INPUT_SCHEMA = z
	.object({
		task: TaskSchema,
		override: OrchestrationModeSchema.optional(),
	})
	.strict();

type IPlanArgs = z.infer<typeof INPUT_SCHEMA>;

export function buildPlanToolRegistration(deps: {
	readonly namespacePrefix: string;
	readonly engine: () => OrchestratorEngine;
}): IToolRegistration {
	const { namespacePrefix, engine } = deps;
	return {
		id: 'plan',
		summary:
			'Plan a task against the configured orchestration policy. Returns the chosen mode, ordered plan steps, budgets, and rotation policy. Read-only — does not dispatch subagents.',
		tags: ['orchestration', 'policy'],
		register: async (server) => {
			server.registerTool(
				`${namespacePrefix}_plan`,
				{
					description:
						'Plan a task against the configured orchestration policy. Returns the chosen mode, ordered plan steps, budgets, and rotation policy. Read-only — does not dispatch subagents.',
					inputSchema: INPUT_SCHEMA,
					outputSchema: OUTPUT_SCHEMA,
				},
				async (args: IPlanArgs) => {
					// `hint` is optional on the schema; rebuild an ITask with an
					// exact shape (`exactOptionalPropertyTypes` is strict).
					const plan = engine().plan({
						id: args.task.id,
						description: args.task.description,
						tags: args.task.tags,
						...(args.task.hint !== undefined
							? { hint: args.task.hint }
							: {}),
					});
					// The `override` switch is honoured by *re-planning* through
					// the named mode. We do not mutate the engine.
					if (args.override && args.override !== plan.mode) {
						const modes = engine().listModes();
						if (
							(modes as readonly string[]).includes(args.override)
						) {
							return toolJson({
								...plan,
								mode: args.override,
								rationale: `caller override → ${args.override}; ${plan.rationale}`,
							});
						}
					}
					return toolJson(plan);
				},
			);
		},
	};
}
