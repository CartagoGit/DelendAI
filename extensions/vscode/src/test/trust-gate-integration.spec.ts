/**
 * x00072 SEC-001 S3 — Integration tests for the trust gate.
 *
 * Covers the 4 scenarios in the S3 acceptance criteria:
 *  1. isTrusted=false → createClient NOT invoked
 *  2. isTrusted=true + fingerprint present → starts
 *  3. .mcp.json drift → previous fingerprint invalidated, re-approval required
 *  4. QuickPick cancelled → no spawn
 *
 * These complement `trust-gate.spec.ts` (which exercises the helpers
 * and `registerStartServerUntrusted` in isolation) by running the full
 * `activate()` flow with a fake `vscode` host.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

interface IIntegrationHarness {
	readonly vscode: IVscodeApi;
	readonly context: IExtensionContext;
	readonly calls: { createClient: number };
	setPickResult(value: string | undefined): void;
	getLastDetail(): string | undefined;
}

const buildHarness = (isTrusted: boolean, cwd: string): IIntegrationHarness => {
	const commands = new Set<string>();
	const infoMessages: string[] = [];
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
			showInformationMessage: (m: string) => {
				infoMessages.push(m);
				return Promise.resolve(undefined);
			},
			showQuickPick: <T>(
				items: readonly T[],
				options?: { detail?: string },
			) => {
				lastDetail = options?.detail;
				return Promise.resolve(
					typeof pickResult === 'string'
						? (items as readonly { label: string }[]).find(
								(i) => i.label === pickResult,
							)
						: undefined,
				);
			},
			createStatusBarItem: () => ({ dispose: () => {} }),
			createWebviewPanel: () => ({ webview: { html: '' } }),
		},
		workspace: {
			isTrusted,
			workspaceFolders: [{ uri: { fsPath: cwd } }],
			getConfiguration: () => ({
				get: <T>(_key: string, def?: T): T | undefined => def,
			}),
		},
	} as unknown as IVscodeApi;

	const context: IExtensionContext = {
		subscriptions: [],
		globalState,
	};

	return {
		vscode,
		context,
		calls,
		setPickResult: (value) => {
			pickResult = value;
		},
		getLastDetail: () => lastDetail,
	};
};

describe('x00072 SEC-001 S3 integration', () => {
	let cwd = '';

	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), 'trust-integration-'));
		__resetRuntimeHandle();
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	it('Scenario 1: isTrusted=false → createClient is NOT invoked', async () => {
		const harness = buildHarness(false, cwd);
		const buildClient = async () => {
			harness.calls.createClient += 1;
			return {} as never;
		};
		await activate(harness.context, {
			vscode: harness.vscode,
			createClient: buildClient,
		});
		expect(harness.calls.createClient).toBe(0);
		// The start-server-untrusted command MUST still be registered so
		// the user can recover with an explicit approval. The harness
		// records every id passed to registerCommand; pull the same set
		// out of the harness by querying it directly.
		const ids = (
			harness.vscode as unknown as {
				commands: { _registered?: ReadonlySet<string> };
			}
		).commands._registered;
		expect(ids?.has('mcp-vertex.startServerUntrusted')).toBe(true);
	});

	it('Scenario 2: isTrusted=true + matching fingerprint → starts', async () => {
		// Use the manual registerStartServerUntrusted entry point so the
		// flow stays focused on the trust gate (no OverviewService
		// dependencies). Pre-seed a fingerprint that matches the launch,
		// then call the manual command — the picker MUST NOT be consulted.
		const harness = buildHarness(true, cwd);
		const { isLaunchApproved, recordApproval } = await import(
			'../commands/trust-fingerprint'
		);
		const launch = { command: 'bun', args: ['run', 'mcp-vertex'], cwd };
		await recordApproval(harness.context.globalState, launch, undefined);
		expect(
			isLaunchApproved(harness.context.globalState, launch, undefined),
		).toBe(true);
		const { registerStartServerUntrusted } = await import(
			'../commands/start-server-untrusted'
		);
		const buildClient = async () => {
			harness.calls.createClient += 1;
			return {} as never;
		};
		await registerStartServerUntrusted(harness.context, harness.vscode, {
			createClient: buildClient,
			trustOverride: true,
		});
		expect(harness.calls.createClient).toBe(1);
	});

	it('Scenario 3: .mcp.json drift → re-approval required (no spawn on reject)', async () => {
		const harness = buildHarness(true, cwd);
		const { isLaunchApproved, recordApproval } = await import(
			'../commands/trust-fingerprint'
		);
		const launch = { command: 'bun', args: ['run', 'mcp-vertex'], cwd };
		const body1 =
			'{"mcpServers":{"mcp-vertex":{"command":"bun","args":["run","mcp-vertex"]}}}';
		// Pre-approve against body1
		await recordApproval(harness.context.globalState, launch, body1);
		expect(
			isLaunchApproved(harness.context.globalState, launch, body1),
		).toBe(true);
		// Drift .mcp.json
		const body2 =
			'{"mcpServers":{"mcp-vertex":{"command":"bun","args":["evil"]}}}';
		expect(
			isLaunchApproved(harness.context.globalState, launch, body2),
		).toBe(false);
		// Without re-approval the cached fingerprint is stale
		const fp = (harness.context.globalState as MemoryGlobalState).get(
			'mcp-vertex.trust.fingerprint',
		);
		expect(fp).toMatch(/^[a-f0-9]{64}$/);
		// Write new .mcp.json on disk and try the manual command without approval
		writeFileSync(join(cwd, '.mcp.json'), body2, 'utf8');
		const buildClient = async () => {
			harness.calls.createClient += 1;
			return {} as never;
		};
		const { registerStartServerUntrusted } = await import(
			'../commands/start-server-untrusted'
		);
		harness.setPickResult(undefined); // picker would be required again
		await registerStartServerUntrusted(harness.context, harness.vscode, {
			createClient: buildClient,
			trustOverride: true,
		});
		expect(harness.calls.createClient).toBe(0);
	});

	it('Scenario 4: QuickPick cancelled → no spawn and no fingerprint stored', async () => {
		const harness = buildHarness(true, cwd);
		const buildClient = async () => {
			harness.calls.createClient += 1;
			return {} as never;
		};
		const { registerStartServerUntrusted } = await import(
			'../commands/start-server-untrusted'
		);
		harness.setPickResult('Cancel');
		await registerStartServerUntrusted(harness.context, harness.vscode, {
			createClient: buildClient,
			trustOverride: true,
		});
		expect(harness.calls.createClient).toBe(0);
		expect(
			(harness.context.globalState as MemoryGlobalState).get(
				'mcp-vertex.trust.fingerprint',
			),
		).toBeUndefined();
		expect(harness.getLastDetail()).toContain('bun run mcp-vertex');
	});

	it('Scenario 5: approve once → fingerprint stored; second call skips picker', async () => {
		const harness = buildHarness(true, cwd);
		const buildClient = async () => {
			harness.calls.createClient += 1;
			return {} as never;
		};
		const { registerStartServerUntrusted } = await import(
			'../commands/start-server-untrusted'
		);
		// First call: approve
		harness.setPickResult('Approve & start');
		await registerStartServerUntrusted(harness.context, harness.vscode, {
			createClient: buildClient,
			trustOverride: true,
		});
		expect(harness.calls.createClient).toBe(1);
		const fp = (harness.context.globalState as MemoryGlobalState).get(
			'mcp-vertex.trust.fingerprint',
		);
		expect(fp).toMatch(/^[a-f0-9]{64}$/);
		// Second call: picker should NOT be invoked (fingerprint matches)
		let pickerInvoked = false;
		const vscode2 = harness.vscode as unknown as {
			window: {
				showQuickPick: <T>(
					items: readonly T[],
				) => Promise<T | undefined>;
			};
		};
		const orig = vscode2.window.showQuickPick;
		vscode2.window.showQuickPick = ((items: readonly unknown[]) => {
			pickerInvoked = true;
			return orig(items as readonly { label: string }[]);
		}) as typeof orig;
		await registerStartServerUntrusted(harness.context, harness.vscode, {
			createClient: buildClient,
			trustOverride: true,
		});
		expect(pickerInvoked).toBe(false);
		expect(harness.calls.createClient).toBe(2);
	});
});
