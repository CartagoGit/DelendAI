import { describe, expect, it } from 'vitest';

import { realPerfProfileDeps } from '../../../../src/lib/profile/real-perf-profile-deps';

describe('realPerfProfileDeps', () => {
	it('[<200ms] probes the Node profiler it runs, and nothing it does not', async () => {
		const seen: string[] = [];
		const deps = realPerfProfileDeps('/tmp/workspace', {
			probeDeps: {
				commandExists: async (bin: string) => {
					seen.push(bin);
					return bin === 'node';
				},
				runVersion: async (bin: string) =>
					bin === 'node' ? 'v22.9.0' : '',
			},
		});

		for (const format of ['hotspots', 'flamegraph'] as const) {
			const probes = await deps.probeProfilers(format);
			expect(probes).toHaveLength(1);
			expect(probes[0]).toMatchObject({
				tool: 'node-prof',
				available: true,
				version: '22.9.0',
			});
		}
		expect(seen).toEqual(['node', 'node']);
	});
});
