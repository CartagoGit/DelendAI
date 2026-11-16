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
});
