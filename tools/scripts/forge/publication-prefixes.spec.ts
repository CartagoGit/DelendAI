/**
 * The queue reads every publication prefix the policy owns (f00808).
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import {
	publicationPrefixesOf,
	underPublication,
} from './publication-prefixes';

const moved = resolveDevelopmentPolicy({
	development: {
		branches: {
			namespacePrefix: '',
			formerNamespacePrefixes: ['delendai'],
		},
	},
}).branches;

describe('publication prefixes', () => {
	it('reads the prefix from the policy, current first', () => {
		expect(publicationPrefixesOf(moved)).toEqual(['pr/', 'delendai/pr/']);
	});

	it('recognises both prefixes in the transition', () => {
		const prefixes = publicationPrefixesOf(moved);
		expect(underPublication('pr/a/implement/x-S1-g1/t', prefixes)).toBe(
			true,
		);
		expect(
			underPublication('delendai/pr/a/implement/x-S1-g1/t', prefixes),
		).toBe(true);
		expect(underPublication('feature/mine', prefixes)).toBe(false);
	});

	it('takes one prefix as it is, and a rest after it', () => {
		expect(underPublication('delendai/pr/a/x', 'delendai/pr/', 'a/')).toBe(
			true,
		);
		expect(underPublication('delendai/pr/b/x', 'delendai/pr/', 'a/')).toBe(
			false,
		);
		expect(underPublication('anything', '')).toBe(false);
	});
});
