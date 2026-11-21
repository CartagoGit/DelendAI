/**
 * land-labels.spec.ts — verdicts are reconciled, never flipped: a pass
 * judges every pull request first, then applies the difference between
 * the labels wanted and present.
 */
import {
	LAND_LABEL_NEEDS_UPDATE,
	landConfigFromPolicy,
	landPass,
} from '@delendai/core/cli';
import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { describe, expect, it } from 'vitest';

import { createFakeWorld } from './land-fake';

const config = landConfigFromPolicy(
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

/** A fake forge that counts the label events the pass causes. */
const setup = () => {
	const fake = createFakeWorld({ 'a/y.ts': '0' });
	const events = { labeled: 0, unlabeled: 0 };
	const forge = {
		...fake.forge,
		addLabel: async (number: number, label: string) => {
			events.labeled += 1;
			await fake.forge.addLabel(number, label);
		},
		removeLabel: async (number: number, label: string) => {
			events.unlabeled += 1;
			await fake.forge.removeLabel(number, label);
		},
	};
	const pass = () => landPass({ forge, git: fake.git, config });
	return { ...fake, events, pass };
};

describe('land reconciles verdicts', () => {
	it('[<20ms] labels an authored conflict once and never flips it across passes', async () => {
		const { world, pass, events } = setup();
		const n = world.addPull({ 'a/y.ts': '9' });
		world.push({ 'a/y.ts': '5' });
		world.ci();
		for (let i = 0; i < 4; i += 1) await pass();
		expect(events).toEqual({ labeled: 1, unlabeled: 0 });
		const pr = world.pulls.get(n);
		expect(pr?.labels).toEqual([LAND_LABEL_NEEDS_UPDATE]);
		expect(pr?.comments).toHaveLength(1);
	});

	it('[<20ms] merges the head that cleared the verdict, with the label gone and no second one', async () => {
		const { world, pass, events } = setup();
		const n = world.addPull({ 'a/y.ts': '9' });
		world.push({ 'a/y.ts': '5' });
		world.ci();
		await pass();
		world.bringForward(n);
		world.ci();
		const report = await pass();
		expect(events.labeled).toBe(1);
		expect(world.pulls.get(n)?.labels).toEqual([]);
		expect(report.mergedPRs).toEqual([n]);
	});

	it('[<20ms] prints one reason for every open pull request, acted on or not', async () => {
		const { world, pass } = setup();
		const waiting = world.addPull({ 'a/x.ts': '1' });
		const conflicting = world.addPull({ 'a/y.ts': '9' });
		world.push({ 'a/y.ts': '5' });
		const report = await pass();
		expect([...report.reasons.keys()].sort()).toEqual(
			[waiting, conflicting].sort(),
		);
		for (const reason of report.reasons.values())
			expect(reason).not.toBe('');
	});
});
