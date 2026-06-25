import { describe, expect, it } from 'vitest';

import {
	McpStdioClient,
	OverviewService,
	normalizeTool,
	pluginFromToolName,
	type IOverview,
} from '../../src/public/index';

const overviewFixture: IOverview = {
	server: { name: 'mcp-vertex', version: '0.1.0' },
	namespacePrefix: 'mcp-vertex',
	plugins: [{ name: 'proposals', version: '0.1.0' }, 'quality'],
	tools: [
		'mcp-vertex_status',
		{
			name: 'mcp-vertex_proposals_proposal_board',
			summary: 'Show proposal board',
			tags: ['workflow'],
			effects: ['write'],
		},
	],
	knowledge: [{ id: 'proposal-workflow', title: 'Proposal workflow' }],
	recommendedNextAction: 'Call overview first.',
};

describe('OverviewService', async () => {
	it('fetches overview through the client', async () => {
		const client = McpStdioClient.fromTransport({
			async callTool(input) {
				expect(input).toEqual({
					name: 'mcp-vertex_overview',
					arguments: { compact: true, tag: 'workflow' },
				});
				return { structuredContent: overviewFixture };
			},
		});

		await expect(
			new OverviewService(client).getOverview({
				compact: true,
				tag: 'workflow',
			}),
		).resolves.toEqual(overviewFixture);
	});

	it('normalizes overview tools into stable descriptors', async () => {
		const client = McpStdioClient.fromTransport({
			async callTool(input) {
				expect(input).toEqual({
					name: 'mcp-vertex_overview',
					arguments: { compact: true },
				});
				return { structuredContent: overviewFixture };
			},
		});

		await expect(new OverviewService(client).listTools()).resolves.toEqual([
			{
				name: 'mcp-vertex_status',
				plugin: 'mcp-vertex',
				tags: [],
				effects: [],
			},
			{
				name: 'mcp-vertex_proposals_proposal_board',
				plugin: 'proposals',
				summary: 'Show proposal board',
				tags: ['workflow'],
				effects: ['write'],
			},
		]);
	});
});

describe('normalizeTool', async () => {
	it('supports compact string entries and object entries', async () => {
		expect(normalizeTool('mcp-vertex_quality_run_quality')).toEqual({
			name: 'mcp-vertex_quality_run_quality',
			plugin: 'quality',
			tags: [],
			effects: [],
		});
		expect(
			normalizeTool({
				name: 'docs_read',
				tags: ['docs'],
			}),
		).toEqual({
			name: 'docs_read',
			plugin: 'docs',
			tags: ['docs'],
			effects: [],
		});
	});
});

describe('pluginFromToolName', async () => {
	it('keeps the core namespace intact', async () => {
		expect(pluginFromToolName('mcp-vertex_overview')).toBe('mcp-vertex');
	});
});
