/**
 * unit-verdict.service.spec.ts — one verdict per unit, from the age of its
 * last sign of life against the lease window.
 */
import { describe, expect, it } from 'vitest';

import type { IUnitLease } from '@delendai/core/lib/work-units/unit-lease.interface';
import {
	judgeUnit,
	leaseWindowSeconds,
} from '@delendai/core/lib/work-units/unit-verdict.service';

const WINDOW = leaseWindowSeconds(30);
const NOW = 1_000_000;

const lease = (silentFor: number): IUnitLease => ({
	ref: 'delendai/wip/a/implement/x1-S1-g1/work',
	owner: { agent: 'a', session: 's1' },
	worktree: '/w',
	entrySha: 'abc',
	enteredAt: NOW - silentFor,
	heartbeatAt: NOW - silentFor,
});

const standingAfter = (silentFor: number, delivered = false): string =>
	judgeUnit({
		lease: lease(silentFor),
		delivered,
		now: NOW,
		windowSeconds: WINDOW,
	}).standing;

describe('judgeUnit', () => {
	it('is live inside the lease window', () => {
		expect(standingAfter(WINDOW - 1)).toBe('live');
	});

	it('is idle past the window, with its owner still known', () => {
		const verdict = judgeUnit({
			lease: lease(WINDOW + 1),
			delivered: false,
			now: NOW,
			windowSeconds: WINDOW,
		});
		expect(verdict.standing).toBe('idle');
		expect(verdict.owner).toEqual({ agent: 'a', session: 's1' });
	});

	it('is abandoned once its owner has been silent for eight windows', () => {
		expect(standingAfter(WINDOW * 8)).toBe('idle');
		expect(standingAfter(WINDOW * 8 + 1)).toBe('abandoned');
	});

	it('is delivered when proved so and its owner has gone quiet', () => {
		expect(standingAfter(WINDOW + 1, true)).toBe('delivered');
	});

	it('stays live when delivered but its owner is still working', () => {
		expect(standingAfter(10, true)).toBe('live');
	});

	it('dates a unit that predates leases from its last commit', () => {
		const verdict = judgeUnit({
			tipAt: NOW - WINDOW * 9,
			delivered: false,
			now: NOW,
			windowSeconds: WINDOW,
		});
		expect(verdict.standing).toBe('abandoned');
		expect(verdict.owner).toBeNull();
	});

	it('does not call a unit abandoned without any evidence', () => {
		expect(
			judgeUnit({ delivered: false, now: NOW, windowSeconds: WINDOW })
				.standing,
		).toBe('idle');
	});

	it('takes a default window when the policy says never expire', () => {
		expect(leaseWindowSeconds(0)).toBe(30 * 60);
		expect(leaseWindowSeconds(45)).toBe(45 * 60);
	});
});
