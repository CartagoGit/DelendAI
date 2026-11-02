import { describe, expect, it } from 'vitest';

import type {
	IEnvironmentLogEntry,
	ILifecycleEnvironment,
} from '../src/lib/contracts/interfaces/execution-env-lifecycle.interface';
import { runInExecutionEnvironment } from '../src/lib/services/execution-env.service';

const fakeEnvironment = (
	prepare: ILifecycleEnvironment['prepare'],
	calls: string[],
): ILifecycleEnvironment => ({
	id: 'fake',
	prepare: async () => {
		calls.push('prepare');
		return prepare();
	},
	teardown: async () => {
		calls.push('teardown');
		return { ok: true };
	},
});

const clock = (): (() => number) => {
	let t = 0;
	return () => {
		t += 10;
		return t;
	};
};

describe('runInExecutionEnvironment', () => {
	it('prepares, runs the slice, tears down and logs both durations', async () => {
		const calls: string[] = [];
		const env = fakeEnvironment(async () => ({ ok: true }), calls);
		const seen: IEnvironmentLogEntry[] = [];
		const outcome = await runInExecutionEnvironment(
			env,
			async () => {
				calls.push('slice');
				return 42;
			},
			{ now: clock(), onLog: (entry) => seen.push(entry) },
		);
		expect(calls).toEqual(['prepare', 'slice', 'teardown']);
		expect(outcome).toMatchObject({ started: true, result: 42 });
		expect(outcome.failure).toBeUndefined();
		expect(outcome.log.map((e) => [e.phase, e.durationMs, e.ok])).toEqual([
			['prepare', 10, true],
			['teardown', 10, true],
		]);
		expect(seen).toEqual(outcome.log);
	});

	it('never starts the slice when prepare fails', async () => {
		const calls: string[] = [];
		const env = fakeEnvironment(
			async () => ({ ok: false, reason: 'image missing' }),
			calls,
		);
		const outcome = await runInExecutionEnvironment(env, async () => {
			calls.push('slice');
			return 1;
		});
		expect(calls).toEqual(['prepare', 'teardown']);
		expect(outcome.started).toBe(false);
		expect(outcome.failure).toContain('image missing');
	});

	it('treats a prepare that throws as a failure, not a crash', async () => {
		const calls: string[] = [];
		const env = fakeEnvironment(async () => {
			throw new Error('daemon down');
		}, calls);
		const outcome = await runInExecutionEnvironment(env, async () => 1);
		expect(outcome.started).toBe(false);
		expect(outcome.failure).toContain('daemon down');
		expect(outcome.log[0]).toMatchObject({
			ok: false,
			reason: 'daemon down',
		});
	});

	it('still tears down when the slice throws', async () => {
		const calls: string[] = [];
		const env = fakeEnvironment(async () => ({ ok: true }), calls);
		const outcome = await runInExecutionEnvironment(env, async () => {
			throw new Error('boom');
		});
		expect(calls).toEqual(['prepare', 'teardown']);
		expect(outcome).toMatchObject({ started: true, failure: 'boom' });
	});

	it('reports a teardown that fails after a good slice', async () => {
		const env: ILifecycleEnvironment = {
			id: 'fake',
			prepare: async () => ({ ok: true }),
			teardown: async () => ({ ok: false, reason: 'busy' }),
		};
		const outcome = await runInExecutionEnvironment(env, async () => 'x');
		expect(outcome.result).toBe('x');
		expect(outcome.failure).toContain('busy');
	});
});
