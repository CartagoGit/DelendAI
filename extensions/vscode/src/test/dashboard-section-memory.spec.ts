/**
 * dashboard-section-memory.spec.ts — f00800 S6: the dashboard is the one
 * view and it remembers the section the viewer chose.
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@delendai/client';
import { fakePartial, waitUntil } from '@delendai/test-kit';
import type {
	IHostAdapter,
	IWebviewPanel,
} from '@delendai/ui-extension/public';

import { DASHBOARD_SECTION_KEY } from '../contracts/constants/dashboard-section-key.constant';
import { DashboardWebviewViewProvider } from '../providers/dashboard-webview-view-provider';

const setup = (stored: Map<string, unknown>) => {
	const htmls: string[] = [];
	let receive: ((message: unknown) => void | Promise<void>) | undefined;
	const view = fakePartial<IWebviewPanel>({
		id: 'section',
		visible: true,
		webview: {
			options: {},
			html: '',
			setHtml(html: string) {
				htmls.push(html);
			},
			postMessage: async () => {},
			onDidReceiveMessage: (handler) => {
				receive = handler;
				return { dispose() {} };
			},
		},
		reveal() {},
		dispose() {},
		onDidDispose: () => ({ dispose() {} }),
	});
	const provider = new DashboardWebviewViewProvider({
		host: fakePartial<IHostAdapter>({}),
		client: McpStdioClient.fromTransport({
			async callTool() {
				return { structuredContent: {} };
			},
			async listTools() {
				return { tools: [] };
			},
		}),
		globalState: {
			get: <T>(key: string) => stored.get(key) as T | undefined,
			update: async (key, value) => {
				stored.set(key, value);
			},
		},
		getConfig: () => ({}),
	});
	return { provider, view, htmls, send: (m: unknown) => receive?.(m) };
};

describe('dashboard section memory', () => {
	it('[<200ms] stores the section the page reports', async () => {
		const stored = new Map<string, unknown>();
		const { provider, view, send } = setup(stored);
		await provider.resolveWebviewView(view);

		await send({ command: 'section', section: 'memory' });

		expect(stored.get(DASHBOARD_SECTION_KEY)).toBe('memory');
	});

	it('[<200ms] opens the remembered section when the page loads', async () => {
		const stored = new Map<string, unknown>([
			[DASHBOARD_SECTION_KEY, 'proposals'],
		]);
		const { provider, view, htmls } = setup(stored);

		await provider.resolveWebviewView(view);
		await waitUntil('the page renders', () => htmls.length > 0);

		expect(htmls.at(-1)).toContain('var s="proposals"');
		expect(htmls.at(-1)).toContain("command:'section'");
	});

	it('[<200ms] ignores a report with no section name', async () => {
		const stored = new Map<string, unknown>();
		const { provider, view, send } = setup(stored);
		await provider.resolveWebviewView(view);

		await send({ command: 'section', section: '' });

		expect(stored.has(DASHBOARD_SECTION_KEY)).toBe(false);
	});
});
