import { describe, expect, it } from 'vitest';

import {
	OPEN_DOCS_COMMAND,
	registerOpenDocsCommand,
} from '../commands/open-docs';
import type { ICommandVscodeApi } from '../commands/types';

const createVscode = () => {
	const panels: Array<{ webview: { html: string } }> = [];
	const messages: string[] = [];
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
		},
	};
	const commands = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
	return { vscode, commands, panels, messages };
};

describe('mcp-vertex.openDocs', () => {
	it('opens an iframe with the configured docs URL', async () => {
		const { vscode, commands, panels, messages } = createVscode();
		registerOpenDocsCommand({ vscode });
		expect(commands.has(OPEN_DOCS_COMMAND)).toBe(true);

		await commands.get(OPEN_DOCS_COMMAND)?.();
		expect(panels).toHaveLength(1);
		expect(panels[0]?.webview.html).toContain('https://mcp-vertex.dev');
		expect(panels[0]?.webview.html).toContain('<iframe');
		expect(messages).toEqual([]);
	});

	it('rejects http:// URLs and shows a message instead', async () => {
		const { vscode, commands, panels, messages } = createVscode();
		registerOpenDocsCommand({
			vscode,
			options: { fallbackUrl: 'http://insecure.example' },
		});
		await commands.get(OPEN_DOCS_COMMAND)?.();
		expect(panels).toHaveLength(0);
		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatch(/rejected/);
	});

	it('rejects localhost by default', async () => {
		const { vscode, commands, panels, messages } = createVscode();
		registerOpenDocsCommand({
			vscode,
			options: { fallbackUrl: 'https://localhost/foo' },
		});
		await commands.get(OPEN_DOCS_COMMAND)?.();
		expect(panels).toHaveLength(0);
		expect(messages).toHaveLength(1);
	});
});
