import { describe, expect, it } from 'vitest';

import type {
	IRehearsalEvidence,
	IRehearsalExpectation,
	IRehearsalPullState,
	IRehearsalRun,
} from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import { judge } from '../../../../src/lib/services/rehearsal-expectation.service';

const pull = (
	head: string,
	over: Partial<IRehearsalPullState> = {},
): IRehearsalPullState => ({
	number: 1,
	head,
	headSha: `${head}-sha`,
	base: 'i',
	state: 'open',
	draft: false,
	createdAt: '2026-11-12T10:00:00Z',
	labels: [],
	author: 'h',
	...over,
});

const run = (over: Partial<IRehearsalRun>): IRehearsalRun => ({
	id: 1,
	workflow: 'rehearsal-ci',
	event: 'pull_request',
	headBranch: 'a',
	headSha: 'a-sha',
	status: 'completed',
	conclusion: 'success',
	actor: 'x',
	createdAt: '2026-11-12T10:00:00Z',
	updatedAt: '2026-11-12T10:01:00Z',
	...over,
});

const evidence = (
	over: Partial<IRehearsalEvidence> = {},
): IRehearsalEvidence => ({
	scenario: 's',
	integration: 'i',
	pulls: {},
	events: {},
	runs: [],
	tips: [],
	manualSteps: [],
	tokenHeads: {},
	tokenPulls: {},
	startedAt: 'a',
	finishedAt: 'b',
	failures: [],
	...over,
});

const verdict = (e: IRehearsalEvidence, x: IRehearsalExpectation) =>
	judge(e, x).ok;

describe('judging an expectation', () => {
	it('[<50ms] merged and not-merged read the merge time', () => {
		const e = evidence({
			pulls: { a: pull('a', { mergedAt: 't' }), b: pull('b') },
		});
		expect(verdict(e, { kind: 'merged', keys: ['a'] })).toBe(true);
		expect(verdict(e, { kind: 'merged', keys: ['a', 'b'] })).toBe(false);
		expect(verdict(e, { kind: 'not-merged', keys: ['b'] })).toBe(true);
		expect(verdict(e, { kind: 'not-merged', keys: ['a'] })).toBe(false);
	});

	it('[<50ms] labelled needs a labeled event with that verdict', () => {
		const labelled = evidence({
			events: {
				a: [
					{
						event: 'labeled',
						label: 'x:needs-update',
						createdAt: 't',
						actor: 'i',
					},
				],
			},
		});
		expect(
			verdict(labelled, {
				kind: 'labelled',
				key: 'a',
				label: 'needs-update',
			}),
		).toBe(true);
		expect(
			verdict(labelled, { kind: 'labelled', key: 'a', label: 'culprit' }),
		).toBe(false);
		expect(
			verdict(evidence(), {
				kind: 'labelled',
				key: 'a',
				label: 'culprit',
			}),
		).toBe(false);
	});

	it('[<50ms] labels-stable fails on a label removed and put back', () => {
		const flip = evidence({
			events: {
				a: [
					{
						event: 'labeled',
						label: 'needs-update',
						createdAt: '1',
						actor: 'i',
					},
					{
						event: 'unlabeled',
						label: 'needs-update',
						createdAt: '2',
						actor: 'i',
					},
					{
						event: 'labeled',
						label: 'needs-update',
						createdAt: '3',
						actor: 'i',
					},
				],
			},
		});
		expect(verdict(flip, { kind: 'labels-stable', key: 'a' })).toBe(false);
		expect(verdict(evidence(), { kind: 'labels-stable', key: 'a' })).toBe(
			true,
		);
	});

	it('[<50ms] heads-built needs a CI run for every head a workflow token wrote', () => {
		const built = evidence({
			tokenHeads: { a: ['a-sha'] },
			runs: [run({})],
		});
		expect(verdict(built, { kind: 'heads-built', key: 'a' })).toBe(true);
		const unbuilt = evidence({ tokenHeads: { a: ['a-sha'] } });
		expect(
			judge(unbuilt, { kind: 'heads-built', key: 'a' }).detail,
		).toContain('no CI started');
		expect(
			judge(evidence(), { kind: 'heads-built', key: 'a' }).detail,
		).toContain('no head');
		const opened = evidence({
			pulls: { 'a:token-open': pull('t') },
			runs: [],
		});
		expect(verdict(opened, { kind: 'heads-built', key: 'a' })).toBe(false);
	});

	it('[<50ms] group-ci-runs counts the runs after each member own first one', () => {
		const e = evidence({
			pulls: { a: pull('a'), b: pull('b') },
			runs: [
				run({ id: 1, headBranch: 'a' }),
				run({ id: 2, headBranch: 'b' }),
				run({ id: 3, headBranch: 'batch' }),
			],
		});
		expect(
			verdict(e, { kind: 'group-ci-runs', keys: ['a', 'b'], exactly: 1 }),
		).toBe(true);
		expect(
			verdict(e, { kind: 'group-ci-runs', keys: ['a', 'b'], exactly: 0 }),
		).toBe(false);
	});

	it('[<50ms] tips-built needs a scan run for every tip after the setup commit', () => {
		const scanned = evidence({
			tips: ['setup', 't1'],
			runs: [
				run({
					event: 'push',
					workflow: 'rehearsal-scan',
					headSha: 't1',
				}),
			],
		});
		expect(verdict(scanned, { kind: 'tips-built' })).toBe(true);
		expect(
			judge(evidence({ tips: ['setup', 't1'] }), { kind: 'tips-built' })
				.detail,
		).toContain('no push run');
		expect(
			judge(evidence({ tips: ['setup'] }), { kind: 'tips-built' }).detail,
		).toContain('never moved');
	});

	it('[<50ms] no-manual-steps lists every wake', () => {
		expect(verdict(evidence(), { kind: 'no-manual-steps' })).toBe(true);
		const woke = evidence({ manualSteps: ['woke a'] });
		expect(judge(woke, { kind: 'no-manual-steps' }).detail).toBe('woke a');
	});

	it('[<50ms] sessions-notified fails by absence of a receiver', () => {
		expect(
			judge(evidence(), { kind: 'sessions-notified' }).detail,
		).toContain('nobody was told');
		const told = evidence({
			notifications: [{ event: 'pr.merged', at: 't' }],
		});
		expect(verdict(told, { kind: 'sessions-notified' })).toBe(true);
	});
});
