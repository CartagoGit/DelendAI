/**
 * workflow-run-jobs.helper.spec.ts — a workflow run's jobs are gathered
 * page after page, and a run larger than the page bound says so.
 */
import { describe, expect, it } from 'vitest';

import { allWorkflowRunJobs } from '../../../src/lib/tools/workflow-run-jobs.helper';

const pages = (sizes: readonly number[], hasMoreAfterLast = false) => {
	const asked: number[] = [];
	return {
		asked,
		client: {
			request: async (request: {
				readonly query: Readonly<Record<string, number>>;
			}) => {
				const page = request.query.page ?? 1;
				asked.push(page);
				const size = sizes[page - 1] ?? 0;
				return {
					data: {
						jobs: Array.from({ length: size }, (_, index) => ({
							id: page * 1000 + index,
						})),
					},
					meta: {
						pagination: {
							hasMore: page < sizes.length || hasMoreAfterLast,
						},
					},
				};
			},
		},
	};
};

describe('allWorkflowRunJobs', () => {
	it('gathers every page until there is no next one', async () => {
		const { client, asked } = pages([100, 100, 7]);
		const result = await allWorkflowRunJobs(client, '/runs/1/jobs');
		expect(result.jobs).toHaveLength(207);
		expect(result.complete).toBe(true);
		expect(asked).toEqual([1, 2, 3]);
	});

	it('says the list is incomplete past the page bound', async () => {
		const { client, asked } = pages(Array(10).fill(100), true);
		const result = await allWorkflowRunJobs(client, '/runs/1/jobs');
		expect(result.jobs).toHaveLength(1000);
		expect(result.complete).toBe(false);
		expect(asked).toHaveLength(10);
	});
});
