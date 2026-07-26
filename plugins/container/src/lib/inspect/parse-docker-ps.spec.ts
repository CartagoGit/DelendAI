import { describe, expect, it } from 'vitest';

import { parseDockerPs } from './parse-docker-ps';

describe('parseDockerPs', () => {
	it('returns an empty list for empty input', () => {
		expect(parseDockerPs('')).toEqual([]);
	});

	it('parses a single container row', () => {
		const items = parseDockerPs(
			'{"ID":"abc123","Names":"web","Image":"nginx:1.27","Status":"Up 5 minutes","Ports":"0.0.0.0:80->80/tcp","CreatedAt":"2026-07-26T12:00:00Z"}',
		);
		expect(items).toEqual([
			{
				id: 'abc123',
				name: 'web',
				image: 'nginx:1.27',
				status: 'Up 5 minutes',
				ports: ['0.0.0.0:80->80/tcp'],
				createdAt: '2026-07-26T12:00:00.000Z',
			},
		]);
	});

	it('parses multiple newline-delimited JSON rows', () => {
		const items = parseDockerPs(
			[
				'{"ID":"a1","Names":"api","Image":"svc:v1","Status":"Up","Ports":"80/tcp, 443/tcp","CreatedAt":"2026-07-26T12:00:00Z"}',
				'{"ID":"b2","Names":"worker","Image":"jobs:v2","Status":"Exited (0)","Ports":"","CreatedAt":"2026-07-26T13:00:00Z"}',
			].join('\n'),
		);
		expect(items).toHaveLength(2);
		expect(items[0]?.ports).toEqual(['80/tcp', '443/tcp']);
		expect(items[1]?.name).toBe('worker');
	});

	it('skips malformed lines without failing the parse', () => {
		const items = parseDockerPs(
			[
				'not-json',
				'{"ID":"abc123","Names":"web","Image":"nginx:1.27","Status":"Up","Ports":"80/tcp","CreatedAt":"2026-07-26T12:00:00Z"}',
			].join('\n'),
		);
		expect(items).toHaveLength(1);
		expect(items[0]?.id).toBe('abc123');
	});
});
