/**
 * unit-liveness.service.spec.ts — one judgement of whether anybody is on
 * a unit, from its lease, its owner's session, its proof and the
 * processes inside its worktree.
 */
import { describe, expect, it } from 'vitest';

import type { IUnitLease } from '@delendai/core/lib/work-units/unit-lease.interface';
import { judgeUnitLife } from '@delendai/core/lib/work-units/unit-liveness.service';

const NOW = 1_800_000_000;
const WINDOW = 30 * 60;
const WORKTREE = '/units/wt-1';

const lease = (overrides: Partial<IUnitLease> = {}): IUnitLease => ({
	ref: 'delendai/wip/a/implement/x1-S1-g1/t',
	owner: { agent: 'a', session: 'session-1' },
	worktree: WORKTREE,
	entrySha: null,
	enteredAt: NOW - 3 * 60 * 60,
	heartbeatAt: NOW - 3 * 60 * 60,
	...overrides,
});

const nobody = { cwds: [], sessions: new Set<string>() };

const judge = (input: {
	readonly lease?: IUnitLease | undefined;
	readonly proving?: boolean;
	readonly cwds?: readonly string[];
	readonly sessions?: readonly string[];
}) =>
	judgeUnitLife({
		lease: input.lease,
		worktrees: [WORKTREE],
		proving: input.proving ?? false,
		machine: {
			cwds: input.cwds ?? nobody.cwds,
			sessions: new Set(input.sessions ?? []),
		},
		now: NOW,
		windowSeconds: WINDOW,
	});

describe('judgeUnitLife', () => {
	it('is alive on a heartbeat inside the window', () => {
		expect(
			judge({ lease: lease({ heartbeatAt: NOW - 60 }) }),
		).toMatchObject({
			alive: true,
			signs: ['heartbeat'],
		});
	});

	it('is not alive on a stale heartbeat with nothing else', () => {
		expect(judge({ lease: lease() }).alive).toBe(false);
		expect(judge({}).alive).toBe(false);
	});

	it('does not count a beat the owner said ran out of quota after', () => {
		const spent = lease({ heartbeatAt: NOW - 60, outOfQuotaAt: NOW - 30 });
		expect(judge({ lease: spent }).alive).toBe(false);
	});

	it("is alive while the owner's session runs", () => {
		expect(
			judge({ lease: lease(), sessions: ['session-1'] }).signs,
		).toEqual(['owner-session']);
		expect(judge({ lease: lease(), sessions: ['other'] }).alive).toBe(
			false,
		);
	});

	it('is alive while a proof of it is in flight', () => {
		expect(judge({ lease: lease(), proving: true }).signs).toEqual([
			'proof',
		]);
	});

	it('is alive while a process works inside its worktree, not beside it', () => {
		expect(judge({ cwds: [`${WORKTREE}/packages/core`] }).signs).toEqual([
			'process',
		]);
		expect(judge({ cwds: [WORKTREE] }).alive).toBe(true);
		expect(judge({ cwds: [`${WORKTREE}-2`] }).alive).toBe(false);
	});
});
