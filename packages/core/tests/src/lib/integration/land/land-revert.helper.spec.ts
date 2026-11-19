import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import {
	judgeRepair,
	openRepair,
	readRepairRecord,
	repairBody,
	repairsFirst,
} from '@delendai/core/lib/integration/land/land-revert.helper';
import type {
	ILandCheck,
	ILandForge,
	ILandPullRequest,
} from '@delendai/core/lib/integration/land/land.interface';
import type { ILandRevertBuild } from '@delendai/core/lib/integration/land/land-revert.interface';

const pr = (
	number: number,
	over: Partial<ILandPullRequest> = {},
): ILandPullRequest => ({
	number,
	headRef: `h${String(number)}`,
	headSha: `s${String(number)}`,
	draft: false,
	state: 'open',
	merged: false,
	labels: [],
	body: '',
	testedBase: 't',
	...over,
});

const fakeForge = (original: ILandPullRequest) => {
	const opened: { head: string; title: string; body: string }[] = [];
	const labels = new Map<number, string[]>();
	const comments = new Map<number, string[]>();
	let next = 900;
	const forge = fakePartial<ILandForge>({
		openPullRequests: () =>
			Promise.resolve(
				opened.map((o, i) => pr(900 + i, { headRef: o.head })),
			),
		pullRequest: () => Promise.resolve(original),
		openPullRequest: (input: {
			head: string;
			title: string;
			body: string;
		}) => {
			opened.push(input);
			return Promise.resolve(next++);
		},
		addLabel: (n: number, l: string) => {
			labels.set(n, [...(labels.get(n) ?? []), l]);
			return Promise.resolve();
		},
		comments: (n: number) => Promise.resolve(comments.get(n) ?? []),
		comment: (n: number, t: string) => {
			comments.set(n, [...(comments.get(n) ?? []), t]);
			return Promise.resolve();
		},
	});
	return { forge, opened, labels, comments };
};

const input = (
	forge: ILandForge,
	build: ILandRevertBuild,
	pushed: string[] = [],
) => ({
	forge,
	git: {
		revertMerge: ({ ref }: { ref: string }) => {
			if (build.kind === 'built') pushed.push(ref);
			return build;
		},
	},
	tip: 'tip',
	repairPrefix: 'p/repair/',
	merge: { number: 7, sha: 'm7' },
	failing: ['a.spec.ts'],
	known: ['a.spec.ts', 'old.spec.ts'],
	note: () => undefined,
});

const check = (
	conclusion: string | null,
	failingSpecs?: string[],
): ILandCheck => ({ name: 'ci', conclusion, failingSpecs });

describe('openRepair', () => {
	it('[<50ms] opens one labelled revert and re-opens the original work with the failing specs', async () => {
		const { forge, opened, labels, comments } = fakeForge(pr(7));
		const out = await openRepair(input(forge, { kind: 'built', sha: 'r' }));
		expect(out).toEqual({ kind: 'opened', number: 900 });
		expect(opened).toHaveLength(1);
		expect(opened[0]?.head).toBe('p/repair/revert-7');
		expect(labels.get(900)).toEqual(['delendai:repair']);
		expect(labels.get(7)).toEqual(['delendai:needs-update']);
		expect(comments.get(7)?.[0]).toContain('a.spec.ts');
	});

	it('[<50ms] a pass run twice opens no second revert', async () => {
		const { forge, opened } = fakeForge(pr(7));
		const pushed: string[] = [];
		const built = { kind: 'built', sha: 'r' } as const;
		await openRepair(input(forge, built, pushed));
		const again = await openRepair(input(forge, built, pushed));
		expect(again).toEqual({ kind: 'exists', number: 900 });
		expect(opened).toHaveLength(1);
		expect(pushed).toHaveLength(1);
	});

	it('[<50ms] a conflicting revert needs a person and pushes nothing', async () => {
		const { forge, opened, comments } = fakeForge(pr(7));
		const pushed: string[] = [];
		const out = await openRepair(
			input(forge, { kind: 'conflict' }, pushed),
		);
		expect(out.kind).toBe('needs-person');
		expect(opened).toHaveLength(0);
		expect(pushed).toHaveLength(0);
		expect(comments.get(7)?.[0]).toContain('person');
	});
});

describe('judgeRepair', () => {
	const record = {
		culprit: 7,
		failing: ['a.spec.ts'],
		known: ['old.spec.ts'],
	};

	it('[<50ms] waits while a check runs', () => {
		expect(judgeRepair(record, [check(null)])).toEqual({ kind: 'wait' });
	});

	it('[<50ms] merges when the culprit failures are green and none is added, known ones aside', () => {
		expect(
			judgeRepair(record, [check('failure', ['old.spec.ts'])]),
		).toEqual({ kind: 'merge' });
		expect(judgeRepair(record, [check('success')])).toEqual({
			kind: 'merge',
		});
	});

	it('[<50ms] rejects when a culprit failure stays red or a new one appears', () => {
		expect(
			judgeRepair(record, [check('failure', ['a.spec.ts'])]).kind,
		).toBe('reject');
		expect(
			judgeRepair(record, [check('failure', ['new.spec.ts'])]).kind,
		).toBe('reject');
	});
});

describe('repair records and order', () => {
	it('[<50ms] round-trips the record through the body', () => {
		const record = { culprit: 3, failing: ['x'], known: [] };
		expect(readRepairRecord(repairBody(record))).toEqual(record);
		expect(readRepairRecord('nothing')).toBeUndefined();
	});

	it('[<50ms] admits a repair ahead of lower-numbered candidates', () => {
		const out = repairsFirst([
			{ pr: pr(1) },
			{ pr: pr(9, { labels: ['delendai:repair'] }) },
		]);
		expect(out.map((c) => c.pr.number)).toEqual([9, 1]);
	});
});
