/**
 * dashboard-detail-broker.spec.ts — pins the host→webview channel
 * that `DashboardWebviewViewProvider` exposes via `getDetailBroker()`.
 *
 * The broker is what lets the dashboard shell mount tool/proposal
 * details inside its overlay instead of forcing every command to open
 * a standalone webview panel. Each tool/proposal command receives the
 * `ICommandDeps.detailSink` hook which delegates to the broker.
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@delendai/client';

import {
	DashboardWebviewViewProvider,
	type IDashboardDetailBroker,
} from '../providers/dashboard-webview-view-provider';
import type { IWebviewPanel } from '@delendai/ui-extension/public';

const fakeClient = (): McpStdioClient =>
	McpStdioClient.fromTransport({
		async callTool(input) {
			if (input.name === 'delendai_overview') {
				return {
					structuredContent: {
						namespacePrefix: 'delendai',
						server: { name: 'delendai', version: '0.1.0' },
						plugins: ['core'],
						tools: ['delendai_overview'],
						knowledge: [],
						recommendedNextAction: 'OK',
					},
				};
			}
			if (input.name === 'delendai_metrics') {
				return { structuredContent: { tools: {}, totals: {} } };
			}
			if (input.name === 'delendai_health') {
				return {
					structuredContent: { healthy: true, stale: [] },
				};
			}
			return { structuredContent: {} };
		},
		async listTools() {
			return { tools: [] };
		},
	});

const makeView = (): {
	view: IWebviewPanel;
	posted: Array<Record<string, unknown>>;
} => {
	const posted: Array<Record<string, unknown>> = [];
	const view: IWebviewPanel = {
		id: 'test',
		visible: true,
		webview: {
			options: {},
			html: '',
			setHtml() {},
			postMessage: async (msg: unknown) => {
				posted.push(msg as Record<string, unknown>);
			},
		},
		reveal() {},
		dispose() {},
		onDidDispose() {
			return { dispose() {} };
		},
	};
	return { view, posted };
};

describe('DashboardWebviewViewProvider detail broker', () => {
	it('returns false from push when no view is resolved', async () => {
		const provider = new DashboardWebviewViewProvider({
			host: {
				id: 'test',
				displayName: 'Test',
				hostVersion: '0.0.0',
				registerCommand: () => ({ dispose() {} }),
				createStatusBarItem: () => {
					throw new Error('unused');
				},
				registerTreeDataProvider: () => ({ dispose() {} }),
				createWebviewPanel: () => {
					throw new Error('unused');
				},
				showInformationMessage: async () => undefined,
				showErrorMessage: async () => undefined,
				openTextDocument: async () => undefined,
				revealInExplorer: async () => undefined,
				onDidChangeConfiguration: () => ({ dispose() {} }),
				getConfiguration: () => ({}) as never,
				asWebviewUri: (uri: string) => uri,
			},
			client: fakeClient(),
			getConfig: () => ({}),
		});
		const broker: IDashboardDetailBroker = provider.getDetailBroker();
		await expect(
			broker.push({ kind: 'tool', model: { tool: { name: 'x' } } }),
		).resolves.toBe(false);
	});

	it('posts hostToolDetail when a tool payload is pushed', async () => {
		const { view, posted } = makeView();
		const provider = new DashboardWebviewViewProvider({
			host: {
				id: 'test',
				displayName: 'Test',
				hostVersion: '0.0.0',
				registerCommand: () => ({ dispose() {} }),
				createStatusBarItem: () => {
					throw new Error('unused');
				},
				registerTreeDataProvider: () => ({ dispose() {} }),
				createWebviewPanel: () => {
					throw new Error('unused');
				},
				showInformationMessage: async () => undefined,
				showErrorMessage: async () => undefined,
				openTextDocument: async () => undefined,
				revealInExplorer: async () => undefined,
				onDidChangeConfiguration: () => ({ dispose() {} }),
				getConfiguration: () => ({}) as never,
				asWebviewUri: (uri: string) => uri,
			},
			client: fakeClient(),
			getConfig: () => ({}),
		});
		await provider.resolveWebviewView(view);
		const broker = provider.getDetailBroker();
		const model = { tool: { name: 'fake_tool' }, copy: {} };
		const ok = await broker.push({ kind: 'tool', model });
		expect(ok).toBe(true);
		expect(posted).toContainEqual({
			command: 'hostToolDetail',
			model,
		});
	});

	it('posts hostHideDetail and hostProposalDetail', async () => {
		const { view, posted } = makeView();
		const provider = new DashboardWebviewViewProvider({
			host: {
				id: 'test',
				displayName: 'Test',
				hostVersion: '0.0.0',
				registerCommand: () => ({ dispose() {} }),
				createStatusBarItem: () => {
					throw new Error('unused');
				},
				registerTreeDataProvider: () => ({ dispose() {} }),
				createWebviewPanel: () => {
					throw new Error('unused');
				},
				showInformationMessage: async () => undefined,
				showErrorMessage: async () => undefined,
				openTextDocument: async () => undefined,
				revealInExplorer: async () => undefined,
				onDidChangeConfiguration: () => ({ dispose() {} }),
				getConfiguration: () => ({}) as never,
				asWebviewUri: (uri: string) => uri,
			},
			client: fakeClient(),
			getConfig: () => ({}),
		});
		await provider.resolveWebviewView(view);
		const broker = provider.getDetailBroker();
		await broker.push({
			kind: 'proposal',
			model: { id: 'f99999' },
		});
		await broker.hide();
		expect(posted).toContainEqual({
			command: 'hostProposalDetail',
			model: { id: 'f99999' },
		});
		expect(posted).toContainEqual({ command: 'hostHideDetail' });
	});
});
