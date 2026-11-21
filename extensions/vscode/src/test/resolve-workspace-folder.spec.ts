import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@delendai/client';
import { fakePartial } from '@delendai/test-kit';

import { resolveWorkspaceFolder } from '../commands/resolve-workspace-folder';
import {
	RUN_VALIDATION_COMMAND,
	registerRunValidationCommand,
} from '../commands/run-validation';
import type { ICommandVscodeApi } from '../commands/types';

const folder = (fsPath: string) => ({ uri: { fsPath } });

const vscodeWith = (
	folders: readonly string[],
	window: Partial<ICommandVscodeApi['window']> = {},
): ICommandVscodeApi =>
	fakePartial<ICommandVscodeApi>({
		ViewColumn: { One: 1 },
		commands: { registerCommand: () => ({ dispose() {} }) },
		window: {
			createWebviewPanel: () => ({ webview: { html: '' } }),
			...window,
		},
		workspace: { workspaceFolders: folders.map(folder) },
	});

describe('resolveWorkspaceFolder (D24)', () => {
	it('returns undefined with no folder open', async () => {
		expect(await resolveWorkspaceFolder(vscodeWith([]))).toBeUndefined();
	});

	it('returns the only folder without asking', async () => {
		expect(
			(await resolveWorkspaceFolder(vscodeWith(['/a'])))?.uri.fsPath,
		).toBe('/a');
	});

	it('prefers the folder owning the active editor, not folders[0]', async () => {
		const vscode = vscodeWith(['/a', '/b'], {
			activeTextEditor: {
				document: { uri: { fsPath: '/b/src/index.ts' } },
			},
		});
		expect((await resolveWorkspaceFolder(vscode))?.uri.fsPath).toBe('/b');
	});

	it('does not match a sibling that shares a name prefix', async () => {
		let asked = 0;
		const vscode = vscodeWith(['/work/app', '/work/app2'], {
			activeTextEditor: {
				document: { uri: { fsPath: '/work/app2/x.ts' } },
			},
			showQuickPick: async (items) => {
				asked += 1;
				return items[0];
			},
		});
		expect((await resolveWorkspaceFolder(vscode))?.uri.fsPath).toBe(
			'/work/app2',
		);
		expect(asked).toBe(0);
	});

	it('asks the user when the active file is outside every folder, and honours a cancel', async () => {
		const picked = vscodeWith(['/a', '/b'], {
			activeTextEditor: { document: { uri: { fsPath: '/elsewhere/x' } } },
			showQuickPick: async (items) => items[1],
		});
		expect((await resolveWorkspaceFolder(picked))?.uri.fsPath).toBe('/b');
		const cancelled = vscodeWith(['/a', '/b'], {
			showQuickPick: async () => undefined,
		});
		expect(await resolveWorkspaceFolder(cancelled)).toBeUndefined();
	});
});

describe('run validation keeps the folder cwd (D25)', () => {
	it('re-runs the failed command in the resolved folder', async () => {
		const cwds: Array<string | undefined> = [];
		const execution = {};
		let command: ((...args: readonly unknown[]) => unknown) | undefined;
		const base = vscodeWith(['/a', '/b'], {
			activeTextEditor: { document: { uri: { fsPath: '/b/x.ts' } } },
			createTerminal: (options) => {
				cwds.push(options.cwd);
				return {
					shellIntegration: { executeCommand: () => execution },
					sendText() {},
					dispose() {},
				};
			},
			onDidChangeTerminalShellIntegration: () => ({ dispose() {} }),
			onDidEndTerminalShellExecution: (callback) => {
				queueMicrotask(() => callback({ execution, exitCode: 0 }));
				return { dispose() {} };
			},
		});
		const vscode = {
			...base,
			commands: {
				registerCommand: (
					name: string,
					cb: (...a: readonly unknown[]) => unknown,
				) => {
					if (name === RUN_VALIDATION_COMMAND) command = cb;
					return { dispose() {} };
				},
			},
		} as ICommandVscodeApi;
		registerRunValidationCommand({
			vscode,
			client: McpStdioClient.fromTransport({
				async callTool(input) {
					if (input.name === 'delendai_get_validation_matrix')
						return { structuredContent: { scopes: {} } };
					return {
						structuredContent: {
							scope: 'all',
							ok: false,
							results: [
								{
									command: 'bun run lint',
									ok: false,
									code: 1,
									timedOut: false,
									tail: '',
								},
							],
						},
					};
				},
			}),
		});
		await command?.();
		expect(cwds).toEqual(['/b']);
	});
});
