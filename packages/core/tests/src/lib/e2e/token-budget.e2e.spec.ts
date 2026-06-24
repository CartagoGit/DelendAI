import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { createMcpProject } from '@mcp-vertex/core/lib/project/create-mcp-project';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';
import proposalsPlugin from '@mcp-vertex/proposals';
import memoryPlugin from '@mcp-vertex/memory';
import searchPlugin from '@mcp-vertex/search';
import docsPlugin from '@mcp-vertex/docs';
import logsPlugin from '@mcp-vertex/logs';

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
	// Full overview lists every tool's summary, so it grows as the toolset does
	// (await_lock, proposal_review, proposal_adopt, …). The promise is the COMPACT
	// path (well under budget) — agents use it when there are many tools.
	// Bumped 7000 → 8000 (2026-06-22) after f00029-S2 (github-issues plugin,
	// 5 tools) + f00030 (setup-github) + f00047 (ui-extension toolbar) raised
	// the baseline from 6700B to 7244B measured; the compact path is the
	// real promise and remains at 1477B (well under 1600).
	overviewFull: 8_000,
	overviewCompact: 1_600,
	autoWork: 1_600,
	search: 3_000,
	docsList: 2_500,
	roundContext: 3_000,
	logsTail: 6_000,
} as const;

describe('e2e: token budget (cold-start payloads)', async () => {
	let workspace = '';
	let client: Client;
	let close: () => Promise<void>;

	const connectClient = async (
		pluginList: string,
	): Promise<{ client: Client; close: () => Promise<void> }> => {
		const args = parseCliArgs(
			[`--plugins=${pluginList}`, `--workspace=${workspace}`],
			workspace,
		);
		const plugins: Record<string, { default: unknown }> = {
			'@mcp-vertex/proposals': { default: proposalsPlugin },
			'@mcp-vertex/memory': { default: memoryPlugin },
			'@mcp-vertex/search': { default: searchPlugin },
			'@mcp-vertex/docs': { default: docsPlugin },
			'@mcp-vertex/logs': { default: logsPlugin },
		};
		const { config } = await assembleCliConfig(args, {
			import: async (specifier: string) => plugins[specifier]!,
			readFile: async () => undefined,
		});
		const assembled = await createMcpProject(config);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await assembled.server.connect(serverTransport);
		const connectedClient = new Client(
			{ name: 'tok', version: '0' },
			{ capabilities: {} },
		);
		await connectedClient.connect(clientTransport);
		return {
			client: connectedClient,
			close: async () => {
				await connectedClient.close();
				await assembled.server.close();
			},
		};
	};

	beforeEach(async () => {
		workspace = mkdtempSync(join(tmpdir(), 'tok-'));
		mkdirSync(join(workspace, 'docs'), { recursive: true });
		mkdirSync(join(workspace, 'src'), { recursive: true });
		writeFileSync(
			join(workspace, 'docs', 'README.md'),
			[
				'# Proposal workflow',
				'',
				'Use proposal slices and compact docs.',
			].join('\n'),
		);
		writeFileSync(
			join(workspace, 'src', 'app.ts'),
			['export const proposal = "compact search baseline";'].join('\n'),
		);
		({ client, close } = await connectClient('proposals,memory'));
	});

	afterEach(async () => {
		await close();
		rmSync(workspace, { recursive: true, force: true });
	});

	const textBytes = async (
		name: string,
		args: Record<string, unknown>,
	): Promise<number> => {
		const res = await client.callTool({ name, arguments: args });
		const text = (res.content as Array<{ type: string; text: string }>)[0]
			?.text;
		return Buffer.byteLength(text ?? '', 'utf8');
	};

	it('cold-start overview stays under budget; compact is much cheaper', async () => {
		const full = await textBytes('mcp-vertex_overview', {});
		const compact = await textBytes('mcp-vertex_overview', {
			compact: true,
		});

		// Documented baseline (printed for visibility on failures):
		expect(
			full,
			`overview full = ${full}B, compact = ${compact}B`,
		).toBeLessThan(BUDGET_BYTES.overviewFull);
		expect(compact).toBeLessThan(BUDGET_BYTES.overviewCompact);
		// Compact must be a real saving, not cosmetic.
		expect(compact).toBeLessThan(full * 0.7);
	});

	it('auto_work returns a tight action plan, not prose', async () => {
		const bytes = await textBytes('proposals_auto_work', {});
		expect(bytes).toBeLessThan(BUDGET_BYTES.autoWork);
	});

	it('read-only long-session surfaces stay on bounded compact paths', async () => {
		const extra = await connectClient('proposals,memory,search,docs,logs');
		const extraTextBytes = async (
			name: string,
			args: Record<string, unknown>,
		): Promise<number> => {
			const res = await extra.client.callTool({ name, arguments: args });
			const text = (
				res.content as Array<{ type: string; text: string }>
			)[0]?.text;
			return Buffer.byteLength(text ?? '', 'utf8');
		};
		try {
			// Prime a few events so logs_tail has real output.
			await extra.client.callTool({
				name: 'search_search',
				arguments: { query: 'proposal', maxResults: 5, context: 0 },
			});
			await extra.client.callTool({
				name: 'docs_docs_list',
				arguments: { limit: 10 },
			});

			const search = await extraTextBytes('search_search', {
				query: 'proposal',
				maxResults: 5,
				context: 0,
			});
			const docsList = await extraTextBytes('docs_docs_list', {
				limit: 10,
			});
			const roundContext = await extraTextBytes(
				'proposals_round_context',
				{},
			);
			const logsTail = await extraTextBytes('logs_tail', { limit: 10 });

			expect(search, `search = ${search}B`).toBeLessThan(
				BUDGET_BYTES.search,
			);
			expect(docsList, `docs_list = ${docsList}B`).toBeLessThan(
				BUDGET_BYTES.docsList,
			);
			expect(
				roundContext,
				`round_context = ${roundContext}B`,
			).toBeLessThan(BUDGET_BYTES.roundContext);
			expect(logsTail, `logs_tail = ${logsTail}B`).toBeLessThan(
				BUDGET_BYTES.logsTail,
			);
		} finally {
			await extra.close();
		}
	});
});
