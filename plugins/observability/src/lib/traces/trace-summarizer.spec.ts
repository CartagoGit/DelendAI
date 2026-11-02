import { describe, expect, it } from 'vitest';

import {
	groupRecordsByTrace,
	severityForTraceSummary,
	summarizeTraceGroups,
} from './trace-summarizer';
import type { IReadonlyTraceRecord } from './interfaces';

const records = (
	overrides: Partial<IReadonlyTraceRecord> = {},
): IReadonlyTraceRecord => ({
	service: 'api',
	traceId: 'trace-1',
	ts: '2026-07-25T10:15:00Z',
	isError: false,
	...overrides,
});

describe('groupRecordsByTrace', () => {
	it('returns an empty list for empty input', () => {
		expect(groupRecordsByTrace([])).toEqual([]);
		expect(summarizeTraceGroups([])).toEqual({
			summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
			worst: null,
		});
	});

	it('groups by service, trace id, and UTC hour bucket', () => {
		const out = groupRecordsByTrace([
			records(),
			records({
				ts: '2026-07-25T10:45:00Z',
				isError: true,
				errorMessage: 'timeout',
			}),
			records({ traceId: 'trace-2', ts: '2026-07-25T11:00:00Z' }),
		]);
		expect(out).toEqual([
			{
				service: 'api',
				traceId: 'trace-1',
				hourBucket: '2026-07-25T10:00:00Z',
				count: 2,
				errorRate: 0.5,
				topError: 'timeout',
			},
			{
				service: 'api',
				traceId: 'trace-2',
				hourBucket: '2026-07-25T11:00:00Z',
				count: 1,
				errorRate: 0,
				topError: null,
			},
		]);
	});

	it('computes severity bands and worst-case summary', () => {
		const groups = groupRecordsByTrace([
			records({
				traceId: 'critical',
				isError: true,
				errorMessage: 'boom',
			}),
			records({
				traceId: 'critical',
				ts: '2026-07-25T10:20:00Z',
				isError: true,
				errorMessage: 'boom',
			}),
			records({
				traceId: 'critical',
				ts: '2026-07-25T10:30:00Z',
				isError: true,
				errorMessage: 'boom',
			}),
			records({
				traceId: 'high',
				ts: '2026-07-25T11:00:00Z',
				isError: true,
				errorMessage: 'timeout',
			}),
			records({ traceId: 'high', ts: '2026-07-25T11:05:00Z' }),
			records({
				traceId: 'medium',
				ts: '2026-07-25T12:00:00Z',
				isError: true,
				errorMessage: 'warn',
			}),
			records({ traceId: 'medium', ts: '2026-07-25T12:05:00Z' }),
			records({ traceId: 'medium', ts: '2026-07-25T12:10:00Z' }),
			records({
				traceId: 'low',
				ts: '2026-07-25T13:00:00Z',
				isError: true,
				errorMessage: 'once',
			}),
			records({ traceId: 'low', ts: '2026-07-25T13:05:00Z' }),
			records({ traceId: 'low', ts: '2026-07-25T13:10:00Z' }),
			records({ traceId: 'low', ts: '2026-07-25T13:15:00Z' }),
			records({ traceId: 'low', ts: '2026-07-25T13:20:00Z' }),
			records({ traceId: 'low', ts: '2026-07-25T13:25:00Z' }),
			records({ traceId: 'info', ts: '2026-07-25T14:00:00Z' }),
		]);
		expect(
			severityForTraceSummary(
				groups.find((group) => group.traceId === 'critical')!,
			),
		).toBe('critical');
		expect(
			severityForTraceSummary(
				groups.find((group) => group.traceId === 'high')!,
			),
		).toBe('high');
		expect(
			severityForTraceSummary(
				groups.find((group) => group.traceId === 'medium')!,
			),
		).toBe('medium');
		expect(
			severityForTraceSummary(
				groups.find((group) => group.traceId === 'low')!,
			),
		).toBe('low');
		expect(
			severityForTraceSummary(
				groups.find((group) => group.traceId === 'info')!,
			),
		).toBe('info');

		expect(summarizeTraceGroups(groups)).toEqual({
			summary: { critical: 1, high: 1, medium: 1, low: 1, info: 1 },
			worst: 'critical',
		});
	});
});
