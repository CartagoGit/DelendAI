import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { createMcpProject } from '@mcp-vertex/core/lib/project/create-mcp-project';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';
import proposalsPlugin from '@mcp-vertex/proposals';

describe('e2e: agent catalog', async () => {
	let workspace = '';
	let client: Client;
	let close: () => Promise<void>;

	const connectClient = async (): Promise<{
		client: Client;
		close: () => Promise<void>;
	}> => {
		const args = parseCliArgs(
			['--plugins=proposals', `--workspace=${workspace}`],
			workspace,
		);
		const { config } = await assembleCliConfig(args, {
			import: async () => ({ default: proposalsPlugin }),
			readFile: async () => undefined,
		});
		const assembled = await createMcpProject(config);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await assembled.server.connect(serverTransport);
		const connectedClient = new Client(
			{ name: 'catalog', version: '0' },
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
		workspace = mkdtempSync(join(tmpdir(), 'catalog-'));
		mkdirSync(join(workspace, 'docs', 'proposals'), { recursive: true });
		mkdirSync(join(workspace, 'skills'), { recursive: true });
		writeFileSync(
			join(workspace, 'skills', 'manifest.json'),
			JSON.stringify(
				{
					generatedAt: '2026-06-25T00:00:00.000Z',
					skills: [
						{
							id: 'mcp-vertex-token-budget-playbook',
							version: '1.0.0',
							minCoreVersion: '0.1.0',
							bodyPath:
								'skills/mcp-vertex-token-budget-playbook/SKILL.md',
							tags: ['metrics', 'compact'],
						},
					],
				},
				null,
				2,
			),
		);
		writeFileSync(
			join(workspace, 'docs', 'proposals', 'index.json'),
			JSON.stringify(
				{
					generated_at: '2026-06-25T00:00:00.000Z',
					count: 3,
					proposals: [
						{
							id: 'f00056',
							title: 'Agent discovery catalog',
							track: 'host+extension+skills+docs',
							status: 'ready',
							date: '2026-06-25',
						},
						{
							id: 'c00002',
							title: 'Pause npm publish',
							track: 'docs+release',
							status: 'paused',
							date: '2026-06-21',
						},
						{
							id: 'a00001',
							title: 'Repository audit',
							track: 'archive',
							status: 'done',
							date: '2026-06-15',
						},
					],
				},
				null,
				2,
			),
		);
		({ client, close } = await connectClient());
	});

	afterEach(async () => {
		await close();
		rmSync(workspace, { recursive: true, force: true });
	});

	const callCatalog = async (args: Record<string, unknown>) => {
		const res = await client.callTool({
			name: 'mcp-vertex_agent_catalog',
			arguments: args,
		});
		return JSON.parse(
			(res.content as Array<{ type: string; text: string }>)[0]?.text ??
				'{}',
		) as Record<string, unknown>;
	};

	it('returns actionable proposals in compact mode and the full registry in full mode', async () => {
		const compact = await callCatalog({ mode: 'compact' });
		const full = await callCatalog({ mode: 'full' });

		expect((compact.counts as { tools: number }).tools).toBeGreaterThan(0);
		expect(
			(compact.proposalStatusCounts as { ready: number }).ready,
		).toBeGreaterThanOrEqual(0);
		expect(
			(compact.proposals as Array<{ status: string }>).every((proposal) =>
				['ready', 'in-progress', 'paused'].includes(proposal.status),
			),
		).toBe(true);
		expect(
			(full.proposals as Array<unknown>).length,
		).toBeGreaterThanOrEqual((compact.proposals as Array<unknown>).length);
	});

	it('finds the catalog tool itself through section-scoped querying', async () => {
		const result = await callCatalog({
			section: 'tools',
			query: 'catalog',
		});
		expect((result.matches as number) >= 1).toBe(true);
		expect(
			(result.tools as Array<{ name: string }>).some((tool) =>
				tool.name.includes('agent_catalog'),
			),
		).toBe(true);
	});
});
