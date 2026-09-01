/**
 * effect-capability-factory.helper.spec.ts — capability-injection layer.
 *
 * `createDryRunGatedGitRunner` is the concrete factory behind
 * `IMcpPluginContext.effects.git`. These are unit-level: they prove the
 * factory itself re-checks the ambient dry-run scope on EVERY call
 * (not once at construction), independent of the router-level proof in
 * `capability-injection.spec.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
	createDryRunGatedGitRunner,
	DryRunEffectRefusedError,
	runWithDryRunScope,
	type IGitRunner,
} from '@mcp-vertex/core/public';

describe('createDryRunGatedGitRunner', () => {
	it('refuses to invoke the real runner while the ambient scope is dry-run', async () => {
		const calls: (readonly string[])[] = [];
		const realRunner: IGitRunner = async (args) => {
			calls.push(args);
			return { ok: true, output: '' };
		};
		const gated = createDryRunGatedGitRunner(realRunner);

		await runWithDryRunScope(true, async () => {
			await expect(gated(['commit', '-m', 'feat: x'])).rejects.toThrow(
				DryRunEffectRefusedError,
			);
		});

		expect(calls).toEqual([]);
	});

	it('invokes the real runner when the ambient scope is not dry-run', async () => {
		const calls: (readonly string[])[] = [];
		const realRunner: IGitRunner = async (args) => {
			calls.push(args);
			return { ok: true, output: 'ok' };
		};
		const gated = createDryRunGatedGitRunner(realRunner);

		const result = await runWithDryRunScope(false, async () =>
			gated(['status']),
		);

		expect(result).toEqual({ ok: true, output: 'ok' });
		expect(calls).toEqual([['status']]);
	});

	it('re-checks the ambient scope per call — one instance safely serves both dry-run and real calls', async () => {
		const calls: (readonly string[])[] = [];
		const realRunner: IGitRunner = async (args) => {
			calls.push(args);
			return { ok: true, output: '' };
		};
		const gated = createDryRunGatedGitRunner(realRunner);

		await runWithDryRunScope(true, async () => {
			await expect(gated(['push'])).rejects.toThrow(
				DryRunEffectRefusedError,
			);
		});
		await runWithDryRunScope(false, async () => gated(['push']));
		await runWithDryRunScope(true, async () => {
			await expect(gated(['push'])).rejects.toThrow(
				DryRunEffectRefusedError,
			);
		});

		expect(calls).toEqual([['push']]);
	});

	it('behaves exactly like the wrapped runner outside any dry-run scope', async () => {
		const realRunner: IGitRunner = async () => ({
			ok: true,
			output: 'real',
		});
		const gated = createDryRunGatedGitRunner(realRunner);

		const result = await gated(['log']);

		expect(result).toEqual({ ok: true, output: 'real' });
	});
});
