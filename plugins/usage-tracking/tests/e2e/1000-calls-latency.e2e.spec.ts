/**
 * 1000-calls-latency.e2e.spec.ts — f00067 S10 usage-tracking overhead smoke.
 *
 * Acceptance: "fire 1000 tool calls; assert usage-tracking's added p99
 * latency overhead is bounded."
 *
 * This runs the SAME 1000-call scenario twice in one process: once WITHOUT
 * the record path (baseline = the bare tool call) and once WITH it (the bare
 * tool call + the REAL `buildRecord` + the REAL `RecordBuffer.push`). It
 * measures the per-call overhead the plugin actually adds on the hot path.
 *
 * ANTI-FLAKE CHOICE (deliberate — this file runs inside the normal 3900+
 * test parallel suite, where absolute wall-clock thresholds flake under CPU
 * load): we do NOT assert an absolute p99 like `< 5ms`. The PRIMARY, timing-
 * free guarantee we assert is the STRUCTURAL one that actually matters:
 *   1. `push()` does ZERO synchronous disk work — after a fully synchronous
 *      1000-push burst, not one byte has landed (flushes are async/batched),
 *      so the append is buffered, not O(N) per call; and
 *   2. every record still survives the drain (no loss).
 * The timing assertion is kept only as a loose sanity net with a very wide
 * margin (multiple + absolute slack) computed from the SAME-process baseline,
 * and it reads p99 (not max) so a stray GC pause in the top 1% is ignored.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildRecord } from '../../src/lib/record';
import { RecordBuffer } from '../../src/lib/record-buffer';

const N = 1000;

const readLines = (path: string): string[] => {
	try {
		return readFileSync(path, 'utf8')
			.split('\n')
			.filter((line) => line.trim() !== '');
	} catch {
		return [];
	}
};

const p99Of = (samples: number[]): number => {
	const sorted = [...samples].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length * 0.99)] ?? 0;
};

/** The "tool result" a call produces — the work both scenarios share. */
const makeResult = (i: number): unknown => ({
	structuredContent: { usage: { inputTokens: i, outputTokens: i } },
});

const buildOneRecord = (result: unknown): unknown =>
	buildRecord({
		toolName: 'orchestrator-runner_invoke',
		corePrefix: 'mcp-vertex',
		peerPrefixes: ['orchestrator-runner'],
		agent: { id: 'agent-a', kind: 'claude-code', extension: 'cli' },
		sessionId: 'sess-latency',
		args: {},
		result,
		endedAt: 1_752_000_000_000,
		costOf: () => null,
	});

describe('f00067 S10 — 1000-call usage-tracking latency overhead', () => {
	let dir = '';
	let logPath = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'ut-s10-'));
		logPath = join(dir, 'invocations.jsonl');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('adds only a bounded, buffered (non-blocking) overhead across 1000 calls', async () => {
		const buf = new RecordBuffer(logPath, { maxBatch: 64, maxDelayMs: 250 });

		// Warm up both paths so JIT/allocation noise does not skew the first
		// samples (still deterministic — no timers, no I/O awaited here).
		for (let i = 0; i < 100; i += 1) {
			const r = makeResult(i);
			void makeResult(i);
			void buildOneRecord(r);
		}

		// --- Baseline: the bare tool call (no record path). ---
		const baseline: number[] = [];
		for (let i = 0; i < N; i += 1) {
			const start = performance.now();
			const result = makeResult(i);
			// Touch the result so the work is not optimised away.
			if (result === undefined) throw new Error('unreachable');
			baseline.push(performance.now() - start);
		}

		// --- With tracking: the same call + buildRecord + buffered push. ---
		const withTracking: number[] = [];
		for (let i = 0; i < N; i += 1) {
			const start = performance.now();
			const result = makeResult(i);
			const record = buildOneRecord(result);
			buf.push(record);
			withTracking.push(performance.now() - start);
		}

		// PRIMARY GUARANTEE #1 — the append is buffered, NOT synchronous disk
		// work: after a fully synchronous 1000-push burst, the event loop has
		// not yet run any async flush, so nothing has landed on disk. This is
		// timing-free and cannot flake under load.
		expect(readLines(logPath)).toHaveLength(0);

		// PRIMARY GUARANTEE #2 — no record is lost once the buffer drains.
		await buf.close();
		expect(readLines(logPath)).toHaveLength(N);

		// SECONDARY sanity net — the added p99 overhead stays within a very
		// wide margin of the same-process baseline. Wide on purpose: 3x plus a
		// 5ms absolute slack, read at p99 (not max), so a top-1% GC pause is
		// ignored and this never flakes under the parallel suite.
		const baselineP99 = p99Of(baseline);
		const withP99 = p99Of(withTracking);
		const bound = baselineP99 * 3 + 5;
		expect(withP99).toBeLessThanOrEqual(bound);
	});
});
