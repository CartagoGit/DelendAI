import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { withFileMutexes } from '@delendai/core/lib/shared/with-file-mutexes';

const scratch = (): string => mkdtempSync(join(tmpdir(), 'mcp-mutexes-'));

describe('withFileMutexes (multi-path critical section)', () => {
	it('runs the callback once with all paths locked', async () => {
		const dir = scratch();
		const a = join(dir, 'a');
		const b = join(dir, 'b');
		let calls = 0;
		await withFileMutexes([a, b], async () => {
			calls += 1;
		});
		expect(calls).toBe(1);
	});

	it('forwards a single-path call to withFileMutex', async () => {
		const dir = scratch();
		const a = join(dir, 'a');
		let calls = 0;
		await withFileMutexes([a], async () => {
			calls += 1;
		});
		expect(calls).toBe(1);
	});

	it('handles an empty path list as a no-op', async () => {
		let calls = 0;
		const out = await withFileMutexes([], async () => {
			calls += 1;
			return 42;
		});
		expect(calls).toBe(1);
		expect(out).toBe(42);
	});

	it('serialises two concurrent fan-ins with reversed orderings (anti-deadlock)', async () => {
		const dir = scratch();
		const srcA = join(dir, 'src-a');
		const srcB = join(dir, 'src-b');
		const dst = join(dir, 'dst');
		writeFileSync(srcA, 'A');
		writeFileSync(srcB, 'B');

		// Two concurrent writers, same destination, different
		// sources. The path set is `[srcX, dst]` for each; the
		// sort order is the same for both (lexicographic). They
		// must serialise on `dst`; exactly one `safeRename` wins
		// (here we simulate the same shape with a counter).
		let dstHolders = 0;
		let maxDstHolders = 0;
		const work = async (src: string): Promise<boolean> => {
			return await withFileMutexes([src, dst], async () => {
				dstHolders += 1;
				maxDstHolders = Math.max(maxDstHolders, dstHolders);
				// Yield so the other task gets a chance to enter.
				await new Promise((r) => setTimeout(r, 25));
				dstHolders -= 1;
				return src === srcA; // A wins, B raises (simulated)
			});
		};

		const [aResult, bResult] = await Promise.allSettled([
			work(srcA),
			work(srcB),
		]);

		// Both promises settled (no deadlock).
		expect(aResult.status).toBe('fulfilled');
		expect(bResult.status).toBe('fulfilled');
		// Exactly one concurrent holder of dst at any time.
		expect(maxDstHolders).toBeLessThanOrEqual(1);
	});

	it('coalesces duplicate paths', async () => {
		const dir = scratch();
		const a = join(dir, 'a');
		let calls = 0;
		await withFileMutexes([a, a, a], async () => {
			calls += 1;
		});
		expect(calls).toBe(1);
	});
});
