/**
 * collector.interface.ts — f00251 S1.
 *
 * Engine ports: the public contract for the error collector and its
 * configuration.  Concrete implementations live in `collector.service.ts`;
 * the classifier and redaction contracts live in their own modules.
 */
import type { ICapturedError, ICapturedErrorContext } from './types.js';
import type { IErrorSink } from './sink.interface.js';

// ---------------------------------------------------------------------------
// Classifier port (forward reference — implemented in severity-classifier.ts)
// ---------------------------------------------------------------------------

/** Outcome values mirrored from the logs event stream. */
export type TOutcome =
	| 'ok'
	| 'failed'
	| 'timed-out'
	| 'cancelled'
	| 'dead'
	| 'idle'
	| 'unknown';

/** Maps an error + runtime outcome to a severity band and classification tag. */
export interface ISeverityClassifier {
	/**
	 * Classify `error` given the runtime `outcome`.
	 *
	 * @example
	 * ```ts
	 * const { severity, classification } = classifier.classify(err, 'failed');
	 * ```
	 */
	classify(
		error: unknown,
		outcome: TOutcome,
	): {
		readonly severity: ICapturedError['severity'];
		readonly classification: string;
		readonly errorCode?: string;
	};
}

// ---------------------------------------------------------------------------
// Redaction port (forward reference — implemented in redaction-policy.ts)
// ---------------------------------------------------------------------------

/** Transforms a captured-error event by scrubbing sensitive data. */
export interface IRedactionPolicy {
	/**
	 * Return a new, redacted copy of `event`.  Must never mutate the input.
	 *
	 * @example
	 * ```ts
	 * const safe = policy.redact(rawEvent);
	 * ```
	 */
	redact(event: ICapturedError): ICapturedError;
}

// ---------------------------------------------------------------------------
// Collector port
// ---------------------------------------------------------------------------

/**
 * Options accepted by `createErrorCollector`.
 *
 * All optional fields have sensible defaults so a minimal collector can be
 * created with just `{ sinks: [mySink] }`.
 */
export interface ICreateErrorCollectorOptions {
	/** Ordered list of sinks that receive every captured event. */
	readonly sinks: readonly IErrorSink[];
	/**
	 * Classifier used to derive severity and classification from the raw
	 * error.  Defaults to `createDefaultSeverityClassifier()`.
	 */
	readonly classifier?: ISeverityClassifier;
	/**
	 * Redaction policy applied once before fan-out to all sinks.
	 * Defaults to `createDefaultRedactionPolicy()`.
	 */
	readonly redaction?: IRedactionPolicy;
	/**
	 * Clock used to stamp `ts`.  Defaults to `() => new Date()`.
	 * Inject a deterministic clock in tests.
	 */
	readonly clock?: () => Date;
	/**
	 * Called when a sink's `record()` rejects.  Use for secondary
	 * alerting (e.g. write to stderr) without re-throwing.
	 */
	readonly onSinkError?: (sinkId: string, err: unknown) => void;
}

/**
 * The engine port: classifies, fingerprints, redacts, and fans out to sinks.
 *
 * @example
 * ```ts
 * const collector = createErrorCollector({ sinks: [consoleSink] });
 * const event = await collector.record(new TypeError('oops'), ctx);
 * ```
 */
export interface IErrorCollector {
	/**
	 * Capture `error` with `context`, run the full pipeline, and fan out
	 * to every configured sink.
	 *
	 * Returns the final redacted event so wrappers can pass it to
	 * `onError` hooks.  Never throws — sink failures are isolated.
	 */
	record(
		error: unknown,
		context: ICapturedErrorContext,
	): Promise<ICapturedError>;
}
