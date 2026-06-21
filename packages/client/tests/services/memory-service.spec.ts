import { describe, expect, it } from 'vitest';

import { MemoryService } from '../../src/lib/services/memory-service';
import { McpStdioClient } from '../../src/lib/transport/mcp-stdio-client';
import { createFakeTransport } from './logs-service.fixtures';

const makeService = () => {
	const { transport, calls } = createFakeTransport({
		memory_list: {
			notes: [{ id: 'n1', title: 'Decision', tags: ['proposal'] }],
			total: 1,
			offset: 0,
		},
		memory_recall: {
			notes: [
				{
					id: 'n1',
					title: 'Decision',
					body: 'Use the proposal workflow.',
					tags: ['proposal'],
					createdAt: '2026-06-21T00:00:00.000Z',
					updatedAt: '2026-06-21T00:00:00.000Z',
				},
			],
		},
		memory_save: {
			ok: true,
			saved: {
				id: 'n1',
				title: 'Decision',
				body: 'Use the proposal workflow.',
				tags: ['proposal'],
				createdAt: '2026-06-21T00:00:00.000Z',
				updatedAt: '2026-06-21T00:00:00.000Z',
			},
			redactedSecrets: 0,
		},
		memory_forget: { ok: true, removed: 'n1' },
	});
	return {
		service: new MemoryService(McpStdioClient.fromTransport(transport)),
		calls,
	};
};

describe('MemoryService', () => {
	it('lists memory notes', async () => {
		const { service, calls } = makeService();
		const result = await service.list({ limit: 5 });
		expect(result.total).toBe(1);
		expect(result.notes[0]?.title).toBe('Decision');
		expect(calls[0]).toEqual({ tool: 'memory_list', args: { limit: 5 } });
	});

	it('recalls memory notes', async () => {
		const { service, calls } = makeService();
		const result = await service.recall({ query: 'proposal' });
		expect(result[0]?.body).toContain('proposal workflow');
		expect(calls[0]).toEqual({
			tool: 'memory_recall',
			args: { query: 'proposal' },
		});
	});

	it('saves and forgets memory notes', async () => {
		const { service, calls } = makeService();
		const saved = await service.save({
			title: 'Decision',
			body: 'Use the proposal workflow.',
			tags: ['proposal'],
		});
		const forgotten = await service.forget(saved.saved.id);
		expect(forgotten.removed).toBe('n1');
		expect(calls.map((c) => c.tool)).toEqual([
			'memory_save',
			'memory_forget',
		]);
	});
});
