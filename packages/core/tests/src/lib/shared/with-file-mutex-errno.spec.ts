import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * q00016 S5: the reclaim path's outer `catch` used to be a bare
 * `catch { continue; }` with a comment claiming it only ever sees the
 * sidecar vanishing between `open` and `stat` (ENOENT). It did not check
 * the error code, so it also swallowed the ALREADY-correct rethrows from
 * the nested reclaimError/guardError/commitError handlers underneath it —
 * turning any non-ENOENT error (EACCES, EPERM, EIO, EISDIR…) during the
 * steal-rename step into a silent retry loop. That loop then times out
 * and reports `LockContentionError`, which hides the real cause behind a
 * generic "contention" diagnosis.
 *
 * This spec injects an EPERM failure at the exact rename() call that
 * moves a stale lock out of the way for reclaiming (`rename(lockPath,
 * reclaimPath)`), and asserts the real error surfaces instead of being
 * reported as lock contention.
 */
vi.mock('node:fs/promises', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs/promises')>();
	return {
		...actual,
		rename: vi.fn(
			async (
				src: Parameters<typeof actual.rename>[0],
				dest: Parameters<typeof actual.rename>[1],
			) => {
				// Only the "steal" rename (lockPath -> lockPath.reclaim.*)
				// is targeted; the restore rename (reclaimPath -> lockPath)
				// and every other fs call pass straight through.
				if (typeof dest === 'string' && dest.includes('.reclaim.')) {
					const error = new Error(
						'EPERM: operation not permitted, rename (injected)',
					) as NodeJS.ErrnoException;
					error.code = 'EPERM';
					throw error;
				}
				return actual.rename(src, dest);
			},
		),
	};
});

const { LockContentionError, withFileMutex } = await import(
	'../../../../src/lib/shared/with-file-mutex'
);

describe('withFileMutex — non-ENOENT errors in the reclaim path', () => {
	let dir = '';
	let target = '';
	let lockPath = '';

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mutex-errno-'));
		target = join(dir, 'state.json');
		lockPath = `${target}.mutex`;
	});

	afterEach(() => {
		vi.clearAllMocks();
		rmSync(dir, { recursive: true, force: true });
	});

	it('propagates a non-ENOENT error from the steal rename instead of retrying into LockContentionError', async () => {
		// A genuinely stale lock: heartbeat far in the past, so the reclaim
		// path is entered and reaches the steal rename() we've sabotaged.
		writeFileSync(
			lockPath,
			JSON.stringify({
				acquiredAt: Date.now() - 60_000,
				generation: 3,
				heartbeatAt: Date.now() - 60_000,
				token: 'stale-holder',
			}),
		);

		let ran = false;
		const start = Date.now();
		let caught: unknown;
		try {
			await withFileMutex(
				target,
				async () => {
					ran = true;
				},
				{ timeoutMs: 400, staleMs: 1_000, pollMs: 20 },
			);
		} catch (error) {
			caught = error;
		}
		const elapsedMs = Date.now() - start;

		expect(ran).toBe(false);
		expect(caught).toBeDefined();
		// Must be the real EPERM, not a LockContentionError manufactured by
		// looping until the deadline.
		expect(caught).not.toBeInstanceOf(LockContentionError);
		expect((caught as NodeJS.ErrnoException).code).toBe('EPERM');
		// A bare `catch { continue; }` would retry every pollMs until the
		// 400ms deadline; surfacing the real error should be fast because
		// it happens on the FIRST reclaim attempt.
		expect(elapsedMs).toBeLessThan(300);
		// The original (untouched) lock sidecar is still exactly where it
		// was: the failed rename never actually moved it.
		expect(existsSync(lockPath)).toBe(true);
	});
});
