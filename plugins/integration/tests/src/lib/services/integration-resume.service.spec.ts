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

	it('[<50ms] reads every page of open pull requests', async () => {
		let page = 0;
		const forge = createGithubResumeForge({
			slug: 'o/p',
			run: async () => {
				page += 1;
				const count = page === 1 ? 100 : 1;
				return {
					exitCode: 0,
					stdout: JSON.stringify(
						Array.from({ length: count }, (_, i) => ({
							number: page * 1000 + i,
							node_id: 'N',
						})),
					),
					stderr: '',
				};
			},
		});
		const pulls = await forge.openPulls('develop');
		expect(pulls).toHaveLength(101);
		expect(pulls[0]?.labels).toEqual([]);
	});

	it('[<50ms] says what gh refused', async () => {
		const forge = createGithubResumeForge({
			slug: 'o/p',
			run: async () => ({ exitCode: 1, stdout: '', stderr: 'HTTP 403' }),
		});
		await expect(forge.openPulls('develop')).rejects.toThrow(/HTTP 403/u);
		await expect(forge.removeLabel(1, 'x')).rejects.toThrow(/HTTP 403/u);
	});
});
