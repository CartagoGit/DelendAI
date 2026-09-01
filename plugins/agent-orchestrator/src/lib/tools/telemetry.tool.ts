/**
 * `<ns>_classify` and `<ns>_events` — the read-only telemetry
 * surface. Lets the host probe the classifier without planning and
 * read back the recent event log.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import type { TaskClassifier } from '../classifier/task-classifier.js';
import { TelemetryEvent } from '../telemetry/event.js';
import type { ITelemetrySink } from '../telemetry/event.js';
import { OrchestrationModeSchema, TaskSchema } from '../policy/types.js';

const ClassifyOutputSchema = z.object({
	mode: OrchestrationModeSchema,
	reason: z.string(),
	confidence: z.number().min(0).max(1),
});

const EventsOutputSchema = z.object({
	events: z.array(
		z.object({
			ts: z.number().int(),
			kind: z.enum([
				'plan',
				'classify',
				'dispatch.start',
				'dispatch.end',
				'rotate',
			]),
			taskId: z.string(),
			innerMode: OrchestrationModeSchema.optional(),
			confidence: z.number().min(0).max(1).optional(),
			evidence: z.string().optional(),
			tokensUsed: z.number().int().nonnegative().optional(),
		}),
	),
	total: z.number().int().nonnegative(),
});

export interface IReadOnlyToolDeps {
	readonly namespacePrefix: string;
	readonly classifier: TaskClassifier;
	readonly telemetry: ITelemetrySink;
	readonly policyDefaultMode: () => string;
}

export function buildReadOnlyToolRegistration(
	deps: IReadOnlyToolDeps,
): IToolRegistration {
	const { namespacePrefix, classifier, telemetry, policyDefaultMode } = deps;

	return {
		id: 'classify',
		summary:
			"Classify a task without planning. Returns the inner mode, the classifier's reason, and confidence. Read-only.",
		tags: ['orchestration', 'policy', 'telemetry'],
		register: async (server) => {
			server.registerTool(
				`${namespacePrefix}_classify`,
				{
					description:
						"Classify a task against the configured policy. Read-only; does not plan or dispatch. Returns the inner mode (single/linear/swarm/auto), the classifier's reason, and a 0..1 confidence score.",
					inputSchema: TaskSchema,
					outputSchema: ClassifyOutputSchema,
				},
				async (task) => {
					// Wrap in a synthetic policy so the classifier accepts the call.
					// Rebuild an `ITask` with exact shape (exactOptionalPropertyTypes).
					const fixed: {
						id: string;
						description: string;
						tags: readonly string[];
						hint?: 'trivial' | 'small' | 'medium' | 'large';
					} = {
						id: task.id,
						description: task.description,
						tags: task.tags,
						...(task.hint !== undefined ? { hint: task.hint } : {}),
					};
					const verdict = classifier.classify(fixed, {
						defaultMode: 'auto',
						defaults: {
							budget: {
								maxTokensOrchestrator: 0,
								maxTokensPerSubagent: 0,
								timeoutMs: 0,
							},
							rotation: {
								maxIterationsPerSubagent: 1,
								allow: ['error-storm'],
							},
						},
					});
					telemetry.emit(TelemetryEvent.classify(fixed, verdict));
					return toolJson(verdict);
				},
			);

			server.registerTool(
				`${namespacePrefix}_events`,
				{
					description:
						'Read the in-memory telemetry event log (most recent first). Includes plan/classify/dispatch/rotate events.',
					inputSchema: z
						.object({
							limit: z
								.number()
								.int()
								.positive()
								.max(1000)
								.optional(),
							since: z.number().int().nonnegative().optional(),
						})
						.strict(),
					outputSchema: EventsOutputSchema,
				},
				async (args) => {
					const all = telemetry.read();
					const filtered =
						args.since !== undefined
							? all.filter((e) => e.ts >= (args.since ?? 0))
							: all;
					const limit = args.limit ?? filtered.length;
					const events = filtered.slice(-limit).reverse();
					// Avoid leaking the policy default mode into events.
					void policyDefaultMode;
					return toolJson({ events, total: all.length });
				},
			);
		},
	};
}
