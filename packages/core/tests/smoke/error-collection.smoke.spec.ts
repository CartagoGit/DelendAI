/**
 * error-collection.smoke.spec.ts — f00251 S5.
 *
 * End-to-end behavioral smoke test for the error-collection pipeline:
 *   - Real `assembleCliConfig` boots in a tmp workspace.
 *   - Real `logs` plugin wired as an IErrorSink adapter (JSONL path).
 *   - Inline buffer-stub plugin captures every event in memory.
 *   - A handler wrapped by `withErrorCollection` throws a secret-bearing error.
 *   - Assertions cover: fan-out to both sinks, redaction at every boundary,
 *     JSONL file contents, and ConsoleErrorSink fallback suppression.
 */
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';
import { BufferingErrorSink, withErrorCollection } from '@delendai/core/public';
import type { IErrorSink } from '@delendai/core/public';
import logsPlugin from '@delendai/logs';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('error-collection end-to-end smoke', () => {
	let tmpDir: string;
	let stderrChunks: string[];
	let originalWrite: typeof process.stderr.write;

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), 'ec-smoke-'));
		stderrChunks = [];
		originalWrite = process.stderr.write.bind(process.stderr);
		process.stderr.write = ((chunk: string | Uint8Array): boolean => {
			if (typeof chunk === 'string') stderrChunks.push(chunk);
			return true;
		}) as typeof process.stderr.write;
	});

	afterEach(async () => {
		process.stderr.write = originalWrite;
		await rm(tmpDir, { recursive: true, force: true });
	});

	it('throw → record → redact → fan-out to buffer + JSONL; no ConsoleErrorSink fallback', async () => {
		const bufferSink = new BufferingErrorSink();

		// Inline stub plugin — registers the buffer sink.
		const bufferPlugin = {
			name: 'smoke-buffer',
			register: () => ({
				errorSinks: [bufferSink] as readonly IErrorSink[],
			}),
		};

		const { errorCollector } = await assembleCliConfig(
			parseCliArgs(
				['--plugins=logs,smoke-buffer', `--workspace=${tmpDir}`],
				tmpDir,
			),
			{
				import: async (specifier: string) => {
					if (specifier.includes('logs'))
						return { default: logsPlugin };
					return { default: bufferPlugin };
				},
				readFile: async () => undefined,
			},
		);

		// Handler that leaks a secret in its error message.
		// TypeError → severity 'error' from the default classifier.
		const handler = async (
			_args: Record<string, unknown>,
		): Promise<never> => {
			throw new TypeError(
				'upstream failure: API_KEY=sk-test-secret-12345',
			);
		};

		const wrapped = withErrorCollection(handler, {
			toolMeta: {
				toolName: 'demo.handler',
				packageId: 'demo',
				pluginName: 'demo',
			},
			collector: errorCollector,
		});

		// Original error propagates unchanged.
		await expect(wrapped({})).rejects.toThrow(
			'upstream failure: API_KEY=sk-test-secret-12345',
		);

		// --- Buffer sink assertions ---
		expect(bufferSink.events).toHaveLength(1);
		const captured = bufferSink.events[0]!;
		expect(['error', 'critical', 'alert', 'emergency']).toContain(
			captured.severity,
		);
		expect(captured.toolName).toBe('demo.handler');
		// Secret must be redacted before the sink received the event.
		expect(captured.summary).not.toContain('sk-test-secret-12345');

		// --- JSONL file assertions (logs-errors stream) ---
		const errorLogsDir = join(
			tmpDir,
			'.cache/mcp-vertex/results/logs-errors',
		);
		const files = await readdir(errorLogsDir);
		expect(files.length).toBeGreaterThanOrEqual(1);
		const jsonlPath = join(errorLogsDir, files.sort().at(-1)!);
		const raw = await readFile(jsonlPath, 'utf8');
		const lines = raw
			.split('\n')
			.filter(Boolean)
			.map((l) => JSON.parse(l) as Record<string, unknown>);

		// Find the collector-written line (sink: 'logs-error').
		const collectorLine = lines.find(
			(l) =>
				(l.meta as Record<string, unknown> | undefined)?.sink ===
				'logs-error',
		);
		expect(collectorLine).toBeDefined();
		// Secret must not appear anywhere in the persisted event.
		expect(JSON.stringify(collectorLine)).not.toContain(
			'sk-test-secret-12345',
		);

		// --- ConsoleErrorSink fallback suppression ---
		// When real sinks are registered, the assembler does not add
		// ConsoleErrorSink. Verify no console-error JSON was written.
		const consoleErrorLines = stderrChunks.filter((chunk) => {
			try {
				const parsed = JSON.parse(chunk) as {
					sink?: string;
				};
				return parsed.sink === 'console-error';
			} catch {
				return false;
			}
		});
		expect(consoleErrorLines).toHaveLength(0);
	});
});
