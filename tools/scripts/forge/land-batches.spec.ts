/**
 * land-batches.spec.ts — a batch survives the integration branch moving
 * apart from it, a head the forge never built is brought forward once, a
 * cross-repository head is never built or batched, and a derived conflict
 * is left to the two derived jobs. Against a forge in memory.
 */
import {
	LAND_LABEL_NEEDS_UPDATE,
	LAND_WORKFLOW_TOKEN_ACTOR,
	landConfigFromPolicy,
	landPass,
	type ILandDeps,
} from '@delendai/core/cli';
import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { describe, expect, it } from 'vitest';

import { FAKE_DERIVED, createFakeWorld } from './land-fake';

const CONFIG = landConfigFromPolicy(
	resolveDevelopmentPolicy({
		development: {
			branches: {
				integration: 'develop',
				release: 'main',
				namespacePrefix: 'delendai',
			},
			integration: { requiredChecks: ['tests: a'] },
		},
	}),
	{
		sectionOfCheck: (name) =>
			name.startsWith('tests: ') ? name.slice(7) : undefined,
		batches: true,
	},
);

const setup = (extra: Partial<ILandDeps> = {}) => {
	const fake = createFakeWorld({ 'a/y.ts': '0' });
	const pass = () =>
		landPass({
			forge: fake.forge,
			git: fake.git,
			config: CONFIG,
			...extra,
		});
	const lone = (n: number) => {
		const pr = fake.world.pulls.get(n);
		if (pr === undefined) throw new Error(`no #${String(n)}`);
		return pr;
	};
	return { ...fake, pass, lone };
};

describe('a batch while the integration branch moves', () => {
	it('[<20ms] still merges its members when the branch moved apart from it, checking the footprint', async () => {
		const { world, pass, lone } = setup();
		const one = world.addPull({ 'a/one.ts': '1' });
		const two = world.addPull({ 'a/two.ts': '2' });
		world.ci();
		await pass();
		world.ci();
		world.push({ 'b/other.ts': 'x' });
		const report = await pass();
		expect(report.mergedPRs).toEqual([one, two]);
		expect(lone(one).merged && lone(two).merged).toBe(true);
	});

	it('[<20ms] batches the group once on the new tip when the branch moved in what the batch reaches', async () => {
		const { world, pass, lone } = setup();
		const one = world.addPull({ 'a/one.ts': '1' });
		const two = world.addPull({ 'a/two.ts': '2' });
		world.ci();
		await pass();
		const [first] = [...world.pulls.values()].filter(
			(pr) => pr.batch !== undefined,
		);
		world.ci();
		world.push({ 'a/other.ts': 'x' });
		const report = await pass();
		expect(report.mergedCount).toBe(0);
		expect(first?.state).toBe('closed');
		expect(report.actions.join('\n')).toContain(
			'the integration branch moved in',
		);
		const fresh = [...world.pulls.values()].filter(
			(pr) => pr.batch !== undefined && pr.state === 'open',
		);
		expect(fresh).toHaveLength(1);
		expect(lone(one).merged || lone(two).merged).toBe(false);
	});
});

describe('a head the forge did not build', () => {
	it('[<15ms] is brought forward by the integrator once, then lands', async () => {
		const calls: number[] = [];
		const fake = createFakeWorld();
		const bring: NonNullable<ILandDeps['bringForward']> = async (pr) => {
			calls.push(pr.number);
			fake.world.bringForward(pr.number);
			return 'brought';
		};
		const n = fake.world.addPull(
			{ 'a/x.ts': '1' },
			{ author: LAND_WORKFLOW_TOKEN_ACTOR },
		);
		fake.world.ci();
		const run = () =>
			landPass({
				forge: fake.forge,
				git: fake.git,
				config: CONFIG,
				bringForward: bring,
			});
		const first = await run();
		expect(calls).toEqual([n]);
		expect(first.reasons.get(n)).toContain('brought forward');
		expect(fake.world.pulls.get(n)?.labels).not.toContain(
			LAND_LABEL_NEEDS_UPDATE,
		);
		fake.world.ci();
		expect((await run()).mergedPRs).toEqual([n]);
		expect(calls).toEqual([n]);
	});

	it('[<15ms] is reopened by the integrator when its head already holds the tip, once per head, and says so', async () => {
		const reopens: number[] = [];
		const fake = createFakeWorld();
		const n = fake.world.addPull(
			{ 'a/x.ts': '1' },
			{ author: LAND_WORKFLOW_TOKEN_ACTOR },
		);
		fake.world.ci();
		const run = () =>
			landPass({
				forge: {
					...fake.forge,
					reopenPullRequest: async (number, sha) => {
						const took = await fake.forge.reopenPullRequest(
							number,
							sha,
						);
						if (took) reopens.push(number);
						return took;
					},
				},
				git: fake.git,
				config: CONFIG,
				bringForward: async () => 'current',
			});
		const first = await run();
		expect(reopens).toEqual([n]);
		expect(first.reasons.get(n)).toContain('bring-forward reopened');
		expect(first.actions.join('\n')).toContain(
			`#${String(n)} reopened so its head is built`,
		);
		fake.world.ci();
		expect((await run()).mergedPRs).toEqual([n]);
		expect(reopens).toEqual([n]);
	});

	it('[<15ms] reopens a head once: the second pass asks its author and says it skipped', async () => {
		const fake = createFakeWorld();
		const n = fake.world.addPull(
			{ 'a/x.ts': '1' },
			{ author: LAND_WORKFLOW_TOKEN_ACTOR },
		);
		fake.world.ci();
		await fake.forge.reopenPullRequest(
			n,
			fake.world.pulls.get(n)?.headSha ?? '',
		);
		const report = await landPass({
			forge: fake.forge,
			git: fake.git,
			config: CONFIG,
			bringForward: async () => 'current',
		});
		expect(report.reasons.get(n)).toContain('bring-forward skipped');
		expect(fake.world.pulls.get(n)?.labels).toContain(
			LAND_LABEL_NEEDS_UPDATE,
		);
	});

	it('[<15ms] never brings a cross-repository head forward, nor batches it', async () => {
		const calls: number[] = [];
		const { world, pass, lone } = setup({
			bringForward: async (pr) => {
				calls.push(pr.number);
				return 'brought';
			},
		});
		const foreign = world.addPull(
			{ 'a/x.ts': '1' },
			{ author: LAND_WORKFLOW_TOKEN_ACTOR, crossRepository: true },
		);
		const mine = world.addPull({ 'a/z.ts': '1' });
		world.ci();
		const report = await pass();
		expect(calls).toEqual([]);
		expect(report.reasons.get(foreign)).toContain('cross-repository');
		expect(
			[...world.pulls.values()].filter((pr) => pr.batch !== undefined),
		).toHaveLength(0);
		expect(lone(mine).merged || lone(mine).state === 'open').toBe(true);
	});
});

describe('a derived-file conflict', () => {
	it('[<15ms] is left to the derived jobs, never regenerated in the pass', async () => {
		const asked: number[] = [];
		const { world, pass } = setup({
			resolveDerived: async (pr) => {
				asked.push(pr.number);
				return true;
			},
		});
		const n = world.addPull({ 'a/x.ts': '1', [FAKE_DERIVED]: 'gen:x' });
		world.push({ [FAKE_DERIVED]: 'gen:other' });
		world.ci();
		const report = await pass();
		expect(asked).toEqual([n]);
		expect(report.reasons.get(n)).toContain('derived jobs');
		expect(
			[...world.pulls.values()].filter((pr) => pr.batch !== undefined),
		).toHaveLength(0);
	});
});
