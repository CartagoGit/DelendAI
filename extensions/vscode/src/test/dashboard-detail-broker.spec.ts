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
import { waitUntil } from '@delendai/test-kit';

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
	send(message: unknown): Promise<unknown>;
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
		send: async (message) => onMessage?.(message),
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
		getConfiguration: <T>() => ({}) as T,
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
		await waitUntil(
			'the log stream started',
			() => Reflect.get(provider, 'logsAbort') !== undefined,
		);
		const { signal } = Reflect.get(
			provider,
			'logsAbort',
		) as AbortController;
		expect(signal.aborted).toBe(false);
		dispose();
		expect(signal.aborted).toBe(true);
	});
});

describe('DashboardWebviewViewProvider messages', () => {
	const setup = (
		extra: {
			client?: McpStdioClient;
			settingsStore?: {
				read(): Promise<unknown>;
				write(v: unknown): Promise<void>;
			};
		} = {},
	) => {
		const executed: Array<readonly unknown[]> = [];
		const base = baseDeps();
		const view = makeView();
		const provider = new DashboardWebviewViewProvider({
			...base,
			host: {
				...base.host,
				executeCommand: async (...args: readonly unknown[]) => {
					executed.push(args);
				},
			},
			client: extra.client ?? fakeClient(),
			...(extra.settingsStore === undefined
				? {}
				: { settingsStore: extra.settingsStore }),
		});
		return { provider, view, executed };
	};

	it('routes shell actions, tools, surfaces and proposals to host commands', async () => {
		const { provider, view, executed } = setup();
		await provider.resolveWebviewView(view.view);
		await view.send({ command: 'action', action: 'expand' });
		await view.send({ command: 'action', action: 'refresh' });
		await view.send({ command: 'openTool', name: 'delendai_x' });
		await view.send({ command: 'openSurface', surface: 'settings' });
		await view.send({ command: 'openProposal', id: 'f00001' });
		await view.send({ command: 'bogus' });
		expect(executed).toHaveLength(5);
		expect(executed[2]).toEqual([expect.any(String), 'delendai_x']);
		expect(executed[4]).toEqual([expect.any(String), 'f00001']);
	});

	it('saves and resets settings through the store and reports errors', async () => {
		let stored: unknown;
		const { provider, view } = setup({
			settingsStore: {
				read: async () => stored,
				write: async (value) => {
					stored = value;
				},
			},
		});
		await provider.resolveWebviewView(view.view);
		await view.send({
			command: 'settings',
			action: 'save',
			settings: { theme: 'dark' },
		});
		await view.send({ command: 'settings', action: 'reset' });
		await view.send({
			command: 'settings',
			action: 'save',
			settings: { theme: 'not-a-theme' },
		});
		const results = view.posted.filter(
			(m) => m['command'] === 'settingsResult',
		);
		expect(results).toHaveLength(3);
		expect(results[0]).toHaveProperty('settings');
		expect(results[2]).toHaveProperty('error');
	});

	it('ignores settings messages when no store is wired', async () => {
		const { provider, view } = setup();
		await provider.resolveWebviewView(view.view);
		await view.send({ command: 'settings', action: 'reset' });
		expect(view.posted.some((m) => m['command'] === 'settingsResult')).toBe(
			false,
		);
	});

	it('streams filtered log events and stops on request', async () => {
		const event = {
			ts: '2026-01-01T00:00:00.000Z',
			kind: 'k',
			agent: 'a',
			taskId: 't',
			outcome: 'ok',
			files: [],
			summary: 'hello',
			meta: {},
		};
		const client = McpStdioClient.fromTransport({
			async callTool(input) {
				if (input.name === 'delendai_logs_tail')
					return {
						structuredContent: {
							events: [event],
							oldestTs: event.ts,
						},
					};
				if (input.name === 'delendai_logs_subscribe')
					return {
						structuredContent: {
							events: [{ ...event, summary: 'live' }],
							stream: 'logs',
						},
					};
				return { structuredContent: {} };
			},
			async listTools() {
				return { tools: [] };
			},
		});
		const { provider, view } = setup({ client });
		await provider.resolveWebviewView(view.view);
		await view.send({
			command: 'logs',
			action: 'source',
			source: 'server',
		});
		await view.send({
			command: 'logs',
			action: 'filter',
			outcome: 'ok',
			agent: 'a',
			taskId: 't',
		});
		await view.send({ command: 'logs', action: 'filter' });
		await view.send({ command: 'logs', action: 'filter', agent: 'a' });
		const started = view.send({ command: 'logs', action: 'refresh' });
		await waitUntil('live event posted', () =>
			view.posted.some(
				(m) =>
					m['command'] === 'hostLogEvent' &&
					JSON.stringify(m).includes('live'),
			),
		);
		await view.send({ command: 'logs', action: 'stop' });
		await started;
		expect(Reflect.get(provider, 'logsAbort')).toBeUndefined();
		expect(
			view.posted.some((m) => JSON.stringify(m).includes('hello')),
		).toBe(true);
	});
});
