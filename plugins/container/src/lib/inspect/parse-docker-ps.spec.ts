import { describe, expect, it } from 'vitest';

import { parseDockerPs } from './parse-docker-ps';

describe('parseDockerPs', () => {
	it('returns an empty list for empty input', () => {
		expect(parseDockerPs('')).toEqual([]);
	});
});
