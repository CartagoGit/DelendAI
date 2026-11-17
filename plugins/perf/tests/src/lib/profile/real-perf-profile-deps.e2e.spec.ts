import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { realPerfProfileDeps } from '../../../../src/lib/profile/real-perf-profile-deps';

describe('a flame-graph capture on a real Node process', () => {
	it('[<20000ms] keeps the CPU profile it recorded and returns its path', async () => {
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
			expect(run).toMatchObject({ ok: true });
			expect(run.flamegraph).toMatch(/\.cpuprofile$/u);
			expect((await stat(run.flamegraph ?? '')).size).toBeGreaterThan(0);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
