/**
 * Binds the `gh`-backed GitHub functions to one repository, as the ports
 * the tools and the error-sink adapter depend on.
 */
import type { IGithubClient } from '../contracts';
import {
	createIssueViaGh,
	fetchIssue,
	listCodeScanningAlerts,
	listDependabotAlerts,
	listIssues,
	listSecretScanningAlerts,
	listSecurityAdvisories,
} from '../github-client';
import type { IGithubClient as IAdapterGithubClient } from './error-sink-adapter';

/** The read port for `repo`; an omitted options object becomes `{}`. */
export const createGithubClient = (repo: string): IGithubClient => ({
	fetchIssue: (number: number) => fetchIssue(repo, number),
	listIssues: (opts) => listIssues(repo, opts ?? {}),
	listDependabotAlerts: (opts) => listDependabotAlerts(repo, opts ?? {}),
	listCodeScanningAlerts: (opts) => listCodeScanningAlerts(repo, opts ?? {}),
	listSecretScanningAlerts: (opts) =>
		listSecretScanningAlerts(repo, opts ?? {}),
	listSecurityAdvisories: (opts) => listSecurityAdvisories(repo, opts ?? {}),
});

/** The issue-creating port the error-sink adapter writes through. */
export const createIssueWriter = (repo: string): IAdapterGithubClient => ({
	createIssue: (input) => createIssueViaGh(repo, input),
});
