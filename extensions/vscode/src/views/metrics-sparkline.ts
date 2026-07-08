import type { IMetricsSnapshot } from '@mcp-vertex/client';

export interface ISparklinePoint {
	readonly label: string;
	readonly value: number;
}

export const metricsToPoints = (
	snapshot: IMetricsSnapshot,
): ISparklinePoint[] =>
	Object.entries(snapshot.tools)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([label, metric]) => ({
			label,
			value: metric.calls,
		}));

export const renderMetricsSparkline = (
	points: readonly ISparklinePoint[],
): string => {
	const width = 480;
	const height = 96;
	const max = Math.max(1, ...points.map((point) => point.value));
	const step = points.length <= 1 ? width : width / (points.length - 1);
	const coords = points.map((point, index) => {
		const x = Math.round(index * step);
		const y = Math.round(height - (point.value / max) * height);
		return `${x},${y}`;
	});
	const labels = points
		.map((point) => `${escapeXml(point.label)}:${point.value}`)
		.join(' ');
	return `<svg class="metrics__sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="${labels}"><polyline fill="none" stroke="currentColor" stroke-width="2" points="${coords.join(' ')}" /></svg>`;
};

export const renderMetricsHtml = (snapshot: IMetricsSnapshot): string => {
	const points = metricsToPoints(snapshot);
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>mcp-vertex Metrics</title>
</head>
<body>
	<h1>mcp-vertex Metrics</h1>
	${renderMetricsSparkline(points)}
	<p>${snapshot.totals.calls} calls, ${snapshot.totals.errors} errors</p>
</body>
</html>`;
};

/**
 * `renderMetricsBody` — same shape the full HTML emits, but as a
 * `<body>`-only fragment so the dev preview's lazy pages can
 * mount it inside their own `<main>` without parsing an `<html>`
 * inside an `<html>` (which the browser silently drops, leaving
 * the page visually empty).
 *
 * The body uses the `metrics` BEM block (defined in the dev
 * preview SCSS) for typography + spacing; the sparkline keeps
 * its inline viewBox so it scales without a separate stylesheet.
 */
export const renderMetricsBody = (snapshot: IMetricsSnapshot): string => {
	const points = metricsToPoints(snapshot);
	return `<section class="metrics">
	<h1>mcp-vertex Metrics</h1>
	${renderMetricsSparkline(points)}
	<p class="metrics__totals">${snapshot.totals.calls} calls, ${snapshot.totals.errors} errors</p>
</section>`;
};

const escapeXml = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
