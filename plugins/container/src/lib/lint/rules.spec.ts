import { describe, expect, it } from 'vitest';

import { parseDockerfile } from './parse-dockerfile';
import { applyDockerfileRules } from './rules';

const lint = (source: string) =>
	applyDockerfileRules(parseDockerfile(source), 'fixtures/Dockerfile');

describe('applyDockerfileRules', () => {
	it('flags FROM instructions without a pinned tag', () => {
		expect(lint('FROM node\n')).toEqual([
			expect.objectContaining({
				ruleId: 'DL3001',
				location: { file: 'fixtures/Dockerfile', line: 1 },
			}),
		]);
	});

	it('flags apt-get install without apt-get update', () => {
		expect(lint('RUN apt-get install -y curl\n')).toEqual([
			expect.objectContaining({ ruleId: 'DL3008' }),
		]);
	});

	it('flags shell-form CMD and ENTRYPOINT', () => {
		expect(
			lint(['CMD node server.js', 'ENTRYPOINT python app.py'].join('\n')),
		).toEqual([
			expect.objectContaining({
				ruleId: 'DL3025',
				location: { file: 'fixtures/Dockerfile', line: 1 },
			}),
			expect.objectContaining({
				ruleId: 'DL3025',
				location: { file: 'fixtures/Dockerfile', line: 2 },
			}),
		]);
	});

	it('flags apk add without --no-cache', () => {
		expect(lint('RUN apk add curl\n')).toEqual([
			expect.objectContaining({ ruleId: 'DL3042' }),
		]);
	});

	it('flags wget without checksum validation', () => {
		expect(
			lint('RUN wget https://example.com/tool.tgz -O /tmp/tool.tgz\n'),
		).toEqual([expect.objectContaining({ ruleId: 'DL3047' })]);
	});

	it('returns no findings for a compliant snippet', () => {
		expect(
			lint(
				[
					'FROM node:20-alpine',
					'RUN apt-get update && apt-get install -y curl',
					'RUN apk add --no-cache bash',
					'RUN wget https://example.com/tool.tgz -O /tmp/tool.tgz && echo abc /tmp/tool.tgz | sha256sum -c -',
					'CMD ["node", "server.js"]',
				].join('\n'),
			),
		).toEqual([]);
	});
});
