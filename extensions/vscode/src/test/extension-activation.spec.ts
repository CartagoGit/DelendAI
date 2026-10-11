import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
	__resetRuntimeHandle,
	activate,
	type IExtensionContext,
	type IVscodeApi,
} from '../extension';

const readManifest = (): {
	activationEvents: readonly string[];
	contributes: { commands: readonly { command: string }[] };
} =>
	JSON.parse(
		readFileSync(resolve(__dirname, '..', '..', 'package.json'), 'utf-8'),
	);

/** Activates in a workspace folder that has no `delendai.config.json`. */
const activateWithoutConfig = async (): Promise<Set<string>> => {
	const root = mkdtempSync(join(tmpdir(), 'delendai-virgin-'));
	roots.push(root);
	const commands = new Set<string>();
	const context: IExtensionContext = {
		subscriptions: [],
		globalState: {
			get<T>(): T | undefined {
				return undefined;
			},
			async update() {},
		},
	};
	const vscode: IVscodeApi = {
		ViewColumn: { One: 1 },
		commands: {
			registerCommand(command) {
				commands.add(command);
				return { dispose() {} };
			},
		},
		window: {
			createWebviewPanel() {
				return { webview: { html: '' } };
			},
		},
		workspace: {
			createFileSystemWatcher: () => ({
				onDidChange: () => ({ dispose() {} }),
				onDidCreate: () => ({ dispose() {} }),
				onDidDelete: () => ({ dispose() {} }),
				dispose() {},
			}),
			workspaceFolders: [{ uri: { fsPath: root } }],
		},
	};
	await activate(context, { vscode });
	return commands;
};

const roots: string[] = [];

afterEach(() => {
	__resetRuntimeHandle();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

describe('activation without delendai.config.json', () => {
	it('declares the adoption command as an activation event', () => {
		const manifest = readManifest();
		expect(manifest.activationEvents).toContain('onCommand:delendai.adopt');
		expect(manifest.activationEvents).toContain(
			'workspaceContains:**/delendai.config.json',
		);
	});

	it('contributes the adoption command to the palette', () => {
		expect(
			readManifest().contributes.commands.map((c) => c.command),
		).toContain('delendai.adopt');
	});

	it('registers the adoption command in a workspace with no config', async () => {
		const registered = await activateWithoutConfig();
		expect(registered.has('delendai.adopt')).toBe(true);
	});
});
