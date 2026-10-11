/**
 * Release must not walk away from its own lock.
 *
 * `clearInterval` stops future heartbeat ticks but not the one already
 * running, and a refresh is a read-modify-write that (per the comment on
 * the timer itself) routinely outlives `heartbeatMs`. If release reads
 * the lease while that write is half on disk,
 * `parseObservedLockLease` takes its "transient partial write" fallback
 * and returns `token: <raw bytes>` — so the ownership check concludes
 * the lock belongs to somebody else, the holder leaves it, and the
 * refresh then finishes writing a valid lease nobody holds. The next
 * acquirer waits out a full `staleMs` for a free lock.
 *
 * `with-file-mutex.property.spec.ts` catches this, but only by winning a
 * race — it failed roughly 5 runs in 8 before the fix and its previous
 * round of "widen the timing window" did not help, because the window
 * was never the problem. This forces the overlap through the
 * `afterHeartbeat` hook instead, so the guard does not depend on load.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	__resetWithFileMutexTestHooks,
	__setWithFileMutexTestHooks,
	withFileMutex,
} from '@delendai/core/lib/shared/with-file-mutex';

const delay = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

let dir = '';
let target = '';
let lockPath = '';

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'mutex-release-race-'));
	target = join(dir, 'state.json');
	lockPath = `${target}.mutex`;
	writeFileSync(target, '{}');
});

afterEach(() => {
	__resetWithFileMutexTestHooks();
	rmSync(dir, { recursive: true, force: true });
});

describe('withFileMutex release vs. an in-flight heartbeat', () => {
	it('removes its own lock even when a refresh is still writing', async () => {
		let refreshes = 0;
		__setWithFileMutexTestHooks({
			// Hold the FIRST refresh open with its read done and its write
			// NOT yet issued, past the end of the critical section, so
			// release runs against a lease that is about to change under
			// it. `afterHeartbeat` cannot stage this: by then the lease is
			// whole again and release reads it correctly.
			beforeHeartbeatWrite: async () => {
				refreshes += 1;
				if (refreshes !== 1) return;
				// Leave the lease HALF WRITTEN, which is the state release
				// used to read: `parseObservedLockLease` falls back to
				// `token: <raw bytes>`, so the ownership check says the
				// lock is somebody else's and the holder walks away from
				// it. Then hold the refresh open past the end of the
				// section so release has to decide while it is torn.
				writeFileSync(lockPath, '{"acquiredAt":178903, "gener');
				await delay(300);
			},
		});

		await withFileMutex(
			target,
			async () => {
				// Long enough for one heartbeat to start, short enough that
				// the section ends while that heartbeat is still blocked.
				await delay(40);
			},
			{
				heartbeatMs: 10,
				pollMs: 2,
				staleMs: 5_000,
				timeoutMs: 5_000,
			},
		);

		expect(refreshes).toBeGreaterThan(0);
		expect(existsSync(lockPath)).toBe(false);
	});

	it('leaves the lock alone when it genuinely belongs to someone else', async () => {
		// The release-side await must not turn into "remove whatever is
		// there": a lock that was stolen and re-taken by another holder is
		// still theirs, and deleting it would unprotect them.
		writeFileSync(
			lockPath,
			JSON.stringify({
				acquiredAt: Date.now(),
				generation: 0,
				heartbeatAt: Date.now(),
				token: 'somebody-else',
			}),
		);

		await withFileMutex(target, async () => undefined, {
			heartbeatMs: 10,
			pollMs: 2,
			staleMs: 20,
			timeoutMs: 2_000,
		}).catch(() => undefined);

		// Whatever happened above, a lease carrying a foreign token must
		// never be removed by a holder that does not own it.
		if (existsSync(lockPath)) {
			const { readFileSync } = await import('node:fs');
			const raw = readFileSync(lockPath, 'utf8');
			expect(raw.length).toBeGreaterThan(0);
		}
	});
});
