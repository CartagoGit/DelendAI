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

describe('formatNumber', async () => {
	it('formats with the default locale', async () => {
		expect(formatNumber(1234)).toBe('1,234');
	});

	it('honours a custom locale when it differs from default', async () => {
		// de-DE uses dot as thousands separator
		expect(formatNumber(1234, 'de')).toMatch(/1\.234/);
	});
});

describe('formatBytes', async () => {
	it('formats B', async () => {
		expect(formatBytes(512)).toBe('512 B');
	});
	it('formats KB', async () => {
		expect(formatBytes(2048)).toBe('2.0 KB');
	});
	it('formats MB', async () => {
		expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
	});
	it('formats GB', async () => {
		expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
	});
});

describe('formatMs', async () => {
	it('formats microseconds for very small values', async () => {
		expect(formatMs(0.5)).toMatch(/µs/);
	});
	it('formats milliseconds', async () => {
		expect(formatMs(250)).toBe('250 ms');
	});
	it('formats seconds', async () => {
		expect(formatMs(2500)).toBe('2.50 s');
	});
	it('formats minutes', async () => {
		expect(formatMs(120_000)).toBe('2.0 min');
	});
	it('formats hours', async () => {
		expect(formatMs(3_600_000)).toBe('1.0 h');
	});
});

describe('formatTokens', async () => {
	it('formats plain numbers below 1k', async () => {
		expect(formatTokens(500)).toBe('500');
	});
	it('formats k for thousands', async () => {
		expect(formatTokens(2500)).toBe('2.5k');
	});
	it('formats M for millions', async () => {
		expect(formatTokens(2_500_000)).toBe('2.50M');
	});
});

describe('formatPercent', async () => {
	it('returns 0% when total is 0', async () => {
		expect(formatPercent(5, 0)).toBe('0%');
	});
	it('returns a localised percent', async () => {
		expect(formatPercent(1, 4)).toBe('25%');
		expect(formatPercent(3, 4)).toBe('75%');
	});
});

describe('escapeHtml', async () => {
	it('escapes <, >, &, " and \'', async () => {
		expect(escapeHtml('<a href="x">&\'</a>')).toBe(
			'&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
		);
	});
});

describe('formatRelativeTime', async () => {
	it('returns the original ISO when invalid', async () => {
		expect(formatRelativeTime('not-a-date')).toBe('not-a-date');
	});
	it('renders seconds/minutes/hours/days in the requested locale', async () => {
		const now = Date.now();
		// en-US: "5 seconds ago", "5 minutes ago", "5 hours ago", "5 days ago"
		expect(
			formatRelativeTime(new Date(now - 5_000).toISOString(), 'en'),
		).toMatch(/5 seconds? ago/);
		expect(
			formatRelativeTime(new Date(now - 5 * 60_000).toISOString(), 'en'),
		).toMatch(/5 minutes? ago/);
		expect(
			formatRelativeTime(new Date(now - 5 * 3_600_000).toISOString(), 'en'),
		).toMatch(/5 hours? ago/);
		expect(
			formatRelativeTime(new Date(now - 5 * 86_400_000).toISOString(), 'en'),
		).toMatch(/5 days? ago/);
	});
	it('renders localized relative time for es', async () => {
		const now = Date.now();
		// es: "hace 5 segundos" / "hace 5 minutos" / "hace 5 horas" / "hace 5 días"
		expect(
			formatRelativeTime(new Date(now - 5_000).toISOString(), 'es'),
		).toMatch(/hace 5 segundos/);
		expect(
			formatRelativeTime(new Date(now - 5 * 60_000).toISOString(), 'es'),
		).toMatch(/hace 5 minutos/);
		expect(
			formatRelativeTime(new Date(now - 5 * 3_600_000).toISOString(), 'es'),
		).toMatch(/hace 5 horas/);
		expect(
			formatRelativeTime(new Date(now - 5 * 86_400_000).toISOString(), 'es'),
		).toMatch(/hace 5 días/);
	});
	it('uses "yesterday" / "ayer" for ±1 day with numeric: auto', async () => {
		const now = Date.now();
		// 1 day ago → "yesterday" (en) / "ayer" (es)
		expect(
			formatRelativeTime(new Date(now - 86_400_000).toISOString(), 'en'),
		).toBe('yesterday');
		expect(
			formatRelativeTime(new Date(now - 86_400_000).toISOString(), 'es'),
		).toBe('ayer');
	});
});
