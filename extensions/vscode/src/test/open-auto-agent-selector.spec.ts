import { describe, expect, it } from 'vitest';

import {
	OPEN_AUTO_AGENT_SELECTOR_COMMAND,
	registerOpenAutoAgentSelectorCommand,
} from '../commands/open-auto-agent-selector';
import type { ICommandVscodeApi } from '../commands/types';

interface IFakeClient {
	request: (
		tool: string,
		args: Readonly<Record<string, unknown>>,
	) => Promise<unknown>;
}

const createFakeClient = (
	plan: ReadonlyArray<{
		readonly tool: string;
		readonly response: unknown;
	}>,
): IFakeClient => {
	let index = 0;
	return {
		async request(tool) {
			const expected = plan[index];
			index += 1;
			if (expected === undefined) {
				throw new Error(`unexpected call to "${tool}"`);
			}
			if (expected.tool !== tool) {
				throw new Error(
					`expected call to "${expected.tool}", got "${tool}"`,
				);
			}
			return expected.response;
		},
	};
};

const createVscode = () => {
	const panels: Array<{ webview: { html: string } }> = [];
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
				const panel = { webview: { html: '' } };
				panels.push(panel);
				return panel;
			},
		},
	};
	const commands = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
	return { vscode, commands, panels };
};

const stripHtml = (html: string): string =>
	html
		.replace(/<[^>]+>/gu, '')
		.replace(/\s+/gu, ' ')
		.trim();

describe('mcp-vertex.openAutoAgentSelector', () => {
	it('exposes a single command id', () => {
		expect(OPEN_AUTO_AGENT_SELECTOR_COMMAND).toBe(
			'mcp-vertex.openAutoAgentSelector',
		);
	});

	it('renders auto_status only when no taskType is supplied', async () => {
		const { vscode, commands, panels } = createVscode();
		const client = createFakeClient([
			{
				tool: 'mcp-vertex_auto-agent-selector_auto_status',
				response: {
					available: [
						{ id: 'claude', label: 'Claude Code', source: 'cli' },
					],
					missing: [],
					availableCount: 1,
					persisted: true,
				},
			},
		]);
		registerOpenAutoAgentSelectorCommand({
			vscode,
			client: client as unknown as Parameters<
				typeof registerOpenAutoAgentSelectorCommand
			>[0]['client'],
		});

		const callback = commands.get(OPEN_AUTO_AGENT_SELECTOR_COMMAND);
		expect(callback).toBeDefined();
		await callback?.();

		expect(panels).toHaveLength(1);
		const html = panels[0]?.webview.html ?? '';
		expect(stripHtml(html)).toContain('claude');
		expect(stripHtml(html)).not.toContain('recommendation');
	});

	it('fetches auto_recommend when a taskType is supplied', async () => {
		const { vscode, commands, panels } = createVscode();
		const client = createFakeClient([
			{
				tool: 'mcp-vertex_auto-agent-selector_auto_status',
				response: {
					available: [
						{ id: 'claude', label: 'Claude Code', source: 'cli' },
					],
					missing: [],
					availableCount: 1,
					persisted: true,
				},
			},
			{
				tool: 'mcp-vertex_auto-agent-selector_auto_recommend',
				response: {
					recommendations: [{ id: 'claude', score: 0.9 }],
				},
			},
		]);
		registerOpenAutoAgentSelectorCommand({
			vscode,
			client: client as unknown as Parameters<
				typeof registerOpenAutoAgentSelectorCommand
			>[0]['client'],
		});

		const callback = commands.get(OPEN_AUTO_AGENT_SELECTOR_COMMAND);
		expect(callback).toBeDefined();
		await callback?.({ taskType: 'review' });

		expect(panels).toHaveLength(1);
		const html = panels[0]?.webview.html ?? '';
		expect(stripHtml(html)).toContain('claude');
		expect(stripHtml(html)).toContain('review');
		expect(stripHtml(html)).toContain('recommendation');
	});

	it('honors a custom namespacePrefix', async () => {
		const { vscode, commands, panels } = createVscode();
		const client = createFakeClient([
			{
				tool: 'acme_auto-agent-selector_auto_status',
				response: {
					available: [],
					missing: [],
					availableCount: 0,
					persisted: true,
				},
			},
		]);
		registerOpenAutoAgentSelectorCommand({
			vscode,
			namespacePrefix: 'acme',
			client: client as unknown as Parameters<
				typeof registerOpenAutoAgentSelectorCommand
			>[0]['client'],
		});

		const callback = commands.get(OPEN_AUTO_AGENT_SELECTOR_COMMAND);
		await callback?.();

		expect(panels).toHaveLength(1);
	});
});
