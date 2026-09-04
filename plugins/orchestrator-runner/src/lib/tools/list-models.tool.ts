/**
 * list-models.tool.ts — `<prefix>_list_models` (f00067 S6).
 *
 * Enumerate the merged roster for agents to inspect: each confirmed provider
 * with its capability profile joined to the in-memory availability mirror
 * (`reachable` = state === 'available'). Read-only; reads only the mirror, so
 * no per-call fs read on the hot path (AGENTS.md rule 3).
 */
import { toolJson, type IToolRegistration } from '@delendai/core/public';
import type { IProviderCapabilities } from '@delendai/core/public';
import z from 'zod';

import type { HealthStore } from '../healthcheck/store';
import { ListModelsOutputSchema } from '../schemas';

export interface IListModelsToolOptions {
	readonly namespacePrefix: string;
	readonly providers: readonly IProviderCapabilities[];
	readonly health: HealthStore;
}

const InputSchema = z.object({});

export const buildListModelsRegistration = (
	options: IListModelsToolOptions,
): IToolRegistration => ({
	id: 'list_models',
	tags: ['orchestrator-runner', 'lazy', 'routing'],
	summary:
		'Enumerate the merged provider roster with capability profiles and current reachability.',
	descriptionKey: 'mcp-vertex_orchestrator-runner_list_models',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_list_models`,
			{
				description:
					'Enumerate the merged provider roster (confirmed roster joined to the healthcheck-applied availability mirror). Each entry carries kind, modelId, costTier, contextWindow, strengths/weaknesses, the runtime state and a cheap reachable boolean (state === "available"). Read-only; reads only the in-memory mirror, so no fs read on the hot path.',
				inputSchema: InputSchema,
				outputSchema: ListModelsOutputSchema,
			},
			async () => {
				const models = options.providers.map((p) => {
					const health = options.health.get(p.id);
					const reachable = health.state === 'available';
					return {
						id: p.id,
						kind: p.kind,
						modelId: p.modelId,
						costTier: p.costTier,
						contextWindow: p.contextWindow,
						strengths: [...p.strengths],
						weaknesses: [...p.weaknesses],
						state: health.state,
						reachable,
						...(health.until !== undefined
							? { until: health.until }
							: {}),
						...(health.reason !== undefined
							? { reason: health.reason }
							: {}),
					};
				});
				return toolJson({
					models,
					summary: {
						total: models.length,
						reachable: models.filter((m) => m.reachable).length,
					},
				});
			},
		);
	},
});
