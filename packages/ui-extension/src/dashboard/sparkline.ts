/**
 * `sparklinePath` — pure SVG path generator for inline sparklines.
 * Returns the `d` attribute (no outer `<svg>`) so the renderer can
 * compose it into a panel with the right stroke colour.
 *
 * Empty / single-value inputs collapse to a flat line at the midline
 * so the panel never renders nothing.
 */

export const sparklinePath = (
	values: readonly number[],
	width: number,
	height: number,
): string => {
	if (values.length === 0 || width <= 0 || height <= 0) return '';
	if (values.length === 1) {
		const y = height / 2;
		return `M 0 ${y} L ${width} ${y}`;
	}
	const finite = values.map((v) => (Number.isFinite(v) ? v : 0));
	const min = Math.min(...finite);
	const max = Math.max(...finite);
	const range = max - min;
	const step = width / (finite.length - 1);
	const yOf = (v: number): number => {
		if (range === 0) return height / 2;
		return height - ((v - min) / range) * height;
	};
	return finite
		.map((v, ix) => `${ix === 0 ? 'M' : 'L'} ${ix * step} ${yOf(v)}`)
		.join(' ');
};
