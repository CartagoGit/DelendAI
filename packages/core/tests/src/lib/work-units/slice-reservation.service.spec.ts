/**
 * slice-reservation.service.spec.ts — of two machines entering one slice,
 * the forge lets one in.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import {
	releaseSlices,
	reserveSlice,
} from '@delendai/core/lib/work-units/slice-reservation.service';
import { reapSpentReservations } from '@delendai/core/lib/work-units/slice-reservation-reap.service';
import { readWorkspacePolicy } from '@delendai/core/lib/work-units/development-policy.service';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

/** A forge and two clones of it: two machines that fetched a while ago. */
const twoMachines = () => {
	const base = mkdtempSync(join(tmpdir(), 'slice-reservation-'));
	roots.push(base);
	const forge = join(base, 'origin.git');
	execFileSync('git', ['init', '-q', '--bare', '-b', 'develop', forge]);
	const machine = (name: string, seed: boolean) => {
		const root = join(base, name);
		const git = (...args: string[]) =>
			execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
		if (seed) {
			execFileSync('git', ['init', '-q', '-b', 'develop', root]);
			git('remote', 'add', 'origin', forge);
		} else {
			execFileSync('git', ['clone', '-q', forge, root], {
				stdio: 'ignore',
			});
		}
		git('config', 'user.email', `${name}@example.com`);
		git('config', 'user.name', name);
		git('config', 'commit.gpgsign', 'false');
		if (seed) {
			writeFileSync(
				join(root, 'delendai.config.json'),
				JSON.stringify({
					development: {
						profile: 'shared-checkout-pr',
						branches: { namespacePrefix: 'delendai' },
					},
				}),
			);
			writeFileSync(join(root, '.gitignore'), '.cache/\n');
			git('add', '-A');
			git('commit', '-q', '-m', 'base');
			git('push', '-q', 'origin', 'develop');
			git('fetch', '-q', 'origin');
		}
		return { root, git };
	};
	const first = machine('first', true);
	const second = machine('second', false);
	return { first, second, forge };
};

const enter = (root: string, agent: string, slice: string, ...more: string[]) =>
	runWorkUnit(
		[
			'enter',
			'--proposal=x00001',
			`--slice=${slice}`,
			`--agent=${agent}`,
			...more,
		],
		fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
			cwd: root,
			globals: fakePartial<
				IWorkUnitContext['globals'],
				'workspace' | 'json'
			>({ workspace: root, json: true }),
		}),
	);

describe('work enter on two machines', () => {
	it('lets one agent into a slice and names it to the other, which saw no ref of it', async () => {
		const { first, second } = twoMachines();

		expect((await enter(first.root, 'agent-a', 'S1')).code).toBe(0);
		// The second machine has fetched nothing since: no ref says S1 is held.
		const lost = await enter(second.root, 'agent-b', 'S1');
		expect(lost.code).not.toBe(0);
		expect(lost.error).toContain('reserved on the forge by agent-a');

		// The whole proposal covers the slice; another slice is free.
		expect((await enter(second.root, 'agent-b', 'all')).error).toContain(
			'reserved on the forge',
		);
		expect((await enter(second.root, 'agent-b', 'S2')).code).toBe(0);
		// A deliberate second attempt is still possible.
		expect(
			(await enter(second.root, 'agent-b', 'S1', '--alongside')).code,
		).toBe(0);
	});

	it('frees the slice when the unit that held it is retired', async () => {
		const { first, second } = twoMachines();
		const held = (await enter(first.root, 'agent-a', 'S1')).data as {
			branch: string;
		};
		const retired = await runWorkUnit(
			[
				'retire',
				`--ref=${held.branch}`,
				'--reason=not going ahead',
				'--agent=agent-a',
			],
			fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
				cwd: first.root,
				globals: fakePartial<
					IWorkUnitContext['globals'],
					'workspace' | 'json'
				>({ workspace: first.root, json: true }),
			}),
		);
		expect(retired.code).toBe(0);
		expect((await enter(second.root, 'agent-b', 'S1')).code).toBe(0);
	});
});

describe('a slice reservation', () => {
	const ask = (
		root: string,
		unit: string,
		agent: string,
		now?: number,
		onForge = false,
	) =>
		reserveSlice({
			root,
			remote: 'origin',
			namespace: 'delendai',
			proposal: 'x00001',
			slice: 'S1',
			unit,
			agent,
			graceSeconds: 3600,
			branchesOf: () => (onForge ? ['develop'] : ['no-such-branch']),
			now,
		});

	it('is taken over once its unit is neither on the forge nor recent', () => {
		const { first, second } = twoMachines();
		expect(ask(first.root, 'agent-a/implement/x', 'agent-a')).toEqual({
			kind: 'reserved',
		});
		expect(ask(second.root, 'agent-b/implement/x', 'agent-b').kind).toBe(
			'taken',
		);
		const later = Math.floor(Date.now() / 1000) + 2 * 3600;
		// Still held while its unit's branch is on the forge.
		expect(
			ask(second.root, 'agent-b/implement/x', 'agent-b', later, true)
				.kind,
		).toBe('taken');
		expect(
			ask(second.root, 'agent-b/implement/x', 'agent-b', later),
		).toEqual({ kind: 'reserved' });
	});

	it('is renewed by its own unit, released by it, and not asked for without a forge', () => {
		const { first, second } = twoMachines();
		const mine = 'agent-a/implement/x';
		expect(ask(first.root, mine, 'agent-a').kind).toBe('reserved');
		expect(ask(first.root, mine, 'agent-a').kind).toBe('reserved');
		const release = (root: string, unit: string) =>
			releaseSlices({
				root,
				remote: 'origin',
				namespace: 'delendai',
				proposal: 'x00001',
				unit,
			});
		expect(release(second.root, 'agent-b/implement/x')).toBe(0);
		expect(release(first.root, mine)).toBe(1);
		expect(ask(second.root, 'agent-b/implement/x', 'agent-b').kind).toBe(
			'reserved',
		);
		second.git('remote', 'remove', 'origin');
		expect(ask(second.root, 'agent-b/implement/x', 'agent-b').kind).toBe(
			'unavailable',
		);
	});
});

describe('a slice reservation whose unit is gone', () => {
	const DAY = 86_400;
	const reap = async (root: string, apply: boolean, now: number) =>
		reapSpentReservations({
			root,
			policy: await readWorkspacePolicy(root),
			remote: 'origin',
			apply,
			now,
		});
	const claims = (git: (...args: string[]) => string): string =>
		git('ls-remote', 'origin', 'refs/delendai/claims/slice/*');

	it('is kept while its unit is on the forge or it is recent, then released', async () => {
		const { first } = twoMachines();
		expect((await enter(first.root, 'agent-a', 'S1')).code).toBe(0);
		expect((await enter(first.root, 'agent-a', 'S2')).code).toBe(0);
		const now = Math.floor(Date.now() / 1000);
		const branch = first
			.git(
				'for-each-ref',
				'--format=%(refname:short)',
				'refs/heads/delendai',
			)
			.split('\n')
			.find((name) => name.includes('x00001-S2'));
		first.git('push', '-q', 'origin', `${branch ?? ''}:${branch ?? ''}`);

		// Recent: nothing is spent, whatever the forge holds.
		expect(await reap(first.root, true, now)).toEqual([]);

		// Long after: S1's unit never reached the forge, S2's is there.
		const later = now + 30 * DAY;
		expect(await reap(first.root, false, later)).toEqual([
			expect.objectContaining({
				slice: 'x00001/s1',
				outcome: 'would-release',
			}),
		]);
		expect(claims(first.git)).toContain('x00001/s1');

		expect(await reap(first.root, true, later)).toEqual([
			expect.objectContaining({
				slice: 'x00001/s1',
				outcome: 'released',
			}),
		]);
		expect(claims(first.git)).not.toContain('x00001/s1');
		expect(claims(first.git)).toContain('x00001/s2');
	});

	it('is released at once when its unit has landed on the integration branch', async () => {
		// A unit that published and merged has no branch left, and used to
		// hold its slice for the whole abandonment window all the same.
		const { first } = twoMachines();
		expect((await enter(first.root, 'agent-a', 'S3')).code).toBe(0);
		const unit = first
			.git(
				'for-each-ref',
				'--format=%(refname:short)',
				'refs/heads/delendai',
			)
			.split('\n')
			.find((name) => name.includes('x00001-S3'))
			?.replace('delendai/wip/', '');
		expect(unit).toBeDefined();
		const now = Math.floor(Date.now() / 1000);
		expect(await reap(first.root, false, now)).toEqual([]);

		first.git(
			'commit',
			'-q',
			'--allow-empty',
			'-m',
			`Merge pull request #7 from owner/delendai/pr/${unit ?? ''}`,
		);
		first.git('push', '-q', 'origin', 'develop');

		expect(await reap(first.root, true, now)).toEqual([
			expect.objectContaining({
				slice: 'x00001/s3',
				outcome: 'released',
			}),
		]);
		expect(claims(first.git)).not.toContain('x00001/s3');
	});
});
