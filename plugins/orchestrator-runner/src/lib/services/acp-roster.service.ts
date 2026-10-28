/**
 * acp-roster.service.ts — roster entries proposed from what this machine
 * shows: an entry per agent that can start here over ACP, one per
 * model-catalogue provider whose key is set, and one per model the host
 * editor serves on the person's key (BYOK), run through the host.
 *
 * They are proposals: discovery returns them for the person to confirm,
 * and nothing is written to the roster without that. Each one validates
 * against the roster schema before it is offered.
 */
import {
	isReachable,
	providerEndpoint,
	type IHostByokProvider,
} from '@delendai/core/cli';
import {
	PROVIDER_ENTRY_SCHEMA,
	type IModelCatalogue,
} from '@delendai/core/contracts';
import type { IProviderCapabilities } from '@delendai/core/public';

import type { IProposedAgent } from '../contracts/interfaces/acp-roster.interface';

/** Until the agent or the person says otherwise: a capable default. */
const AGENT_CONTEXT_WINDOW = 200_000;
const DEFAULT_COST_TIER = 3;

const kebab = (text: string): string =>
	text
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '');

/** The roster entries this machine's agents and keys make possible. */
export const proposedRosterEntries = (input: {
	readonly agents: readonly IProposedAgent[];
	readonly catalogue?: IModelCatalogue | undefined;
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly existing: readonly IProviderCapabilities[];
	/** The models this machine's editors serve on the person's keys. */
	readonly hostByok?: readonly IHostByokProvider[] | undefined;
}): readonly IProviderCapabilities[] => {
	const taken = new Set(input.existing.map((entry) => entry.id));
	const candidates: unknown[] = [
		...input.agents
			.filter((agent) => agent.canStart)
			.map((agent) => ({
				id: kebab(`acp-${agent.id}`),
				kind: 'acp',
				invoke: { kind: 'acp', agent: agent.id },
				modelId: agent.id,
				contextWindow: AGENT_CONTEXT_WINDOW,
				costTier: DEFAULT_COST_TIER,
				strengths: ['code-edit', 'agentic'],
				weaknesses: [],
			})),
		...(input.catalogue?.providers ?? []).flatMap((provider) => {
			const endpoint = providerEndpoint(provider, input.env);
			const model = provider.models[0];
			if (!isReachable(endpoint) || model === undefined) return [];
			return [
				{
					id: kebab(`api-${provider.id}`),
					kind: 'api',
					invoke: {
						kind: 'api',
						url: endpoint.baseUrl,
						envVar: endpoint.keyVariable,
						family: endpoint.family,
					},
					modelId: model.split('/').pop() ?? model,
					contextWindow: AGENT_CONTEXT_WINDOW,
					costTier: DEFAULT_COST_TIER,
					strengths: ['code-edit'],
					weaknesses: [],
				},
			];
		}),
		...(input.hostByok ?? []).flatMap((provider) =>
			provider.models.map((model) => ({
				id: kebab(`byok-${provider.vendor}-${model.id}`),
				kind: 'host-sampling',
				invoke: { kind: 'host-sampling', model: model.id },
				modelId: model.id,
				contextWindow: model.contextWindow ?? AGENT_CONTEXT_WINDOW,
				costTier: DEFAULT_COST_TIER,
				strengths:
					model.toolCalling === true
						? ['code-edit', 'agentic']
						: ['code-edit'],
				weaknesses: [],
			})),
		),
	];
	return candidates.flatMap((candidate) => {
		const parsed = PROVIDER_ENTRY_SCHEMA.safeParse(candidate);
		return parsed.success && !taken.has(parsed.data.id)
			? [parsed.data as IProviderCapabilities]
			: [];
	});
};
