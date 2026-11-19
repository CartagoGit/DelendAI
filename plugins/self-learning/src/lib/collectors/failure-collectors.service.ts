/**
 * failure-collectors.service.ts — q00049 S1.
 *
 * Every failure a project meets (a gate, a hook, a CI job, a land
 * verdict, a tool error, a deliver refusal) becomes ONE observation in
 * the existing self-learning store. No second ledger: the collectors
 * only shape facts and hand them to an injected sink, normally
 * `appendObservations` bound to the project's store.
 *
 * Two promises:
 *  - nothing secret-looking is ever kept: every free text is passed
 *    through `redactSecrets`, and tool arguments are never read;
 *  - a sink that throws or rejects never changes the caller's result.
 */
import { redactSecrets } from '@delendai/core/public';
import { deriveToolFailure } from '@delendai/core/runtime';

import type {
	IFailureCollectors,
	IFailureReport,
	IFailureSource,
	IFailureStage,
	IObservation,
	IObservationSink,
} from '../contracts/interfaces/observation.interface';

const MAX_FILES = 20;

const clean = (text: string): string => redactSecrets(text).text;

const observationOf = (
	stage: IFailureStage,
	defaultClass: string,
	source: string,
	report: IFailureReport,
	atMs: number,
	classOverride?: string,
): IObservation => ({
	kind: 'failure',
	subject: clean(report.subject),
	outcome: 'fail',
	atMs,
	source,
	failure: {
		class: clean(classOverride ?? report.class ?? defaultClass),
		stage,
		files: (report.files ?? []).slice(0, MAX_FILES).map(clean),
		unit: clean(report.unit ?? ''),
		minutesLost:
			report.minutesLost !== undefined &&
			Number.isFinite(report.minutesLost) &&
			report.minutesLost > 0
				? report.minutesLost
				: 0,
	},
});

export const createFailureCollectors = (
	sink: IObservationSink,
	now: () => number,
): IFailureCollectors => {
	const emit = async (observation: IObservation): Promise<void> => {
		try {
			await sink([observation]);
		} catch {
			// Learning must never fail the work it exists to make cheaper.
		}
	};
	const simple =
		(stage: IFailureStage, defaultClass: string, source: string) =>
		(report: IFailureReport): Promise<void> =>
			emit(observationOf(stage, defaultClass, source, report, now()));
	return {
		gate: simple('gate', 'gate-failed', 'failure-gate'),
		hook: simple('hook', 'hook-failed', 'failure-hook'),
		ciJob: simple('ci', 'ci-job-failed', 'failure-ci'),
		landVerdict: simple('land', 'land-refused', 'failure-land'),
		deliverRefusal: simple('deliver', 'deliver-refused', 'failure-deliver'),
		toolError: (report) => {
			let derived: string;
			try {
				derived = deriveToolFailure({
					...(report.error !== undefined
						? { error: report.error }
						: {}),
					...(report.result !== undefined
						? { result: report.result }
						: {}),
					...(report.cancelled !== undefined
						? { cancelled: report.cancelled }
						: {}),
				}).class;
			} catch {
				derived = 'unknown';
			}
			return emit(
				observationOf(
					'runtime',
					derived,
					'failure-tool',
					report,
					now(),
					report.class ?? derived,
				),
			);
		},
	};
};

/** Record one failure through `sink`; the single entry every caller uses. */
export const recordFailure = (
	sink: IObservationSink,
	source: IFailureSource,
	report: IFailureReport,
	now: () => number = Date.now,
): Promise<void> => createFailureCollectors(sink, now)[source](report);
