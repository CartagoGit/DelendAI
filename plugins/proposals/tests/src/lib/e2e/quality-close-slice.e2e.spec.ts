import {
	mkdirSync,
	mkdtempSync,
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

const seedSlice = async (client: Client, id: string): Promise<string> => {
	const created = await client.callTool({
		name: 'mcp-vertex_proposals_create_proposal',
		arguments: {
			id,
			kind: 'feat',
			title: 'quality gate',
			status: 'in-progress',
			slices: [
				{
					sliceId: 'S1',
					title: 'quality gate',
					files: ['src/quality.ts'],
					gate: 'none',
				},
			],
		},
	});
	expect(created.isError).toBeFalsy();
	return (created.structuredContent as { file: string }).file;
};

afterEach(async () => {
	for (const workspace of workspaces.splice(0))
		rmSync(workspace, { recursive: true, force: true });
});

describe('e2e: proposals close_slice + quality gate', () => {
	it('keeps the slice pending when the quality scope fails', async () => {
		const { client, project } = await createQualityServer('false');
		try {
			const proposalPath = await seedSlice(client, 'f04200');
			const sync = await client.callTool({
				name: 'mcp-vertex_proposals_sync_proposals',
				arguments: {},
			});
			expect(sync.isError).toBeFalsy();
			const claim = await client.callTool({
				name: 'mcp-vertex_proposals_agent_lock',
				arguments: {
					action: 'claim',
					task_id: 'f04200-S1',
					agent: 'quality-close-test',
					files: ['src/quality.ts'],
				},
			});
			expect(claim.isError).toBeFalsy();
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
			expect(readFileSync(proposalPath, 'utf8')).toContain(
				'- **Status**: pending',
			);
		} finally {
			await client.close();
			await project.server.close();
		}
	});

	it('marks the slice done when the quality scope passes', async () => {
		const { client, project } = await createQualityServer('true');
		try {
			const proposalPath = await seedSlice(client, 'f04201');
			const sync = await client.callTool({
				name: 'mcp-vertex_proposals_sync_proposals',
				arguments: {},
			});
			expect(sync.isError).toBeFalsy();
			const claim = await client.callTool({
				name: 'mcp-vertex_proposals_agent_lock',
				arguments: {
					action: 'claim',
					task_id: 'f04201-S1',
					agent: 'quality-close-test',
					files: ['src/quality.ts'],
				},
			});
			expect(claim.isError).toBeFalsy();
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
			expect(readFileSync(proposalPath, 'utf8')).toContain(
				'- **Status**: done',
			);
		} finally {
			await client.close();
			await project.server.close();
		}
	});
});
