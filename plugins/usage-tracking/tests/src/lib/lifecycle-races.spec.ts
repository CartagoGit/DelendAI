/**
 * lifecycle-races.spec.ts — usage-tracking rollup + shutdown lifecycle
 * (x00097 S3, audit a00052 #13 and the "usage buffer vs shutdown/clear"
 * concurrency gaps).
 *
 * Three hardened behaviours:
 * 1. `regenerateSummary` runs its prior-read → build → write as ONE
 *    transaction under the summary mutex, so a `recordDegradation`
 *    landing mid-regeneration is never overwritten with a stale list.
 * 2. `RecordBuffer.clear()` drops pending records and waits out the
 *    in-flight drain, so `usage_clear` can wipe the log without the
 *    cleared records re-appearing on the next flush.
 * 3. Live buffers drain on `beforeExit` (the flush timer is unref'd, so
 *    a natural exit used to drop the buffered tail silently).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@mcp-vertex/core/public';

import plugin from '../../../src/index';
import { recordDegradation } from '../../../src/lib/circuit-breaker';
import { drainLiveBuffers, RecordBuffer } from '../../../src/lib/record-buffer';
import { regenerateSummary } from '../../../src/lib/rollup';
import type { IDegradation, IUsageSummary } from '../../../src/lib/types';

const degradation = (index: number): IDegradation => ({
	at: new Date().toISOString(),
	scope: 'session',
	fromProvider: `provider-${index}`,
	toProvider: 'fallback',
	observedUsd: 10 + index,
	limitUsd: 10,
});

const readLines = (path: string): string[] => {
	try {
		return readFileSync(path, 'utf8')
			.split('\n')
			.filter((line) => line.trim() !== '');
	} catch {
		return [];
	}
};

describe('usage-tracking lifecycle races (x00097 S3)', () => {
	let dir = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'ut-lifecycle-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('summary regeneration racing degradation appends loses nothing (barrier)', async () => {
		const invocationsPath = join(dir, 'invocations.jsonl');
		const summaryPath = join(dir, 'usage-summary.json');
		const N = 6;

		// Barrier: N degradation appends and N regenerations interleave on
		// the same summary file. Pre-mutex, a regeneration that read the
		// prior list before an append persisted after it dropped the event.
		await Promise.all([
			...Array.from({ length: N }, (_, i) =>
				recordDegradation(summaryPath, degradation(i)),
			),
			...Array.from({ length: N }, () =>
				regenerateSummary(invocationsPath, summaryPath, 7),
			),
		]);
		// One final regeneration so the summary is rollup-shaped either way.
		await regenerateSummary(invocationsPath, summaryPath, 7);

		const summary = JSON.parse(
			readFileSync(summaryPath, 'utf8'),
		) as IUsageSummary;
		const providers = summary.degradations
			.map((d) => d.fromProvider)
			.sort();
		expect(providers).toEqual(
			Array.from({ length: N }, (_, i) => `provider-${i}`).sort(),
		);
	});

	it('clear() drops pending records and bars the in-flight drain', async () => {
		const logPath = join(dir, 'invocations.jsonl');
		const buffer = new RecordBuffer(logPath, { maxDelayMs: 10_000 });
		buffer.push({ id: 'stale-1' });
		buffer.push({ id: 'stale-2' });

		await buffer.clear();
		expect(buffer.bufferedCount).toBe(0);

		// Post-clear pushes are NEW history and must still land.
		buffer.push({ id: 'fresh' });
		await buffer.close();

		const lines = readLines(logPath);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain('fresh');
	});

	it('usage_clear through the real manifest does not resurrect buffered records', async () => {
		const ctx = {
			workspace: { root: dir, resolve: (p: string) => join(dir, p) },
			corePaths: { cacheDir: '.cache', docsDir: 'docs' },
			cacheDir: '.cache',
			docsDir: 'docs',
			keepLegacy: false,
			pluginCacheDir: 'usage-tracking',
			namespacePrefix: 'mcp-vertex',
			options: { maxDelayMs: 10_000 },
			args: {},
		} as unknown as IMcpPluginContext;
		const regs = await plugin.register(ctx);

		type Handler = (args: unknown) => Promise<unknown>;
		const handlers = new Map<string, Handler>();
		const server = {
			registerTool: (name: string, _config: unknown, h: Handler) => {
				handlers.set(name, h);
			},
		} as unknown as Parameters<
			NonNullable<typeof regs.tools>[number]['register']
		>[0];
		for (const reg of regs.tools ?? []) await reg.register(server);

		// Buffer two records WITHOUT flushing, then wipe.
		regs.onToolCall?.('mcp-vertex_overview', {}, undefined, undefined);
		regs.onToolCall?.('mcp-vertex_overview', {}, undefined, undefined);
		await handlers.get('mcp-vertex_usage_clear')!({ confirm: true });

		// A later record is new history; the two pre-clear ones must be gone.
		regs.onToolCall?.('mcp-vertex_status', {}, undefined, undefined);
		await drainLiveBuffers();

		const logPath = join(dir, 'usage-tracking', 'invocations.jsonl');
		const lines = readLines(logPath);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain('status');
	});

	it('beforeExit drains live buffers (unref timer no longer drops the tail)', async () => {
		const logPath = join(dir, 'tail.jsonl');
		const buffer = new RecordBuffer(logPath, { maxDelayMs: 60_000 });
		buffer.push({ id: 'tail-record' });
		expect(readLines(logPath)).toHaveLength(0);

		// The hook body is `void drainLiveBuffers()`; awaiting the exported
		// drain is the deterministic equivalent of the beforeExit firing.
		process.emit('beforeExit', 0);
		await drainLiveBuffers();

		expect(readLines(logPath)).toHaveLength(1);
		expect(buffer.bufferedCount).toBe(0);
	});
});
