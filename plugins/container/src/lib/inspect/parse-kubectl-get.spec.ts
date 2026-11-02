import { describe, expect, it } from 'vitest';

import { parseKubectlGet } from './parse-kubectl-get';

describe('parseKubectlGet', () => {
	it('returns an empty list for malformed JSON', () => {
		expect(parseKubectlGet('{')).toEqual([]);
	});
});
