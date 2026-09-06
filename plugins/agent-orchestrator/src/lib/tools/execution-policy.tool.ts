import { z } from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';

import type { OrchestratorEngine } from '../policy/policy.js';
import { OrchestrationModeSchema, TaskSchema } from '../policy/types.js';

const ExecutionDecisionSchema = z.object({
	ceremony: z.enum(['direct', 'light-plan', 'proposal']),
	execution: z.enum(['single', 'linear', 'swarm']),
	context: z.enum(['minimal', 'focused', 'broad']),
	validation: z.enum(['none', 'targeted', 'package', 'full']),
	response: z.enum(['terse', 'normal', 'detailed']),
	route: z.string().min(1),
	budgets: z.object({
		maxConcurrentAgents: z.number().int().nonnegative(),
		reviewQuorum: z.number().int().nonnegative(),
		maxMinutes: z.number().int().nonnegative(),
	}),
	confidence: z.number().min(0).max(1),
	reasons: z.array(
		z.object({
			code: z.string(),
			direction: z.enum(['toward-ceremony', 'toward-directness']),
			weight: z.number(),
			detail: z.string(),
		}),
	),
	overrides: z.array(
		z.object({
			code: z.string(),
			forces: z.enum(['direct', 'light-plan', 'proposal']),
			detail: z.string(),
		}),
	),
});

const OutputSchema = z.object({
	decision: ExecutionDecisionSchema,
	resolution: z.object({
		mode: OrchestrationModeSchema,
		reason: z.string(),
		constrained: z.boolean(),
	}),
});

export const buildExecutionPolicyToolRegistration = (deps: {
	readonly namespacePrefix: string;
	readonly engine: () => OrchestratorEngine;
}): IToolRegistration => ({
	id: 'execution_policy',
	summary:
		'Explain the canonical execution decision for one task and the runnable orchestration mode derived from it. Read-only.',
	tags: ['orchestration', 'policy'],
	register: async (server) => {
		server.registerTool(
			`${deps.namespacePrefix}_execution_policy`,
			{
				description:
					'Classify one task into the canonical execution decision, then return the runnable mode chosen from that decision under the active policy constraints. Read-only.',
				inputSchema: TaskSchema,
				outputSchema: OutputSchema,
			},
			async (task) => {
				const verdict = deps.engine().classify({
					id: task.id,
					description: task.description,
					...(task.files !== undefined ? { files: task.files } : {}),
					tags: task.tags,
					...(task.hint !== undefined ? { hint: task.hint } : {}),
					...(task.facts !== undefined ? { facts: task.facts } : {}),
				});
				if (verdict.decision === undefined) {
					throw new Error('execution decision missing from classifier verdict');
				}
				return toolJson({
					decision: verdict.decision,
					resolution: {
						mode: verdict.mode,
						reason: verdict.reason,
						constrained: /configured|authori[sz]ed|manual|overlap/u.test(
							verdict.reason,
						),
					},
				});
			},
		);
	},
});