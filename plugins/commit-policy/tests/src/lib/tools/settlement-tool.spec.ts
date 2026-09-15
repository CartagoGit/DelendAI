/**
 * settlement-tool.spec.ts — the status / enter / complete steering calls,
 * against a real registry file so the tool and the engine's gate can be
 * pointed at the same state.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	buildCommitPolicySettlementToolRegistration,
	createSettlementTool,
	runCommitPolicySettlementTool,
} from '@delendai/commit-policy/lib/tools/settlement-tool';
import { createWorkerRegistry } from '@delendai/commit-policy/lib/settlement/worker.registry';

const FILE = '.cache/delendai/commit-policy/settlement.json';

describe('createSettlementTool', () => {
	let workspace = '';

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'settlement-tool-'));
	});

	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	it('reports the phase and worker count of the registry it is pointed at', async () => {
		const registry = createWorkerRegistry({
			workspaceRoot: workspace,
			fileRel: FILE,
		});
		await registry.register('agent-a');
		const tool = createSettlementTool({
			workspaceRoot: workspace,
			fileRel: FILE,
		});
		expect(await tool.status()).toEqual({
			phase: 'active',
			activeWorkers: 1,
		});
	});

	it('refuses to enter settlement while a worker is still active', async () => {
		const registry = createWorkerRegistry({
			workspaceRoot: workspace,
			fileRel: FILE,
		});
		await registry.register('agent-a');
		const tool = createSettlementTool({
			workspaceRoot: workspace,
			fileRel: FILE,
		});
		expect(await tool.enter({})).toEqual({
			ack: 'REFUSED',
			reason: 'cannot enter SETTLING while 1 worker(s) are still active',
		});
		expect((await registry.read()).phase).toBe('active');
	});

	it('enters settlement once every worker has left', async () => {
		const tool = createSettlementTool({
			workspaceRoot: workspace,
			fileRel: FILE,
		});
		expect(await tool.enter({ reason: 'round finished' })).toEqual({
			ack: 'OK',
			phase: 'settling',
		});
		expect((await tool.status()).phase).toBe('settling');
	});

	it('goes stable on a green validate and records the head', async () => {
		const tool = createSettlementTool({
			workspaceRoot: workspace,
			fileRel: FILE,
		});
		await tool.enter({});
		expect(
			await tool.complete({ green: true, headSha: 'abcdef1' }),
		).toEqual({
			ack: 'OK',
			phase: 'stable',
		});
		expect(await tool.status()).toEqual({
			phase: 'stable',
			activeWorkers: 0,
			lastGreenHead: 'abcdef1',
		});
	});

	it('stays settling and asks for a repair on a red validate', async () => {
		const tool = createSettlementTool({
			workspaceRoot: workspace,
			fileRel: FILE,
		});
		await tool.enter({});
		expect(
			await tool.complete({ green: false, headSha: 'abcdef1' }),
		).toEqual({
			ack: 'REPAIR_REQUIRED',
			phase: 'settling',
		});
	});

	it('defaults to the registry file when no path is given', async () => {
		const tool = createSettlementTool({ workspaceRoot: workspace });
		expect((await tool.status()).phase).toBe('active');
	});
});

describe('commit_policy_settlement tool', () => {
	let workspace = '';

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'settlement-mcp-tool-'));
	});

	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	const run = (args: unknown) =>
		runCommitPolicySettlementTool(
			createSettlementTool({ workspaceRoot: workspace, fileRel: FILE }),
			args,
		);
	const body = (result: Awaited<ReturnType<typeof run>>) =>
		result.structuredContent as Readonly<Record<string, unknown>>;

	it('is an administrative write tool that honours dry runs', () => {
		const registration = buildCommitPolicySettlementToolRegistration({
			namespacePrefix: 'delendai',
			workspaceRoot: workspace,
			fileRel: FILE,
		});
		expect(registration).toMatchObject({
			id: 'commit_policy_settlement',
			disclosure: 'administrative',
			effects: ['write'],
			dryRunSupported: true,
		});
	});

	it('reads the phase, enters settlement and completes it', async () => {
		expect(body(await run({ action: 'status' }))).toMatchObject({
			phase: 'active',
			activeWorkers: 0,
		});
		expect(
			body(await run({ action: 'enter', reason: 'round done' })),
		).toMatchObject({
			ack: 'OK',
			phase: 'settling',
		});
		expect(
			body(
				await run({
					action: 'complete',
					green: false,
					headSha: 'abcdef1',
				}),
			),
		).toMatchObject({ ack: 'REPAIR_REQUIRED', phase: 'settling' });
		expect(
			body(
				await run({
					action: 'complete',
					green: true,
					headSha: 'abcdef1',
				}),
			),
		).toMatchObject({ ack: 'OK', phase: 'stable' });
	});

	it('reports what enter and complete would do on a dry run, and writes nothing', async () => {
		const registry = createWorkerRegistry({
			workspaceRoot: workspace,
			fileRel: FILE,
		});
		await registry.register('agent-a');
		expect(
			body(await run({ action: 'enter', dryRun: true })),
		).toMatchObject({
			dryRun: true,
			wouldEnter: false,
			activeWorkers: 1,
		});
		expect(
			body(
				await run({
					action: 'complete',
					green: true,
					headSha: 'abcdef1',
					dryRun: true,
				}),
			),
		).toMatchObject({ dryRun: true, wouldLeavePhase: 'stable' });
		expect((await registry.read()).phase).toBe('active');
	});

	it('refuses input it cannot act on', async () => {
		expect((await run({ action: 'rewind' })).isError).toBe(true);
		expect((await run({ action: 'complete', green: true })).isError).toBe(
			true,
		);
	});
});

describe('commit_policy_settlement over MCP', () => {
	let workspace = '';

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'settlement-mcp-wire-'));
	});

	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	it('registers on a real server and answers a client call', async () => {
		const server = new McpServer({
			name: 'settlement-spec',
			version: '0.0.0',
		});
		await buildCommitPolicySettlementToolRegistration({
			namespacePrefix: 'spec',
			workspaceRoot: workspace,
			fileRel: FILE,
		}).register(server);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);
		const client = new Client({
			name: 'settlement-spec-client',
			version: '0',
		});
		await client.connect(clientTransport);
		try {
			const { tools } = await client.listTools();
			expect(tools.map((tool) => tool.name)).toContain(
				'spec_commit_policy_settlement',
			);
			const status = await client.callTool({
				name: 'spec_commit_policy_settlement',
				arguments: { action: 'status' },
			});
			expect(status.structuredContent).toMatchObject({
				ok: true,
				phase: 'active',
				activeWorkers: 0,
			});
			const dryEnter = await client.callTool({
				name: 'spec_commit_policy_settlement',
				arguments: { action: 'enter', dryRun: true },
			});
			expect(dryEnter.structuredContent).toMatchObject({
				dryRun: true,
				wouldEnter: true,
			});
		} finally {
			await client.close();
			await server.close();
		}
	});

	it('counts live claims in the workspace agent lock by default', async () => {
		const lockFileAbs = join(
			workspace,
			'.cache',
			'delendai',
			'agents.lock.json',
		);
		await mkdir(dirname(lockFileAbs), { recursive: true });
		await writeFile(
			lockFileAbs,
			JSON.stringify({
				version: 1,
				in_flight: [
					{
						task_id: 'f00001-S1',
						agent: 'agent-a',
						last_seen: new Date().toISOString(),
					},
				],
			}),
		);
		const server = new McpServer({
			name: 'settlement-live-spec',
			version: '0.0.0',
		});
		await buildCommitPolicySettlementToolRegistration({
			namespacePrefix: 'spec',
			workspaceRoot: workspace,
			fileRel: FILE,
		}).register(server);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await server.connect(serverTransport);
		const client = new Client({
			name: 'settlement-live-client',
			version: '0',
		});
		await client.connect(clientTransport);
		try {
			const status = await client.callTool({
				name: 'spec_commit_policy_settlement',
				arguments: { action: 'status' },
			});
			expect(status.structuredContent).toMatchObject({
				ok: true,
				activeWorkers: 1,
			});
			const enter = await client.callTool({
				name: 'spec_commit_policy_settlement',
				arguments: { action: 'enter' },
			});
			expect(enter.structuredContent).toMatchObject({ ack: 'REFUSED' });
		} finally {
			await client.close();
			await server.close();
		}
	});
});
