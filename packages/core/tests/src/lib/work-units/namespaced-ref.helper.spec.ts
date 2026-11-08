import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import {
	namespacedRef,
	ownedRefRoots,
	ownedRootsOf,
} from '@delendai/core/lib/work-units/namespaced-ref.helper';

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

describe('ownedRefRoots', () => {
	it('lists the current root, then each former one', () => {
		expect(ownedRefRoots(['', 'delendai'], 'retired')).toEqual([
			'refs/retired',
			'refs/delendai/retired',
		]);
	});

	it('names one root when nothing was left behind', () => {
		expect(ownedRefRoots(['delendai'], 'ids')).toEqual([
			'refs/delendai/ids',
		]);
	});
});

describe('ownedRootsOf', () => {
	it('reads the namespaces from the policy, current first', () => {
		const branches = resolveDevelopmentPolicy({
			development: {
				branches: {
					namespacePrefix: '',
					formerNamespacePrefixes: ['delendai'],
				},
			},
		}).branches;
		expect(ownedRootsOf(branches, 'retired', '*')).toEqual([
			'refs/retired/*',
			'refs/delendai/retired/*',
		]);
	});
});
