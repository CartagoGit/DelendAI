/**
 * index.spec.ts — x00261/S1 lifecycle contract for the plugin entrypoint.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import plugin from '@mcp-vertex/commit-policy';
import * as corePublic from '@mcp-vertex/core/public';
import type {
	IMcpPluginContext,
	IExternalToolRun,
} from '@mcp-vertex/core/public';

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

	it('register() refreshes remote branch protection when the opt-in env var is true', async () => {
		process.env.MCP_VERTEX_COMMIT_POLICY_REFRESH_BRANCH_PROTECTION_ON_REGISTER =
			'true';
		const runExternalToolSpy = vi
			.spyOn(corePublic, 'runExternalTool')
			.mockResolvedValue(failedExternalToolRun('no remote configured'));

		const runtime = asRuntime(await plugin.register(buildCtx(workspace)));

		await vi.waitFor(() => {
			expect(runExternalToolSpy).toHaveBeenCalled();
		});
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

	it('does not start the slice listener when proposals owns persistence', async () => {
		const runtime = asRuntime(
			await plugin.register({
				...buildCtx(workspace),
				pluginOptions: new Map([
					['proposals', { persist: { mode: 'commit' } }],
				]),
			}),
		);

		expect(createdIntervals).toBe(1);

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
