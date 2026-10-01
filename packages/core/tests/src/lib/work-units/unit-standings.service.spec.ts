/**
 * unit-standings.service.spec.ts — leases and verdicts against a real
 * repository: two sessions, three ages, a lease that outlives its writer.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
	gitCommonDirOf,
	recordUnitEntered,
	touchUnit,
} from '@delendai/core/lib/work-units/unit-lease.service';
import { listUnitLeases } from '@delendai/core/lib/work-units/unit-lease.store';
import {
	countStandings,
	overviewUnitsLine,
	pruneUnitLeases,
	readUnitStandings,
	summarizeStandings,
} from '@delendai/core/lib/work-units/unit-standings.service';

import {
	cleanUnitRepos,
	git,
	unitPolicy,
	unitRef,
	unitRepo,
} from './unit-repo.helper';

afterEach(cleanUnitRepos);

const MINUTE = 60;
const wall = (): number => Math.floor(Date.now() / 1000);

describe('unit standings', () => {
	it('judges live, idle and abandoned units by the age of their lease', async () => {
		const repo = unitRepo();
		const start = wall();
		for (const [agent, age] of [
			['fresh', 1],
			['quiet', 40],
			['gone', 600],
		] as const) {
			const ref = unitRef(agent);
			const worktree = repo.enter(ref);
			await recordUnitEntered({
				cwd: repo.root,
				ref,
				owner: { agent, session: `s-${agent}` },
				worktree,
				now: start - age * MINUTE,
			});
		}
		const standings = await readUnitStandings({
			root: repo.root,
			policy: unitPolicy,
			now: start,
		});
		const byAgent = Object.fromEntries(
			standings.map((entry) => [entry.owner?.agent, entry.standing]),
		);
		expect(byAgent).toEqual({
			fresh: 'live',
			quiet: 'idle',
			gone: 'abandoned',
		});
		expect(countStandings(standings)).toEqual({
			live: 1,
			idle: 1,
			abandoned: 1,
			delivered: 0,
		});
	});

	it('keeps two sessions of one agent apart and lets only the owner refresh', async () => {
		const repo = unitRepo();
		const start = wall();
		const mine = unitRef('same', 'x1-S1-g1');
		const theirs = unitRef('same', 'x1-S1-g2');
		for (const [ref, session] of [
			[mine, 'session-a'],
			[theirs, 'session-b'],
		] as const) {
			await recordUnitEntered({
				cwd: repo.root,
				ref,
				owner: { agent: 'same', session },
				worktree: repo.enter(ref),
				now: start - 90 * MINUTE,
			});
		}
		await touchUnit({
			cwd: repo.root,
			ref: mine,
			owner: { agent: 'same', session: 'session-a' },
			now: start,
		});
		// session-a reading session-b's unit must not keep it alive
		await touchUnit({
			cwd: repo.root,
			ref: theirs,
			owner: { agent: 'same', session: 'session-a' },
			now: start,
		});
		const standings = await readUnitStandings({
			root: repo.root,
			policy: unitPolicy,
			now: start,
		});
		expect(
			Object.fromEntries(standings.map((e) => [e.ref, e.standing])),
		).toEqual({ [mine]: 'live', [theirs]: 'idle' });
	});

	it('survives the process that wrote it', async () => {
		const repo = unitRepo();
		const ref = unitRef('proc');
		const worktree = repo.enter(ref);
		execFileSync(
			'bun',
			[
				'-e',
				`import { recordUnitEntered } from '@delendai/core/lib/work-units/unit-lease.service';
await recordUnitEntered({ cwd: ${JSON.stringify(repo.root)}, ref: ${JSON.stringify(ref)}, owner: { agent: 'proc', session: 'host-1' }, worktree: ${JSON.stringify(worktree)} });`,
			],
			{
				cwd: fileURLToPath(
					new URL('../../../../../../', import.meta.url),
				),
			},
		);
		const common = gitCommonDirOf(repo.root) ?? '';
		const leases = await listUnitLeases(common);
		expect(leases.get(ref)?.owner).toEqual({
			agent: 'proc',
			session: 'host-1',
		});
		const [entry] = await readUnitStandings({
			root: repo.root,
			policy: unitPolicy,
		});
		expect(entry?.standing).toBe('live');
	});

	it('says nothing in the overview while every unit is live', async () => {
		const repo = unitRepo();
		const ref = unitRef('busy');
		await recordUnitEntered({
			cwd: repo.root,
			ref,
			owner: { agent: 'busy', session: 's' },
			worktree: repo.enter(ref),
		});
		expect(
			await overviewUnitsLine({ root: repo.root, policy: unitPolicy }),
		).toBeUndefined();
		const later = wall() + 600 * MINUTE;
		const line = await overviewUnitsLine({
			root: repo.root,
			policy: unitPolicy,
			now: later,
		});
		expect(line).toBe('1 abandoned: work abandon --ref=<ref>');
		expect(line).toContain('work abandon');
		expect(
			summarizeStandings(
				await readUnitStandings({
					root: repo.root,
					policy: unitPolicy,
					now: later,
				}),
			).nextAction,
		).toContain('abandon');
	});
});

describe('pruneUnitLeases', () => {
	it('drops the lease of a unit whose ref is gone and keeps the others', async () => {
		const repo = unitRepo();
		const kept = unitRef('kept');
		const gone = unitRef('gone');
		for (const ref of [kept, gone]) {
			await recordUnitEntered({
				cwd: repo.root,
				ref,
				owner: { agent: ref, session: 's' },
				worktree: repo.enter(ref),
			});
		}
		git(repo.root, 'worktree', 'remove', '--force', `${repo.root}/../wt-2`);
		git(repo.root, 'update-ref', '-d', `refs/heads/${gone}`);
		expect(
			await pruneUnitLeases({ root: repo.root, policy: unitPolicy }),
		).toBe(1);
		const leases = await listUnitLeases(gitCommonDirOf(repo.root) ?? '');
		expect([...leases.keys()]).toEqual([kept]);
	});
});
