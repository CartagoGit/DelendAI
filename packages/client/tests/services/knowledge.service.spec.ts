import { describe, expect, it } from 'vitest';

import {
	KnowledgeNotFoundError,
	KnowledgeService,
	McpStdioClient,
	categoryOf,
} from '../../src/public/index';

const fakeClient = (responses: Record<string, unknown>) =>
	McpStdioClient.fromTransport({
		async callTool(input: { name: string; arguments?: unknown }) {
			const r = responses[input.name];
			if (r === undefined) return { content: [{ text: '{}' }] };
			return { structuredContent: r };
		},
	});

const fullFixture = {
	'mcp-vertex_knowledge': {
		entries: [
			{ id: 'mcp-vertex_overview', title: 'Overview' },
			{ id: 'mcp-vertex_metrics', title: 'Metrics' },
			{ id: 'proposals_state_machine', title: 'Proposal state machine' },
			{ id: 'proposals_lifecycle', title: 'Proposal lifecycle' },
			{ id: 'memory_recall', title: 'Memory recall' },
		],
	},
};

describe('KnowledgeService (f126 S3a)', () => {
	it('listKnowledge forwards to mcp-vertex_knowledge', async () => {
		const service = new KnowledgeService(fakeClient(fullFixture));
		const out = await service.listKnowledge();
		expect(out).toHaveLength(5);
	});

	it('listByCategory groups entries by plugin prefix', async () => {
		const service = new KnowledgeService(fakeClient(fullFixture));
		const grouped = await service.listByCategory();
		const keys = Object.keys(grouped).sort();
		expect(keys).toContain('mcp-vertex');
		expect(keys).toContain('proposals');
		expect(keys).toContain('memory');
	});

	it('listByCategory sorts each bucket by title', async () => {
		const service = new KnowledgeService(
			fakeClient({
				'mcp-vertex_knowledge': {
					entries: [
						{ id: 'p_state_machine', title: 'Z-state' },
						{ id: 'p_lifecycle', title: 'A-lifecycle' },
					],
				},
			}),
		);
		const grouped = await service.listByCategory();
		const titles = Object.values(grouped)
			.flat()
			.map((e) => e.title);
		expect(titles).toEqual(['A-lifecycle', 'Z-state']);
	});

	describe('filterByQuery', () => {
		const entries = [
			{ id: 'mcp-vertex_overview', title: 'Overview' },
			{ id: 'proposals_state_machine', title: 'Proposal state machine' },
			{ id: 'memory_recall', title: 'Memory recall' },
		];

		it('returns all entries when query is empty', () => {
			const service = new KnowledgeService(fakeClient({}));
			expect(service.filterByQuery(entries, '')).toHaveLength(
				entries.length,
			);
		});

		it('finds by exact id', () => {
			const service = new KnowledgeService(fakeClient({}));
			const filtered = service.filterByQuery(
				entries,
				'mcp-vertex_overview',
			);
			expect(filtered[0]?.id).toBe('mcp-vertex_overview');
		});

		it('finds by substring in title', () => {
			const service = new KnowledgeService(fakeClient({}));
			const filtered = service.filterByQuery(entries, 'state');
			expect(
				filtered.some((e) => e.id === 'proposals_state_machine'),
			).toBe(true);
		});

		it('respects limit', () => {
			const service = new KnowledgeService(fakeClient({}));
			expect(
				service.filterByQuery(entries, 'mcp-vertex', 1),
			).toHaveLength(1);
		});

		it('returns [] for non-matching query', () => {
			const service = new KnowledgeService(fakeClient({}));
			expect(service.filterByQuery(entries, 'nope')).toEqual([]);
		});
	});

	it('getKnowledge returns the full entry', async () => {
		const service = new KnowledgeService(
			fakeClient({
				'mcp-vertex_knowledge': {
					id: 'mcp-vertex_overview',
					title: 'Overview',
					body: 'Detailed body',
				},
			}),
		);
		const entry = await service.getKnowledge('mcp-vertex_overview');
		expect(entry.body).toBe('Detailed body');
	});

	it('getKnowledge throws KnowledgeNotFoundError when missing', async () => {
		const service = new KnowledgeService(
			fakeClient({ 'mcp-vertex_knowledge': { entries: [] } }),
		);
		await expect(service.getKnowledge('missing')).rejects.toBeInstanceOf(
			KnowledgeNotFoundError,
		);
	});
});

describe('categoryOf', () => {
	it('returns the plugin prefix (everything before the first _)', () => {
		expect(categoryOf('proposals_state_machine')).toBe('proposals');
		expect(categoryOf('mcp-vertex_overview')).toBe('mcp-vertex');
		expect(categoryOf('memory_recall')).toBe('memory');
	});

	it('returns "other" when the id has no underscore', () => {
		expect(categoryOf('foo')).toBe('other');
	});

	it('returns the prefix even with a single underscore', () => {
		expect(categoryOf('foo_bar')).toBe('foo');
	});
});
