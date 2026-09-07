import { describe, expect, it } from 'vitest';

import {
	canonicalHash,
	computeFeatureVector,
	type IWorkFeatureVector,
} from './feature-vector';

describe('feature-vector (f00511 S1)', () => {
	it('returns the documented complexity_proxy formula with 2-decimal rounding', () => {
		const vector = computeFeatureVector({
			slice_count: 2,
			affected_packages: 3,
			public_api_changes: 1,
			test_count: 4,
			loc_changed: 1000,
		});
		// 2*1.2 + 3*2.1 + 1*3.2 + 4*0.7 + 1000*0.0001
		// 2.4  + 6.3  + 3.2  + 2.8  + 0.1        = 14.8
		expect(vector.complexity_proxy).toBe(14.8);
	});

	it('falls back to documented defaults for missing fields', () => {
		expect(computeFeatureVector({}).slice_count).toBe(1);
		expect(computeFeatureVector({}).affected_packages).toBe(0);
		expect(computeFeatureVector({}).public_api_changes).toBe(0);
		expect(computeFeatureVector({}).test_count).toBe(0);
		expect(computeFeatureVector({}).loc_changed).toBe(0);
	});

	it('produces the same hash for two vectors with identical numeric fields', () => {
		const a = computeFeatureVector({
			slice_count: 4,
			affected_packages: 2,
			public_api_changes: 1,
			test_count: 6,
			loc_changed: 250,
		});
		const b: IWorkFeatureVector = {
			slice_count: 4,
			affected_packages: 2,
			public_api_changes: 1,
			test_count: 6,
			loc_changed: 250,
			complexity_proxy: a.complexity_proxy,
		};
		expect(canonicalHash(a)).toBe(canonicalHash(b));
	});

	it('changes the hash byte-for-byte when any single field changes', () => {
		const base = computeFeatureVector({
			slice_count: 3,
			affected_packages: 1,
			public_api_changes: 0,
			test_count: 2,
			loc_changed: 80,
		});
		const mutated = computeFeatureVector({
			slice_count: 3,
			affected_packages: 1,
			public_api_changes: 0,
			test_count: 2,
			loc_changed: 81,
		});
		expect(canonicalHash(base)).not.toBe(canonicalHash(mutated));
	});

	it('produces unique hashes for 100 random synthetic vectors', () => {
		const seen = new Set<string>();
		for (let index = 0; index < 100; index += 1) {
			const vector = computeFeatureVector({
				slice_count: (index % 5) + 1,
				affected_packages: (index * 7) % 9,
				public_api_changes: index % 3,
				test_count: (index * 3) % 11,
				loc_changed: index * 17,
			});
			seen.add(canonicalHash(vector));
		}
		expect(seen.size).toBe(100);
	});
});
