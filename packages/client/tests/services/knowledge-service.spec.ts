import { describe, expect, it } from 'vitest';

import {
	KnowledgeNotFoundError,
	KnowledgeService,
	McpStdioClient,
} from '../../src/public/index';

describe('KnowledgeService', () => {
	it('lists knowledge summaries', async () => {
		const client = McpStdioClient.fromTransport({
			async callTool(input) {
				expect(input).toEqual({
					name: 'mcp-vertex_knowledge',
					arguments: {},
				});
				return {
					structuredContent: {
						entries: [
							{
								id: 'proposal-workflow',
								title: 'Proposal workflow',
							},
						],
					},
				};
			},
		});

		await expect(
			new KnowledgeService(client).listKnowledge(),
		).resolves.toEqual([
			{
				id: 'proposal-workflow',
				title: 'Proposal workflow',
			},
		]);
	});

	it('fetches a knowledge body by id', async () => {
		const client = McpStdioClient.fromTransport({
			async callTool(input) {
				expect(input).toEqual({
					name: 'mcp-vertex_knowledge',
					arguments: { id: 'proposal-workflow' },
				});
				return {
					structuredContent: {
						id: 'proposal-workflow',
						title: 'Proposal workflow',
						body: 'Use proposals intentionally.',
					},
				};
			},
		});

		await expect(
			new KnowledgeService(client).getKnowledge('proposal-workflow'),
		).resolves.toEqual({
			id: 'proposal-workflow',
			title: 'Proposal workflow',
			body: 'Use proposals intentionally.',
		});
	});

	it('throws when the server does not return a complete entry', async () => {
		const client = McpStdioClient.fromTransport({
			async callTool() {
				return { structuredContent: { entries: [] } };
			},
		});

		await expect(
			new KnowledgeService(client).getKnowledge('missing'),
		).rejects.toBeInstanceOf(KnowledgeNotFoundError);
	});
});
