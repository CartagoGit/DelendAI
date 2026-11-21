import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit/public';

/**
 * `fakePartial` is a compile-time contract first, a runtime identity
 * function second. These specs prove:
 *  1. the runtime behaviour (it returns the object unchanged — no
 *     cloning, no defaulting, no magic),
 *  2. the *documented* compile-time guarantees, using inline fixtures
 *     that mirror the dominant "fake an SDK-shaped parameter" case this
 *     helper replaces.
 *
 * What this file CANNOT assert with `expect()`: that omitting a
 * `TRequiredKeys` field, providing a wrong type, or providing an
 * unknown key fails to COMPILE. Vitest runs after `tsc` already
 * accepted the file, so a would-be compile error can never reach a
 * runtime assertion — that is the whole point of a type-level
 * guarantee. Those three cases are proven manually (see the task's
 * gate output) by temporarily introducing each mistake into a scratch
 * file and observing `tsc` reject it, then reverting. This file
 * documents the intended-valid shapes so a future edit to
 * `fakePartial`'s signature that silently weakens it still has to pass
 * these fixtures.
 */

interface IFakeSdkServer {
	readonly tool: (name: string) => void;
	readonly registerCapabilities: (
		caps: Readonly<Record<string, boolean>>,
	) => void;
	readonly close: () => Promise<void>;
}

describe('fakePartial', () => {
	it('returns the given object unchanged (identity, no cloning/defaulting)', () => {
		const calls: string[] = [];
		const fake = fakePartial<
			IFakeSdkServer,
			'tool' | 'registerCapabilities'
		>({
			tool: (name) => calls.push(`tool:${name}`),
			registerCapabilities: (caps) =>
				calls.push(`caps:${JSON.stringify(caps)}`),
		});

		fake.tool('search');
		fake.registerCapabilities({ search: true });

		expect(calls).toEqual(['tool:search', 'caps:{"search":true}']);
		expect(fake.close).toBeUndefined();
	});

	it('accepts extra optional fields beyond the declared required set', () => {
		const fake = fakePartial<IFakeSdkServer, 'tool'>({
			tool: () => {},
			close: async () => {},
		});

		expect(typeof fake.close).toBe('function');
	});

	it('accepts zero required keys when the test never exercises the real object', () => {
		const fake = fakePartial<IFakeSdkServer>({});
		expect(fake).toEqual({});
	});
});
