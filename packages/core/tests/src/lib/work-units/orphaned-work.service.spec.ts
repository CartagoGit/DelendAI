/**
 * orphaned-work.service.spec.ts — work whose author is gone is said to be
 * so, from heartbeats and the lease, and kept moving within a bound.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { shortName } from '@delendai/core/lib/development-policy/git-guard-namespaces';

import type {
	IUnitLease,
	IUnitStandingEntry,
} from '@delendai/core/lib/work-units/unit-lease.interface';
import {
	judgeAuthor,
	orphanedUnits,
	planOrphanRescues,
	readOrphanRescues,
	reportedOrphans,
	workRefOfPublication,
	writeOrphanRescues,
} from '@delendai/core/lib/work-units/orphaned-work.service';
import { handedOver } from '@delendai/core/lib/work-units/unit-adoption.service';
import { leaseWindowSeconds } from '@delendai/core/lib/work-units/unit-verdict.service';
import { ABANDONED_AFTER_LEASE_WINDOWS } from '@delendai/core/lib/work-units/unit-lease.constant';

const WINDOW = leaseWindowSeconds(30);
const NOW = 10_000_000;
const REF = 'delendai/wip/a/implement/x1-S1-g1/work';

const lease = (
	silentFor: number,
	over: Partial<IUnitLease> = {},
): IUnitLease => ({
	ref: REF,
	owner: { agent: 'a', session: 's1' },
	worktree: '/w',
	entrySha: 'abc',
	enteredAt: NOW - silentFor - 10,
	heartbeatAt: NOW - silentFor,
	...over,
});

const judged = (evidence: Partial<Parameters<typeof judgeAuthor>[0]>) =>
	judgeAuthor({
		unitEnded: false,
		now: NOW,
		windowSeconds: WINDOW,
		...evidence,
	});

describe('judgeAuthor', () => {
	it('an author with a heartbeat inside the window is there', () => {
		const presence = judged({ lease: lease(60) });
		expect(presence.orphaned).toBe(false);
		expect(presence.reason).toBeNull();
	});

	it('an author quiet but inside the recovery window is not judged gone', () => {
		expect(judged({ lease: lease(WINDOW * 2) }).orphaned).toBe(false);
	});

	it('an author idle past the recovery window is gone', () => {
		const presence = judged({
			lease: lease(WINDOW * ABANDONED_AFTER_LEASE_WINDOWS + 1),
		});
		expect(presence).toMatchObject({
			orphaned: true,
			reason: 'idle-past-window',
		});
	});

	it('an author whose unit ended is gone, whatever its last commit says', () => {
		const presence = judged({ unitEnded: true, tipAt: NOW - 5 });
		expect(presence).toMatchObject({ orphaned: true, reason: 'finished' });
	});

	it('a finished unit whose lease is live again is not orphaned', () => {
		expect(judged({ unitEnded: true, lease: lease(5) }).orphaned).toBe(
			false,
		);
	});

	it('an author out of quota is gone at once, until it beats again', () => {
		expect(
			judged({ lease: lease(60, { outOfQuotaAt: NOW - 30 }) }),
		).toMatchObject({ orphaned: true, reason: 'out-of-quota' });
		expect(
			judged({ lease: lease(10, { outOfQuotaAt: NOW - 30 }) }).orphaned,
		).toBe(false);
	});
});

const entry = (ref: string, silentFor: number): IUnitStandingEntry => ({
	ref,
	worktree: null,
	publicationRef: null,
	publicationAhead: false,
	standing: silentFor <= WINDOW ? 'live' : 'abandoned',
	owner: { agent: ref.split('/')[2] ?? 'x', session: null },
	silentSeconds: silentFor,
	reason: '',
	author: judged({ lease: lease(silentFor, { ref }) }),
});

describe('orphanedUnits', () => {
	it('a roster with one live and one orphaned unit lists only the orphaned one', () => {
		const live = 'delendai/wip/a/implement/x1-S1-g1/work';
		const gone = 'delendai/wip/b/implement/x2-S1-g1/work';
		const orphans = orphanedUnits([
			entry(live, 60),
			entry(gone, WINDOW * ABANDONED_AFTER_LEASE_WINDOWS + 60),
		]);
		expect(
			orphans.map((each) => [each.ref, each.agent, each.reason]),
		).toEqual([[gone, 'b', 'idle-past-window']]);
		expect(orphans[0]?.silentSeconds).toBeGreaterThan(0);
	});
});

describe('handedOver', () => {
	it('an adopted unit is no longer orphaned and its history names both agents', () => {
		const old = lease(WINDOW * ABANDONED_AFTER_LEASE_WINDOWS + 60, {
			outOfQuotaAt: NOW - 1,
		});
		expect(judged({ lease: old }).orphaned).toBe(true);
		const next = handedOver(
			old,
			'delendai/wip/c/implement/x1-S1-g2/work',
			'c',
			NOW,
		);
		expect(judged({ lease: next }).orphaned).toBe(false);
		expect(next.owner.agent).toBe('c');
		expect(next.handedFrom).toEqual([{ agent: 'a', ref: REF, at: NOW }]);
	});
});

describe('planOrphanRescues', () => {
	const HEAD = 'delendai/pr/b/implement/x2-S1-g1/work';

	it('brings an orphan forward while its attempts are below the bound', () => {
		const plan = planOrphanRescues({
			orphaned: [{ headRef: HEAD, behind: true }],
			rescues: { rescues: { [HEAD]: { attempts: 1 } } },
			limit: 3,
		});
		expect(plan.steps.get(HEAD)).toBe('bring-forward');
		expect(plan.next.rescues[HEAD]).toEqual({ attempts: 2 });
	});

	it('spends no attempt on an orphan nothing moved under', () => {
		const plan = planOrphanRescues({
			orphaned: [{ headRef: HEAD, behind: false }],
			rescues: { rescues: {} },
			limit: 3,
		});
		expect(plan.steps.get(HEAD)).toBe('wait');
		expect(plan.next.rescues[HEAD]).toEqual({ attempts: 0 });
	});

	it('the Nth failure reports, once, and then the orphan is left with its tip', () => {
		const now = new Date('2026-11-04T00:00:00Z');
		const first = planOrphanRescues({
			orphaned: [{ headRef: HEAD, behind: true }],
			rescues: { rescues: { [HEAD]: { attempts: 3 } } },
			limit: 3,
			now,
		});
		expect(first.steps.get(HEAD)).toBe('report');
		expect(first.next.rescues[HEAD]?.reportedAt).toBe(now.toISOString());
		const second = planOrphanRescues({
			orphaned: [{ headRef: HEAD, behind: true }],
			rescues: first.next,
			limit: 3,
		});
		expect(second.steps.get(HEAD)).toBe('left');
	});

	it('an adopted candidate is no longer touched as an orphan', () => {
		const plan = planOrphanRescues({
			orphaned: [],
			rescues: { rescues: { [HEAD]: { attempts: 2 } } },
			limit: 3,
		});
		expect(plan.steps.size).toBe(0);
		expect(plan.next.rescues).toEqual({});
	});
});

describe('a delivered publication waiting for its pull request (x01051)', () => {
	const recovery = WINDOW * ABANDONED_AFTER_LEASE_WINDOWS;

	it('is not orphaned inside the recovery window, and says why', () => {
		const presence = judged({
			unitEnded: true,
			deliveredAt: NOW - 60,
		});
		expect(presence).toMatchObject({ orphaned: false, reason: null });
		expect(presence.why).toContain('waiting for its pull request');
	});

	it('is orphaned once it has waited past the recovery window', () => {
		expect(
			judged({ unitEnded: true, deliveredAt: NOW - recovery - 1 }),
		).toMatchObject({ orphaned: true, reason: 'finished' });
	});

	it('is orphaned when nothing says it was delivered', () => {
		expect(judged({ unitEnded: true })).toMatchObject({
			orphaned: true,
			reason: 'finished',
		});
	});
});

describe('the publication a work ref was published as (x01051)', () => {
	const policy = resolveDevelopmentPolicy({
		development: { profile: 'shared-checkout-pr' },
	});
	it('maps a publication back to its work ref, and nothing else', () => {
		const published = `${shortName(policy.branches.publicationRefPrefix)}a/implement/x1-S1-g1/t`;
		expect(workRefOfPublication(policy, published)).toBe(
			`${shortName(policy.branches.workRefPrefix)}a/implement/x1-S1-g1/t`,
		);
		expect(workRefOfPublication(policy, 'feature/other')).toBeUndefined();
	});
});

describe('the rescues the hydrator keeps (x01051)', () => {
	it('survive a write and tell the owner what it gave up on', async () => {
		const root = await mkdtemp(join(tmpdir(), 'rescues-'));
		try {
			expect(await readOrphanRescues(root)).toEqual({ rescues: {} });
			await writeOrphanRescues(root, {
				rescues: {
					'delendai/pr/a/t': { attempts: 3, reportedAt: 'now' },
					'delendai/pr/b/t': { attempts: 1 },
				},
			});
			expect(await reportedOrphans(root)).toEqual([
				{ headRef: 'delendai/pr/a/t', attempts: 3, reportedAt: 'now' },
			]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
