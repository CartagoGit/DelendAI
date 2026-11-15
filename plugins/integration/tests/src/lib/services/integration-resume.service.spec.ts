import { describe, expect, it } from 'vitest';

import type { IResumeForge } from '../../../../src/lib/contracts/interfaces/integration-resume.interface';
import type { IRehearsalCommandRunner } from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import {
	createGithubResumeForge,
	pausedLabel,
	resumeIntegration,
} from '../../../../src/lib/services/integration-resume.service';

describe('integration resume', () => {
	it('[<50ms] readies and unlabels only the paused pull requests', async () => {
		const done: string[] = [];
		const forge: IResumeForge = {
			openPulls: async () => [
				{ number: 1, nodeId: 'n1', labels: ['delendai:paused'] },
				{ number: 2, nodeId: 'n2', labels: ['other'] },
				{ number: 3, nodeId: 'n3', labels: [] },
			],
			markReady: async (pull) => {
				done.push(`ready ${String(pull.number)}`);
			},
			removeLabel: async (number, label) => {
				done.push(`unlabel ${String(number)} ${label}`);
			},
		};
		expect(
			await resumeIntegration({
				forge,
				base: 'develop',
				prefix: 'delendai',
			}),
		).toEqual([1]);
		expect(done).toEqual(['ready 1', 'unlabel 1 delendai:paused']);
		expect(pausedLabel('acme')).toBe('acme:paused');
	});

	it('[<50ms] speaks to GitHub through gh: open pulls, the ready mutation, the label delete', async () => {
		const calls: string[] = [];
		const gh: IRehearsalCommandRunner = async (args) => {
			calls.push(args.join(' '));
			return {
				exitCode: 0,
				stdout: JSON.stringify([
					{
						number: 7,
						node_id: 'N7',
						labels: [{ name: 'delendai:paused' }],
					},
				]),
				stderr: '',
			};
		};
		const forge = createGithubResumeForge({ slug: 'o/p', run: gh });
		const [pull] = await forge.openPulls('develop');
		expect(pull).toEqual({
			number: 7,
			nodeId: 'N7',
			labels: ['delendai:paused'],
		});
		await forge.markReady(pull!);
		await forge.removeLabel(7, 'delendai:paused');
		expect(calls[0]).toContain('repos/o/p/pulls?state=open&base=develop');
		expect(calls[1]).toContain('markPullRequestReadyForReview');
		expect(calls[1]).toContain('id=N7');
		expect(calls[2]).toBe(
			'api --method DELETE repos/o/p/issues/7/labels/delendai%3Apaused',
		);
	});
});
