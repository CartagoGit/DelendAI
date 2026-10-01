/**
 * severity-classifier.spec.ts — f00251 S1.
 *
 * Table-driven tests for `createDefaultSeverityClassifier`.
 */
import { describe, expect, it } from 'vitest';

import { createDefaultSeverityClassifier } from '../../../../src/lib/error-collection/severity-classifier.js';
import type { TOutcome } from '../../../../src/lib/error-collection/collector.interface.js';

const classifier = createDefaultSeverityClassifier();

// ---------------------------------------------------------------------------
// Built-in error types
// ---------------------------------------------------------------------------

describe('createDefaultSeverityClassifier — built-in error types', () => {
	it('classifies TypeError as error / TYPE_ERROR', () => {
		const result = classifier.classify(new TypeError('bad type'), 'failed');
		expect(result.severity).toBe('error');
		expect(result.classification).toBe('TYPE_ERROR');
		expect(result.errorCode).toBe('ERR_TYPE');
	});

	it('classifies RangeError as error / RANGE_ERROR', () => {
		const result = classifier.classify(
			new RangeError('out of range'),
			'failed',
		);
		expect(result.severity).toBe('error');
		expect(result.classification).toBe('RANGE_ERROR');
		expect(result.errorCode).toBe('ERR_RANGE');
	});

	it('classifies a TimeoutError as critical / TIMEOUT', () => {
		class TimeoutError extends Error {
			constructor() {
				super('timed out');
				this.name = 'TimeoutError';
			}
		}
		const result = classifier.classify(new TimeoutError(), 'failed');
		expect(result.severity).toBe('critical');
		expect(result.classification).toBe('TIMEOUT');
	});

	it('classifies an error whose name contains "Timeout" as critical / TIMEOUT', () => {
		const err = new Error('request timeout');
		err.name = 'RequestTimeoutError';
		const result = classifier.classify(err, 'failed');
		expect(result.severity).toBe('critical');
		expect(result.classification).toBe('TIMEOUT');
	});
});

// ---------------------------------------------------------------------------
// Name-pattern rules
// ---------------------------------------------------------------------------

describe('createDefaultSeverityClassifier — name-pattern rules', () => {
	it('classifies *Privacy* errors as critical / PRIVACY', () => {
		const err = new Error('leak');
		err.name = 'PrivacyViolationError';
		const result = classifier.classify(err, 'failed');
		expect(result.severity).toBe('critical');
		expect(result.classification).toBe('PRIVACY');
	});

	it('classifies *Security* errors as alert / SECURITY', () => {
		const err = new Error('tampered');
		err.name = 'SecurityPolicyError';
		const result = classifier.classify(err, 'failed');
		expect(result.severity).toBe('alert');
		expect(result.classification).toBe('SECURITY');
	});

	it('classifies *Fatal* errors as emergency / FATAL', () => {
		const err = new Error('crash');
		err.name = 'FatalSystemError';
		const result = classifier.classify(err, 'failed');
		expect(result.severity).toBe('emergency');
		expect(result.classification).toBe('FATAL');
	});
});

// ---------------------------------------------------------------------------
// Outcome-driven rules
// ---------------------------------------------------------------------------

describe('createDefaultSeverityClassifier — outcome rules', () => {
	it('classifies outcome=timed-out as critical / TIMED_OUT', () => {
		const result = classifier.classify(new Error('slow'), 'timed-out');
		expect(result.severity).toBe('critical');
		expect(result.classification).toBe('TIMED_OUT');
	});

	it('classifies outcome=dead as emergency / DEAD', () => {
		const result = classifier.classify(new Error('gone'), 'dead');
		expect(result.severity).toBe('emergency');
		expect(result.classification).toBe('DEAD');
	});
});

// ---------------------------------------------------------------------------
// Unknown fallback
// ---------------------------------------------------------------------------

describe('createDefaultSeverityClassifier — unknown fallback', () => {
	it('classifies an unrecognised error as warning / UNKNOWN', () => {
		const result = classifier.classify(new Error('generic'), 'failed');
		expect(result.severity).toBe('warning');
		expect(result.classification).toBe('UNKNOWN');
	});

	it('classifies a non-Error value as warning / UNKNOWN', () => {
		const result = classifier.classify('plain string error', 'failed');
		expect(result.severity).toBe('warning');
		expect(result.classification).toBe('UNKNOWN');
	});

	it('classifies null as warning / UNKNOWN', () => {
		const result = classifier.classify(null, 'unknown');
		expect(result.severity).toBe('warning');
		expect(result.classification).toBe('UNKNOWN');
	});
});

// ---------------------------------------------------------------------------
// Outcome precedence over error name
// ---------------------------------------------------------------------------

describe('createDefaultSeverityClassifier — outcome precedence', () => {
	it('outcome=dead overrides TypeError classification → emergency', () => {
		// dead > TypeError in the rule table
		const result = classifier.classify(new TypeError('x'), 'dead');
		expect(result.severity).toBe('emergency');
		expect(result.classification).toBe('DEAD');
	});

	it('outcome=timed-out overrides TypeError classification → critical', () => {
		const result = classifier.classify(new TypeError('x'), 'timed-out');
		expect(result.severity).toBe('critical');
		expect(result.classification).toBe('TIMED_OUT');
	});
});

// ---------------------------------------------------------------------------
// All valid outcomes compile
// ---------------------------------------------------------------------------

describe('createDefaultSeverityClassifier — outcome exhaustiveness', () => {
	const outcomes: readonly TOutcome[] = [
		'ok',
		'failed',
		'timed-out',
		'cancelled',
		'dead',
		'idle',
		'unknown',
	];
	for (const outcome of outcomes) {
		it(`does not throw for outcome="${outcome}"`, () => {
			expect(() =>
				classifier.classify(new Error('x'), outcome),
			).not.toThrow();
		});
	}
});
