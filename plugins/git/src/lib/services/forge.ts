/**
 * forge.ts — the git plugin's opt-in `pr_list` / `pr_view` read model. The
 * forge plugin is the one authority that reads pull requests (provider
 * detection, `gh`/`glab` argv, parsing, auth remediation); this file only
 * maps its result onto the git tools' stable output shapes, so a fix to a
 * PR parser lands once.
 *
 * Network-gated + opt-in by the caller (registered only under
 * `allowForge: true`) and credential-free: it inherits the user's CLI auth.
 */
import {
	listPullRequests,
	showPullRequest,
	type IForgeExec,
	type IForgeFailure,
} from '@delendai/forge/public';

import type {
	IForgeList,
	IForgeView,
} from '../contracts/interfaces/forge.interface';

const isCliAbsent = (failure: IForgeFailure): boolean =>
	failure.error.reason.endsWith('is not available on PATH');

const noteOf = (failure: IForgeFailure): string =>
	[failure.error.reason, failure.error.remediation]
		.filter((part): part is string => part !== undefined && part !== '')
		.join(' - ');

/** List open pull requests through the forge plugin. Read-only; never throws. */
export const listOpenPrs = async (
	cwd: string,
	exec?: IForgeExec,
): Promise<IForgeList> => {
	const result = await listPullRequests(cwd, exec);
	if (!result.ok) {
		return { available: false, note: noteOf(result), prs: [] };
	}
	return {
		available: true,
		prs: result.data.prs.map((pr) => ({
			number: pr.number,
			title: pr.title,
			branch: pr.branch,
			url: pr.url,
			draft: pr.draft,
		})),
	};
};

/**
 * View a pull request (+ CI check rollup) through the forge plugin. `ref`
 * may be a PR number, branch, or url; omit it to use the current branch's
 * PR. Read-only; never throws.
 */
export const viewPr = async (
	cwd: string,
	ref?: string,
	exec?: IForgeExec,
): Promise<IForgeView> => {
	const result = await showPullRequest(cwd, ref, exec);
	if (!result.ok) {
		return { available: !isCliAbsent(result), note: noteOf(result) };
	}
	const { pr } = result.data;
	return {
		available: true,
		pr: {
			number: pr.number,
			title: pr.title,
			state: pr.state,
			url: pr.url,
			mergeable: pr.mergeable,
			reviewDecision: pr.reviewDecision,
			checks: pr.checks.map((check) => ({ ...check })),
		},
	};
};
