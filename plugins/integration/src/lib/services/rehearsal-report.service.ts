/**
 * rehearsal-report.service.ts — judges what a rehearsal left on the forge.
 *
 * Pure over the evidence: each scenario's expectations, then the targets
 * of the pull request flow measured across every scenario of the run. A target the fast
 * mode cannot measure is not reported here; one it can measure and that
 * has no data (no session receiver ran) fails, never passes by absence.
 */
import { REHEARSAL_TARGETS } from '../contracts/constants/rehearsal.constant';
import type {
	IRehearsalEvidence,
	IRehearsalPullEvent,
	IRehearsalPullState,
	IRehearsalReport,
	IRehearsalScenario,
	IRehearsalScenarioResult,
	IRehearsalTargetResult,
} from '../contracts/interfaces/rehearsal.interface';

import { judge, result } from './rehearsal-expectation.service';

const SHORT_SHA = 12;

const minutesBetween = (from: string, to: string): number =>
	(Date.parse(to) - Date.parse(from)) / 60_000;

/** When a pull request became ready: its last `ready_for_review`, else its opening. */
export const readyAt = (
	pull: IRehearsalPullState,
	events: readonly IRehearsalPullEvent[],
): string =>
	events.filter((event) => event.event === 'ready_for_review').at(0)
		?.createdAt ?? pull.createdAt;

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

const percentile = (
	values: readonly number[],
	p: number,
): number | undefined => {
	if (values.length === 0) return undefined;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[
		Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)
	];
};

const target = (
	id: string,
	value: number | undefined,
	threshold: number,
	unit: string,
	detail: string,
	within: (value: number, threshold: number) => boolean = (v, t) => v <= t,
): IRehearsalTargetResult => ({
	id,
	value,
	threshold,
	unit,
	ok: value !== undefined && within(value, threshold),
	detail,
});

/** The targets of the pull request flow that the fast mode measures, across every scenario. */
export const measureTargets = (
	evidence: readonly IRehearsalEvidence[],
	results: readonly IRehearsalScenarioResult[],
	secretHits: number,
): readonly IRehearsalTargetResult[] => {
	const durations = evidence.flatMap((one) =>
		Object.entries(one.pulls).flatMap(([key, pull]) =>
			pull.mergedAt === undefined
				? []
				: [
						minutesBetween(
							readyAt(pull, one.events[key] ?? []),
							pull.mergedAt,
						),
					],
		),
	);
	const opened = evidence.reduce(
		(count, one) => count + Object.keys(one.pulls).length,
		0,
	);
	const groupChecks = results.flatMap((one) =>
		one.expectations.filter((e) => e.expectation.startsWith('one CI for')),
	);
	const manual = evidence.reduce(
		(count, one) => count + one.manualSteps.length,
		0,
	);
	const tips = evidence.flatMap((one) =>
		one.tips.slice(1).map((sha) => ({ one, sha })),
	);
	const scanned = tips.filter(({ one, sha }) =>
		one.runs.some(
			(run) =>
				run.event === 'push' &&
				run.headSha === sha &&
				run.workflow === 'rehearsal-scan',
		),
	);
	const notified = evidence.some((one) => one.notifications !== undefined);
	return [
		target(
			'pr-to-merged-p50',
			percentile(durations, 0.5),
			REHEARSAL_TARGETS.prToMergedP50Minutes,
			'min',
			`${String(durations.length)} of ${String(opened)} pull request(s) merged`,
		),
		target(
			'pr-to-merged-p95',
			durations.length < opened ? undefined : percentile(durations, 0.95),
			REHEARSAL_TARGETS.prToMergedP95Minutes,
			'min',
			durations.length < opened
				? `${String(opened - durations.length)} pull request(s) never merged`
				: 'every pull request merged',
		),
		target(
			'one-ci-per-overlapping-group',
			groupChecks.every((check) => check.ok) ? 1 : 0,
			REHEARSAL_TARGETS.groupCiRuns,
			'run',
			groupChecks.map((check) => check.detail).join('; ') || 'no group',
			(value, threshold) => value === threshold && groupChecks.length > 0,
		),
		target(
			'zero-manual-steps',
			manual,
			REHEARSAL_TARGETS.manualSteps,
			'step',
			`${String(manual)} wake(s) or other step(s) a person would have taken`,
		),
		target(
			'session-notified-p95',
			undefined,
			REHEARSAL_TARGETS.notifiedP95Seconds,
			's',
			notified
				? 'receipts recorded but not timed'
				: 'no session receiver ran: no notification can be timed',
		),
		target(
			'integration-branch-scanned',
			tips.length === 0 ? undefined : scanned.length / tips.length,
			1,
			'share',
			`${String(scanned.length)} of ${String(tips.length)} merged tip(s) started a scan`,
			(value, threshold) => value >= threshold,
		),
		target(
			'no-secrets-in-logs',
			secretHits,
			REHEARSAL_TARGETS.secretHits,
			'hit',
			`${String(secretHits)} hit(s)`,
		),
	];
};

/** The report of a run: every scenario, the targets, and what cleanup left. */
export const buildReport = (input: {
	readonly runId: string;
	readonly repository: string;
	readonly tip: string;
	readonly startedAt: string;
	readonly finishedAt: string;
	readonly scenarios: readonly IRehearsalScenario[];
	readonly evidence: readonly IRehearsalEvidence[];
	readonly leftovers: readonly string[];
	readonly secretHits: readonly string[];
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
	const targets = measureTargets(
		input.evidence,
		results,
		input.secretHits.length,
	);
	return {
		runId: input.runId,
		mode: 'fast',
		repository: input.repository,
		tip: input.tip,
		startedAt: input.startedAt,
		finishedAt: input.finishedAt,
		scenarios: results,
		targets,
		leftovers: input.leftovers,
		secretHits: input.secretHits,
		ok:
			results.every((one) => one.ok) &&
			targets.every((one) => one.ok) &&
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
				`${one.id} | ${one.value === undefined ? 'n/a' : String(Math.round(one.value * 100) / 100)} | ${String(one.threshold)} ${one.unit} | ${one.ok ? 'met' : 'MISSED'} | ${one.detail}`,
		),
		'',
		`leftovers: ${report.leftovers.length === 0 ? 'none' : report.leftovers.join(', ')}`,
		`secret hits: ${String(report.secretHits.length)}`,
	];
	return `${rows.join('\n')}\n`;
};
