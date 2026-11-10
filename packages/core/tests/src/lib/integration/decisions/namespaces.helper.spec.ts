/**
 * The ref prefixes delendai owns, current namespace first, then each
 * former one, so refs under a namespace the project left stay its own.
 */
import { describe, expect, it } from 'vitest';

import {
	ownedNamespaces,
	publicationPrefixesOf,
	underPublication,
	ownedPublicationRefPrefixes,
	ownedWorkRefPrefixes,
	retiredRefRoots,
} from '@delendai/core/lib/integration/decisions/namespaces.helper';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

const branchesOf = (branches: Record<string, unknown>) =>
	resolveDevelopmentPolicy({ development: { branches } }).branches;

describe('owned ref prefixes', () => {
	it('[<6ms] reads the prefix from the policy: empty gives wip/ and pr/', () => {
		const branches = branchesOf({ namespacePrefix: '' });
		expect(ownedWorkRefPrefixes(branches)).toEqual(['heads/wip/']);
		expect(ownedPublicationRefPrefixes(branches)).toEqual(['pr/']);
		expect(ownedNamespaces(branches)).toEqual(['']);
	});

	it('[<6ms] reads a named prefix from the policy', () => {
		const branches = branchesOf({ namespacePrefix: 'delendai' });
		expect(ownedWorkRefPrefixes(branches)).toEqual(['heads/delendai/wip/']);
		expect(ownedPublicationRefPrefixes(branches)).toEqual(['delendai/pr/']);
	});

	it('[<5ms] recognises both prefixes in the transition, current first', () => {
		const branches = branchesOf({
			namespacePrefix: '',
			formerNamespacePrefixes: ['delendai'],
		});
		expect(branches.workRefTemplate.startsWith('heads/wip/')).toBe(true);
		expect(ownedWorkRefPrefixes(branches)).toEqual([
			'heads/wip/',
			'heads/delendai/wip/',
		]);
		expect(ownedPublicationRefPrefixes(branches)).toEqual([
			'pr/',
			'delendai/pr/',
		]);
		expect(ownedNamespaces(branches)).toEqual(['', 'delendai']);
	});

	it('[<5ms] ignores a former prefix equal to the current one', () => {
		const branches = branchesOf({
			namespacePrefix: 'delendai',
			formerNamespacePrefixes: ['delendai'],
		});
		expect(branches.formerNamespacePrefixes).toBeUndefined();
		expect(ownedPublicationRefPrefixes(branches)).toEqual(['delendai/pr/']);
	});

	it('[<5ms] keeps hidden work refs hidden under a former prefix', () => {
		const branches = branchesOf({
			namespacePrefix: '',
			formerNamespacePrefixes: ['delendai'],
		});
		expect(
			ownedWorkRefPrefixes({
				...branches,
				workRefVisibility: 'hidden',
				workRefPrefix: 'wip/',
			}),
		).toEqual(['wip/', 'delendai/wip/']);
	});

	it('[<5ms] owns no work refs when the project writes none', () => {
		const branches = branchesOf({ formerNamespacePrefixes: ['delendai'] });
		expect(
			ownedWorkRefPrefixes({ ...branches, workRefPrefix: '' }),
		).toEqual([]);
	});
});

const moved = resolveDevelopmentPolicy({
	development: {
		branches: {
			namespacePrefix: '',
			formerNamespacePrefixes: ['delendai'],
		},
	},
}).branches;

describe('publication prefixes', () => {
	it('[<5ms] reads the prefix from the policy, current first', () => {
		expect(publicationPrefixesOf(moved)).toEqual(['pr/', 'delendai/pr/']);
	});

	it('[<50ms] recognises both prefixes in the transition', () => {
		const prefixes = publicationPrefixesOf(moved);
		expect(underPublication('pr/a/implement/x-S1-g1/t', prefixes)).toBe(
			true,
		);
		expect(
			underPublication('delendai/pr/a/implement/x-S1-g1/t', prefixes),
		).toBe(true);
		expect(underPublication('feature/mine', prefixes)).toBe(false);
	});

	it('[<5ms] takes one prefix as it is, and a rest after it', () => {
		expect(underPublication('delendai/pr/a/x', 'delendai/pr/', 'a/')).toBe(
			true,
		);
		expect(underPublication('delendai/pr/b/x', 'delendai/pr/', 'a/')).toBe(
			false,
		);
		expect(underPublication('anything', '')).toBe(false);
	});
});

describe('allowedRefPatterns and underNamespace', () => {
	it('[<7ms] the forge ruleset patterns cover the same namespaces as the guard', async () => {
		const { allowedRefPatterns, underNamespace } = await import(
			'@delendai/core/lib/integration/decisions/namespaces.helper'
		);
		const patterns = allowedRefPatterns({ branches: moved });
		expect(patterns).toContain('refs/heads/pr/**/*');
		expect(patterns).toContain('refs/heads/queue/**/*');
		expect(patterns).toContain('refs/heads/delendai/queue/**/*');
		expect(underNamespace('wip/a/x', 'refs/heads/wip/')).toBe(true);
		expect(underNamespace('wip/a/x', '')).toBe(false);
		expect(underNamespace('wip/a/x', undefined)).toBe(false);
	});

	it('[<6ms] keeps retired tips under each owned namespace, current first', () => {
		expect(
			retiredRefRoots({
				namespacePrefix: 'delendai',
				formerNamespacePrefixes: ['former-ns', 'delendai'],
			}),
		).toEqual(['refs/delendai/retired/', 'refs/former-ns/retired/']);
		expect(retiredRefRoots({})).toEqual([
			['refs', 'retired', ''].join('/'),
		]);
	});
});
