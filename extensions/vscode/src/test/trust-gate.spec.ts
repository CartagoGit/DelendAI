/**
 * x00072 SEC-001 S2 — Trust-fingerprint helpers + QuickPick gate.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerStartServerUntrusted } from '../commands/start-server-untrusted';
import {
	computeLaunchFingerprint,
	computeMcpJsonHash,
	describeLaunch,
	isLaunchApproved,
	recordApproval,
	TRUST_FINGERPRINT_KEY,
} from '../commands/trust-fingerprint';
import {
	__resetRuntimeHandle,
	resolveServerCommand,
	type IExtensionContext,
	type IVscodeApi,
} from '../extension';

interface IGlobalStateLike {
	get<T>(key: string): T | undefined;
	update(key: string, value: unknown): Thenable<void> | Promise<void>;
}

class MemoryGlobalState implements IGlobalStateLike {
	private readonly map = new Map<string, unknown>();
	get<T>(key: string): T | undefined {
		return this.map.get(key) as T | undefined;
	}
	async update(key: string, value: unknown): Promise<void> {
		if (value === undefined) this.map.delete(key);
		else this.map.set(key, value);
	}
}

const baseLaunch = {
	command: 'bun',
	args: ['run', 'mcp-vertex'],
	cwd: '/repo',
} as const;

describe('trust-fingerprint (x00072 S2)', () => {
	it('computeLaunchFingerprint is stable and order-sensitive', () => {
		const a = computeLaunchFingerprint(baseLaunch);
		const b = computeLaunchFingerprint(baseLaunch);
		expect(a).toBe(b);
		expect(a).toMatch(/^[a-f0-9]{64}$/);

		const reordered = computeLaunchFingerprint({
			...baseLaunch,
			args: ['mcp-vertex', 'run'],
		});
		expect(reordered).not.toBe(a);
	});

	it('computeMcpJsonHash returns undefined for empty/missing and hash for body', () => {
		expect(computeMcpJsonHash(undefined)).toBeUndefined();
		expect(computeMcpJsonHash('')).toBeUndefined();
		const h1 = computeMcpJsonHash('{"mcpServers":{}}') as string;
		const h2 = computeMcpJsonHash('{"mcpServers":{}}') as string;
		const h3 = computeMcpJsonHash('{"mcpServers":{"x":1}}') as string;
		expect(h1).toBe(h2);
		expect(h1).not.toBe(h3);
	});

	it('describeLaunch renders command + args + cwd', () => {
		expect(describeLaunch(baseLaunch)).toBe(
			`bun run mcp-vertex (cwd=${baseLaunch.cwd})`,
		);
		expect(describeLaunch({ command: 'node', args: [] })).toBe('node');
	});
});

describe('isLaunchApproved (x00072 S2)', () => {
	let store: MemoryGlobalState;
	beforeEach(() => {
		store = new MemoryGlobalState();
	});

	it('approves when nothing stored + nothing to compare', () => {
		expect(isLaunchApproved(store, baseLaunch, undefined)).toBe(false);
	});

	it('re-uses stored fingerprint when launch unchanged and no .mcp.json', async () => {
		await recordApproval(store, baseLaunch, undefined);
		expect(isLaunchApproved(store, baseLaunch, undefined)).toBe(true);
	});

	it('invalidates when launch changes', async () => {
		await recordApproval(store, baseLaunch, undefined);
		expect(
			isLaunchApproved(
				store,
				{ ...baseLaunch, args: ['run', 'mcpv'] },
				undefined,
			),
		).toBe(false);
	});

	it('invalidates when cwd changes', async () => {
		await recordApproval(store, baseLaunch, undefined);
		expect(
			isLaunchApproved(
				store,
				{ ...baseLaunch, cwd: '/other' },
				undefined,
			),
		).toBe(false);
	});

	it('invalidates when .mcp.json content drifts', async () => {
		const body1 =
			'{"mcpServers":{"mcp-vertex":{"command":"bun","args":["run","mcp-vertex"]}}}';
		await recordApproval(store, baseLaunch, body1);
		expect(isLaunchApproved(store, baseLaunch, body1)).toBe(true);
		const body2 =
			'{"mcpServers":{"mcp-vertex":{"command":"bun","args":["run","evil"]}}}';
		expect(isLaunchApproved(store, baseLaunch, body2)).toBe(false);
	});

	it('invalidates when .mcp.json appears where there was none', async () => {
		await recordApproval(store, baseLaunch, undefined);
		expect(isLaunchApproved(store, baseLaunch, '{"mcpServers":{}}')).toBe(
			false,
		);
	});
});

describe('registerStartServerUntrusted (x00072 S2)', () => {
	let cwd = '';
	let store: MemoryGlobalState;
	let createdClientCalls = 0;
	let pickResult: string | undefined;
	let lastPickDetail: string | undefined;

	const makeContext = (): IExtensionContext => ({
		subscriptions: [],
		globalState: store,
	});

	const makeVscode = (): IVscodeApi =>
		({
			commands: { registerCommand: () => ({ dispose: () => {} }) },
			window: {
				showInformationMessage: () => Promise.resolve(undefined),
				showQuickPick: (
					items: ReadonlyArray<{ label: string; detail?: string }>,
					options?: { detail?: string },
				) => {
					lastPickDetail = options?.detail;
					return Promise.resolve(
						typeof pickResult === 'string'
							? items.find(
									(i) =>
										(i as { label: string }).label ===
										pickResult,
								)
							: undefined,
					);
				},
			},
			workspace: {
				isTrusted: false,
				workspaceFolders: [{ uri: { fsPath: cwd } }],
				getConfiguration: () => ({
					get: <T>(_k: string, def?: T): T | undefined => def,
				}),
			},
		}) as unknown as IVscodeApi;

	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), 'trust-gate-'));
		store = new MemoryGlobalState();
		createdClientCalls = 0;
		pickResult = undefined;
		lastPickDetail = undefined;
		__resetRuntimeHandle();
	});

	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	it('aborts when user cancels the QuickPick', async () => {
		pickResult = 'Cancel';
		await registerStartServerUntrusted(makeContext(), makeVscode(), {
			createClient: () => {
				createdClientCalls++;
				return Promise.resolve({} as never);
			},
		});
		expect(createdClientCalls).toBe(0);
		expect(store.get<string>(TRUST_FINGERPRINT_KEY)).toBeUndefined();
		expect(lastPickDetail).toContain('bun run mcp-vertex');
		expect(lastPickDetail).toContain(cwd);
	});

	it('starts server and remembers fingerprint on approve', async () => {
		pickResult = 'Approve & start';
		await registerStartServerUntrusted(makeContext(), makeVscode(), {
			createClient: () => {
				createdClientCalls++;
				return Promise.resolve({} as never);
			},
		});
		expect(createdClientCalls).toBe(1);
		const fp = store.get<string>(TRUST_FINGERPRINT_KEY);
		expect(fp).toMatch(/^[a-f0-9]{64}$/);
	});

	it('skips the picker when fingerprint already approved (no .mcp.json)', async () => {
		pickResult = undefined; // picker should not even be invoked
		await registerStartServerUntrusted(makeContext(), makeVscode(), {
			createClient: () => {
				createdClientCalls++;
				return Promise.resolve({} as never);
			},
		});
		expect(createdClientCalls).toBe(0);
		// Approve once
		pickResult = 'Approve & start';
		await registerStartServerUntrusted(makeContext(), makeVscode(), {
			createClient: () => {
				createdClientCalls++;
				return Promise.resolve({} as never);
			},
		});
		expect(createdClientCalls).toBe(1);
		// Third call: fingerprint matches, picker not consulted
		pickResult = undefined;
		await registerStartServerUntrusted(makeContext(), makeVscode(), {
			createClient: () => {
				createdClientCalls++;
				return Promise.resolve({} as never);
			},
		});
		expect(createdClientCalls).toBe(2);
	});

	it('re-prompts when .mcp.json drifts after approval', async () => {
		writeFileSync(join(cwd, '.mcp.json'), '{"mcpServers":{}}', 'utf8');
		pickResult = 'Approve & start';
		await registerStartServerUntrusted(makeContext(), makeVscode(), {
			createClient: () => {
				createdClientCalls++;
				return Promise.resolve({} as never);
			},
		});
		expect(createdClientCalls).toBe(1);
		// Drift: rewrite .mcp.json with new content
		writeFileSync(
			join(cwd, '.mcp.json'),
			'{"mcpServers":{"mcp-vertex":{"command":"node","args":["evil"]}}}',
			'utf8',
		);
		pickResult = undefined; // would be required again
		await registerStartServerUntrusted(makeContext(), makeVscode(), {
			createClient: () => {
				createdClientCalls++;
				return Promise.resolve({} as never);
			},
		});
		expect(createdClientCalls).toBe(1); // blocked, no new spawn
	});

	it('resolveServerCommand picks up workspace settings', async () => {
		const cfg = makeVscode();
		(cfg.workspace as { getConfiguration?: unknown }).getConfiguration =
			() => ({
				get: <T>(key: string, def?: T): T | undefined =>
					key === 'command' ? ('node' as unknown as T) : def,
			});
		const launch = await resolveServerCommand(cfg);
		expect(launch.command).toBe('node');
		expect(launch.cwd).toBe(cwd);
	});
});
