import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { realPerfProfileDeps } from '../../../../src/lib/profile/real-perf-profile-deps';

describe('realPerfProfileDeps', () => {
	it('probes the Node profiler it runs, and nothing it does not', async () => {
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

describe('a flame-graph capture', () => {
	it('keeps the CPU profile it recorded and returns its path', async () => {
		const root = await mkdtemp(join(tmpdir(), 'perf-flamegraph-'));
		try {
			const deps = realPerfProfileDeps(root, {
				pluginCacheDir: join(root, 'cache'),
			});
			const run = await deps.runProfiler('node-prof', {
				cwd: root,
				timeoutMs: 20_000,
				format: 'flamegraph',
			});
			expect(run.ok).toBe(true);
			expect(run.flamegraph).toMatch(/\.cpuprofile$/u);
			expect((await stat(run.flamegraph ?? '')).size).toBeGreaterThan(0);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
