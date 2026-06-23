import { describe, expect, it } from 'vitest';

import { createRuntimeHandle } from '../host/runtime-handle';
import type { IDisposable } from '../extension';

describe('RuntimeHandle', () => {
	it('registers disposables that can be disposed in LIFO order', () => {
		const disposed: string[] = [];
		const handle = createRuntimeHandle();

		handle.register('a', { dispose: () => disposed.push('a') });
		handle.register('b', { dispose: () => disposed.push('b') });
		handle.register('c', { dispose: () => disposed.push('c') });

		handle.disposeAll();

		expect(disposed).toEqual(['c', 'b', 'a']);
	});

	it('is a no-op when nothing has been registered', () => {
		const handle = createRuntimeHandle();
		expect(() => handle.disposeAll()).not.toThrow();
		expect(handle.count).toBe(0);
	});

	it('tracks count of registered items across register + dispose', () => {
		const handle = createRuntimeHandle();
		const noop: IDisposable = { dispose: () => {} };

		expect(handle.count).toBe(0);
		handle.register('first', noop);
		expect(handle.count).toBe(1);
		handle.register('second', noop);
		expect(handle.count).toBe(2);

		handle.disposeAll();
		expect(handle.count).toBe(0);
	});

	it('continues disposing remaining items even when one throws', () => {
		const disposed: string[] = [];
		const handle = createRuntimeHandle();

		handle.register('safe-1', { dispose: () => disposed.push('safe-1') });
		handle.register('throws', {
			dispose: () => {
				throw new Error('boom');
			},
		});
		handle.register('safe-2', { dispose: () => disposed.push('safe-2') });

		// disposeAll must not abort on the first throw — deactivate is a
		// best-effort cleanup, and we still want the rest disposed.
		handle.disposeAll();

		expect(disposed).toEqual(['safe-2', 'safe-1']);
	});

	it('disposes a single item by id without touching the rest', () => {
		const disposed: string[] = [];
		const handle = createRuntimeHandle();

		handle.register('a', { dispose: () => disposed.push('a') });
		handle.register('b', { dispose: () => disposed.push('b') });
		handle.register('c', { dispose: () => disposed.push('c') });

		const removed = handle.disposeOne('b');

		expect(removed).toBe(true);
		expect(disposed).toEqual(['b']);
		expect(handle.count).toBe(2);

		// LIFO order on the remaining two.
		handle.disposeAll();
		expect(disposed).toEqual(['b', 'c', 'a']);
	});

	it('returns false when disposing a missing id', () => {
		const handle = createRuntimeHandle();
		handle.register('a', { dispose: () => {} });
		expect(handle.disposeOne('nope')).toBe(false);
		expect(handle.count).toBe(1);
	});
});
