/**
 * Locale-aware formatting helpers shared by every dashboard panel.
 * Pure functions; no host imports.
 */

export const formatNumber = (n: number, locale = 'en'): string =>
	new Intl.NumberFormat(locale).format(n);

export const formatBytes = (bytes: number, locale = 'en'): string => {
	if (bytes < 1024) return `${formatNumber(bytes, locale)} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const formatMs = (ms: number, locale = 'en'): string => {
	if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
	if (ms < 1000) return `${formatNumber(Math.round(ms), locale)} ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
	if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)} min`;
	return `${(ms / 3_600_000).toFixed(1)} h`;
};

export const formatTokens = (tokens: number, locale = 'en'): string => {
	if (tokens < 1000) return `${formatNumber(tokens, locale)}`;
	if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
	return `${(tokens / 1_000_000).toFixed(2)}M`;
};

export const formatPercent = (
	value: number,
	total: number,
	locale = 'en',
): string => {
	if (total === 0) return '0%';
	return `${new Intl.NumberFormat(locale, {
		style: 'percent',
		maximumFractionDigits: 1,
	}).format(value / total)}`;
};

export const escapeHtml = (raw: string): string =>
	raw
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

export const formatRelativeTime = (iso: string, locale = 'en'): string => {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return iso;
	// `Intl.RelativeTimeFormat` ships in every runtime (Bun, Node 18+,
	// every browser) and renders the same diff in 100+ locales with the
	// correct unit grammar — `numeric: 'auto'` produces "yesterday" /
	// "hace 2 minutos" instead of "1 day ago" / "hace 2 días" when the
	// value is exactly ±1. f00059 S5.
	const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
	const diffMs = then - Date.now();
	const seconds = Math.round(diffMs / 1000);
	if (Math.abs(seconds) < 60) return rtf.format(seconds, 'second');
	const minutes = Math.round(seconds / 60);
	if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
	const hours = Math.round(minutes / 60);
	if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
	const days = Math.round(hours / 24);
	return rtf.format(days, 'day');
};
