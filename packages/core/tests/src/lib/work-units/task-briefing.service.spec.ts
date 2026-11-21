import { afterEach, describe, expect, it } from 'vitest';

import { TASK_FLOW } from '@delendai/core/lib/contracts/constants/task-briefing.constant';
import {
	describeTaskBriefing,
	registerTaskBriefingProvider,
	registerTaskReachProvider,
	taskBriefingFor,
} from '@delendai/core/lib/work-units/task-briefing.service';

const request = { worktree: '/w', proposal: 'f1', slice: 'S1' };
const task = {
	goal: 'g',
	slices: [{ id: 'S1', title: 't', acceptance: ['a'] }],
	files: [{ path: 'a.ts', bytes: 3 }, { path: 'b.ts' }],
	specs: ['a.spec.ts'],
};

afterEach(() => {
	registerTaskBriefingProvider(undefined);
	registerTaskReachProvider(undefined);
});

describe('the task briefing', () => {
	it('[<20ms] is nothing without a provider', async () => {
		expect(await taskBriefingFor(request)).toBeUndefined();
	});

	it('[<20ms] comes from the provider', async () => {
		registerTaskBriefingProvider(async () => task);
		registerTaskReachProvider(async () => undefined);
		expect(await taskBriefingFor(request)).toEqual({
			...task,
			consumers: [],
			flow: TASK_FLOW,
		});
	});

	it('[<20ms] adds consumers and specs from the graph, capped', async () => {
		registerTaskBriefingProvider(async () => task);
		const many = Array.from({ length: 30 }, (_, i) => `c${String(i)}.ts`);
		registerTaskReachProvider(async (_worktree, files) => {
			expect(files).toEqual(['a.ts', 'b.ts']);
			return { consumers: many, specs: ['x.spec.ts', 'a.spec.ts'] };
		});
		const out = await taskBriefingFor(request);
		expect(out?.consumers).toEqual(many.slice(0, 20));
		expect(out?.specs).toEqual(['a.spec.ts', 'x.spec.ts']);
	});

	it('[<20ms] survives a graph that fails', async () => {
		registerTaskBriefingProvider(async () => task);
		registerTaskReachProvider(async () => {
			throw new Error('no graph');
		});
		expect((await taskBriefingFor(request))?.specs).toEqual(task.specs);
	});

	it('[<20ms] never fails an entry', async () => {
		registerTaskBriefingProvider(async () => {
			throw new Error('unreadable');
		});
		expect(await taskBriefingFor(request)).toBeUndefined();
	});

	it('[<20ms] reads to a person', () => {
		expect(
			describeTaskBriefing({
				...task,
				consumers: ['u.ts'],
				flow: TASK_FLOW,
			}).join('\n'),
		).toMatch(
			/task +g[\s\S]*S1: t[\s\S]*a\.ts \(3 B\)[\s\S]*b\.ts \(new\)[\s\S]*consumer u\.ts[\s\S]*spec a\.spec\.ts[\s\S]*work deliver/u,
		);
	});
});
