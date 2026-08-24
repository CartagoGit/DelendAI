import { describe, expect, it } from 'vitest';

import {
	DEFAULT_BACKOFF_BASE_MS,
	DEFAULT_BACKOFF_JITTER_RATIO,
	DEFAULT_BACKOFF_MAX_MS,
	DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
	DEFAULT_LABELS,
	DEFAULT_MAX_ISSUES_PER_DAY,
	DEFAULT_TARGET_REPO,
	resolveOptions,
} from '../src/lib/contracts/constants/options.constant';

describe('resolveOptions', () => {
	it('applies the intrinsic defaults when nothing is configured', () => {
		const options = resolveOptions({});
		expect(options.enabled).toBe(true);
		expect(options.targetRepo).toBe(DEFAULT_TARGET_REPO);
		expect(options.labels).toEqual([...DEFAULT_LABELS]);
		expect(options.internalOnly).toBe(true);
		expect(options.dedupeWindowHours).toBe(24);
		expect(options.maxIssuesPerDay).toBe(DEFAULT_MAX_ISSUES_PER_DAY);
		expect(options.circuitBreakerThreshold).toBe(
			DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
		);
		expect(options.backoffBaseMs).toBe(DEFAULT_BACKOFF_BASE_MS);
		expect(options.backoffMaxMs).toBe(DEFAULT_BACKOFF_MAX_MS);
		expect(options.backoffJitterRatio).toBe(DEFAULT_BACKOFF_JITTER_RATIO);
	});

	it('honours every override', () => {
		const options = resolveOptions({
			enabled: false,
			targetRepo: 'acme/tools',
			labels: ['custom'],
			internalOnly: false,
			dedupeWindowHours: 1,
			maxIssuesPerDay: 2,
			circuitBreakerThreshold: 4,
			backoffBaseMs: 500,
			backoffMaxMs: 5_000,
			backoffJitterRatio: 0.5,
		});
		expect(options.enabled).toBe(false);
		expect(options.targetRepo).toBe('acme/tools');
		expect(options.labels).toEqual(['custom']);
		expect(options.internalOnly).toBe(false);
		expect(options.dedupeWindowHours).toBe(1);
		expect(options.maxIssuesPerDay).toBe(2);
		expect(options.circuitBreakerThreshold).toBe(4);
		expect(options.backoffBaseMs).toBe(500);
		expect(options.backoffMaxMs).toBe(5_000);
		expect(options.backoffJitterRatio).toBe(0.5);
	});

	it('falls back to defaults on malformed values', () => {
		const options = resolveOptions({
			enabled: 'nope',
			targetRepo: 'bad repo --flag',
			dedupeWindowHours: -5,
			maxIssuesPerDay: 0,
			circuitBreakerThreshold: 0,
			backoffBaseMs: -1,
			backoffMaxMs: -1,
			backoffJitterRatio: 5,
		});
		expect(options.enabled).toBe(true);
		expect(options.targetRepo).toBe(DEFAULT_TARGET_REPO);
		expect(options.dedupeWindowHours).toBe(24);
		expect(options.maxIssuesPerDay).toBe(DEFAULT_MAX_ISSUES_PER_DAY);
		expect(options.circuitBreakerThreshold).toBe(
			DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
		);
		expect(options.backoffBaseMs).toBe(DEFAULT_BACKOFF_BASE_MS);
		expect(options.backoffMaxMs).toBe(DEFAULT_BACKOFF_MAX_MS);
		expect(options.backoffJitterRatio).toBe(DEFAULT_BACKOFF_JITTER_RATIO);
	});

	it('accepts targetRepo only from explicit plugin config and trims it', () => {
		const options = resolveOptions({
			targetRepo: '  acme/tools  ',
		});
		expect(options.targetRepo).toBe('acme/tools');
	});
});
