/**
 * x00072 SEC-001 S2 — Trust-fingerprint helpers + QuickPick gate.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerStartServerUntrusted } from '../commands/start-server-untrusted';
import {
	computeLaunchFingerprint,
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
	args: ['run', 'delendai'],
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
			args: ['delendai', 'run'],
		});
		expect(reordered).not.toBe(a);
	});

	it('describeLaunch renders command + args + cwd', () => {
		expect(describeLaunch(baseLaunch)).toBe(
			`bun run delendai (cwd=${baseLaunch.cwd})`,
		);
		expect(describeLaunch({ command: 'node', args: [] })).toBe('node');
	});
});

describe('isLaunchApproved (x00072 S2)', () => {
	let store: MemoryGlobalState;
	beforeEach(() => {
		store = new MemoryGlobalState();
	});

	it('rejects before the configured launch has been approved', () => {
		expect(isLaunchApproved(store, baseLaunch)).toBe(false);
	});

	it('re-uses stored fingerprint for the unchanged configured launch', async () => {
		await recordApproval(store, baseLaunch);
		expect(isLaunchApproved(store, baseLaunch)).toBe(true);
	});

	it('invalidates when launch changes', async () => {
		// The altered argv must actually DIFFER from `baseLaunch`. It used
		// to be the second of two product names, and when both collapsed
		// into one during the rename this asserted that an identical
		// launch was a different one. A neutral argument keeps the test
		// about fingerprint invalidation rather than about our naming.
		await recordApproval(store, baseLaunch);
		expect(
			isLaunchApproved(store, {
				...baseLaunch,
				args: ['run', 'some-other-server'],
			}),
		).toBe(false);
	});

	it('invalidates when cwd changes', async () => {
		await recordApproval(store, baseLaunch);
		expect(isLaunchApproved(store, { ...baseLaunch, cwd: '/other' })).toBe(
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
				getConfiguration: (section?: string) => ({
					get: <T>(key: string, def?: T): T | undefined => {
						if (section === 'delendai.server' && key === 'command')
							return 'bun' as T;
						if (section === 'delendai.server' && key === 'args')
							return ['run', 'delendai'] as T;
						return def;
					},
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
		expect(lastPickDetail).toContain('bun run delendai');
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

	it('skips the picker when fingerprint already approved', async () => {
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

	it('resolveServerCommand picks up workspace settings', async () => {
		const cfg = makeVscode();
		(cfg.workspace as { getConfiguration?: unknown }).getConfiguration =
			() => ({
				get: <T>(key: string, def?: T): T | undefined => {
					if (key === 'command') return 'node' as unknown as T;
					if (key === 'args') return ['server.js'] as unknown as T;
					return def;
				},
			});
		const launch = await resolveServerCommand(cfg);
		if (launch === undefined)
			throw new Error('server launch was not resolved');
		expect(launch.command).toBe('node');
		expect(launch.args).toEqual(['server.js']);
		expect(launch.cwd).toBe(cwd);
	});
});
