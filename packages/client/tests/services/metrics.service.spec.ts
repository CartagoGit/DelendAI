import { describe, expect, it } from 'vitest';

import {
	McpStdioClient,
	MetricsService,
	type IMetricsSnapshot,
} from '../../src/public/index';

const metric = (
	calls: number,
	errors: number,
	totalMs: number,
	maxMs: number,
	totalBytes: number,
) => ({
	calls,
	errors,
	totalMs,
	maxMs,
	totalBytes,
	cost: {
		contentTextBytes: totalBytes,
		structuredJsonBytes: 0,
		wireEstimateBytes: totalBytes,
		estimatedTokens: {
			estimatedTokens4B: Math.ceil(totalBytes / 4),
		},
	},
});

const firstSnapshot: IMetricsSnapshot = {
	tools: {
		delendai_overview: metric(1, 0, 3, 3, 128),
	},
	totals: {
		calls: 1,
		errors: 0,
		totalMs: 3,
		totalBytes: 128,
		cost: {
			contentTextBytes: 128,
			structuredJsonBytes: 0,
			wireEstimateBytes: 128,
			estimatedTokens: {
				estimatedTokens4B: 32,
			},
		},
	},
};

describe('MetricsService', async () => {
	it('fetches a metrics snapshot', async () => {
		const service = new MetricsService(
			McpStdioClient.fromTransport({
				async callTool(input) {
					expect(input).toEqual({
						name: 'delendai_metrics',
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

		for await (const snapshot of await service.stream(1, {
			signal: ac.signal,
		})) {
			snapshots.push(snapshot);
			if (snapshots.length === 2) {
				ac.abort();
			}
		}

		expect(snapshots.map((snapshot) => snapshot.totals.calls)).toEqual([
			1, 2,
		]);
	});

	it('does not leak abort listeners across stream ticks', async () => {
		const service = new MetricsService(
			McpStdioClient.fromTransport({
				async callTool() {
					return { structuredContent: firstSnapshot };
				},
			}),
		);
		// A minimal AbortSignal that honours `{ once: true }` and exposes how
		// many listeners are still attached. If `wait()` forgot to remove its
		// listener on the timeout path, each completed tick would leave one
		// behind and `liveCount` would grow with the number of ticks.
		const live = new Set<() => void>();
		const once = new WeakSet<() => void>();
		const signal = {
			aborted: false,
			addEventListener(
				_type: string,
				cb: () => void,
				opts?: { once?: boolean },
			): void {
				live.add(cb);
				if (opts?.once === true) once.add(cb);
			},
			removeEventListener(_type: string, cb: () => void): void {
				live.delete(cb);
			},
			fire(): void {
				this.aborted = true;
				for (const cb of [...live]) {
					if (once.has(cb)) live.delete(cb);
					cb();
				}
			},
		};

		let ticks = 0;
		for await (const _ of await service.stream(1, {
			signal: signal as unknown as AbortSignal,
		})) {
			if (++ticks === 4) signal.fire();
		}

		expect(ticks).toBe(4);
		expect(live.size).toBe(0);
	});
});
