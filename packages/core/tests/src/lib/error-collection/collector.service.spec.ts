/**
 * collector.service.spec.ts — f00251 S1.
 *
 * Tests for `createErrorCollector`.
 */
import { describe, expect, it, vi } from 'vitest';

import { createErrorCollector } from '../../../../src/lib/error-collection/collector.service.js';
import { BufferingErrorSink } from '../../../../src/lib/error-collection/buffering-sink.js';
import type { IErrorSink } from '../../../../src/lib/error-collection/sink.interface.js';
import type { ICapturedError } from '../../../../src/lib/error-collection/types.js';

const CTX = {
	toolName: 'test_tool',
	packageId: 'test-package',
	pluginName: 'test-plugin',
} as const;

// ---------------------------------------------------------------------------
// Fan-out
// ---------------------------------------------------------------------------

describe('createErrorCollector — fan-out', () => {
	it('delivers the redacted event to all sinks', async () => {
		const a = new BufferingErrorSink();
		// Give the second sink a different id so we can verify ordering.
		const b: IErrorSink & { events: readonly ICapturedError[] } = {
			id: 'alpha', // alphabetically before 'buffering'
			events: [] as ICapturedError[],
			async record(event: ICapturedError): Promise<void> {
				(this.events as ICapturedError[]).push(event);
			},
		};

		const collector = createErrorCollector({ sinks: [a, b] });
		await collector.record(new TypeError('bad arg'), CTX);

		expect(a.events).toHaveLength(1);
		expect(b.events).toHaveLength(1);
	});

	it('both sinks receive the SAME object reference (redacted once)', async () => {
		const sinkA = new BufferingErrorSink();
		const sinkB = new BufferingErrorSink();
		// Override id so both are distinct.
		Object.defineProperty(sinkB, 'id', { value: 'buffering-b' });

		const collector = createErrorCollector({ sinks: [sinkA, sinkB] });
		await collector.record(new Error('test'), CTX);

		expect(sinkA.events[0]).toBe(sinkB.events[0]);
	});
});

// ---------------------------------------------------------------------------
// Sink isolation
// ---------------------------------------------------------------------------

describe('createErrorCollector — sink isolation', () => {
	it('a throwing sink does not prevent the next sink from receiving the event', async () => {
		const throwing: IErrorSink = {
			id: 'aaa-throws', // sorted first
			async record(): Promise<void> {
				throw new Error('sink exploded');
			},
		};
		const buf = new BufferingErrorSink();

		const collector = createErrorCollector({
			sinks: [throwing, buf],
			onSinkError: () => {
				/* swallow */
			},
		});
		await collector.record(new TypeError('x'), CTX);

		expect(buf.events).toHaveLength(1);
	});

	it('invokes onSinkError with the failing sink id and the rejection', async () => {
		const sinkErr = new Error('io failure');
		const throwing: IErrorSink = {
			id: 'failing-sink',
			async record(): Promise<void> {
				throw sinkErr;
			},
		};

		const onSinkError = vi.fn();
		const collector = createErrorCollector({
			sinks: [throwing],
			onSinkError,
		});
		await collector.record(new Error('original'), CTX);

		expect(onSinkError).toHaveBeenCalledOnce();
		expect(onSinkError).toHaveBeenCalledWith('failing-sink', sinkErr);
	});

	it('never throws back to the caller even when all sinks fail', async () => {
		const bad: IErrorSink = {
			id: 'bad',
			async record(): Promise<void> {
				throw new Error('boom');
			},
		};
		const collector = createErrorCollector({
			sinks: [bad],
			onSinkError: () => {
				/* swallow */
			},
		});
		await expect(
			collector.record(new Error('test'), CTX),
		).resolves.not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// Deterministic ordering
// ---------------------------------------------------------------------------

describe('createErrorCollector — deterministic sink order', () => {
	it('delivers events sorted by sink id regardless of insertion order', async () => {
		const callOrder: string[] = [];
		function makeSink(id: string): IErrorSink {
			return {
				id,
				async record(): Promise<void> {
					callOrder.push(id);
				},
			};
		}

		const collector = createErrorCollector({
			sinks: [makeSink('zzz'), makeSink('aaa'), makeSink('mmm')],
		});
		await collector.record(new Error('x'), CTX);

		expect(callOrder).toEqual(['aaa', 'mmm', 'zzz']);
	});
});

// ---------------------------------------------------------------------------
// Fingerprint stability
// ---------------------------------------------------------------------------

describe('createErrorCollector — fingerprint', () => {
	it('produces the same fingerprint for the same error twice', async () => {
		const buf = new BufferingErrorSink();
		const err = new TypeError('stable');
		const collector = createErrorCollector({ sinks: [buf] });

		await collector.record(err, CTX);
		await collector.record(err, CTX);

		const [first, second] = buf.events;
		expect(first?.fingerprint).toBeDefined();
		expect(first?.fingerprint).toBe(second?.fingerprint);
	});

	it('produces different fingerprints for errors with different stacks', async () => {
		const buf = new BufferingErrorSink();
		const collector = createErrorCollector({ sinks: [buf] });

		const errA = new TypeError('x');
		const errB = new TypeError('x');
		// Artificially diverge the stack so they differ.
		errB.stack = 'TypeError: x\n    at differentFrame (other.ts:99:1)';

		await collector.record(errA, CTX);
		await collector.record(errB, CTX);

		const [a, b] = buf.events;
		expect(a?.fingerprint).not.toBe(b?.fingerprint);
	});
});

// ---------------------------------------------------------------------------
// Return value
// ---------------------------------------------------------------------------

describe('createErrorCollector — return value', () => {
	it('returns the redacted ICapturedError', async () => {
		const buf = new BufferingErrorSink();
		const collector = createErrorCollector({ sinks: [buf] });

		const captured = await collector.record(new TypeError('oops'), CTX);

		expect(captured).toBe(buf.events[0]);
		expect(captured.kind).toBe('captured-error');
		expect(typeof captured.fingerprint).toBe('string');
		expect(captured.fingerprint.length).toBeGreaterThan(0);
	});

	it('populates toolName and packageId from context', async () => {
		const buf = new BufferingErrorSink();
		const collector = createErrorCollector({ sinks: [buf] });

		await collector.record(new Error('ctx test'), CTX);

		const event = buf.events[0];
		expect(event?.toolName).toBe(CTX.toolName);
		expect(event?.packageId).toBe(CTX.packageId);
	});
});

// ---------------------------------------------------------------------------
// Clock injection
// ---------------------------------------------------------------------------

describe('createErrorCollector — clock injection', () => {
	it('uses the injected clock for ts', async () => {
		const fixed = new Date('2030-06-15T12:00:00.000Z');
		const buf = new BufferingErrorSink();
		const collector = createErrorCollector({
			sinks: [buf],
			clock: () => fixed,
		});

		await collector.record(new Error('time'), CTX);

		expect(buf.events[0]?.ts).toBe('2030-06-15T12:00:00.000Z');
	});
});
