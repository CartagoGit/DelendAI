import type { IResourceRegistration } from '../contracts/interfaces/tool-registration.interface';
import { buildCatalog } from '../catalog/agent-discovery-catalog';
import type {
	IBuildCatalogOptions,
	ICatalogSources,
} from '../catalog/agent-discovery-types';

export interface ICatalogResourceOptions {
	readonly mode: 'compact' | 'full';
	readonly sources: ICatalogSources;
	readonly server: IBuildCatalogOptions['server'];
	readonly now?: () => Date;
}

export const buildAgentCatalogResourceRegistration = (
	options: ICatalogResourceOptions,
): IResourceRegistration => ({
	id: `resource:agent-catalog:${options.mode}`,
	register: async (server) => {
		const uri = `mcp-vertex://catalog/${options.mode}`;
		server.registerResource(
			`agent-catalog-${options.mode}`,
			uri,
			{
				title: `Agent catalog (${options.mode})`,
				description:
					options.mode === 'compact'
						? 'Compact JSON discovery catalog for tools, skills and actionable proposals.'
						: 'Full JSON discovery catalog for tools, skills and the complete proposal registry.',
				mimeType: 'application/json',
			},
			async () => ({
				contents: [
					{
						uri,
						mimeType: 'application/json',
						text: JSON.stringify(
							buildCatalog(options.sources, {
								mode: options.mode,
								...(options.now !== undefined
									? { now: options.now }
									: {}),
								server: options.server,
							}),
						),
					},
				],
			}),
		);
	},
});
