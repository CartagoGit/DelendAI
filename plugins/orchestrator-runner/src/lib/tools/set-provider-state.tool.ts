/**
 * set-provider-state.tool.ts — `<prefix>_set_provider_state` (f00067 S6).
 *
 * Manual availability override, e.g. "force claude-code-opus unavailable
 * until midnight". Upserts the in-memory mirror (so the next routing
 * decision honours it immediately) and durably persists the mirror for
 * next-boot recovery: `withFileMutex` → `redactSecrets` → `writeFileAtomic`
 * (all inside {@link HealthStore.persist}).
 */
import { toolJson, type IToolRegistration } from '@delendai/core/public';
import type { IProviderAvailability } from '@delendai/core/public';
import z from 'zod';

import type { HealthStore } from '../healthcheck/store';
import { SetProviderStateOutputSchema } from '../schemas';

export interface ISetProviderStateToolOptions {
	readonly namespacePrefix: string;
	readonly health: HealthStore;
	readonly healthcheckPath: string;
}

const InputSchema = z.object({
	providerId: z.string().min(1),
	state: z.enum([
		'available',
		'quota-exceeded',
		'rate-limited',
		'unauthenticated',
		'not-installed',
		'model-unavailable',
		'error',
	]),
	until: z.string().min(1).optional(),
	reason: z.string().min(1).optional(),
});

export const buildSetProviderStateRegistration = (
	options: ISetProviderStateToolOptions,
): IToolRegistration => ({
	id: 'set_provider_state',
	tags: ['orchestrator-runner', 'lazy', 'routing'],
	summary:
		'Manually override a provider’s availability (e.g. force unavailable until a time).',
	descriptionKey: 'delendai_orchestrator-runner_set_provider_state',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_set_provider_state`,
			{
				description:
					'Manually override a provider’s availability state (available | quota-exceeded | rate-limited | unauthenticated | not-installed | model-unavailable | error), optionally bounded by an ISO `until` timestamp and a human `reason`. Updates the in-memory mirror so the next routing decision honours it immediately, and durably persists the mirror (mutex + redact + atomic write) for next-boot recovery.',
				inputSchema: InputSchema,
				outputSchema: SetProviderStateOutputSchema,
			},
			async (args: z.infer<typeof InputSchema>) => {
				const entry: IProviderAvailability = {
					id: args.providerId,
					state: args.state,
					...(args.until !== undefined ? { until: args.until } : {}),
					...(args.reason !== undefined
						? { reason: args.reason }
						: {}),
				};
				options.health.set(entry);
				await options.health.persist(options.healthcheckPath);
				return toolJson({
					providerId: args.providerId,
					applied: {
						id: entry.id,
						state: entry.state,
						...(entry.until !== undefined
							? { until: entry.until }
							: {}),
						...(entry.reason !== undefined
							? { reason: entry.reason }
							: {}),
					},
					note: `Provider ${args.providerId} is now ${args.state}${
						args.until !== undefined ? ` until ${args.until}` : ''
					}. The override is live and persisted.`,
				});
			},
		);
	},
});
