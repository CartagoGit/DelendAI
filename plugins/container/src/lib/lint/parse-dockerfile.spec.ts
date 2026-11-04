import { describe, expect, it } from 'vitest';

import { parseDockerfile } from './parse-dockerfile';

describe('parseDockerfile', () => {
	it('parses common Dockerfile instructions', () => {
		expect(
			parseDockerfile(
				[
					'FROM node:20-alpine',
					'RUN npm ci',
					'CMD ["node", "server.js"]',
					'WORKDIR /app',
				].join('\n'),
			),
		).toEqual([
			{
				command: 'FROM',
				args: 'node:20-alpine',
				line: 1,
				raw: 'FROM node:20-alpine',
			},
			{
				command: 'RUN',
				args: 'npm ci',
				line: 2,
				raw: 'RUN npm ci',
			},
			{
				command: 'CMD',
				args: '["node", "server.js"]',
				line: 3,
				raw: 'CMD ["node", "server.js"]',
			},
			{
				command: 'WORKDIR',
				args: '/app',
				line: 4,
				raw: 'WORKDIR /app',
			},
		]);
	});

	it('recognizes the supported instruction set', () => {
		const instructions = parseDockerfile(
			[
				'ARG NODE_ENV=production',
				'ENV PORT=3000',
				'COPY . .',
				'ADD archive.tgz /tmp',
				'USER node',
				'EXPOSE 3000',
				'VOLUME /data',
				'LABEL org.opencontainers.image.source=repo',
				'HEALTHCHECK CMD curl -f localhost:3000 || exit 1',
				'SHELL ["/bin/sh", "-c"]',
				'MAINTAINER team@example.com',
				'STOPSIGNAL SIGTERM',
			].join('\n'),
		);

		expect(instructions.map((instruction) => instruction.command)).toEqual([
			'ARG',
			'ENV',
			'COPY',
			'ADD',
			'USER',
			'EXPOSE',
			'VOLUME',
			'LABEL',
			'HEALTHCHECK',
			'SHELL',
			'MAINTAINER',
			'STOPSIGNAL',
		]);
	});

	it('joins line continuations into a single instruction', () => {
		const instructions = parseDockerfile(
			[
				'RUN apt-get update && ' + '\\',
				'    apt-get install -y curl',
			].join('\n'),
		);

		expect(instructions).toHaveLength(1);
		expect(instructions[0]?.command).toBe('RUN');
		expect(instructions[0]?.args).toBe(
			'apt-get update && apt-get install -y curl',
		);
		expect(instructions[0]?.line).toBe(1);
	});

	it('skips comments, blanks, and unknown instructions', () => {
		expect(
			parseDockerfile(
				[
					'# syntax=docker/dockerfile:1',
					'',
					'UNKNOWN something',
					'FROM alpine:3.20',
				].join('\n'),
			),
		).toEqual([
			{
				command: 'FROM',
				args: 'alpine:3.20',
				line: 4,
				raw: 'FROM alpine:3.20',
			},
		]);
	});
});

describe('parseDockerfile on pathological lines (js/polynomial-redos)', () => {
	it('stays linear on a long run of spaces after the command', () => {
		const start = performance.now();
		const parsed = parseDockerfile(`RUN${' '.repeat(100_000)}\u0000`);
		expect(performance.now() - start).toBeLessThan(500);
		expect(parsed).toHaveLength(1);
		expect(parsed[0]?.command).toBe('RUN');
		expect(parseDockerfile(`RUN${' '.repeat(100_000)}`).length).toBe(0);
	});

	it('still splits command and arguments', () => {
		const [first] = parseDockerfile('run   echo hi  ');
		expect(first?.command).toBe('RUN');
		expect(first?.args).toBe('echo hi');
	});
});
