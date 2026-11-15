/**
 * load-benchmark.helper.ts — a fixed piece of the work end-to-end tests do:
 * a few process spawns and small file writes and reads. How long it takes
 * on a shard, against the committed reference, is that shard's load factor.
 * The work is injected so a spec drives it without a process or a disk.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ILoadBenchmarkWork } from '../../contracts/interfaces/load-benchmark.interface';

const SPAWNS = 15;
const FILES = 100;

/** The pass's real work, in its own temporary directory. */
export const realLoadBenchmarkWork = (): ILoadBenchmarkWork => {
	const dir = mkdtempSync(join(tmpdir(), 'load-benchmark-'));
	return {
		now: () => performance.now(),
		spawn: () => {
			execFileSync('git', ['--version'], { stdio: 'ignore' });
		},
		writeAndRead: (index) => {
			const file = join(dir, `f${String(index)}.txt`);
			writeFileSync(file, 'x'.repeat(2048));
			readFileSync(file);
		},
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
};

/** How long the benchmark took, in ms: fifteen spawns and a hundred small files. */
export const measureLoadBenchmark = (
	work: ILoadBenchmarkWork = realLoadBenchmarkWork(),
): number => {
	const start = work.now();
	try {
		for (let index = 0; index < SPAWNS; index += 1) work.spawn();
		for (let index = 0; index < FILES; index += 1) work.writeAndRead(index);
	} finally {
		work.cleanup();
	}
	return work.now() - start;
};
