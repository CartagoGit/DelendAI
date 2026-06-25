import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '../../src/lib/transport/mcp-stdio-client';
import { HealthService } from '../../src/lib/services/health.service';
import {
	createFakeTransport,
	healthyFixture,
	unhealthyFixture,
} from './health.service.fixtures';

const makeService = (
	responses: Parameters<typeof createFakeTransport>[0] = healthyFixture,
) => {
	const { transport, calls } = createFakeTransport(responses);
	const client = McpStdioClient.fromTransport(transport);
	return { service: new HealthService(client), calls };
};

describe('HealthService', async () => {
	it('snapshot returns a healthy snapshot with lock + agent counts', async () => {
		const { service, calls } = makeService();
		const snap = await service.snapshot();
		expect(snap.healthy).toBe(true);
		expect(snap.locksActive).toBe(3);
		expect(snap.queue).toBeNull();
		expect(snap.orphans).toBe(0);
		expect(snap.agents).toEqual(['a1', 'a2']);
		expect(snap.staleCount).toBe(0);
		// 3 upstream tool calls (state_health, stale_list, agent_names).
		const names = calls.map((c) => c.tool);
		expect(names).toContain('mcp-vertex_proposals_state_health');
		expect(names).toContain('mcp-vertex_proposals_proposal_stale_list');
		expect(names).toContain('mcp-vertex_proposals_agent_names');
	});

	it('snapshot reports unhealthy when the queue has orphans', async () => {
		const { service } = makeService(unhealthyFixture);
		const snap = await service.snapshot();
		expect(snap.healthy).toBe(false);
		expect(snap.locksActive).toBe(7);
		expect(snap.queue?.length).toBe(4);
		expect(snap.queue?.orphans).toBe(1);
		expect(snap.queue?.oldestAgeMinutes).toBe(12);
		expect(snap.orphans).toBe(2);
		expect(snap.stale).toHaveLength(1);
		expect(snap.stale[0]?.agent).toBe('a-stale');
		expect(snap.stale[0]?.kind).toBe('agent-idle');
	});

	it('snapshot skips the stale list when includeStaleList: false', async () => {
		const { service, calls } = makeService(healthyFixture);
		await service.snapshot({ includeStaleList: false });
		const names = calls.map((c) => c.tool);
		expect(names).not.toContain('mcp-vertex_proposals_proposal_stale_list');
	});

	it('degrades gracefully when every tool is missing', async () => {
		const { service } = makeService({});
		const snap = await service.snapshot();
		expect(snap.healthy).toBe(false);
		expect(snap.locksActive).toBe(0);
		expect(snap.staleCount).toBe(0);
		expect(snap.agents).toEqual([]);
	});
});
