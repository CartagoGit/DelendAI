import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LOAD_FACTOR_ENV, loadFactorFromEnv } from '@delendai/test-kit/public';
import { describe, expect, it } from 'vitest';

import { realPerfProfileDeps } from '../../../../src/lib/profile/real-perf-profile-deps';

/**
 * The profiler's own deadline, stretched by the same load factor as the e2e
 * test budget. Measured here: the profiling run takes about 0.1 s and
 * `--prof-process` about 1.0 s (it runs `nm` over every shared library),
 * so each step has a 20x margin inside its deadline. The budget below is
 * twice the deadline: two steps can each use theirs, and a slow CI host then
 * fails with the profiler's deadline message, not at the budget's boundary.
 */
const PROFILER_DEADLINE_MS =
	20_000 * loadFactorFromEnv(process.env[LOAD_FACTOR_ENV]);

describe('a flame-graph capture on a real Node process', () => {
	it('[<40000ms] keeps the CPU profile it recorded and returns its path', async () => {
		const root = await mkdtemp(join(tmpdir(), 'perf-flamegraph-'));
		try {
			const deps = realPerfProfileDeps(root, {
				pluginCacheDir: join(root, 'cache'),
			});
			const run = await deps.runProfiler('node-prof', {
				cwd: root,
				timeoutMs: PROFILER_DEADLINE_MS,
				format: 'flamegraph',
			});
			// A failed capture names its step, exit code, deadline and the
			// profiler's own output: vitest elides nested fields of a diff.
			expect(run.ok, JSON.stringify(run)).toBe(true);
			expect(run.flamegraph).toMatch(/\.cpuprofile$/u);
			expect((await stat(run.flamegraph ?? '')).size).toBeGreaterThan(0);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
