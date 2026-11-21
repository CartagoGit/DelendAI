/**
 * unit-standings.service.spec.ts — who holds a slice, over fakes: only a
 * live lease does (x01100).
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type {
	IUnitStanding,
	IUnitStandingEntry,
} from '@delendai/core/lib/work-units/unit-lease.interface';
import { isUnitHolding } from '@delendai/core/lib/work-units/unit-standings.service';
import { judgeUnit } from '@delendai/core/lib/work-units/unit-verdict.service';

describe('isUnitHolding over fakes', () => {
	const entry = (ref: string, standing: IUnitStanding) =>
		fakePartial<IUnitStandingEntry, 'ref' | 'standing'>({ ref, standing });

	it('[<100ms] holds for a live lease and for nothing else', () => {
		const standings = [
			'live',
			'idle',
			'abandoned',
			'delivered',
			'waiting',
		] as const;
		const entries = standings.map((standing) => entry(standing, standing));
		expect(
			standings.filter((standing) => isUnitHolding(entries, standing)),
		).toEqual(['live']);
	});

	it('[<100ms] frees a released or expired lease and blocks while one is live', () => {
		const verdict = (silentSeconds: number) =>
			judgeUnit({
				lease: {
					ref: 'r',
					owner: { agent: 'a', session: null },
					worktree: null,
					entrySha: null,
					enteredAt: 0,
					heartbeatAt: 1000 - silentSeconds,
				},
				delivered: false,
				now: 1000,
				windowSeconds: 1800,
			}).standing;
		expect(isUnitHolding([entry('r', verdict(60))], 'r')).toBe(true);
		expect(isUnitHolding([entry('r', verdict(1801))], 'r')).toBe(false);
		// handed over: its work landed and its owner is quiet
		const handed = judgeUnit({
			delivered: true,
			tipAt: 0,
			now: 5000,
			windowSeconds: 1800,
		}).standing;
		expect(isUnitHolding([entry('r', handed)], 'r')).toBe(false);
	});

	it('[<100ms] does not change a standing because another agent is on the proposal: the lease owner is evidence of liveness only', () => {
		const verdict = (extra: object) =>
			judgeUnit({
				delivered: true,
				keptForContinuation: true,
				tipAt: 0,
				now: 3000,
				windowSeconds: 1800,
				...extra,
			}).standing;
		expect(verdict({})).toBe('idle');
		const sources = ['unit-lease.interface.ts', 'unit-verdict.service.ts'];
		for (const name of sources)
			expect(
				readFileSync(
					new URL(
						`../../../../src/lib/work-units/${name}`,
						import.meta.url,
					),
					'utf8',
				),
			).not.toContain('claimedByOther');
	});
});
