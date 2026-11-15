import { describe, expect, it } from 'vitest';

import type { IRehearsalCommandRunner } from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import { createRehearsalEvidence } from '../../../../src/lib/services/rehearsal-evidence.service';

const TIP = 'a'.repeat(40);

const setup = (
	runs: readonly { id: number; head_sha: string; created_at: string }[],
	artifacts: Record<number, readonly { name: string; expired?: boolean }[]>,
) => {
	const downloads: [number, string][] = [];
	const gh: IRehearsalCommandRunner = async (args) => {
		const path = args[1] ?? '';
		if (path.includes('/workflows/rehearsal.yml/runs'))
			return {
				exitCode: 0,
				stdout: JSON.stringify({ workflow_runs: runs }),
				stderr: '',
			};
		const id = Number(/runs\/(\d+)\/artifacts/u.exec(path)?.[1]);
		return {
			exitCode: 0,
			stdout: JSON.stringify({ artifacts: artifacts[id] ?? [] }),
			stderr: '',
		};
	};
	const evidence = createRehearsalEvidence({
		slug: 'o/p',
		run: gh,
		download: async (id, name) => {
			downloads.push([id, name]);
			return JSON.stringify({ tip: TIP, run: id });
		},
	});
	return { evidence, downloads };
};

describe('rehearsal evidence', () => {
	it('[<50ms] takes the latest run of the commit that kept the mode report', async () => {
		const { evidence, downloads } = setup(
			[
				{ id: 1, head_sha: TIP, created_at: '2026-01-01T00:00:00Z' },
				{ id: 2, head_sha: TIP, created_at: '2026-01-02T00:00:00Z' },
				{
					id: 3,
					head_sha: 'b'.repeat(40),
					created_at: '2026-01-03T00:00:00Z',
				},
			],
			{
				1: [{ name: 'rehearsal-report-real' }],
				2: [{ name: 'rehearsal-report-fast' }],
				3: [{ name: 'rehearsal-report-real' }],
			},
		);
		expect(await evidence.reportOf('real', TIP)).toMatchObject({ run: 1 });
		expect(downloads).toEqual([[1, 'rehearsal-report-real']]);
	});

	it('[<50ms] has no report when the artifact expired or no run holds it', async () => {
		const { evidence } = setup(
			[{ id: 1, head_sha: TIP, created_at: '2026-01-01T00:00:00Z' }],
			{ 1: [{ name: 'rehearsal-report-fast', expired: true }] },
		);
		expect(await evidence.reportOf('fast', TIP)).toBeUndefined();
	});

	it('[<50ms] says what the forge refused', async () => {
		const evidence = createRehearsalEvidence({
			slug: 'o/p',
			run: async () => ({ exitCode: 1, stdout: '', stderr: 'HTTP 403' }),
			download: async () => undefined,
		});
		await expect(evidence.reportOf('fast', TIP)).rejects.toThrow(
			/HTTP 403/u,
		);
	});

	it('[<50ms] skips a run whose artifact cannot be downloaded', async () => {
		const evidence = createRehearsalEvidence({
			slug: 'o/p',
			run: async (args) => ({
				exitCode: 0,
				stdout: (args[1] ?? '').includes('/artifacts')
					? JSON.stringify({
							artifacts: [{ name: 'rehearsal-report-fast' }],
						})
					: JSON.stringify({
							workflow_runs: [
								{
									id: 1,
									head_sha: TIP,
									created_at: '2026-01-01T00:00:00Z',
								},
							],
						}),
				stderr: '',
			}),
			download: async () => undefined,
		});
		expect(await evidence.reportOf('fast', TIP)).toBeUndefined();
	});
});
