/**
 * proposals-view-registration.spec.ts — f00079 S4 (closes a00040 H5).
 *
 * `mcp-vertex.proposals` is declared in `contributes.views` but had no
 * `TreeDataProvider`, so the view was permanently empty. This pins that
 * `activate()` now registers a provider against the proposals view id,
 * and that the registered provider is the live `ProposalBoardProvider`
 * (it exposes `getChildren` and mirrors the proposal board tool).
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient, type IOverview } from '@mcp-vertex/client';

import {
	activate,
	deactivate,
	__resetRuntimeHandle,
	PROPOSALS_VIEW_ID,
	type IExtensionContext,
	type IVscodeApi,
} from '../extension';

const overviewFixture: IOverview = {
	server: { name: 'mcp-vertex', version: '0.1.0' },
	namespacePrefix: 'mcp-vertex',
	plugins: ['core', 'proposals'],
	tools: ['mcp-vertex_overview'],
	knowledge: [],
	recommendedNextAction: 'Call overview first.',
};

describe('proposals view registration (f00079 S4)', async () => {
	it('registers a TreeDataProvider for the proposals view', async () => {
		__resetRuntimeHandle();

		const stored = new Map<string, unknown>();
		const registeredViews = new Map<string, { getChildren?: unknown }>();
		const context: IExtensionContext = {
			subscriptions: [],
			globalState: {
				get<T>(key: string): T | undefined {
					return stored.get(key) as T | undefined;
				},
				async update(key, value) {
					stored.set(key, value);
				},
			},
		};

		const vscode: IVscodeApi = {
			ViewColumn: { One: 1 },
			commands: {
				registerCommand() {
					return { dispose() {} };
				},
			},
			window: {
				registerTreeDataProvider(viewId, provider) {
					registeredViews.set(
						viewId,
						provider as { getChildren?: unknown },
					);
					return { dispose() {} };
				},
				createWebviewPanel() {
					return { webview: { html: '' } };
				},
			},
		};

		const client = McpStdioClient.fromTransport({
			async callTool() {
				return { structuredContent: overviewFixture };
			},
		});

		await activate(context, { vscode, createClient: async () => client });

		const provider = registeredViews.get(PROPOSALS_VIEW_ID);
		expect(provider).toBeDefined();
		expect(typeof provider?.getChildren).toBe('function');

		await deactivate();
	});
});
