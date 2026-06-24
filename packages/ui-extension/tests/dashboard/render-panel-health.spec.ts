import { describe, expect, it } from 'vitest';

import type { IHealthSnapshot } from '@mcp-vertex/client';

import { renderPanelHealth } from '../../src/dashboard/render-panel-health';

const baseHealthy: IHealthSnapshot = {
	healthy: true,
	locksActive: 3,
	queue: null,
	orphans: 0,
	orphansThreshold: '1d',
	stale: [],
	staleCount: 0,
	agents: ['a1', 'a2'],
	fetchedAt: '2026-06-21T07:00:00.000Z',
};

const baseUnhealthy: IHealthSnapshot = {
	...baseHealthy,
	healthy: false,
	locksActive: 7,
	queue: {
		length: 4,
		queued: 2,
		orphans: 1,
		oldestAgeMinutes: 12,
		threshold: '10m',
	},
	orphans: 2,
	stale: [
		{
			kind: 'agent-idle',
			agent: 'a-stale',
			taskId: 'f126',
			ts: '2026-06-21T00:00:00Z',
			lastSeen: '2026-06-21T00:00:00Z',
			missedBeats: 5,
			suggestedActions: ['restart'],
		},
	],
	staleCount: 1,
	agents: ['a1', 'a-stale'],
};

describe('renderPanelHealth', async () => {
	it('renders the healthy status with the locks count', async () => {
		const html = renderPanelHealth(baseHealthy);
		expect(html).toContain('Healthy');
		expect(html).toContain('3');
		expect(html).toContain('panel-health');
	});

	it('renders Degraded + the queue table when unhealthy', async () => {
		const html = renderPanelHealth(baseUnhealthy);
		expect(html).toContain('Degraded');
		expect(html).toContain('Waiter orphans');
		expect(html).toContain('Oldest age');
		expect(html).toContain('a-stale');
		expect(html).toContain('agent-idle');
		expect(html).toContain('restart');
	});

	it('shows the empty-state when no queue', async () => {
		const html = renderPanelHealth(baseHealthy);
		expect(html).toContain('No queue configured.');
	});

	it('shows the empty-state when no active agents', async () => {
		const empty = { ...baseHealthy, agents: [] };
		const html = renderPanelHealth(empty);
		expect(html).toContain('No active agents.');
	});

	it('escapes user-provided strings (no XSS)', async () => {
		const evil = renderPanelHealth({
			...baseHealthy,
			agents: ['<script>alert(1)</script>'],
		});
		expect(evil).not.toContain('<script>alert(1)</script>');
		expect(evil).toContain('&lt;script&gt;');
	});
});
