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
	const width = 240;
	const height = 48;
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
	return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${labels}"><polyline fill="none" stroke="currentColor" stroke-width="2" points="${coords.join(' ')}" /></svg>`;
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

const escapeXml = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
