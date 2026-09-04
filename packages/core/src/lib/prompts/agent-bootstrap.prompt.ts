import type { IPromptRegistration } from '../contracts/interfaces/tool-registration.interface';
import { buildCatalog } from '../catalog/agent-discovery-catalog';
import {
	DEFAULT_AGENT_POLICY,
	type IDelendaiAgentPolicyConfig,
} from '../plugins/load-config-file';
import type {
	IBuildCatalogOptions,
	ICatalogSources,
} from '../catalog/agent-discovery-types';

export interface ICatalogPromptOptions {
	readonly sources: ICatalogSources;
	readonly server: IBuildCatalogOptions['server'];
	readonly now?: () => Date;
	readonly agentPolicy?: IDelendaiAgentPolicyConfig;
}

export const buildAgentBootstrapPromptRegistration = (
	namespacePrefix: string,
	options: ICatalogPromptOptions,
): IPromptRegistration => ({
	id: 'agent_bootstrap',
	register: async (server) => {
		server.registerPrompt(
			`${namespacePrefix}_agent_bootstrap`,
			{
				description:
					'One-click orientation for any agent connected to this MCP server. Calls `delendai_overview` first, then `delendai_agent_catalog` to discover the tools/skills/proposals you can use right now.',
			},
			async () => {
				const autonomous =
					options.agentPolicy?.autonomous ??
					DEFAULT_AGENT_POLICY.autonomous;
				const principles =
					options.agentPolicy?.principles ??
					DEFAULT_AGENT_POLICY.principles;
				const catalog = buildCatalog(options.sources, {
					mode: 'compact',
					...(options.now !== undefined ? { now: options.now } : {}),
					server: options.server,
				});
				const actionable =
					catalog.proposals.length === 0
						? 'none'
						: catalog.proposals
								.map((proposal) => proposal.id)
								.join(', ');
				return {
					messages: [
						{
							role: 'user' as const,
							content: {
								type: 'text' as const,
								text: [
									`Working mode: ${autonomous ? 'autonomous by default' : 'collaborative / ask before autonomous execution'}.`,
									'Engineering principles:',
									...principles.map(
										(principle) => `- ${principle}`,
									),
									'1. Call `delendai_overview` first to map the server and confirm the loaded plugin surface.',
									'2. Call `delendai_agent_catalog` with `{ "mode": "compact" }` to discover the canonical tools, skills, and actionable proposals available right now.',
									'3. Narrow with `section` or `query` before doing work, then pick the matching proposal or skill instead of rereading docs broadly.',
									'4. To use a skill: call `delendai_skill` (no args) for the compact list of what each skill is and when to use it, then `delendai_skill { "id": "<skill-id>" }` to load that one skill body only when you are about to apply it (keeps token cost low).',
									`Actionable proposals: ${actionable}`,
								].join('\n'),
							},
						},
					],
				};
			},
		);
	},
});
