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
import { fakePartial } from '@delendai/test-kit';

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
	dispose(): void;
	send(message: unknown): void;
} => {
	const posted: Array<Record<string, unknown>> = [];
	let onDispose: (() => void) | undefined;
	let onMessage: ((message: unknown) => unknown) | undefined;
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
			onDidReceiveMessage(handler: (message: unknown) => unknown) {
				onMessage = handler;
				return { dispose() {} };
			},
		},
		reveal() {},
		dispose() {},
		onDidDispose(handler: () => void) {
			onDispose = handler;
			return { dispose() {} };
		},
	};
	return {
		view,
		posted,
		dispose: () => onDispose?.(),
		send: (message) => void onMessage?.(message),
	};
};

const baseDeps = () => ({
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
		getConfiguration: () => fakePartial<never>({}),
		asWebviewUri: (uri: string) => uri,
	},
	getConfig: () => ({}),
});

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
		const model = { tool: { name: 'fake_tool', plugin: 'p' } };
		const ok = await broker.push({ kind: 'tool', model });
		expect(ok).toBe(true);
		expect(posted).toContainEqual({
			command: 'hostToolDetail',
			model,
			html: expect.stringContaining('fake_tool'),
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
		const model = {
			id: 'f99999',
			summary: {
				id: 'f99999',
				status: 'ready',
				slices: [],
				claimableSliceIds: [],
			},
			diagnose: { folder: 'docs', ok: true },
			logs: [],
			planMarkdown: '# Goal',
			agents: [],
			progress: {
				total: 0,
				done: 0,
				inProgress: 0,
				pending: 0,
				percent: 0,
				eta: '2026-08-31T18:00:00Z',
				etaLabel: '-',
				avgSliceMs: 0,
			},
		};
		await broker.push({ kind: 'proposal', model });
		await broker.hide();
		expect(posted).toContainEqual({
			command: 'hostProposalDetail',
			model,
			html: expect.stringContaining('f99999'),
		});
		expect(posted).toContainEqual({ command: 'hostHideDetail' });
	});
});

describe('DashboardWebviewViewProvider log polling', () => {
	it('stops the log stream when the view is disposed (UI-LOG02)', async () => {
		const { view, dispose, send } = makeView();
		const provider = new DashboardWebviewViewProvider({
			...baseDeps(),
			client: fakeClient(),
		});
		await provider.resolveWebviewView(view);
		send({ command: 'logs', action: 'start' });
		await new Promise((resolve) => setTimeout(resolve, 20));
		const { signal } = Reflect.get(
			provider,
			'logsAbort',
		) as AbortController;
		expect(signal.aborted).toBe(false);
		dispose();
		expect(signal.aborted).toBe(true);
	});
});
