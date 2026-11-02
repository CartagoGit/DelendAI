import { describe, expect, it } from 'vitest';

import {
	createValidationCoordinator,
	type IValidationOutcome,
	type IValidationRequest,
} from '../../../../src/lib/services/validation-coordinator.service';
import {
	recordEvidence,
	type IEvidenceStore,
	type IValidationEvidence,
	type IValidationEvidenceKey,
} from '../../../../src/lib/services/validation-evidence.service';

const key = (
	partial: Partial<IValidationEvidenceKey> = {},
): IValidationEvidenceKey => ({
	validator: 'test',
	scope: 'packages/core',
	inputDigest: 'input-1',
	configDigest: 'config-1',
	dependencyDigest: 'deps-1',
	...partial,
});

const memoryStore = (): IEvidenceStore & {
	readonly entries: Map<string, IValidationEvidence>;
} => {
	const entries = new Map<string, IValidationEvidence>();
	return {
		entries,
		read: async (hash) => entries.get(hash),
		write: async (hash, value) => {
			entries.set(hash, value);
		},
	};
};

/** A validator whose completion the test controls, counting its calls. */
const controllable = () => {
	let calls = 0;
	let release: ((outcome: IValidationOutcome) => void) | undefined;
	let fail: ((error: Error) => void) | undefined;
	const started: Promise<void>[] = [];
	let markStarted: (() => void) | undefined;
	const firstStart = new Promise<void>((resolve) => {
		markStarted = resolve;
	});
	started.push(firstStart);
	return {
		get calls() {
			return calls;
		},
		firstStart,
		execute: async (): Promise<IValidationOutcome> => {
			calls += 1;
			markStarted?.();
			return new Promise<IValidationOutcome>((resolve, reject) => {
				release = resolve;
				fail = reject;
			});
		},
		finish: (outcome: IValidationOutcome) => release?.(outcome),
		throw: (error: Error) => fail?.(error),
	};
};

const request = (
	execute: () => Promise<IValidationOutcome>,
	partial: Partial<IValidationRequest> = {},
): IValidationRequest => ({
	key: key(),
	relevantInputs: ['packages/core/src/a.ts'],
	execute,
	...partial,
});

describe('validation coordinator (f00506 S2)', () => {
	describe('one execution, several consumers', () => {
		it('three concurrent requests for the same digest run the validator once', async () => {
			// The case that costs real wall-clock time on a shared
			// checkout: three agents finish within the same minute and all
			// three ask for the same suite, with no recorded evidence yet
			// because none of the runs has finished.
			const validator = controllable();
			const coordinator = createValidationCoordinator({
				store: memoryStore(),
			});

			const all = Promise.all([
				coordinator.validate(request(validator.execute)),
				coordinator.validate(request(validator.execute)),
				coordinator.validate(request(validator.execute)),
			]);
			await validator.firstStart;
			validator.finish({ result: 'pass', durationMs: 90_000 });
			const results = await all;

			expect(validator.calls).toBe(1);
			expect(results).toHaveLength(3);
			for (const result of results) {
				expect(result.outcome.result).toBe('pass');
				expect(result.outcome.durationMs).toBe(90_000);
			}
		});

		it('marks the first caller as the executor and the others as joiners', async () => {
			const validator = controllable();
			const coordinator = createValidationCoordinator({
				store: memoryStore(),
			});

			const all = Promise.all([
				coordinator.validate(request(validator.execute)),
				coordinator.validate(request(validator.execute)),
			]);
			await validator.firstStart;
			validator.finish({ result: 'pass', durationMs: 10 });
			const [first, second] = await all;

			expect(first?.source).toBe('executed');
			expect(second?.source).toBe('joined-in-flight');
			expect(second?.reason).toContain('already running');
		});

		it('a request arriving mid-run joins rather than starting another', async () => {
			const validator = controllable();
			const coordinator = createValidationCoordinator({
				store: memoryStore(),
			});

			const first = coordinator.validate(request(validator.execute));
			await validator.firstStart;
			expect(coordinator.inFlightCount()).toBe(1);

			const late = coordinator.validate(request(validator.execute));
			validator.finish({ result: 'pass', durationMs: 5 });

			expect((await late).source).toBe('joined-in-flight');
			expect((await first).source).toBe('executed');
			expect(validator.calls).toBe(1);
		});

		it('does not join runs for a different state', async () => {
			// Different digest, different question. Sharing here would be
			// the stale-reuse bug the key exists to prevent.
			const validator = controllable();
			const other = controllable();
			const coordinator = createValidationCoordinator({
				store: memoryStore(),
			});

			const a = coordinator.validate(request(validator.execute));
			await validator.firstStart;
			const b = coordinator.validate(
				request(other.execute, {
					key: key({ inputDigest: 'input-2' }),
				}),
			);
			await other.firstStart;

			validator.finish({ result: 'pass', durationMs: 1 });
			other.finish({ result: 'pass', durationMs: 2 });

			expect((await a).source).toBe('executed');
			expect((await b).source).toBe('executed');
			expect(validator.calls).toBe(1);
			expect(other.calls).toBe(1);
		});
	});

	describe('valid evidence is reused without running anything', () => {
		it('returns the recorded pass and never calls the validator', async () => {
			const store = memoryStore();
			await recordEvidence(
				{
					key: key(),
					result: 'pass',
					recordedAt: Date.UTC(2026, 8, 5),
					durationMs: 42,
					relevantInputs: ['packages/core/src/a.ts'],
				},
				store,
			);
			const coordinator = createValidationCoordinator({ store });
			let called = false;

			const result = await coordinator.validate(
				request(async () => {
					called = true;
					return { result: 'pass', durationMs: 0 };
				}),
			);

			expect(called).toBe(false);
			expect(result.source).toBe('reused-evidence');
			expect(result.outcome.durationMs).toBe(42);
		});

		it('runs when the recorded evidence is a failure', async () => {
			const store = memoryStore();
			await recordEvidence(
				{
					key: key(),
					result: 'fail',
					recordedAt: Date.UTC(2026, 8, 5),
					durationMs: 42,
					relevantInputs: [],
				},
				store,
			);
			const coordinator = createValidationCoordinator({ store });

			const result = await coordinator.validate(
				request(async () => ({ result: 'pass', durationMs: 7 })),
			);

			expect(result.source).toBe('executed');
			expect(result.outcome.result).toBe('pass');
		});
	});

	describe('a shared failure reaches everyone and is never cached as a pass', () => {
		it('propagates a failing verdict to all consumers', async () => {
			const validator = controllable();
			const store = memoryStore();
			const coordinator = createValidationCoordinator({ store });

			const all = Promise.all([
				coordinator.validate(request(validator.execute)),
				coordinator.validate(request(validator.execute)),
				coordinator.validate(request(validator.execute)),
			]);
			await validator.firstStart;
			validator.finish({ result: 'fail', durationMs: 3 });
			const results = await all;

			for (const result of results) {
				expect(result.outcome.result).toBe('fail');
			}
		});

		it('does not let the next request reuse that failure as a pass', async () => {
			const validator = controllable();
			const store = memoryStore();
			const coordinator = createValidationCoordinator({ store });

			const first = coordinator.validate(request(validator.execute));
			await validator.firstStart;
			validator.finish({ result: 'fail', durationMs: 3 });
			await first;

			const second = await coordinator.validate(
				request(async () => ({ result: 'pass', durationMs: 1 })),
			);

			expect(second.source).toBe('executed');
			expect(second.outcome.result).toBe('pass');
		});

		it('propagates a thrown error to every consumer', async () => {
			const validator = controllable();
			const coordinator = createValidationCoordinator({
				store: memoryStore(),
			});

			const all = Promise.allSettled([
				coordinator.validate(request(validator.execute)),
				coordinator.validate(request(validator.execute)),
			]);
			await validator.firstStart;
			validator.throw(new Error('the runner died'));
			const results = await all;

			for (const result of results) {
				expect(result.status).toBe('rejected');
			}
			expect(validator.calls).toBe(1);
		});
	});

	describe('the in-flight map does not leak', () => {
		it('clears the entry once a run succeeds', async () => {
			const validator = controllable();
			const coordinator = createValidationCoordinator({
				store: memoryStore(),
			});

			const pending = coordinator.validate(request(validator.execute));
			await validator.firstStart;
			expect(coordinator.inFlightCount()).toBe(1);
			validator.finish({ result: 'pass', durationMs: 1 });
			await pending;

			expect(coordinator.inFlightCount()).toBe(0);
		});

		it('clears the entry when a run throws, so the next caller is not handed a dead promise', async () => {
			const validator = controllable();
			const coordinator = createValidationCoordinator({
				store: memoryStore(),
			});

			const pending = coordinator.validate(request(validator.execute));
			await validator.firstStart;
			validator.throw(new Error('boom'));
			await expect(pending).rejects.toThrow('boom');

			expect(coordinator.inFlightCount()).toBe(0);
		});
	});
});
