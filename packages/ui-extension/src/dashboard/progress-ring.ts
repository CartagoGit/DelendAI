/**
 * `progressRing` — pure SVG arc generator. Used by the Status
 * panel to render a half-circle or full-circle progress indicator
 * (e.g. "calls per minute vs budget").
 *
 * Returns the `d` attribute of a single arc path; the renderer
 * composes it inside the surrounding `<svg>` with the right stroke.
 */
export const progressRing = (
	value: number,
	max: number,
	width: number,
): string => {
	const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
	const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
	const ratio = Math.min(1, safeValue / safeMax);
	const cx = width / 2;
	const cy = width / 2;
	const radius = width / 2 - 4;
	if (ratio === 0) return '';
	if (ratio >= 1) {
		return `M ${cx - radius} ${cy} A ${radius} ${radius} 0 1 1 ${cx + radius} ${cy} A ${radius} ${radius} 0 1 1 ${cx - radius} ${cy}`;
	}
	const startX = cx + radius;
	const startY = cy;
	const angle = ratio * 2 * Math.PI;
	const endX = cx + radius * Math.cos(angle - Math.PI / 2);
	const endY = cy + radius * Math.sin(angle - Math.PI / 2);
	const largeArc = ratio > 0.5 ? 1 : 0;
	return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`;
};
