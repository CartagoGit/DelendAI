/**
 * The ref prefixes delendai owns, current namespace first, then each
 * former one, so refs under a namespace the project left stay its own.
 */
import { describe, expect, it } from 'vitest';

import {
	ownedNamespaces,
	ownedPublicationRefPrefixes,
	ownedWorkRefPrefixes,
} from '@delendai/core/lib/development-policy/owned-ref-prefixes';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

const branchesOf = (branches: Record<string, unknown>) =>
	resolveDevelopmentPolicy({ development: { branches } }).branches;

describe('owned ref prefixes', () => {
	it('reads the prefix from the policy: empty gives wip/ and pr/', () => {
		const branches = branchesOf({ namespacePrefix: '' });
		expect(ownedWorkRefPrefixes(branches)).toEqual(['heads/wip/']);
		expect(ownedPublicationRefPrefixes(branches)).toEqual(['pr/']);
		expect(ownedNamespaces(branches)).toEqual(['']);
	});

	it('reads a named prefix from the policy', () => {
		const branches = branchesOf({ namespacePrefix: 'delendai' });
		expect(ownedWorkRefPrefixes(branches)).toEqual(['heads/delendai/wip/']);
		expect(ownedPublicationRefPrefixes(branches)).toEqual(['delendai/pr/']);
	});

	it('recognises both prefixes in the transition, current first', () => {
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

	it('ignores a former prefix equal to the current one', () => {
		const branches = branchesOf({
			namespacePrefix: 'delendai',
			formerNamespacePrefixes: ['delendai'],
		});
		expect(branches.formerNamespacePrefixes).toBeUndefined();
		expect(ownedPublicationRefPrefixes(branches)).toEqual(['delendai/pr/']);
	});

	it('keeps hidden work refs hidden under a former prefix', () => {
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

	it('owns no work refs when the project writes none', () => {
		const branches = branchesOf({ formerNamespacePrefixes: ['delendai'] });
		expect(
			ownedWorkRefPrefixes({ ...branches, workRefPrefix: '' }),
		).toEqual([]);
	});
});
