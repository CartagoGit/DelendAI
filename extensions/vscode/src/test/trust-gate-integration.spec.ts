/** x00072 SEC-001 S3 - integration tests for the explicit launch trust gate. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	activate,
	__resetRuntimeHandle,
	type IExtensionContext,
	type IVscodeApi,
} from '../extension';

class MemoryGlobalState {
	private readonly map = new Map<string, unknown>();
	get<T>(key: string): T | undefined {
		return this.map.get(key) as T | undefined;
	}
	async update(key: string, value: unknown): Promise<void> {
		if (value === undefined) this.map.delete(key);
		else this.map.set(key, value);
	}
}

const buildHarness = (isTrusted: boolean, cwd: string) => {
	const commands = new Set<string>();
	const globalState = new MemoryGlobalState();
	let pickResult: string | undefined;
	let lastDetail: string | undefined;
	const calls = { createClient: 0 };
	const vscode = {
		commands: {
			_registered: commands,
			registerCommand: (id: string) => {
				commands.add(id);
				return { dispose: () => commands.delete(id) };
			},
		},
		window: {
			showInformationMessage: () => Promise.resolve(undefined),
			showErrorMessage: () => Promise.resolve(undefined),
			showQuickPick: <T>(
				items: readonly T[],
				options?: { detail?: string },
			) => {
				lastDetail = options?.detail;
				return Promise.resolve(
					typeof pickResult === 'string'
						? (items as readonly { label: string }[]).find(
								(item) => item.label === pickResult,
							)
						: undefined,
				);
			},
			createStatusBarItem: () => ({
				show: () => {},
				dispose: () => {},
			}),
			createWebviewPanel: () => ({ webview: { html: '' } }),
		},
		workspace: {
			isTrusted,
			workspaceFolders: [{ uri: { fsPath: cwd } }],
			getConfiguration: (section?: string) => ({
				get: <T>(key: string, defaultValue?: T): T | undefined => {
					if (section === 'delendai.server' && key === 'command')
						return 'node' as T;
					if (section === 'delendai.server' && key === 'args')
						return ['server.js'] as T;
					return defaultValue;
				},
			}),
		} as never,
	} as unknown as IVscodeApi;
	const context: IExtensionContext = { subscriptions: [], globalState };
	return {
		vscode,
		context,
		calls,
		setPickResult: (value: string | undefined) => {
			pickResult = value;
		},
		getLastDetail: () => lastDetail,
	};
};

describe('x00072 SEC-001 S3 explicit launch integration', () => {
	let cwd = '';

	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), 'trust-integration-'));
		__resetRuntimeHandle();
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	it('does not spawn automatically in an untrusted workspace', async () => {
		const harness = buildHarness(false, cwd);
		await activate(harness.context, {
			vscode: harness.vscode,
			createClient: async () => {
				harness.calls.createClient++;
				return {} as never;
			},
		});
		expect(harness.calls.createClient).toBe(0);
		expect(
			(
				harness.vscode as never as {
					commands: { _registered: Set<string> };
				}
			).commands._registered.has('delendai.startServerUntrusted'),
		).toBe(true);
	});

	it('does not spawn automatically without explicit launch settings', async () => {
		const harness = buildHarness(true, cwd);
		(
			harness.vscode as never as {
				workspace: { getConfiguration: () => unknown };
			}
		).workspace.getConfiguration = () => ({
			get: <T>(_key: string, defaultValue?: T): T | undefined =>
				defaultValue,
		});
		await activate(harness.context, {
			vscode: harness.vscode,
			createClient: async () => {
				harness.calls.createClient++;
				return {} as never;
			},
		});
		expect(harness.calls.createClient).toBe(0);
	});

	it('requires approval for the configured launch, then remembers only that launch', async () => {
		const harness = buildHarness(false, cwd);
		const { registerStartServerUntrusted } = await import(
			'../commands/start-server-untrusted'
		);
		const createClient = async () => {
			harness.calls.createClient++;
			return {} as never;
		};
		harness.setPickResult('Cancel');
		await registerStartServerUntrusted(harness.context, harness.vscode, {
			createClient,
			trustOverride: true,
		});
		expect(harness.calls.createClient).toBe(0);
		expect(harness.getLastDetail()).toContain('node server.js');

		harness.setPickResult('Approve & start');
		await registerStartServerUntrusted(harness.context, harness.vscode, {
			createClient,
			trustOverride: true,
		});
		expect(harness.calls.createClient).toBe(1);
		harness.setPickResult(undefined);
		await registerStartServerUntrusted(harness.context, harness.vscode, {
			createClient,
			trustOverride: true,
		});
		expect(harness.calls.createClient).toBe(2);
	});
});
