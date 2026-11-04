import { describe, expect, it } from 'vitest';

import { parseDockerLogs } from './parse-docker-logs';

describe('parseDockerLogs', () => {
	it('returns an empty list for empty logs', () => {
		expect(parseDockerLogs('')).toEqual([]);
	});

	it('parses timestamped log lines', () => {
		expect(
			parseDockerLogs('2026-07-26T12:00:00Z server started', 'stdout'),
		).toEqual([
			{
				timestamp: '2026-07-26T12:00:00.000Z',
				stream: 'stdout',
				message: 'server started',
			},
		]);
	});

	it('parses multiple lines and preserves message content', () => {
		expect(
			parseDockerLogs(
				[
					'2026-07-26T12:00:00Z first line',
					'2026-07-26T12:00:01Z second line with spaces',
				].join('\n'),
				'stderr',
			),
		).toEqual([
			{
				timestamp: '2026-07-26T12:00:00.000Z',
				stream: 'stderr',
				message: 'first line',
			},
			{
				timestamp: '2026-07-26T12:00:01.000Z',
				stream: 'stderr',
				message: 'second line with spaces',
			},
		]);
	});

	it('skips malformed or invalid timestamp lines', () => {
		expect(
			parseDockerLogs(
				[
					'no timestamp here',
					'not-a-date message',
					'2026-07-26T12:00:00Z valid line',
				].join('\n'),
			),
		).toEqual([
			{
				timestamp: '2026-07-26T12:00:00.000Z',
				stream: 'unknown',
				message: 'valid line',
			},
		]);
	});
});
