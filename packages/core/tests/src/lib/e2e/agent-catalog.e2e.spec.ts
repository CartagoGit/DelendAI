import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { createMcpProject } from '@mcp-vertex/core/lib/project/create-mcp-project';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';
import { SKILL_MANIFEST_REL } from '@mcp-vertex/core/lib/skills/skill-paths';
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
			// Read real files from the tmp workspace (the skill manifest + the
			// SKILL.md body the skill tool loads on demand live on disk).
			readFile: async (abs: string) =>
				existsSync(abs) ? readFileSync(abs, 'utf8') : undefined,
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
		const manifestAbs = join(workspace, ...SKILL_MANIFEST_REL.split('/'));
		mkdirSync(dirname(manifestAbs), { recursive: true });
		const skillBodyRel =
			'packages/core/skills/mcp-vertex-token-budget-playbook/SKILL.md';
		const skillBodyAbs = join(workspace, ...skillBodyRel.split('/'));
		mkdirSync(dirname(skillBodyAbs), { recursive: true });
		writeFileSync(
			skillBodyAbs,
			[
				'---',
				'name: mcp-vertex-token-budget-playbook',
				"appliesTo: ['@mcp-vertex/*']",
				'description: Budget every response before it drifts. Use when a tool reply risks blowing the context window.',
				'---',
				'',
				'# Token budget playbook',
				'',
				'The full body the agent loads on demand.',
			].join('\n'),
		);
		writeFileSync(
			manifestAbs,
			JSON.stringify(
				{
					generatedAt: '2026-06-25T00:00:00.000Z',
					skills: [
						{
							id: 'mcp-vertex-token-budget-playbook',
							version: '1.0.0',
							minCoreVersion: '0.1.0',
							bodyPath: skillBodyRel,
							tags: ['metrics', 'compact'],
							appliesTo: ['@mcp-vertex/*'],
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

	const callSkill = async (args: Record<string, unknown>) => {
		const res = await client.callTool({
			name: 'mcp-vertex_skill',
			arguments: args,
		});
		return JSON.parse(
			(res.content as Array<{ type: string; text: string }>)[0]?.text ??
				'{}',
		) as Record<string, unknown>;
	};

	it('lists skills compactly with a derived when-to-use description and appliesTo (no body)', async () => {
		const listed = await callSkill({});
		const skills = listed.skills as Array<{
			id: string;
			description: string;
			appliesTo: string[];
		}>;
		const entry = skills.find(
			(s) => s.id === 'mcp-vertex-token-budget-playbook',
		);
		expect(entry).toBeDefined();
		// The description comes from the SKILL.md frontmatter, not a stub.
		expect(entry?.description).toContain('Budget every response');
		expect(entry?.appliesTo).toEqual(['@mcp-vertex/*']);
		// The compact list must NOT carry the body.
		expect(JSON.stringify(listed)).not.toContain(
			'The full body the agent loads on demand',
		);
	});

	it('loads a skill body on demand by id', async () => {
		const loaded = await callSkill({
			id: 'mcp-vertex-token-budget-playbook',
		});
		expect(loaded.body as string).toContain(
			'The full body the agent loads on demand',
		);
	});

	it('errors for an unknown skill id', async () => {
		const res = await client.callTool({
			name: 'mcp-vertex_skill',
			arguments: { id: 'does-not-exist' },
		});
		expect(res.isError).toBe(true);
	});
});
