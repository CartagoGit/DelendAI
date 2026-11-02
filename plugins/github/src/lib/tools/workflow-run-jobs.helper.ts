/**
 * workflow-run-jobs.helper.ts — every job of a workflow run, page after
 * page, and whether any was left past the page bound.
 */
import z from 'zod';

import {
	GITHUB_JOBS_PER_PAGE,
	GITHUB_MAX_JOB_PAGES,
} from '../contracts/constants/github-paging.constant';
import type { IPagedRequester } from '../contracts/interfaces/paged-request.interface';

export const allWorkflowRunJobs = async (
	client: IPagedRequester,
	path: string,
): Promise<{
	readonly jobs: readonly unknown[];
	readonly complete: boolean;
}> => {
	const jobs: unknown[] = [];
	for (let page = 1; page <= GITHUB_MAX_JOB_PAGES; page += 1) {
		const result = await client.request({
			path,
			query: { per_page: GITHUB_JOBS_PER_PAGE, page },
			responseSchema: z.record(z.string(), z.unknown()),
		});
		// A body that is not an object lists no jobs.
		const listed =
			typeof result.data === 'object' && result.data !== null
				? (result.data as Readonly<Record<string, unknown>>).jobs
				: undefined;
		const batch = Array.isArray(listed) ? listed : [];
		jobs.push(...batch);
		const more =
			result.meta.pagination?.hasMore ??
			batch.length === GITHUB_JOBS_PER_PAGE;
		if (!more) return { jobs, complete: true };
	}
	return { jobs, complete: false };
};
