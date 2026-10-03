import { describe, expect, it } from 'vitest';

import { resolveOptions } from '../src/lib/options.service';
import { createReportScheduler } from '../src/lib/report-scheduler.helper';

const buildScheduler = (overrides: Record<string, unknown> = {}) =>
	createReportScheduler({
		options: resolveOptions(overrides),
		clock: {
			nowMs: () => Date.parse('2026-08-24T12:00:00.000Z'),
			random: () => 0,
		},
	});

describe('createReportScheduler', () => {
	it('skips network dispatch when the fingerprint already has an issue number', () => {
		const scheduler = buildScheduler();
		const decision = scheduler.decide({
			record: {
				fingerprint: 'fp',
				classification: 'BUG',
				attemptCount: 4,
				consecutiveFailureCount: 0,
				issueNumber: 9,
			},
			records: [],
		});
		expect(decision).toEqual({ action: 'skip', reason: 'existing-issue' });
	});

	it('uses lastSuccessAt for dedupe instead of a failed attempt timestamp', () => {
		const scheduler = buildScheduler();
		const decision = scheduler.decide({
			record: {
				fingerprint: 'fp',
				classification: 'BUG',
				attemptCount: 2,
				lastAttemptAt: '2026-08-24T11:59:00.000Z',
				consecutiveFailureCount: 1,
			},
			records: [],
		});
		expect(decision.action).toBe('submit');
	});

	it('enforces the daily successful-issue rate limit', () => {
		const scheduler = buildScheduler({ maxIssuesPerDay: 1 });
		const decision = scheduler.decide({
			record: {
				fingerprint: 'new',
				classification: 'NEEDS_REPRODUCTION',
				attemptCount: 1,
				consecutiveFailureCount: 0,
			},
			records: [
				{
					fingerprint: 'done',
					classification: 'BUG',
					attemptCount: 1,
					lastSuccessAt: '2026-08-24T01:00:00.000Z',
					consecutiveFailureCount: 0,
					issueNumber: 1,
				},
			],
		});
		expect(decision).toMatchObject({
			action: 'skip',
			reason: 'rate-limit',
			failureCode: 'RATE_LIMITED',
		});
	});

	it('applies exponential backoff and opens the circuit after the threshold', () => {
		const scheduler = buildScheduler({
			backoffBaseMs: 1_000,
			backoffMaxMs: 60_000,
			circuitBreakerThreshold: 3,
		});
		const failure = scheduler.buildFailureState(
			{
				fingerprint: 'fp',
				classification: 'PERFORMANCE',
				attemptCount: 3,
				consecutiveFailureCount: 2,
			},
			'GH_EXEC_FAILED',
		);
		expect(failure.consecutiveFailureCount).toBe(3);
		expect(failure.nextEligibleAt).toBe('2026-08-24T12:00:04.000Z');
		expect(failure.circuitOpenUntil).toBe('2026-08-24T12:00:04.000Z');
	});

	it('skips while backoff is still active', () => {
		const scheduler = buildScheduler();
		const decision = scheduler.decide({
			record: {
				fingerprint: 'fp',
				classification: 'BUG',
				attemptCount: 2,
				nextEligibleAt: '2026-08-24T12:01:00.000Z',
				consecutiveFailureCount: 1,
			},
			records: [],
		});
		expect(decision).toMatchObject({
			action: 'skip',
			reason: 'backoff',
			failureCode: 'BACKOFF_ACTIVE',
		});
	});

	it('skips while the circuit breaker cooldown is still open', () => {
		const scheduler = buildScheduler();
		const decision = scheduler.decide({
			record: {
				fingerprint: 'fp',
				classification: 'BUG',
				attemptCount: 2,
				circuitOpenUntil: '2026-08-24T12:01:00.000Z',
				consecutiveFailureCount: 3,
			},
			records: [],
		});
		expect(decision).toMatchObject({
			action: 'skip',
			reason: 'circuit-open',
			failureCode: 'CIRCUIT_OPEN',
		});
	});
});
