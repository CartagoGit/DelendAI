import { describe, expect, it } from 'vitest';

import type { IRehearsalCommandRunner } from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import { createGithubRehearsalForge } from '../../../../src/lib/services/rehearsal-github-forge.service';

const noWait = async (): Promise<void> => undefined;

const forgeAnswering = (exitCode: number, stderr: string) => {
	const calls: (readonly string[])[] = [];
	const run: IRehearsalCommandRunner = async (args) => {
		calls.push(args);
		return { exitCode, stdout: '{}', stderr };
	};
	return {
		calls,
		forge: createGithubRehearsalForge({ slug: 'o/r', run, wait: noWait }),
	};
};

describe('the rehearsal forge reads a workflow run', () => {
	it('[<50ms] posts the cancel of the run', async () => {
		const { forge, calls } = forgeAnswering(0, '');
		expect(await forge.cancelRun(7)).toBe('cancelled');
		expect(calls[0]).toContain('repos/o/r/actions/runs/7/cancel');
		expect(calls[0]).toContain('POST');
	});

	it('[<50ms] takes a run that already ended as nothing to cancel', async () => {
		const { forge } = forgeAnswering(
			1,
			'HTTP 409: Cannot cancel a workflow run that is completed',
		);
		expect(await forge.cancelRun(7)).toBe('ended');
	});

	it('[<50ms] tells a run the forge never enqueued from one that ended', async () => {
		const { forge } = forgeAnswering(
			1,
			'gh: Cannot cancel a workflow run that has not been queued yet. (HTTP 409)',
		);
		expect(await forge.cancelRun(7)).toBe('unstarted');
	});

	it('[<50ms] counts the jobs of a run', async () => {
		const run: IRehearsalCommandRunner = async () => ({
			exitCode: 0,
			stdout: '{"total_count":0,"jobs":[]}',
			stderr: '',
		});
		const forge = createGithubRehearsalForge({
			slug: 'o/r',
			run,
			wait: noWait,
		});
		expect(await forge.jobCount(7)).toBe(0);
	});

	it('[<50ms] reopens a pull request by patching its state', async () => {
		const { forge, calls } = forgeAnswering(0, '');
		await forge.reopenPull(9);
		expect(calls[0]).toContain('repos/o/r/pulls/9');
		expect(calls[0]).toContain('state=open');
	});
});
