import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '../../src/lib/transport/mcp-stdio-client';
import { SearchService } from '../../src/lib/services/search.service';
import { createFakeTransport } from './logs.service.fixtures';

const makeService = (
	responses: Parameters<typeof createFakeTransport>[0] = {
		'mcp-vertex_search_search': {
			query: 'test',
			count: 1,
			truncated: false,
			scanned: 10,
			hits: [{ file: 'docs/x.md', line: 1, text: 'test hit' }],
		},
	},
) => {
	const { transport, calls } = createFakeTransport(responses);
	const client = McpStdioClient.fromTransport(transport);
	return { service: new SearchService(client), calls };
};

describe('SearchService', async () => {
	it('search forwards query + options to the server', async () => {
		const { service, calls } = makeService();
		const out = await service.search({ query: 'overview', maxResults: 5 });
		expect(out.count).toBe(1);
		expect(out.hits[0]?.text).toBe('test hit');
		expect(calls[0]?.tool).toBe('mcp-vertex_search_search');
		expect(calls[0]?.args).toEqual({ query: 'overview', maxResults: 5 });
	});

	describe('searchTools', async () => {
		const tools = [
			{ name: 'mcp-vertex_overview', tags: ['orientation'] },
			{
				name: 'mcp-vertex_metrics',
				tags: ['observability'],
				summary: 'Per-tool call metrics',
			},
			{
				name: 'mcp-vertex_proposals_proposal_board',
				tags: ['proposals'],
			},
			{ name: 'mcp-vertex_memory_recall' },
		];

		it('returns exact match first with score 100', async () => {
			const { service } = makeService();
			const hits = service.searchTools('mcp-vertex_overview', tools);
			expect(hits[0]?.name).toBe('mcp-vertex_overview');
			expect(hits[0]?.score).toBe(100);
		});

		it('prefix match scores 60', async () => {
			const { service } = makeService();
			const hits = service.searchTools('mcp-vertex', tools);
			expect(hits[0]?.plugin).toBe('mcp-vertex');
			expect(hits[0]?.score).toBe(60);
		});

		it('substring match scores 40', async () => {
			const { service } = makeService();
			const hits = service.searchTools('proposal', tools);
			expect(hits[0]?.name).toBe('mcp-vertex_proposals_proposal_board');
		});

		it('tag match scores 20', async () => {
			const { service } = makeService();
			const hits = service.searchTools('orientation', tools);
			expect(hits[0]?.name).toBe('mcp-vertex_overview');
			expect(hits[0]?.source).toBe('tag');
		});

		it('description match scores 10', async () => {
			const { service } = makeService();
			const hits = service.searchTools('Per-tool', tools);
			expect(hits[0]?.name).toBe('mcp-vertex_metrics');
			expect(hits[0]?.source).toBe('description');
		});

		it('returns [] for empty query', async () => {
			const { service } = makeService();
			expect(service.searchTools('', tools)).toEqual([]);
			expect(service.searchTools('   ', tools)).toEqual([]);
		});

		it('respects limit', async () => {
			const { service } = makeService();
			const hits = service.searchTools('mcp-vertex', tools, 1);
			expect(hits).toHaveLength(1);
		});
	});

	describe('searchKnowledge', async () => {
		const entries = [
			{ id: 'overview', title: 'Overview of mcp-vertex' },
			{ id: 'plugins', title: 'Plugins' },
			{ id: 'metrics', title: 'Metrics', body: 'observability and KPIs' },
		];

		it('finds by exact id', async () => {
			const { service } = makeService();
			const hits = service.searchKnowledge('overview', entries);
			expect(hits[0]?.id).toBe('overview');
		});

		it('finds by body substring', async () => {
			const { service } = makeService();
			const hits = service.searchKnowledge('observability', entries);
			expect(hits[0]?.id).toBe('metrics');
		});

		it('returns [] for empty query', async () => {
			const { service } = makeService();
			expect(service.searchKnowledge('', entries)).toEqual([]);
		});
	});
});
