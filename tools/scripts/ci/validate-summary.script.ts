#!/usr/bin/env bun

export type TCheckResult =
	| 'success'
	| 'failure'
	| 'cancelled'
	| 'skipped'
	| string;

export interface IValidateSummaryInput {
	readonly [job: string]: {
		readonly result?: TCheckResult;
	};
}

export interface IValidateSummaryReport {
	readonly ok: boolean;
	readonly total: number;
	readonly passed: number;
	readonly failed: readonly string[];
}

export const summarizeValidateChecks = (
	checks: IValidateSummaryInput
): IValidateSummaryReport => {
	const jobs = Object.entries(checks).sort(([left], [right]) =>
		left.localeCompare(right)
	);
	const failed = jobs
		.filter(([, check]) => check.result !== 'success')
		.map(([job, check]) => `${job}=${check.result ?? 'missing'}`);

	return {
		ok: failed.length === 0 && jobs.length > 0,
		total: jobs.length,
		passed: jobs.length - failed.length,
		failed,
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
			JSON.parse(raw) as IValidateSummaryInput
		);
		const output = formatSummary(report);
		if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
			await Bun.write(process.env.GITHUB_STEP_SUMMARY, `${output}\n`);
		}
		console.log(output);
		process.exit(report.ok ? 0 : 1);
	} catch (error) {
		console.error(
			`delendai-validate: invalid CI_NEEDS_JSON (${error instanceof Error ? error.message : String(error)})`
		);
		process.exit(2);
	}
}
