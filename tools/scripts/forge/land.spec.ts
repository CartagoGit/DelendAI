/**
 * land.spec.ts — one pass of `land` against a forge in memory: a lone pull
 * request, a head that moves, a batch green and red, groups apart, derived
 * and authored conflicts, and a pass that dies midway.
 */
import {
	LAND_LABEL_CULPRIT,
	LAND_LABEL_NEEDS_UPDATE,
	landConfigFromPolicy,
	landPass,
	readBatchRecord,
	renderLandWorkflow,
} from '@delendai/core/cli';
import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { LAND_WORKFLOW_PATH, REPO_LAND_WORKFLOW } from './land-workflow.script';

import { FAKE_DERIVED, createFakeWorld } from './land-fake';

const REPO_POLICY = resolveDevelopmentPolicy({
	development: {
		branches: {
			integration: 'develop',
			release: 'main',
			namespacePrefix: 'delendai',
		},
		integration: { requiredChecks: ['tests: a'] },
	},
});
const REPO_CONFIG = landConfigFromPolicy(REPO_POLICY, {
	sectionOfCheck: (name) =>
		name.startsWith('tests: ') ? name.slice(7) : undefined,
});
const PREFIX = REPO_CONFIG.batchPrefix;

const setup = (
	initial: Record<string, string> = {},
	options: Parameters<typeof createFakeWorld>[1] = {},
	config = REPO_CONFIG,
) => {
	const fake = createFakeWorld(initial, options);
	const pass = () => landPass({ forge: fake.forge, git: fake.git, config });
	const batches = () =>
		[...fake.world.pulls.values()].filter((pr) => pr.batch !== undefined);
	const open = () => batches().filter((pr) => pr.state === 'open');
	const lone = (n: number) => {
		const pr = fake.world.pulls.get(n);
		if (pr === undefined) throw new Error(`no #${String(n)}`);
		return pr;
	};
	return { ...fake, pass, batches, open, lone };
};

describe('land', () => {
	it('[<200ms] merges a lone pull request with no overlap, pinned to its head', async () => {
		const { world, pass, lone } = setup();
		const n = world.addPull({ 'a/x.ts': '1' });
		world.ci();
		await pass();
		expect(world.mergeCalls).toEqual([{ number: n, sha: lone(n).headSha }]);
		expect(lone(n).merged).toBe(true);
		expect(world.tree()['a/x.ts']).toBe('1');
	});

	it('[<200ms] waits for the required checks and skips drafts', async () => {
		const { world, pass } = setup();
		world.addPull({ 'a/x.ts': '1' });
		world.addPull({ 'b/y.ts': '1' }, { draft: true });
		await pass();
		world.ci();
		await pass();
		expect(world.mergeCalls).toHaveLength(1);
	});

	it('[<200ms] refuses a head that moves mid-pass and retries it next pass', async () => {
		const { world, pass, lone } = setup();
		const n = world.addPull({ 'a/x.ts': '1' });
		world.ci();
		world.beforeMerge = () => {
			lone(n).headSha = 'moved-head';
			world.beforeMerge = undefined;
		};
		const first = await pass();
		expect(lone(n).merged).toBe(false);
		expect(first.actions.join('\n')).toContain('head-moved');
		await pass();
		expect(lone(n).merged).toBe(false);
		world.ci();
		await pass();
		expect(world.mergeCalls.at(-1)).toEqual({
			number: n,
			sha: 'moved-head',
		});
		expect(lone(n).merged).toBe(true);
	});

	it('[<200ms] batches two overlapping pull requests and verifies the landed tree', async () => {
		const { world, pass, open, batches, lone, git, forge } = setup();
		const one = world.addPull({ 'a/one.ts': '1' });
		const two = world.addPull({ 'a/two.ts': '2' });
		world.ci();
		await pass();
		expect(world.mergeCalls).toEqual([]);
		const [batch] = open();
		expect(batch?.headRef).toBe(
			`${PREFIX}batch-${String(one)}+${String(two)}`,
		);
		expect(
			readBatchRecord(batch?.body ?? '')?.members.map((m) => m.number),
		).toEqual([one, two]);
		world.ci();
		await pass();
		expect(world.mergeCalls).toEqual([
			{ number: one, sha: lone(one).headSha },
			{ number: two, sha: lone(two).headSha },
		]);
		expect(open()).toHaveLength(0);
		expect(batches()).toHaveLength(1);
		expect(git.treeOf(await forge.integrationTip())).toBe(
			git.treeOf(batch?.headSha ?? ''),
		);
	});

	it('[<200ms] labels the culprit of a red batch and batches the rest once', async () => {
		const { world, pass, open, batches, lone } = setup();
		world.requiredNames = ['tests: a', 'tests: b', 'tests: c'];
		const one = world.addPull({ 'a/1.ts': '1', 'b/s.ts': '1' });
		const two = world.addPull({ 'b/2.ts': '2', 'c/2.ts': '2' });
		const three = world.addPull({ 'a/3.ts': '3' });
		world.failBatch = (members) =>
			members.includes(two) ? ['tests: c'] : [];
		world.ci();
		await pass();
		world.ci();
		await pass();
		expect(lone(two).labels).toContain(LAND_LABEL_CULPRIT);
		expect(lone(two).comments.join('\n')).toMatch(/tests: c.*runs\//u);
		const [rebuilt] = open();
		expect(
			readBatchRecord(rebuilt?.body ?? '')?.members.map((m) => m.number),
		).toEqual([one, three]);
		world.ci();
		await pass();
		expect(lone(one).merged && lone(three).merged).toBe(true);
		expect(lone(two).merged).toBe(false);
		// The red set was tried once on that tip, never again.
		const sets = batches().map((b) => b.headRef);
		expect(
			sets.filter((ref) =>
				ref.endsWith(`${String(one)}+${String(two)}+${String(three)}`),
			),
		).toHaveLength(1);
	});

	it('[<200ms] sends only the suspects alone when nobody owns the failure, and never repeats the set', async () => {
		const { world, pass, open, batches, lone } = setup();
		const one = world.addPull({ 'a/1.ts': '1' });
		const two = world.addPull({ 'a/2.ts': '2' });
		world.failBatch = (members) => (members.length > 1 ? ['tests: a'] : []);
		world.ci();
		await pass();
		world.ci();
		await pass();
		await pass();
		await pass();
		const refs = batches().map((b) => b.headRef);
		expect(
			refs.filter((r) => r.endsWith(`${String(one)}+${String(two)}`)),
		).toHaveLength(1);
		expect(open().map((b) => b.headRef)).toEqual([
			`${PREFIX}batch-${String(one)}`,
		]);
		world.ci();
		await pass();
		expect(lone(one).merged).toBe(true);
	});

	it('[<200ms] lets groups with no overlap proceed in the same pass', async () => {
		const { world, pass, open, lone } = setup();
		world.addPull({ 'a/1.ts': '1' });
		world.addPull({ 'a/2.ts': '2' });
		world.addPull({ 'x/1.ts': '1' });
		world.addPull({ 'x/2.ts': '2' });
		const solo = world.addPull({ 'q/1.ts': '1' });
		world.ci();
		await pass();
		expect(
			open()
				.map((b) => b.headRef)
				.sort(),
		).toEqual([`${PREFIX}batch-1+2`, `${PREFIX}batch-3+4`]);
		expect(lone(solo).merged).toBe(true);
	});

	it('[<200ms] regenerates a derived conflict and labels an authored one', async () => {
		const { world, pass, open, lone, git, forge } = setup({
			'a/y.ts': '0',
		});
		const derived = world.addPull({
			'a/x.ts': '1',
			[FAKE_DERIVED]: 'gen:x',
		});
		const authored = world.addPull({ 'a/y.ts': '9' });
		world.push({ [FAKE_DERIVED]: 'gen:other', 'a/y.ts': '5' });
		world.ci();
		await pass();
		expect(lone(authored).labels).toContain(LAND_LABEL_NEEDS_UPDATE);
		await pass();
		expect(lone(authored).comments).toHaveLength(1);
		const [batch] = open();
		expect(readBatchRecord(batch?.body ?? '')?.regenerated).toBe(true);
		world.ci();
		await pass();
		expect(lone(derived).merged).toBe(true);
		expect(world.tree()[FAKE_DERIVED]).toMatch(/^gen:/u);
		expect(git.treeOf(await forge.integrationTip())).toBe(
			git.treeOf(batch?.headSha ?? ''),
		);
	});

	it('[<200ms] recovers on the next pass from a pass that died midway', async () => {
		const { world, pass, lone, open } = setup();
		const ns = [
			world.addPull({ 'a/1.ts': '1' }),
			world.addPull({ 'a/2.ts': '2' }),
			world.addPull({ 'a/3.ts': '3' }),
		];
		world.ci();
		await pass();
		world.ci();
		world.crashOnMutation(2);
		await expect(pass()).rejects.toThrow('crash');
		expect(ns.filter((n) => lone(n).merged)).toHaveLength(1);
		world.crashOnMutation(Number.POSITIVE_INFINITY);
		await pass();
		expect(ns.every((n) => lone(n).merged)).toBe(true);
		expect(open()).toHaveLength(0);
	});
});

describe('land in a project that is not this one', () => {
	// A different branch, no namespace, no regeneration, one section for
	// every path and checks that name no section.
	const policy = resolveDevelopmentPolicy({
		development: {
			branches: {
				integration: 'trunk',
				release: 'trunk',
				namespacePrefix: '',
			},
			integration: { requiredChecks: ['ci'], mergeMethod: 'squash' },
		},
	});
	const config = landConfigFromPolicy(policy, { batchCapacity: 2 });
	const other = () =>
		setup({}, { sectionOf: () => 'all', derived: undefined }, config);

	it('[<200ms] reads branch, namespace, merge method and checks from the policy', () => {
		expect(config).toMatchObject({
			integrationBranch: 'trunk',
			batchPrefix: 'queue/',
			mergeMethod: 'squash',
			requiredChecks: ['ci'],
			batchCapacity: 2,
		});
	});

	it('[<200ms] merges a lone pull request and batches an overlapping pair under its own prefix', async () => {
		const { world, pass, open, lone } = other();
		world.requiredNames = ['ci'];
		const solo = world.addPull({ 'x.ts': '1' });
		world.ci();
		await pass();
		expect(lone(solo).merged).toBe(true);
		const a = world.addPull({ 'y.ts': '1' });
		const b = world.addPull({ 'z.ts': '1' });
		world.ci();
		await pass();
		expect(open().map((p) => p.headRef)).toEqual([
			`queue/batch-${String(a)}+${String(b)}`,
		]);
		world.ci();
		await pass();
		expect(lone(a).merged && lone(b).merged).toBe(true);
	});

	it('[<200ms] caps the batch at the project capacity and finds no owner without sections', async () => {
		const { world, pass, open, batches, lone } = other();
		world.requiredNames = ['ci'];
		const ids = [1, 2, 3].map((n) =>
			world.addPull({ [`f${String(n)}.ts`]: '1' }),
		);
		world.failBatch = (members) => (members.length > 1 ? ['ci'] : []);
		world.ci();
		await pass();
		expect(open()[0]?.headRef).toBe('queue/batch-1+2');
		world.ci();
		await pass();
		const record = readBatchRecord(batches()[0]?.body ?? '');
		expect(record?.red?.culprit).toBeUndefined();
		expect(record?.red?.suspects).toEqual([1, 2]);
		expect(
			ids.every((n) => !lone(n).labels.includes(LAND_LABEL_CULPRIT)),
		).toBe(true);
	});
});

describe('the land workflow template', () => {
	it("[<200ms] renders this repository's committed instance", () => {
		expect(renderLandWorkflow(REPO_LAND_WORKFLOW)).toBe(
			readFileSync(LAND_WORKFLOW_PATH, 'utf8'),
		);
	});

	it("[<200ms] renders another project's branch, switch and follow-up", () => {
		const text = renderLandWorkflow({
			...REPO_LAND_WORKFLOW,
			integrationBranch: 'trunk',
			engineVariable: 'MY_ENGINE',
			afterMergeWorkflows: ['build.yml'],
			passCommand: 'npx tool land',
		});
		expect(text).toContain('branches: [trunk]');
		expect(text).toContain("vars.MY_ENGINE == 'land'");
		expect(text).toContain(
			'gh workflow run build.yml --repo "$GITHUB_REPOSITORY" --ref trunk',
		);
		expect(text).not.toContain('develop');
	});
});
