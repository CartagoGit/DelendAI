import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import { RECURRING_FAILURE_THRESHOLD } from '../../contracts/constants/recurring-tool-failures.constant';
import type { IDoctorFs } from '../../lib/doctor/types';
import type { IDoctorCommandCheckContext } from '../doctor';
import { checkRecurringToolFailures } from './recurring-tool-failures.check';

const ctxFor = (events: string): IDoctorCommandCheckContext =>
	fakePartial<IDoctorCommandCheckContext>({
		workspace: '/w',
		fs: fakePartial<IDoctorFs>({ readFile: async () => events }),
		now: () => new Date('2026-11-18T00:00:00Z'),
	});

const failed = (count: number, withFailure = true): string =>
	Array.from({ length: count }, () =>
		JSON.stringify({
			ts: '2026-11-17T10:00:00Z',
			kind: 'tool.failed',
			toolName: 't',
			...(withFailure
				? { failure: { class: 'refused', code: 'gate invalid' } }
				: {}),
		}),
	).join('\n');

describe('checkRecurringToolFailures', () => {
	it('[<100ms] warns when a code reaches the threshold', async () => {
		const section = await checkRecurringToolFailures(
			ctxFor(failed(RECURRING_FAILURE_THRESHOLD)),
		);
		expect(section.status).toBe('warn');
		expect(section.findings[0]).toContain('t failed 5 times');
		expect(section.findings[0]).toContain('gate invalid');
	});

	it('[<100ms] passes under the threshold', async () => {
		const section = await checkRecurringToolFailures(
			ctxFor(failed(RECURRING_FAILURE_THRESHOLD - 1)),
		);
		expect(section.status).toBe('ok');
	});

	it('[<100ms] ignores events written before failure codes existed', async () => {
		const section = await checkRecurringToolFailures(
			ctxFor(failed(9, false)),
		);
		expect(section.status).toBe('ok');
	});

	it('[<100ms] passes when there is no events file', async () => {
		const ctx = fakePartial<IDoctorCommandCheckContext>({
			workspace: '/w',
			fs: fakePartial<IDoctorFs>({ readFile: async () => undefined }),
			now: () => new Date('2026-11-18T00:00:00Z'),
		});
		expect((await checkRecurringToolFailures(ctx)).status).toBe('ok');
	});
});
