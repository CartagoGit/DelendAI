import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
	__resetRuntimeHandle,
	activate,
	type IExtensionContext,
	type IVscodeApi,
} from '../extension';

/**
 * Every command is registered at activation whether or not the workspace
 * has a config: a contributed command that is not registered fails with
 * "command not found" in the palette, which is worse than the command
 * reporting that no server is connected. This spec pins that audit.
 */
const activateWithNoServer = async (): Promise<
	Map<string, (...args: readonly unknown[]) => unknown>
> => {
	const handlers = new Map<
		string,
		(...args: readonly unknown[]) => unknown
	>();
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
			registerCommand(command, callback) {
				handlers.set(command, callback);
				return { dispose() {} };
			},
		},
		window: {
			createWebviewPanel() {
				return { webview: { html: '' } };
			},
			async showErrorMessage() {
				return undefined;
			},
		},
	};
	await activate(context, { vscode });
	return handlers;
};

afterEach(() => __resetRuntimeHandle());

describe('command registration with and without a project config', () => {
	it('registers every contributed command when no server is configured', async () => {
		const manifest = JSON.parse(
			readFileSync(
				resolve(__dirname, '..', '..', 'package.json'),
				'utf-8',
			),
		) as { contributes: { commands: readonly { command: string }[] } };
		const handlers = await activateWithNoServer();
		const missing = manifest.contributes.commands
			.map((c) => c.command)
			.filter((id) => !handlers.has(id));
		expect(missing).toEqual([]);
	});

	it('lets the overview and adoption commands fail softly with no server', async () => {
		const handlers = await activateWithNoServer();
		for (const id of ['delendai.adopt', 'delendai.showOverview']) {
			await expect(
				Promise.resolve(handlers.get(id)?.()),
			).resolves.not.toThrow();
		}
	});
});
