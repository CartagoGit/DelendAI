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
});
