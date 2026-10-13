import { describe, expect, it } from 'vitest';

import { runLint } from './run-lint';

describe('runLint', () => {
	it('returns a dockerfile-lint envelope with findings', () => {
		expect(
			runLint({
				source: 'FROM node\nCMD node server.js\n',
				file: 'Dockerfile.dev',
			}),
		).toEqual({
			kind: 'dockerfile-lint',
			findings: [
				{
					ruleId: 'DL3001',
					severity: 'low',
					message:
						'Pin the base image to a non-latest tag or digest.',
					fix: 'Use a specific tag like `node:20-alpine` or a digest.',
					location: { file: 'Dockerfile.dev', line: 1 },
				},
				{
					ruleId: 'DL3025',
					severity: 'low',
					message: 'Use JSON exec form for CMD/ENTRYPOINT.',
					fix: 'Wrap the command in JSON array syntax, for example `["node", "server.js"]`.',
					location: { file: 'Dockerfile.dev', line: 2 },
				},
			],
		});
	});

	it('returns an empty findings list for compliant input', () => {
		expect(
			runLint({
				source: 'FROM alpine:3.20\nCMD ["sh"]\n',
			}),
		).toEqual({
			kind: 'dockerfile-lint',
			findings: [],
		});
	});
});
