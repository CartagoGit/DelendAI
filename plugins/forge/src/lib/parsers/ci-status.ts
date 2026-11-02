import { asArray, asRecord, parseJsonInput, stringValue } from './shared';

export interface IForgeCiJob {
	readonly name: string;
	readonly status: string;
	readonly conclusion: string;
	readonly logUrl: string;
}

export interface IForgeCiRun {
	readonly name: string;
	readonly status: string;
	readonly conclusion: string;
	readonly url: string;
	readonly startedAt: string;
	readonly finishedAt: string;
	readonly jobs: readonly IForgeCiJob[];
}

export interface IForgeCiStatus {
	readonly sha: string;
	readonly runs: readonly IForgeCiRun[];
}

const isFailingJob = (job: IForgeCiJob): boolean => {
	const conclusion = job.conclusion.toLowerCase();
	const status = job.status.toLowerCase();
	return (
		[
			'failure',
			'failed',
			'timed_out',
			'cancelled',
			'action_required',
		].includes(conclusion) ||
		['failure', 'failed', 'cancelled'].includes(status)
	);
};

const parseJob = (entry: unknown): IForgeCiJob => {
	const record = asRecord(entry);
	return {
		name: stringValue(record.name, record.stage),
		status: stringValue(record.status),
		conclusion: stringValue(record.conclusion, record.result),
		logUrl: stringValue(
			record.url,
			record.web_url,
			record.log_url,
			record.trace_url,
		),
	};
};

export const parseCiStatus = (input: string | unknown): IForgeCiStatus => {
	const record = asRecord(parseJsonInput(input));
	const runs = asArray(record.runs);
	const jobsByRun = asRecord(record.jobsByRun);
	const failingJobsOnly = record.failingJobsOnly === true;
	const mappedRuns = runs
		.map((runEntry) => {
			const run = asRecord(runEntry);
			const runId = stringValue(run.databaseId, run.id, run.pipeline_id);
			const rawJobs = asRecord(jobsByRun[runId]);
			const jobs = asArray(
				rawJobs.jobs ?? rawJobs.stages ?? rawJobs.jobs_list ?? rawJobs,
			)
				.map(parseJob)
				.filter((job) => job.name.length > 0);
			const filteredJobs = failingJobsOnly
				? jobs.filter(isFailingJob)
				: jobs;
			return {
				name: stringValue(run.workflowName, run.name, run.ref),
				status: stringValue(run.status),
				conclusion: stringValue(run.conclusion, run.result),
				url: stringValue(run.url, run.web_url),
				startedAt: stringValue(
					run.createdAt,
					run.created_at,
					run.started_at,
				),
				finishedAt: stringValue(
					run.updatedAt,
					run.updated_at,
					run.finished_at,
				),
				jobs: filteredJobs,
			};
		})
		.filter((run) => !failingJobsOnly || run.jobs.length > 0);
	const firstRun = asRecord(runs[0]);
	return {
		sha: stringValue(record.sha, firstRun.headSha, firstRun.sha),
		runs: mappedRuns,
	};
};
