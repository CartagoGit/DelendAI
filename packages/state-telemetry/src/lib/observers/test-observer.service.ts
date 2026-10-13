/**
 * test-observer.service.ts — publishes to the Work Event Bus that a test
 * run started and finished. It is a pure component: whoever runs the tests
 * (the consumer) calls `started()` and `finished()`; nothing here spawns a
 * process or hooks a tool.
 *
 * Contract:
 * - `started()` only remembers the run and its start time. Nothing is
 *   emitted until `finished()` shows the run really ran tests, so a run
 *   with zero tests (passed + failed = 0) leaves no event at all.
 * - A run that did run emits `test_started` (stamped with the start
 *   time) and then `test_finished`, in that order.
 * - Only a sha256 `payload_hash` travels; `failureHash()` is stable
 *   between two runs failing for the same cause.
 * - Fire-and-forget: nothing awaits, nothing throws into the caller.
 */

import type {
	IObserverOptions,
	ITestFailure,
	ITestResult,
	ITestRun,
} from './contracts/interfaces/observer.interface';
import { normalizeFailureMessage } from './failure-normalizer.helper';
import { hashProjection, ObserverEmitter } from './observer-emitter.service';

export class TestObserver {
	private readonly emitter: ObserverEmitter;
	private readonly now: () => number;
	private readonly startedAt = new Map<string, number>();

	constructor(
		private readonly options: IObserverOptions & {
			readonly rootDir?: string | undefined;
		},
	) {
		this.now = options.now ?? Date.now;
		this.emitter = new ObserverEmitter(options.sink, this.now);
	}

	/** Remember a run; emits nothing yet. */
	started(run: ITestRun): void {
		this.startedAt.set(run.id, this.now());
	}

	/** Emit the pair of events for a run that executed at least one test. */
	finished(run: ITestRun, result: ITestResult): void {
		const startedAt = this.startedAt.get(run.id) ?? this.now();
		this.startedAt.delete(run.id);
		if (result.passed + result.failed === 0) return;
		const { workItemId, actorId } = this.options;
		this.emitter.emit(
			'test_started',
			workItemId,
			actorId,
			hashProjection({ run: run.id, command: run.command }),
			startedAt,
		);
		this.emitter.emit(
			'test_finished',
			workItemId,
			actorId,
			hashProjection({
				run: run.id,
				command: run.command,
				passed: result.passed,
				failed: result.failed,
				failure:
					result.firstFailure === undefined
						? null
						: this.failureHash(result.firstFailure),
			}),
		);
	}

	/** sha256 of the failing path plus its normalized message. */
	failureHash(failure: ITestFailure): string {
		const rootDir = this.options.rootDir;
		const normalize = (text: string): string =>
			normalizeFailureMessage(text, { rootDir });
		return hashProjection({
			path: normalize(failure.path),
			message: normalize(failure.message),
		});
	}

	/** Resolves once nothing is queued. Meant for tests and shutdown. */
	idle(): Promise<void> {
		return this.emitter.idle();
	}
}
