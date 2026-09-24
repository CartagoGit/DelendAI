/**
 * plugin-dispose.spec.ts
 *
 * The failure hooks return at once and their reports keep running; the
 * plugin's `dispose` is what waits for them. Driven through the real
 * `register()` with the network reporter replaced, so nothing here can
 * open an issue whatever the classifier decides.
 */
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/public';
import { createFakeToolServer, fakePartial } from '@delendai/test-kit';

const submitted: unknown[] = [];
vi.mock('../src/lib/reporter.service', () => ({
	createSafeReporter: () => ({
		submitSafeReport: async (report: unknown) => {
			submitted.push(report);
			return { ok: false, reason: 'disabled-in-spec' };
		},
	}),
}));

const { default: plugin } = await import('../src/index');

const dirs: string[] = [];
afterEach(async () => {
	submitted.splice(0);
	await Promise.all(
		dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

const registerEnabled = async (extra: Record<string, unknown> = {}) => {
	const root = await mkdtemp(join(tmpdir(), 'error-reporting-dispose-'));
	dirs.push(root);
	const result = await plugin.register(
		fakePartial<IMcpPluginContext>({
			namespacePrefix: 'delendai',
			pluginCacheDir: '.cache/delendai/error-reporting',
			options: { enabled: true, ...extra },
			workspace: {
				root,
				resolve: (relative: string) => join(root, relative),
			},
		}),
	);
	if (result === undefined || !('registrations' in result)) {
		throw new Error('an enabled plugin returns a disposable runtime');
	}
	return { root, runtime: result };
};

describe('error-reporting disposal', () => {
	it('waits for the reports every hook fired before it resolves', async () => {
		const { root, runtime } = await registerEnabled();
		const { onToolCall, onRegisterError, onHookError } =
			runtime.registrations;
		const failure = new Error('a failure the hooks must account for');
		await onToolCall?.('some_tool', {}, undefined, failure);
		await onRegisterError?.({
			pluginName: 'some-plugin',
			resolvedSpecifier: 'some-plugin',
			phase: 'register',
			error: failure,
		});
		await onHookError?.({
			pluginName: 'some-plugin',
			resolvedSpecifier: 'some-plugin',
			hookName: 'onToolCall',
			toolName: 'some_tool',
			args: {},
			error: failure,
		});
		await runtime.dispose?.();
		// Every report settled, so its accounting is on disk and nothing
		// is still writing into the directory a host is about to delete.
		const written = await readdir(
			join(root, '.cache/delendai/error-reporting'),
		);
		expect(written.length).toBeGreaterThan(0);
		await expect(
			rm(root, { recursive: true, force: false }),
		).resolves.toBeUndefined();
	});

	it('does not report a successful call', async () => {
		const { runtime } = await registerEnabled();
		await runtime.registrations.onToolCall?.('some_tool', {}, { ok: true });
		await runtime.dispose?.();
		expect(submitted).toEqual([]);
	});

	it('submits a confirmed log finding through the plugin reporter, redacted', async () => {
		const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { runtime } = await registerEnabled({ internalOnly: true });
		expect(String(warned.mock.calls[0]?.[0])).toContain('internalOnly');
		warned.mockRestore();
		const diagnose = runtime.registrations.tools?.find(
			(tool) => tool.id === 'diagnose_log',
		);
		if (diagnose === undefined) throw new Error('no diagnose_log');
		let handler: ((args: unknown) => unknown) | undefined;
		await diagnose.register(
			createFakeToolServer({
				onRegisterTool: ({ handler: registered }) => {
					handler = registered;
				},
			}),
		);
		if (handler === undefined) throw new Error('nothing registered');
		const logText = Array.from(
			{ length: 3 },
			() => '[delendai] plugin "broken" failed during register(): boom',
		).join('\n');
		const first = (await handler({ logText })) as {
			readonly structuredContent: {
				readonly findings: readonly { readonly shapeId: string }[];
			};
		};
		const [finding] = first.structuredContent.findings;
		if (finding === undefined) throw new Error('no finding to submit');
		await handler({
			logText,
			openIssue: { shapeId: finding.shapeId, confirm: true },
		});
		expect(submitted.length).toBe(1);
		await runtime.dispose?.();
	});
});
