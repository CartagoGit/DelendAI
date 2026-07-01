import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { McpStdioClient } from '../../src/lib/transport/mcp-stdio-client';
import { ConnectionHealthService } from '../../src/lib/services/connection-health.service';

const makeService = async (
	pingImpl: () => Promise<unknown> = async () => ({}),
	opts: ConstructorParameters<typeof ConnectionHealthService>[1] = {},
) => {
	const client = McpStdioClient.fromTransport({
		async callTool(input: { name: string }) {
			if (input.name === 'mcp-vertex_status-marker_ping') {
				const value = await pingImpl();
				return { structuredContent: value ?? {}, content: [] };
			}
			return { structuredContent: {}, content: [] };
		},
	});
	const service = new ConnectionHealthService(client, opts);
	return { service };
};

describe('ConnectionHealthService', async () => {
	beforeEach(() => {
		vi.useRealTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts in `up` state after a successful ping', async () => {
		const { service } = await makeService();
		service.start();
		await new Promise((r) => setTimeout(r, 30));
		const snap = service.snapshot();
		expect(snap.state).toBe('up');
		expect(snap.lastError).toBeNull();
		expect(snap.consecutiveFailures).toBe(0);
		service.stop();
	});

	it('flips to `down` after the failure threshold', async () => {
		const events: string[] = [];
		const { service } = await makeService(
			async () => {
				throw new Error('server gone');
			},
			{ pingIntervalMs: 50, pingTimeoutMs: 10, failureThreshold: 2 },
		);
		service.addEventListener((e) => events.push(e.state));
		service.start();
		await new Promise((r) => setTimeout(r, 200));
		service.stop();
		expect(events).toContain('down');
		expect(service.snapshot().lastError).toMatch(/server gone/);
	});

	it('emits `retrying` while below the failure threshold', async () => {
		const events: string[] = [];
		const { service } = await makeService(
			async () => {
				throw new Error('flaky');
			},
			{ pingIntervalMs: 30, pingTimeoutMs: 10, failureThreshold: 5 },
		);
		service.addEventListener((e) => events.push(e.state));
		service.start();
		await new Promise((r) => setTimeout(r, 100));
		service.stop();
		expect(events).toContain('retrying');
		expect(events).not.toContain('down');
	});

	it('recovers from `down` when ping succeeds again', async () => {
		let ok = false;
		const events: string[] = [];
		const { service } = await makeService(
			async () => {
				if (!ok) throw new Error('down');
				return {};
			},
			{ pingIntervalMs: 30, pingTimeoutMs: 10, failureThreshold: 2 },
		);
		service.addEventListener((e) => events.push(e.state));
		service.start();
		await new Promise((r) => setTimeout(r, 100));
		expect(service.snapshot().state).toBe('down');
		ok = true;
		await new Promise((r) => setTimeout(r, 100));
		expect(service.snapshot().state).toBe('up');
		expect(events).toEqual(expect.arrayContaining(['down', 'up']));
		service.stop();
	});

	it('stop() clears the timer', async () => {
		const events: string[] = [];
		const { service } = await makeService(undefined, {
			pingIntervalMs: 30,
		});
		service.addEventListener((e) => events.push(e.state));
		service.start();
		await new Promise((r) => setTimeout(r, 50));
		service.stop();
		const before = events.length;
		await new Promise((r) => setTimeout(r, 100));
		expect(events.length).toBe(before);
	});

	it('addEventListener returns an unsubscribe', async () => {
		const { service } = await makeService();
		const events: string[] = [];
		const unsub = service.addEventListener((e) => events.push(e.state));
		unsub();
		service.start();
		await new Promise((r) => setTimeout(r, 30));
		service.stop();
		expect(events).toEqual([]);
	});
});
