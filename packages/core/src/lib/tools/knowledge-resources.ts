import type { IKnowledgeEntry } from '../contracts/interfaces/knowledge.interface';
import type { IResourceRegistration } from '../contracts/interfaces/tool-registration.interface';

/**
 * Expose each knowledge entry as a native MCP **resource**
 * (`knowledge://<id>`) in addition to the `knowledge` tool. Clients
 * that support resources can list, read and cache them natively, which
 * is the idiomatic, low-token way to surface reference material across
 * very different agents and clients.
 */
export const buildKnowledgeResourceRegistrations = (
	knowledge: readonly IKnowledgeEntry[],
): readonly IResourceRegistration[] =>
	knowledge.map((entry) => ({
		id: `resource:${entry.id}`,
		register: async (server) => {
			const uri = `knowledge://${entry.id}`;
			server.registerResource(
				entry.id,
				uri,
				{
					title: entry.title,
					description: entry.title,
					mimeType: 'text/markdown',
				},
				async () => ({
					contents: [
						{
							uri,
							mimeType: 'text/markdown',
							text: entry.body,
						},
					],
				}),
			);
		},
	}));
