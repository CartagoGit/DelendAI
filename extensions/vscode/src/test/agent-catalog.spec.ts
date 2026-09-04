import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AgentCatalogService, McpStdioClient } from '@delendai/client';

import {
	OPEN_AGENT_CATALOG_COMMAND,
	registerOpenAgentCatalogCommand,
} from '../commands/open-agent-catalog';
import type { ICommandVscodeApi } from '../commands/types';
import { renderAgentCatalogWebview } from '../views/agent-catalog-webview';

interface IArtifactShape {
	readonly generatedAt: string;
	readonly tools: ReadonlyArray<{
		readonly name: string;
		readonly plugin: string;
	}>;
	readonly skills: ReadonlyArray<{
		readonly id: string;
		readonly version: string;
		readonly minCoreVersion: string;
		readonly summary: string;
		readonly appliesTo: readonly string[];
		readonly tags: readonly string[];
		readonly bodyPath: string;
	}>;
	readonly proposals: {
		readonly actionable: ReadonlyArray<{
			readonly id: string;
			readonly title: string;
			readonly track: string;
			readonly status: 'ready' | 'in-progress' | 'paused';
			readonly kind:
				| 'feat'
				| 'fix'
				| 'refactor'
				| 'chore'
				| 'docs'
				| 'plan'
				| 'audit'
				| 'unspecified';
			readonly date: string;
		}>;
	};
}

const loadArtifact = async (): Promise<IArtifactShape> => {
	const here = dirname(fileURLToPath(import.meta.url));
	const repoRoot = resolve(here, '../../../..');
	const raw = await readFile(
		resolve(repoRoot, 'docs/mcp-vertex/agent-catalog.generated.json'),
		'utf8',
	);
	return JSON.parse(raw) as IArtifactShape;
};

const createSnapshot = async () => {
	const artifact = await loadArtifact();
	return {
		server: {
			name: 'mcp-vertex',
			version: '0.1.0',
			namespacePrefix: 'mcp-vertex',
		},
		generatedAt: artifact.generatedAt,
		mode: 'full' as const,
		counts: {
			tools: artifact.tools.length,
			skills: artifact.skills.length,
			proposals: artifact.proposals.actionable.length,
		},
		proposalStatusCounts: {
			ready: artifact.proposals.actionable.filter(
				(proposal) => proposal.status === 'ready',
			).length,
			'in-progress': artifact.proposals.actionable.filter(
				(proposal) => proposal.status === 'in-progress',
			).length,
			review: 0,
			paused: artifact.proposals.actionable.filter(
				(proposal) => proposal.status === 'paused',
			).length,
			done: 0,
			blocked: 0,
			retired: 0,
			unspecified: 0,
		},
		tools: artifact.tools,
		skills: artifact.skills,
		proposals: artifact.proposals.actionable,
	};
};

describe('AgentCatalogService', () => {
	it('returns canonical matches from the catalog artifact', async () => {
		const snapshot = await createSnapshot();
		const service = new AgentCatalogService(
			McpStdioClient.fromTransport({
				async callTool(input) {
					expect(input.name).toBe('mcp-vertex_agent_catalog');
					return { structuredContent: snapshot };
				},
			}),
		);

		const result = await service.search('agent_catalog');
		expect(
			result.tools.some(
				(tool) => tool.name === 'mcp-vertex_agent_catalog',
			),
		).toBe(true);
	});

	it('returns empty arrays when nothing matches', async () => {
		const snapshot = await createSnapshot();
		const service = new AgentCatalogService(
			McpStdioClient.fromTransport({
				async callTool() {
					return { structuredContent: snapshot };
				},
			}),
		);

		await expect(
			service.search('nonexistent-skill-or-tool'),
		).resolves.toEqual({
			tools: [],
			skills: [],
			proposals: [],
		});
	});

	it('invalidates the cache and re-fetches', async () => {
		const snapshot = await createSnapshot();
		let calls = 0;
		const service = new AgentCatalogService(
			McpStdioClient.fromTransport({
				async callTool() {
					calls += 1;
					return { structuredContent: snapshot };
				},
			}),
		);

		await service.getTools();
		await service.getTools();
		service.invalidate();
		await service.getTools();

		expect(calls).toBe(2);
	});

	it('uses the configured namespace for catalog and skill requests', async () => {
		const snapshot = await createSnapshot();
		const calls: string[] = [];
		const service = new AgentCatalogService(
			McpStdioClient.fromTransport({
				async callTool(input) {
					calls.push(input.name);
					return input.name === 'acme_agent_catalog'
						? { structuredContent: snapshot }
						: { structuredContent: { body: '# Skill' } };
				},
			}),
			{ namespacePrefix: 'acme' },
		);

		await service.getTools();
		await expect(service.getSkillBody('demo')).resolves.toBe('# Skill');
		expect(calls).toEqual(['acme_agent_catalog', 'acme_skill']);
	});
});

describe('renderAgentCatalogWebview', () => {
	it('renders tools, skills and proposals in the expected order', async () => {
		const snapshot = await createSnapshot();
		const html = renderAgentCatalogWebview({
			bootstrapPrompt: 'Call mcp-vertex_overview first.',
			tools: snapshot.tools,
			skills: snapshot.skills,
			proposals: snapshot.proposals,
		});

		const toolsIndex = html.indexOf('data-section="tools"');
		const skillsIndex = html.indexOf('data-section="skills"');
		const proposalsIndex = html.indexOf('data-section="proposals"');

		expect(toolsIndex).toBeGreaterThan(-1);
		expect(skillsIndex).toBeGreaterThan(toolsIndex);
		expect(proposalsIndex).toBeGreaterThan(skillsIndex);
	});
});

/**
 * a00084 F31: `registerOpenAgentCatalogCommand`'s webview message handler
 * used to duck-type dispatch (`(message as {command?:unknown}).command`)
 * with zero coverage anywhere. Now validated through the same
 * zod-discriminated-union schema `open-configuration-center.ts` already
 * uses (`AGENT_CATALOG_MESSAGE_SCHEMA`) — these specs pin both the happy
 * path per command and that a malformed message is rejected cleanly
 * instead of crashing or falling through an unintended branch.
 */
describe('registerOpenAgentCatalogCommand', () => {
	const createFullClient = (
		snapshot: Awaited<ReturnType<typeof createSnapshot>>,
		onCall?: (toolName: string) => void,
	): McpStdioClient =>
		McpStdioClient.fromTransport({
			async callTool(input) {
				onCall?.(input.name);
				if (input.name === 'mcp-vertex_agent_catalog') {
					return { structuredContent: snapshot };
				}
				if (input.name === 'mcp-vertex_skill') {
					return { structuredContent: { body: '# Skill body' } };
				}
				if (input.name === 'mcp-vertex_proposals_proposal_board') {
					return {
						structuredContent: {
							proposals: [{ id: 'x00001', title: 'Demo' }],
						},
					};
				}
				return { structuredContent: { ok: true } };
			},
		});

	const harness = (client: McpStdioClient) => {
		let receive: ((message: unknown) => void | Promise<void>) | undefined;
		const infos: string[] = [];
		const commands = new Map<
			string,
			(...args: readonly unknown[]) => unknown
		>();
		const panel = {
			webview: {
				html: '',
				onDidReceiveMessage(callback: typeof receive) {
					receive = callback;
					return { dispose() {} };
				},
			},
		};
		const vscode: ICommandVscodeApi = {
			ViewColumn: { One: 1 },
			commands: {
				registerCommand(command, callback) {
					commands.set(command, callback);
					return { dispose() {} };
				},
			},
			window: {
				createWebviewPanel() {
					return panel;
				},
				async showInformationMessage(message) {
					infos.push(message);
					return undefined;
				},
			},
		};
		registerOpenAgentCatalogCommand({ vscode, client });
		return {
			infos,
			open: () => commands.get(OPEN_AGENT_CATALOG_COMMAND)?.(),
			send: (message: unknown) => receive?.(message),
		};
	};

	it('rejects a malformed message instead of crashing or dispatching', async () => {
		const snapshot = await createSnapshot();
		const calls: string[] = [];
		const { open, send, infos } = harness(
			createFullClient(snapshot, (name) => calls.push(name)),
		);
		await open();
		calls.length = 0;

		// Wrong type for `id`, unknown `command`, and a known command with
		// an extra unexpected field must all fail closed (no dispatch).
		await send({ command: 'callTool', id: 123 });
		await send({ command: 'not-a-real-command' });
		await send({ command: 'refresh', extra: 'field' });
		await send('just a string');
		await send(null);

		expect(calls).toEqual([]);
		expect(infos).toEqual([]);
	});

	it('dispatches refresh, copied, callTool, openSkill and openProposal', async () => {
		const snapshot = await createSnapshot();
		const calls: string[] = [];
		const { open, send, infos } = harness(
			createFullClient(snapshot, (name) => calls.push(name)),
		);
		await open();
		calls.length = 0;

		await send({ command: 'copied' });
		expect(infos).toEqual(['mcp-vertex: bootstrap prompt copied']);

		await send({ command: 'refresh' });
		expect(calls).toContain('mcp-vertex_agent_catalog');

		calls.length = 0;
		await send({ command: 'callTool', id: 'mcp-vertex_overview' });
		expect(calls).toEqual(['mcp-vertex_overview']);

		calls.length = 0;
		await send({ command: 'openSkill', id: 'demo-skill' });
		expect(calls).toEqual(['mcp-vertex_skill']);

		calls.length = 0;
		await send({ command: 'openProposal', id: 'x00001' });
		expect(calls).toEqual(['mcp-vertex_proposals_proposal_board']);
	});
});
