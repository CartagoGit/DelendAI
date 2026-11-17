import { describe, expect, it } from 'vitest';

import type {
	IRehearsalEvidence,
	IRehearsalPullState,
	IRehearsalScenario,
} from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import {
	headBuilt,
	labelFlips,
} from '../../../../src/lib/services/rehearsal-expectation.service';
import {
	buildReport,
	renderReportTable,
	targetClears,
} from '../../../../src/lib/services/rehearsal-report.service';

const pull = (
	over: Partial<IRehearsalPullState> = {},
): IRehearsalPullState => ({
	number: 7,
	head: 'delendai/rehearsal/r1/one-a',
	headSha: 'aaa',
	base: 'delendai/rehearsal/r1/one-integration',
	state: 'open',
	draft: false,
	createdAt: '2026-11-12T10:00:00Z',
	labels: [],
	author: 'harness',
	...over,
});

const scenario: IRehearsalScenario = {
	id: 'one',
	title: 'One PR',
	pulls: [],
	steps: [],
	expect: [{ kind: 'merged', keys: ['a'] }],
};

const evidence = (
	over: Partial<IRehearsalEvidence> = {},
): IRehearsalEvidence => ({
	scenario: 'one',
	integration: 'delendai/rehearsal/r1/one-integration',
	pulls: { a: pull({ mergedAt: '2026-11-12T10:05:00Z' }) },
	events: {},
	runs: [],
	tips: [],
	manualSteps: [],
	tokenHeads: {},
	tokenPulls: {},
	startedAt: '2026-11-12T10:00:00Z',
	finishedAt: '2026-11-12T10:06:00Z',
	failures: [],
	...over,
});

const report = (ev: IRehearsalEvidence, leftovers: readonly string[] = []) =>
	buildReport({
		runId: 'r1',
		repository: 'o/r',
		tip: 'abcdef0123456789',
		startedAt: ev.startedAt,
		finishedAt: ev.finishedAt,
		scenarios: [scenario],
		evidence: [ev],
		leftovers,
		secretHits: [],
	});

describe('the rehearsal report', () => {
	it('[<50ms] passes a scenario whose pull request merged', () => {
		const built = report(evidence());
		expect(built.scenarios[0]?.ok).toBe(true);
	});

	it('[<50ms] fails a scenario whose pull request never merged and says which', () => {
		const built = report(evidence({ pulls: { a: pull() } }));
		expect(built.ok).toBe(false);
		expect(built.scenarios[0]?.expectations[0]?.detail).toContain('a');
	});

	it('[<50ms] counts the merge times only over the pull requests the scenario expects merged', () => {
		const culpritStays = evidence({
			pulls: {
				a: pull({ number: 8 }),
				b: pull({ mergedAt: '2026-11-12T10:05:00Z' }),
			},
		});
		const built = buildReport({
			runId: 'r1',
			repository: 'o/r',
			tip: 'abcdef0123456789',
			startedAt: culpritStays.startedAt,
			finishedAt: culpritStays.finishedAt,
			scenarios: [
				{ ...scenario, expect: [{ kind: 'merged', keys: ['b'] }] },
			],
			evidence: [culpritStays],
			leftovers: [],
			secretHits: [],
		});
		const p95 = built.targets.find((t) => t.id === 'pr-to-merged-p95');
		expect(p95?.ok).toBe(true);
		expect(p95?.detail).toBe(
			'every pull request expected merged did merge',
		);
	});

	it('[<50ms] still fails the merge times when a pull request expected merged did not merge', () => {
		const built = report(evidence({ pulls: { a: pull() } }));
		const p95 = built.targets.find((t) => t.id === 'pr-to-merged-p95');
		expect(p95?.ok).toBe(false);
		expect(p95?.detail).toBe(
			'1 pull request(s) expected merged never merged',
		);
	});

	it('[<50ms] reports the notification timing as not measured, and not failed, when only catch-up ran', () => {
		const built = report(
			evidence({ notifications: [{ event: 'pr.merged', at: 't' }] }),
		);
		const timing = built.targets.find(
			(t) => t.id === 'session-notified-p95',
		);
		expect(timing?.ok).toBe(false);
		expect(timing?.notMeasured).toBe(true);
		expect(targetClears(timing!)).toBe(true);
		expect(timing?.value).toBeUndefined();
		expect(timing?.detail).toBe(
			'not measured: real-time transport is S11b',
		);
	});

	it('[<50ms] measures the notification timing when a real-time transport ran', () => {
		const built = report(
			evidence({
				notifications: [{ event: 'pr.merged', at: 't' }],
				notifiedSeconds: [2, 4, 30],
			}),
		);
		const timing = built.targets.find(
			(t) => t.id === 'session-notified-p95',
		);
		expect(timing?.value).toBe(30);
		expect(timing?.ok).toBe(false);
	});

	it('[<50ms] fails the notification timing when no receiver ran at all', () => {
		const built = report(evidence());
		const timing = built.targets.find(
			(t) => t.id === 'session-notified-p95',
		);
		expect(timing?.ok).toBe(false);
	});

	it('[<50ms] fails the run on a leftover even when every scenario passed', () => {
		const built = report(evidence(), ['branch x']);
		expect(built.ok).toBe(false);
		expect(built.leftovers).toEqual(['branch x']);
	});

	it('[<50ms] marks a scenario that produced no evidence as not run', () => {
		const built = buildReport({
			runId: 'r1',
			repository: 'o/r',
			tip: 't',
			startedAt: 'a',
			finishedAt: 'b',
			scenarios: [scenario],
			evidence: [],
			leftovers: [],
			secretHits: [],
		});
		expect(built.scenarios[0]?.ok).toBe(false);
	});

	it('[<50ms] prints a table naming every scenario and target', () => {
		const text = renderReportTable(report(evidence()));
		expect(text).toContain('scenario | reproduces | verdict | why');
		expect(text).toContain('target | value | threshold | verdict | detail');
		expect(text).toContain('one |');
	});

	it('[<50ms] serialises to JSON a reader can parse back', () => {
		const built = report(evidence());
		expect(JSON.parse(JSON.stringify(built))).toEqual(built);
	});

	it('[<50ms] sees a verdict label removed and re-applied with no new commit as a flip', () => {
		const flips = labelFlips([
			{
				event: 'labeled',
				label: 'delendai:needs-update',
				createdAt: '1',
				actor: 'x',
			},
			{
				event: 'unlabeled',
				label: 'delendai:needs-update',
				createdAt: '2',
				actor: 'x',
			},
			{
				event: 'labeled',
				label: 'delendai:needs-update',
				createdAt: '3',
				actor: 'x',
			},
		]);
		expect(flips).toHaveLength(1);
	});

	it('[<50ms] does not count a head the forge held for approval as built', () => {
		expect(
			headBuilt(
				[
					{
						id: 1,
						workflow: 'rehearsal-ci',
						event: 'pull_request',
						headBranch: 'b',
						headSha: 'aaa',
						status: 'completed',
						conclusion: 'action_required',
						actor: 'bot',
						createdAt: '1',
						updatedAt: '1',
					},
				],
				'aaa',
			),
		).toBe(false);
	});

	it('[<50ms] reports unreadable logs as not measured with their run ids, neither a hit nor ok', () => {
		const built = buildReport({
			runId: 'r1',
			repository: 'o/r',
			tip: 'abc',
			startedAt: '2026-11-12T10:00:00Z',
			finishedAt: '2026-11-12T10:06:00Z',
			scenarios: [scenario],
			evidence: [evidence()],
			leftovers: [],
			secretHits: [],
			unreadLogs: ['CI run 42: still in progress'],
		});
		const secrets = built.targets.find(
			(t) => t.id === 'no-secrets-in-logs',
		);
		expect(secrets?.ok).toBe(false);
		expect(secrets?.notMeasured).toBe(true);
		expect(secrets?.detail).toContain('run 42');
		expect(built.secretHits).toEqual([]);
		expect(built.ok).toBe(false);
	});

	it('[<50ms] reports unstarted runs by id without failing the run, and does not make the log scan unmeasured', () => {
		const built = buildReport({
			runId: 'r1',
			repository: 'o/r',
			tip: 'abc',
			startedAt: '2026-11-12T10:00:00Z',
			finishedAt: '2026-11-12T10:06:00Z',
			scenarios: [scenario],
			evidence: [evidence()],
			leftovers: [],
			secretHits: [],
			unstarted: [
				{
					id: 42,
					workflow: 'land',
					branch: 'b',
					lost: false,
					coveredBy: 41,
				},
			],
		});
		const target = built.targets.find((t) => t.id === 'unstarted-runs');
		expect(target?.ok).toBe(true);
		expect(target?.detail).toContain('1 run(s)');
		expect(target?.detail).toContain('42 (covered by pass 41)');
		expect(
			built.targets.find((t) => t.id === 'no-secrets-in-logs')
				?.notMeasured,
		).toBeUndefined();
		expect(built.unstartedRuns).toHaveLength(1);
	});

	it('[<50ms] fails the target when no pass covers the unstarted run: its wake was lost', () => {
		const built = buildReport({
			runId: 'r1',
			repository: 'o/r',
			tip: 'abc',
			startedAt: '2026-11-12T10:00:00Z',
			finishedAt: '2026-11-12T10:06:00Z',
			scenarios: [scenario],
			evidence: [evidence()],
			leftovers: [],
			secretHits: [],
			unstarted: [{ id: 43, workflow: 'land', branch: 'b', lost: true }],
		});
		const target = built.targets.find((t) => t.id === 'unstarted-runs');
		expect(target?.ok).toBe(false);
		expect(target?.value).toBe(1);
		expect(target?.detail).toContain('43 (a lost wake)');
		expect(built.ok).toBe(false);
	});

	it('[<50ms] clears a not-measured target only when it is a listed deferral', () => {
		const base = { value: undefined, threshold: 1, unit: 'x', detail: 'd' };
		expect(
			targetClears({
				...base,
				id: 'session-notified-p95',
				ok: false,
				notMeasured: true,
			}),
		).toBe(true);
		expect(
			targetClears({
				...base,
				id: 'no-secrets-in-logs',
				ok: false,
				notMeasured: true,
			}),
		).toBe(false);
	});
});
