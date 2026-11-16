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

describe('cancelling a workflow run on the rehearsal forge', () => {
	it('[<50ms] posts the cancel of the run', async () => {
		const { forge, calls } = forgeAnswering(0, '');
		await forge.cancelRun(7);
		expect(calls[0]).toContain('repos/o/r/actions/runs/7/cancel');
		expect(calls[0]).toContain('POST');
	});

	it('[<50ms] takes a run that already ended as nothing to cancel', async () => {
		const { forge } = forgeAnswering(
			1,
			'HTTP 409: Cannot cancel a workflow run that is completed',
		);
		await expect(forge.cancelRun(7)).resolves.toBeUndefined();
	});
});
