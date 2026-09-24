/**
 * hydration-lock.spec.ts — a second hydration steps aside and leaves a
 * note; the holder goes round again; a dead holder's lock is taken over.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	acquireHydrationLock,
	releaseHydrationLock,
	runExclusively,
	takeRerunRequest,
} from './hydration-lock';

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});
const dir = () => {
	const made = mkdtempSync(join(tmpdir(), 'hydration-lock-'));
	dirs.push(made);
	return made;
};

describe('the hydration lock', () => {
	it('lets one run in and turns a concurrent one into a rerun request', () => {
		const at = dir();
		expect(acquireHydrationLock(at)).toBe('acquired');
		// This test process is alive, so a second run is told to step aside.
		expect(acquireHydrationLock(at, 999_999)).toBe('busy');
		expect(takeRerunRequest(at)).toBe(true);
		expect(takeRerunRequest(at)).toBe(false);
	});

	it('is free again once released', () => {
		const at = dir();
		expect(acquireHydrationLock(at)).toBe('acquired');
		releaseHydrationLock(at);
		expect(acquireHydrationLock(at)).toBe('acquired');
	});

	it('takes over a lock whose holder no longer exists', () => {
		const at = dir();
		// No process has this pid.
		writeFileSync(join(at, 'hydrate-candidates.lock'), '2147483646');
		expect(acquireHydrationLock(at)).toBe('acquired');
	});
});

describe('runExclusively never leaves a rerun request behind', () => {
	it('goes round again for a run that arrived while it held the lock', () => {
		const at = dir();
		let rounds = 0;
		runExclusively(at, () => {
			rounds += 1;
			// Another hydration arrives mid-run: it finds the lock held.
			if (rounds === 1)
				expect(acquireHydrationLock(at, 999_999)).toBe('busy');
		});
		expect(rounds).toBe(2);
		expect(takeRerunRequest(at)).toBe(false);
	});

	it('leaves the work to a run that arrives after the lock is released', () => {
		const at = dir();
		runExclusively(at, () => undefined);
		// The late arrival finds no lock, so it runs itself, not a note.
		expect(acquireHydrationLock(at)).toBe('acquired');
		expect(takeRerunRequest(at)).toBe(false);
	});

	it('defers to a live holder instead of running alongside it', () => {
		const at = dir();
		acquireHydrationLock(at);
		let ran = false;
		expect(
			runExclusively(
				at,
				() => {
					ran = true;
				},
				999_999,
			),
		).toBe('deferred');
		expect(ran).toBe(false);
	});

	it('releases the lock even when the work throws', () => {
		const at = dir();
		expect(() =>
			runExclusively(at, () => {
				throw new Error('boom');
			}),
		).toThrow('boom');
		expect(acquireHydrationLock(at)).toBe('acquired');
	});
});
