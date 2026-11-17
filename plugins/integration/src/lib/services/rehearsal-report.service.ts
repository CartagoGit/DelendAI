/**
 * rehearsal-report.service.ts — judges what a rehearsal left on the forge.
 *
 * Pure over the evidence: each scenario's expectations, then the targets
 * of the pull request flow measured across every scenario of the run.
 */
import type {
	IRehearsalEvidence,
	IRehearsalMode,
	IRehearsalReport,
	IRehearsalScenario,
	IRehearsalScenarioResult,
} from '../contracts/interfaces/rehearsal.interface';
import type { IUnstartedRun } from '../contracts/interfaces/rehearsal-evidence.interface';

import { judge, result } from './rehearsal-expectation.service';
import {
	collectSamples,
	targetClears,
	targetsOfSamples,
} from './rehearsal-targets.service';

export { targetClears } from './rehearsal-targets.service';

const SHORT_SHA = 12;

/** One scenario's verdict: every expectation met, and no step failed. */
export const judgeScenario = (
	scenario: IRehearsalScenario,
	evidence: IRehearsalEvidence,
): IRehearsalScenarioResult => {
	const expectations = [
		...scenario.expect.map((expectation) => judge(evidence, expectation)),
		...evidence.failures.map((failure) => result('step', false, failure)),
	];
	return {
		id: scenario.id,
		title: scenario.title,
		...(scenario.reproduces === undefined
			? {}
			: { reproduces: scenario.reproduces }),
		ok: expectations.every((expectation) => expectation.ok),
		expectations,
		integration: evidence.integration,
		pulls: Object.fromEntries(
			Object.entries(evidence.pulls).map(([key, pull]) => [
				key,
				pull.number,
			]),
		),
	};
};

/** The report of a run: every scenario, the targets, and what cleanup left. */
export const buildReport = (input: {
	readonly runId: string;
	readonly repository: string;
	readonly tip: string;
	readonly startedAt: string;
	readonly finishedAt: string;
	readonly scenarios: readonly IRehearsalScenario[];
	/** The mode the run used; absent means fast. */
	readonly mode?: IRehearsalMode;
	readonly evidence: readonly IRehearsalEvidence[];
	readonly leftovers: readonly string[];
	readonly secretHits: readonly string[];
	readonly unreadLogs?: readonly string[];
	readonly unstarted?: readonly IUnstartedRun[];
}): IRehearsalReport => {
	const results = input.scenarios.map((scenario) => {
		const evidence = input.evidence.find(
			(one) => one.scenario === scenario.id,
		);
		return evidence === undefined
			? {
					id: scenario.id,
					title: scenario.title,
					ok: false,
					expectations: [
						result('ran', false, 'the scenario did not run'),
					],
					integration: '',
					pulls: {},
				}
			: judgeScenario(scenario, evidence);
	});
	const samples = collectSamples(input.scenarios, input.evidence, results);
	const targets = targetsOfSamples(
		samples,
		input.secretHits.length,
		input.unreadLogs,
		input.unstarted,
	);
	return {
		runId: input.runId,
		mode: input.mode ?? 'fast',
		repository: input.repository,
		tip: input.tip,
		startedAt: input.startedAt,
		finishedAt: input.finishedAt,
		scenarios: results,
		targets,
		samples,
		leftovers: input.leftovers,
		secretHits: input.secretHits,
		...(input.unreadLogs === undefined || input.unreadLogs.length === 0
			? {}
			: { unreadLogs: input.unreadLogs }),
		...(input.unstarted === undefined || input.unstarted.length === 0
			? {}
			: { unstartedRuns: input.unstarted }),
		ok:
			results.every((one) => one.ok) &&
			targets.every(targetClears) &&
			input.leftovers.length === 0 &&
			input.secretHits.length === 0,
	};
};

/** The short text table printed under the JSON. */
export const renderReportTable = (report: IRehearsalReport): string => {
	const rows = [
		`rehearsal ${report.runId} on ${report.tip.slice(0, SHORT_SHA)}: ${report.ok ? 'GREEN' : 'RED'}`,
		'',
		'scenario | reproduces | verdict | why',
		'---|---|---|---',
		...report.scenarios.map(
			(one) =>
				`${one.id} | ${one.reproduces ?? '-'} | ${one.ok ? 'green' : 'RED'} | ${
					one.expectations
						.filter((e) => !e.ok)
						.map((e) => `${e.expectation}: ${e.detail}`)
						.join('; ') || 'all met'
				}`,
		),
		'',
		'target | value | threshold | verdict | detail',
		'---|---|---|---|---',
		...report.targets.map(
			(one) =>
				`${one.id} | ${one.value === undefined ? 'n/a' : String(Math.round(one.value * 100) / 100)} | ${String(one.threshold)} ${one.unit} | ${one.ok ? 'met' : one.notMeasured === true ? 'NOT MEASURED' : 'MISSED'} | ${one.detail}`,
		),
		'',
		`leftovers: ${report.leftovers.length === 0 ? 'none' : report.leftovers.join(', ')}`,
		`secret hits: ${String(report.secretHits.length)}`,
	];
	return `${rows.join('\n')}\n`;
};
