import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import { createMcpProject } from '@mcp-vertex/core/lib/project/create-mcp-project';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';
import proposalsPlugin from '@mcp-vertex/proposals';
import qualityPlugin from '@mcp-vertex/quality';

const workspaces: string[] = [];

const syncProposals = (client: Client) =>
	client.callTool({
		name: 'mcp-vertex_vertex',
		arguments: {
			domain: 'proposals',
			action: 'sync_proposals',
			args: {},
		},
	});

const createQualityServer = async (command: string) => {
	const workspace = mkdtempSync(join(tmpdir(), 'proposals-quality-e2e-'));
	workspaces.push(workspace);
	const config = JSON.stringify({
		plugins: {
			quality: { options: { scopes: { all: [command] } } },
			proposals: { options: { requirePeerReview: false } },
		},
	});
	writeFileSync(join(workspace, 'mcp-vertex.config.json'), config, 'utf8');
	mkdirSync(join(workspace, 'tools/scripts/quality'), { recursive: true });
	writeFileSync(
		join(workspace, 'tools/scripts/quality/run-quality.script.ts'),
		`const ok = ${command === 'true'};\nconsole.log(JSON.stringify({ok, severity: ok ? 'ok' : 'error', findings: ok ? [] : ['close: command failed'], summary: {ok, scopes: 1}}));\nprocess.exit(ok ? 0 : 1);\n`,
		'utf8',
	);
	const args = parseCliArgs(
		[
			'--plugins=proposals,quality',
			`--workspace=${workspace}`,
			'--surface=native',
		],
		workspace,
	);
	const { config: hostConfig } = await assembleCliConfig(args, {
		import: async (specifier) => ({
			default: specifier.includes('quality')
				? qualityPlugin
				: proposalsPlugin,
		}),
	});
	const project = await createMcpProject(hostConfig);
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await project.server.connect(serverTransport);
	const client = new Client(
		{ name: 'quality-close-slice-e2e', version: '0.0.0' },
		{ capabilities: {} },
	);
	await client.connect(clientTransport);
	return { workspace, client, project };
};

const seedSlice = (workspace: string, id: string): string => {
	const proposalDir = join(workspace, 'docs/mcp-vertex/proposals/ready');
	mkdirSync(proposalDir, { recursive: true });
	const proposalPath = join(proposalDir, `${id}-quality.md`);
	writeFileSync(
		proposalPath,
		`---\nid: ${id}\nstatus: ready\ntype: proposal\ntrack: plugins/proposals+tests\ndate: 2026-08-31\nkind: feat\ntitle: quality gate\n---\n\n# ${id} — quality gate\n\n## goal\n\nExercise the quality gate.\n\n## Slices\n\n- global_gate: none\n\n### S1 — quality gate\n- **Status**: pending\n- **Files**: \`src/quality.ts\`\n- **Gate**: none\n`,
		'utf8',
	);
	return proposalPath;
};

const findProposalPath = (workspace: string, id: string): string => {
	const proposalsDir = join(workspace, 'docs/mcp-vertex/proposals');
	const entries = readdirSync(proposalsDir, { recursive: true }).filter(
		(entry): entry is string => typeof entry === 'string',
	);
	const relativePath = entries.find(
		(entry) =>
			entry.endsWith('.md') &&
			readFileSync(join(proposalsDir, entry), 'utf8').includes(
				`id: ${id}`,
			),
	);
	if (relativePath !== undefined) return join(proposalsDir, relativePath);
	throw new Error(`proposal ${id} was not found under ${proposalsDir}`);
};

afterEach(async () => {
	for (const workspace of workspaces.splice(0))
		rmSync(workspace, { recursive: true, force: true });
});

describe('e2e: proposals close_slice + quality gate', () => {
	it('keeps the slice pending when the quality scope fails', async () => {
		const { workspace, client, project } =
			await createQualityServer('false');
		try {
			seedSlice(workspace, 'f04200');
			const sync = await syncProposals(client);
			expect(sync.isError).toBeFalsy();
			const plan = await client.callTool({
				name: 'mcp-vertex_proposals_auto_work',
				arguments: {},
			});
			expect(plan.isError).toBeFalsy();
			expect(plan.structuredContent).toMatchObject({
				state: 'work',
				proposalId: 'f04200',
			});
			const sliceClaim = await client.callTool({
				name: 'mcp-vertex_proposals_agent_lock',
				arguments: {
					action: 'claim',
					task_id: 'f04200-S1',
					agent: 'agent-quality-e2e',
					files: ['src/quality.ts'],
				},
			});
			expect(sliceClaim.isError).toBeFalsy();
			const quality = await client.callTool({
				name: 'mcp-vertex_quality_quality_run_all',
				arguments: {},
			});
			expect(quality.structuredContent).toMatchObject({
				summary: { ok: false },
			});
			const result = await client.callTool({
				name: 'mcp-vertex_proposals_close_slice',
				arguments: {
					proposalId: 'f04200',
					sliceId: 'S1',
					force: true,
				},
			});
			expect(result.structuredContent).toMatchObject({
				ok: false,
				closed: false,
				blockerType: 'quality-failed',
			});
			expect(
				readFileSync(
					await findProposalPath(workspace, 'f04200'),
					'utf8',
				),
			).toContain('- **Status**: pending');
		} finally {
			await client.close();
			await project.server.close();
		}
	});

	it('marks the slice done when the quality scope passes', async () => {
		const { workspace, client, project } =
			await createQualityServer('true');
		try {
			seedSlice(workspace, 'f04201');
			const sync = await syncProposals(client);
			expect(sync.isError).toBeFalsy();
			const plan = await client.callTool({
				name: 'mcp-vertex_proposals_auto_work',
				arguments: {},
			});
			expect(plan.isError).toBeFalsy();
			expect(plan.structuredContent).toMatchObject({
				state: 'work',
				proposalId: 'f04201',
			});
			const sliceClaim = await client.callTool({
				name: 'mcp-vertex_proposals_agent_lock',
				arguments: {
					action: 'claim',
					task_id: 'f04201-S1',
					agent: 'agent-quality-e2e',
					files: ['src/quality.ts'],
				},
			});
			expect(sliceClaim.isError).toBeFalsy();
			const quality = await client.callTool({
				name: 'mcp-vertex_quality_quality_run_all',
				arguments: {},
			});
			expect(quality.isError).toBeFalsy();
			expect(quality.structuredContent).toMatchObject({
				summary: { ok: true },
			});
			const result = await client.callTool({
				name: 'mcp-vertex_proposals_close_slice',
				arguments: {
					proposalId: 'f04201',
					sliceId: 'S1',
					force: true,
				},
			});
			expect(result.isError).toBeFalsy();
			expect(result.structuredContent).toMatchObject({
				ok: true,
				closed: true,
			});
			expect(
				readFileSync(
					await findProposalPath(workspace, 'f04201'),
					'utf8',
				),
			).toContain('- **Status**: done');
		} finally {
			await client.close();
			await project.server.close();
		}
	});
});
