/**
 * patch-digest.spec.ts — the scope fingerprint is order-independent, sees
 * a deletion, and parses both listings git prints.
 */
import { describe, expect, it } from 'vitest';

import {
	computePatchDigest,
	parseObjectListing,
	parseUnmergedPaths,
} from '../../../../src/lib/wip-engine/patch-digest';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

describe('parseObjectListing', () => {
	it('reads ls-files and ls-tree lines, skipping conflicted and malformed ones', () => {
		const output = [
			`100644 ${SHA_A} 0\ta.ts`,
			`100644 blob ${SHA_B}\tb.ts`,
			`100644 ${SHA_A} 2\tconflicted.ts`,
			'no tab here',
			`100644 ${SHA_A} 0\t   `,
			'100644 not-a-sha 0\tc.ts',
			'',
		].join('\n');
		expect(parseObjectListing(output)).toEqual([
			{ path: 'a.ts', mode: '100644', sha: SHA_A },
			{ path: 'b.ts', mode: '100644', sha: SHA_B },
		]);
	});
});

describe('parseUnmergedPaths', () => {
	it('lists each path once, sorted', () => {
		const output = [
			`100644 ${SHA_A} 2\tz.ts`,
			`100644 ${SHA_B} 3\tz.ts`,
			`100644 ${SHA_A} 1\ta.ts`,
			'no tab',
			`100644 ${SHA_A} 1\t `,
		].join('\n');
		expect(parseUnmergedPaths(output)).toEqual(['a.ts', 'z.ts']);
	});
});

describe('computePatchDigest', () => {
	const a = { path: 'a.ts', mode: '100644', sha: SHA_A };
	const b = { path: 'b.ts', mode: '100644', sha: SHA_B };

	it('does not depend on the order paths and entries were given in', () => {
		expect(computePatchDigest(['b.ts', 'a.ts', 'a.ts'], [b, a])).toBe(
			computePatchDigest(['a.ts', 'b.ts'], [a, b]),
		);
	});

	it('changes when a claimed path is deleted', () => {
		expect(computePatchDigest(['a.ts', 'b.ts'], [a])).not.toBe(
			computePatchDigest(['a.ts', 'b.ts'], [a, b]),
		);
	});
});
