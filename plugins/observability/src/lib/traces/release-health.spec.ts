import { describe, expect, it } from 'vitest';

import {
	computeReleaseHealth,
	severityForReleaseHealth,
	summarizeReleaseHealth,
} from './release-health';
import type { IReadonlyReleaseHealthRecord } from './interfaces';

const record = (
	overrides: Partial<IReadonlyReleaseHealthRecord> = {},
): IReadonlyReleaseHealthRecord => ({
	version: '1.2.3',
	sessionId: 'session-1',
	crashed: false,
	...overrides,
});

describe('computeReleaseHealth', () => {
	it('returns an empty list for empty input', () => {
		expect(computeReleaseHealth([])).toEqual([]);
		expect(summarizeReleaseHealth([])).toEqual({
			summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
			worst: null,
		});
	});

	it('aggregates unique sessions per version', () => {
		const out = computeReleaseHealth([
			record(),
			record({ sessionId: 'session-1', crashed: true }),
			record({ sessionId: 'session-2' }),
			record({ version: '1.2.4', sessionId: 'session-3', crashed: true }),
		]);
		expect(out).toEqual([
			{
				version: '1.2.3',
				totalSessions: 2,
				crashCount: 1,
				crashFreeRate: 0.5,
			},
			{
				version: '1.2.4',
				totalSessions: 1,
				crashCount: 1,
				crashFreeRate: 0,
			},
		]);
	});

	it('maps the explicit crash-free severity bands and picks the worst band', () => {
		const rows = computeReleaseHealth([
			record({ version: 'critical', sessionId: 'c1', crashed: true }),
			record({ version: 'critical', sessionId: 'c2' }),
			record({ version: 'high', sessionId: 'h1', crashed: true }),
			...Array.from({ length: 198 }, (_, index) =>
				record({ version: 'high', sessionId: `h-${index + 2}` }),
			),
			record({ version: 'medium', sessionId: 'm1', crashed: true }),
			...Array.from({ length: 998 }, (_, index) =>
				record({ version: 'medium', sessionId: `m-${index + 2}` }),
			),
			record({ version: 'low', sessionId: 'l1', crashed: true }),
			...Array.from({ length: 1998 }, (_, index) =>
				record({ version: 'low', sessionId: `l-${index + 2}` }),
			),
			record({ version: 'info', sessionId: 'i1' }),
			...Array.from({ length: 1999 }, (_, index) =>
				record({ version: 'info', sessionId: `i-${index + 2}` }),
			),
		]);
		expect(
			severityForReleaseHealth(
				rows.find((row) => row.version === 'critical')!,
			),
		).toBe('critical');
		expect(
			severityForReleaseHealth(
				rows.find((row) => row.version === 'high')!,
			),
		).toBe('high');
		expect(
			severityForReleaseHealth(
				rows.find((row) => row.version === 'medium')!,
			),
		).toBe('medium');
		expect(
			severityForReleaseHealth(
				rows.find((row) => row.version === 'low')!,
			),
		).toBe('low');
		expect(
			severityForReleaseHealth(
				rows.find((row) => row.version === 'info')!,
			),
		).toBe('info');
		expect(summarizeReleaseHealth(rows)).toEqual({
			summary: { critical: 1, high: 1, medium: 1, low: 1, info: 1 },
			worst: 'critical',
		});
	});
});
