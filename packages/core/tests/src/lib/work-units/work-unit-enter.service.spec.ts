/**
 * work-unit-enter.service.spec.ts — the refusal `work enter` gives a slice
 * a live lease holds, over fakes (x01100).
 */
import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { ISwarmUnit } from '@delendai/core/lib/contracts/interfaces/work-swarm.interface';
import { describeSliceHolders } from '@delendai/core/lib/work-units/slice-holders.service';
import type { IUnitStandingEntry } from '@delendai/core/lib/work-units/unit-lease.interface';
import { judgeUnit } from '@delendai/core/lib/work-units/unit-verdict.service';

describe('a live-lease refusal (x01100)', () => {
	it('[<100ms] names the lease heartbeat age and the idle window', () => {
		const holder = fakePartial<ISwarmUnit, 'agent' | 'ref' | 'ahead'>({
			agent: 'claude-opus-5',
			ref: 'delendai/wip/claude-opus-5/implement/x00901-S1-g1/t',
			ahead: 1,
		});
		const verdict = judgeUnit({
			lease: {
				ref: holder.ref,
				owner: { agent: holder.agent, session: null },
				worktree: null,
				entrySha: null,
				enteredAt: 0,
				heartbeatAt: 1000 - 180,
			},
			delivered: false,
			now: 1000,
			windowSeconds: 1800,
		});
		const text = describeSliceHolders(
			[holder],
			[
				fakePartial<IUnitStandingEntry, 'ref' | 'reason'>({
					ref: holder.ref,
					reason: verdict.reason,
				}),
			],
		).join('\n');
		expect(text).toContain('claude-opus-5 holds it in');
		expect(text).toContain('3 min old, inside the 30 min window');
	});

	it("[<100ms] leaves no refusal that says 'someone else' or 'another session'", () => {
		const dir = new URL('../../../../src/lib/work-units/', import.meta.url);
		const found = readdirSync(dir)
			.filter((name) => name.endsWith('.ts'))
			.filter((name) =>
				/someone else|another session/iu.test(
					readFileSync(new URL(name, dir), 'utf8'),
				),
			);
		expect(found).toEqual([]);
	});
});
