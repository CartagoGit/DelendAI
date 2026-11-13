/**
 * sink.interface.ts — f00251 S1.
 *
 * The port that any durable error writer must implement.
 *
 * ## Relationship to `ILogsSink` (f00154 S2)
 *
 * `IErrorSink` is the parallel of `ILogsSink` but for the **error** stream.
 * Where `ILogsSink` receives lifecycle events (`tool-started`, `tool-failed`,
 * …), `IErrorSink` receives fully classified and redacted `ICapturedError`
 * events.
 *
 * ## Contract obligations on implementors
 *
 * - `record` **MUST NOT throw**.  A sink that encounters a write failure must
 *   handle the error internally (log to a fallback, swallow, etc.).  Throwing
 *   here would break fan-out for all other sinks — the collector guards each
 *   sink call, but the expectation is that well-behaved sinks are self-healing.
 *
 * - Multi-sink fan-out is the **sole responsibility of the collector**.  A
 *   sink must only concern itself with writing the event it receives; routing
 *   to multiple destinations is not its job.
 *
 * @example
 * ```ts
 * class MyAlertSink implements IErrorSink {
 *   readonly id = 'my-alert';
 *   async record(event: ICapturedError): Promise<void> {
 *     if (event.severity === 'emergency') await sendPage(event);
 *   }
 * }
 * ```
 */
import type { ICapturedError } from './types.js';

/** Writes a single captured-error event to a durable or ephemeral store. */
export interface IErrorSink {
	/** Stable, unique identifier for this sink instance. */
	readonly id: string;
	/**
	 * Record a single captured-error event.
	 *
	 * MUST NOT throw — handle failures internally.
	 */
	record(event: ICapturedError): Promise<void>;
}
