import { describe, expect, it } from 'vitest';

import { runDockerfileLint } from './run-lint';

describe('f00133 S2 runDockerfileLint', () => {
	it('falls back to built-in when hadolint is missing', async () => {
		const out = await runDockerfileLint({
			source: 'FROM alpine\nRUN apt-get install -y curl\n',
		});
		expect(out.hadolintAvailable).toBe(false);
		expect(out.engine).toBe('builtin');
		expect(out.findings.length).toBeGreaterThanOrEqual(2);
	});
	it('produces no findings for a minimal clean Dockerfile', async () => {
		const out = await runDockerfileLint({
			source: `FROM alpine:3.19\nRUN apk add --no-cache curl\nUSER 1000\nCMD ["echo","hi"]\n`,
		});
		expect(out.findings).toEqual([]);
	});
});
