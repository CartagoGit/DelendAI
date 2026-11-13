/**
 * compute-slot-wait-notice.service.spec.ts — what a waiter for the compute
 * slot is told. The case the watch cannot cover is a slot whose directory
 * cannot be watched: the waiter still says it waits, naming no holder.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createWaitNotice } from '@delendai/core/lib/shared/compute-slot-wait-notice.service';

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

describe('createWaitNotice', () => {
	it('[<50ms] says it waits without a watch, and ends saying it had waited', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'wait-notice-'));
		dirs.push(dir);
		const told: string[] = [];
		let spoke: () => void = () => undefined;
		const said = new Promise<void>((resolve) => {
			spoke = resolve;
		});
		const notice = createWaitNotice({
			lockPath: join(dir, 'missing', 'heavy-compute.lock'),
			label: 'proof of aaa by agent-a',
			urgent: 'review fix',
			delayMs: 0,
			notify: (message) => {
				told.push(message);
				spoke();
			},
		});
		await said;
		expect(told).toHaveLength(1);
		expect(told[0]).toContain('"proof of aaa by agent-a" is waiting');
		expect(told[0]).toContain('another run holds');
		expect(told[0]).toContain('This turn is urgent (review fix)');
		expect(notice.end()).toBe(true);
		expect(notice.end()).toBe(false);
	});

	it('[<20ms] says nothing when the turn comes before the delay', () => {
		const told: string[] = [];
		const notice = createWaitNotice({
			lockPath: join(tmpdir(), 'never', 'heavy-compute.lock'),
			label: 'x',
			urgent: undefined,
			delayMs: 60_000,
			notify: (message) => told.push(message),
		});
		expect(notice.end()).toBe(false);
		expect(told).toEqual([]);
	});
});
