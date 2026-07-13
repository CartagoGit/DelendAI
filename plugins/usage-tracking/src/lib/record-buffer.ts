/**
 * record-buffer.ts — the buffered, non-blocking NDJSON append writer.
 *
 * CRITICAL C2 fix + AGENTS.md rule 3 ("async I/O only in hot paths"):
 * `push()` is O(1) and NEVER touches disk — it snapshots the record in
 * memory and schedules a flush. The flush coalesces records into at most
 * one fsync per **250ms** window OR per **64 entries** (whichever comes
 * first), so a burst of 1000 tool calls costs a handful of appends, not
 * 1000 fsyncs. This keeps the orchestrator's own p99 latency flat under
 * load (regression < 5ms).
 *
 * Durable-write posture (AGENTS.md rules 4 + 6): every flush runs the
 * serialized batch through `redactSecrets` FIRST, then appends via
 * `fs/promises.appendFile` guarded by a single shared `withFileMutex` on
 * the log path — a safe async append, not a read-modify-write, so a
 * growing `invocations.jsonl` never rewrites megabytes on every call.
 */
import { appendFile } from 'node:fs/promises';

import { redactSecrets, withFileMutex } from '@mcp-vertex/core/public';

export interface IRecordBufferOptions {
	/** Flush no later than this many ms after the first buffered record. */
	readonly maxDelayMs?: number;
	/** Flush as soon as the buffer reaches this many records. */
	readonly maxBatch?: number;
}

const DEFAULT_MAX_DELAY_MS = 250;
const DEFAULT_MAX_BATCH = 64;

/**
 * x00097 S3 (audit a00052: "close desconectado"): every live buffer is
 * tracked module-wide and drained once on `beforeExit`. The flush timer is
 * deliberately unref'd (a pending record must never keep the host alive),
 * which used to mean a natural exit silently dropped the tail of the log.
 * Signal-driven `process.exit()` paths still cannot await async I/O — this
 * covers the normal event-loop-drained exit.
 */
const liveBuffers = new Set<RecordBuffer>();
let exitHookInstalled = false;

/** Drain every live buffer to disk (wired to `beforeExit`; test seam). */
export const drainLiveBuffers = async (): Promise<void> => {
	await Promise.all([...liveBuffers].map((buffer) => buffer.close()));
};

const installExitHook = (): void => {
	if (exitHookInstalled) return;
	exitHookInstalled = true;
	process.once('beforeExit', () => {
		void drainLiveBuffers();
	});
};

/**
 * Buffered append writer for one NDJSON file. One instance per plugin
 * boot; the flush is serialized on the file mutex so concurrent instances
 * (or a concurrent rollup read) never interleave a partial line.
 */
export class RecordBuffer {
	private readonly pending: unknown[] = [];
	private timer: ReturnType<typeof setTimeout> | null = null;
	/** The in-flight drain, shared so every `flush()` awaits the real write. */
	private flushPromise: Promise<void> | null = null;
	private readonly maxDelayMs: number;
	private readonly maxBatch: number;

	constructor(
		private readonly filePath: string,
		options: IRecordBufferOptions = {},
	) {
		this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
		this.maxBatch = options.maxBatch ?? DEFAULT_MAX_BATCH;
		installExitHook();
	}

	/** Hot-path entry point. Synchronous, non-blocking, never awaits I/O. */
	push(record: unknown): void {
		liveBuffers.add(this);
		this.pending.push(record);
		if (this.pending.length >= this.maxBatch) {
			this.cancelTimer();
			void this.flush();
			return;
		}
		if (this.timer === null) {
			this.timer = setTimeout(() => {
				this.timer = null;
				void this.flush();
			}, this.maxDelayMs);
			// Never keep the process alive just to drain the buffer.
			this.timer.unref?.();
		}
	}

	/** How many records are still buffered (test/introspection aid). */
	get bufferedCount(): number {
		return this.pending.length;
	}

	private cancelTimer(): void {
		if (this.timer !== null) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	/**
	 * Drain the buffer to disk. Concurrency-safe: a call made while a drain
	 * is in flight returns the SAME promise, so `await flush()` always waits
	 * for the bytes to actually land. Errors are surfaced to `onError` (not
	 * thrown) so a transient fs hiccup never rejects a tool handler.
	 */
	flush(): Promise<void> {
		this.cancelTimer();
		if (this.flushPromise) return this.flushPromise;
		if (this.pending.length === 0) return Promise.resolve();
		this.flushPromise = this.drain().finally(() => {
			this.flushPromise = null;
			if (this.pending.length === 0) liveBuffers.delete(this);
		});
		return this.flushPromise;
	}

	private async drain(): Promise<void> {
		try {
			while (this.pending.length > 0) {
				const batch = this.pending.splice(0, this.pending.length);
				const serialized = batch
					.map((record) => JSON.stringify(record))
					.join('\n');
				const { text } = redactSecrets(`${serialized}\n`);
				await withFileMutex(this.filePath, () =>
					appendFile(this.filePath, text, 'utf8'),
				);
			}
		} catch (error) {
			this.onError(error);
		}
	}

	/** Flush any remaining records, draining fully (call on shutdown). */
	async close(): Promise<void> {
		try {
			do {
				await this.flush();
			} while (this.pending.length > 0);
		} finally {
			liveBuffers.delete(this);
		}
	}

	/**
	 * Drop the buffered records and wait out any in-flight drain
	 * (x00097 S3: `usage_clear` support). Without this barrier a wipe of
	 * `invocations.jsonl` raced the next flush, which re-appended the
	 * supposedly-cleared records. Records pushed AFTER the barrier are new
	 * history and stay buffered.
	 */
	async clear(): Promise<void> {
		this.cancelTimer();
		this.pending.length = 0;
		if (this.flushPromise) await this.flushPromise;
		if (this.pending.length === 0) liveBuffers.delete(this);
	}

	/**
	 * Overridable error sink. Default writes a single stderr line — the
	 * log is observability, not a hard dependency, so a write failure must
	 * never break the tool call that triggered it.
	 */
	protected onError(error: unknown): void {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`[usage-tracking] append failed: ${message}\n`);
	}
}
