import type {
	IRehearsalDeclaration,
	IRehearsalPullSpec,
	IRehearsalScenario,
	IRehearsalStep,
} from '../interfaces/rehearsal.interface';

import {
	REHEARSAL_OVERLAP_FILE,
	rehearsalOverlapContent,
} from './rehearsal.constant';

/**
 * Every case of the pull request flow and every production failure as data:
 * what each scenario sets up, the events it causes and the end state the
 * forge must show. A pull request opens as a draft and is marked ready by a
 * step, because that event is what today's land wakes on from a branch that
 * is not the default one. Together they open at most `REHEARSAL_MAX_PULLS`
 * synthetic pull requests in one run.
 */

const CI_SECONDS = 20;
const AWAIT_SECONDS = 360;
const WAKE_AFTER_SECONDS = 150;
/** The lines of the shared file the two overlapping pull requests edit, far apart. */
const OVERLAP_NEAR_LINE = 2;
const OVERLAP_FAR_LINE = 25;

const passing: IRehearsalDeclaration = {
	result: 'success',
	seconds: CI_SECONDS,
	sections: [],
};

const failing: IRehearsalDeclaration = { ...passing, result: 'failure' };

/** A draft pull request writing one file under a section. */
const pullIn = (
	key: string,
	section: string,
	declaration: IRehearsalDeclaration = passing,
	files: Readonly<Record<string, string>> = {},
): IRehearsalPullSpec => ({
	key,
	declaration: { ...declaration, sections: [section] },
	files: { [`rehearsal/sections/${section}/${key}.txt`]: key, ...files },
	draft: true,
});

/**
 * A pull request of a pair that must overlap: both change the one shared
 * file, far enough apart to merge without a conflict.
 */
const overlapPullIn = (
	key: string,
	line: number,
	declaration: IRehearsalDeclaration = passing,
): IRehearsalPullSpec =>
	pullIn(key, 's1', declaration, {
		[REHEARSAL_OVERLAP_FILE]: rehearsalOverlapContent({ line, key }),
	});

const open = (...keys: string[]): IRehearsalStep => ({ kind: 'open', keys });
const ready = (...keys: string[]): IRehearsalStep => ({ kind: 'ready', keys });
const merged = (...keys: string[]): IRehearsalStep => ({
	kind: 'await',
	until: 'merged',
	keys,
	seconds: AWAIT_SECONDS,
	wakeAfterSeconds: WAKE_AFTER_SECONDS,
});
const labelled = (...keys: string[]): IRehearsalStep => ({
	kind: 'await',
	until: 'labelled',
	keys,
	seconds: AWAIT_SECONDS,
	wakeAfterSeconds: WAKE_AFTER_SECONDS,
});

/** The file a `move-integration` step writes, which a pull request can collide with. */
const movedFile = (scenario: string, key: string): string =>
	`rehearsal/{run}/${scenario}-${key}.txt`;

export const REHEARSAL_SCENARIOS: readonly IRehearsalScenario[] = [
	{
		id: 'one-pr',
		title: 'One pull request lands on its own, and its merge is built and scanned',
		reproduces: 'F2+F7+F9',
		pulls: [pullIn('a', 's1')],
		steps: [open('a'), ready('a'), merged('a')],
		expect: [
			{ kind: 'merged', keys: ['a'] },
			{ kind: 'no-manual-steps' },
			{ kind: 'tips-built' },
		],
	},
	{
		id: 'non-overlapping',
		title: 'Two pull requests in different sections both land with no waiting on each other',
		pulls: [pullIn('a', 's1'), pullIn('b', 's2')],
		steps: [open('a', 'b'), ready('a', 'b'), merged('a', 'b')],
		expect: [
			{ kind: 'merged', keys: ['a', 'b'] },
			{ kind: 'no-manual-steps' },
		],
	},
	{
		id: 'overlapping',
		title: 'Two pull requests in one section are built once, as a batch',
		reproduces: 'F5',
		pulls: [
			overlapPullIn('a', OVERLAP_NEAR_LINE),
			overlapPullIn('b', OVERLAP_FAR_LINE),
		],
		steps: [open('a', 'b'), ready('a', 'b'), merged('a', 'b')],
		expect: [
			{ kind: 'merged', keys: ['a', 'b'] },
			{ kind: 'group-ci-runs', keys: ['a', 'b'], exactly: 1 },
			{ kind: 'no-manual-steps' },
		],
	},
	{
		id: 'red-batch',
		title: 'A red batch names its culprit and lands the rest',
		pulls: [
			overlapPullIn('a', OVERLAP_NEAR_LINE, failing),
			overlapPullIn('b', OVERLAP_FAR_LINE),
		],
		steps: [open('a', 'b'), ready('a', 'b'), labelled('a')],
		expect: [
			{ kind: 'labelled', key: 'a', label: 'culprit' },
			{ kind: 'merged', keys: ['b'] },
			{ kind: 'no-manual-steps' },
		],
	},
	{
		id: 'derived-conflict',
		title: 'A conflict only in a derived file is regenerated and the pull request lands',
		pulls: [
			pullIn('a', 's1', passing, {
				[movedFile('derived-conflict', 'a')]: 'pull request',
			}),
		],
		steps: [
			open('a'),
			{ kind: 'move-integration', key: 'a' },
			ready('a'),
			merged('a'),
		],
		expect: [{ kind: 'merged', keys: ['a'] }, { kind: 'no-manual-steps' }],
	},
	{
		id: 'authored-conflict',
		title: 'An authored conflict is labelled once, never flips, and lands after the author resolves it',
		reproduces: 'F3+F4',
		pulls: [
			pullIn('a', 's1', passing, {
				[movedFile('authored-conflict', 'a')]: 'pull request',
			}),
		],
		steps: [
			open('a'),
			{ kind: 'move-integration', key: 'a' },
			ready('a'),
			labelled('a'),
			{
				kind: 'author-update',
				key: 'a',
				files: { [movedFile('authored-conflict', 'a')]: 'resolved' },
			},
			merged('a'),
		],
		expect: [
			{ kind: 'labelled', key: 'a', label: 'needs-update' },
			{ kind: 'labels-stable', key: 'a' },
			{ kind: 'merged', keys: ['a'] },
			{ kind: 'no-manual-steps' },
		],
	},
	{
		id: 'bot-head',
		title: 'A head the workflow token pushed is built by the forge',
		reproduces: 'F1',
		pulls: [pullIn('a', 's1')],
		steps: [open('a'), ready('a'), { kind: 'token-push', key: 'a' }],
		expect: [
			{ kind: 'heads-built', key: 'a' },
			{ kind: 'no-manual-steps' },
		],
	},
	{
		id: 'develop-moving',
		title: 'The integration branch moves in a disjoint section mid-flight and the pull request still lands',
		pulls: [pullIn('a', 's1')],
		steps: [
			open('a'),
			{ kind: 'move-integration', key: 'moved' },
			ready('a'),
			merged('a'),
		],
		expect: [{ kind: 'merged', keys: ['a'] }, { kind: 'no-manual-steps' }],
	},
	{
		id: 'host-offline',
		title: 'A subscribed session is told of every merge and failure whether or not the host was up',
		reproduces: 'F8',
		pulls: [],
		steps: [],
		expect: [{ kind: 'sessions-notified' }],
	},
	{
		id: 'automation-opened',
		title: 'A pull request a workflow opens with the workflow token is built',
		reproduces: 'F1b',
		pulls: [pullIn('a', 's1')],
		steps: [open('a'), ready('a'), { kind: 'token-open', key: 'a' }],
		expect: [
			{ kind: 'heads-built', key: 'a' },
			{ kind: 'no-manual-steps' },
		],
	},
	{
		id: 'promotion',
		title: 'After a green integration branch, the promotion is opened and built',
		pulls: [pullIn('a', 's1')],
		steps: [open('a'), ready('a'), merged('a')],
		expect: [{ kind: 'tips-built' }],
	},
];

/** The most synthetic pull requests one run may open. */
export const REHEARSAL_MAX_PULLS = 15;
