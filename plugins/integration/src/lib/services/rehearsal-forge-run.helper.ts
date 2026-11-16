/**
 * rehearsal-forge-run.helper.ts — the workflow runs and check runs as the
 * forge's REST API lists them (see the raw interfaces), as the shapes a
 * rehearsal reads them as.
 */
import type {
	IRawCheckRun,
	IRawRun,
} from '../contracts/interfaces/rehearsal-forge-raw.interface';
import type {
	IRehearsalCheckRun,
	IRehearsalRun,
} from '../contracts/interfaces/rehearsal.interface';

export const toRun = (entry: IRawRun): IRehearsalRun => ({
	id: entry.id,
	workflow: entry.name ?? '',
	...(entry.workflow_id === undefined
		? {}
		: { workflowId: entry.workflow_id }),
	event: entry.event,
	headBranch: entry.head_branch ?? '',
	headSha: entry.head_sha,
	status: entry.status ?? '',
	...(entry.conclusion ? { conclusion: entry.conclusion } : {}),
	actor: entry.actor?.login ?? '',
	createdAt: entry.created_at,
	updatedAt: entry.updated_at,
});

export const toCheckRun = (entry: IRawCheckRun): IRehearsalCheckRun => ({
	id: entry.id,
	name: entry.name,
	headSha: entry.head_sha,
	status: entry.status ?? '',
	...(entry.conclusion ? { conclusion: entry.conclusion } : {}),
	startedAt: entry.started_at ?? '',
});
