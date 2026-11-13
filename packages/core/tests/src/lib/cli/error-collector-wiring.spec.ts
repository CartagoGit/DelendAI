/**
 * error-collector-wiring.spec.ts — f00251 S2.
 *
 * Behavioral tests for the error-collector assembly path:
 *   A. Plugin that registers an errorSink → collector fans out to it.
 *   B. No plugin registers a sink → ConsoleErrorSink fallback writes stderr.
 *   C. Two plugins each with a sink → fan-out reaches both with the same event.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import z from 'zod';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { createMcpProject } from '@delendai/core/lib/project/create-mcp-project';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';
import { toolError, toolOk } from '../../../../src/lib/shared/tool-response.js';
import type { ICapturedError } from '../../../../src/lib/error-collection/types.js';
import type { IErrorSink } from '../../../../src/lib/error-collection/sink.interface.js';
import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

// ---------------------------------------------------------------------------
// Shared test context
// ---------------------------------------------------------------------------

const CTX = {
	toolName: 'test_tool',
	packageId: 'test-package',
	pluginName: 'test-plugin',
} as const;

const WRITABLE_WORKSPACE = createTestWorkspace('delendai-errors-');
afterAll(() => removeTestWorkspace(WRITABLE_WORKSPACE));

const buildArgs = (plugins: string[]) =>
	parseCliArgs(
		[
			`--plugins=${plugins.join(',')}`,
			`--workspace=${WRITABLE_WORKSPACE}`,
			'--surface=native',
		],
		WRITABLE_WORKSPACE,
	);

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

const invokeToolThroughMcp = async (input: {
	readonly plugins: readonly string[];
	readonly importPlugin: (specifier: string) => Promise<{ default: unknown }>;
	readonly toolName: string;
}): Promise<unknown> => {
	const { config } = await assembleCliConfig(buildArgs([...input.plugins]), {
		import: input.importPlugin,
		readFile: async () => undefined,
	});
	const project = await createMcpProject(config);
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	const client = new Client(
		{ name: 'error-pipeline-test', version: '0.0.0' },
		{ capabilities: {} },
	);
	try {
		await project.server.connect(serverTransport);
		await client.connect(clientTransport);
		return await client.callTool({
			name: input.toolName,
			arguments: {},
		});
	} finally {
		await client.close();
		await project.server.close();
	}
};

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
				// resolvePluginSpecifier expands 'pluginA' → '@delendai/pluginA', etc.
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

describe('Case D — failing tool observed through the assembled MCP pipeline', () => {
	it('preserves the MCP error while notifying every onToolCall observer', async () => {
		const observed: Array<{ toolName: string; error: unknown }> = [];
		const observerPlugin = {
			name: 'observer',
			register: () => ({
				onToolCall: async (
					toolName: string,
					_args: unknown,
					_result: unknown,
					error?: unknown,
				) => {
					observed.push({ toolName, error });
				},
			}),
		};
		const failingPlugin = {
			name: 'failing',
			register: () => ({
				tools: [
					{
						id: 'fail',
						register: async (server: unknown) => {
							(
								server as {
									registerTool: (
										name: string,
										config: unknown,
										handler: () => Promise<unknown>,
									) => unknown;
								}
							).registerTool(
								'fail_tool',
								{
									description: 'Always fails',
									inputSchema: z.object({}),
									outputSchema: z.object({ ok: z.boolean() }),
								},
								async () => {
									throw new Error(
										'upstream failure: API_KEY=sk-observed-secret',
									);
								},
							);
						},
					},
				],
			}),
		};
		const { config } = await assembleCliConfig(
			buildArgs(['failing', 'observer']),
			{
				import: async (specifier: string) => ({
					default: specifier.includes('observer')
						? observerPlugin
						: failingPlugin,
				}),
				readFile: async () => undefined,
			},
		);
		const project = await createMcpProject(config);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		const client = new Client(
			{ name: 'error-pipeline-test', version: '0.0.0' },
			{ capabilities: {} },
		);
		try {
			await project.server.connect(serverTransport);
			await client.connect(clientTransport);
			const result = await client.callTool({
				name: 'fail_tool',
				arguments: {},
			});
			expect(result.isError).toBe(true);
			for (
				let attempt = 0;
				attempt < 10 && observed.length === 0;
				attempt += 1
			) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			expect(observed).toHaveLength(1);
			const firstObserved = observed[0];
			expect(firstObserved?.toolName).toBe('fail_tool');
			expect(firstObserved?.error).toBeInstanceOf(Error);
			if (firstObserved?.error instanceof Error) {
				expect(firstObserved.error.message).toContain(
					'upstream failure',
				);
			}
		} finally {
			await client.close();
			await project.server.close();
		}
	});
});

describe('Case E — withErrorCollection auto-wired into registered tool handlers', () => {
	it('captures thrown handler errors with the registered tool id and plugin metadata', async () => {
		const sink = makeBufferSink('errors');
		const toolName = 'delendai_throwing_boom';
		const throwingPlugin = {
			name: 'throwing',
			register: () => ({
				tools: [
					{
						id: 'boom',
						register: async (server: unknown) => {
							(
								server as {
									registerTool: (
										name: string,
										config: unknown,
										handler: () => Promise<unknown>,
									) => unknown;
								}
							).registerTool(
								toolName,
								{
									description: 'Always throws',
									inputSchema: z.object({}),
									outputSchema: z.object({ ok: z.boolean() }),
								},
								async () => {
									throw new Error(
										'boom from registered tool',
									);
								},
							);
						},
					},
				],
			}),
		};
		const sinkPlugin = {
			name: 'sink',
			register: () => ({ errorSinks: [sink] as readonly IErrorSink[] }),
		};

		const result = (await invokeToolThroughMcp({
			plugins: ['throwing', 'sink'],
			toolName,
			importPlugin: async (specifier: string) => ({
				default: specifier.includes('sink')
					? sinkPlugin
					: throwingPlugin,
			}),
		})) as { isError?: boolean };

		expect(result.isError).toBe(true);
		expect(sink.events).toHaveLength(1);
		expect(sink.events[0]).toMatchObject({
			toolName,
			packageId: '@delendai/throwing',
			pluginName: 'throwing',
		});
	});

	it('does not double-log a handled { ok: false } tool envelope', async () => {
		const sink = makeBufferSink('errors');
		const toolName = 'delendai_handled_failure';
		const handledPlugin = {
			name: 'handled',
			register: () => ({
				tools: [
					{
						id: 'failure',
						register: async (server: unknown) => {
							(
								server as {
									registerTool: (
										name: string,
										config: unknown,
										handler: () => Promise<unknown>,
									) => unknown;
								}
							).registerTool(
								toolName,
								{
									description:
										'Returns a handled failure envelope',
									inputSchema: z.object({}),
									outputSchema: z.object({ ok: z.boolean() }),
								},
								async () =>
									toolError('expected handled failure'),
							);
						},
					},
				],
			}),
		};
		const sinkPlugin = {
			name: 'sink',
			register: () => ({ errorSinks: [sink] as readonly IErrorSink[] }),
		};

		const result = (await invokeToolThroughMcp({
			plugins: ['handled', 'sink'],
			toolName,
			importPlugin: async (specifier: string) => ({
				default: specifier.includes('sink')
					? sinkPlugin
					: handledPlugin,
			}),
		})) as { isError?: boolean };

		expect(result.isError).toBe(true);
		expect(sink.events).toHaveLength(0);
	});

	it('does not emit an error event on a successful handler result', async () => {
		const sink = makeBufferSink('errors');
		const toolName = 'delendai_success_ok';
		const successPlugin = {
			name: 'success',
			register: () => ({
				tools: [
					{
						id: 'ok',
						register: async (server: unknown) => {
							(
								server as {
									registerTool: (
										name: string,
										config: unknown,
										handler: () => Promise<unknown>,
									) => unknown;
								}
							).registerTool(
								toolName,
								{
									description: 'Returns success',
									inputSchema: z.object({}),
									outputSchema: z.object({ ok: z.boolean() }),
								},
								async () => toolOk({ value: 'ok' }),
							);
						},
					},
				],
			}),
		};
		const sinkPlugin = {
			name: 'sink',
			register: () => ({ errorSinks: [sink] as readonly IErrorSink[] }),
		};

		const result = (await invokeToolThroughMcp({
			plugins: ['success', 'sink'],
			toolName,
			importPlugin: async (specifier: string) => ({
				default: specifier.includes('sink')
					? sinkPlugin
					: successPlugin,
			}),
		})) as { isError?: boolean; structuredContent?: { ok?: boolean } };

		expect(result.isError).not.toBe(true);
		expect(result.structuredContent?.ok).toBe(true);
		expect(sink.events).toHaveLength(0);
	});
});
