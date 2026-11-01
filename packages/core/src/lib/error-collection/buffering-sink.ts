/**
 * buffering-sink.ts — f00251 S1.
 *
 * In-memory test helper that accumulates every captured-error event in
 * a private array.  Use `events` to assert fan-out without touching stderr
 * and `clear()` to reset state between test cases.
 *
 * @example
 * ```ts
 * const buf = new BufferingErrorSink();
 * const collector = createErrorCollector({ sinks: [buf] });
 * await collector.record(new TypeError('x'), ctx);
 * expect(buf.events).toHaveLength(1);
 * buf.clear();
 * ```
 */
import type { IErrorSink } from './sink.interface.js';
import type { ICapturedError } from './types.js';

/** In-memory sink for tests — collects every event without I/O. */
export class BufferingErrorSink implements IErrorSink {
	readonly id = 'buffering';

	readonly #events: ICapturedError[] = [];

	/** Immutable view of all events received since the last `clear()`. */
	get events(): readonly ICapturedError[] {
		return this.#events;
	}

	async record(event: ICapturedError): Promise<void> {
		this.#events.push(event);
	}

	/** Reset the internal buffer. */
	clear(): void {
		this.#events.length = 0;
	}
}
