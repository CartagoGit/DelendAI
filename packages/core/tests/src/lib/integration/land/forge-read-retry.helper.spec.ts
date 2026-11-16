/**
 * forge-read-retry.helper.spec.ts — a forge GET survives a transient server
 * error or dropped connection; writes and 4xx answers are never retried.
 */
import { describe, expect, it } from 'vitest';

import { runForgeRead } from '@delendai/core/lib/integration/land/forge-read-retry.helper';
import type { ILandCommandRunner } from '@delendai/core/lib/integration/land/land.interface';

type IForgeRunResult = Awaited<ReturnType<ILandCommandRunner>>;

const fail = (stderr: string): IForgeRunResult => ({
	exitCode: 1,
	stdout: '',
	stderr,
});
const ok: IForgeRunResult = { exitCode: 0, stdout: '{}', stderr: '' };

const run = (method: string, answers: IForgeRunResult[]) => {
	const waits: number[] = [];
	let calls = 0;
	return {
		waits,
		calls: () => calls,
		done: runForgeRead({
			method,
			wait: async (ms) => {
				waits.push(ms);
			},
			once: async () => answers[Math.min(calls++, answers.length - 1)]!,
		}),
	};
};

describe('runForgeRead', () => {
	it('[<5ms] succeeds after one wait of 1000 ms when a 504 is followed by a 200', async () => {
		const r = run('GET', [fail('gh: HTTP 504'), ok]);
		const out = await r.done;
		expect(out.result).toBe(ok);
		expect(out.attempts).toBe(2);
		expect(r.waits).toEqual([1000]);
	});

	it('[<5ms] gives up after four 504s, waiting 1000, 3000 and 9000 ms', async () => {
		const r = run('GET', [fail('gh: HTTP 504')]);
		const out = await r.done;
		expect(out.exhausted).toBe(true);
		expect(out.attempts).toBe(4);
		expect(r.waits).toEqual([1000, 3000, 9000]);
	});

	it('[<5ms] does not retry a 404', async () => {
		const r = run('GET', [fail('gh: HTTP 404')]);
		const out = await r.done;
		expect(out.attempts).toBe(1);
		expect(out.exhausted).toBe(false);
		expect(r.waits).toEqual([]);
	});

	it('[<5ms] does not retry a POST answering 504', async () => {
		const r = run('POST', [fail('gh: HTTP 504')]);
		const out = await r.done;
		expect(out.attempts).toBe(1);
		expect(r.calls()).toBe(1);
		expect(r.waits).toEqual([]);
	});

	it('[<5ms] retries a GET reset by the connection', async () => {
		const r = run('GET', [fail('read ECONNRESET'), ok]);
		expect((await r.done).attempts).toBe(2);
		expect(r.waits).toEqual([1000]);
	});
});
