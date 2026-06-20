import type { McpVertexToolOutputs } from '@mcp-vertex/core/public';

import type { McpStdioClient } from '../transport/mcp-stdio-client';
import type {
	IKnowledgeEntry,
	IKnowledgeSummary,
} from './tool-descriptor.types';

type IKnowledgeOutput = McpVertexToolOutputs['mcp-vertex_knowledge'];

export class KnowledgeNotFoundError extends Error {
	constructor(readonly id: string) {
		super(`MCP knowledge entry "${id}" was not returned by the server`);
		this.name = 'KnowledgeNotFoundError';
	}
}

export class KnowledgeService {
	constructor(private readonly client: McpStdioClient) {}

	async listKnowledge(): Promise<readonly IKnowledgeSummary[]> {
		const output = await this.client.request<
			Record<string, never>,
			IKnowledgeOutput
		>('mcp-vertex_knowledge', {});
		return output.entries ?? [];
	}

	async getKnowledge(id: string): Promise<IKnowledgeEntry> {
		const output = await this.client.request<
			{ id: string },
			IKnowledgeOutput
		>('mcp-vertex_knowledge', { id });
		if (
			output.id === undefined ||
			output.title === undefined ||
			output.body === undefined
		) {
			throw new KnowledgeNotFoundError(id);
		}
		return {
			id: output.id,
			title: output.title,
			body: output.body,
		};
	}
}
