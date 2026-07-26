import { describe, expect, it } from 'vitest';

import { lintDockerfile } from './dockerfile-rules';
import { parseDockerfile } from './dockerfile-parser';

const lint = (raw: string) => lintDockerfile(parseDockerfile(raw));

describe('f00133 S2 dockerfile-rules', () => {
	it('flags missing USER', () => {
		expect(
			lint(`FROM alpine\nCMD ["x"]\n`).some((f) =>
				f.ruleId.endsWith('user-missing'),
			),
		).toBe(true);
	});
	it('flags apt-get install without update', () => {
		expect(
			lint(
				`FROM alpine\nRUN apt-get install -y curl\nUSER 1000\nCMD ["x"]\n`,
			).some((f) => f.ruleId.endsWith('no-update')),
		).toBe(true);
	});
	it('does not flag a clean Dockerfile', () => {
		expect(
			lint(
				`FROM alpine:3.19\nRUN apk add --no-cache curl\nUSER 1000\nCMD ["x"]\n`,
			),
		).toEqual([]);
	});
	it('flags MAINTAINER deprecation', () => {
		expect(
			lint(`FROM alpine\nMAINTAINER me@example.com\n`).some((f) =>
				f.ruleId.endsWith('maintainer-deprecated'),
			),
		).toBe(true);
	});
});
