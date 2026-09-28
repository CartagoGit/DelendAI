/**
 * register-runtime.spec.ts — what register() does at runtime that the
 * lifecycle specs never exercised: refusing bad options, the interval
 * snapshot loop and how it reports refusals, and the identity and policy
 * inputs a real host passes.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ITriggerEvent } from '@delendai/commit-policy/lib/triggers/slice-listener';
import {
	resolveDevelopmentPolicy,
	type IMcpPluginContext,
} from '@delendai/core/public';

import { createTempGitRepo } from '../integration/_fixtures/git-tmp';

const nativeSetInterval = globalThis.setInterval;

const buildCtx = (
	workspace: string,
	options: Readonly<Record<string, unknown>>,
): IMcpPluginContext => ({
	workspace: { root: workspace, resolve: (p: string) => join(workspace, p) },
	corePaths: { cacheDir: '.cache/delendai', docsDir: 'docs/delendai' },
	cacheDir: '.cache/delendai',
	docsDir: 'docs/delendai',
	keepLegacy: false,
	pluginCacheDir: '.cache/delendai/commit-policy',
	pluginDocsDir: 'docs/delendai/commit-policy',
	namespacePrefix: 'commit-policy',
	options,
	pluginOptions: new Map([['proposals', { persist: { mode: 'none' } }]]),
	args: {},
});

const disposable = (
	value: unknown,
): { dispose: () => void | Promise<void> } => {
	if (
		typeof value === 'object' &&
		value !== null &&
		'dispose' in value &&
		typeof value.dispose === 'function'
	) {
		return value as { dispose: () => void | Promise<void> };
	}
	throw new Error('register() did not return a disposable runtime');
};

const INTERVAL_OPTIONS = {
	commit: { enabled: false },
	cadence: { triggers: [{ kind: 'interval', minutes: 1 }] },
};

const dirty = (paths: readonly string[]): ITriggerEvent => ({
	kind: 'interval',
	dirtyCount: paths.length,
	files: { paths },
});

describe('commit-policy register() runtime', () => {
	let workspace = '';

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'commit-policy-runtime-'));
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		vi.doUnmock('@delendai/commit-policy/lib/triggers/interval-timer');
		vi.resetModules();
		delete process.env.GIT_AUTHOR_NAME;
		delete process.env.GIT_AUTHOR_EMAIL;
		await rm(workspace, { recursive: true, force: true });
	});

	it('refuses options its schema rejects', async () => {
		const { default: plugin } = await import('@delendai/commit-policy');
		await expect(
			plugin.register(buildCtx(workspace, { gitTimeoutMs: -1 })),
		).rejects.toThrow('commit-policy plugin rejected its options');
	});

	const registerWithScriptedInterval = async (
		script: Array<() => Promise<ITriggerEvent | null>>,
	) => {
		const calls = { check: 0 };
		vi.resetModules();
		vi.doMock(
			'@delendai/commit-policy/lib/triggers/interval-timer',
			async () => ({
				...(await vi.importActual<
					typeof import('@delendai/commit-policy/lib/triggers/interval-timer')
				>('@delendai/commit-policy/lib/triggers/interval-timer')),
				createIntervalTimer: () => ({
					check: () => {
						const step =
							script[calls.check] ??
							(() => Promise.resolve(null));
						calls.check += 1;
						return step();
					},
					reset: () => {},
				}),
			}),
		);
		let tick: (() => void) | undefined;
		vi.spyOn(globalThis, 'setInterval').mockImplementation(((
			handler: () => void,
		) => {
			tick = handler;
			return nativeSetInterval(() => {}, 3_600_000);
		}) as typeof setInterval);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { default: plugin } = await import('@delendai/commit-policy');
		const runtime = disposable(
			await plugin.register(buildCtx(workspace, INTERVAL_OPTIONS)),
		);
		if (tick === undefined) throw new Error('no interval was scheduled');
		const refusals = () =>
			warn.mock.calls
				.map((args) => String(args[0]))
				.filter((line) => line.includes('interval snapshot refused'));
		return { runtime, tick, calls, refusals };
	};

	it('reports an interval refusal once per cause, and a failed check too', async () => {
		const { runtime, tick, calls, refusals } =
			await registerWithScriptedInterval([
				// An interval event whose dirty set is empty is refused by the
				// engine (TRIGGER_HAS_NO_FILES) whatever the git state.
				() => Promise.resolve(dirty([])),
				() => Promise.resolve(dirty([])),
				() => Promise.reject(new Error('dirty scan failed')),
				() => Promise.resolve(null),
			]);
		try {
			tick();
			await vi.waitFor(() => expect(refusals()).toHaveLength(1));
			// The same refusal again inside one interval is not reported twice.
			// The next step can only start once this one has finished, so
			// waiting for it proves the repeat completed silently.
			await vi.waitFor(() => {
				tick();
				expect(calls.check).toBeGreaterThanOrEqual(3);
			});
			await vi.waitFor(() => expect(refusals()).toHaveLength(2));
			expect(refusals()[1]).toContain('dirty scan failed');
			// A clean tree reports nothing.
			await vi.waitFor(() => {
				tick();
				expect(calls.check).toBeGreaterThanOrEqual(4);
			});
			expect(refusals()).toHaveLength(2);
		} finally {
			await runtime.dispose();
		}
	});

	it('never runs two interval checks at once', async () => {
		let release: (() => void) | undefined;
		const { runtime, tick, calls } = await registerWithScriptedInterval([
			() =>
				new Promise<null>((resolve) => {
					release = () => resolve(null);
				}),
		]);
		try {
			tick();
			tick();
			expect(calls.check).toBe(1);
			release?.();
		} finally {
			await runtime.dispose();
		}
	});

	it('registers with a host identity, a git author and a direct-commit policy', async () => {
		process.env.GIT_AUTHOR_NAME = 'Runtime Spec';
		process.env.GIT_AUTHOR_EMAIL = 'runtime@example.test';
		const { default: plugin } = await import('@delendai/commit-policy');
		const runtime = disposable(
			await plugin.register({
				...buildCtx(workspace, INTERVAL_OPTIONS),
				hostIdentity: { host: 'claude-code', model: 'opus' },
				developmentPolicy: resolveDevelopmentPolicy({
					development: {
						profile: 'shared-direct',
						branches: { integration: 'develop' },
						integration: { requiredChecks: ['delendai-validate'] },
					},
				}),
			}),
		);
		await runtime.dispose();
	});

	it('leaves publishing work checkouts to the server (x00724)', async () => {
		// The server publishes on the cadence from the moment it starts
		// (`createMcpProject`). This plugin loads lazily and is evicted when
		// idle, so a publisher of its own ran only while an agent happened to
		// be using one of its tools, and a second one would push twice.
		const repo = await createTempGitRepo({ branch: 'develop' });
		try {
			const ticks: number[] = [];
			vi.spyOn(globalThis, 'setInterval').mockImplementation(((
				_handler: () => void,
				ms: number,
			) => {
				ticks.push(ms);
				return nativeSetInterval(() => {}, 3_600_000);
			}) as typeof setInterval);
			const policy = resolveDevelopmentPolicy({
				development: {
					profile: 'shared-checkout-pr',
					branches: { integration: 'develop' },
					integration: { requiredChecks: ['delendai-validate'] },
				},
			});
			const { default: plugin } = await import('@delendai/commit-policy');
			const runtime = disposable(
				await plugin.register({
					...buildCtx(repo.cwd, { commit: { enabled: false } }),
					clientIdentity: { name: () => 'runtime-client' },
					developmentPolicy: policy,
				}),
			);
			try {
				expect(ticks).not.toContain(
					policy.checkpoint.intervalMinutes * 60_000,
				);
			} finally {
				await runtime.dispose();
			}
		} finally {
			await repo.cleanup();
		}
	});

	it('names a work ref after the MCP client when the host names no model', async () => {
		const repo = await createTempGitRepo({ branch: 'develop' });
		const remote = await mkdtemp(join(tmpdir(), 'commit-policy-remote-'));
		try {
			await promisify(execFile)('git', ['init', '--bare', '-q'], {
				cwd: remote,
			});
			await writeFile(join(repo.cwd, 'a.ts'), 'export const a = 1;\n');
			await repo.git('add', '--', 'a.ts');
			await repo.git('commit', '-q', '-m', 'chore: base');
			await repo.git('remote', 'add', 'origin', remote);
			await repo.git('push', '-q', '-u', 'origin', 'develop');
			await writeFile(join(repo.cwd, 'a.ts'), 'export const a = 2;\n');
			const { default: plugin } = await import('@delendai/commit-policy');
			const runtime = await plugin.register({
				...buildCtx(repo.cwd, { commit: { enabled: false } }),
				clientIdentity: { name: () => 'runtime-client' },
				developmentPolicy: resolveDevelopmentPolicy({
					development: {
						profile: 'shared-checkout-pr',
						branches: { integration: 'develop' },
						integration: { requiredChecks: ['delendai-validate'] },
					},
				}),
			});
			try {
				const tools = (
					runtime as {
						registrations: {
							tools: Array<{
								id: string;
								register: (server: unknown) => Promise<void>;
							}>;
						};
					}
				).registrations.tools;
				const workRef = tools.find(
					(tool) => tool.id === 'commit_policy_work_ref',
				);
				let handler: ((args: unknown) => Promise<unknown>) | undefined;
				await workRef?.register({
					registerTool: (
						_name: string,
						_config: unknown,
						fn: (args: unknown) => Promise<unknown>,
					) => {
						handler = fn;
					},
				});
				if (handler === undefined)
					throw new Error('the work-ref tool registered no handler');
				const result = await handler({
					action: 'checkpoint',
					proposal: 'x00001',
					slice: 'S1',
					generation: 1,
					paths: ['a.ts'],
					message: 'feat(x00001): slice S1',
				});
				expect(JSON.stringify(result)).toContain('runtime-client');
			} finally {
				await disposable(runtime).dispose();
			}
		} finally {
			await repo.cleanup();
			await rm(remote, { recursive: true, force: true });
		}
	});
});
