import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import type {
	IRehearsalPullState,
	IRehearsalRun,
} from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import {
	awaitedChecks,
	latestRuns,
	openRuns,
	redCheck,
} from '../../../../src/lib/services/rehearsal-wait.helper';

const pull = fakePartial<IRehearsalPullState>({
	head: 'h',
	headSha: 'sha1',
});

const run = (over: Partial<IRehearsalRun>): IRehearsalRun => ({
	id: 1,
	workflow: 'rehearsal-ci',
	event: 'pull_request',
	headBranch: 'h',
	headSha: 'sha1',
	status: 'completed',
	actor: 'a',
	createdAt: '2026-11-16T04:28:05Z',
	updatedAt: '',
	...over,
});

const older = run({ id: 10, conclusion: 'failure' });
const newer = run({
	id: 11,
	conclusion: 'success',
	createdAt: '2026-11-16T04:28:33Z',
});

describe('the latest run of a workflow on a commit', () => {
	it('[<5ms] supersedes an older failure, whatever order the forge lists them in', () => {
		expect(redCheck([older, newer], pull)).toBeUndefined();
		expect(redCheck([newer, older], pull)).toBeUndefined();
	});

	it('[<5ms] ends red on a newer failure after an older success', () => {
		const failed = run({
			id: 12,
			conclusion: 'failure',
			createdAt: '2026-11-16T04:30:00Z',
		});
		expect(redCheck([newer, failed], pull)?.id).toBe(12);
	});

	it('[<5ms] ends red on a single failure', () => {
		expect(redCheck([older], pull)?.id).toBe(10);
	});

	it('[<5ms] judges two workflows independently', () => {
		const other = run({
			id: 20,
			workflow: 'CodeQL',
			conclusion: 'failure',
		});
		expect(redCheck([older, newer, other], pull)?.workflow).toBe('CodeQL');
	});

	it('[<5ms] breaks a tie on createdAt by the higher run id', () => {
		const a = run({ id: 5, conclusion: 'failure' });
		const b = run({ id: 6, conclusion: 'success' });
		expect(latestRuns([a, b]).map((one) => one.id)).toEqual([6]);
	});

	it('[<5ms] does not call a superseded queued run open', () => {
		const queued = run({
			id: 9,
			status: 'queued',
			createdAt: '2026-11-16T04:00:00Z',
		});
		expect(openRuns([queued, newer])).toEqual([]);
		expect(
			openRuns([
				newer,
				run({
					id: 13,
					status: 'in_progress',
					createdAt: '2026-11-16T05:00:00Z',
				}),
			]),
		).toHaveLength(1);
	});

	it('[<5ms] keeps an awaited merge waiting, not red, behind a superseded failure', async () => {
		const forge = { runs: async () => [older, newer] };
		const checks = await awaitedChecks(forge, new Map([['a', pull]]), [
			'a',
		]);
		expect(checks.red).toBeUndefined();
		expect(checks.concluded).toBe(true);
	});
});
