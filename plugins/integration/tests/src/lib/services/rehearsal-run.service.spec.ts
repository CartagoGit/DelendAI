import { describe, expect, it } from 'vitest';

import type {
	IRehearsalClock,
	IRehearsalForge,
	IRehearsalPullState,
	IRehearsalRun,
	IRehearsalScenario,
} from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import { runScenario } from '../../../../src/lib/services/rehearsal-run.service';
import { pullChanges } from '../../../../src/lib/services/rehearsal-names.helper';

interface IMutablePull
	extends Omit<
		IRehearsalPullState,
		'labels' | 'draft' | 'headSha' | 'state'
	> {
	headSha: string;
	state: 'open' | 'closed';
	labels: string[];
	draft: boolean;
	mergedAt?: string;
}

/** An in-memory forge whose "integrator" merges a pull request the moment it is marked ready. */
const memoryForge = () => {
	let counter = 0;
	const sha = (): string => {
		counter += 1;
		return `sha${String(counter)}`;
	};
	const branches = new Map<string, string>([['base', 'sha0']]);
	const pulls: IMutablePull[] = [];
	const commits: {
		branch: string;
		parents: readonly string[];
		paths: string[];
	}[] = [];
	const labelNames = new Set<string>();
	const runs: IRehearsalRun[] = [];
	const clock = { at: Date.parse('2026-11-12T10:00:00Z') };
	const iso = (): string => new Date(clock.at).toISOString();
	const add = (head: string, base: string, draft: boolean): number => {
		const number = pulls.length + 1;
		pulls.push({
			number,
			head,
			headSha: branches.get(head) ?? sha(),
			base,
			state: 'open',
			draft,
			createdAt: iso(),
			labels: [],
			author: 'harness',
		});
		return number;
	};
	const pull = (n: number): IMutablePull => {
		const found = pulls.find((p) => p.number === n);
		if (found === undefined) throw new Error(`no pull ${String(n)}`);
		return found;
	};
	const forge: IRehearsalForge = {
		tipOf: async (b) => branches.get(b) ?? 'sha0',
		createBranch: async (name, from) => void branches.set(name, from),
		deleteBranch: async (name) => void branches.delete(name),
		listBranches: async (prefix) =>
			[...branches.keys()].filter((b) => b.startsWith(prefix)),
		commit: async (input) => {
			const made = sha();
			commits.push({
				branch: input.branch,
				parents: input.parents,
				paths: input.changes.map((c) => c.path),
			});
			branches.set(input.branch, made);
			for (const p of pulls)
				if (p.head === input.branch) p.headSha = made;
			return made;
		},
		listFiles: async () => [],
		readFile: async () => '',
		history: async (b, until) => [branches.get(b) ?? '', until],
		openPull: async (input) => add(input.head, input.base, input.draft),
		setDraft: async (n, draft) => {
			const p = pull(n);
			p.draft = draft;
			if (!draft && p.mergedAt === undefined) p.mergedAt = iso();
		},
		mergePull: async (n) => {
			pull(n).mergedAt = iso();
		},
		closePull: async (n) => {
			pull(n).state = 'closed';
		},
		addLabel: async (n, label) => {
			labelNames.add(label);
			pull(n).labels.push(label);
			if (label.endsWith('token-push')) {
				const made = sha();
				branches.set(pull(n).head, made);
				pull(n).headSha = made;
			}
			if (label.endsWith('token-open')) {
				const base = pull(n).base;
				const head = `${base.slice(0, base.lastIndexOf('/') + 1)}token-open-${String(n)}`;
				branches.set(head, sha());
				add(head, pull(n).base, false);
			}
		},
		pulls: async (base) =>
			pulls
				.filter((p) => p.base === base)
				.map((p) => ({ ...p, labels: [...p.labels] })),
		pullEvents: async () => [],
		runs: async () => runs,
		runLog: async () => '',
		labels: async (prefix) =>
			[...labelNames].filter((l) => l.startsWith(prefix)),
		deleteLabel: async (name) => void labelNames.delete(name),
		hooks: async () => [],
		deleteHook: async () => undefined,
	};
	const fakeClock: IRehearsalClock = {
		now: () => clock.at,
		wait: async (ms) => {
			clock.at += ms;
		},
	};
	return { forge, clock: fakeClock, pulls, commits, branches, runs };
};

const ctxOf = (forge: IRehearsalForge, clock: IRehearsalClock) => ({
	forge,
	clock,
	setup: { files: () => [{ path: 'x', content: 'y' }] },
	runId: 'r20261112-100000',
	tip: 'sha0',
	branchPrefix: 'ns/rehearsal/',
	log: () => undefined,
});

const declaration = { result: 'success', seconds: 1, sections: ['a'] } as const;
const scenario = (over: Partial<IRehearsalScenario>): IRehearsalScenario => ({
	id: 's',
	title: 'S',
	pulls: [
		{ key: 'a', declaration, files: { 'rehearsal/a.txt': 'a' } },
		{
			key: 'b',
			declaration,
			files: { 'rehearsal/b.txt': 'b' },
			draft: true,
		},
	],
	steps: [],
	expect: [],
	...over,
});

describe('runScenario', () => {
	it('[<100ms] reads the runs again until the merged tip has its push run', async () => {
		const { forge, clock } = memoryForge();
		let reads = 0;
		const push = (headSha: string): IRehearsalRun => ({
			id: 1,
			workflow: 'rehearsal-scan',
			event: 'push',
			headBranch: 'ns/rehearsal/r/s-integration',
			headSha,
			status: 'completed',
			conclusion: 'success',
			actor: 'bot',
			createdAt: '2026-11-12T10:00:00Z',
			updatedAt: '2026-11-12T10:00:00Z',
		});
		const evidence = await runScenario(
			ctxOf(
				{
					...forge,
					history: async () => ['tip2', 'tip1'],
					runs: async () => {
						reads += 1;
						return reads < 3 ? [] : [push('tip2')];
					},
				},
				clock,
			),
			scenario({ steps: [] }),
		);
		expect(reads).toBe(3);
		expect(evidence.runs.map((run) => run.headSha)).toEqual(['tip2']);
	});

	it('[<100ms] stops reading at the deadline when a tip never gets its push run', async () => {
		const { forge, clock } = memoryForge();
		let reads = 0;
		const evidence = await runScenario(
			ctxOf(
				{
					...forge,
					history: async () => ['tip2', 'tip1'],
					runs: async () => {
						reads += 1;
						return [];
					},
				},
				clock,
			),
			scenario({ steps: [] }),
		);
		expect(reads).toBe(8);
		expect(evidence.runs).toEqual([]);
	});

	it('[<100ms] opens pull requests, readies one, and reads back its merge', async () => {
		const { forge, clock } = memoryForge();
		const evidence = await runScenario(
			ctxOf(forge, clock),
			scenario({
				steps: [
					{ kind: 'open', keys: ['a', 'b'] },
					{ kind: 'ready', keys: ['a'] },
					{
						kind: 'await',
						until: 'merged',
						keys: ['a'],
						seconds: 60,
					},
				],
			}),
		);
		expect(evidence.failures).toEqual([]);
		expect(evidence.pulls.a?.mergedAt).toBeDefined();
		expect(evidence.pulls.b?.mergedAt).toBeUndefined();
		expect(evidence.manualSteps).toEqual([]);
	});

	it('[<100ms] counts a wake as a manual step when the integrator does not act', async () => {
		const { forge, clock, pulls } = memoryForge();
		const stubborn: IRehearsalForge = {
			...forge,
			setDraft: async (n, draft) => {
				const p = pulls.find((one) => one.number === n);
				if (p !== undefined) p.draft = draft;
			},
		};
		const evidence = await runScenario(
			ctxOf(stubborn, clock),
			scenario({
				steps: [
					{ kind: 'open', keys: ['a'] },
					{
						kind: 'await',
						until: 'merged',
						keys: ['a'],
						seconds: 120,
						wakeAfterSeconds: 30,
					},
				],
			}),
		);
		expect(evidence.manualSteps.length).toBeGreaterThan(0);
		expect(evidence.failures[0]).toContain('merged not reached');
	});

	it('[<100ms] waits for a label, a check and a changed head', async () => {
		const { forge, clock, pulls, runs } = memoryForge();
		const evidence = await runScenario(
			ctxOf(forge, clock),
			scenario({
				steps: [
					{ kind: 'open', keys: ['a'] },
					{
						kind: 'await',
						until: 'labelled',
						keys: ['a'],
						seconds: 30,
					},
					{
						kind: 'await',
						until: 'checked',
						keys: ['a'],
						seconds: 30,
					},
					{ kind: 'token-push', key: 'a' },
				],
			}),
		);
		expect(pulls).toHaveLength(1);
		expect(runs).toEqual([]);
		expect(
			evidence.failures.some((f) => f.includes('labelled not reached')),
		).toBe(true);
		expect(
			evidence.failures.some((f) => f.includes('checked not reached')),
		).toBe(true);
		expect(evidence.tokenHeads.a).toHaveLength(1);
	});

	it('[<100ms] records the head a workflow token wrote and the pull request it opened', async () => {
		const { forge, clock } = memoryForge();
		const evidence = await runScenario(
			ctxOf(forge, clock),
			scenario({
				steps: [
					{ kind: 'open', keys: ['a'] },
					{ kind: 'token-open', key: 'a' },
					{
						kind: 'author-update',
						key: 'a',
						files: { 'rehearsal/a.txt': 'again' },
					},
					{ kind: 'move-integration', key: 'a' },
				],
			}),
		);
		expect(evidence.failures).toEqual([]);
		expect(evidence.tokenPulls.a).toBeDefined();
		expect(evidence.failures).toEqual([]);
		expect(evidence.tips.length).toBeGreaterThan(0);
	});

	it('[<100ms] reports a step on a pull request that is not open', async () => {
		const { forge, clock } = memoryForge();
		const evidence = await runScenario(
			ctxOf(forge, clock),
			scenario({
				steps: [
					{ kind: 'token-push', key: 'a' },
					{ kind: 'author-update', key: 'a', files: {} },
					{ kind: 'ready', keys: ['a'] },
					{ kind: 'token-open', key: 'a' },
				],
			}),
		);
		expect(evidence.failures.join(';')).toContain(
			'token-push: a is not open',
		);
		expect(evidence.failures.join(';')).toContain(
			'author-update: a is not open',
		);
	});

	it('[<100ms] stops with the reason when a step names a pull request the scenario lacks', async () => {
		const { forge, clock } = memoryForge();
		const evidence = await runScenario(
			ctxOf(forge, clock),
			scenario({ steps: [{ kind: 'open', keys: ['zzz'] }] }),
		);
		expect(evidence.failures[0]).toContain(
			'stopped: scenario s has no pull zzz',
		);
	});

	it('[<100ms] refuses a synthetic pull request that writes outside rehearsal/', () => {
		expect(() =>
			pullChanges('r', 's', {
				key: 'a',
				declaration,
				files: { 'src/x.ts': '' },
			}),
		).toThrow('writes only under rehearsal/');
	});
});
