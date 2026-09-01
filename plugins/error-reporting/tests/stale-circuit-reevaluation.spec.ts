import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IToolIdentityRegistry } from '@mcp-vertex/core/public';
import type { ISafeReporter } from '../src/lib/contracts/interfaces/reporter.interface';
import { createReportStore } from '../src/lib/report-store.service';
import { createReportScheduler } from '../src/lib/report-scheduler.helper';
import { createFunnelCounterStore } from '../src/lib/funnel-counter-store.service';
import {
	registerInternalPath,
	resetInternalPathRegistry,
} from '../src/lib/signature.helper';
import { buildReportErrorHandler } from '../src/index';

const tmpDirs: string[] = [];

const makeDir = async (): Promise<string> => {
	const dir = await mkdtemp(join(tmpdir(), 'error-reporting-stale-circuit-'));
	tmpDirs.push(dir);
	return dir;
};

const emptyToolRegistry: IToolIdentityRegistry = {
	get: () => undefined,
	list: () => new Map(),
};

afterEach(async () => {
	resetInternalPathRegistry();
	await Promise.all(
		tmpDirs
			.splice(0)
			.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

const internalError = (): Error => {
	registerInternalPath('/workspace');
	const error = new Error('gh transport failed');
	error.stack = [
		'Error: gh transport failed',
		'    at report (/workspace/plugins/error-reporting/src/index.ts:10:2)',
	].join('\n');
	return error;
};

describe('AUD-G01: a stale circuit breaker re-evaluates instead of staying stuck', () => {
	// The exact evidence from the audit: attemptCount 27, consecutiveFailureCount
	// 7, circuitOpenUntil three days in the past. This is the scheduler-level
	// unit that decide() must not silently trap forever once time passes.
	it('createReportScheduler#decide allows a submit once circuitOpenUntil has passed', () => {
		const scheduler = createReportScheduler({
			options: {
				dedupeWindowHours: 24,
				maxIssuesPerDay: 10,
				circuitBreakerThreshold: 7,
				backoffBaseMs: 60_000,
				backoffMaxMs: 3_600_000,
				backoffJitterRatio: 0,
			},
			clock: {
				nowMs: () => Date.parse('2026-08-28T00:00:00.000Z'),
				random: () => 0,
			},
		});
		const decision = scheduler.decide({
			record: {
				fingerprint: 'fp',
				classification: 'BUG',
				attemptCount: 27,
				consecutiveFailureCount: 7,
				lastFailureCode: 'GH_NOT_INSTALLED',
				circuitOpenUntil: '2026-08-25T10:22:16.179Z',
				nextEligibleAt: '2026-08-25T10:22:16.179Z',
			},
			records: [],
		});
		expect(decision.action).toBe('submit');
	});

	it('end to end: once the breaker cooldown passes, the next observed failure retries transport and, if it now succeeds, clears the stale failure state', async () => {
		const store = createReportStore(await makeDir());
		const funnel = createFunnelCounterStore(await makeDir());
		const reporter: ISafeReporter = {
			submitSafeReport: vi.fn().mockResolvedValue({
				ok: true,
				reason: 'created',
				issueNumber: 999,
			}),
		};
		const clock = {
			nowMs: () => Date.parse('2026-08-28T00:00:00.000Z'),
			random: () => 0,
		};
		const reportError = buildReportErrorHandler({
			options: {
				enabled: true,
				targetRepo: 'CartagoGit/mcp-vertex',
				labels: ['auto-reported'],
				dedupeWindowHours: 24,
				maxIssuesPerDay: 10,
				circuitBreakerThreshold: 7,
				backoffBaseMs: 60_000,
				backoffMaxMs: 3_600_000,
				backoffJitterRatio: 0,
			},
			store,
			reporter,
			clock,
			toolRegistry: emptyToolRegistry,
			funnel,
		});

		// Prime the record with the stale, already-expired breaker state by
		// driving it through the real failure path once, then hand-advance
		// the clock past `circuitOpenUntil` for the retry.
		const staleReporter: ISafeReporter = {
			submitSafeReport: vi.fn().mockResolvedValue({
				ok: false,
				reason: '`gh` is not installed',
				failureCode: 'GH_NOT_INSTALLED',
			}),
		};
		const primeClock = {
			nowMs: () => Date.parse('2026-08-25T09:31:09.742Z'),
			random: () => 0,
		};
		const primeReportError = buildReportErrorHandler({
			options: {
				enabled: true,
				targetRepo: 'CartagoGit/mcp-vertex',
				labels: ['auto-reported'],
				dedupeWindowHours: 24,
				maxIssuesPerDay: 10,
				circuitBreakerThreshold: 7,
				// Zero backoff so a fixed priming clock (below) never blocks
				// the next attempt on `nextEligibleAt` — we want exactly 7
				// consecutive failures, not fewer because a static `nowMs`
				// looked like it was still inside the backoff window.
				backoffBaseMs: 0,
				backoffMaxMs: 0,
				backoffJitterRatio: 0,
			},
			store,
			reporter: staleReporter,
			clock: primeClock,
			toolRegistry: emptyToolRegistry,
			funnel,
		});
		for (let attempt = 0; attempt < 7; attempt += 1) {
			await primeReportError('quality_run_quality', internalError());
		}
		const primed = (await store.all())[0];
		expect(primed?.consecutiveFailureCount).toBe(7);
		expect(primed?.circuitOpenUntil).toBeDefined();
		expect(Date.parse(primed!.circuitOpenUntil!)).toBeLessThan(
			clock.nowMs(),
		);

		// The breaker is stale (its cooldown ended days ago). The next
		// observed failure — with `gh` now fixed — must retry, not stay
		// silently open.
		await reportError('quality_run_quality', internalError());

		expect(reporter.submitSafeReport).toHaveBeenCalledTimes(1);
		const record = (await store.all())[0];
		expect(record?.issueNumber).toBe(999);
		expect(record?.circuitOpenUntil).toBeUndefined();
		expect(record?.consecutiveFailureCount).toBe(0);

		const counters = await funnel.read();
		expect(counters.submissionSucceeded).toBe(1);
		expect(counters.circuitOpenUntil).toBeUndefined();
	});
});
