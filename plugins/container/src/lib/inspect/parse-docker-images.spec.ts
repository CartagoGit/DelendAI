import { describe, expect, it } from 'vitest';

import { parseDockerImages } from './parse-docker-images';

describe('parseDockerImages', () => {
	it('returns an empty list for empty input', () => {
		expect(parseDockerImages('')).toEqual([]);
	});
});
