/**
 * console-sink.ts — f00251 S1.
 *
 * Always-available fallback sink that writes one structured JSON line per
 * captured-error event to `process.stderr`.
 *
 * A second `redactSecrets` pass is applied as defense-in-depth: the
 * collector already redacted the event, but this pass catches anything
 * the configured policy may have missed (e.g. a custom policy that does
 * not scrub secrets from `summary`).
 *
 * @example
 * ```ts
 * const sink = new ConsoleErrorSink();                // active
 * const quiet = new ConsoleErrorSink({ quiet: true }); // no-op (tests)
 * ```
 */
import type { IErrorSink } from './sink.interface.js';
import type { ICapturedError } from './types.js';
import { redactSecrets } from '../shared/redact.js';

/** Shape of the JSON line written to stderr. */
interface IConsoleErrorLine {
	readonly ts: string;
	readonly kind: string;
	readonly severity: string;
	readonly classification: string;
	readonly errorCode: string;
	readonly toolName: string;
	readonly summary: string;
	readonly fingerprint: string;
	readonly sink: 'console-error';
}

/** Options accepted by `ConsoleErrorSink`. */
export interface IConsoleErrorSinkOptions {
	/**
	 * When `true`, the sink becomes a no-op.  Useful in test environments
	 * where stderr noise is undesirable.
	 */
	readonly quiet?: boolean;
}

/** Fallback sink that writes one redacted JSON line per event to stderr. */
export class ConsoleErrorSink implements IErrorSink {
	readonly id = 'console-error';

	readonly #quiet: boolean;

	constructor(opts?: IConsoleErrorSinkOptions) {
		this.#quiet = opts?.quiet === true;
	}

	async record(event: ICapturedError): Promise<void> {
		if (this.#quiet) return;

		// Defense-in-depth: re-run secret redaction on text fields.
		const summary = redactSecrets(event.summary).text;
		const toolName = redactSecrets(event.toolName).text;

		const line: IConsoleErrorLine = {
			ts: event.ts,
			kind: event.kind,
			severity: event.severity,
			classification: event.classification,
			errorCode: event.errorCode,
			toolName,
			summary,
			fingerprint: event.fingerprint,
			sink: 'console-error',
		};

		process.stderr.write(`${JSON.stringify(line)}\n`);
	}
}
