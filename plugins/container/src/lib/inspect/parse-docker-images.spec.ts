import { describe, expect, it } from 'vitest';

import { parseDockerImages } from './parse-docker-images';

describe('parseDockerImages', () => {
	it('returns an empty list for empty input', () => {
		expect(parseDockerImages('')).toEqual([]);
	});

	it('parses a single image row', () => {
		const items = parseDockerImages(
			'{"ID":"sha256:123","Repository":"nginx","Tag":"latest","Size":"187MB","CreatedAt":"2026-07-26T12:00:00Z"}',
		);
		expect(items).toEqual([
			{
				id: 'sha256:123',
				repository: 'nginx',
				tag: 'latest',
				size: '187MB',
				createdAt: '2026-07-26T12:00:00.000Z',
			},
		]);
	});

	it('parses multiple newline-delimited JSON rows', () => {
		const items = parseDockerImages(
			[
				'{"ID":"sha256:1","Repository":"nginx","Tag":"latest","Size":"187MB","CreatedAt":"2026-07-26T12:00:00Z"}',
				'{"ID":"sha256:2","Repository":"busybox","Tag":"1.36","Size":"4MB","CreatedAt":"2026-07-26T13:00:00Z"}',
			].join('\n'),
		);
		expect(items).toHaveLength(2);
		expect(items[0]?.repository).toBe('nginx');
		expect(items[1]?.tag).toBe('1.36');
	});

	it('skips malformed lines without failing the parse', () => {
		const items = parseDockerImages(
			[
				'{"ID":"sha256:1","Repository":"nginx","Tag":"latest","Size":"187MB","CreatedAt":"2026-07-26T12:00:00Z"}',
				'{bad-json}',
			].join('\n'),
		);
		expect(items).toHaveLength(1);
		expect(items[0]?.id).toBe('sha256:1');
	});
});
