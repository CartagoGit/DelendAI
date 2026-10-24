#!/usr/bin/env bun

export type ICheckResult =
	| 'success'
	| 'failure'
	| 'cancelled'
	| 'skipped'
	| string;

export interface IValidateSummaryInput {
	readonly [job: string]: {
		readonly result?: ICheckResult;
		/**
		 * A job's declared outputs. Only `plan-scope` has one this cares
		 * about: the zone plan, which says which jobs this change can
		 * possibly affect.
		 */
		readonly outputs?: Readonly<Record<string, string>>;
	};
}

export interface IValidateSummaryReport {
	readonly ok: boolean;
	readonly total: number;
	readonly passed: number;
	readonly failed: readonly string[];
}

/**
 * The zone plan `plan-scope` published, or `undefined` when it published
 * none. Never throws on a malformed plan: an unreadable plan means no
 * skip can be justified, which fails closed by construction.
 */
const scopePlan = (
	checks: IValidateSummaryInput,
): Readonly<Record<string, unknown>> | undefined => {
	const raw = checks['plan-scope']?.outputs?.['plan'];
	if (raw === undefined || raw.length === 0) return undefined;
	try {
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === 'object' &&
			parsed !== null &&
			!Array.isArray(parsed)
			? (parsed as Readonly<Record<string, unknown>>)
			: undefined;
	} catch {
		return undefined;
	}
};

/**
 * A skip is consent only when something DECIDED it.
 *
 * x00534 S2 pinned that a job which never produced a result must not be
 * read as consent, and it was right: accepting a skip because the jobs
 * beside it passed is still reading absence as agreement, with extra
 * steps. Zone scoping arrived later and creates skips ON PURPOSE, so the
 * two invariants meet here rather than one replacing the other.
 *
 * The resolution is evidence. `plan-scope` publishes, as a job output,
 * which zones this change can possibly affect. A skipped job is accepted
 * ONLY when that plan explicitly says the job is out of scope — that is
 * not absence of evidence, it is a recorded decision naming the job. A
 * skip with no plan behind it, or a plan that says the job WAS in scope,
 * still fails exactly as before.
 */
export const summarizeValidateChecks = (
	checks: IValidateSummaryInput,
): IValidateSummaryReport => {
	const jobs = Object.entries(checks).sort(([left], [right]) =>
		left.localeCompare(right),
	);
	const plan = scopePlan(checks);
	const planned = (job: string): boolean =>
		plan !== undefined && plan[job] === false;

	const failed = jobs
		.filter(
			([job, check]) =>
				check.result !== 'success' &&
				!(check.result === 'skipped' && planned(job)),
		)
		.map(([job, check]) => `${job}=${check.result ?? 'missing'}`);

	// At least one check must have actually RUN and passed. Without it, a
	// plan that excluded everything would report green having verified
	// nothing — the shape of #100, which merged with `changed_files: 0`
	// under a title describing a twenty-two file redesign.
	const succeeded = jobs.filter(
		([, check]) => check.result === 'success',
	).length;
	const verifiedNothing = succeeded === 0 && jobs.length > 0;

	return {
		ok: failed.length === 0 && jobs.length > 0 && !verifiedNothing,
		total: jobs.length,
		passed: jobs.length - failed.length,
		failed:
			verifiedNothing && failed.length === 0
				? ['(every declared check was skipped; nothing was verified)']
				: failed,
	};
};

const formatSummary = (report: IValidateSummaryReport): string => {
	const status = report.ok ? 'passed' : 'FAILED';
	const failures =
		report.failed.length > 0
			? `; failures=${report.failed.join(', ')}`
			: '';
	return `delendai-validate: ${status} (${report.passed}/${report.total} checks)${failures}`;
};

if (import.meta.main) {
	const raw = process.env.CI_NEEDS_JSON;
	if (raw === undefined) {
		console.error('delendai-validate: CI_NEEDS_JSON is required');
		process.exit(2);
	}

	try {
		const report = summarizeValidateChecks(
			JSON.parse(raw) as IValidateSummaryInput,
		);
		const output = formatSummary(report);
		if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
			await Bun.write(process.env.GITHUB_STEP_SUMMARY, `${output}\n`);
		}
		console.log(output);
		process.exit(report.ok ? 0 : 1);
	} catch (error) {
		console.error(
			`delendai-validate: invalid CI_NEEDS_JSON (${error instanceof Error ? error.message : String(error)})`,
		);
		process.exit(2);
	}
}
