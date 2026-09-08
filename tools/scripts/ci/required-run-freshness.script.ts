#!/usr/bin/env bun

export type TRequiredRunResult =
	| 'success'
	| 'failure'
	| 'cancelled'
	| 'skipped'
	| string;

export interface IRequiredRunInput {
	readonly [job: string]: {
		readonly result?: TRequiredRunResult;
	};
}

export interface IRequiredRunReport {
	readonly ok: boolean;
	readonly total: number;
	readonly executed: number;
	readonly missing: readonly string[];
	readonly notSuccessful: readonly string[];
}

export const evaluateRequiredRuns = (
	checks: IRequiredRunInput,
): IRequiredRunReport => {
	const jobs = Object.entries(checks).sort(([left], [right]) =>
		left.localeCompare(right),
	);
	const missing = jobs
		.filter(([, check]) => check.result === undefined)
		.map(([job]) => job);
	const notSuccessful = jobs
		.filter(
			([, check]) =>
				check.result !== undefined && check.result !== 'success',
		)
		.map(([job, check]) => `${job}=${check.result}`);

	return {
		ok: jobs.length > 0 && missing.length === 0 && notSuccessful.length === 0,
		total: jobs.length,
		executed: jobs.length - missing.length,
		missing,
		notSuccessful,
	};
};

const formatReport = (report: IRequiredRunReport): string => {
	const failures = [
		...report.missing.map((job) => `${job}=not-executed`),
		...report.notSuccessful,
	];
	return `required-run-freshness: ${report.ok ? 'passed' : 'FAILED'} (${report.executed}/${report.total} executed)${failures.length > 0 ? `; failures=${failures.join(', ')}` : ''}`;
};

if (import.meta.main) {
	const raw = process.env.CI_NEEDS_JSON;
	if (raw === undefined) {
		console.error('required-run-freshness: CI_NEEDS_JSON is required');
		process.exit(2);
	}

	try {
		const report = evaluateRequiredRuns(JSON.parse(raw) as IRequiredRunInput);
		const output = formatReport(report);
		if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
			await Bun.write(process.env.GITHUB_STEP_SUMMARY, `${output}\n`);
		}
		console.log(output);
		process.exit(report.ok ? 0 : 1);
	} catch (error) {
		console.error(
			`required-run-freshness: invalid CI_NEEDS_JSON (${error instanceof Error ? error.message : String(error)})`,
		);
		process.exit(2);
	}
}
