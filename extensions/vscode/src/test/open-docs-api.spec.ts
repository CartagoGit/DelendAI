import { describe, expect, it } from 'vitest';

import {
	DEFAULT_DOCS_BASE_URL,
	OPEN_DOCS_API_COMMAND,
	registerOpenDocsApiCommand,
	resolveDocsApiTargets,
} from '../commands/open-docs-api';
import type { ICommandVscodeApi } from '../commands/types';

const createVscode = (pick?: string) => {
	const panels: Array<{ webview: { html: string } }> = [];
	const messages: string[] = [];
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
			async showQuickPick() {
				return pick;
			},
		},
	};
	return { vscode, commands, panels, messages };
};

describe('resolveDocsApiTargets', () => {
	it('returns a non-empty set of canonical doc targets with https URLs', () => {
		const targets = resolveDocsApiTargets();
		expect(targets.length).toBeGreaterThan(0);
		for (const t of targets) {
			expect(t.id.length).toBeGreaterThan(0);
			expect(t.label.length).toBeGreaterThan(0);
			expect(t.url.startsWith('https://')).toBe(true);
		}
	});

	it('covers the canonical pages (guide, cli, plugins, tools, api) with distinct ids', () => {
		const ids = resolveDocsApiTargets().map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ['guide', 'cli', 'plugins', 'tools', 'api']) {
			expect(ids).toContain(id);
		}
	});

	it('deep-links into the given base url', () => {
		const targets = resolveDocsApiTargets('https://docs.example.com/');
		expect(targets.find((t) => t.id === 'cli')?.url).toBe(
			'https://docs.example.com/cli',
		);
	});
});

describe('mcp-vertex.openDocsApi', () => {
	it('registers the command', () => {
		const { vscode, commands } = createVscode();
		registerOpenDocsApiCommand({ vscode });
		expect(commands.has(OPEN_DOCS_API_COMMAND)).toBe(true);
	});

	it('opens the picked canonical page in a webview (default docs site)', async () => {
		const { vscode, commands, panels } = createVscode('cli');
		registerOpenDocsApiCommand({ vscode });
		await commands.get(OPEN_DOCS_API_COMMAND)?.();
		expect(panels).toHaveLength(1);
		expect(panels[0]?.webview.html).toContain(
			`${DEFAULT_DOCS_BASE_URL}/cli`,
		);
		expect(panels[0]?.webview.html).toContain('<iframe');
	});

	it('falls back to the first target when the picker is dismissed', async () => {
		const { vscode, commands, panels } = createVscode(undefined);
		registerOpenDocsApiCommand({ vscode });
		await commands.get(OPEN_DOCS_API_COMMAND)?.();
		expect(panels).toHaveLength(1);
		expect(panels[0]?.webview.html).toContain(
			`${DEFAULT_DOCS_BASE_URL}/guide`,
		);
	});
});
