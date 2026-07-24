import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import { discoverRoster } from '../discovery/discover-roster';
import { realDiscoveryDeps } from '../discovery/real-deps';
import type { IDiscoveryDeps } from '../contracts/interfaces/roster.interface';

const CANDIDATE_SCHEMA = z.object({
	id: z.string(),
	label: z.string(),
	source: z.enum(['cli', 'api']),
	vendor: z.string(),
	reach: z.string(),
	costTier: z.number(),
});

const MISSING_SCHEMA = z.object({
	id: z.string(),
	label: z.string(),
	source: z.enum(['cli', 'api']),
	reason: z.string(),
	hint: z.string(),
});

const OUTPUT_SCHEMA = z.object({
	available: z.array(CANDIDATE_SCHEMA),
	missing: z.array(MISSING_SCHEMA),
	availableCount: z.number(),
});

/**
 * `auto_status` — report which LLM/agent providers are reachable right now
 * (CLI on PATH + API keys), cheapest-first, plus the known-but-missing ones
 * with a one-command fix each. Read-only; the foundation the router and the
 * recommendation tools build on.
 */
export const buildAutoStatusRegistration = (options: {
	readonly namespacePrefix: string;
	/** Injectable for tests; defaults to the real PATH + env probe. */
	readonly deps?: IDiscoveryDeps;
}): IToolRegistration => {
	const prefix = options.namespacePrefix;
	return {
		id: 'auto_status',
		summary:
			'List reachable LLM/agent providers (CLI + API keys), cheapest-first, plus missing ones with a one-command fix.',
		tags: ['orchestration', 'orientation'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_auto_status`,
				{
					description:
						'Report which LLM/agent providers this workspace can reach right now — CLIs found on PATH and APIs whose key is in the environment — ordered cheapest-first, plus every known provider that is NOT reachable with a single copy-paste command to enable it (install or export). Read-only; run it first to see what the router can choose from.',
					inputSchema: z.object({}).strict(),
					outputSchema: OUTPUT_SCHEMA,
				},
				async () => {
					const roster = await discoverRoster(
						options.deps ?? realDiscoveryDeps(),
					);
					return toolJson({
						available: roster.available,
						missing: roster.missing,
						availableCount: roster.available.length,
					});
				},
			);
		},
	};
};
