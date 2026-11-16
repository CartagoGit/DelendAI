import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IArgvExec } from '@delendai/core/contracts';
import { describe, expect, it } from 'vitest';

import { realPerfProfileDeps } from '../../../../src/lib/profile/real-perf-profile-deps';

const input = {
	cwd: '/tmp/workspace',
	timeoutMs: 20_000,
	format: 'flamegraph',
} as const;

const withRoot = async (
	run: (root: string) => Promise<void>,
): Promise<void> => {
	const root = await mkdtemp(join(tmpdir(), 'perf-deadline-'));
	try {
		await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
};

describe('a flame-graph capture with an injected exec', () => {
	it('[<200ms] says the deadline passed when the profiling run is killed', async () => {
		await withRoot(async (root) => {
			const exec: IArgvExec = async () => ({
				code: -1,
				stdout: '',
				stderr: '',
				timedOut: true,
			});
			const deps = realPerfProfileDeps(root, {
				pluginCacheDir: join(root, 'cache'),
				exec,
			});
			const run = await deps.runProfiler('node-prof', input);
			expect(run).toMatchObject({
				ok: false,
				timedOut: true,
				detail: 'The profiling run passed its 20000 ms deadline.',
			});
		});
	});

	it('[<200ms] keeps the CPU profile the run recorded and returns its path', async () => {
		await withRoot(async (root) => {
			const exec: IArgvExec = async (argv, options) => {
				const dirArg = argv.find((arg) =>
					arg.startsWith('--cpu-prof-dir='),
				);
				if (dirArg !== undefined) {
					const dir = dirArg.slice('--cpu-prof-dir='.length);
					await writeFile(join(dir, 'isolate-0x1-v8.log'), 'log');
					await writeFile(
						join(dir, 'CPU.1.cpuprofile'),
						'{"nodes":[]}',
					);
				}
				return {
					code: 0,
					stdout: options?.cwd === undefined ? '' : 'ticks',
					stderr: '',
					timedOut: false,
				};
			};
			const deps = realPerfProfileDeps(root, {
				pluginCacheDir: join(root, 'cache'),
				exec,
			});
			const run = await deps.runProfiler('node-prof', input);
			expect(run).toMatchObject({ ok: true, report: 'ticks' });
			expect(run.flamegraph).toMatch(/\.cpuprofile$/u);
			expect(await readFile(run.flamegraph ?? '', 'utf8')).toBe(
				'{"nodes":[]}',
			);
		});
	});

	it('[<200ms] reports a failing run by its output when no deadline passed', async () => {
		await withRoot(async (root) => {
			const deps = realPerfProfileDeps(root, {
				pluginCacheDir: join(root, 'cache'),
				exec: async () => ({
					code: 1,
					stdout: '',
					stderr: 'boom',
					timedOut: false,
				}),
			});
			expect(await deps.runProfiler('node-prof', input)).toMatchObject({
				ok: false,
				code: 1,
				timedOut: false,
				detail: 'boom',
			});
		});
	});

	it('[<200ms] keeps the output of a run killed at its deadline', async () => {
		await withRoot(async (root) => {
			const deps = realPerfProfileDeps(root, {
				pluginCacheDir: join(root, 'cache'),
				exec: async () => ({
					code: -1,
					stdout: 'partial',
					stderr: '',
					timedOut: true,
				}),
			});
			expect(await deps.runProfiler('node-prof', input)).toMatchObject({
				ok: false,
				timedOut: true,
				detail: 'The profiling run passed its 20000 ms deadline. partial',
			});
		});
	});

	it('[<200ms] says so when the run left no isolate log', async () => {
		await withRoot(async (root) => {
			const deps = realPerfProfileDeps(root, {
				pluginCacheDir: join(root, 'cache'),
				exec: async () => ({
					code: 0,
					stdout: '',
					stderr: '',
					timedOut: false,
				}),
			});
			expect(
				await deps.runProfiler('node-prof', {
					...input,
					format: 'hotspots',
				}),
			).toMatchObject({
				ok: false,
				detail: 'Node CPU profiler did not emit an isolate log.',
			});
		});
	});

	it('[<200ms] names the deadline when the log processing is killed', async () => {
		await withRoot(async (root) => {
			const exec: IArgvExec = async (argv, options) => {
				if (argv.includes('--prof-process')) {
					return { code: -1, stdout: '', stderr: '', timedOut: true };
				}
				await writeFile(
					join(options?.cwd ?? '', 'isolate-0x1-v8.log'),
					'log',
				);
				return { code: 0, stdout: '', stderr: '', timedOut: false };
			};
			const deps = realPerfProfileDeps(root, {
				pluginCacheDir: join(root, 'cache'),
				exec,
			});
			expect(
				await deps.runProfiler('node-prof', {
					...input,
					format: 'hotspots',
				}),
			).toMatchObject({
				ok: false,
				timedOut: true,
				detail: 'The log processing passed its 20000 ms deadline.',
			});
		});
	});

	it('[<200ms] returns no flame graph when the run recorded no CPU profile', async () => {
		await withRoot(async (root) => {
			const exec: IArgvExec = async (argv, options) => {
				if (!argv.includes('--prof-process')) {
					await writeFile(
						join(options?.cwd ?? '', 'isolate-0x1-v8.log'),
						'log',
					);
				}
				return {
					code: 0,
					stdout: 'ticks',
					stderr: '',
					timedOut: false,
				};
			};
			const deps = realPerfProfileDeps(root, {
				pluginCacheDir: join(root, 'cache'),
				exec,
			});
			const run = await deps.runProfiler('node-prof', input);
			expect(run).toMatchObject({ ok: true, report: 'ticks' });
			expect(run.flamegraph).toBeUndefined();
		});
	});
});
