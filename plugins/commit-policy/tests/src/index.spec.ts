/**
 * index.spec.ts — x00261/S1 lifecycle contract for the plugin entrypoint.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import plugin from '@mcp-vertex/commit-policy';
import * as corePublic from '@mcp-vertex/core/public';
import { CommitPolicyOptionsSchema } from '@mcp-vertex/commit-policy/lib/contracts/options';
import type {
	IMcpPluginContext,
	IExternalToolRun,
} from '@mcp-vertex/core/public';
import type { ISliceListener } from '@mcp-vertex/commit-policy/lib/triggers/slice-listener';

const buildCtx = (workspace: string): IMcpPluginContext => ({
	workspace: {
		root: workspace,
		resolve: (p: string) => join(workspace, p),
	},
	corePaths: {
		cacheDir: '.cache/mcp-vertex',
		docsDir: 'docs/mcp-vertex',
	},
	cacheDir: '.cache/mcp-vertex',
	docsDir: 'docs/mcp-vertex',
	keepLegacy: false,
	pluginCacheDir: '.cache/mcp-vertex/commit-policy',
	pluginDocsDir: 'docs/mcp-vertex/commit-policy',
	namespacePrefix: 'commit-policy',
	options: {
		commit: { enabled: false },
		cadence: {
			triggers: [
				{ kind: 'slice', onStatuses: ['done'] },
				{ kind: 'interval', minutes: 1 },
			],
		},
	},
	pluginOptions: new Map([['proposals', { persist: { mode: 'none' } }]]),
	args: {},
});

describe('commit-policy register lifecycle (x00261/S1)', () => {
	let workspace = '';
	let activeIntervals: Set<ReturnType<typeof setInterval>>;
	let createdIntervals = 0;
	const nativeSetInterval = globalThis.setInterval;
	const nativeClearInterval = globalThis.clearInterval;

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'commit-policy-index-'));
		await mkdir(join(workspace, 'docs', 'mcp-vertex', 'proposals'), {
			recursive: true,
		});
		await writeFile(
			join(workspace, 'docs', 'mcp-vertex', 'proposals', 'index.json'),
			JSON.stringify({ proposals: [] }, null, 2),
			'utf8',
		);
		activeIntervals = new Set();
		createdIntervals = 0;
		vi.spyOn(globalThis, 'setInterval').mockImplementation(((
			handler: Parameters<typeof setInterval>[0],
			timeout?: number,
			...args: unknown[]
		) => {
			const interval = nativeSetInterval(
				handler,
				timeout,
				...(args as []),
			);
			activeIntervals.add(interval);
			createdIntervals += 1;
			return interval;
		}) as typeof setInterval);
		vi.spyOn(globalThis, 'clearInterval').mockImplementation(((
			interval?: ReturnType<typeof setInterval>,
		) => {
			if (interval !== undefined) {
				activeIntervals.delete(interval);
			}
			nativeClearInterval(interval);
		}) as typeof clearInterval);
	});

	it('accepts self-hosted forge provider mappings in public options', () => {
		const parsed = CommitPolicyOptionsSchema.parse({
			push: {
				providerByHost: { 'git.example.test': 'gitlab' },
			},
		});

		expect(parsed.push.providerByHost).toEqual({
			'git.example.test': 'gitlab',
		});
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		delete process.env
			.MCP_VERTEX_COMMIT_POLICY_REFRESH_BRANCH_PROTECTION_ON_REGISTER;
		if (workspace) await rm(workspace, { recursive: true, force: true });
	});

	it('register() does not refresh remote branch protection unless explicitly opted in', async () => {
		const runExternalToolSpy = vi
			.spyOn(corePublic, 'runExternalTool')
			.mockResolvedValue(failedExternalToolRun('not called'));

		const runtime = asRuntime(await plugin.register(buildCtx(workspace)));

		expect(runExternalToolSpy).not.toHaveBeenCalled();
		await runtime.dispose();
	});

	it('registers and disposes without proposals loaded', async () => {
		const runtime = asRuntime(
			await plugin.register({
				...buildCtx(workspace),
				options: {
					commit: { enabled: true },
					cadence: {
						triggers: [{ kind: 'slice', onStatuses: ['done'] }],
					},
				},
			}),
		);

		expect(typeof runtime.dispose).toBe('function');
		await runtime.dispose();
	});

	it('register() refreshes remote branch protection when the opt-in env var is true', async () => {
		process.env.MCP_VERTEX_COMMIT_POLICY_REFRESH_BRANCH_PROTECTION_ON_REGISTER =
			'true';
		const runExternalToolSpy = vi
			.spyOn(corePublic, 'runExternalTool')
			.mockResolvedValue(failedExternalToolRun('no remote configured'));

		const runtime = asRuntime(await plugin.register(buildCtx(workspace)));

		await new Promise<void>((resolve, reject) => {
			const deadline = Date.now() + 2_000;
			const poll = (): void => {
				if (runExternalToolSpy.mock.calls.length > 0) {
					resolve();
					return;
				}
				if (Date.now() >= deadline) {
					reject(
						new Error(
							'timed out waiting for opt-in branch refresh',
						),
					);
					return;
				}
				setTimeout(poll, 10);
			};
			poll();
		});
		expect(runExternalToolSpy).toHaveBeenCalled();
		await runtime.dispose();
	});

	it('register() returns a runtime with dispose()', async () => {
		const runtime = asRuntime(await plugin.register(buildCtx(workspace)));
		expect(typeof runtime.dispose).toBe('function');
		await runtime.dispose();
	});

	it('dispose() is idempotent and clears the owned listener/timer handles', async () => {
		const runtime = asRuntime(await plugin.register(buildCtx(workspace)));

		expect(createdIntervals).toBe(2);
		expect(activeIntervals.size).toBe(2);

		await runtime.dispose();
		expect(activeIntervals.size).toBe(0);

		await runtime.dispose();
		expect(activeIntervals.size).toBe(0);
	});

	it('keeps the slice listener independent from proposals persistence', async () => {
		const runtime = asRuntime(
			await plugin.register({
				...buildCtx(workspace),
				pluginOptions: new Map([
					['proposals', { persist: { mode: 'commit' } }],
				]),
			}),
		);

		expect(createdIntervals).toBe(2);

		await runtime.dispose();
	});

	it('handles a missing proposals index when running standalone', async () => {
		await rm(
			join(workspace, 'docs', 'mcp-vertex', 'proposals', 'index.json'),
			{ force: true },
		);
		const runtime = asRuntime(
			await plugin.register({
				...buildCtx(workspace),
				pluginOptions: new Map(),
			}),
		);

		expect(typeof runtime.dispose).toBe('function');
		await runtime.dispose();
	});

	it('reload N times leaves zero active listener handles', async () => {
		const reloads = 5;

		for (let index = 0; index < reloads; index += 1) {
			const runtime = asRuntime(
				await plugin.register(buildCtx(workspace)),
			);
			await runtime.dispose();
			await runtime.dispose();
		}

		expect(createdIntervals).toBe(reloads * 2);
		expect(activeIntervals.size).toBe(0);
	});

	it('reusing the same slice listener across two registers still disposes each runtime only once', async () => {
		const start = vi.fn();
		const stop = vi.fn();
		const sharedListener: ISliceListener = {
			check: async () => [],
			drainPending: () => [],
			drainRefusals: () => [],
			start,
			stop,
		};

		vi.resetModules();
		vi.doMock(
			'@mcp-vertex/commit-policy/lib/triggers/slice-listener',
			async () => {
				const actual = await vi.importActual<
					typeof import('@mcp-vertex/commit-policy/lib/triggers/slice-listener')
				>('@mcp-vertex/commit-policy/lib/triggers/slice-listener');
				return {
					...actual,
					createSliceListener: vi.fn(() => sharedListener),
				};
			},
		);

		try {
			const { default: reloadedPlugin } = await import(
				'@mcp-vertex/commit-policy'
			);
			const firstRuntime = asRuntime(
				await reloadedPlugin.register(buildCtx(workspace)),
			);
			const secondRuntime = asRuntime(
				await reloadedPlugin.register(buildCtx(workspace)),
			);

			expect(start).toHaveBeenCalledTimes(2);

			await firstRuntime.dispose();
			await firstRuntime.dispose();
			expect(stop).toHaveBeenCalledTimes(1);

			await secondRuntime.dispose();
			expect(stop).toHaveBeenCalledTimes(2);
		} finally {
			vi.doUnmock(
				'@mcp-vertex/commit-policy/lib/triggers/slice-listener',
			);
			vi.resetModules();
		}
	});

	it('register() failing mid-way at the slice listener leaves zero zombie timers', async () => {
		vi.resetModules();
		vi.doMock(
			'@mcp-vertex/commit-policy/lib/triggers/slice-listener',
			async () => {
				const actual = await vi.importActual<
					typeof import('@mcp-vertex/commit-policy/lib/triggers/slice-listener')
				>('@mcp-vertex/commit-policy/lib/triggers/slice-listener');
				return {
					...actual,
					createSliceListener: vi.fn(() => {
						throw new Error(
							'boom: slice listener failed to attach',
						);
					}),
				};
			},
		);

		try {
			const { default: reloadedPlugin } = await import(
				'@mcp-vertex/commit-policy'
			);

			// register() has no top-level try/catch around listener
			// creation, so a throw there propagates out and no
			// runtime/dispose is ever returned to the caller — this
			// is the "register() falla a mitad" shape from AUD-CP-003.
			expect(() => reloadedPlugin.register(buildCtx(workspace))).toThrow(
				'boom: slice listener failed to attach',
			);

			// The interval trigger's setInterval() call happens after
			// slice-listener setup in register(), so nothing reaches
			// that point; no timer should have leaked past the throw.
			expect(createdIntervals).toBe(0);
			expect(activeIntervals.size).toBe(0);
		} finally {
			vi.doUnmock(
				'@mcp-vertex/commit-policy/lib/triggers/slice-listener',
			);
			vi.resetModules();
		}
	});
});

function asRuntime(reg: Awaited<ReturnType<typeof plugin.register>>): {
	dispose(): void | Promise<void>;
} {
	if (!('dispose' in reg) || typeof reg.dispose !== 'function') {
		throw new Error('register() did not return an IPluginRuntime');
	}
	return reg as unknown as { dispose(): void | Promise<void> };
}

function failedExternalToolRun(stderr: string): IExternalToolRun {
	return {
		ok: false,
		code: 1,
		stdout: '',
		stderr,
		timedOut: false,
		unavailable: false,
	};
}
