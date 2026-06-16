import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@cartago-git/mcp-core/lib/cli/assemble';
import { createMcpServer } from '@cartago-git/mcp-core/lib/server/create-mcp-server';
import { parseCliArgs } from '@cartago-git/mcp-core/lib/plugins/parse-cli-args';
import proposalsPlugin from '@cartago-git/mcp-proposals';
import memoryPlugin from '@cartago-git/mcp-memory';

/**
 * Token budget benchmark [N23]. "Low-token" is a measurable promise, not
 * marketing: this drives the REAL server over the protocol and asserts
 * the cold-start payloads stay under explicit byte budgets, and that the
 * `compact` overview is materially cheaper than the full one. The numbers
 * printed here are the documented baseline; tighten the budgets if a
 * change regresses them.
 *
 * Rough token estimate: ~4 bytes/token, so the budgets below are roughly
 * overview-full < ~1.5k tokens, overview-compact < ~400 tokens.
 */
const BUDGET_BYTES = {
	overviewFull: 6_000,
	overviewCompact: 1_600,
	autoWork: 1_600,
} as const;

describe('e2e: token budget (cold-start payloads)', () => {
	let workspace = '';
	let client: Client;
	let close: () => Promise<void>;

	beforeEach(async () => {
		workspace = mkdtempSync(join(tmpdir(), 'tok-'));
		const args = parseCliArgs(
			['--plugins=proposals,memory', `--workspace=${workspace}`],
			workspace
		);
		const plugins: Record<string, { default: unknown }> = {
			'@cartago-git/mcp-proposals': { default: proposalsPlugin },
			'@cartago-git/mcp-memory': { default: memoryPlugin },
		};
		const { config } = await assembleCliConfig(args, {
			import: async (specifier: string) => plugins[specifier]!,
			readFile: () => undefined,
		});
		const assembled = await createMcpServer(config);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await assembled.server.connect(serverTransport);
		client = new Client({ name: 'tok', version: '0' }, { capabilities: {} });
		await client.connect(clientTransport);
		close = async () => {
			await client.close();
			await assembled.server.close();
		};
	});

	afterEach(async () => {
		await close();
		rmSync(workspace, { recursive: true, force: true });
	});

	const textBytes = async (
		name: string,
		args: Record<string, unknown>
	): Promise<number> => {
		const res = await client.callTool({ name, arguments: args });
		const text = (res.content as Array<{ type: string; text: string }>)[0]
			?.text;
		return Buffer.byteLength(text ?? '', 'utf8');
	};

	it('cold-start overview stays under budget; compact is much cheaper', async () => {
		const full = await textBytes('mcpcore_overview', {});
		const compact = await textBytes('mcpcore_overview', { compact: true });

		// Documented baseline (printed for visibility on failures):
		expect(
			full,
			`overview full = ${full}B, compact = ${compact}B`
		).toBeLessThan(BUDGET_BYTES.overviewFull);
		expect(compact).toBeLessThan(BUDGET_BYTES.overviewCompact);
		// Compact must be a real saving, not cosmetic.
		expect(compact).toBeLessThan(full * 0.7);
	});

	it('auto_work returns a tight action plan, not prose', async () => {
		const bytes = await textBytes('proposals_auto_work', {});
		expect(bytes).toBeLessThan(BUDGET_BYTES.autoWork);
	});
});
