import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AgentCatalogService, McpStdioClient } from '@mcp-vertex/client';

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
