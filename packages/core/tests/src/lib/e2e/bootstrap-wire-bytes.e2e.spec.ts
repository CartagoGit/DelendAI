/**
 * AUD-B04 / x00284 — the decisive test the audit asked for: start the
 * REAL compiled CLI over stdio (the same technique
 * `tools/scripts/smoke/cli.script.ts` uses to prove the published
 * artifact serves the protocol under `node`), capture the actual
 * `tools/list` a client receives, and assert the shared
 * `measureBootstrapBytes` basis reproduces that payload's byte size
 * within ±1% — not a number derived from a different, smaller shape
 * (the pre-fix bug this whole finding is about).
 *
 * Requires `bun run build` to have produced `packages/core/dist/cli.js`
 * first (same precondition `tools/scripts/smoke/cli.script.ts` has).
 * Spawning a real `node` child process is slower than the in-memory
 * transport specs elsewhere in this directory, which is why it is kept
 * to a single connection reused across both assertions rather than
 * one spawn per `it`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { measureBootstrapBytes } from '@mcp-vertex/core/lib/surface/bootstrap';

const CLI = resolve('packages/core/dist/cli.js');

describe.skipIf(!existsSync(CLI))(
	"e2e: measureBootstrapBytes matches a real compiled server's tools/list over stdio (AUD-B04)",
	() => {
		let workspace = '';
		let client: Client;
		let realTools: readonly Tool[];

		beforeAll(async () => {
			workspace = mkdtempSync(join(tmpdir(), 'bootstrap-wire-'));
			execFileSync('git', ['init', '-q'], { cwd: workspace });
			const transport = new StdioClientTransport({
				command: 'node',
				args: [CLI, '--plugins=', `--workspace=${workspace}`],
			});
			client = new Client(
				{ name: 'bootstrap-wire-bytes-test', version: '0.0.0' },
				{ capabilities: {} },
			);
			await client.connect(transport);
			const listed = await client.listTools();
			realTools = listed.tools;
		});

		afterAll(async () => {
			await client?.close().catch(() => undefined);
			rmSync(workspace, { recursive: true, force: true });
		});

		it('serves at least the core bootstrap tools over a real node process', () => {
			expect(realTools.length).toBeGreaterThan(0);
			expect(realTools.map((tool) => tool.name)).toContain(
				'mcp-vertex_overview',
			);
		});

		it('measureBootstrapBytes(realTools) matches an independent re-serialization of the real payload within 1%', () => {
			// Independent check: stringify the WHOLE real array exactly as
			// it came back from the wire (client-parsed, but untouched by
			// this repo's own measurement code) and compare its byte size
			// against the shared function's per-tool summed result. If the
			// shared function silently dropped or reshaped a field (the
			// pre-fix bug — `outputSchema` was invisible to it entirely),
			// this comparison is what would catch it: a real tool set here
			// includes tools with `outputSchema` (structured-content core
			// tools like `overview`), so the field's contribution to the
			// byte count is not hypothetical.
			const rawWireBytes = Buffer.byteLength(
				JSON.stringify(realTools),
				'utf8',
			);
			const measured = measureBootstrapBytes(
				realTools.map((tool) => ({
					name: tool.name,
					description: tool.description,
					inputSchema: tool.inputSchema,
					outputSchema: tool.outputSchema,
					annotations: tool.annotations,
					execution: tool.execution,
				})),
			).bytes;

			const deltaRatio = Math.abs(measured - rawWireBytes) / rawWireBytes;
			expect(deltaRatio).toBeLessThanOrEqual(0.01);
		});

		it('at least one real registered tool actually carries an outputSchema — proving the field this fix makes visible is not vacuous', () => {
			expect(
				realTools.some((tool) => tool.outputSchema !== undefined),
			).toBe(true);
		});
	},
);
