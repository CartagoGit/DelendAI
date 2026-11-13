/**
 * `progressRing` — pure SVG arc generator. Used by the Status
 * panel to render a circular progress indicator (e.g. "tokens
 * saved %" or "error rate %").
 *
 * Convention: the arc starts at 12 o'clock (top, north) and fills
 * clockwise. That matches the most familiar UX (Apple Health,
 * Google Fit, VS Code's install progress, etc.). The full-circle
 * closed path used for `ratio >= 1` is two half-circle arcs
 * stitched together so the renderer can stroke it as one stroke.
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
		// Two semicircles stitched together so the renderer can stroke
		// the whole circle in one pass. sweep=1 keeps the visual
		// direction consistent with the partial arcs below.
		return `M ${cx - radius} ${cy} A ${radius} ${radius} 0 1 1 ${cx + radius} ${cy} A ${radius} ${radius} 0 1 1 ${cx - radius} ${cy} Z`;
	}
	// Start at 12 o'clock = (cx, cy - radius). Fill clockwise.
	const startX = cx;
	const startY = cy - radius;
	// Sweep clockwise: angle grows from -π/2 (top) towards +3π/2
	// (full circle). End point is (cx + radius·cos(θ), cy + radius·sin(θ))
	// where θ = -π/2 + ratio·2π.
	const angle = -Math.PI / 2 + ratio * 2 * Math.PI;
	const endX = cx + radius * Math.cos(angle);
	const endY = cy + radius * Math.sin(angle);
	const largeArc = ratio > 0.5 ? 1 : 0;
	return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`;
};
