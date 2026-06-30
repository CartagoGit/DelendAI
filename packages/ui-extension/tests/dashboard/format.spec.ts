import { describe, expect, it } from 'vitest';

import {
	escapeHtml,
	formatBytes,
	formatDate,
	formatMs,
	formatNumber,
	formatPercent,
	formatRelativeTime,
	formatTime,
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

describe('formatDate', async () => {
	// 2026-06-25T14:30:00Z — pick a UTC instant whose calendar day is stable
	// across the runner's local zones used in CI (UTC).
	const iso = '2026-06-25T14:30:00.000Z';

	it('returns the original input when the date is invalid', async () => {
		expect(formatDate('not-a-date')).toBe('not-a-date');
	});

	it('formats a localized absolute date for en', async () => {
		// en-US: "Jun 25, 2026"
		expect(formatDate(iso, 'en')).toMatch(/Jun 25, 2026/);
	});

	it('formats a localized absolute date for es', async () => {
		// es: "25 jun 2026" (month abbreviation localized, lowercase)
		const out = formatDate(iso, 'es');
		expect(out).toContain('25');
		expect(out).toContain('2026');
		expect(out.toLowerCase()).toContain('jun');
	});

	it('differs between locales for the same instant', async () => {
		expect(formatDate(iso, 'en')).not.toBe(formatDate(iso, 'es'));
	});

	it('is deterministic — same input yields same output', async () => {
		expect(formatDate(iso, 'en')).toBe(formatDate(iso, 'en'));
	});
});

describe('formatTime', async () => {
	const iso = '2026-06-25T14:30:00.000Z';

	it('returns the original input when the date is invalid', async () => {
		expect(formatTime('not-a-date')).toBe('not-a-date');
	});

	it('renders hour and minute', async () => {
		// 2-digit hour:minute; exact value depends on the runner zone, so we
		// assert the shape (HH:MM, optionally with AM/PM) rather than a literal.
		expect(formatTime(iso, 'en')).toMatch(/\d{1,2}:\d{2}/);
	});

	it('is deterministic — same input yields same output', async () => {
		expect(formatTime(iso, 'en')).toBe(formatTime(iso, 'en'));
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
