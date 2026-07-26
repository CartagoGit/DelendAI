import { describe, expect, it } from 'vitest';

import { parseDockerfile } from './dockerfile-parser';

describe('f00133 S2 dockerfile-parser', () => {
	it('parses a simple Dockerfile', () => {
		const out = parseDockerfile(
			`FROM alpine\nRUN echo hi\nUSER 1000\nCMD ["echo","x"]`,
		);
		expect(out.map((i) => i.command)).toEqual([
			'FROM',
			'RUN',
			'USER',
			'CMD',
		]);
		expect(out[3]?.args).toEqual(['echo', 'x']);
	});

	it('joins backslash continuations', () => {
		const out = parseDockerfile(
			'RUN apt-get update \\\n  && apt-get install -y curl',
		);
		expect(out).toHaveLength(1);
		expect(out[0]?.args).toContain('curl');
	});

	it('handles empty input', () => {
		expect(parseDockerfile('')).toEqual([]);
	});
});
