import { describe, expect, it } from 'vitest';

import { realPerfProfileDeps } from '../../../../src/lib/profile/real-perf-profile-deps';

describe('realPerfProfileDeps', () => {
	it('probes node version and profiler binaries in deterministic order', async () => {
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

		const probes = await deps.probeProfilers('hotspots');
		expect(seen).toEqual(['node', '0x', 'clinic']);
		expect(probes[0]).toMatchObject({
			tool: 'node-prof',
			available: true,
			version: '22.9.0',
		});
		expect(probes[1]).toMatchObject({ tool: '0x', available: false });
	});

	it('prefers flamegraph-oriented probes when requested', async () => {
		const seen: string[] = [];
		const deps = realPerfProfileDeps('/tmp/workspace', {
			probeDeps: {
				commandExists: async (bin: string) => {
					seen.push(bin);
					return false;
				},
				runVersion: async () => '',
			},
		});

		await deps.probeProfilers('flamegraph');
		expect(seen).toEqual(['0x', 'clinic', 'node']);
	});
});
