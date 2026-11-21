/**
 * unit-heartbeat.service.spec.ts — only a beating lease holds a unit
 * (x01100): a finished owner's leftover session stamp does not.
 */
import { describe, expect, it } from 'vitest';

import type { IUnitLease } from '@delendai/core/lib/work-units/unit-lease.interface';
import { isBeating } from '@delendai/core/lib/work-units/unit-heartbeat.service';
import { heldByAnother } from '@delendai/core/lib/work-units/work-unit-shared.service';

const WINDOW = 1800;
const lease = (heartbeatAt: number, outOfQuotaAt?: number): IUnitLease => ({
	ref: 'r',
	owner: { agent: 'a', session: 's' },
	worktree: null,
	entrySha: null,
	enteredAt: 0,
	heartbeatAt,
	...(outOfQuotaAt === undefined ? {} : { outOfQuotaAt }),
});

describe('isBeating', () => {
	it('[<10ms] beats inside the window and not after it', () => {
		expect(isBeating(lease(1000), 1000 + WINDOW, WINDOW)).toBe(true);
		expect(isBeating(lease(1000), 1001 + WINDOW, WINDOW)).toBe(false);
	});

	it('[<10ms] a unit with no lease, or an owner out of quota, does not beat', () => {
		expect(isBeating(undefined, 1000, WINDOW)).toBe(false);
		expect(isBeating(lease(1000, 1000), 1001, WINDOW)).toBe(false);
	});
});

describe('heldByAnother', () => {
	it('[<10ms] a quiet lease never refuses, whatever session stamp is left', () => {
		expect(
			heldByAnother('/no/such/worktree', 'mine', false),
		).toBeUndefined();
	});
});
