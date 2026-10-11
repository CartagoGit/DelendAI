import { describe, expect, it } from 'vitest';

import { namespacedRef } from '@delendai/core/lib/work-units/namespaced-ref.helper';

describe('namespacedRef', () => {
	it('puts the parts under the namespace', () => {
		expect(namespacedRef('delendai', 'retired', 'a/b')).toBe(
			'refs/delendai/retired/a/b',
		);
	});

	it('leaves no empty segment for a project with no namespace', () => {
		expect(namespacedRef('', 'retired', '*')).toBe('refs/retired/*');
		expect(namespacedRef('', 'claims', 'slice', 'x00001')).toBe(
			'refs/claims/slice/x00001',
		);
	});
});
