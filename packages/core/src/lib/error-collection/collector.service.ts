/**
 * collector.service.ts — f00251 S1.
 *
 * Concrete implementation of `IErrorCollector`.  The engine:
 *   1. Classifies the raw error (severity + classification + errorCode).
 *   2. Extracts the error message (summary) and top-3 stack frames.
 *   3. Computes a stable SHA-256 fingerprint from packageId/toolName/
 *      errorCode/stackHead.
 *   4. Runs the redaction policy once so every sink receives the same
 *      redacted copy.
 *   5. Fans out to all sinks sorted by `id` (deterministic order).
 *      Each sink call is guarded — a single sink failure is reported via
 *      `onSinkError` but does not abort fan-out for the remaining sinks.
 */
import { createHash } from 'node:crypto';

import type {
	ICreateErrorCollectorOptions,
	IErrorCollector,
} from './collector.interface.js';
import type { ICapturedError, ICapturedErrorContext } from './types.js';
import { createDefaultRedactionPolicy } from './redaction-policy.js';
import { createDefaultSeverityClassifier } from './severity-classifier.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Byte cap applied to the raw error message before the policy runs. */
const RAW_SUMMARY_LIMIT = 16_384;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a printable error message from an unknown thrown value. */
function messageOf(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

/** Extract the raw stack string (empty string when unavailable). */
function stackOf(error: unknown): string {
	if (error instanceof Error && typeof error.stack === 'string') {
		return error.stack;
	}
	return '';
}

/** Join the top 3 stack lines with `|` for use in the fingerprint. */
function stackHead3(stack: string): string {
	const lines = stack.split('\n');
	const f0 = lines[0] ?? '';
	const f1 = lines[1] ?? '';
	const f2 = lines[2] ?? '';
	return `${f0}|${f1}|${f2}`;
}

/** Trim a string to at most `limit` UTF-8 bytes. */
function capRaw(text: string, limit: number): string {
	const enc = new TextEncoder();
	const bytes = enc.encode(text);
	if (bytes.length <= limit) return text;
	return new TextDecoder().decode(bytes.subarray(0, limit));
}

/** Compute a SHA-256 hex fingerprint from the given input string. */
function computeFingerprint(input: string): string {
	return createHash('sha256').update(input).digest('hex');
}

/** Call a sink's record() and forward any rejection to onSinkError. */
async function guardedRecord(
	sink: { readonly id: string; record(e: ICapturedError): Promise<void> },
	event: ICapturedError,
	onSinkError: ((sinkId: string, err: unknown) => void) | undefined,
): Promise<void> {
	try {
		await sink.record(event);
	} catch (err) {
		onSinkError?.(sink.id, err);
	}
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an error collector from the supplied options.
 *
 * @example
 * ```ts
 * const collector = createErrorCollector({
 *   sinks: [new ConsoleErrorSink()],
 *   onSinkError: (id, err) => console.error(`Sink ${id} failed`, err),
 * });
 * ```
 */
export function createErrorCollector(
	options: ICreateErrorCollectorOptions,
): IErrorCollector {
	const classifier = options.classifier ?? createDefaultSeverityClassifier();
	const redaction = options.redaction ?? createDefaultRedactionPolicy();
	const clock = options.clock ?? ((): Date => new Date());

	// Sort once at construction time — order must be deterministic.
	const sortedSinks = [...options.sinks].sort((a, b) =>
		a.id.localeCompare(b.id),
	);

	return {
		async record(
			error: unknown,
			context: ICapturedErrorContext,
		): Promise<ICapturedError> {
			// 1. Classify
			const {
				severity,
				classification,
				errorCode: classifiedCode,
			} = classifier.classify(error, 'failed');
			const errorCode = classifiedCode ?? 'ERR_UNKNOWN';

			// 2. Extract message and stack
			const rawMessage = capRaw(messageOf(error), RAW_SUMMARY_LIMIT);
			const rawStack = stackOf(error);
			const head3 = stackHead3(rawStack);

			const errorName =
				error instanceof Error ? error.name : 'UnknownError';

			// stackHead = top 3 frames, newline-separated (readable form)
			const topFrames = rawStack.split('\n').slice(0, 3);
			const stackHead = topFrames.join('\n');

			// 3. Fingerprint
			const fingerprintInput = `${context.packageId}|${context.toolName}|${errorCode}|${head3}`;
			const fingerprint = computeFingerprint(fingerprintInput);

			// 4. Byte counts (pre-redaction)
			const enc = new TextEncoder();
			const byteCount =
				enc.encode(rawMessage).length + enc.encode(rawStack).length;

			// 5. Build raw event
			const ts = clock().toISOString();
			const rawEvent: ICapturedError = {
				kind: 'captured-error',
				ts,
				errorCode,
				errorName,
				severity,
				classification,
				toolName: context.toolName,
				packageId: context.packageId,
				pluginName: context.pluginName,
				summary: rawMessage,
				stackHead,
				byteCount,
				truncated: false,
				fingerprint,
			};

			// 6. Redact once; all sinks receive the same copy.
			const redactedEvent = redaction.redact(rawEvent);

			// 7. Fan out (guarded, parallel).
			await Promise.allSettled(
				sortedSinks.map((sink) =>
					guardedRecord(sink, redactedEvent, options.onSinkError),
				),
			);

			return redactedEvent;
		},
	};
}
