/**
 * severity-classifier.ts — f00251 S1.
 *
 * Rule-based severity classification for captured errors.  The classifier
 * maps an error value and runtime outcome to a `TSeverityBand` and a
 * human-readable classification tag from a closed enum.
 */
import type { ISeverityBand } from './types.js';
import type { ISeverityClassifier, TOutcome } from './collector.interface.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The 8 severity bands (alias of `ISeverityBand` for local use in classifier
 * code that does not import from `types.ts`).
 */
export type TSeverityBand = ISeverityBand;

/** Closed set of classification tags. */
export type TClassification =
	| 'TYPE_ERROR'
	| 'RANGE_ERROR'
	| 'TIMEOUT'
	| 'PRIVACY'
	| 'SECURITY'
	| 'FATAL'
	| 'TIMED_OUT'
	| 'DEAD'
	| 'UNKNOWN';

// ---------------------------------------------------------------------------
// Rule table
// ---------------------------------------------------------------------------

interface IRule {
	/** Predicate tested in order; first match wins. */
	readonly match: (error: unknown, outcome: TOutcome) => boolean;
	readonly severity: TSeverityBand;
	readonly classification: TClassification;
	readonly errorCode?: string;
}

const RULES: readonly IRule[] = [
	// Outcome-driven rules have highest precedence.
	{
		match: (_e, outcome) => outcome === 'dead',
		severity: 'emergency',
		classification: 'DEAD',
		errorCode: 'ERR_DEAD',
	},
	{
		match: (_e, outcome) => outcome === 'timed-out',
		severity: 'critical',
		classification: 'TIMED_OUT',
		errorCode: 'ERR_TIMED_OUT',
	},
	// Name-pattern rules — most specific first.
	{
		match: (e) => e instanceof Error && /Fatal/i.test(e.name),
		severity: 'emergency',
		classification: 'FATAL',
		errorCode: 'ERR_FATAL',
	},
	{
		match: (e) => e instanceof Error && /Security/i.test(e.name),
		severity: 'alert',
		classification: 'SECURITY',
		errorCode: 'ERR_SECURITY',
	},
	{
		match: (e) => e instanceof Error && /Privacy/i.test(e.name),
		severity: 'critical',
		classification: 'PRIVACY',
		errorCode: 'ERR_PRIVACY',
	},
	{
		match: (e) =>
			e instanceof Error &&
			(e.name === 'TimeoutError' || /Timeout/i.test(e.name)),
		severity: 'critical',
		classification: 'TIMEOUT',
		errorCode: 'ERR_TIMEOUT',
	},
	// Built-in error types.
	{
		match: (e) => e instanceof TypeError,
		severity: 'error',
		classification: 'TYPE_ERROR',
		errorCode: 'ERR_TYPE',
	},
	{
		match: (e) => e instanceof RangeError,
		severity: 'error',
		classification: 'RANGE_ERROR',
		errorCode: 'ERR_RANGE',
	},
];

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a default rule-based severity classifier.
 *
 * Rules are tested in order; the first match wins.  If no rule matches,
 * the event is classified as `warning / UNKNOWN`.
 *
 * @example
 * ```ts
 * const classifier = createDefaultSeverityClassifier();
 * const { severity, classification } = classifier.classify(new TypeError('x'), 'failed');
 * // → { severity: 'error', classification: 'TYPE_ERROR', errorCode: 'ERR_TYPE' }
 * ```
 */
export function createDefaultSeverityClassifier(): ISeverityClassifier {
	return {
		classify(
			error: unknown,
			outcome: TOutcome,
		): {
			readonly severity: TSeverityBand;
			readonly classification: TClassification;
			readonly errorCode?: string;
		} {
			for (const rule of RULES) {
				if (rule.match(error, outcome)) {
					if (rule.errorCode !== undefined) {
						return {
							severity: rule.severity,
							classification: rule.classification,
							errorCode: rule.errorCode,
						};
					}
					return {
						severity: rule.severity,
						classification: rule.classification,
					};
				}
			}
			return { severity: 'warning', classification: 'UNKNOWN' };
		},
	};
}
