/**
 * error-collector-wiring.spec.ts — f00251 S2.
 *
 * Behavioral tests for the error-collector assembly path:
 *   A. Plugin that registers an errorSink → collector fans out to it.
 *   B. No plugin registers a sink → ConsoleErrorSink fallback writes stderr.
 *   C. Two plugins each with a sink → fan-out reaches both with the same event.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';
import type { ICapturedError } from '../../../../src/lib/error-collection/types.js';
import type { IErrorSink } from '../../../../src/lib/error-collection/sink.interface.js';

// ---------------------------------------------------------------------------
// Shared test context
// ---------------------------------------------------------------------------

const CTX = {
	toolName: 'test_tool',
	packageId: 'test-package',
	pluginName: 'test-plugin',
} as const;

const buildArgs = (plugins: string[]) =>
	parseCliArgs(['--plugins=' + plugins.join(','), '--workspace=/ws'], '/cwd');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal sink that buffers every event it receives. */
function makeBufferSink(id: string): IErrorSink & { events: ICapturedError[] } {
	const events: ICapturedError[] = [];
	return {
		id,
		events,
		async record(event: ICapturedError): Promise<void> {
			events.push(event);
		},
	};
}

// ---------------------------------------------------------------------------
// Case A — single plugin sink
// ---------------------------------------------------------------------------

describe('Case A — single plugin with one errorSink', () => {
	it('collector fans out to the plugin sink', async () => {
		const sinkA = makeBufferSink('plugin-a');

		const fakePlugin = {
			name: 'pluginA',
			register: () => ({
				errorSinks: [sinkA] as readonly IErrorSink[],
			}),
		};

		const { errorCollector } = await assembleCliConfig(
			buildArgs(['pluginA']),
			{
				import: async () => ({ default: fakePlugin }),
				readFile: async () => undefined,
			},
		);

		expect(errorCollector).toBeDefined();

		const event = await errorCollector.record(new Error('boom'), CTX);

		expect(sinkA.events).toHaveLength(1);
		expect(sinkA.events[0]).toBe(event);
		expect(event.summary).toContain('boom');
	});
});

// ---------------------------------------------------------------------------
// Case B — no plugin sink → ConsoleErrorSink fallback
// ---------------------------------------------------------------------------

describe('Case B — no plugin registers a sink', () => {
	let stderrChunks: string[] = [];
	const originalWrite = process.stderr.write.bind(process.stderr);

	beforeEach(() => {
		stderrChunks = [];
		process.stderr.write = ((chunk: string | Uint8Array): boolean => {
			if (typeof chunk === 'string') stderrChunks.push(chunk);
			return true;
		}) as typeof process.stderr.write;
	});

	afterEach(() => {
		process.stderr.write = originalWrite;
	});

	it('collector still exists and ConsoleErrorSink writes to stderr', async () => {
		const noSinkPlugin = {
			name: 'noSink',
			register: () => ({}),
		};

		const { errorCollector } = await assembleCliConfig(
			buildArgs(['noSink']),
			{
				import: async () => ({ default: noSinkPlugin }),
				readFile: async () => undefined,
			},
		);

		expect(errorCollector).toBeDefined();

		await errorCollector.record(new TypeError('fallback check'), CTX);

		// ConsoleErrorSink writes one JSON line per event to stderr.
		const errorLines = stderrChunks.filter((c) => {
			try {
				const parsed = JSON.parse(c) as { sink?: string };
				return parsed.sink === 'console-error';
			} catch {
				return false;
			}
		});
		expect(errorLines.length).toBeGreaterThanOrEqual(1);
	});
});

// ---------------------------------------------------------------------------
// Case C — two plugins, each with one sink → fan-out to both
// ---------------------------------------------------------------------------

describe('Case C — two plugins each with a distinct errorSink', () => {
	it('fan-out delivers the same redacted event to both sinks', async () => {
		const sinkA = makeBufferSink('plugin-a');
		const sinkB = makeBufferSink('plugin-b');

		const pluginA = {
			name: 'pluginA',
			register: () => ({ errorSinks: [sinkA] as readonly IErrorSink[] }),
		};
		const pluginB = {
			name: 'pluginB',
			register: () => ({ errorSinks: [sinkB] as readonly IErrorSink[] }),
		};

		const { errorCollector } = await assembleCliConfig(
			buildArgs(['pluginA', 'pluginB']),
			{
				// resolvePluginSpecifier expands 'pluginA' → '@mcp-vertex/pluginA', etc.
				import: async (specifier: string) => {
					if (specifier.includes('pluginB'))
						return { default: pluginB };
					return { default: pluginA };
				},
				readFile: async () => undefined,
			},
		);

		expect(errorCollector).toBeDefined();

		await errorCollector.record(new RangeError('fan-out test'), CTX);

		expect(sinkA.events).toHaveLength(1);
		expect(sinkB.events).toHaveLength(1);

		// Both sinks received the same redacted event.
		expect(sinkA.events[0]?.fingerprint).toBe(sinkB.events[0]?.fingerprint);
		expect(sinkA.events[0]?.summary).toBe(sinkB.events[0]?.summary);
	});
});
