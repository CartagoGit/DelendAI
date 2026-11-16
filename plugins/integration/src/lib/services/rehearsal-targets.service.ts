/**
 * rehearsal-targets.service.ts — the targets of the pull request flow,
 * measured from samples read off the evidence of the scenarios a run played.
 * Pure: a target the fast mode cannot measure is not reported here; one it
 * can measure and that has no data (no session receiver ran) fails, never
 * passes by absence.
 */
import {
	REHEARSAL_DEFERRED_TARGETS,
	REHEARSAL_TARGETS,
} from '../contracts/constants/rehearsal.constant';
import type {
	IRehearsalEvidence,
	IRehearsalPullEvent,
	IRehearsalPullState,
	IRehearsalSamples,
	IRehearsalScenario,
	IRehearsalScenarioResult,
	IRehearsalTargetResult,
} from '../contracts/interfaces/rehearsal.interface';
import type { IUnstartedRun } from '../contracts/interfaces/rehearsal-evidence.interface';

import { scanStarted } from './rehearsal-scan.helper';

const minutesBetween = (from: string, to: string): number =>
	(Date.parse(to) - Date.parse(from)) / 60_000;

/** When a pull request became ready: its last `ready_for_review`, else its opening. */
const readyAt = (
	pull: IRehearsalPullState,
	events: readonly IRehearsalPullEvent[],
): string =>
	events.filter((event) => event.event === 'ready_for_review').at(0)
		?.createdAt ?? pull.createdAt;

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

const notMeasuredTarget = (
	id: string,
	threshold: number,
	unit: string,
	detail: string,
): IRehearsalTargetResult => ({
	id,
	value: undefined,
	threshold,
	unit,
	ok: false,
	notMeasured: true,
	detail,
});

/** Whether a target keeps a run green: met, or not measured and listed as deferred. */
export const targetClears = (one: IRehearsalTargetResult): boolean =>
	one.ok ||
	(one.notMeasured === true && one.id in REHEARSAL_DEFERRED_TARGETS);

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

/** The keys a scenario expects merged: the one source of which pull requests the merge times cover. */
const mergedKeysOf = (
	scenarios: readonly IRehearsalScenario[],
	id: string,
): readonly string[] =>
	(scenarios.find((scenario) => scenario.id === id)?.expect ?? []).flatMap(
		(expectation) =>
			expectation.kind === 'merged' ? expectation.keys : [],
	);

/**
 * Seconds from a change to its notification. Measured only when a real-time
 * transport ran; catch-up alone is not a timing, so it is reported as not
 * measured and does not fail.
 */
const notifiedTarget = (
	seconds: readonly number[],
	caughtUp: boolean,
): IRehearsalTargetResult => {
	const threshold = REHEARSAL_TARGETS.notifiedP95Seconds;
	if (seconds.length > 0)
		return target(
			'session-notified-p95',
			percentile(seconds, 0.95),
			threshold,
			's',
			`${String(seconds.length)} notification(s) timed`,
		);
	return {
		id: 'session-notified-p95',
		value: undefined,
		threshold,
		unit: 's',
		ok: false,
		notMeasured: true,
		detail: caughtUp
			? 'not measured: real-time transport is S11b'
			: 'no session receiver ran: no notification can be timed',
	};
};

/**
 * Runs the forge listed but never enqueued are reported by id and never fail
 * a run, except one no pass covers: no pass of its workflow on its branch
 * completed successfully after it was created, so the wake it carried was lost.
 */
const unstartedTarget = (
	unstarted: readonly IUnstartedRun[],
): IRehearsalTargetResult => {
	const lost = unstarted.filter((one) => one.lost);
	const ids = unstarted
		.map(
			(one) =>
				`${String(one.id)}${one.lost ? ' (a lost wake)' : one.coveredBy === undefined ? '' : ` (covered by pass ${String(one.coveredBy)})`}`,
		)
		.join(', ');
	return {
		id: 'unstarted-runs',
		value: lost.length,
		threshold: 0,
		unit: 'lost wake',
		ok: lost.length === 0,
		detail: `${String(unstarted.length)} run(s) the forge never enqueued${ids === '' ? '' : `: ${ids}`}`,
	};
};

/** What the targets are computed from, read off the evidence of the scenarios a run played. */
export const collectSamples = (
	scenarios: readonly IRehearsalScenario[],
	evidence: readonly IRehearsalEvidence[],
	results: readonly IRehearsalScenarioResult[],
): IRehearsalSamples => {
	// Only a pull request its scenario expects merged counts for the merge
	// times: a culprit that stays open is the flow working.
	const expectedMerged = evidence.flatMap((one) => {
		const keys = new Set(mergedKeysOf(scenarios, one.scenario));
		return Object.entries(one.pulls)
			.filter(([key]) => keys.has(key))
			.map(([key, pull]) => ({ one, key, pull }));
	});
	const tips = evidence.flatMap((one) =>
		one.tips.slice(1).map((sha) => ({ one, sha })),
	);
	return {
		mergeMinutes: expectedMerged.flatMap(({ one, key, pull }) =>
			pull.mergedAt === undefined
				? []
				: [
						minutesBetween(
							readyAt(pull, one.events[key] ?? []),
							pull.mergedAt,
						),
					],
		),
		expectedMerged: expectedMerged.length,
		manualSteps: evidence.reduce(
			(count, one) => count + one.manualSteps.length,
			0,
		),
		notifiedSeconds: evidence.flatMap((one) => one.notifiedSeconds ?? []),
		caughtUp: evidence.some((one) => one.notifications !== undefined),
		tips: tips.length,
		scanned: tips.filter(({ one, sha }) =>
			scanStarted(one.runs, sha, one.workflows),
		).length,
		groupChecks: results
			.flatMap((one) =>
				one.expectations.filter((e) =>
					e.expectation.startsWith('one CI for'),
				),
			)
			.map((check) => ({ ok: check.ok, detail: check.detail })),
	};
};

/** The samples of several runs as the samples of one run over all their scenarios. */
export const sumSamples = (
	all: readonly IRehearsalSamples[],
): IRehearsalSamples => ({
	mergeMinutes: all.flatMap((one) => one.mergeMinutes),
	expectedMerged: all.reduce((sum, one) => sum + one.expectedMerged, 0),
	manualSteps: all.reduce((sum, one) => sum + one.manualSteps, 0),
	notifiedSeconds: all.flatMap((one) => one.notifiedSeconds),
	caughtUp: all.some((one) => one.caughtUp),
	tips: all.reduce((sum, one) => sum + one.tips, 0),
	scanned: all.reduce((sum, one) => sum + one.scanned, 0),
	groupChecks: all.flatMap((one) => one.groupChecks),
});

/** The targets of the pull request flow that the fast mode measures, from the samples of the scenarios played. */
export const targetsOfSamples = (
	samples: IRehearsalSamples,
	secretHits: number,
	unreadLogs: readonly string[] = [],
	unstarted: readonly IUnstartedRun[] = [],
): readonly IRehearsalTargetResult[] => {
	const durations = samples.mergeMinutes;
	const opened = samples.expectedMerged;
	return [
		target(
			'pr-to-merged-p50',
			percentile(durations, 0.5),
			REHEARSAL_TARGETS.prToMergedP50Minutes,
			'min',
			`${String(durations.length)} of ${String(opened)} pull request(s) expected merged did merge`,
		),
		target(
			'pr-to-merged-p95',
			durations.length < opened ? undefined : percentile(durations, 0.95),
			REHEARSAL_TARGETS.prToMergedP95Minutes,
			'min',
			durations.length < opened
				? `${String(opened - durations.length)} pull request(s) expected merged never merged`
				: 'every pull request expected merged did merge',
		),
		target(
			'one-ci-per-overlapping-group',
			samples.groupChecks.every((check) => check.ok) ? 1 : 0,
			REHEARSAL_TARGETS.groupCiRuns,
			'run',
			samples.groupChecks.map((check) => check.detail).join('; ') ||
				'no group',
			(value, threshold) =>
				value === threshold && samples.groupChecks.length > 0,
		),
		target(
			'zero-manual-steps',
			samples.manualSteps,
			REHEARSAL_TARGETS.manualSteps,
			'step',
			`${String(samples.manualSteps)} wake(s) or other step(s) a person would have taken`,
		),
		notifiedTarget(samples.notifiedSeconds, samples.caughtUp),
		target(
			'integration-branch-scanned',
			samples.tips === 0 ? undefined : samples.scanned / samples.tips,
			1,
			'share',
			`${String(samples.scanned)} of ${String(samples.tips)} merged tip(s) started a scan`,
			(value, threshold) => value >= threshold,
		),
		secretHits === 0 && unreadLogs.length > 0
			? notMeasuredTarget(
					'no-secrets-in-logs',
					REHEARSAL_TARGETS.secretHits,
					'hit',
					`not measured: ${String(unreadLogs.length)} log(s) could not be read: ${unreadLogs.join('; ')}`,
				)
			: target(
					'no-secrets-in-logs',
					secretHits,
					REHEARSAL_TARGETS.secretHits,
					'hit',
					`${String(secretHits)} hit(s)`,
				),
		unstartedTarget(unstarted),
	];
};
