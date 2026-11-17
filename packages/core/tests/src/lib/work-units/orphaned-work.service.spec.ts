/**
 * orphaned-work.service.spec.ts — a publication delivered a moment ago is
 * waiting for its pull request, not orphaned (x01051). What git says is
 * answered from a table, so no process runs; the same reading against a
 * real repository is the e2e spec beside it.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	createInMemoryGit,
	fakePartial,
	gitReadCacheOf,
} from '@delendai/test-kit';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { withGitReadCache } from '@delendai/core/lib/shared/git-read.helper';
import {
	liveUnitRefs,
	unitLifeNow,
} from '@delendai/core/lib/work-units/unit-liveness.service';
import type { IOrphanRescues } from '@delendai/core/lib/contracts/interfaces/orphaned-work.interface';
import type {
	IUnitLease,
	IUnitStandingEntry,
} from '@delendai/core/lib/work-units/unit-lease.interface';
import {
	judgeAuthor,
	orphanedUnits,
	planOrphanRescues,
	publicationPresence,
	readOrphanRescues,
	reportedOrphans,
	workRefOfPublication,
	writeOrphanRescues,
} from '@delendai/core/lib/work-units/orphaned-work.service';
import { readOrphans } from '@delendai/core/lib/work-units/publication-standings.service';

const ROOT = '/clone';
const policy = resolveDevelopmentPolicy({
	development: { profile: 'shared-checkout-pr' },
});
const publication = `${policy.branches.publicationRefPrefix.replace(/^refs\/heads\//u, '').replace(/\/$/u, '')}/claude-opus-5-5/implement/x1-all-g1/guard`;
const BASE = 'a'.repeat(40);
const TIP = 'b'.repeat(40);

/** A clone whose unit ended: no work ref, and the delivered tip a minute old. */
const delivered = (): ReturnType<typeof createInMemoryGit> => {
	const justNow = String(Math.floor(Date.now() / 1000) - 60);
	return createInMemoryGit({
		'rev-parse --path-format=absolute --git-common-dir':
			'/nonexistent/.git',
		'for-each-ref --format=%(refname)%09%(objectname) refs/heads/wip/** refs/remotes/**/wip/**':
			'',
		'config --get branch.develop.remote': 'origin',
		'rev-parse -q --verify develop^{commit}': BASE,
		'rev-parse -q --verify refs/remotes/origin/develop^{commit}': '',
		[`log -1 --no-merges --format=%ct ${BASE}..${TIP}`]: justNow,
	});
};
/** The machine has no other process: nothing says the unit's author is alive. */
const readMachine = async (): Promise<{
	readonly cwds: string[];
	readonly sessions: Set<string>;
}> => ({ cwds: [], sessions: new Set() });
const read = <T>(git: ReturnType<typeof createInMemoryGit>, body: () => T): T =>
	withGitReadCache(gitReadCacheOf(git), body);

describe('publicationPresence on a just-delivered publication (x01051)', () => {
	it('[<35ms] reads its owner as alive, and as gone when it dates from long ago and carries no tip', async () => {
		const git = delivered();
		const withTips = await read(git, () =>
			publicationPresence({
				root: ROOT,
				policy,
				publications: [publication],
				tips: new Map([[publication, TIP]]),
				readMachine,
			}),
		);
		expect(withTips.get(publication)?.orphaned).toBe(false);
		const without = await read(git, () =>
			publicationPresence({
				root: ROOT,
				policy,
				publications: [publication],
				readMachine,
			}),
		);
		expect(without.get(publication)?.orphaned).toBe(true);
		const orphans = await read(git, () =>
			readOrphans({
				root: ROOT,
				policy,
				published: [
					{
						ref: publication,
						agent: 'claude-opus-5-5',
						subject: 'guard',
						tip: TIP,
						ahead: 1,
						behind: 0,
						paths: ['b.txt'],
					},
				],
				standings: [],
				readMachine,
			}),
		);
		expect(orphans.orphans).toEqual([]);
		expect(orphans.presence.get(publication)?.orphaned).toBe(false);
	});
});

describe('publicationPresence on a unit that still has its work ref', () => {
	it('[<35ms] dates the unit from its own last commit', async () => {
		const sha = 'c'.repeat(40);
		const workRef = workRefOfPublication(policy, publication) ?? '';
		const justNow = String(Math.floor(Date.now() / 1000) - 30);
		const git = createInMemoryGit({
			'rev-parse --path-format=absolute --git-common-dir':
				'/nonexistent/.git',
			'for-each-ref --format=%(refname)%09%(objectname) refs/heads/wip/** refs/remotes/**/wip/**': `refs/heads/${workRef}\t${sha}`,
			'config --get branch.develop.remote': 'origin',
			'rev-parse -q --verify develop^{commit}': BASE,
			'rev-parse -q --verify refs/remotes/origin/develop^{commit}': '',
			[`log -1 --no-merges --format=%ct ${BASE}..${sha}`]: justNow,
		});
		const presence = await read(git, () =>
			publicationPresence({
				root: ROOT,
				policy,
				publications: [publication],
				readMachine,
			}),
		);
		expect(presence.get(publication)?.orphaned).toBe(false);
	});
});

const NOW = 1_000_000;
const WINDOW = 600;
const RECOVERY = WINDOW * 8;
const lease = (over: Partial<IUnitLease>): IUnitLease =>
	({
		ref: 'wip/a/implement/x1-all-g1/t',
		owner: { agent: 'claude-opus-5-5' },
		heartbeatAt: NOW - 10,
		...over,
	}) as IUnitLease;
const judge = (
	over: Parameters<typeof judgeAuthor>[0] extends infer E
		? Partial<E>
		: never,
) =>
	judgeAuthor({ unitEnded: false, now: NOW, windowSeconds: WINDOW, ...over });

describe('judgeAuthor', () => {
	it('[<10ms] keeps a unit whose author beat inside the window', () => {
		expect(judge({ lease: lease({}) })).toMatchObject({ orphaned: false });
	});

	it('[<10ms] says a session that ran out of quota and shows no life is gone', () => {
		const verdict = judge({
			lease: lease({ heartbeatAt: NOW - 100, outOfQuotaAt: NOW - 50 }),
		});
		expect(verdict).toMatchObject({
			orphaned: true,
			reason: 'out-of-quota',
		});
	});

	it('[<10ms] says an ended unit with no live lease finished', () => {
		expect(judge({ unitEnded: true })).toMatchObject({
			orphaned: true,
			reason: 'finished',
		});
	});

	it('[<10ms] waits for a delivered unit inside the recovery window, and judges it past it', () => {
		const delivered = (ago: number) =>
			judge({ unitEnded: true, deliveredAt: NOW - ago });
		expect(delivered(RECOVERY)).toMatchObject({ orphaned: false });
		expect(delivered(RECOVERY + 1)).toMatchObject({
			orphaned: true,
			reason: 'finished',
		});
	});

	it('[<10ms] says a unit silent past the recovery window idle, and one quiet inside it not', () => {
		expect(judge({ tipAt: NOW - RECOVERY - 1 })).toMatchObject({
			orphaned: true,
			reason: 'idle-past-window',
		});
		expect(judge({ tipAt: NOW - WINDOW - 1 })).toMatchObject({
			orphaned: false,
		});
	});

	it('[<10ms] does not judge a unit gone without a beat to date it from', () => {
		expect(judge({})).toMatchObject({
			orphaned: false,
			silentSeconds: null,
		});
	});
});

describe('the orphans of a swarm', () => {
	const entry = (
		standing: IUnitStandingEntry['standing'],
		orphaned: boolean,
	): IUnitStandingEntry =>
		fakePartial<IUnitStandingEntry, 'ref' | 'standing' | 'author'>({
			ref: `wip/${standing}`,
			standing,
			author: {
				orphaned,
				reason: orphaned ? 'finished' : null,
				silentSeconds: 1,
				why: 'w',
			},
		});

	it('[<10ms] lists orphaned units except the delivered and the waiting', () => {
		const listed = orphanedUnits([
			entry('abandoned', true),
			entry('delivered', true),
			entry('waiting', true),
			entry('live', false),
		]);
		expect(listed.map((unit) => unit.ref)).toEqual(['wip/abandoned']);
		expect(listed[0]?.agent).toBe('unknown');
	});

	it('[<10ms] names the work ref a publication was published from', () => {
		expect(
			workRefOfPublication(
				policy,
				'pr/claude-opus-5-5/implement/x1-all-g1/t',
			),
		).toBe('wip/claude-opus-5-5/implement/x1-all-g1/t');
		expect(workRefOfPublication(policy, 'feature/x')).toBeUndefined();
	});
});

describe('planOrphanRescues', () => {
	const at = new Date('2026-11-13T00:00:00Z');
	const plan = (rescues: IOrphanRescues['rescues'], behind: boolean) =>
		planOrphanRescues({
			orphaned: [{ headRef: 'h', behind }],
			rescues: { rescues },
			limit: 2,
			now: at,
		});

	it('[<10ms] brings a candidate that is behind forward and counts the attempt', () => {
		const planned = plan({}, true);
		expect(planned.steps.get('h')).toBe('bring-forward');
		expect(planned.next.rescues.h).toEqual({ attempts: 1 });
	});

	it('[<10ms] waits without spending an attempt on one nothing moved under', () => {
		expect(plan({ h: { attempts: 1 } }, false).steps.get('h')).toBe('wait');
	});

	it('[<10ms] reports once at the bound, then leaves it alone', () => {
		const reported = plan({ h: { attempts: 2 } }, true);
		expect(reported.steps.get('h')).toBe('report');
		expect(reported.next.rescues.h?.reportedAt).toBe(at.toISOString());
		expect(plan(reported.next.rescues, true).steps.get('h')).toBe('left');
	});
});

describe('the rescue count on disk', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});

	it('[<30ms] starts empty, keeps what it was given and tells the owner of the reported', async () => {
		const root = mkdtempSync(join(tmpdir(), 'orphan-rescues-'));
		dirs.push(root);
		expect(await readOrphanRescues(root)).toEqual({ rescues: {} });
		await writeOrphanRescues(root, {
			rescues: {
				a: { attempts: 1 },
				b: { attempts: 3, reportedAt: '2026-11-13T00:00:00.000Z' },
			},
		});
		expect((await readOrphanRescues(root)).rescues.a).toEqual({
			attempts: 1,
		});
		expect(await reportedOrphans(root)).toEqual([
			{
				headRef: 'b',
				attempts: 3,
				reportedAt: '2026-11-13T00:00:00.000Z',
			},
		]);
	});
});

describe('the life of a unit nobody holds', () => {
	const common = createInMemoryGit({
		'rev-parse --path-format=absolute --git-common-dir':
			'/nonexistent/.git',
	});
	const unit = 'wip/claude-opus-5-5/implement/x1-all-g1/t';

	it('[<35ms] reads it as not alive, one unit or many, on a machine with no sign of it', async () => {
		const life = await read(common, () =>
			unitLifeNow({ root: ROOT, policy, ref: unit, readMachine }),
		);
		expect(life.alive).toBe(false);
		const live = await read(common, () =>
			liveUnitRefs({ root: ROOT, policy, refs: [unit], readMachine }),
		);
		expect([...live]).toEqual([]);
	});
});
