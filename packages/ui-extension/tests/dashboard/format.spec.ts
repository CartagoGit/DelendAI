import { describe, expect, it } from 'vitest';

import {
	escapeHtml,
	formatBytes,
	formatMs,
	formatNumber,
	formatPercent,
	formatRelativeTime,
	formatTokens,
} from '../../src/dashboard/format';

describe('formatNumber', () => {
	it('formats with the default locale', () => {
		expect(formatNumber(1234)).toBe('1,234');
	});

	it('honours a custom locale when it differs from default', () => {
		// de-DE uses dot as thousands separator
		expect(formatNumber(1234, 'de')).toMatch(/1\.234/);
	});
});

describe('formatBytes', () => {
	it('formats B', () => {
		expect(formatBytes(512)).toBe('512 B');
	});
	it('formats KB', () => {
		expect(formatBytes(2048)).toBe('2.0 KB');
	});
	it('formats MB', () => {
		expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
	});
	it('formats GB', () => {
		expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
	});
});

describe('formatMs', () => {
	it('formats microseconds for very small values', () => {
		expect(formatMs(0.5)).toMatch(/µs/);
	});
	it('formats milliseconds', () => {
		expect(formatMs(250)).toBe('250 ms');
	});
	it('formats seconds', () => {
		expect(formatMs(2500)).toBe('2.50 s');
	});
	it('formats minutes', () => {
		expect(formatMs(120_000)).toBe('2.0 min');
	});
	it('formats hours', () => {
		expect(formatMs(3_600_000)).toBe('1.0 h');
	});
});

describe('formatTokens', () => {
	it('formats plain numbers below 1k', () => {
		expect(formatTokens(500)).toBe('500');
	});
	it('formats k for thousands', () => {
		expect(formatTokens(2500)).toBe('2.5k');
	});
	it('formats M for millions', () => {
		expect(formatTokens(2_500_000)).toBe('2.50M');
	});
});

describe('formatPercent', () => {
	it('returns 0% when total is 0', () => {
		expect(formatPercent(5, 0)).toBe('0%');
	});
	it('returns a localised percent', () => {
		expect(formatPercent(1, 4)).toBe('25%');
		expect(formatPercent(3, 4)).toBe('75%');
	});
});

describe('escapeHtml', () => {
	it('escapes <, >, &, " and \'', () => {
		expect(escapeHtml('<a href="x">&\'</a>')).toBe(
			'&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
		);
	});
});

describe('formatRelativeTime', () => {
	it('returns the original ISO when invalid', () => {
		expect(formatRelativeTime('not-a-date')).toBe('not-a-date');
	});
	it('renders seconds/minutes/hours/days', () => {
		const now = Date.now();
		expect(formatRelativeTime(new Date(now - 5_000).toISOString())).toMatch(
			/s ago/,
		);
		expect(
			formatRelativeTime(new Date(now - 5 * 60_000).toISOString()),
		).toMatch(/m ago/);
		expect(
			formatRelativeTime(new Date(now - 5 * 3_600_000).toISOString()),
		).toMatch(/h ago/);
		expect(
			formatRelativeTime(new Date(now - 5 * 86_400_000).toISOString()),
		).toMatch(/d ago/);
	});
});
