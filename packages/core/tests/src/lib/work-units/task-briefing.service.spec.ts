import { afterEach, describe, expect, it } from 'vitest';

import {
	describeTaskBriefing,
	registerTaskBriefingProvider,
	taskBriefingFor,
} from '@delendai/core/lib/work-units/task-briefing.service';

const request = { worktree: '/w', proposal: 'f1', slice: 'S1' };
const task = {
	goal: 'g',
	slices: [{ id: 'S1', title: 't', acceptance: ['a'] }],
	files: [{ path: 'a.ts', bytes: 3 }, { path: 'b.ts' }],
	specs: ['a.spec.ts'],
};

afterEach(() => registerTaskBriefingProvider(undefined));

describe('the task briefing', () => {
	it('is nothing without a provider', async () => {
		expect(await taskBriefingFor(request)).toBeUndefined();
	});

	it('comes from the provider', async () => {
		registerTaskBriefingProvider(async () => task);
		expect(await taskBriefingFor(request)).toEqual(task);
	});

	it('never fails an entry', async () => {
		registerTaskBriefingProvider(async () => {
			throw new Error('unreadable');
		});
		expect(await taskBriefingFor(request)).toBeUndefined();
	});

	it('reads to a person', () => {
		expect(describeTaskBriefing(task).join('\n')).toMatch(
			/task +g[\s\S]*S1: t[\s\S]*a\.ts \(3 B\)[\s\S]*b\.ts \(new\)[\s\S]*spec a\.spec\.ts/u,
		);
	});
});
