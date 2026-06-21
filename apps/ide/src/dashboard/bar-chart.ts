/**
 * `barChart` — tiny SVG bar-chart renderer. Returns the full `<svg>`
 * element so it can be inlined into a dashboard panel. No external
 * chart library — keeps the bundle ≤ 1 KB of chart code.
 */

export interface IBarDatum {
	readonly label: string;
	readonly value: number;
}

export const barChart = (
	bars: readonly IBarDatum[],
	width: number,
	height: number,
	options: { readonly max?: number; readonly padding?: number } = {},
): string => {
	const max = options.max ?? Math.max(1, ...bars.map((b) => b.value));
	const padding = options.padding ?? 8;
	const innerW = width - padding * 2;
	const innerH = height - padding * 2;
	const slotW = bars.length === 0 ? 0 : innerW / bars.length;
	const barW = Math.max(2, slotW * 0.7);
	const labelH = 14;
	const chartH = innerH - labelH;

	const barsSvg = bars
		.map((b, ix) => {
			const h = (b.value / max) * chartH;
			const x = padding + ix * slotW + (slotW - barW) / 2;
			const y = padding + (chartH - h);
			const labelX = padding + ix * slotW + slotW / 2;
			const labelY = padding + innerH - 2;
			return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(
				1,
			)}" height="${h.toFixed(1)}" fill="var(--mv-brand-purple)" rx="2" /><text x="${labelX.toFixed(
				1,
			)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--mv-fg-muted)">${escapeXml(
				b.label,
			)}</text>`;
		})
		.join('');

	return `<svg class="mv-barchart" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bar chart">${barsSvg}</svg>`;
};

const escapeXml = (raw: string): string =>
	raw
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
