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

import {
	expectedLandWorkflow,
	LAND_WORKFLOW_PATH,
	REPO_LAND_WORKFLOW,
} from './land-workflow.script';

import { FAKE_DERIVED, createFakeWorld } from './land-fake';
import { LAND_WORKFLOW_TOKEN_ACTOR } from '@delendai/core/cli';

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
/** A land whose actor pushes commits the forge builds: it may batch. */
const REPO_CONFIG = landConfigFromPolicy(REPO_POLICY, {
	sectionOfCheck: (name) =>
		name.startsWith('tests: ') ? name.slice(7) : undefined,
	batches: true,
});
/** A land run with a workflow token: it pushes nothing, and batches nothing. */
const TOKEN_CONFIG = { ...REPO_CONFIG, batches: false };
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
	it('[<15ms] merges a lone pull request with no overlap, pinned to its head', async () => {
		const { world, pass, lone } = setup();
		const n = world.addPull({ 'a/x.ts': '1' });
		world.ci();
		await pass();
		expect(world.mergeCalls).toEqual([{ number: n, sha: lone(n).headSha }]);
		expect(lone(n).merged).toBe(true);
		expect(world.tree()['a/x.ts']).toBe('1');
	});

	it('[<8ms] reports what merged as typed fields, and "not merged" as nothing', async () => {
		const { world, pass, lone } = setup();
		const n = world.addPull({ 'a/x.ts': '1' });
		world.ci();
		world.beforeMerge = () => {
			lone(n).headSha = 'moved-head';
			world.beforeMerge = undefined;
		};
		const refused = await pass();
		expect(refused.actions.join('\n')).toContain('not merged');
		expect(refused.mergedCount).toBe(0);
		expect(refused.mergedPRs).toEqual([]);
		world.ci();
		const merged = await pass();
		expect(merged.mergedCount).toBe(1);
		expect(merged.mergedPRs).toEqual([n]);
		expect(merged.tipSha).toBe(world.tip);
	});

	it('[<8ms] lands nothing with no required check unless the policy opts in', async () => {
		const bare = { ...REPO_CONFIG, requiredChecks: [] };
		const { world, pass } = setup({}, {}, bare);
		world.requiredNames = [];
		world.addPull({ 'a/x.ts': '1' });
		world.ci();
		expect((await pass()).mergedCount).toBe(0);
		const opted = setup({}, {}, { ...bare, withoutChecks: true });
		opted.world.requiredNames = [];
		opted.world.addPull({ 'a/x.ts': '1' });
		opted.world.ci();
		expect((await opted.pass()).mergedCount).toBe(1);
	});

	it('[<8ms] waits for the required checks and skips drafts', async () => {
		const { world, pass } = setup();
		world.addPull({ 'a/x.ts': '1' });
		world.addPull({ 'b/y.ts': '1' }, { draft: true });
		await pass();
		world.ci();
		await pass();
		expect(world.mergeCalls).toHaveLength(1);
	});

	it('[<7ms] refuses a head that moves mid-pass and retries it next pass', async () => {
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

	it('[<195ms] batches two overlapping pull requests and verifies the landed tree', async () => {
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

	it('[<24ms] merges nothing more when the tree would differ from the tested one', async () => {
		const { world, pass, open, lone } = setup();
		world.addPull({ 'a/one.ts': '1' });
		const two = world.addPull({ 'a/two.ts': '2' });
		world.ci();
		await pass();
		world.ci();
		// The first member merges, the second is refused once ...
		world.beforeMerge = (n) => {
			if (n === two) {
				lone(two).state = 'closed';
				world.beforeMerge = undefined;
			}
		};
		await pass();
		lone(two).state = 'open';
		// ... and the branch gains a commit the batch never tested.
		world.push({ 'b/other.ts': 'x' });
		const calls = world.mergeCalls.length;
		const report = await pass();
		expect(world.mergeCalls).toHaveLength(calls);
		expect(report.mergedCount).toBe(0);
		expect(report.actions.join('\n')).toContain(
			'the tree would differ from the tested one',
		);
		expect(open()).toHaveLength(0);
	});

	it('[<9ms] labels the culprit of a red batch and batches the rest once', async () => {
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

	it('[<7ms] sends only the suspects alone when nobody owns the failure, and never repeats the set', async () => {
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

	it('[<6ms] lets groups with no overlap proceed in the same pass', async () => {
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

	it('[<7ms] regenerates a derived conflict and labels an authored one', async () => {
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

	it('[<9ms] recovers on the next pass from a pass that died midway', async () => {
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
	const config = landConfigFromPolicy(policy, {
		batchCapacity: 2,
		batches: true,
	});
	const other = () =>
		setup({}, { sectionOf: () => 'all', derived: undefined }, config);

	it('[<7ms] reads branch, namespace, merge method and checks from the policy', () => {
		expect(config).toMatchObject({
			integrationBranch: 'trunk',
			batchPrefix: 'queue/',
			mergeMethod: 'squash',
			requiredChecks: ['ci'],
			batchCapacity: 2,
		});
	});

	it('[<6ms] merges a lone pull request and batches an overlapping pair under its own prefix', async () => {
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

	it('[<6ms] caps the batch at the project capacity and finds no owner without sections', async () => {
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

describe('land run with a workflow token', () => {
	it('[<15ms] never updates a branch through the forge: it labels the author and merges once updated', async () => {
		const { world, pass, lone, batches } = setup({}, {}, TOKEN_CONFIG);
		const n = world.addPull({ 'a/x.ts': '1' });
		world.ci();
		world.push({ 'a/x.ts': '0' });
		const first = await pass();
		expect(world.mergeCalls).toEqual([]);
		expect(lone(n).labels).toContain(LAND_LABEL_NEEDS_UPDATE);
		expect(lone(n).headAuthor).not.toBe(LAND_WORKFLOW_TOKEN_ACTOR);
		expect(first.reasons.get(n)).toMatch(/^needs update: /u);
		expect(batches()).toEqual([]);
		world.bringForward(n);
		world.ci();
		expect((await pass()).mergedPRs).toEqual([n]);
	});

	it('[<15ms] never counts a head the workflow token pushed as ready, and asks for its author', async () => {
		const { world, pass, lone } = setup({}, {}, TOKEN_CONFIG);
		const n = world.addPull(
			{ 'a/x.ts': '1' },
			{ author: LAND_WORKFLOW_TOKEN_ACTOR },
		);
		world.ci();
		const report = await pass();
		expect(world.mergeCalls).toEqual([]);
		expect(report.reasons.get(n)).toContain('whose pushes start no CI');
		expect(lone(n).labels).toContain(LAND_LABEL_NEEDS_UPDATE);
		world.bringForward(n);
		world.ci();
		expect((await pass()).mergedCount).toBe(1);
	});

	it('[<15ms] lands overlapping pull requests one at a time, and says why each waits', async () => {
		const { world, pass, batches } = setup({}, {}, TOKEN_CONFIG);
		const one = world.addPull({ 'a/one.ts': '1' });
		const two = world.addPull({ 'a/two.ts': '2' });
		const draft = world.addPull({ 'b/z.ts': '1' }, { draft: true });
		world.ci();
		const report = await pass();
		expect(report.mergedPRs).toEqual([one]);
		expect(report.reasons.get(two)).toBe(
			`waits for #${String(one)}, which it overlaps`,
		);
		expect(report.reasons.get(draft)).toBe('a draft');
		expect(batches()).toEqual([]);
	});
});

describe('the land workflow template', () => {
	it("[<32ms] renders this repository's committed instance", () => {
		expect(renderLandWorkflow(REPO_LAND_WORKFLOW)).toBe(
			readFileSync(LAND_WORKFLOW_PATH, 'utf8'),
		);
	});

	it("[<5ms] renders another project's branches, phases and upkeep", () => {
		const text = renderLandWorkflow({
			...REPO_LAND_WORKFLOW,
			integrationBranch: 'trunk',
			releaseBranch: 'stable',
			passCommand: 'npx tool land',
			promotionCommand: 'npx tool promote',
			upkeep: [{ name: 'Tidy', run: 'npx tool tidy' }],
		});
		expect(text).toContain('branches: [trunk, stable]');
		expect(text).toContain(
			"github.event.workflow_run.head_branch == 'trunk'",
		);
		expect(text).toContain("github.ref_name == 'stable'");
		expect(text).toContain('run: npx tool promote');
		expect(text).toContain('run: npx tool tidy');
		expect(text).not.toMatch(/\bdevelop\b/u);
		expect(text).not.toContain('vars.');
	});

	it('[<5ms] leaves out the phases a project does not declare', () => {
		const {
			promotionCommand: _promotion,
			forwardSyncCommand: _forwardSync,
			...bare
		} = REPO_LAND_WORKFLOW;
		const text = renderLandWorkflow({ ...bare, upkeep: [] });
		expect(text).toContain('    land:');
		expect(text).not.toContain('    promote:');
		expect(text).not.toContain('    forward-sync:');
		expect(text).not.toContain('    upkeep:');
	});

	it('[<5ms] exists only while the policy names land the engine', () => {
		const engine = (value: string) => ({
			development: { integration: { engine: value } },
		});
		expect(expectedLandWorkflow(engine('land'))).toBe(
			renderLandWorkflow(REPO_LAND_WORKFLOW),
		);
		expect(expectedLandWorkflow(engine('none'))).toBeUndefined();
		expect(expectedLandWorkflow({})).toBeUndefined();
	});
});
