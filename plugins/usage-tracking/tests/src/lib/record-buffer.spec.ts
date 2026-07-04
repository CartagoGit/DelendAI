/**
 * record-buffer.spec.ts — the CRITICAL buffered-append contract.
 *
 * Acceptance (f00067 S3 / CRITICAL C2 + AGENTS.md rule 3):
 *   - append is buffered: one flush per ≤250ms window OR ≤64 entries;
 *   - `push()` is non-blocking (no I/O on the hot path); p99 well under
 *     5ms across 1000 calls;
 *   - every buffered record survives a flush (durable append via
 *     appendFile under withFileMutex);
 *   - secrets are redacted before the bytes land on disk.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RecordBuffer } from '../../../src/lib/record-buffer';

const readLines = (path: string): string[] =>
	readFileSync(path, 'utf8')
		.split('\n')
		.filter((line) => line.trim() !== '');

describe('RecordBuffer (CRITICAL C2 buffered append)', () => {
	let dir = '';
	let logPath = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'ut-buf-'));
		logPath = join(dir, 'invocations.jsonl');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('does not touch disk synchronously on push (batch not yet reached)', () => {
		const buf = new RecordBuffer(logPath, {
			maxBatch: 64,
			maxDelayMs: 250,
		});
		buf.push({ n: 1 });
		expect(buf.bufferedCount).toBe(1);
		// Nothing written yet — the flush is deferred.
		expect(() => readFileSync(logPath, 'utf8')).toThrow();
	});

	it('flushes as soon as the batch size is reached', async () => {
		const buf = new RecordBuffer(logPath, {
			maxBatch: 8,
			maxDelayMs: 10_000,
		});
		for (let i = 0; i < 8; i += 1) buf.push({ n: i });
		// Give the fire-and-forget flush a tick to complete.
		await buf.flush();
		expect(readLines(logPath)).toHaveLength(8);
	});

	it('flushes on the time window when the batch is not filled', async () => {
		const buf = new RecordBuffer(logPath, { maxBatch: 64, maxDelayMs: 20 });
		buf.push({ n: 1 });
		buf.push({ n: 2 });
		await new Promise((r) => setTimeout(r, 60));
		expect(readLines(logPath)).toHaveLength(2);
	});

	it('loses no records across a 1000-call burst', async () => {
		const buf = new RecordBuffer(logPath, { maxBatch: 64, maxDelayMs: 50 });
		for (let i = 0; i < 1000; i += 1) buf.push({ n: i });
		await buf.close();
		const lines = readLines(logPath);
		expect(lines).toHaveLength(1000);
		const ns = new Set(
			lines.map((l) => (JSON.parse(l) as { n: number }).n),
		);
		expect(ns.size).toBe(1000);
	});

	it('keeps push() well under the 5ms p99 budget across 1000 calls', async () => {
		const buf = new RecordBuffer(logPath, {
			maxBatch: 64,
			maxDelayMs: 250,
		});
		const samples: number[] = [];
		for (let i = 0; i < 1000; i += 1) {
			const start = performance.now();
			buf.push({ n: i, payload: 'x'.repeat(64) });
			samples.push(performance.now() - start);
		}
		samples.sort((a, b) => a - b);
		const p99 = samples[Math.floor(samples.length * 0.99)] ?? 0;
		expect(p99).toBeLessThan(5);
		// Drain so the deferred flush timer doesn't outlive the temp dir.
		await buf.close();
	});

	it('redacts secrets before the record hits disk', async () => {
		const buf = new RecordBuffer(logPath, { maxBatch: 1, maxDelayMs: 10 });
		buf.push({
			note: 'token sk-ant-api03-DEADBEEFdeadbeefDEADBEEFdeadbeef00',
		});
		await buf.flush();
		const raw = readFileSync(logPath, 'utf8');
		expect(raw).toContain('[REDACTED]');
		expect(raw).not.toContain('DEADBEEF');
	});

	it('serialises concurrent flushes without interleaving lines', async () => {
		const buf = new RecordBuffer(logPath, { maxBatch: 4, maxDelayMs: 5 });
		await Promise.all(
			Array.from({ length: 200 }, (_, i) => {
				buf.push({ n: i });
				return Promise.resolve();
			}),
		);
		await buf.close();
		const lines = readLines(logPath);
		// Every line is a complete, parseable JSON object (no torn writes).
		for (const line of lines) {
			expect(() => JSON.parse(line)).not.toThrow();
		}
		expect(lines).toHaveLength(200);
	});
});
