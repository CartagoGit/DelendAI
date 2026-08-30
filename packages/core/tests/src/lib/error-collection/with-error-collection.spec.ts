/**
 * with-error-collection.spec.ts — f00251 S1.
 *
 * Tests for `withErrorCollection`.
 */
import { describe, expect, it, vi } from 'vitest';

import { withErrorCollection } from '../../../../src/lib/error-collection/with-error-collection.js';
import { createErrorCollector } from '../../../../src/lib/error-collection/collector.service.js';
import { BufferingErrorSink } from '../../../../src/lib/error-collection/buffering-sink.js';

const TOOL_META = {
	toolName: 'wrapped_tool',
	packageId: 'test-package',
	pluginName: 'test-plugin',
} as const;

// ---------------------------------------------------------------------------
// Success path
// ---------------------------------------------------------------------------

describe('withErrorCollection — success path', () => {
	it('returns the handler result when it resolves', async () => {
		const buf = new BufferingErrorSink();
		const collector = createErrorCollector({ sinks: [buf] });

		const safe = withErrorCollection(
			async (_args: { value: number }) => _args.value * 2,
			{ toolMeta: TOOL_META, collector },
		);

		const result = await safe({ value: 21 });
		expect(result).toBe(42);
	});

	it('does not call collector.record on success', async () => {
		const buf = new BufferingErrorSink();
		const collector = createErrorCollector({ sinks: [buf] });
		const recordSpy = vi.spyOn(collector, 'record');

		const safe = withErrorCollection(async (_args: undefined) => 'ok', {
			toolMeta: TOOL_META,
			collector,
		});

		await safe(undefined);
		expect(recordSpy).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Error path
// ---------------------------------------------------------------------------

describe('withErrorCollection — error path', () => {
	it('rethrows the original error unchanged', async () => {
		const buf = new BufferingErrorSink();
		const collector = createErrorCollector({ sinks: [buf] });
		const original = new TypeError('expected failure');

		const safe = withErrorCollection(
			async (_args: undefined): Promise<void> => {
				throw original;
			},
			{ toolMeta: TOOL_META, collector },
		);

		const caught = await safe(undefined).catch((e: unknown) => e);
		expect(caught).toBe(original); // same identity
	});

	it('calls collector.record exactly once when the handler throws', async () => {
		const buf = new BufferingErrorSink();
		const collector = createErrorCollector({ sinks: [buf] });
		const recordSpy = vi.spyOn(collector, 'record');

		const safe = withErrorCollection(
			async (_args: undefined): Promise<void> => {
				throw new RangeError('out of range');
			},
			{ toolMeta: TOOL_META, collector },
		);

		await safe(undefined).catch(() => {
			/* expected */
		});
		expect(recordSpy).toHaveBeenCalledOnce();
	});

	it('the captured event is present in the sink after a throw', async () => {
		const buf = new BufferingErrorSink();
		const collector = createErrorCollector({ sinks: [buf] });

		const safe = withErrorCollection(
			async (_args: undefined): Promise<void> => {
				throw new Error('boom');
			},
			{ toolMeta: TOOL_META, collector },
		);

		await safe(undefined).catch(() => {
			/* expected */
		});
		expect(buf.events).toHaveLength(1);
		expect(buf.events[0]?.kind).toBe('captured-error');
	});
});

// ---------------------------------------------------------------------------
// onError hook
// ---------------------------------------------------------------------------

describe('withErrorCollection — onError hook', () => {
	it('invokes onError with the redacted ICapturedError', async () => {
		const buf = new BufferingErrorSink();
		const collector = createErrorCollector({ sinks: [buf] });
		const onError = vi.fn();

		const safe = withErrorCollection(
			async (_args: undefined): Promise<void> => {
				throw new TypeError('hook test');
			},
			{ toolMeta: TOOL_META, collector, onError },
		);

		await safe(undefined).catch(() => {
			/* expected */
		});
		expect(onError).toHaveBeenCalledOnce();
		const captured = onError.mock.calls[0]?.[0] as { kind: string };
		expect(captured.kind).toBe('captured-error');
	});

	it('onError receives the same event that the sink recorded', async () => {
		const buf = new BufferingErrorSink();
		const collector = createErrorCollector({ sinks: [buf] });
		let hookEvent: unknown;

		const safe = withErrorCollection(
			async (_args: undefined): Promise<void> => {
				throw new TypeError('same ref');
			},
			{
				toolMeta: TOOL_META,
				collector,
				onError: (ev) => {
					hookEvent = ev;
				},
			},
		);

		await safe(undefined).catch(() => {
			/* expected */
		});
		expect(hookEvent).toBe(buf.events[0]);
	});

	it('does not invoke onError on the success path', async () => {
		const buf = new BufferingErrorSink();
		const collector = createErrorCollector({ sinks: [buf] });
		const onError = vi.fn();

		const safe = withErrorCollection(
			async (_args: undefined) => 'success',
			{
				toolMeta: TOOL_META,
				collector,
				onError,
			},
		);

		await safe(undefined);
		expect(onError).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Synchronous-throw compatibility
// ---------------------------------------------------------------------------

describe('withErrorCollection — synchronous throws', () => {
	it('captures a synchronous throw by treating it as an async rejection', async () => {
		const buf = new BufferingErrorSink();
		const collector = createErrorCollector({ sinks: [buf] });
		const syncErr = new Error('sync fail');

		// A handler that throws synchronously before any await.
		const safe = withErrorCollection(
			(_args: undefined): Promise<void> => {
				throw syncErr;
			},
			{ toolMeta: TOOL_META, collector },
		);

		const caught = await safe(undefined).catch((e: unknown) => e);
		expect(caught).toBe(syncErr);
		expect(buf.events).toHaveLength(1);
	});
});
