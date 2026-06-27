import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@mcp-vertex/client';

import {
	TOOL_SEARCH_COMMAND,
	registerToolSearchCommand,
} from '../commands/tool-search';
import type { ICommandVscodeApi } from '../commands/types';

const createVscode = () => {
	const commands = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
	const messages: string[] = [];
	const picks: string[] = [];
	const quickPickBatches: Array<
		ReadonlyArray<{
			readonly id: string;
			readonly label: string;
			readonly description?: string;
			readonly detail?: string;
		}>
	> = [];
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
				return { webview: { html: '' } };
			},
			async showInformationMessage(message) {
				messages.push(message);
				return undefined;
			},
			async showQuickPick(items) {
				quickPickBatches.push(items);
				const first = items[0];
				if (first === undefined) return undefined;
				picks.push(first.id);
				return first.id;
			},
		},
	};
	return { vscode, commands, messages, picks, quickPickBatches };
};

describe('mcp-vertex.toolSearch', async () => {
	it('returns grouped tool, skill and proposal results for a multi-keyword query', async () => {
		const { vscode, commands, quickPickBatches } = createVscode();
		registerToolSearchCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool(input) {
					if (input.name === 'mcp-vertex_agent_catalog') {
						return {
							structuredContent: {
								server: {
									name: 'mcp-vertex',
									version: '0.1.0',
									namespacePrefix: 'mcp-vertex',
								},
								generatedAt: '2026-06-27T00:00:00.000Z',
								mode: 'full',
								counts: { tools: 1, skills: 1, proposals: 1 },
								proposalStatusCounts: {
									ready: 1,
									'in-progress': 0,
									review: 0,
									paused: 0,
									done: 0,
									blocked: 0,
									retired: 0,
									unspecified: 0,
								},
								tools: [
									{
										name: 'foo-bar-tool',
										plugin: 'demo',
										tags: ['foo', 'bar'],
									},
								],
								skills: [
									{
										id: 'foo-bar-skill',
										version: '1.0.0',
										minCoreVersion: '0.1.0',
										summary: 'foo bar summary',
										appliesTo: ['@mcp-vertex/core'],
										tags: ['foo', 'bar'],
										bodyPath: 'skills/foo-bar.md',
									},
								],
								proposals: [
									{
										id: 'f99999',
										title: 'Foo Bar Proposal',
										track: 'foo+bar',
										status: 'ready',
										kind: 'feat',
										date: '2026-06-27',
									},
								],
							},
						};
					}
					return { structuredContent: {} };
				},
			}),
		});
		await commands.get(TOOL_SEARCH_COMMAND)?.({ query: 'foo bar' });
		expect(quickPickBatches[0]?.map((item) => item.id)).toEqual([
			'tool:foo-bar-tool',
			'skill:foo-bar-skill',
			'proposal:f99999',
		]);
	});

	it('returns only the tool group when only tools match', async () => {
		const { vscode, commands, quickPickBatches } = createVscode();
		registerToolSearchCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool(input) {
					if (input.name === 'mcp-vertex_agent_catalog') {
						return {
							structuredContent: {
								server: {
									name: 'mcp-vertex',
									version: '0.1.0',
									namespacePrefix: 'mcp-vertex',
								},
								generatedAt: '2026-06-27T00:00:00.000Z',
								mode: 'full',
								counts: { tools: 1, skills: 1, proposals: 1 },
								proposalStatusCounts: {
									ready: 1,
									'in-progress': 0,
									review: 0,
									paused: 0,
									done: 0,
									blocked: 0,
									retired: 0,
									unspecified: 0,
								},
								tools: [
									{
										name: 'tool-only-hit',
										plugin: 'demo',
										tags: ['delta'],
									},
								],
								skills: [
									{
										id: 'skill-miss',
										version: '1.0.0',
										minCoreVersion: '0.1.0',
										summary: 'other',
										appliesTo: ['@mcp-vertex/core'],
										tags: ['omega'],
										bodyPath: 'skills/skill-miss.md',
									},
								],
								proposals: [
									{
										id: 'p-miss',
										title: 'Other proposal',
										track: 'omega',
										status: 'ready',
										kind: 'feat',
										date: '2026-06-27',
									},
								],
							},
						};
					}
					return { structuredContent: {} };
				},
			}),
		});
		await commands.get(TOOL_SEARCH_COMMAND)?.({ query: 'delta' });
		expect(quickPickBatches[0]?.map((item) => item.id)).toEqual([
			'tool:tool-only-hit',
		]);
	});

	it('falls back to the legacy tool search when the unified catalog is empty', async () => {
		const { vscode, commands, quickPickBatches } = createVscode();
		registerToolSearchCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool(input) {
					if (input.name === 'mcp-vertex_agent_catalog') {
						return {
							structuredContent: {
								server: {
									name: 'mcp-vertex',
									version: '0.1.0',
									namespacePrefix: 'mcp-vertex',
								},
								generatedAt: '2026-06-27T00:00:00.000Z',
								mode: 'full',
								counts: { tools: 0, skills: 0, proposals: 0 },
								proposalStatusCounts: {
									ready: 0,
									'in-progress': 0,
									review: 0,
									paused: 0,
									done: 0,
									blocked: 0,
									retired: 0,
									unspecified: 0,
								},
								tools: [],
								skills: [],
								proposals: [],
							},
						};
					}
					if (input.name === 'mcp-vertex_overview') {
						return {
							structuredContent: {
								server: {
									name: 'mcp-vertex',
									version: '0.1.0',
								},
								namespacePrefix: 'mcp-vertex',
								plugins: [],
								tools: [
									{
										name: 'mcp-vertex_overview',
										tags: ['overview'],
									},
								],
								knowledge: [],
								recommendedNextAction: '',
							},
						};
					}
					if (input.name === 'mcp-vertex_knowledge') {
						return { structuredContent: { entries: [] } };
					}
					return { structuredContent: {} };
				},
			}),
		});
		await commands.get(TOOL_SEARCH_COMMAND)?.({ query: 'overview' });
		expect(quickPickBatches[0]?.[0]?.id).toBe('tool:mcp-vertex_overview');
	});
});
