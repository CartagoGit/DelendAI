import { describe, expect, it } from 'vitest';

import {
	McpStdioClient,
	MetricsService,
	type IMetricsSnapshot,
} from '../../src/public/index';

const firstSnapshot: IMetricsSnapshot = {
	tools: {
		'mcp-vertex_overview': {
			calls: 1,
			errors: 0,
			totalMs: 3,
			maxMs: 3,
			totalBytes: 128,
		},
	},
	totals: {
		calls: 1,
		errors: 0,
		totalMs: 3,
		totalBytes: 128,
	},
};

describe('MetricsService', () => {
	it('fetches a metrics snapshot', async () => {
		const service = new MetricsService(
			McpStdioClient.fromTransport({
				async callTool(input) {
					expect(input).toEqual({
						name: 'mcp-vertex_metrics',
						arguments: { persist: true },
					});
					return { structuredContent: firstSnapshot };
				},
			}),
		);

		await expect(service.snapshot({ persist: true })).resolves.toEqual(
			firstSnapshot,
		);
	});

	it('streams snapshots until aborted', async () => {
		let calls = 0;
		const service = new MetricsService(
			McpStdioClient.fromTransport({
				async callTool() {
					calls += 1;
					return {
						structuredContent: {
							...firstSnapshot,
							totals: {
								...firstSnapshot.totals,
								calls,
							},
						},
					};
				},
			}),
		);
		const ac = new AbortController();
		const snapshots: IMetricsSnapshot[] = [];

		for await (const snapshot of service.stream(1, { signal: ac.signal })) {
			snapshots.push(snapshot);
			if (snapshots.length === 2) {
				ac.abort();
			}
		}

		expect(snapshots.map((snapshot) => snapshot.totals.calls)).toEqual([
			1, 2,
		]);
	});
});
