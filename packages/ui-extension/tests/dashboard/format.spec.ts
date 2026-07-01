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

/**
 * r00005 S3 — cross-runtime snapshot.
 *
 * The proposal's intent is: for the same (date, now, locale) input, the output
 * must be byte-identical across runtimes (Node 18+, Bun 1.x) — both embed ICU,
 * so any divergence is a regression the build must catch. We encode that as an
 * exact-string snapshot pinned to a fixed instant: `formatDate` is naturally
 * deterministic for a midday-UTC instant (June 25 14:30Z stays "June 25" in
 * every real time zone), and `formatRelativeTime` is driven from a `now`-relative
 * input so the diff is exactly 2 minutes without depending on a timer shim (kept
 * runtime-agnostic so the same spec is byte-identical under Vitest/Node and raw
 * `bun test`). Whichever runtime executes the suite, these literals must match;
 * ICU drift between runtimes fails the build. 12 locales each.
 */
describe('cross-runtime Intl snapshot (r00005 S3)', () => {
	// Midday-UTC instant: its calendar day ("June 25, 2026") is stable for any
	// UTC offset in (-14:30, +09:30), i.e. every real time zone.
	const iso = '2026-06-25T14:30:00.000Z';

	const DATE_SNAPSHOT: Record<string, string> = {
		en: 'Jun 25, 2026',
		es: '25 jun 2026',
		de: '25. Juni 2026',
		fr: '25 juin 2026',
		ja: '2026年6月25日',
		zh: '2026年6月25日',
		ar: '25 يونيو 2026',
		pt: '25 de jun. de 2026',
		ru: '25 июн. 2026 г.',
		it: '25 giu 2026',
		ko: '2026년 6월 25일',
		hi: '25 जून 2026',
	};

	const REL_SNAPSHOT: Record<string, string> = {
		en: '2 minutes ago',
		es: 'hace 2 minutos',
		de: 'vor 2 Minuten',
		fr: 'il y a 2 minutes',
		ja: '2 分前',
		zh: '2分钟前',
		ar: 'قبل دقيقتين',
		pt: 'há 2 minutos',
		ru: '2 минуты назад',
		it: '2 minuti fa',
		ko: '2분 전',
		hi: '2 मिनट पहले',
	};

	it('formatDate is byte-identical across runtimes for 12 locales', () => {
		for (const [locale, expected] of Object.entries(DATE_SNAPSHOT)) {
			expect(formatDate(iso, locale)).toBe(expected);
		}
	});

	it('formatRelativeTime is byte-identical across runtimes for 12 locales', () => {
		// Drive from `now` so the diff is exactly 2 minutes without a timer shim;
		// the rounding boundaries make this stable across the sub-ms call gap.
		const past = new Date(Date.now() - 2 * 60_000).toISOString();
		for (const [locale, expected] of Object.entries(REL_SNAPSHOT)) {
			expect(formatRelativeTime(past, locale)).toBe(expected);
		}
	});
});
