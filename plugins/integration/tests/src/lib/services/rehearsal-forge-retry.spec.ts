import { describe, expect, it } from 'vitest';

import type { IRehearsalCommandRunner } from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import { createGithubRehearsalForge } from '../../../../src/lib/services/rehearsal-github-forge.service';

describe('a read that fails transiently', () => {
	const answering = (answers: readonly { code: number; text?: string }[]) => {
		const waits: number[] = [];
		let n = 0;
		const run: IRehearsalCommandRunner = async () => {
			const answer = answers[Math.min(n, answers.length - 1)];
			n += 1;
			return answer?.code === 200
				? {
						exitCode: 0,
						stdout: '{"object":{"sha":"s1"}}',
						stderr: '',
					}
				: {
						exitCode: 1,
						stdout: '',
						stderr:
							answer?.text ?? `gh: HTTP ${String(answer?.code)}`,
					};
		};
		return {
			waits,
			calls: () => n,
			forge: createGithubRehearsalForge({
				slug: 'o/r',
				run,
				wait: async (ms) => void waits.push(ms),
			}),
		};
	};

	it('[<50ms] is asked again once after a 504 and then succeeds', async () => {
		const { forge, waits, calls } = answering([
			{ code: 504 },
			{ code: 200 },
		]);
		expect(await forge.tipOf('a')).toBe('s1');
		expect(calls()).toBe(2);
		expect(waits).toEqual([1_000]);
	});

	it('[<50ms] fails after four attempts, waiting 1, 3 and 9 seconds, and says so', async () => {
		const { forge, waits, calls } = answering([{ code: 504 }]);
		await expect(forge.tipOf('a')).rejects.toThrow(
			/HTTP 504.*\(4 attempts\)/u,
		);
		expect(calls()).toBe(4);
		expect(waits).toEqual([1_000, 3_000, 9_000]);
	});

	it('[<50ms] retries a connection reset', async () => {
		const { forge, calls } = answering([
			{ code: 1, text: 'read tcp: ECONNRESET' },
			{ code: 200 },
		]);
		expect(await forge.tipOf('a')).toBe('s1');
		expect(calls()).toBe(2);
	});

	it('[<50ms] never retries a 4xx', async () => {
		const { forge, waits, calls } = answering([{ code: 403 }]);
		await expect(forge.tipOf('a')).rejects.toThrow(/HTTP 403/u);
		expect(calls()).toBe(1);
		expect(waits).toEqual([]);
	});

	it('[<50ms] never retries a write', async () => {
		const { forge, waits, calls } = answering([{ code: 504 }]);
		await expect(forge.createBranch('b', 'sha')).rejects.toThrow(
			/HTTP 504/u,
		);
		expect(calls()).toBe(1);
		expect(waits).toEqual([]);
	});
});
