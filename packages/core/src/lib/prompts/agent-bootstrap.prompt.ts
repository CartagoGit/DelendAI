import type { IPromptRegistration } from '../contracts/interfaces/tool-registration.interface';
import { buildCatalog } from '../catalog/agent-discovery-catalog';
import type {
	IBuildCatalogOptions,
	ICatalogSources,
} from '../catalog/agent-discovery-types';

export interface ICatalogPromptOptions {
	readonly sources: ICatalogSources;
	readonly server: IBuildCatalogOptions['server'];
	readonly now?: () => Date;
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
					'One-click orientation for any agent connected to this MCP server. Calls `mcp-vertex_overview` first, then `mcp-vertex_agent_catalog` to discover the tools/skills/proposals you can use right now.',
			},
			async () => {
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
									'1. Call `mcp-vertex_overview` first to map the server and confirm the loaded plugin surface.',
									'2. Call `mcp-vertex_agent_catalog` with `{ "mode": "compact" }` to discover the canonical tools, skills, and actionable proposals available right now.',
									'3. Narrow with `section` or `query` before doing work, then pick the matching proposal or skill instead of rereading docs broadly.',
									'4. To use a skill: call `mcp-vertex_skill` (no args) for the compact list of what each skill is and when to use it, then `mcp-vertex_skill { "id": "<skill-id>" }` to load that one skill body only when you are about to apply it (keeps token cost low).',
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
