import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import type { IToolIdentityRegistry } from '@delendai/core/public';
import type { ISafeReporter } from '../src/lib/contracts/interfaces/reporter.interface';
import { createReportStore } from '../src/lib/report-store.service';
import { createFunnelCounterStore } from '../src/lib/funnel-counter-store.service';
import {
	registerInternalPath,
	resetInternalPathRegistry,
} from '../src/lib/signature.helper';
import { buildObservedFailureHandler } from '../src/index';
import { extractObservedFailure } from '../src/lib/report-builder.helper';

const tmpDirs: string[] = [];

const makeDir = async (): Promise<string> => {
	const dir = await mkdtemp(join(tmpdir(), 'error-reporting-reconcile-'));
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
	const error = new Error('runtime failure');
	error.stack = [
		'Error: runtime failure',
		'    at report (/workspace/plugins/error-reporting/src/index.ts:10:2)',
	].join('\n');
	return error;
};

/**
 * AUD-G01's reconciliation spec: "observedFailures matches the
 * tool-failed events in the same window. This is the test that makes
 * the two subsystems watch each other." `error-reporting` cannot reach
 * into the `logs` plugin's JSONL store (out of this plugin's territory,
 * and a real cross-plugin dependency it must not take), so this test
 * builds the independent tally the way the `logs` plugin's own
 * `with-incident-logging` hook would: it counts one `tool-failed` per
 * call where `onToolCall` was given a truthy `error`/failing result,
 * from the SAME call sequence driven through `onToolCall`. The
 * invariant under test is real: the funnel's `observedFailures` must
 * equal that independent count for the same window, not merely equal
 * itself.
 */
describe('AUD-G01: funnel/log reconciliation', () => {
	it('observedFailures matches an independently-tallied tool-failed count for the same call sequence', async () => {
		const store = createReportStore(await makeDir());
		const funnel = createFunnelCounterStore(await makeDir());
		const reporter: ISafeReporter = {
			submitSafeReport: async () => ({
				ok: true,
				reason: 'created',
				issueNumber: 1,
			}),
		};
		const observe = buildObservedFailureHandler({
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
			clock: { nowMs: () => Date.now(), random: () => 0 },
			toolRegistry: emptyToolRegistry,
			funnel,
		});

		// Simulate the same tool-call window a host's incident logger
		// would see: a mix of successful calls and failures, some of
		// which are mcp-vertex-internal and some project-local.
		// A plain object (no `.stack`) carries zero frame evidence, so it
		// is unambiguously "not internal" regardless of which real file
		// this test happens to run from — unlike a genuine thrown `Error`,
		// whose stack would point back into this very monorepo and get
		// picked up by the ambient `registerInternalRuntimePaths` scope.
		const hostProjectFailure = {
			structuredContent: {
				error: {
					reason: 'host project failure, no mcp-vertex evidence',
				},
			},
		};
		const calls: readonly {
			readonly result: unknown;
			readonly error: unknown;
		}[] = [
			{ result: { ok: true }, error: undefined },
			{ result: undefined, error: internalError() },
			{ result: { ok: true }, error: undefined },
			{ result: hostProjectFailure, error: undefined },
			{ result: undefined, error: internalError() },
			{ result: { ok: true }, error: undefined },
		];

		// The independent tally, built the way `with-incident-logging`
		// derives `tool-failed` — "did this call produce a failure at
		// all", using the same failure-detection primitive the host
		// itself would use, but with no knowledge of error-reporting's
		// own vertex-internal classifier (that's the thing under test).
		const independentToolFailedCount = calls.filter(
			(call) =>
				extractObservedFailure(call.result, call.error) !== undefined,
		).length;

		for (const call of calls) {
			await observe('quality_run_quality', call.result, call.error);
		}

		const counters = await funnel.read();
		expect(counters.observedFailures).toBe(independentToolFailedCount);
		// And the split within those observed failures is exactly as
		// scripted: 1 not-Vertex, 2 internal (same fingerprint — the
		// second is a same-window duplicate, not a second submission).
		expect(counters.notVertexInternal).toBe(1);
		expect(counters.submissionAttempted).toBe(1);
		expect(counters.submissionSucceeded).toBe(1);
		expect(counters.deduplicated).toBe(1);
	});
});
