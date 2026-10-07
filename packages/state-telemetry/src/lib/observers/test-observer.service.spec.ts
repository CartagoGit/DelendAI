import { describe, expect, it } from 'vitest';

import { asWorkItemId, type INewWorkEvent } from '../events/work-event';
import { normalizeFailureMessage } from './failure-normalizer.helper';
import { TestObserver } from './test-observer.service';

const makeSink = () => {
	const events: INewWorkEvent[] = [];
	return {
		events,
		append: async (event: INewWorkEvent): Promise<void> => {
			events.push(event);
		},
	};
};

const make = (rootDir = '/repo') => {
	const sink = makeSink();
	let clock = 100;
	const observer = new TestObserver({
		workItemId: asWorkItemId('f00509/S3'),
		actorId: 'agent',
		sink,
		rootDir,
		now: () => clock++,
	});
	return { sink, observer };
};

const run = { id: 'r1', command: 'vitest run' };

describe('TestObserver (f00509 S3)', () => {
	it('emits test_started then test_finished for a run that ran tests', async () => {
		const { sink, observer } = make();
		observer.started(run);
		observer.finished(run, { passed: 3, failed: 0 });
		await observer.idle();
		expect(sink.events.map((e) => e.kind)).toEqual([
			'test_started',
			'test_finished',
		]);
		expect(sink.events[0]?.created_at).toBe(100);
		expect(sink.events[0]?.payload_hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('emits nothing for a run with zero tests', async () => {
		const { sink, observer } = make();
		observer.started(run);
		observer.finished(run, { passed: 0, failed: 0 });
		await observer.idle();
		expect(sink.events).toEqual([]);
	});

	it('hashes the same failure equally despite volatile noise', () => {
		const { observer } = make();
		const a = observer.failureHash({
			path: '/repo/src/a.spec.ts',
			message:
				'\u001b[31mAssertionError\u001b[0m: expected 1 to be 2 (12ms) at /repo/src/a.spec.ts:10:5',
		});
		const b = observer.failureHash({
			path: 'src/a.spec.ts',
			message:
				'AssertionError:  expected 1 to be 2 (340ms)\n at src/a.spec.ts:44:9',
		});
		const other = observer.failureHash({
			path: 'src/a.spec.ts',
			message: 'AssertionError: expected 1 to be 3',
		});
		expect(a).toBe(b);
		expect(a).not.toBe(other);
	});

	it('gives two runs failing for the same cause the same finish hash', async () => {
		const first = make();
		const second = make();
		for (const [ctx, ms] of [
			[first, 5],
			[second, 900],
		] as const) {
			ctx.observer.started(run);
			ctx.observer.finished(run, {
				passed: 1,
				failed: 1,
				firstFailure: {
					path: 'a.spec.ts',
					message: `boom took ${ms}ms`,
				},
			});
			await ctx.observer.idle();
		}
		expect(first.sink.events[1]?.payload_hash).toBe(
			second.sink.events[1]?.payload_hash,
		);
	});

	it('never throws when the sink rejects', async () => {
		const observer = new TestObserver({
			workItemId: asWorkItemId('f00509/S3'),
			actorId: null,
			sink: {
				append: async () => {
					throw new Error('down');
				},
			},
		});
		expect(() => {
			observer.started(run);
			observer.finished(run, { passed: 1, failed: 0 });
		}).not.toThrow();
		await expect(observer.idle()).resolves.toBeUndefined();
	});
});

describe('normalizeFailureMessage', () => {
	it('strips ANSI, root paths, line:col, durations, timestamps and whitespace', () => {
		expect(
			normalizeFailureMessage(
				'\u001b[1mFAIL\u001b[0m /repo/a.ts:3:4   at 2026-01-02T03:04:05Z  took 1.5s',
				{ rootDir: '/repo' },
			),
		).toBe('FAIL a.ts at <n> took <n>');
	});
});
