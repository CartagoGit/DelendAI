/**
 * dry-run-scope.helper.spec.ts — the ambient dry-run scope.
 *
 * `getActiveDryRunFlag` must reflect whichever `runWithDryRunScope` call
 * is CURRENTLY on the async call stack, propagate through awaited
 * continuations, default to `false` outside any scope, and never leak
 * between concurrent/nested scopes.
 */
import { describe, expect, it } from 'vitest';

import {
	getActiveDryRunFlag,
	runWithDryRunScope,
} from '@delendai/core/public';

const microtask = (): Promise<void> => new Promise((resolve) => resolve());

describe('dry-run ambient scope', () => {
	it('defaults to false outside any scope', () => {
		expect(getActiveDryRunFlag()).toBe(false);
	});

	it('reflects the scope value while fn runs', async () => {
		const seen: boolean[] = [];
		await runWithDryRunScope(true, async () => {
			seen.push(getActiveDryRunFlag());
		});
		await runWithDryRunScope(false, async () => {
			seen.push(getActiveDryRunFlag());
		});
		expect(seen).toEqual([true, false]);
	});

	it('propagates through awaited continuations several hops deep', async () => {
		const observed: boolean[] = [];
		const deeplyNested = async (): Promise<void> => {
			await microtask();
			await microtask();
			observed.push(getActiveDryRunFlag());
		};
		await runWithDryRunScope(true, deeplyNested);
		expect(observed).toEqual([true]);
	});

	it('restores false after the scope ends', async () => {
		await runWithDryRunScope(true, async () => {
			expect(getActiveDryRunFlag()).toBe(true);
		});
		expect(getActiveDryRunFlag()).toBe(false);
	});

	it('does not leak between concurrently running scopes', async () => {
		const results: Record<string, boolean> = {};
		await Promise.all([
			runWithDryRunScope(true, async () => {
				await microtask();
				results.a = getActiveDryRunFlag();
			}),
			runWithDryRunScope(false, async () => {
				await microtask();
				results.b = getActiveDryRunFlag();
			}),
		]);
		expect(results).toEqual({ a: true, b: false });
	});
});
