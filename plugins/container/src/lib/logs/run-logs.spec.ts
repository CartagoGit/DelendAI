import { describe, expect, it } from 'vitest';

import { runLogs } from './run-logs';

describe('runLogs', () => {
	it('returns parsed lines when docker is present', async () => {
		const calls: readonly string[][] = [];
		const result = await runLogs(
			{
				container: 'api',
				tail: 2,
				since: '2026-07-26T11:59:00Z',
			},
			{
				probeBinary: async () => ({ present: true }),
				exec: async (cmd) => {
					(calls as string[][]).push([...cmd]);
					return {
						stdout: '2026-07-26T12:00:01Z ready\n2026-07-26T12:00:03Z done',
						stderr: '2026-07-26T12:00:02Z warning',
					};
				},
			},
		);

		expect(calls).toEqual([
			[
				'docker',
				'logs',
				'api',
				'--tail',
				'2',
				'--timestamps',
				'--since',
				'2026-07-26T11:59:00Z',
			],
		]);
		expect(result).toEqual({
			kind: 'docker-logs',
			container: 'api',
			lines: [
				{
					timestamp: '2026-07-26T12:00:01.000Z',
					stream: 'stdout',
					message: 'ready',
				},
				{
					timestamp: '2026-07-26T12:00:02.000Z',
					stream: 'stderr',
					message: 'warning',
				},
				{
					timestamp: '2026-07-26T12:00:03.000Z',
					stream: 'stdout',
					message: 'done',
				},
			],
		});
	});

	it('returns skipped with a hint when docker is missing', async () => {
		await expect(
			runLogs(
				{ container: 'api' },
				{
					probeBinary: async () => ({
						present: false,
						hint: 'install docker',
					}),
					exec: async () => ({ stdout: '', stderr: '' }),
				},
			),
		).resolves.toEqual({
			kind: 'skipped',
			hint: 'install docker',
		});
	});
});
