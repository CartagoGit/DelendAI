import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@delendai/client';

import {
	OPEN_ROADMAP_COMMAND,
	registerOpenRoadmapCommand,
} from '../commands/roadmap';
import type { ICommandVscodeApi } from '../commands/types';
import { asRoadmapView, renderRoadmapWebview } from '../webviews/roadmap';

const createVscode = () => {
	const panels: Array<{ webview: { html: string } }> = [];
	const messages: string[] = [];
	const errors: string[] = [];
	const commands = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
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
			async showInformationMessage(message) {
				messages.push(message);
				return undefined;
			},
			async showErrorMessage(message) {
				errors.push(message);
				return undefined;
			},
		},
	};
	return { vscode, panels, messages, errors, commands };
};

const VIEW = {
	ok: true,
	file: 'plan/ROADMAP.md',
	horizons: [
		{
			version: '2.4.0',
			bumpHint: 'minor',
			counts: { total: 2, delivered: 1, withdrawn: 0, open: 1 },
			entries: [
				{
					id: 'a',
					title: 'CSV <export>',
					kind: 'feature',
					state: 'delivered',
				},
				{
					id: 'b',
					title: 'Import',
					kind: 'feature',
					state: 'proposed',
				},
			],
		},
	],
};

const clientWith = (
	tools: readonly string[],
	answer: unknown | (() => never),
): McpStdioClient =>
	McpStdioClient.fromTransport({
		async listTools() {
			return { tools: tools.map((name) => ({ name })) };
		},
		async callTool() {
			if (typeof answer === 'function') return (answer as () => never)();
			return { structuredContent: answer };
		},
	} as never);

describe('delendai.openRoadmap', () => {
	it('opens a read-only panel from what the project calls its roadmap tool', async () => {
		const { vscode, panels, commands } = createVscode();
		registerOpenRoadmapCommand({
			vscode,
			client: clientWith(['acme_roadmap_show', 'acme_other'], VIEW),
		});
		await commands.get(OPEN_ROADMAP_COMMAND)?.();
		expect(panels).toHaveLength(1);
		const html = panels[0]?.webview.html ?? '';
		expect(html).toContain('plan/ROADMAP.md');
		expect(html).toContain('2.4.0');
		expect(html).toContain('1 delivered · 1 open · 0 withdrawn');
		// What the roadmap file says is text, never markup.
		expect(html).toContain('CSV &lt;export&gt;');
		expect(html).not.toContain('<export>');
		expect(html).toContain('Content-Security-Policy');
	});

	it('says so, and opens nothing, when the project declares no roadmap', async () => {
		const { vscode, panels, messages, commands } = createVscode();
		registerOpenRoadmapCommand({
			vscode,
			client: clientWith(['acme_other'], VIEW),
		});
		await commands.get(OPEN_ROADMAP_COMMAND)?.();
		expect(panels).toHaveLength(0);
		expect(messages[0]).toContain('declares no roadmap');
	});

	it('reports a roadmap that could not be read, or an answer it does not understand', async () => {
		const failing = createVscode();
		registerOpenRoadmapCommand({
			vscode: failing.vscode,
			client: clientWith(['acme_roadmap_show'], () => {
				throw new Error('roadmap-unreadable');
			}),
		});
		await failing.commands.get(OPEN_ROADMAP_COMMAND)?.();
		expect(failing.panels).toHaveLength(0);
		expect(failing.errors[0]).toContain('could not be read');

		const odd = createVscode();
		registerOpenRoadmapCommand({
			vscode: odd.vscode,
			client: clientWith(['acme_roadmap_show'], { ok: true }),
		});
		await odd.commands.get(OPEN_ROADMAP_COMMAND)?.();
		expect(odd.errors[0]).toContain('shape this view does not read');
	});
});

describe('the roadmap view', () => {
	it('reads only an answer that has a file and horizons', () => {
		expect(asRoadmapView(VIEW)?.file).toBe('plan/ROADMAP.md');
		expect(asRoadmapView(null)).toBeUndefined();
		expect(asRoadmapView({ file: 'x' })).toBeUndefined();
	});

	it('says when the file holds no version', () => {
		expect(renderRoadmapWebview({ file: 'R.md', horizons: [] })).toContain(
			'holds no version yet',
		);
	});
});
