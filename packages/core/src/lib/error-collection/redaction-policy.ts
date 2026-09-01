/**
 * redaction-policy.ts — f00251 S1.
 *
 * Composable redactor that applies three passes to a captured-error event:
 *   1. Secret scrubbing via `redactSecrets` (removes tokens, PEM keys, JWTs…).
 *   2. POSIX-path truncation — collapses `/Users/<x>/…` and `/home/<x>/…`
 *      prefixes to `~/…` and then replaces remaining multi-segment absolute
 *      paths with a short placeholder.
 *   3. Byte-cap — truncates `summary` and `stackHead` to `argByteLimit` bytes.
 *
 * The fields `errorCode`, `errorName`, `severity`, and `kind` are preserved
 * unchanged across all passes.  The function always returns a NEW object.
 */
import type { IRedactionPolicy } from './collector.interface.js';
import type { ICapturedError } from './types.js';
import { redactSecrets } from '../shared/redact.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Options accepted by `createDefaultRedactionPolicy`. */
export interface IRedactionPolicyOptions {
	/**
	 * Maximum byte count for `summary` and `stackHead` after redaction.
	 * Fields exceeding this limit are UTF-8 truncated.
	 * @default 8192
	 */
	readonly argByteLimit?: number;
	/**
	 * Regex used to match and mask residual POSIX absolute paths.
	 * Applied *after* the home-prefix collapse pass.
	 * @default `/(?:\/[\w.-]+){2,}/g`
	 */
	readonly pathPattern?: RegExp;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Replace `/Users/<name>` and `/home/<name>` prefixes with `~`. */
const HOME_RE = /\/(?:Users|home)\/[^\s/]+/g;

/** Redact home prefixes in a string. */
function collapseHomePaths(text: string): string {
	return text.replace(HOME_RE, '~');
}

/** Replace residual multi-segment POSIX absolute paths. */
function maskPosixPaths(text: string, pattern: RegExp): string {
	// Reset the regex state to avoid `lastIndex` stickiness.
	const re = new RegExp(
		pattern.source,
		pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
	);
	return text.replace(re, '[PATH]');
}

/**
 * Truncate `text` to at most `limit` UTF-8 bytes.  Returns both the
 * (possibly truncated) text and a flag indicating truncation occurred.
 */
function capBytes(
	text: string,
	limit: number,
): { readonly text: string; readonly truncated: boolean } {
	const enc = new TextEncoder();
	const bytes = enc.encode(text);
	if (bytes.length <= limit) {
		return { text, truncated: false };
	}
	// Decode back from the byte boundary to avoid splitting a multi-byte char.
	const sliced = new TextDecoder().decode(bytes.subarray(0, limit));
	return { text: sliced, truncated: true };
}

/** Run all three passes on a single string field. */
function redactField(
	value: string,
	pathPattern: RegExp,
	argByteLimit: number,
): { readonly text: string; readonly truncated: boolean } {
	// Pass 1: secrets
	const afterSecrets = redactSecrets(value).text;
	// Pass 2: paths
	const afterHome = collapseHomePaths(afterSecrets);
	const afterPaths = maskPosixPaths(afterHome, pathPattern);
	// Pass 3: byte-cap
	return capBytes(afterPaths, argByteLimit);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a default redaction policy with optional overrides.
 *
 * The returned policy is stateless and safe to share across collectors.
 *
 * @example
 * ```ts
 * const policy = createDefaultRedactionPolicy({ argByteLimit: 512 });
 * const safe = policy.redact(rawEvent);
 * ```
 */
export function createDefaultRedactionPolicy(
	opts?: IRedactionPolicyOptions,
): IRedactionPolicy {
	const argByteLimit = opts?.argByteLimit ?? 8192;
	const pathPattern = opts?.pathPattern ?? /(?:\/[\w.-]+){2,}/g;

	return {
		redact(event: ICapturedError): ICapturedError {
			const summaryResult = redactField(
				event.summary,
				pathPattern,
				argByteLimit,
			);
			const stackResult = redactField(
				event.stackHead,
				pathPattern,
				argByteLimit,
			);

			const wasTruncated =
				event.truncated ||
				summaryResult.truncated ||
				stackResult.truncated;

			return {
				// Preserved unchanged
				kind: event.kind,
				errorCode: event.errorCode,
				errorName: event.errorName,
				severity: event.severity,
				// Context fields preserved
				toolName: event.toolName,
				packageId: event.packageId,
				pluginName: event.pluginName,
				// Preserved computed fields
				ts: event.ts,
				fingerprint: event.fingerprint,
				byteCount: event.byteCount,
				classification: event.classification,
				// Redacted fields
				summary: summaryResult.text,
				stackHead: stackResult.text,
				truncated: wasTruncated,
			};
		},
	};
}
