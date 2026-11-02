/**
 * tool-observer.service.ts — publishes to the Work Event Bus that a tool
 * was called, finished or failed. A pure component: the consumer calls
 * `called()`, `finished()` and `failed()`; nothing here hooks a host.
 *
 * Contract:
 * - `called()` hashes the tool name and its canonical (key-sorted) args;
 *   the value of any secret-looking key is dropped before hashing, so a
 *   token never changes a hash and never travels.
 * - `failed()` hashes the exit code and the normalized message, with the
 *   same normalizer the test observer uses.
 * - Fire-and-forget: nothing awaits, nothing throws into the caller, and
 *   an observer whose sink does nothing changes nothing.
 */

import { SECRET_KEY_PATTERN } from './contracts/constants/observer.constant';
import type {
	IObserverOptions,
	IToolFailure,
	IToolFinish,
} from './contracts/interfaces/observer.interface';
import { normalizeFailureMessage } from './failure-normalizer.helper';
import { hashProjection, ObserverEmitter } from './observer-emitter.service';

/** Removes every secret-looking key, at any depth. */
export const stripSecrets = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(stripSecrets);
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([key]) => !SECRET_KEY_PATTERN.test(key))
				.map(([key, item]) => [key, stripSecrets(item)]),
		);
	}
	return value;
};

export class ToolObserver {
	private readonly emitter: ObserverEmitter;

	constructor(
		private readonly options: IObserverOptions & {
			readonly rootDir?: string | undefined;
		},
	) {
		this.emitter = new ObserverEmitter(
			options.sink,
			options.now ?? Date.now,
		);
	}

	called(tool: string, args: unknown): void {
		this.emit('tool_called', { tool, args: stripSecrets(args) });
	}

	finished(tool: string, outcome: IToolFinish): void {
		this.emit('tool_finished', { tool, durationMs: outcome.durationMs });
	}

	failed(tool: string, failure: IToolFailure): void {
		this.emit('tool_error', {
			tool,
			exitCode: failure.exitCode,
			message: normalizeFailureMessage(failure.message, {
				rootDir: this.options.rootDir,
			}),
		});
	}

	/** Resolves once nothing is queued. Meant for tests and shutdown. */
	idle(): Promise<void> {
		return this.emitter.idle();
	}

	private emit(
		kind: 'tool_called' | 'tool_finished' | 'tool_error',
		projection: unknown,
	): void {
		this.emitter.emit(
			kind,
			this.options.workItemId,
			this.options.actorId,
			hashProjection(projection),
		);
	}
}
